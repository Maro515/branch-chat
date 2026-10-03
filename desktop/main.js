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

  if (url.pathname === '/api/judge') { // 知識マップの関連度を Jev に判定させる（中継のみ）
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
    let body; try { body = await request.json(); } catch (e) { return new Response('bad request', { status: 400 }); }
    const out = await engines.judge(body);
    return Response.json(out, { status: out.error ? 502 : 200 });
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

  if (url.pathname === '/api/store' || url.pathname === '/api/store/open') { // 会話記録をこの端末のファイルとして保存する（会話ごとに JSON と、読める形の Markdown）
    const dir = path.join(app.getPath('userData'), 'conversations');
    const okId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
    const atomic = (file, text) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }; // 途中で落ちても壊れないよう置き換え
    if (url.pathname === '/api/store/open') { fs.mkdirSync(dir, { recursive: true }); await shell.openPath(dir); return Response.json({ ok: true, dir }); }
    if (request.method === 'GET') {
      const convs = {}; let links = null;
      if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        try { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (f === '_links.json') links = j; else if (j && j.id && j.nodes && j.branches) convs[j.id] = j; } catch (e) { /* 壊れたファイルは読み飛ばす */ }
      }
      return Response.json({ dir, convs, links });
    }
    if (request.method === 'POST') {
      try {
        const b = await request.json(); fs.mkdirSync(dir, { recursive: true }); let saved = 0;
        for (const it of (Array.isArray(b.files) ? b.files : [])) {
          if (!it || !okId(it.id) || !it.conv || it.conv.id !== it.id) continue;
          atomic(path.join(dir, it.id + '.json'), JSON.stringify(it.conv, null, 1));
          if (typeof it.md === 'string') atomic(path.join(dir, it.id + '.md'), it.md);
          saved++;
        }
        for (const id of (Array.isArray(b.removed) ? b.removed : [])) { // 画面で削除した会話は、消さずに trash へ移す
          if (!okId(id)) continue; const trash = path.join(dir, 'trash'); fs.mkdirSync(trash, { recursive: true });
          for (const ext of ['.json', '.md']) { const src = path.join(dir, id + ext); if (fs.existsSync(src)) fs.renameSync(src, path.join(trash, `${id}-${Date.now()}${ext}`)); }
        }
        for (const it of (Array.isArray(b.trashCopy) ? b.trashCopy : [])) { // ブランチを消す前の会話の写し
          if (!it || !okId(it.id) || !it.conv) continue; const trash = path.join(dir, 'trash'); fs.mkdirSync(trash, { recursive: true });
          atomic(path.join(trash, `${it.id}-before-delete-${Date.now()}.json`), JSON.stringify(it.conv, null, 1));
        }
        if (b.links && typeof b.links === 'object') atomic(path.join(dir, '_links.json'), JSON.stringify(b.links));
        return Response.json({ ok: true, saved, dir });
      } catch (e) { return new Response('store failed', { status: 500 }); }
    }
    return new Response('method not allowed', { status: 405 });
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

  if (url.pathname === '/api/img' || url.pathname.startsWith('/api/img/')) { // Figure の画像パネル用の画像をこの端末に保存する（会話記録と同じ場所の images/）
    const dir = path.join(app.getPath('userData'), 'conversations', 'images');
    const okId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
    if (request.method === 'POST') {
      try {
        const b = await request.json(); if (!okId(b.id) || typeof b.data !== 'string') return new Response('bad request', { status: 400 });
        const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(b.data); if (!m) return new Response('bad image', { status: 400 });
        fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, b.id + (m[1] === 'png' ? '.png' : '.jpg'));
        fs.writeFileSync(file + '.tmp', Buffer.from(m[2], 'base64')); fs.renameSync(file + '.tmp', file);
        return Response.json({ ok: true, file });
      } catch (e) { return new Response('img store failed', { status: 500 }); }
    }
    const id = url.pathname.slice('/api/img/'.length); if (!okId(id)) return new Response('not found', { status: 404 });
    for (const [ext, type] of [['.png', 'image/png'], ['.jpg', 'image/jpeg']]) { const f = path.join(dir, id + ext); if (fs.existsSync(f)) return new Response(fs.readFileSync(f), { headers: { 'Content-Type': type, 'Cache-Control': 'max-age=86400' } }); }
    return new Response('not found', { status: 404 });
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
    if (process.env.SMOKE_LOG) win.webContents.on('console-message', (e, level, msg) => { if (level >= 2) console.error('RENDERER ' + msg); });
    out.page = await win.webContents.executeJavaScript(`(async()=>{
      if(document.getElementById('tutDlg').open)closeTut();
      await probeBridge();
      const r={title:document.title,origin:location.origin,bridgeOk,claudeCliOk,codex:codexInfo.ok,models:MODEL_OPTS.map(o=>o.l),fontsLocal:!!document.querySelector('link[href="fonts/fonts.css"]'),fontsReady:(await document.fonts.ready,document.fonts.check('15px "IBM Plex Sans JP"')),lsWorks:(()=>{try{localStorage.setItem('bc.smoke','1');return localStorage.getItem('bc.smoke')==='1';}catch(e){return false;}})()};
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
        settings.provider='bridge'; B('main').model=${JSON.stringify(process.env.SMOKE_LIVE_MODEL || 'claude-haiku-4-5')}; gotoBranch('main');
        const t0=performance.now();let firstAt=null;const pr=send('1から20までの数字を、1行に1つずつ書いて。');const aid=conv.activeNodeId;
        const tick=setInterval(()=>{if(firstAt!==null)return;const el=document.getElementById('n-'+aid);const b=el&&el.querySelector('.body');if(b&&b.textContent.trim()&&!b.querySelector('.waiting'))firstAt=performance.now()-t0;},30);
        await pr;clearInterval(tick);const n=N(aid);r.live={text:n.content.slice(0,40),usage:n.usage,model:n.model,modelUsed:n.modelUsed,firstTextMs:Math.round(firstAt===null?-1:firstAt),totalMs:Math.round(performance.now()-t0)};
        const t1=performance.now();const pr2=send('続けて21から25まで。');const aid2=conv.activeNodeId;let f2=null;const tick2=setInterval(()=>{if(f2!==null)return;const el=document.getElementById('n-'+aid2);const b=el&&el.querySelector('.body');if(b&&b.textContent.trim()&&!b.querySelector('.waiting'))f2=performance.now()-t1;},30);
        await pr2;clearInterval(tick2);const n2=N(aid2);r.live2={text:n2.content.slice(0,30),firstTextMs:Math.round(f2===null?-1:f2),totalMs:Math.round(performance.now()-t1),usage:n2.usage};
      }
      if(${process.env.SMOKE_KNOW === '1'}){ // 左の会話一覧・記憶・知識マップ
        const mk=async(t,q)=>{conv=newConversation(t);persist();await send(q);};
        await mk('ゾルミンの副作用マニュアル','ゾルミンの発疹と下痢への対処を病棟マニュアルにまとめたい。ステロイド外用薬と休薬基準を整理して。');
        await mk('生存時間解析の相談','カプランマイヤー曲線とログランク検定、Cox比例ハザードモデルの使い分けを教えて。');
        await mk('学会スライドの配色','学会発表のスライドで、藍色を基調にした配色とフォントの選び方を相談したい。');
        settings.knowThr=50;saveSettings();
        showKnow();await new Promise(x=>setTimeout(x,500));
        const k=kbCache.nodes.find(n=>n.title==='副作用');if(k){knowSel=k.key;renderKnow();}
        if(${process.env.SMOKE_JEV === '1'}){ // Jev 連携（BRANCHAT_JEV_URL で模擬サーバーへ向けて確認する）
          settings.judge='jev';settings.jevVia='typesafe';settings.jevKey='smoke-test-key';saveSettings();
          const t=kbCache.nodes.find(n=>n.title==='ゾルミンの副作用マニュアル');const ok=await updateLinks(t.convId,t.bid,true);
          r.jev={mode:judgeMode(),ready:jevReady(),ok,err:jevLastError,scores:Object.entries(links).filter(([k,v])=>v.by==='jev').map(([k,v])=>v.s+' '+k.split('|').map(x=>(kbCache.nodes.find(n=>n.key===x)||{}).title).join(' ↔ '))};
          settings.jevKey='';saveSettings();renderKnow();await new Promise(x=>setTimeout(x,300));r.jev.unsetInfo=document.querySelector('#knowInfo').textContent;r.jev.btn=document.querySelector('#knowAi').textContent;}
        if(${process.env.SMOKE_KNOW_LIVE === '1'}){settings.provider='bridge';await probeBridge();const t=kbCache.nodes.find(n=>n.title==='ゾルミンの副作用マニュアル');const t0=performance.now();const ok=await updateLinks(t.convId,t.bid,true);settings.provider='dummy';
          r.knowLive={ok,ms:Math.round(performance.now()-t0),scores:Object.entries(links).map(([k,v])=>v.s+' '+k.split('|').map(x=>(kbCache.nodes.find(n=>n.key===x)||{}).title).join(' ↔ ')).sort((a,b)=>parseInt(b)-parseInt(a))};renderKnow();await new Promise(x=>setTimeout(x,300));}
        r.know={sideItems:document.querySelectorAll('.citem').length,nodes:kbCache.nodes.length,edges:document.querySelectorAll('#knowSvg .ke').length};
        if(${process.env.SMOKE_TIDY === '1'}){ // 整理: よく似た組の検出と、先の枝ごとのブランチ削除
          await mk('ゾルミンの副作用マニュアル（写し）','ゾルミンの発疹と下痢への対処を病棟マニュアルにまとめたい。ステロイド外用薬と休薬基準を整理して。');
          const pairs=tidyPairs().map(p=>p.s+' '+p.a.title+' ↔ '+p.b.title);
          const demo=Object.values(convs).find(c=>c.title.startsWith('【デモ】'));const fx=Object.values(demo.branches).find(x=>x.name==='副作用');
          const before={branches:Object.keys(demo.branches).length,nodes:demo.order.length,sub:branchSubtree(demo,fx.id).length};
          conv=demo;gotoBranch(fx.id);const pr=deleteBranchDeep(demo.id,fx.id);await new Promise(x=>setTimeout(x,300));const msg=document.querySelector('#qMsg').textContent;document.querySelector('#qOk').click();const okDel=await pr;
          r.tidy={pairs,before,confirmMsg:msg,okDel,after:{branches:Object.keys(demo.branches).length,nodes:demo.order.length,activeOk:!!demo.nodes[demo.activeNodeId],orphans:demo.order.filter(id=>demo.nodes[id].parentId&&!demo.nodes[demo.nodes[id].parentId]).length,badBranches:Object.values(demo.branches).filter(x=>x.forkFromNodeId&&!demo.nodes[x.forkFromNodeId]).length}};
          document.querySelector('#knowTidy').click();await new Promise(x=>setTimeout(x,300));r.tidy.dialogPairs=document.querySelectorAll('#tidyBody .tpair').length;
        }
        await flushStore();const st=await (await fetch('/api/store')).json();const one=Object.values(st.convs).find(c=>c.title==='生存時間解析の相談');
        r.store={dir:st.dir,files:Object.keys(st.convs).length,inApp:Object.keys(convs).length,hasNodes:!!(one&&one.order.length===2)};
      }
      if(${process.env.SMOKE_LAYOUT === '1'}){ // 左寄せとサイドバーの幅
        gotoBranch('main');await new Promise(x=>setTimeout(x,300));
        const rc=e=>{const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.right)];};const fo=rc(document.querySelector('#focus'));
        const ai=rc(document.querySelector('.msg:not(.user)')),us=rc(document.querySelector('.msg.user')),mm=rc(document.querySelector('#miniMap')),row=rc(document.querySelector('#composer .row'));
        r.layout={focus:fo,ai,user:us,mini:mm,composerRow:row,overlapUserMini:us[1]>mm[0],side0:Math.round(document.querySelector('#side').getBoundingClientRect().width)};
        const g=document.querySelector('#sideGrip');const gx=g.getBoundingClientRect().left+3;const ev=(t,x)=>g.dispatchEvent(new PointerEvent(t,{clientX:x,clientY:300,pointerId:1,bubbles:true}));
        g.setPointerCapture=()=>{};ev('pointerdown',gx);ev('pointermove',380);ev('pointerup',380);r.layout.sideAfterDrag=Math.round(document.querySelector('#side').getBoundingClientRect().width);r.layout.saved=settings.sideW;
        ev('pointerdown',380);ev('pointermove',60);ev('pointerup',60);r.layout.hiddenByDrag=document.body.classList.contains('sideHidden');
        document.querySelector('#sideToggle').click();r.layout.reopened=!document.body.classList.contains('sideHidden');r.layout.widthKept=Math.round(document.querySelector('#side').getBoundingClientRect().width);
        document.querySelector('#sideHide').click();r.layout.hiddenByButton=document.body.classList.contains('sideHidden');document.querySelector('#sideToggle').click();
      }
      if(${process.env.SMOKE_BK === '1'}){ // バックアップ・引継ぎ: 全会話の書き出し→消す→読み込みで戻る
        let saved=null;const orig=saveTextFile;window.saveTextFile=async(fn,data)=>{saved={fn,data};};
        const mk=async(t,q)=>{conv=newConversation(t);persist();await send(q);};await mk('引継ぎテスト','別の端末へ移す会話');
        const before=bkUsed().length;await exportAllConvs();const j=JSON.parse(saved.data);
        const victim=Object.values(convs).find(c=>c.title==='引継ぎテスト').id;delete convs[victim];conv=Object.values(convs)[0];persist();
        const pr=importBackupText(saved.data);await new Promise(x=>setTimeout(x,300));const msg=document.querySelector('#qMsg').textContent;document.querySelector('#qOk').click();await pr;
        r.bk={file:saved.fn,kind:j.kind,convsInFile:Object.keys(j.convs).length,hasSettings:'settings' in j||/jevKey|apiKey/.test(saved.data),before,afterDelete:before-1,afterImport:bkUsed().length,restored:!!convs[victim],confirm:msg.split(String.fromCharCode(10)).join(' / '),plusItems:[...document.querySelectorAll('#plusPop > button')].map(b=>b.id),headerHasOld:!!document.querySelector('#exportBtn,#importBtn')};
        await new Promise(x=>setTimeout(x,400));document.querySelector('#bkBtn').click();await new Promise(x=>setTimeout(x,300));r.bk.openDialogs=[...document.querySelectorAll('dialog[open]')].map(d=>d.id);
      }
      if(${process.env.SMOKE_OVER === '1'}){gotoBranch('main');showOverview();await new Promise(x=>setTimeout(x,500));document.querySelector('[data-fold]').click();await new Promise(x=>setTimeout(x,200));const fc=document.querySelector('.card.folded');r.over={folded:!!fc,foldedHeight:fc&&Math.round(fc.getBoundingClientRect().height),hiddenSum:fc&&getComputedStyle(fc.querySelector('.sum')).display,head:document.querySelector('.cardsHead h2').textContent,secs:[...document.querySelectorAll('.cardsSec')].map(e=>e.textContent)};}
      if(${process.env.SMOKE_OA === '1'}){ // ほかの LLM の API（OpenAI 互換）。模擬サーバー 127.0.0.1:18766 へ
        settings.provider='openai';settings.oaBase='http://127.0.0.1:18766/v1';settings.oaKey='mock-key';settings.oaModels='mock-large, mock-small';settings.oaSum='mock-small';saveSettings();refreshModelCatalog();
        const ms=await fetchOaModels(settings.oaBase,settings.oaKey);conv=newConversation('API確認');persist();await send('つながりますか');const n=N(conv.activeNodeId);await new Promise(x=>setTimeout(x,1500));
        settings.oaKey='wrong';await send('キーが違う場合');const n2=N(conv.activeNodeId);
        r.oa={models:ms,opts:MODEL_OPTS.map(o=>o.v),reply:n.content,usage:n.usage,model:n.model,summary:B('main').summary&&B('main').summary.topic,badKey:n2.content.slice(0,80)};settings.provider='dummy';
      }
      if(${process.env.SMOKE_TABS === '1'}){const kid=Object.values(conv.branches).find(b=>b.name==='副作用');gotoBranch(kid.id);await new Promise(x=>setTimeout(x,300));r.tabs=[...document.querySelectorAll('#branchBar .chip')].map(c=>c.textContent.trim()+(c.classList.contains('on')?' [ON]':''));}
      if(${process.env.SMOKE_VIEW === '1'}){const kid=Object.values(conv.branches).find(b=>b.name==='副作用');gotoBranch(kid.id);await new Promise(x=>setTimeout(x,300));
        r.view={shown:[...document.querySelectorAll('#msgs .msg')].map(e=>e.id.replace('n-','')).map(id=>N(id)?B(N(id).branchId).name+'#'+N(id).seq+'/'+N(id).role[0]:id),edge:getComputedStyle(document.querySelector('#focus')).getPropertyValue('--curbc').trim(),userMeta:document.querySelectorAll('#msgs .msg.user .meta').length,icons:[...document.querySelectorAll('#msgs .msg:not(.user) .tools button')].slice(0,3).map(b=>b.textContent+'|'+b.title.slice(0,12)),editOpacity:getComputedStyle(document.querySelector('.msg.user .tools')).opacity};}
      if(${process.env.SMOKE_TITLE === '1'}){conv=newConversation();persist();await send('ゾルミンの発疹への対処をまとめたい');await new Promise(x=>setTimeout(x,800));r.title={afterSummary:conv.title,auto:conv.titleAuto};await send('二問目');await new Promise(x=>setTimeout(x,800));r.title.afterSecond=conv.title;}
      if(${process.env.SMOKE_SET === '1'}){settings.provider='bridge';await probeBridge();document.querySelector('#settingsBtn').click();await new Promise(x=>setTimeout(x,2500));r.set={hint:document.querySelector('#bridgeHint').textContent.slice(0,60),model:[...document.querySelectorAll('#sModel option')].map(o=>o.textContent),sum:[...document.querySelectorAll('#sSumModel option')].map(o=>o.textContent).length,sumVal:document.querySelector('#sSumModel').value};settings.provider='dummy';}
      if(${process.env.SMOKE_NOTE === '1'}){ // 説明してもらう・チャット外で質問・黄色マーカー
        gotoBranch('main');await new Promise(x=>setTimeout(x,300));const tgt=conv.order.map(N).find(n=>n.role==='assistant'&&n.content.includes('28日'));
        const nodesBefore=conv.order.length;sel={nodeId:tgt.id,text:'28日'};startNote(2);await new Promise(x=>setTimeout(x,2500));
        const note=Object.values(conv.notes)[0];await askNote(note.id,'追加で質問');sel={nodeId:tgt.id,text:'28日'};startNote(3);await new Promise(x=>setTimeout(x,2500));{const w=document.querySelector('#noteWin');const b0=w.getBoundingClientRect();const g=w.querySelector('.nwGrip.c');g.setPointerCapture=()=>{};const ev=(t,x,y)=>g.dispatchEvent(new PointerEvent(t,{clientX:x,clientY:y,pointerId:1,bubbles:true}));ev('pointerdown',b0.left,b0.top);ev('pointermove',b0.left-200,b0.top-120);ev('pointerup',b0.left-200,b0.top-120);const b1=w.getBoundingClientRect();r.resize={before:[Math.round(b0.width),Math.round(b0.height)],after:[Math.round(b1.width),Math.round(b1.height)],saved:[settings.noteW,settings.noteH],rightKept:Math.round(b0.right)===Math.round(b1.right)};}await new Promise(x=>setTimeout(x,600));const sys=buildContext(conv.activeNodeId).system;r.side={inMap:sys.includes('### サイドチャット')&&sys.includes('「28日」'),hasSummary:Object.values(conv.notes).some(n=>n.summary),snippet:sys.slice(sys.indexOf('### サイドチャット'),sys.indexOf('### サイドチャット')+160)};r.threads=Object.values(conv.notes).map(n=>n.items.filter(i=>i.role==='user').map(i=>i.content.slice(-12)));
        const mk=document.querySelector('mark.note');mk.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
        r.note={q1:note.items[0].content,a1:note.items[1].content.slice(0,30),items:note.items.length,nodesUnchanged:conv.order.length===nodesBefore,marked:mk&&mk.textContent,popShown:document.querySelector('#notePop').classList.contains('on'),popQ:[...document.querySelectorAll('#notePop .nq')].map(e=>e.textContent.slice(0,44)),marks:document.querySelectorAll('mark.note').length,winOpen:!document.querySelector('#noteWin').hidden,inMessages:JSON.stringify(buildContext(conv.activeNodeId).messages).includes('辞書や辞典'),steps:(()=>{selStep('explain');const e=[...document.querySelectorAll('#selPop button:not([hidden])')].map(b=>b.textContent);selStep('ask');const k=[...document.querySelectorAll('#selPop button:not([hidden])')].map(b=>b.textContent);selStep('top');return {explain:e,ask:k,top:[...document.querySelectorAll('#selPop button:not([hidden])')].map(b=>b.textContent)};})()};
      }
      if(${process.env.SMOKE_FLICKER === '1'}){ // コードブロックの逐次表示中にスクロール位置が揺れないか
        const F=String.fromCharCode(96).repeat(3),NL=String.fromCharCode(10);
        const long='説明の前置きです。'+NL+NL+F+NL+Array.from({length:70},(_,i)=>(i+1)+'. 要件の説明をここに書きます。送り先、送る内容、呼ばれるタイミングを表にして保存する（行 '+(i+1)+'）').join(NL)+NL+F+NL+NL+'まとめです。';
        window.streamDummy=async function*(){for(let i=0;i<long.length;i+=3){await new Promise(r=>setTimeout(r,6));yield {text:long.slice(i,i+3)};}};
        const m=document.querySelector('#msgs');const run=async(label,prep)=>{const samples=[];const pr=send('コードブロックのテスト '+label);await new Promise(x=>setTimeout(x,1200));prep();
          const tick=setInterval(()=>samples.push(m.scrollTop),20);await pr;clearInterval(tick);
          let rev=0,drop=0;for(let i=2;i<samples.length;i++){const d1=samples[i-1]-samples[i-2],d2=samples[i]-samples[i-1];if(d1>0&&d2<0||d1<0&&d2>0)rev++;if(Math.abs(d2)>30)drop++;}
          return {samples:samples.length,reversals:rev,bigJumps:drop,uniq:[...new Set(samples)].length};};
        r.flicker={follow:await run('A',()=>{}),stopped:await run('B',()=>{m.dispatchEvent(new WheelEvent('wheel',{deltaY:-60}));m.scrollTop-=200;}),anchored:await run('C',()=>{conv._anchor=conv.activeNodeId;updateTailSpace();m.dispatchEvent(new WheelEvent('wheel',{deltaY:-60}));m.scrollTop-=200;})};
      }
      if(${process.env.SMOKE_COPY === '1'}){gotoBranch('main');await new Promise(x=>setTimeout(x,300));const F=String.fromCharCode(96).repeat(3),NL=String.fromCharCode(10);window.streamDummy=async function*(){yield {text:'前置き'+NL+F+NL+'print(1)'+NL+'print(2)'+NL+F+NL+'後書き'};};await send('コピーのテスト');await new Promise(x=>setTimeout(x,400));const el=document.getElementById('n-'+conv.activeNodeId);let clip='';navigator.clipboard.writeText=async t=>{clip=t;};el.querySelector('[data-copycode]').click();await new Promise(x=>setTimeout(x,100));const c1=clip;el.querySelector('[data-copyall]').click();await new Promise(x=>setTimeout(x,100));r.copy={code:c1,all:clip.slice(0,20),order:[...el.querySelectorAll('.tools button')].map(b=>b.textContent).join(' ')};}
      if(${process.env.SMOKE_TPL === '1'}){ // テンプレートとアジェンダ
        applyTemplate(TEMPLATES.find(t=>t.id==='paper'));await new Promise(x=>setTimeout(x,300));
        const tabs=[...document.querySelectorAll('#branchBar .chip')].map(c=>c.textContent.trim());
        const me=Object.values(conv.branches).find(b=>b.name==='Methods');gotoBranch(me.id);await new Promise(x=>setTimeout(x,300));
        document.querySelector('#branchBar .chip[data-b="main"]').click();await new Promise(x=>setTimeout(x,200));r.tabMain={dialogOpen:document.querySelector('#qDlg').open,sendTo:B(effectiveBranchForSend()).name};gotoBranch(me.id);await new Promise(x=>setTimeout(x,200));
        const sendTo=effectiveBranchForSend();const sys0=buildContext(conv.activeNodeId,{branchId:sendTo}).system;
        await send('対象と期間を決めたい',{branchId:effectiveBranchForSend(),parentId:conv.activeNodeId});await new Promise(x=>setTimeout(x,900));
        const ag=conv.agenda;const inM=branchNodes(me.id).length;
        document.querySelector('#agNew').value='手で足した項目';document.querySelector('#agAdd').click();await new Promise(x=>setTimeout(x,100));
        const sys=buildContext(conv.activeNodeId).system;
        r.tpl={tabs,sendTo:B(sendTo).name,methodsMsgs:inM,roleInSys:sys0.includes('この枝の役割')&&sys0.includes('Methods だけ'),mainInSys:sys0.includes('テンプレート'),agendaOpen:ag.items.filter(x=>x.status==='open').map(x=>x.text),agendaDone:ag.items.filter(x=>x.status==='done').map(x=>x.text),agendaInSys:sys.includes('## アジェンダ')&&sys.includes('手で足した項目'),panelRows:document.querySelectorAll('#agenda .ag').length,panelVisible:getComputedStyle(document.querySelector('#agenda')).display!=='none',title:conv.title};
      }
      if(${process.env.SMOKE_FIG === '1'}){ // Figure: チャットの figure ブロック → 描画 → 編集 → 書き戻し、プレビューの要素選択
        gotoBranch('main');await new Promise(x=>setTimeout(x,200));
        const TB=String.fromCharCode(9),NL2=String.fromCharCode(10),F=String.fromCharCode(96).repeat(3);
        const spec={title:'Tumor volume',kind:'column',type:'scatter',err:'SD',compare:'all',ytitle:'Tumor volume (mm3)',data:['Control'+TB+'Low'+TB+'High','12.1'+TB+'15.4'+TB+'19.2','11.8'+TB+'16.0'+TB+'18.7','12.6'+TB+'14.9'+TB+'20.1','13.0'+TB+'15.8'+TB+'19.6','12.3'+TB+'16.3'+TB+'18.9'].join(NL2)};
        window.streamDummy=async function*(){const t='図を作りました。'+NL2+NL2+F+'figure'+NL2+JSON.stringify(spec)+NL2+F+NL2+'以上です。';for(let i=0;i<t.length;i+=7){await new Promise(r=>setTimeout(r,5));yield {text:t.slice(i,i+7)};}};
        await send('腫瘍体積の図を作って',{branchId:effectiveBranchForSend(),parentId:conv.activeNodeId});await new Promise(x=>setTimeout(x,500));
        const el=document.getElementById('n-'+conv.activeNodeId);const fb=el.querySelector('.figblock');
        r.fig={rendered:!!(fb&&fb.querySelector('svg')),node:fb&&fb.dataset.fignode===conv.activeNodeId,brackets:fb?(fb.innerHTML.match(/<polyline/g)||[]).length:0,promptInSys:buildContext(conv.activeNodeId).system.includes('figure ブロック')};
        fb.querySelector('[data-figedit]').click();await new Promise(x=>setTimeout(x,300));
        r.fig.opened=document.querySelector('#figDlg').open;r.fig.updateBtn=document.querySelector('#figUpdate').style.display!=='none';r.fig.titleLoaded=document.querySelector('#figTitle').value;
        const g1=document.querySelector('#figPreview [data-sel="series:1"]');r.fig.hasSeries=!!g1;r.fig.selsInPreview=[...document.querySelectorAll('#figPreview [data-sel]')].map(e=>e.dataset.sel);if(g1)g1.dispatchEvent(new MouseEvent('click',{bubbles:true}));await new Promise(x=>setTimeout(x,100));
        r.fig.sel=figState.sel;r.fig.inspector=document.querySelector('#figInspect h4').textContent;const col=document.querySelector('#figInspect [data-ik="series.color"]');col.value='#008000';col.dispatchEvent(new Event('change'));const sy=document.querySelector('#figInspect [data-ik="series.symbol"]');sy.value='square';sy.dispatchEvent(new Event('change'));await new Promise(x=>setTimeout(x,100));
        r.fig.seriesChanged=figState.svg.includes('#008000')&&figState.svg.includes('<rect')&&figState.opts.series[1].symbol==='square';
        document.querySelector('#figUpdate').click();await new Promise(x=>setTimeout(x,300));const n=N(conv.activeNodeId);r.fig.writtenBack=n.content.includes('"symbol":"square"')&&n.content.includes('#008000');r.fig.rerendered=!!document.getElementById('n-'+n.id).querySelector('.figblock rect');
        fb&&0;figOpenFromBlock(document.getElementById('n-'+n.id).querySelector('.figblock'));await new Promise(x=>setTimeout(x,300));
        // ツールメニュー: grouped（棒に点・群内比較・凡例下・枠・回転）と undo
        figOpen({text:['Cond'+TB+'A'+TB+'A'+TB+'A'+TB+'B'+TB+'B'+TB+'B'+TB+'C'+TB+'C'+TB+'C','Condition 1'+TB+'38'+TB+'40'+TB+'36'+TB+'95'+TB+'92'+TB+'97'+TB+'80'+TB+'70'+TB+'90','Condition 2'+TB+'25'+TB+'27'+TB+'22'+TB+'30'+TB+'32'+TB+'28'+TB+'45'+TB+'40'+TB+'50'].join(NL2),kind:'grouped',type:'grouped-bar',cmp:'all',opts:{errType:'SD',yTitle:'Response',barDots:true,legendPos:'bottom',barEdge:'black',frame:'L',xRot:0}});await new Promise(x=>setTimeout(x,300));
        const tb=document.querySelector('#figToolbar');r.fig.tools=[...tb.querySelectorAll('.ftm > button')].map(b=>b.textContent.trim());
        tb.querySelector('[data-ftm="axes"] > button').click();await new Promise(x=>setTimeout(x,100));const fr=document.querySelector('#ftp-axes [data-tk="frame"]');r.fig.axesPanelItems=document.querySelectorAll('#ftp-axes [data-tk]').length;fr.value='box';fr.dispatchEvent(new Event('change'));await new Promise(x=>setTimeout(x,500));
        r.fig.grouped={brackets:(figState.svg.match(/<polyline/g)||[]).length,dots:(figState.svg.match(/<circle/g)||[]).length,legendBottom:figState.svg.includes('Group')||/Cond/.test(figState.svg),box:(figState.svg.match(/<rect /g)||[]).length,pairs:figState.spec.compare.pairs.length};
        const before=figState.opts.frame;figDoUndo();await new Promise(x=>setTimeout(x,100));r.fig.undo={before,after:figState.opts.frame};
      }
      if(${process.env.SMOKE_FIG2 === '1'}){ // Figure P2: 生存・ROC・ヒートマップ・フォレスト・ウォーターフォール・回帰・用量反応をチャットのブロックと作成画面で描く
        gotoBranch('main');await new Promise(x=>setTimeout(x,200));
        const TB=String.fromCharCode(9),NL2=String.fromCharCode(10),F=String.fromCharCode(96).repeat(3);
        const km={title:'OS',kind:'survival',type:'km',xtitle:'Months',data:['Time'+TB+'Event'+TB+'Group','3'+TB+'1'+TB+'A','5'+TB+'1'+TB+'A','6'+TB+'0'+TB+'A','8'+TB+'1'+TB+'A','9'+TB+'1'+TB+'A','12'+TB+'1'+TB+'A','7'+TB+'1'+TB+'B','10'+TB+'0'+TB+'B','13'+TB+'1'+TB+'B','16'+TB+'0'+TB+'B','19'+TB+'1'+TB+'B','22'+TB+'0'+TB+'B'].join(NL2)};
        window.streamDummy=async function*(){const t='生存曲線です。'+NL2+NL2+F+'figure'+NL2+JSON.stringify(km)+NL2+F+NL2;for(let i=0;i<t.length;i+=9){await new Promise(r=>setTimeout(r,4));yield {text:t.slice(i,i+9)};}};
        await send('生存曲線を作って',{branchId:effectiveBranchForSend(),parentId:conv.activeNodeId});await new Promise(x=>setTimeout(x,500));
        const fb=document.getElementById('n-'+conv.activeNodeId).querySelector('.figblock');
        r.fig2={kmBlock:!!(fb&&fb.querySelector('svg')),kmRisk:!!(fb&&fb.innerHTML.includes('Number at risk')),kmLogrank:!!(fb&&fb.innerHTML.includes('Log-rank')),promptHasSurvival:buildContext(conv.activeNodeId).system.includes('kind "survival"')};
        fb.querySelector('[data-figedit]').click();await new Promise(x=>setTimeout(x,300));
        r.fig2.kindSel=document.querySelector('#figKind').value;r.fig2.typeOpts=[...document.querySelectorAll('#figType option')].map(o=>o.value);r.fig2.stats=document.querySelector('#figStats').textContent.slice(0,80);r.fig2.cmpHidden=document.querySelector('#figCmpRow').style.display==='none';
        const tb=document.querySelector('#figToolbar');tb.querySelector('[data-ftm="kind"] > button').click();await new Promise(x=>setTimeout(x,100));r.fig2.kindMenu=[...document.querySelectorAll('#ftp-kind [data-tk]')].map(e=>e.dataset.tk);
        const ci=document.querySelector('#ftp-kind [data-tk="survCI"]');ci.checked=true;ci.dispatchEvent(new Event('change'));await new Promise(x=>setTimeout(x,100));r.fig2.ciBand=(figState.svg.match(/fill-opacity="0.15"/g)||[]).length;
        document.body.click();document.querySelector('#figUpdate').click();await new Promise(x=>setTimeout(x,300));r.fig2.writtenBack=N(conv.activeNodeId).content.includes('"survCI":true');
        const specs={roc:{kind:'roc',type:'roc',data:['M'+TB+'Class',...Array.from({length:20},(_,i)=>(i<8?6+i%4:3+i%5)+TB+(i<8?1:0))].join(NL2)},hm:{kind:'heatmap',type:'heatmap',data:['G'+TB+'a'+TB+'b'+TB+'c','g1'+TB+'1'+TB+'2'+TB+'3','g2'+TB+'3'+TB+'2'+TB+'1','g3'+TB+'2'+TB+'2'+TB+'2'].join(NL2),style:{hmCluster:'rows',hmValues:true}},forest:{kind:'forest',type:'forest',data:['Study'+TB+'HR'+TB+'Lower'+TB+'Upper','S1'+TB+'0.7'+TB+'0.5'+TB+'0.9','S2'+TB+'0.8'+TB+'0.6'+TB+'1.1','Overall'+TB+'0.75'+TB+'0.6'+TB+'0.9'].join(NL2)},wf:{kind:'waterfall',type:'waterfall',data:['P'+TB+'Change'+TB+'Resp','p1'+TB+'30'+TB+'PD','p2'+TB+'-10'+TB+'SD','p3'+TB+'-45'+TB+'PR'].join(NL2)},reg:{kind:'xy',type:'xy-regression',data:['X'+TB+'Y','1'+TB+'2','2'+TB+'4.1','3'+TB+'5.9','4'+TB+'8.2'].join(NL2)},dose:{kind:'xy',type:'xy-dose',data:['C'+TB+'Y','1e-9'+TB+'99','1e-8'+TB+'97','1e-7'+TB+'85','1e-6'+TB+'45','1e-5'+TB+'10','1e-4'+TB+'5'].join(NL2)},ba:{kind:'column',type:'before-after',compare:'all',data:['Pre'+TB+'Post','1'+TB+'3','2'+TB+'4','1.5'+TB+'3.8'].join(NL2)},stack:{kind:'grouped',type:'stacked-100',data:['C'+TB+'A'+TB+'B','c1'+TB+'1'+TB+'3','c2'+TB+'2'+TB+'2'].join(NL2)}};
        r.fig2.render={};for(const [k,sp] of Object.entries(specs)){let ok=false,err='';try{const x=figRenderSpec(sp);ok=!!(x&&x.svg&&x.svg.length>500);}catch(e){err=e.message;}r.fig2.render[k]=err||ok;}
        r.fig2.autoKind={roc:figAutoKind(figParseTable(specs.roc.data)),forest:figAutoKind(figParseTable(specs.forest.data)),km:figAutoKind(figParseTable(km.data))};
        r.fig2.kindOptions=[...document.querySelectorAll('#figKind option')].map(o=>o.value);
      }
      if(${process.env.SMOKE_FIG3 === '1'}){ // Figure P3: 推定プロット・PCA・スイマーなどをチャットのブロックと作成画面で描く
        gotoBranch('main');await new Promise(x=>setTimeout(x,200));
        const TB=String.fromCharCode(9),NL2=String.fromCharCode(10),F=String.fromCharCode(96).repeat(3);
        const sw={title:'Swimmer',kind:'swimmer',type:'swimmer',data:['Patient'+TB+'Duration'+TB+'Response'+TB+'Ongoing'+TB+'Progression','P1'+TB+'12'+TB+'PR'+TB+'1'+TB+'','P2'+TB+'8'+TB+'PD'+TB+'0'+TB+'8','P3'+TB+'15'+TB+'CR'+TB+'1'+TB+'','P4'+TB+'5'+TB+'SD'+TB+'0'+TB+'5'].join(NL2)};
        window.streamDummy=async function*(){const t='スイマープロットです。'+NL2+NL2+F+'figure'+NL2+JSON.stringify(sw)+NL2+F+NL2;for(let i=0;i<t.length;i+=9){await new Promise(r=>setTimeout(r,4));yield {text:t.slice(i,i+9)};}};
        await send('スイマープロットを作って',{branchId:effectiveBranchForSend(),parentId:conv.activeNodeId});await new Promise(x=>setTimeout(x,500));
        const fb=document.getElementById('n-'+conv.activeNodeId).querySelector('.figblock');
        r.fig3={swBlock:!!(fb&&fb.querySelector('svg')),swLegend:!!(fb&&fb.innerHTML.includes('Ongoing')),promptHasSwimmer:buildContext(conv.activeNodeId).system.includes('kind "swimmer"')};
        fb.querySelector('[data-figedit]').click();await new Promise(x=>setTimeout(x,300));
        r.fig3.kindSel=document.querySelector('#figKind').value;r.fig3.stats=document.querySelector('#figStats').textContent.slice(0,60);
        const tb=document.querySelector('#figToolbar');tb.querySelector('[data-ftm="kind"] > button').click();await new Promise(x=>setTimeout(x,100));r.fig3.kindMenu=[...document.querySelectorAll('#ftp-kind [data-tk]')].map(e=>e.dataset.tk);
        const so=document.querySelector('#ftp-kind [data-tk="swSort"]');so.value='group';so.dispatchEvent(new Event('change'));await new Promise(x=>setTimeout(x,100));
        document.body.click();document.querySelector('#figUpdate').click();await new Promise(x=>setTimeout(x,300));r.fig3.writtenBack=N(conv.activeNodeId).content.includes('"swSort":"group"');
        const pcaData=['S'+TB+'Group'+TB+'a'+TB+'b'+TB+'c',...Array.from({length:10},(_,i)=>'s'+i+TB+(i<5?'X':'Y')+TB+(i+(i%3))+TB+(10-i)+TB+((i*7)%5))].join(NL2);
        const specs={est:{kind:'column',type:'estimation',data:['A'+TB+'B','1'+TB+'3','2'+TB+'4','1.5'+TB+'3.8','2.2'+TB+'4.4'].join(NL2)},qq:{kind:'column',type:'qq',data:['A','1','2','3','4','5','6'].join(NL2)},bland:{kind:'column',type:'bland-altman',data:['A'+TB+'B','1'+TB+'1.2','2'+TB+'2.1','3'+TB+'2.8','4'+TB+'4.3'].join(NL2)},gl:{kind:'grouped',type:'grouped-line',data:['C'+TB+'A'+TB+'B','c1'+TB+'1'+TB+'3','c2'+TB+'2'+TB+'2'].join(NL2)},band:{kind:'xy',type:'xy-band',data:['X'+TB+'Y'+TB+'Y','1'+TB+'2'+TB+'2.5','2'+TB+'4'+TB+'4.5','3'+TB+'5'+TB+'6'].join(NL2)},
          bub:{kind:'multi',type:'bubble',data:['Id'+TB+'X'+TB+'Y'+TB+'Size'+TB+'G','a'+TB+'1'+TB+'2'+TB+'10'+TB+'p','b'+TB+'2'+TB+'3'+TB+'40'+TB+'q','c'+TB+'3'+TB+'1'+TB+'20'+TB+'p'].join(NL2)},pcaS:{kind:'multi',type:'pca-scores',data:pcaData,style:{pcaEllipse:true}},pcaB:{kind:'multi',type:'pca-biplot',data:pcaData},pcaSc:{kind:'multi',type:'pca-scree',data:pcaData},pcaV:{kind:'multi',type:'pca-variance',data:pcaData},
          sup:{kind:'nested',type:'superplot',compare:'all',data:['Group'+TB+'Mouse'+TB+'Value','A'+TB+'m1'+TB+'1','A'+TB+'m1'+TB+'1.2','A'+TB+'m2'+TB+'1.5','A'+TB+'m2'+TB+'1.4','B'+TB+'m3'+TB+'3','B'+TB+'m3'+TB+'3.2','B'+TB+'m4'+TB+'3.5','B'+TB+'m4'+TB+'3.4'].join(NL2)},
          sp:{kind:'spider',type:'spider',data:['Patient'+TB+'Week'+TB+'Change','p1'+TB+'0'+TB+'0','p1'+TB+'6'+TB+'-20','p1'+TB+'12'+TB+'-35','p2'+TB+'0'+TB+'0','p2'+TB+'6'+TB+'10','p2'+TB+'12'+TB+'25'].join(NL2)},cm:{kind:'heatmap',type:'confusion',data:['A'+TB+'x'+TB+'y','x'+TB+'10'+TB+'2','y'+TB+'3'+TB+'12'].join(NL2),style:{cmNorm:'row'}},
          vol:{kind:'feature',type:'volcano',data:['Gene'+TB+'log2FC'+TB+'pvalue',...Array.from({length:40},(_,i)=>'g'+i+TB+((i%7)-3)+TB+(i<10?0.001:0.3))].join(NL2)},ma:{kind:'feature',type:'ma',data:['Gene'+TB+'baseMean'+TB+'log2FoldChange'+TB+'padj','g1'+TB+'100'+TB+'2'+TB+'0.01','g2'+TB+'10'+TB+'-1'+TB+'0.5','g3'+TB+'1000'+TB+'0.2'+TB+'0.9'].join(NL2)},imp:{kind:'importance',type:'importance',data:['Feature'+TB+'Importance','f1'+TB+'0.3','f2'+TB+'0.1','f3'+TB+'0.5'].join(NL2)}};
        r.fig3.render={};for(const [k,sp] of Object.entries(specs)){let ok=false,err='';try{const x=figRenderSpec(sp);ok=!!(x&&x.svg&&x.svg.length>500);}catch(e){err=e.message;}r.fig3.render[k]=err||ok;}
        r.fig3.autoKind={sw:figAutoKind(figParseTable(sw.data)),sp:figAutoKind(figParseTable(specs.sp.data)),vol:figAutoKind(figParseTable(specs.vol.data)),sup:figAutoKind(figParseTable(specs.sup.data)),imp:figAutoKind(figParseTable(specs.imp.data))};
        r.fig3.kindOptions=[...document.querySelectorAll('#figKind option')].map(o=>o.value).filter(v=>['multi','nested','swimmer','spider','feature','importance'].includes(v));
      }
      if(${process.env.SMOKE_FIG4 === '1'}){ // Figure レイアウト: 複数パネルのブロック→パネル編集→書き戻し→設定変更→PNG
        gotoBranch('main');await new Promise(x=>setTimeout(x,200));
        const TB=String.fromCharCode(9),NL2=String.fromCharCode(10),F=String.fromCharCode(96).repeat(3);
        const A={title:'Tumor volume',kind:'column',type:'scatter',compare:'all',ytitle:'Volume',data:['Control'+TB+'Zolmin'+TB+'Combo','120'+TB+'80'+TB+'40','130'+TB+'85'+TB+'50','110'+TB+'70'+TB+'45','125'+TB+'90'+TB+'38'].join(NL2)};
        const B={title:'OS',kind:'survival',type:'km',xtitle:'Months',data:['Time'+TB+'Event'+TB+'Group','3'+TB+'1'+TB+'C','5'+TB+'1'+TB+'C','8'+TB+'1'+TB+'C','12'+TB+'0'+TB+'C','7'+TB+'1'+TB+'Z','10'+TB+'0'+TB+'Z','16'+TB+'1'+TB+'Z','22'+TB+'0'+TB+'Z'].join(NL2)};
        const C={title:'Dose',kind:'xy',type:'xy-dose',xtitle:'[Zolmin] (M)',ytitle:'Viability (%)',data:['C'+TB+'Y'+TB+'Y','1e-9'+TB+'99'+TB+'101','1e-8'+TB+'97'+TB+'95','1e-7'+TB+'85'+TB+'82','1e-6'+TB+'45'+TB+'50','1e-5'+TB+'10'+TB+'12','1e-4'+TB+'5'+TB+'4'].join(NL2)};
        const D={title:'Expression',kind:'heatmap',type:'heatmap',data:['Gene'+TB+'C1'+TB+'C2'+TB+'Z1'+TB+'Z2','MS4A1'+TB+'10'+TB+'11'+TB+'3'+TB+'2','SPIB'+TB+'2'+TB+'3'+TB+'9'+TB+'10','CD19'+TB+'8'+TB+'9'+TB+'5'+TB+'4'].join(NL2),style:{hmZ:true}};
        const lay={kind:'layout',cols:2,labels:'A',panels:[A,B,C,D]};
        window.streamDummy=async function*(){const t='4 枚をまとめました。'+NL2+NL2+F+'figure'+NL2+JSON.stringify(lay)+NL2+F+NL2;for(let i=0;i<t.length;i+=40){await new Promise(r=>setTimeout(r,2));yield {text:t.slice(i,i+40)};}};
        await send('4 枚を 1 つの Figure に',{branchId:effectiveBranchForSend(),parentId:conv.activeNodeId});await new Promise(x=>setTimeout(x,600));
        const fb=document.getElementById('n-'+conv.activeNodeId).querySelector('.figblock');const nid=conv.activeNodeId;
        r.fig4={layoutBlock:!!(fb&&fb.classList.contains('layout')),panels:fb?fb.querySelectorAll('svg svg').length:0,labels:fb?[...fb.querySelectorAll('[data-label]')].map(t=>t.textContent).join(''):'',editBtns:fb?fb.querySelectorAll('[data-figedit]').length:0,promptHasLayout:buildContext(nid).system.includes('"kind":"layout"')};
        // 軸の位置揃え: 同じ列の 2 枚のプロット領域の左端（SVG 内の x0 + パネルの x）が一致する
        const sv=[...fb.querySelectorAll('svg svg')];const left=k=>+sv[k].getAttribute('x')+(+sv[k].querySelector('[data-sel="axes"] line').getAttribute('x1'));r.fig4.alignedLeft=Math.abs(left(0)-left(2))<0.01;
        fb.querySelectorAll('[data-figedit]')[1].click();await new Promise(x=>setTimeout(x,300));r.fig4.editKind=document.querySelector('#figKind').value;
        document.querySelector('#figTitle').value='OS (edited)';document.querySelector('#figTitle').dispatchEvent(new Event('input'));await new Promise(x=>setTimeout(x,200));document.querySelector('#figUpdate').click();await new Promise(x=>setTimeout(x,400));
        const j1=JSON.parse(figFindBlocks(N(nid).content)[0].json);r.fig4.panelEdited=j1.panels[1].title==='OS (edited)'&&j1.panels.length===4&&j1.kind==='layout';
        const fb2=document.getElementById('n-'+nid).querySelector('.figblock');const selCols=fb2.querySelector('[data-figlay="cols"]');selCols.value='3';selCols.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(x=>setTimeout(x,400));
        r.fig4.colsWritten=JSON.parse(figFindBlocks(N(nid).content)[0].json).cols===3;
        const fb3=document.getElementById('n-'+nid).querySelector('.figblock');const selPage=fb3.querySelector('[data-figlay="page"]');selPage.value='2col';selPage.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(x=>setTimeout(x,400));
        const fb4=document.getElementById('n-'+nid).querySelector('.figblock');const svg=fb4.querySelector('svg');r.fig4.pageWidthPt=+svg.getAttribute('width');r.fig4.hint=fb4.querySelector('.hint').textContent;
        const c=await figToPng(svg.outerHTML,+svg.getAttribute('width'),+svg.getAttribute('height'),200);r.fig4.pngPx=c.width+'x'+c.height;r.fig4.png=c.toDataURL('image/png');
        // 2 つの図を 1 枚にまとめるボタン
        window.streamDummy=async function*(){const t='2 枚です。'+NL2+F+'figure'+NL2+JSON.stringify(A)+NL2+F+NL2+'と'+NL2+F+'figure'+NL2+JSON.stringify(C)+NL2+F+NL2;yield {text:t};};
        await send('2 枚',{branchId:effectiveBranchForSend(),parentId:conv.activeNodeId});await new Promise(x=>setTimeout(x,500));
        const m2=document.getElementById('n-'+conv.activeNodeId);r.fig4.combineBtn=!!m2.querySelector('[data-figcombine]');m2.querySelector('[data-figcombine]').click();await new Promise(x=>setTimeout(x,500));
        const bl=figFindBlocks(N(conv.activeNodeId).content);r.fig4.combined=bl.length===1&&JSON.parse(bl[0].json).panels.length===2;
      }
      if(${process.env.SMOKE_FIG5 === '1'}){ // Figure 画像パネル: 画像の保存→グリッドのブロック→注釈のクリック→書き戻し→PNG（画像を埋め込み）→ブロット
        gotoBranch('main');await new Promise(x=>setTimeout(x,200));
        const NL2=String.fromCharCode(10),F=String.fromCharCode(96).repeat(3);
        const mk=(col,w,h)=>new Promise(res=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle=col;g.fillRect(0,0,w,h);g.fillStyle='#fff';g.beginPath();g.arc(w/2,h/2,w/5,0,6.28);g.fill();c.toBlob(b=>res(new File([b],'cell_'+col.slice(1)+'.png',{type:'image/png'})),'image/png');});
        const f1=await mk('#2030c0',400,300),f2=await mk('#20a020',400,300),f3=await mk('#808080',600,120);
        const m1=await figImgStore(f1),m2=await figImgStore(f2),m3=await figImgStore(f3);r.fig5={stored:[m1,m2,m3].every(m=>/^im/.test(m.id)&&m.w>0),meta:conv.imgs&&Object.keys(conv.imgs).length};
        r.fig5.fetchOk=(await fetch('/api/img/'+m1.id)).ok;
        const spec={kind:'image',type:'grid',cols:2,rowLabels:['Control'],colLabels:['DAPI','GFP'],colColors:['#4040FF','#00C000'],images:[{img:m1.id,label:'DAPI'},{img:m2.id,label:'GFP'}],scale:{umPerPx:0.5,len:20,unit:'µm',labelOn:'first'}};
        window.streamDummy=async function*(){yield {text:'画像パネルです。'+NL2+NL2+F+'figure'+NL2+JSON.stringify(spec)+NL2+F+NL2};};
        await send('画像パネルを作って',{branchId:effectiveBranchForSend(),parentId:conv.activeNodeId});await new Promise(x=>setTimeout(x,600));
        const nid=conv.activeNodeId;const fb=document.getElementById('n-'+nid).querySelector('.figblock');
        r.fig5.block=!!(fb&&fb.classList.contains('image'));r.fig5.images=fb.querySelectorAll('image').length;r.fig5.scalebar=fb.querySelectorAll('[data-scalebar]').length;r.fig5.labelText=fb.innerHTML.includes('20 µm');r.fig5.promptHasImage=buildContext(nid).system.includes('kind "image"');
        fb.querySelector('[data-figtool="arrow"]').click();const cb=fb.querySelector('[data-cellbox="1"]');const bx=cb.getBoundingClientRect();cb.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:bx.left+bx.width*0.3,clientY:bx.top+bx.height*0.6}));await new Promise(x=>setTimeout(x,400));
        const j1=JSON.parse(figFindBlocks(N(nid).content)[0].json);r.fig5.annot=j1.annots&&j1.annots.length===1&&j1.annots[0].cell===1&&Math.abs(j1.annots[0].x-0.3)<0.03&&j1.annots[0].t==='arrow';
        const fb2=document.getElementById('n-'+nid).querySelector('.figblock');r.fig5.annotDrawn=fb2.querySelectorAll('[data-annot]').length;
        const sc=fb2.querySelector('[data-figimg="cols"]');sc.value='1';sc.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(x=>setTimeout(x,400));r.fig5.colsWritten=JSON.parse(figFindBlocks(N(nid).content)[0].json).cols===1;
        const fb3=document.getElementById('n-'+nid).querySelector('.figblock');const svg=fb3.querySelector('svg');const c=await figToPng(svg.outerHTML,+svg.getAttribute('width'),+svg.getAttribute('height'),150);const g=c.getContext('2d');const px=g.getImageData(Math.round(c.width*0.5),Math.round(c.height*0.35),1,1).data;r.fig5.pngPx=c.width+'x'+c.height;r.fig5.pngHasImage=px[2]>150&&px[0]<100;r.fig5.png=c.toDataURL('image/png');
        const blot={kind:'image',type:'blot',lanes:['1','2','3','4'],conds:[{name:'Zolmin',vals:['−','+','−','+']}],groups:[{name:'Raji',from:0,to:1},{name:'BC-1',from:2,to:3}],bands:[{img:m3.id,name:'CD20',kda:'35'},{img:m3.id,name:'β-actin',kda:'42'}]};
        let rb=null,err='';try{rb=figRenderSpec(blot);}catch(e){err=e.message;}r.fig5.blot=err||!!(rb&&rb.blot&&rb.svg.includes('kDa')&&rb.svg.includes('Raji'));
        const lay=figRenderSpec({kind:'layout',cols:2,panels:[spec,blot]});r.fig5.inLayout=!!(lay&&lay.n===2&&lay.svg.includes('/api/img/'));const cl=await figToPng(lay.svg,lay.w,lay.h,150);r.fig5.png2=cl.toDataURL('image/png');
      }
      if(${process.env.SMOKE_FIG6 === '1'}){ // Figure 模式図: 6 種を描き、チャットのブロック→「{} 編集」で書き戻す
        gotoBranch('main');await new Promise(x=>setTimeout(x,200));
        const NL2=String.fromCharCode(10),F=String.fromCharCode(96).repeat(3);
        const specs={
          diagram:{kind:'schematic',type:'diagram',title:'SPIB → CD20 の仮説',dir:'LR',nodes:[{id:'z',text:'Zolmin',shape:'icon',icon:'drug'},{id:'s',text:'SPIB',shape:'round',fill:'#DCE9F7'},{id:'m',text:'MS4A1'+NL2+'(CD20)',shape:'rect'},{id:'c',text:'B 細胞',shape:'icon',icon:'bcell'},{id:'r',text:'Rituximab'+NL2+'感受性',shape:'ellipse',fill:'#FDE7C8'},{id:'ab',text:'抗 CD20 抗体',shape:'icon',icon:'antibody'}],edges:[{from:'z',to:'s',type:'arrow',label:'誘導'},{from:'s',to:'m',type:'inhibit',label:'転写抑制'},{from:'m',to:'c',type:'arrow'},{from:'c',to:'r',type:'arrow'},{from:'ab',to:'r',type:'arrow',dash:true}],groups:[{text:'核内',nodes:['s','m']}]},
          pedigree:{kind:'schematic',type:'pedigree',title:'家系図',members:[{id:'I-1',sex:'M',deceased:true,label:'I-1'},{id:'I-2',sex:'F',carrier:true,label:'I-2'},{id:'II-1',sex:'F',affected:true,proband:true,label:'II-1',note:'45y'},{id:'II-2',sex:'M',label:'II-2'},{id:'II-3',sex:'M',label:'II-3'},{id:'II-4',sex:'F',carrier:true,label:'II-4'},{id:'III-1',sex:'U',label:'III-1'},{id:'III-2',sex:'F',affected:true,label:'III-2'}],unions:[{a:'I-1',b:'I-2',children:['II-1','II-3']},{a:'II-1',b:'II-2',children:['III-1']},{a:'II-3',b:'II-4',children:['III-2']}]},
          gene:{kind:'schematic',type:'gene',name:'MS4A1 (CD20)',length:297,unit:'aa',domains:[{name:'TM1',from:50,to:72},{name:'TM2',from:80,to:100},{name:'TM3',from:118,to:140},{name:'TM4',from:184,to:206}],variants:[{pos:66,label:'p.V66M',type:'missense',n:2},{pos:120,label:'p.R120*',type:'nonsense',n:4},{pos:172,label:'p.A172fs',type:'frameshift',n:1},{pos:230,label:'c.690+1G>A',type:'splice',n:3},{pos:236,label:'p.D236N',type:'missense',n:1}]},
          venn:{kind:'schematic',type:'venn',title:'DEG の重なり',sets:[{name:'Raji',n:320},{name:'BC-1',n:280},{name:'Daudi',n:150}],overlaps:{AB:90,AC:40,BC:35,ABC:20}},
          timeline:{kind:'schematic',type:'timeline',title:'投与スケジュール',unit:'day',items:[{t:0,label:'Zolmin 投与',icon:'syringe'},{t:7,label:'投与',icon:'syringe'},{t:14,label:'投与',icon:'syringe'},{t:3,label:'採血',pos:'below'},{t:21,label:'剖検',pos:'below'}],spans:[{from:0,to:21,label:'観察期間'},{from:0,to:14,label:'治療期間',fill:'#FF8000'}]},
          table:{kind:'schematic',type:'table',title:'Table 1. 患者背景',columns:['','Control (n = 24)','Zolmin (n = 25)','P'],rows:[['年齢, 中央値 (範囲)','62 (41–78)','60 (38–80)','0.71'],['男性, n (%)','14 (58.3)','13 (52.0)','0.66'],['病期'],['  I–II','9 (37.5)','10 (40.0)','0.86'],['  III–IV','15 (62.5)','15 (60.0)','']],note:'P: Mann–Whitney U または χ² 検定'}};
        try{
        r.fig6={render:{},png:{}};for(const [k,sp] of Object.entries(specs)){let x=null,err='';try{x=figRenderSpec(sp);}catch(e){err=e.message;}r.fig6.render[k]=err||!!(x&&x.schematic&&x.svg.length>300);if(x&&x.svg){const c=await figToPng(x.svg,x.w,x.h,150);r.fig6.png[k]=c.toDataURL('image/png');}}
        window.streamDummy=async function*(){yield {text:'模式図です。'+NL2+NL2+F+'figure'+NL2+JSON.stringify(specs.diagram)+NL2+F+NL2};};
        await send('模式図を作って',{branchId:effectiveBranchForSend(),parentId:conv.activeNodeId});await new Promise(x=>setTimeout(x,600));
        const nid=conv.activeNodeId;const fb=document.getElementById('n-'+nid).querySelector('.figblock');r.fig6.block=!!(fb&&fb.classList.contains('schematic'));r.fig6.nodes=fb.querySelectorAll('[data-node]').length;r.fig6.edges=fb.querySelectorAll('[data-edge]').length;r.fig6.promptHasSchematic=buildContext(nid).system.includes('kind "schematic"');
        fb.querySelector('[data-figjson]').click();await new Promise(x=>setTimeout(x,300));const dlg=document.querySelector('#figJsonDlg');r.fig6.dlgOpen=!!(dlg&&dlg.open);const ta=dlg.querySelector('#figJsonText');const jj=JSON.parse(ta.value);jj.nodes[1].text='SPIB (edited)';ta.value=JSON.stringify(jj);ta.dispatchEvent(new Event('input'));await new Promise(x=>setTimeout(x,200));r.fig6.preview=!!dlg.querySelector('#figJsonPrev svg');
        dlg.querySelector('#figJsonSave').click();await new Promise(x=>setTimeout(x,400));r.fig6.writtenBack=N(nid).content.includes('SPIB (edited)');r.fig6.inLayout=!!figRenderSpec({kind:'layout',cols:2,panels:[specs.gene,specs.venn]});
        }catch(e){r.fig6=Object.assign(r.fig6||{},{error:String(e&&e.stack||e).slice(0,600)});}
      }
      if(${process.env.SMOKE_TUT === '1'}){openTut(${Number(process.env.SMOKE_TUT_PAGE) || 1});await new Promise(x=>setTimeout(x,1500));r.tutBadges=[...document.querySelectorAll('#tutBody .badge')].map(b=>b.textContent);}
      return r;})()`);
    if (out.page && out.page.fig6 && out.page.fig6.png) { for (const [k, d] of Object.entries(out.page.fig6.png)) { const f = path.join(process.env.SMOKE_OUT || require('node:os').tmpdir(), 'branchat-fig6-' + k + '.png'); fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); out.page.fig6.png[k] = f; } }
    for (const k of ['fig4','fig5']) for (const kk of ['png','png2']) if (out.page && out.page[k] && out.page[k][kk]) { const f = path.join(process.env.SMOKE_OUT || require('node:os').tmpdir(), 'branchat-' + k + kk + '.png'); fs.writeFileSync(f, Buffer.from(out.page[k][kk].split(',')[1], 'base64')); out.page[k][kk] = f; }
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
