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
      if(${process.env.SMOKE_TUT === '1'}){openTut(${Number(process.env.SMOKE_TUT_PAGE) || 1});await new Promise(x=>setTimeout(x,1500));r.tutBadges=[...document.querySelectorAll('#tutBody .badge')].map(b=>b.textContent);}
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
