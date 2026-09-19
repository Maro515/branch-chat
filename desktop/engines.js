// BranCHAT デスクトップ版のエンジン層。bridge.py と同じ役割を Node で担う。
//   engine=claude : `claude -p`   … Claude Pro/Max の定額枠
//   engine=codex  : `codex exec`  … ChatGPT プランの定額枠
// どちらもツールを使わせない素の会話モデルとして呼ぶ（安全側の設定は bridge.py と揃えること）。
'use strict';
const { spawn, execFile, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const HOME = os.homedir();
const IS_WIN = process.platform === 'win32';
const exe = (n) => (IS_WIN ? [n + '.exe', n + '.cmd', n] : [n]);

// GUIアプリは PATH が最小限なので、よくある場所とログインシェルの PATH を足す
function extendedPath() {
  const extra = IS_WIN
    ? [path.join(HOME, '.local', 'bin'), path.join(HOME, 'AppData', 'Roaming', 'npm')]
    : [path.join(HOME, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.npm-global', 'bin'), '/usr/bin', '/bin'];
  let shellPath = '';
  if (!IS_WIN) {
    try { shellPath = execFileSync(process.env.SHELL || '/bin/zsh', ['-lc', 'echo -n "$PATH"'], { encoding: 'utf8', timeout: 4000 }); } catch (e) { /* なくてよい */ }
  }
  return [...new Set([...(process.env.PATH || '').split(path.delimiter), ...shellPath.split(path.delimiter), ...extra].filter(Boolean))].join(path.delimiter);
}
const PATH_EXT = extendedPath();

function findOnPath(name) {
  for (const dir of PATH_EXT.split(path.delimiter)) {
    for (const n of exe(name)) { const p = path.join(dir, n); try { if (fs.statSync(p).isFile()) return p; } catch (e) { /* 次へ */ } }
  }
  return null;
}
function firstExisting(list) { return list.find((p) => { try { return p && fs.statSync(p).isFile(); } catch (e) { return false; } }) || null; }

const CLAUDE = findOnPath('claude');
const CODEX = findOnPath('codex') || firstExisting(IS_WIN
  ? [path.join(HOME, 'AppData', 'Local', 'Programs', 'ChatGPT', 'resources', 'codex.exe')]
  : ['/Applications/ChatGPT.app/Contents/Resources/codex', '/Applications/Codex.app/Contents/Resources/codex']);
const CODEX_HOME = process.env.CODEX_HOME || path.join(HOME, '.codex');
const CODEX_CWD = path.join(os.tmpdir(), 'branchat-codex'); // 空の作業フォルダ（読み取り専用サンドボックスで使用）

const claudeOk = () => !!CLAUDE;
// auth.json は存在確認だけ。中身は読まない
const codexOk = () => !!CODEX && fs.existsSync(path.join(CODEX_HOME, 'auth.json'));

function codexModels() {
  const out = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(CODEX_HOME, 'models_cache.json'), 'utf8'));
    for (const m of (Array.isArray(d) ? d : d.models) || []) {
      const id = m.slug || m.id;
      if (!id || id.includes('review')) continue;
      const ef = (m.supported_reasoning_levels || []).map((e) => (e && typeof e === 'object' ? e.effort : e));
      out.push({ id, name: m.display_name || id, efforts: EFFORTS.filter((e) => ef.includes(e)), default_effort: m.default_reasoning_level });
    }
  } catch (e) { /* 一覧が無ければ既定を返す */ }
  return out.length ? out : [{ id: 'gpt-5.5', name: 'GPT-5.5', efforts: ['low', 'medium', 'high', 'xhigh'], default_effort: 'medium' }];
}

// ログイン状態は各CLIの公式コマンドで確かめる（メールアドレス等の個人情報は画面へ渡さない）。30秒キャッシュ
function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { env: { ...process.env, PATH: PATH_EXT }, timeout, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ code: err ? (err.code || 1) : 0, out: String(stdout || ''), err: String(stderr || '') }));
  });
}
let authCache = null, authAt = 0;
async function authState(force) {
  if (!force && authCache && Date.now() - authAt < 30000) return authCache;
  const st = { claude: { installed: !!CLAUDE, loggedIn: false, plan: null }, codex: { installed: !!CODEX, loggedIn: false, method: null } };
  await Promise.all([
    (async () => { if (!CLAUDE) return; const r = await run(CLAUDE, ['auth', 'status']); try { const j = JSON.parse(r.out); st.claude.loggedIn = !!j.loggedIn; st.claude.plan = j.subscriptionType || null; } catch (e) { st.claude.loggedIn = false; } })(),
    (async () => { if (!CODEX) return; const r = await run(CODEX, ['login', 'status']); const t = (r.out + r.err); st.codex.loggedIn = /logged in/i.test(t) && !/not logged in/i.test(t); const m = t.match(/using\s+([A-Za-z ]+)/i); st.codex.method = m ? m[1].trim() : null; })(),
  ]);
  authCache = st; authAt = Date.now(); return st;
}
async function status(force) {
  const a = await authState(force);
  const cOk = a.claude.installed && a.claude.loggedIn, xOk = a.codex.installed && a.codex.loggedIn;
  return { ok: cOk, claude: CLAUDE, codex_ok: xOk, codex: CODEX, codex_models: xOk ? codexModels() : [], auth: a, desktop: true, platform: process.platform };
}

