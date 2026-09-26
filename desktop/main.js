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
      if(${process.env.SMOKE_OVER === '1'}){gotoBranch('main');showOverview();await new Promise(x=>setTimeout(x,500));r.over={head:document.querySelector('.cardsHead h2').textContent,secs:[...document.querySelectorAll('.cardsSec')].map(e=>e.textContent)};}
      if(${process.env.SMOKE_OA === '1'}){ // ほかの LLM の API（OpenAI 互換）。模擬サーバー 127.0.0.1:18766 へ
        settings.provider='openai';settings.oaBase='http://127.0.0.1:18766/v1';settings.oaKey='mock-key';settings.oaModels='mock-large, mock-small';settings.oaSum='mock-small';saveSettings();refreshModelCatalog();
        const ms=await fetchOaModels(settings.oaBase,settings.oaKey);conv=newConversation('API確認');persist();await send('つながりますか');const n=N(conv.activeNodeId);await new Promise(x=>setTimeout(x,1500));
        settings.oaKey='wrong';await send('キーが違う場合');const n2=N(conv.activeNodeId);
        r.oa={models:ms,opts:MODEL_OPTS.map(o=>o.v),reply:n.content,usage:n.usage,model:n.model,summary:B('main').summary&&B('main').summary.topic,badKey:n2.content.slice(0,80)};settings.provider='dummy';
      }
      if(${process.env.SMOKE_TABS === '1'}){const kid=Object.values(conv.branches).find(b=>b.name==='副作用');gotoBranch(kid.id);await new Promise(x=>setTimeout(x,300));r.tabs=[...document.querySelectorAll('#branchBar .chip')].map(c=>c.textContent.trim()+(c.classList.contains('on')?' [ON]':''));}
      if(${process.env.SMOKE_VIEW === '1'}){const kid=Object.values(conv.branches).find(b=>b.name==='副作用');gotoBranch(kid.id);await new Promise(x=>setTimeout(x,300));
        r.view={shown:[...document.querySelectorAll('#msgs .msg')].map(e=>e.id.replace('n-','')).map(id=>N(id)?B(N(id).branchId).name+'#'+N(id).seq+'/'+N(id).role[0]:id),edge:getComputedStyle(document.querySelector('#focus')).getPropertyValue('--curbc').trim(),userMeta:document.querySelectorAll('#msgs .msg.user .meta').length,icons:[...document.querySelectorAll('#msgs .msg:not(.user) .tools button')].slice(0,3).map(b=>b.textContent+'|'+b.title.slice(0,12)),editOpacity:getComputedStyle(document.querySelector('.msg.user .tools')).opacity};}
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
