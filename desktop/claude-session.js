// Claude Code を常駐させる（デスクトップ版）。
// `claude -p --input-format stream-json` は1つのプロセスで複数ターンを受け付け、会話を保持する。
//   - 起動費（約0.3〜1秒）と会話全体の再送を、ブランチごとに最初の1回だけにする
//   - 続きのターンは「会話マップ＋新しい発言」だけを送る（2ターン目以降 約2秒）
// 安全側の設定は単発起動と同じ（ツール無し／Web検索とMCPは選んだ分だけ、履歴はディスクに残さない、設定・フックは読まない）。
'use strict';
const { spawn } = require('node:child_process');
const os = require('node:os');

const MAX_SESSIONS = 4;          // 同時に常駐させる上限（1つ数十MB〜）
const IDLE_MS = 10 * 60 * 1000;  // 使われないセッションはこの時間で終了

class ClaudeSessions {
  constructor(claudePath, env, log) { this.claude = claudePath; this.env = env; this.log = log || (() => {}); this.sessions = new Map(); }

  // セッションの同一性: ブランチ + プロセス起動時に固定される条件（モデル、思考量、Web検索、MCP）
  identity(req, mcpCfg) { return JSON.stringify([req.model, req.effort || '', !!req.web, mcpCfg || {}]); }

  spawnProcess(req, mcpCfg, systemText) {
    const model = String(req.model || 'claude-opus-5');
    const args = ['-p', '--model', model, '--system-prompt', systemText, '--tools', ...(req.web ? ['WebSearch', 'WebFetch'] : [''])];
    const allowed = req.web ? ['WebSearch', 'WebFetch'] : [];
    if (mcpCfg && Object.keys(mcpCfg).length) { args.push('--mcp-config', JSON.stringify({ mcpServers: mcpCfg })); allowed.push(...Object.keys(mcpCfg).map((k) => 'mcp__' + k)); }
    if (allowed.length) args.push('--allowedTools', ...allowed);
    if (req.effort && req.effort !== 'ultra' && !/haiku/.test(model)) args.push('--effort', req.effort);
    args.push('--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--input-format', 'stream-json', '--output-format', 'stream-json', '--include-partial-messages', '--verbose');
    const child = spawn(this.claude, args, { cwd: os.tmpdir(), env: this.env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    return child;
  }

  /** 1ターン実行。戻り値は中断関数。 */
  chat(req, onEvent, mcpCfg) {
    const key = String(req.sessionKey || 'default');
    const ident = this.identity(req, mcpCfg);
    let s = this.sessions.get(key);
    const continuing = s && s.child && !s.child.killed && s.ident === ident && s.lastMessageId && s.lastMessageId === req.parentId && !s.busy;
    if (!continuing) {
      if (s) this.close(key);
      // 固定の指示（役割・ルール）はプロセス起動時に、変わり続ける会話マップは毎ターン発言に添える
      const child = this.spawnProcess(req, mcpCfg, String(req.systemStatic || req.system || ''));
      s = { child, ident, lastMessageId: null, busy: false, at: Date.now(), buf: '', errBuf: '', handler: null };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => { s.buf += d; let i; while ((i = s.buf.indexOf('\n')) >= 0) { const line = s.buf.slice(0, i).trim(); s.buf = s.buf.slice(i + 1); if (line && s.handler) s.handler(line); } });
      child.stderr.setEncoding('utf8'); child.stderr.on('data', (d) => { s.errBuf = (s.errBuf + d).slice(-2000); });
      child.on('close', (code) => { if (s.handler) s.handler(null, code); if (this.sessions.get(key) === s) this.sessions.delete(key); });
      this.sessions.set(key, s);
      this.evict();
    }
    s.busy = true; s.at = Date.now();
    // 続きなら会話マップ＋新しい発言だけ。新規なら履歴込みの全文（prompt）
    const text = continuing
      ? `【会話マップ（現在）】\n${String(req.system || '')}\n\n【ユーザーの新しい発言】\n${String(req.newMessage || req.prompt || '')}\n\n上の発言に対して、AIとして返答だけを書いてください。`
      : String(req.prompt || '');
    const content = (req.images && req.images.length)
      ? [...req.images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data } })), { type: 'text', text }]
      : text;
    let finished = false;
    const finish = () => { if (finished) return; finished = true; s.busy = false; s.handler = null; s.lastMessageId = req.messageId || null; onEvent({ done: true }); };
    s.handler = (line, exitCode) => {
      if (line === null) { if (!finished) { onEvent({ error: `claude 終了コード ${exitCode}: ${s.errBuf.trim().slice(-400)}` }); finish(); } return; }
      let ev; try { ev = JSON.parse(line); } catch (e) { return; }
      const t = ev.type;
      if (t === 'stream_event') {
        const e = ev.event || {};
        if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta') onEvent({ text: e.delta.text || '' });
        else if (e.type === 'message_delta') onEvent({ usage: e.usage });
      } else if (t === 'system' && ev.subtype === 'init' && mcpCfg && Object.keys(mcpCfg).length) {
        onEvent({ mcp_status: (ev.mcp_servers || []).map((m) => ({ name: m.name, status: m.status })) });
      } else if (t === 'assistant') {
        for (const c of ((ev.message || {}).content || [])) {
          if (c.type !== 'tool_use') continue; const inp = c.input || {};
          if (c.name === 'WebSearch' || c.name === 'WebFetch') onEvent({ tool: { name: c.name === 'WebSearch' ? 'web_search' : 'web_fetch', q: inp.query || inp.url || '' } });
          else if (String(c.name).startsWith('mcp__')) { const parts = String(c.name).split('__'); const q = Object.values(inp).find((v) => ['string', 'number'].includes(typeof v) && String(v).trim()); onEvent({ tool: { name: 'mcp', server: parts[1] || '', tool: parts.slice(2).join('__') || c.name, q: q ? String(q).slice(0, 80) : '' } }); }
        }
      } else if (t === 'rate_limit_event') onEvent({ rate_limit: ev.rate_limit_info });
      else if (t === 'result') { if (ev.is_error) onEvent({ error: String(ev.result || 'claude がエラーを返しました').slice(0, 800) }); finish(); }
    };
    try { s.child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n'); }
    catch (e) { onEvent({ error: 'claude 送信失敗: ' + e.message }); finish(); this.close(key); }
    // 中断＝このセッションを終了（次の送信で作り直す）
    return () => { if (!finished) { finished = true; s.busy = false; s.handler = null; onEvent({ done: true }); this.close(key); } };
  }

  close(key) { const s = this.sessions.get(key); if (!s) return; this.sessions.delete(key); try { s.child.stdin.end(); s.child.kill(); } catch (e) { /* 既に終了 */ } }
  evict() {
    const now = Date.now();
    for (const [k, s] of this.sessions) if (!s.busy && now - s.at > IDLE_MS) this.close(k);
    while (this.sessions.size > MAX_SESSIONS) { const idle = [...this.sessions.entries()].filter(([, s]) => !s.busy).sort((a, b) => a[1].at - b[1].at)[0]; if (!idle) break; this.close(idle[0]); }
  }
  shutdown() { for (const k of [...this.sessions.keys()]) this.close(k); }
}

module.exports = { ClaudeSessions };