// 利用者のターミナルでログイン用コマンドを開始する。実行するのは固定のコマンドだけ
function loginCommand(engine) {
  if (engine === 'claude') return CLAUDE ? `"${CLAUDE}" auth login` : null;
  if (engine === 'codex') return CODEX ? `"${CODEX}" login` : null;
  return null;
}
function openLoginTerminal(engine) {
  const cmdline = loginCommand(engine);
  if (!cmdline) return { ok: false, reason: 'not_installed' };
  authCache = null;
  try {
    if (process.platform === 'darwin') {
      const script = `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(cmdline)}\nend tell`;
      spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
    } else if (IS_WIN) {
      spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', cmdline], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
    } else return { ok: false, reason: 'unsupported_os', command: cmdline };
    return { ok: true, command: cmdline };
  } catch (e) { return { ok: false, reason: String(e.message || e), command: cmdline }; }
}

/**
 * 会話を1回実行する。onEvent に {text} {usage} {rate_limit} {error} {done} を渡す。
 * 戻り値の関数を呼ぶと子プロセスを止める。
 */
function chat(req, onEvent) {
  const system = String(req.system || '');
  let prompt = String(req.prompt || '');
  const model = String(req.model || 'claude-opus-5');
  const engine = req.engine === 'codex' ? 'codex' : 'claude';
  const effort = EFFORTS.includes(req.effort) ? req.effort : null;
  const web = !!req.web; // Web検索を許可するか（検索と取得だけ。ファイルやコマンドは使わせない）
  let cmd, args;
  if (engine === 'codex') {
    if (!codexOk()) { onEvent({ error: 'Codex CLI が見つからないか、ChatGPT にログインしていません' }); onEvent({ done: true }); return () => {}; }
    fs.mkdirSync(CODEX_CWD, { recursive: true });
    cmd = CODEX;
    args = [...(web ? ['--search'] : []), 'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', '-C', CODEX_CWD, '-m', model];
    if (effort) args.push('-c', `model_reasoning_effort=${effort}`);
    args.push('-');
    prompt = system + '\n\nあなたは会話アシスタントとして振る舞い、コマンド実行やファイル操作は行わず、文章だけで答えてください。\n\n---\n\n' + prompt;
  } else {
    if (!claudeOk()) { onEvent({ error: 'Claude Code（claude コマンド）が見つかりません。インストールとログインを確認してください' }); onEvent({ done: true }); return () => {}; }
    cmd = CLAUDE;
    args = ['-p', '--model', model, '--system-prompt', system, '--tools', ...(web ? ['WebSearch', 'WebFetch', '--allowedTools', 'WebSearch', 'WebFetch'] : ['']),
      '--no-session-persistence', '--strict-mcp-config', '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
    if (effort && effort !== 'ultra') args.push('--effort', effort);
  }
  const env = { ...process.env, PATH: PATH_EXT };
  delete env.CLAUDECODE; // ネスト検出を回避
  delete env.ELECTRON_RUN_AS_NODE;
  let child;
  try { child = spawn(cmd, args, { cwd: engine === 'codex' ? CODEX_CWD : os.tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'], shell: IS_WIN && /\.cmd$/i.test(cmd) }); }
  catch (e) { onEvent({ error: `${engine} 起動失敗: ${e.message}` }); onEvent({ done: true }); return () => {}; }
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);

  let buf = '', errBuf = '', first = true, finished = false;
  const finish = () => { if (!finished) { finished = true; onEvent({ done: true }); } };
  const handle = (line) => {
    let ev; try { ev = JSON.parse(line); } catch (e) { return; }
    const t = ev.type;
    if (engine === 'codex') {
      // codex は1文字ずつではなく、発言のまとまり単位で届く
      if (t === 'item.completed' && ev.item && ev.item.type === 'web_search') onEvent({ tool: { name: 'web_search', q: ev.item.query || '' } });
      else if (t === 'item.completed' && ev.item && ev.item.type === 'agent_message' && ev.item.text) { onEvent({ text: (first ? '' : '\n\n') + ev.item.text }); first = false; }
      else if (t === 'turn.completed') { const u = ev.usage || {}; const cached = u.cached_input_tokens || 0; onEvent({ usage: { input_tokens: Math.max(0, (u.input_tokens || 0) - cached), cache_read_input_tokens: cached, output_tokens: u.output_tokens || 0 } }); }
      else if (t === 'error' || t === 'turn.failed') onEvent({ error: 'codex: ' + (ev.message || (ev.error && ev.error.message) || JSON.stringify(ev).slice(0, 500)) });
      return;
    }
    if (t === 'stream_event') {
      const e = ev.event || {};
      if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta') onEvent({ text: e.delta.text || '' });
      else if (e.type === 'message_delta') onEvent({ usage: e.usage });
    } else if (t === 'assistant') {
      for (const c of ((ev.message || {}).content || [])) if (c.type === 'tool_use' && (c.name === 'WebSearch' || c.name === 'WebFetch')) onEvent({ tool: { name: c.name === 'WebSearch' ? 'web_search' : 'web_fetch', q: (c.input && (c.input.query || c.input.url)) || '' } });
    } else if (t === 'result') { if (ev.is_error) onEvent({ error: String(ev.result || 'claude がエラーを返しました').slice(0, 800) }); }
    else if (t === 'rate_limit_event') onEvent({ rate_limit: ev.rate_limit_info });
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handle(line); } });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { errBuf = (errBuf + d).slice(-2000); });
  child.on('error', (e) => { onEvent({ error: `${engine} 起動失敗: ${e.message}` }); finish(); });
  child.on('close', (code) => { if (buf.trim()) handle(buf.trim()); if (code && !finished) onEvent({ error: `${engine} 終了コード ${code}: ${errBuf.trim().slice(-600)}` }); finish(); });
  return () => { try { child.kill(); } catch (e) { /* 既に終了 */ } };
}

module.exports = { status, chat, openLoginTerminal, loginCommand, EFFORTS };
