// Codex app-server クライアント（デスクトップ版）。
// `codex exec` は送信のたびにプロセス起動＋会話全体の再送で遅く、文字も逐次届かない。
// app-server は常駐プロセスに JSON-RPC で話しかける方式で、
//   - 起動費は最初の1回だけ
//   - ブランチごとにスレッドを保ち、続きは新しい発言だけ送る（前の内容はキャッシュが効く）
//   - 文字が届き次第 item/agentMessage/delta で流れてくる
// 安全側の設定は exec と同じ: 読み取り専用サンドボックス、承認は常に拒否、履歴はディスクに残さない。
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

class CodexServer {
  constructor(codexPath, opts = {}) {
    this.codex = codexPath;
    this.cwd = opts.cwd || path.join(os.tmpdir(), 'branchat-codex');
    this.env = opts.env || process.env;
    this.proc = null; this.ready = null; this.nextId = 1; this.pending = new Map(); this.buf = '';
    this.threads = new Map();   // sessionKey -> { threadId, lastMessageId, model, web }
    this.turns = new Map();     // turnId -> handler
    this.threadTurn = new Map(); // threadId -> turnId
    this.log = opts.log || (() => {});
  }

  // ---- プロセスと JSON-RPC ----
  start() {
    if (this.ready) return this.ready;
    fs.mkdirSync(this.cwd, { recursive: true });
    const p = spawn(this.codex, ['app-server', '--stdio'], { cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = p;
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => { this.buf += d; let i; while ((i = this.buf.indexOf('\n')) >= 0) { const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (line) this.onLine(line); } });
    p.stderr.setEncoding('utf8'); p.stderr.on('data', (d) => this.log('codex-server stderr: ' + d.slice(0, 300)));
    p.on('exit', (code) => { this.log(`codex app-server exited (${code})`); this.proc = null; this.ready = null; this.threads.clear(); for (const [, h] of this.turns) h({ error: 'Codex が終了しました。もう一度送ってください' }, true); this.turns.clear(); for (const [, pr] of this.pending) pr.rej({ message: 'codex exited' }); this.pending.clear(); });
    p.stdin.on('error', () => {});
    this.ready = this.request('initialize', { clientInfo: { name: 'branchat', version: '0.3' } }).then((r) => { this.notify('initialized', {}); return r; });
    return this.ready;
  }
  request(method, params) { const id = this.nextId++; this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  notify(method, params) { this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
  respond(id, result) { this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
  onLine(line) {
    let m; try { m = JSON.parse(line); } catch (e) { return; }
    if (m.id !== undefined && !m.method) { const pr = this.pending.get(m.id); if (pr) { this.pending.delete(m.id); m.error ? pr.rej(m.error) : pr.res(m.result); } return; }
    if (m.id !== undefined && m.method) { // サーバーからの要求（承認など）は常に拒否する。会話用スレッドではそもそも起きない設定
      this.log('server request refused: ' + m.method);
      this.respond(m.id, { decision: 'decline' });
      return;
    }
    const pr = m.params || {};
    const turnId = pr.turnId || (pr.turn && pr.turn.id);
    const h = turnId && this.turns.get(turnId);
    switch (m.method) {
      case 'item/agentMessage/delta': if (h) h({ text: pr.delta || '' }); break;
      case 'item/completed': if (h && pr.item && pr.item.type === 'webSearch') h({ tool: { name: 'web_search', q: pr.item.query || '' } }); break;
      case 'thread/tokenUsage/updated': if (h && pr.tokenUsage && pr.tokenUsage.last) { const u = pr.tokenUsage.last; h({ usage: { input_tokens: Math.max(0, (u.inputTokens || 0) - (u.cachedInputTokens || 0)), cache_read_input_tokens: u.cachedInputTokens || 0, output_tokens: u.outputTokens || 0 } }); } break;
      case 'turn/completed': if (h) { const st = pr.turn && pr.turn.status; if (st === 'failed') h({ error: 'codex: ' + ((pr.turn.error && pr.turn.error.message) || '失敗しました') }); h({ done: true }, true); this.turns.delete(turnId); } break;
      case 'error': if (h && !pr.willRetry) h({ error: 'codex: ' + ((pr.error && pr.error.message) || 'エラー') }); break;
      default: break;
    }
  }

  // ---- 会話 ----
  /**
   * req: { sessionKey, parentId, messageId, model, effort, web, system, prompt, history, images }
   * 同じ sessionKey で、前回の返答(lastMessageId)の続き(parentId)なら新しい発言だけを送る。
   * それ以外は新しいスレッドを作り、これまでの会話を1本のテキストにして送る。
   */
  async chat(req, onEvent) {
    await this.start();
    const key = String(req.sessionKey || 'default');
    const model = String(req.model || 'gpt-5.5');
    const web = !!req.web;
    let s = this.threads.get(key);
    const continuing = s && s.threadId && s.lastMessageId && s.lastMessageId === req.parentId && s.model === model && s.web === web;
    const developer = String(req.system || '') + '\n\nあなたは会話アシスタントとして振る舞い、コマンド実行やファイル操作は行わず、文章だけで答えてください。';
    if (!continuing) {
      const r = await this.request('thread/start', {
        model, ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never', cwd: this.cwd,
        config: web ? { web_search: 'live' } : { web_search: 'disabled' },
        developerInstructions: developer,
      });
      s = { threadId: r.thread.id, lastMessageId: null, model, web };
      this.threads.set(key, s);
      if (this.threads.size > 40) { const first = this.threads.keys().next().value; this.threads.delete(first); }
    }
    // 続きのときは会話マップ（変わり続ける）だけを添えて新しい発言を送る。新規スレッドは履歴込みの全文を送る
    const text = continuing
      ? `【会話マップ（現在）】\n${String(req.system || '')}\n\n【ユーザーの新しい発言】\n${String(req.newMessage || req.prompt || '')}`
      : String(req.prompt || '');
    const input = [...(req.images || []).map((im) => ({ type: 'image', url: `data:${im.media_type || 'image/jpeg'};base64,${im.data}` })), { type: 'text', text }];
    const params = { threadId: s.threadId, input };
    if (req.effort) params.effort = req.effort;
    let turnId = null; let finished = false;
    const handler = (ev, isDone) => { if (finished) return; onEvent(ev); if (isDone) { finished = true; s.lastMessageId = req.messageId || null; } };
    try {
      const r = await this.request('turn/start', params);
      turnId = r.turn.id; this.turns.set(turnId, handler); this.threadTurn.set(s.threadId, turnId);
    } catch (e) { onEvent({ error: 'codex: ' + (e.message || JSON.stringify(e)) }); onEvent({ done: true }); return () => {}; }
    return () => { if (!finished && turnId) { this.request('turn/interrupt', { threadId: s.threadId, turnId }).catch(() => {}); } };
  }
  stop() { if (this.proc) { try { this.proc.kill(); } catch (e) { /* 既に終了 */ } } }
}

module.exports = { CodexServer };
