// BranCHAT デスクトップ版（Electron）。
// 画面は親フォルダの index.html をそのまま使う（desktop/app/ へコピー）。
// 独自スキーム app://branchat/ で配信し、/api/status と /api/chat を本体(Node)が処理する。
// → localStorage の保存先(オリジン)が固定され、ローカルHTTPサーバーもポートも不要。
'use strict';
const { app, BrowserWindow, protocol, net, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const engines = require('./engines');
const exporter = require('./export');

const APP_DIR = path.join(__dirname, 'app');
const ORIGIN = 'app://branchat';
const SMOKE = process.env.SMOKE === '1';
// 自動確認は利用者の会話データに触れないよう、保存先を一時フォルダへ分ける
if (SMOKE) app.setPath('userData', path.join(require('node:os').tmpdir(), 'branchat-smoke-userdata'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function sse(obj) { return new TextEncoder().encode('data: ' + JSON.stringify(obj) + '\n\n'); }

async function handle(request) {
  const url = new URL(request.url);
  if (url.host !== 'branchat') return new Response('not found', { status: 404 });

  if (url.pathname === '/api/status') return Response.json(await engines.status(url.searchParams.get('force') === '1'));

  if (url.pathname === '/api/mcp') return Response.json({ servers: await engines.mcpServers(url.searchParams.get('force') === '1') });

  if (url.pathname === '/api/export') { // 回答やブランチを DOCX / PPTX に。保存先は利用者が選ぶ
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
    let b; try { b = await request.json(); } catch (e) { return new Response('bad request', { status: 400 }); }
    const kind = b.kind === 'pptx' ? 'pptx' : 'docx';
    const title = String(b.title || 'BranCHAT').slice(0, 80);
    const safe = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'BranCHAT';
    try {
      const buf = kind === 'pptx' ? await exporter.toPptx({ title, sections: b.sections || [] }) : await exporter.toDocx({ title, sections: b.sections || [] });
      const win = BrowserWindow.getAllWindows()[0];
      const r = await dialog.showSaveDialog(win, { title: kind === 'pptx' ? 'スライドを保存' : '文書を保存', defaultPath: path.join(app.getPath('documents'), `${safe}.${kind}`), filters: [{ name: kind.toUpperCase(), extensions: [kind] }] });
      if (r.canceled || !r.filePath) return Response.json({ ok: false, canceled: true });
      fs.writeFileSync(r.filePath, buf);
      return Response.json({ ok: true, path: r.filePath });
    } catch (e) { return Response.json({ ok: false, error: String(e && e.message || e) }); }
  }
  if (url.pathname === '/api/open') { // 保存したファイルやフォルダを開く（このアプリが作ったパスだけ）
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
    let b = {}; try { b = await request.json(); } catch (e) { /* 空でよい */ }
    const fp = String(b.path || '');
    if (!fp || !fs.existsSync(fp)) return Response.json({ ok: false });
    if (b.reveal) shell.showItemInFolder(fp); else await shell.openPath(fp);
    return Response.json({ ok: true });
  }
  if (url.pathname === '/api/login') { // ログイン用のターミナルを開く（固定コマンドのみ）
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
    let b = {}; try { b = await request.json(); } catch (e) { /* 空でよい */ }
    return Response.json(engines.openLoginTerminal(b.engine === 'codex' ? 'codex' : 'claude'));
  }

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

  if (url.pathname === '/api/backup') {
    const dir = path.join(app.getPath('userData'), 'backups');
    const latest = path.join(dir, 'convs-latest.json');
    if (request.method === 'GET') {
      if (!fs.existsSync(latest)) return new Response('no backup', { status: 404 });
      return new Response(fs.readFileSync(latest), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    if (request.method === 'POST') {
      try {
        const text = await request.text(); JSON.parse(text); // 壊れたJSONは保存しない
        fs.mkdirSync(dir, { recursive: true });
        const tmp = latest + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, latest); // 途中で落ちても壊れないよう置き換え
        const day = path.join(dir, `convs-${new Date().toISOString().slice(0, 10)}.json`); fs.copyFileSync(latest, day); // 日ごとの世代
        const olds = fs.readdirSync(dir).filter((f) => /^convs-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); // 直近14日分だけ残す
        for (const f of olds.slice(0, Math.max(0, olds.length - 14))) fs.unlinkSync(path.join(dir, f));
        return Response.json({ ok: true });
      } catch (e) { return new Response('backup failed', { status: 500 }); }
    }
    return new Response('method not allowed', { status: 405 });
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
      if(document.getElementById('tutDlg').open)closeTut();
      await probeBridge();
      const r={title:document.title,origin:location.origin,bridgeOk,claudeCliOk,codex:codexInfo.ok,models:MODEL_OPTS.map(o=>o.l),fontsLocal:!!document.querySelector('link[href="fonts/fonts.css"]'),fontsReady:(await document.fonts.ready,document.fonts.check('16px DotGothic16')&&document.fonts.check('15px "Noto Sans JP"')),lsWorks:(()=>{try{localStorage.setItem('bc.smoke','1');return localStorage.getItem('bc.smoke')==='1';}catch(e){return false;}})()};
      settings.provider='dummy'; loadDemo();
      await send('スモークテスト'); r.dummyReply=N(conv.activeNodeId).content.slice(0,40);
      // 中断: ダミー応答を途中で止める
      const pAbort=send('中断テスト'); await new Promise(x=>setTimeout(x,120)); document.getElementById('sendBtn').click(); await pAbort; r.abort=N(conv.activeNodeId).content.includes('中止しました');
      // バックアップ: 保存して読み戻す
      await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({convs,active:conv.id,savedAt:Date.now()})});
      const bk=await (await fetch('/api/backup')).json(); r.backupConvs=Object.keys(bk.convs||{}).length;
      if(${process.env.SMOKE_CODEX === '1'}){
        settings.provider='bridge'; await probeBridge(); const g=MODEL_OPTS.find(o=>o.v==='gpt-5.5'); if(g){B('main').model='gpt-5.5'; delete B('main').effort; gotoBranch('main');
          const t0=performance.now();const pr=send('1から10までの数字を、1行に1つずつ書いて。');const aid=conv.activeNodeId;let firstAt=null;
          const tick=setInterval(()=>{if(firstAt!==null)return;const el=document.getElementById('n-'+aid);const b=el&&el.querySelector('.body');if(b&&b.textContent.trim()&&!b.querySelector('.waiting'))firstAt=performance.now()-t0;},30);
          await pr;clearInterval(tick);const n=N(aid);r.codexRun={text:n.content.slice(0,20),effort:n.effort,firstTextMs:Math.round(firstAt===null?-1:firstAt),totalMs:Math.round(performance.now()-t0)};
          const t1=performance.now();const pr2=send('続けて11から15まで。');const aid2=conv.activeNodeId;let f2=null;const tick2=setInterval(()=>{if(f2!==null)return;const el=document.getElementById('n-'+aid2);const b=el&&el.querySelector('.body');if(b&&b.textContent.trim()&&!b.querySelector('.waiting'))f2=performance.now()-t1;},30);
          await pr2;clearInterval(tick2);const n2=N(aid2);r.codexRun2={text:n2.content.slice(0,20),firstTextMs:Math.round(f2===null?-1:f2),totalMs:Math.round(performance.now()-t1),usage:n2.usage};}
      }
      if(${process.env.SMOKE_LIVE === '1'}){
        settings.provider='bridge'; B('main').model='claude-haiku-4-5'; gotoBranch('main');
        const t0=performance.now();let firstAt=null;const pr=send('1から20までの数字を、1行に1つずつ書いて。');const aid=conv.activeNodeId;
        const tick=setInterval(()=>{if(firstAt!==null)return;const el=document.getElementById('n-'+aid);const b=el&&el.querySelector('.body');if(b&&b.textContent.trim()&&!b.querySelector('.waiting'))firstAt=performance.now()-t0;},30);
        await pr;clearInterval(tick);const n=N(aid);r.live={text:n.content.slice(0,40),usage:n.usage,model:n.model,firstTextMs:Math.round(firstAt===null?-1:firstAt),totalMs:Math.round(performance.now()-t0)};
        const t1=performance.now();const pr2=send('続けて21から25まで。');const aid2=conv.activeNodeId;let f2=null;const tick2=setInterval(()=>{if(f2!==null)return;const el=document.getElementById('n-'+aid2);const b=el&&el.querySelector('.body');if(b&&b.textContent.trim()&&!b.querySelector('.waiting'))f2=performance.now()-t1;},30);
        await pr2;clearInterval(tick2);const n2=N(aid2);r.live2={text:n2.content.slice(0,30),firstTextMs:Math.round(f2===null?-1:f2),totalMs:Math.round(performance.now()-t1),usage:n2.usage};
      }
      if(${process.env.SMOKE_KNOW === '1'}){ // 左の会話一覧・記憶・知識マップ
        const mk=async(t,q)=>{conv=newConversation(t);persist();await send(q);};
        await mk('ゾルミンの副作用マニュアル','ゾルミンの発疹と下痢への対処を病棟マニュアルにまとめたい。ステロイド外用薬と休薬基準を整理して。');
        await mk('生存時間解析の相談','カプランマイヤー曲線とログランク検定、Cox比例ハザードモデルの使い分けを教えて。');
        await mk('学会スライドの配色','学会発表のスライドで、藍色を基調にした配色とフォントの選び方を相談したい。');
        settings.memory='- 腫瘍内科の臨床医';settings.memoryOn=true;settings.knowThr=50;saveSettings();
        const sys=buildContext(conv.activeNodeId).system;
        showKnow();await new Promise(x=>setTimeout(x,500));
        const k=kbCache.nodes.find(n=>n.title==='副作用');if(k){knowSel=k.key;renderKnow();}
        if(${process.env.SMOKE_KNOW_LIVE === '1'}){settings.provider='bridge';await probeBridge();const t=kbCache.nodes.find(n=>n.title==='ゾルミンの副作用マニュアル');const t0=performance.now();const ok=await updateLinks(t.convId,t.bid,true);settings.provider='dummy';
          r.knowLive={ok,ms:Math.round(performance.now()-t0),scores:Object.entries(links).map(([k,v])=>v.s+' '+k.split('|').map(x=>(kbCache.nodes.find(n=>n.key===x)||{}).title).join(' ↔ ')).sort((a,b)=>parseInt(b)-parseInt(a))};renderKnow();await new Promise(x=>setTimeout(x,300));}
        r.know={sideItems:document.querySelectorAll('.citem').length,nodes:kbCache.nodes.length,edges:document.querySelectorAll('#knowSvg .ke').length,memInContext:sys.includes('腫瘍内科の臨床医')&&sys.indexOf('腫瘍内科の臨床医')<sys.indexOf('## 会話マップ')};
      }
      if(${process.env.SMOKE_TUT === '1'}){openTut(1);await new Promise(x=>setTimeout(x,1500));r.tutBadges=[...document.querySelectorAll('#tutBody .badge')].map(b=>b.textContent);}
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
app.on('will-quit', () => engines.shutdown());
