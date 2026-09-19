#!/usr/bin/env python3
"""BranCHAT ローカルブリッジ。

静的ファイル(index.html)を配信しつつ、POST /api/chat を受けて
ログイン済みの CLI をヘッドレスで起動し、SSEで返す(APIキー不要)。
  engine=claude : `claude -p`   … Claude Pro/Max の定額枠
  engine=codex  : `codex exec`  … ChatGPT プランの定額枠
どちらもツールを使わせない素の会話モデルとして呼ぶ。

使い方:  python3 bridge.py [port]   (既定 8991)
"""
import json, os, shutil, subprocess, sys, tempfile, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8991
CLAUDE = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
CODEX = next((c for c in [shutil.which("codex"),
                          "/Applications/ChatGPT.app/Contents/Resources/codex",
                          "/Applications/Codex.app/Contents/Resources/codex",
                          os.path.expanduser("~/.local/bin/codex")] if c and os.path.exists(c)), None)
CODEX_HOME = os.environ.get("CODEX_HOME") or os.path.expanduser("~/.codex")
CODEX_CWD = os.path.join(tempfile.gettempdir(), "branchat-codex")  # 空の作業フォルダ(読み取り専用サンドボックスで使用)
EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"]


def codex_ok():
    return bool(CODEX) and os.path.exists(os.path.join(CODEX_HOME, "auth.json"))


def _run(cmd, args):
    try:
        r = subprocess.run([cmd] + args, capture_output=True, text=True, timeout=8)
        return (r.stdout or "") + (r.stderr or "")
    except Exception:
        return ""


def auth_state():
    """各CLIの公式コマンドでログイン状態を確かめる(メールアドレス等は画面へ渡さない)。engines.js と同じ形。"""
    st = {"claude": {"installed": claude_ok(), "loggedIn": False, "plan": None},
          "codex": {"installed": bool(CODEX), "loggedIn": False, "method": None}}
    if claude_ok():
        try:
            j = json.loads(_run(CLAUDE, ["auth", "status"]))
            st["claude"]["loggedIn"] = bool(j.get("loggedIn")); st["claude"]["plan"] = j.get("subscriptionType")
        except Exception:
            pass
    if CODEX:
        t = _run(CODEX, ["login", "status"]).lower()
        st["codex"]["loggedIn"] = ("logged in" in t) and ("not logged in" not in t)
    return st


def codex_models():
    """Codex が手元にキャッシュしているモデル一覧(名前と思考量の段階)。中身は読むが認証情報には触れない。"""
    out = []
    try:
        d = json.load(open(os.path.join(CODEX_HOME, "models_cache.json"), encoding="utf-8"))
        for m in (d.get("models") if isinstance(d, dict) else d) or []:
            slug = m.get("slug") or m.get("id")
            if not slug or "review" in slug:
                continue
            ef = [(e.get("effort") if isinstance(e, dict) else e) for e in (m.get("supported_reasoning_levels") or [])]
            out.append({"id": slug, "name": m.get("display_name") or slug,
                        "efforts": [e for e in EFFORTS if e in ef], "default_effort": m.get("default_reasoning_level")})
    except Exception:
        pass
    return out or [{"id": "gpt-5.5", "name": "GPT-5.5", "efforts": ["low", "medium", "high", "xhigh"], "default_effort": "medium"}]


