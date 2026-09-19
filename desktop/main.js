// BranCHAT デスクトップ版（Electron）。
// 画面は親フォルダの index.html をそのまま使う（desktop/app/ へコピー）。
// 独自スキーム app://branchat/ で配信し、/api/status と /api/chat を本体(Node)が処理する。
// → localStorage の保存先(オリジン)が固定され、ローカルHTTPサーバーもポートも不要。
'use strict';
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const engines = require('./engines');

const APP_DIR = path.join(__dirname, 'app');
const ORIGIN = 'app://branchat';
const SMOKE = process.env.SMOKE === '1';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function sse(obj) { return new TextEncoder().encode('data: ' + JSON.stringify(obj) + '\n\n'); }

async function handle(request) {
  const url = new URL(request.url);
  if (url.host !== 'branchat') return new Response('not found', { status: 404 });

  if (url.pathname === '/api/status') return Response.json(engines.status());

  if (url.pathname === '/api/chat') {
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
    let body; try { body = await request.json(); } catch (e) { return new Response('bad request', { status: 400 }); }
    let stop = () => {}; let closed = false;
    const stream = new ReadableStream({
      start(controller) {
        stop = engines.chat(body, (ev) => {
          if (closed) return;
          try { controller.enqueue(sse(ev)); if (ev.done) { closed = true; controller.close(); } } catch (e) { closed = true; stop(); }
        });
      },
      cancel() { closed = true; stop(); }, // 画面側が中断したら子プロセスも止める
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }

  // 静的ファイル（app/ の外へは出さない）
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(APP_DIR, rel));
  if (!file.startsWith(APP_DIR + path.sep) || !fs.existsSync(file)) return new Response('not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240, height: 860, minWidth: 420, minHeight: 520, title: 'BranCHAT', backgroundColor: '#040a17', show: !SMOKE,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  // 外部リンクは既定のブラウザで開き、アプリ内では app:// 以外へ移動させない
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN + '/')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadURL(ORIGIN + '/index.html');
  return win;
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' }, { role: 'editMenu' },
    { label: '表示', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]));
}

async function runSmoke(win) {
  // 自動確認: 画面が出るか、エンジン検出、ダミー送信、（SMOKE_LIVE=1 のとき）実モデルへ最小の1回
  const out = { ok: false };
  try {
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await new Promise((r) => setTimeout(r, 1200));
    out.page = await win.webContents.executeJavaScript(`(async()=>{
      await probeBridge();
      const r={title:document.title,origin:location.origin,bridgeOk,claudeCliOk,codex:codexInfo.ok,models:MODEL_OPTS.map(o=>o.l),lsWorks:(()=>{try{localStorage.setItem('bc.smoke','1');return localStorage.getItem('bc.smoke')==='1';}catch(e){return false;}})()};
      settings.provider='dummy'; loadDemo();
      await send('スモークテスト'); r.dummyReply=N(conv.activeNodeId).content.slice(0,40);
      if(${process.env.SMOKE_LIVE === '1'}){
        settings.provider='bridge'; B('main').model='claude-haiku-4-5'; gotoBranch('main');
        await send('1+1は？数字だけで答えて。'); const n=N(conv.activeNodeId); r.live={text:n.content.slice(0,60),usage:n.usage,model:n.model};
      }
      return r;})()`);
    const img = await win.webContents.capturePage();
    const shot = path.join(process.env.SMOKE_OUT || require('node:os').tmpdir(), 'branchat-smoke.png');
    fs.writeFileSync(shot, img.toPNG()); out.screenshot = shot; out.ok = true;
  } catch (e) { out.error = String(e && e.stack || e); }
  console.log('SMOKE_RESULT ' + JSON.stringify(out));
  app.exit(out.ok ? 0 : 1);
}

app.whenReady().then(() => {
  protocol.handle('app', handle);
  buildMenu();
  const win = createWindow();
  if (SMOKE) runSmoke(win);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
