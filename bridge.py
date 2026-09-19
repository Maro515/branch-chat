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


def _run(cmd, args, timeout=8):
    try:
        r = subprocess.run([cmd] + args, capture_output=True, text=True, timeout=timeout)
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


_mcp_cache = {"at": 0, "list": []}


def mcp_servers(force=False):
    """Claude Code に登録済みの MCP サーバー一覧（`claude mcp list` の出力を読む。接続確認に約10秒かかるので60秒キャッシュ）。"""
    import time
    if not force and _mcp_cache["list"] and time.time() - _mcp_cache["at"] < 60:
        return _mcp_cache["list"]
    out = []
    if not claude_ok():
        return out
    for line in _run(CLAUDE, ["mcp", "list"], timeout=40).splitlines():
        line = line.strip()
        if ":" not in line or " - " not in line:
            continue
        name, rest = line.split(":", 1)
        target, _, status = rest.rpartition(" - ")
        target = target.strip(); status = status.strip()
        kind = "http" if target.startswith("http") else "stdio"
        out.append({"name": name.strip(), "target": target, "kind": kind,
                    "connected": "Connected" in status, "needsAuth": "auth" in status.lower(),
                    "slug": "".join(ch if ch.isalnum() else "_" for ch in name.strip())})
    _mcp_cache["at"] = time.time(); _mcp_cache["list"] = out
    return out


def mcp_config_for(names, servers):
    """選択したサーバーだけを --mcp-config に渡す定義にする。名前は英数字とアンダースコアに正規化。"""
    cfg = {}
    for sv in servers:
        if sv["name"] not in names:
            continue
        key = sv["slug"]
        if sv["kind"] == "http":
            cfg[key] = {"type": "http", "url": sv["target"]}
        else:
            parts = sv["target"].split(" ")
            cfg[key] = {"type": "stdio", "command": parts[0], "args": parts[1:]}
    return cfg


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
        if self.path.startswith("/api/mcp"):
            body = json.dumps({"servers": mcp_servers(force="force=1" in self.path)}, ensure_ascii=False).encode()
            self.send_response(200); self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return
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
        web = bool(req.get("web"))  # Web検索を許可するか（検索と取得だけ。ファイルやコマンドは使わせない）
        mcp = [n for n in (req.get("mcp") or []) if isinstance(n, str)][:8]  # 使う MCP サーバー名（Claude のみ）
        images = [im for im in (req.get("images") or []) if isinstance(im, dict) and im.get("data")][:4]
        tmp_imgs = []
        if effort not in EFFORTS:
            effort = None
        if engine == "codex":
            os.makedirs(CODEX_CWD, exist_ok=True)
            # 読み取り専用・履歴を残さない・利用者の設定(MCPやフック)を読み込まない素の会話として実行
            cmd = [CODEX or "codex"] + (["--search"] if web else []) + ["exec", "--json", "--ephemeral", "--skip-git-repo-check",
                   "--ignore-user-config", "--ignore-rules", "-s", "read-only", "-C", CODEX_CWD, "-m", model]
            if effort:
                cmd += ["-c", f"model_reasoning_effort={effort}"]
            for im in images:  # codex は -i <file> で画像を渡す
                import base64, tempfile as _tf
                fd, fp = _tf.mkstemp(prefix="branchat-img-", suffix=".jpg", dir=CODEX_CWD); os.close(fd)
                with open(fp, "wb") as f:
                    f.write(base64.b64decode(im["data"]))
                tmp_imgs.append(fp); cmd += ["-i", fp]
            cmd += ["-"]
            # codex exec には system の差し替えが無いので、指示を先頭に付けて1本のプロンプトにする
            prompt = (system + "\n\nあなたは会話アシスタントとして振る舞い、コマンド実行やファイル操作は行わず、文章だけで答えてください。\n\n---\n\n" + prompt)
        else:
            cmd = [CLAUDE, "-p", "--model", model, "--system-prompt", system, "--tools"]
            cmd += (["WebSearch", "WebFetch"] if web else [""])
            allowed = (["WebSearch", "WebFetch"] if web else [])
            mcp_cfg = mcp_config_for(mcp, mcp_servers()) if mcp else {}
            if mcp_cfg:
                cmd += ["--mcp-config", json.dumps({"mcpServers": mcp_cfg})]
                allowed += ["mcp__" + k for k in mcp_cfg]  # 選んだサーバーのツールだけ自動許可
            if allowed:
                cmd += ["--allowedTools"] + allowed
            cmd += ["--no-session-persistence", "--strict-mcp-config",
                    "--output-format", "stream-json", "--include-partial-messages", "--verbose"]
            if images:  # 画像は content blocks で渡す（--input-format stream-json）
                cmd += ["--input-format", "stream-json"]
                prompt = json.dumps({"type": "user", "message": {"role": "user", "content":
                    [{"type": "image", "source": {"type": "base64", "media_type": im.get("media_type", "image/jpeg"), "data": im["data"]}} for im in images]
                    + [{"type": "text", "text": prompt}]}}, ensure_ascii=False) + "\n"
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
                    if t == "item.completed" and (ev.get("item") or {}).get("type") == "web_search":
                        send({"tool": {"name": "web_search", "q": (ev["item"].get("query") or "")}})
                    elif t == "item.completed" and (ev.get("item") or {}).get("type") == "agent_message":
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
                elif t == "system" and ev.get("subtype") == "init" and mcp:
                    send({"mcp_status": [{"name": m.get("name"), "status": m.get("status")} for m in ev.get("mcp_servers") or []]})
                elif t == "assistant":
                    for c in (ev.get("message") or {}).get("content") or []:
                        if c.get("type") != "tool_use":
                            continue
                        inp = c.get("input") or {}
                        nm = c.get("name") or ""
                        if nm in ("WebSearch", "WebFetch"):
                            send({"tool": {"name": "web_search" if nm == "WebSearch" else "web_fetch", "q": inp.get("query") or inp.get("url") or ""}})
                        elif nm.startswith("mcp__"):
                            parts = nm.split("__", 2)
                            q = next((str(v) for v in inp.values() if isinstance(v, (str, int, float)) and str(v).strip()), "")
                            send({"tool": {"name": "mcp", "server": parts[1] if len(parts) > 1 else "", "tool": parts[2] if len(parts) > 2 else nm, "q": q[:80]}})
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
            for fp in tmp_imgs:
                try: os.remove(fp)
                except Exception: pass
            try: send({"done": True})
            except Exception: pass


if __name__ == "__main__":
    print(f"BranCHAT bridge: http://localhost:{PORT}/  (claude: {CLAUDE}, ok={claude_ok()} / codex: {CODEX}, ok={codex_ok()})")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