def claude_ok():
    return os.path.exists(CLAUDE)


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=HERE, **k)

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            sys.stderr.write("[bridge] " + (fmt % args) + "\n")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/status"):
            a = auth_state()
            c_ok = a["claude"]["installed"] and a["claude"]["loggedIn"]
            x_ok = a["codex"]["installed"] and a["codex"]["loggedIn"]
            body = json.dumps({"ok": c_ok, "claude": CLAUDE, "codex_ok": x_ok, "codex": CODEX,
                               "codex_models": codex_models() if x_ok else [], "auth": a,
                               "desktop": False, "platform": sys.platform}, ensure_ascii=False).encode()
            self.send_response(200); self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api/chat"):
            self.send_response(404); self.end_headers(); return
        n = int(self.headers.get("Content-Length", "0"))
        req = json.loads(self.rfile.read(n) or b"{}")
        system = req.get("system", "")
        prompt = req.get("prompt", "")
        model = req.get("model", "claude-opus-5")
        effort = req.get("effort")
        engine = req.get("engine", "claude")
        if effort not in EFFORTS:
            effort = None
        if engine == "codex":
            os.makedirs(CODEX_CWD, exist_ok=True)
            # 読み取り専用・履歴を残さない・利用者の設定(MCPやフック)を読み込まない素の会話として実行
            cmd = [CODEX or "codex", "exec", "--json", "--ephemeral", "--skip-git-repo-check",
                   "--ignore-user-config", "--ignore-rules", "-s", "read-only", "-C", CODEX_CWD, "-m", model]
            if effort:
                cmd += ["-c", f"model_reasoning_effort={effort}"]
            cmd += ["-"]
            # codex exec には system の差し替えが無いので、指示を先頭に付けて1本のプロンプトにする
            prompt = (system + "\n\nあなたは会話アシスタントとして振る舞い、コマンド実行やファイル操作は行わず、文章だけで答えてください。\n\n---\n\n" + prompt)
        else:
            cmd = [CLAUDE, "-p", "--model", model, "--system-prompt", system,
                   "--tools", "", "--no-session-persistence", "--strict-mcp-config",
                   "--output-format", "stream-json", "--include-partial-messages", "--verbose"]
            if effort and effort != "ultra":
                cmd += ["--effort", effort]
        self.send_response(200); self._cors()
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        def send(obj):
            self.wfile.write(("data: " + json.dumps(obj, ensure_ascii=False) + "\n\n").encode())
            self.wfile.flush()

        env = dict(os.environ)
        env.pop("CLAUDECODE", None)  # ネスト検出を回避
        try:
            p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, cwd=HERE, env=env, text=True)
        except Exception as e:
            send({"error": f"{engine} 起動失敗: {e}"}); return
        threading.Thread(target=lambda: (p.stdin.write(prompt), p.stdin.close()), daemon=True).start()
        try:
            first = True
            for line in p.stdout:
                line = line.strip()
                if not line: continue
                try: ev = json.loads(line)
                except Exception: continue
                t = ev.get("type")
                if engine == "codex":
                    # codex は1文字ずつではなく、発言のまとまり単位で届く
                    if t == "item.completed" and (ev.get("item") or {}).get("type") == "agent_message":
                        txt = (ev["item"].get("text") or "")
                        if txt:
                            send({"text": ("" if first else "\n\n") + txt}); first = False
                    elif t == "turn.completed":
                        u = ev.get("usage") or {}
                        cached = u.get("cached_input_tokens", 0) or 0
                        send({"usage": {"input_tokens": max(0, (u.get("input_tokens", 0) or 0) - cached),
                                        "cache_read_input_tokens": cached,
                                        "output_tokens": u.get("output_tokens", 0) or 0}})
                    elif t in ("error", "turn.failed"):
                        msg = ev.get("message") or (ev.get("error") or {}).get("message") or json.dumps(ev, ensure_ascii=False)[:500]
                        send({"error": f"codex: {msg}"})
                    continue
                if t == "stream_event":
                    e = ev.get("event", {})
                    if e.get("type") == "content_block_delta":
                        d = e.get("delta", {})
                        if d.get("type") == "text_delta":
                            send({"text": d.get("text", "")})
                    elif e.get("type") == "message_delta":
                        send({"usage": e.get("usage")})
                elif t == "result":
                    send({"done": True, "is_error": ev.get("is_error"),
                          "result": ev.get("result") if ev.get("is_error") else None,
                          "usage": ev.get("usage")})
                elif t == "rate_limit_event":
                    send({"rate_limit": ev.get("rate_limit_info")})
            p.wait()
            if p.returncode != 0:
                err = p.stderr.read()[-2000:]
                send({"error": f"{engine} 終了コード {p.returncode}: {err}"})
        except (BrokenPipeError, ConnectionResetError):
            p.kill()
        finally:
            try: send({"done": True})
            except Exception: pass


if __name__ == "__main__":
    print(f"BranCHAT bridge: http://localhost:{PORT}/  (claude: {CLAUDE}, ok={claude_ok()} / codex: {CODEX}, ok={codex_ok()})")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
