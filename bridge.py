#!/usr/bin/env python3
"""BranCHAT ローカルブリッジ。

静的ファイル(index.html)を配信しつつ、POST /api/chat を受けて
ログイン済みの `claude` CLI(ヘッドレス -p モード)を起動し、SSEで返す。
Claude Pro/Max の定額枠で動く(APIキー不要)。

使い方:  python3 bridge.py [port]   (既定 8991)
"""
import json, os, shutil, subprocess, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8991
CLAUDE = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")


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
            body = json.dumps({"ok": claude_ok(), "claude": CLAUDE}).encode()
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
        cmd = [CLAUDE, "-p", "--model", model, "--system-prompt", system,
               "--tools", "", "--no-session-persistence", "--strict-mcp-config",
               "--output-format", "stream-json", "--include-partial-messages", "--verbose"]
        if effort:
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
            send({"error": f"claude 起動失敗: {e}"}); return
        threading.Thread(target=lambda: (p.stdin.write(prompt), p.stdin.close()), daemon=True).start()
        try:
            for line in p.stdout:
                line = line.strip()
                if not line: continue
                try: ev = json.loads(line)
                except Exception: continue
                t = ev.get("type")
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
                send({"error": f"claude 終了コード {p.returncode}: {err}"})
        except (BrokenPipeError, ConnectionResetError):
            p.kill()
        finally:
            try: send({"done": True})
            except Exception: pass


if __name__ == "__main__":
    print(f"BranCHAT bridge: http://localhost:{PORT}/  (claude: {CLAUDE}, ok={claude_ok()})")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
