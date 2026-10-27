// BranCHAT Web 版（Cloudflare）: ログインした人ごとの保存先との同期・利用上の注意への同意・アカウントの操作・会話の版の履歴
// web/build.mjs が Web 版の index.html にだけ読み込む（デスクトップ版・手元のプレビューでは読み込まない）。サーバーは web/src/worker.js（/api/*）。
// 正本はこの端末（localStorage と IndexedDB）。変わった会話だけを 1.5 秒まとめて送り、起動時と画面に戻ったときに新しい方を取り込む（会話ごとに updatedAt の新しい方）。
// サーバーは上書きの前の版を残すので（版の履歴）、2 台で同じ会話を直しても、負けた方は履歴から開ける。API キーなどの秘密は送らない。
'use strict';

const CLOUD_TERMS_VER=1;
const CLOUD_OWNER_KEY='bc.cloudOwner';
// 端末をまたいで揃える設定（API キー・接続先のキー・Jev は送らない）
const CLOUD_SETTING_KEYS=['provider','model','effort','sumModel','web','budget','extra','judge','journals','figFav','figUnit','tiffZ','exp','oaBase','oaModels','oaSum'];
let cloudMe=null,cloudReady=false,cloudTimer=null,cloudFlushing=false,cloudLastPull=0,cloudState='';
const cloudDirty=new Set(),cloudRemoved=new Set(),cloudImgQueue=new Map();
let cloudKvDirty=new Set(),cloudKvTimer=null;

async function cloudApi(path,opts){opts=opts||{};const o=Object.assign({cache:'no-store',credentials:'same-origin',redirect:'manual'},opts);o.headers=Object.assign({'X-BranCHAT':'1'},opts.headers||{});
  let r;try{r=await fetch('/api/'+path,o);}catch(e){cloudSetState('offline');throw new Error('つながりません');}
  if(r.type==='opaqueredirect'||r.status===401||r.status===403){cloudAuthLost();throw new Error('ログインが切れました');} // Access のログイン画面へ飛ばされた
  if(!r.ok){let m='';try{m=(await r.json()).error||'';}catch(e){}throw new Error(m||('HTTP '+r.status));}
  return r;}
const cloudJson=async(path,opts)=>(await cloudApi(path,opts)).json();
function cloudPutJson(path,obj){return cloudApi(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});}

// 右上の小さな表示（保存済み・保存中・オフライン）
function cloudSetState(st){cloudState=st;let b=document.getElementById('cloudBadge');if(!b){const h=document.querySelector('header');const s=document.getElementById('settingsBtn');if(!h||!s)return;b=document.createElement('span');b.id='cloudBadge';b.className='cloudBadge ui';b.setAttribute('role','status');s.insertAdjacentElement('beforebegin',b);}
  const t={ok:['☁ 保存済み','クラウドに保存されています'],saving:['☁ 保存中…','クラウドに送っています'],offline:['☁ オフライン','つながっていません。この端末に保存し、つながったら送ります'],error:['☁ 保存できません','クラウドに送れませんでした。しばらくして自動でやり直します'],sync:['☁ 同期中…','クラウドから読み込んでいます']}[st]||['☁',''];
  b.textContent=t[0];b.title=t[1]+(cloudMe?`（${cloudMe.email}）`:'');b.dataset.state=st;}

function cloudAuthLost(){if(document.getElementById('cloudAuthDlg'))return;const d=document.createElement('dialog');d.id='cloudAuthDlg';d.innerHTML='<h2>ログインし直してください</h2><p>ログインの有効期限が切れました。この端末で書いた内容は消えていません。ページを読み込み直すとログイン画面が出ます。</p><div class="btns"><button class="primary" id="cloudAuthReload">読み込み直す</button></div>';document.body.appendChild(d);d.querySelector('#cloudAuthReload').onclick=()=>location.reload();d.showModal();cloudSetState('error');}

/* ---------- 利用上の注意（同意） ---------- */
function cloudTermsHTML(){return `<ul class="cloudTerms">
  <li>この Web 版は、作図とノートのための道具として、限られた人に提供しています。</li>
  <li><b>患者情報・個人情報・そのほかの秘匿情報は入力しないでください。</b></li>
  <li>入力したデータ（会話・ノート・図・画像）は、ログインしたアカウントごとに保存され、ほかの利用者からは見えません。ただし暗号化はしておらず、運営者はシステムの管理のために保存されたデータにアクセスできる立場にあります。</li>
  <li><b>データの内容と管理の責任は、各利用者にあります。</b>運営者は、データの保存・復旧・提供の継続を保証しません。大事なデータは「⚙ 設定」の「すべてを書き出す」で手元にも保存してください。</li>
  <li>AI との会話は、各自が設定に入れた API キーを使い、各自のブラウザから AI の提供元へ直接送られます。費用、送る内容、提供元の規約を守ることは各自の責任です。API キーはこのブラウザの中だけに保存され、サーバーには送られません。</li>
  <li>使うのをやめるときは「⚙ 設定」の「アカウントとデータを削除」で消せます。運営者は予告なく提供を止めたり、内容を変えたりすることがあります。</li></ul>`;}
function cloudConsent(){return new Promise(res=>{let d=document.getElementById('cloudTermsDlg');if(d)d.remove();d=document.createElement('dialog');d.id='cloudTermsDlg';
  d.innerHTML=`<h2>利用上の注意</h2><p class="hint">BranCHAT Web 版を使う前にお読みください。</p>${cloudTermsHTML()}<label class="sChk"><input type="checkbox" id="cloudTermsOk"> 上の内容を理解し、同意します</label><div class="btns"><button class="primary" id="cloudTermsGo" disabled>同意して始める</button></div>`;
  document.body.appendChild(d);d.addEventListener('cancel',e=>e.preventDefault()); // Esc で閉じない
  d.querySelector('#cloudTermsOk').onchange=e=>{d.querySelector('#cloudTermsGo').disabled=!e.target.checked;};
  d.querySelector('#cloudTermsGo').onclick=async()=>{try{await cloudJson('consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ver:CLOUD_TERMS_VER})});}catch(e){toast('同意を記録できませんでした: '+e.message);return;}d.close();d.remove();res();};
  d.showModal();});}
function cloudShowTerms(){const d=document.createElement('dialog');d.innerHTML=`<h2>利用上の注意</h2>${cloudTermsHTML()}<div class="btns"><button class="primary">閉じる</button></div>`;document.body.appendChild(d);d.querySelector('button').onclick=()=>{d.close();d.remove();};d.showModal();}

/* ---------- この端末のデータ ---------- */
async function cloudClearLocal(){try{for(const k of [CONVS_KEY,ACTIVE_KEY,LINKS_KEY,'bc.tutorialSeen'])localStorage.removeItem(k);for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith('fimg:'))localStorage.removeItem(k);}}catch(e){}
  try{await new Promise(res=>{const q=indexedDB.deleteDatabase('branchat-figimg');q.onsuccess=q.onerror=q.onblocked=()=>res();});}catch(e){}
  for(const k of Object.keys(FIG_IMG_DATA))delete FIG_IMG_DATA[k];
  try{settings.apiKey='';settings.oaKey='';settings.jevKey='';settings.jevCfToken='';saveSettings();}catch(e){}}
function cloudSettingsOut(){const o={};for(const k of CLOUD_SETTING_KEYS)if(settings[k]!==undefined)o[k]=settings[k];return o;}
function cloudSettingsIn(o){if(!o||typeof o!=='object')return;for(const k of CLOUD_SETTING_KEYS)if(o[k]!==undefined)settings[k]=o[k];if(!['api','openai'].includes(settings.provider))settings.provider='api';try{localStorage.setItem(SET_KEY,JSON.stringify(settings));}catch(e){}}

/* ---------- 起動時の同期 ---------- */
async function cloudStart(){cloudSetState('sync');
  try{cloudMe=await cloudJson('me');}catch(e){cloudSetState(cloudState==='offline'?'offline':'error');toast('クラウドにつながりません。この端末の中だけで続けます（'+e.message+'）');return;} // 未ログインのときは Access のログイン画面が先に出るので、ここに来るのは通信の失敗
  // 同じブラウザを別の人が使ったときは、前の人のデータ（と API キー）をこの端末から消してから読み込む
  const owner=(()=>{try{return localStorage.getItem(CLOUD_OWNER_KEY)||'';}catch(e){return '';}})();
  if(owner&&owner!==cloudMe.email){await cloudClearLocal();convs={};links={};conv=newConversation();convs[conv.id]=conv;toast('前に使っていた人のデータをこの端末から消しました');}
  try{localStorage.setItem(CLOUD_OWNER_KEY,cloudMe.email);}catch(e){}
  if((cloudMe.termsVer||0)<CLOUD_TERMS_VER)await cloudConsent();
  // 設定と知識マップの線
  try{const s=await cloudJson('kv/settings');if(s&&s.data)cloudSettingsIn(s.data);}catch(e){}
  try{const l=await cloudJson('kv/links');if(l&&l.data&&typeof links==='object'){for(const [k,v] of Object.entries(l.data))if(!links[k])links[k]=v;try{localStorage.setItem(LINKS_KEY,JSON.stringify(links));}catch(e){}}}catch(e){}
  await cloudPull(true);
  cloudReady=true;
  // 自分の設定の保存・線の保存も送るようにする
  const ss=saveSettings;saveSettings=function(){ss();cloudKvMark('settings');};
  const sl=saveLinks;saveLinks=function(){sl();cloudKvMark('links');};
  for(const [id,data] of cloudImgQueue)cloudUploadImg(id,data);cloudImgQueue.clear();
  cloudFlushSoon();cloudFetchMissingImgs();
  if(window.tutAfterCloud){window.tutAfterCloud=false;setTimeout(()=>openTut(0),300);}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-cloudLastPull>20000)cloudPull(false).catch(()=>{});else if(document.visibilityState==='hidden')cloudFlush();});
  window.addEventListener('online',()=>{cloudFlushSoon();});
  window.addEventListener('beforeunload',e=>{if(cloudDirty.size||cloudRemoved.size||cloudFlushing){cloudFlush();e.preventDefault();e.returnValue='';}});}
// サーバーの一覧と比べて、新しい方を取り込む・送る
async function cloudPull(first){const j=await cloudJson('convs');cloudLastPull=Date.now();const srv={};for(const c of j.convs||[])srv[c.id]=c;let got=0,del=0;
  for(const [id,m] of Object.entries(srv)){const loc=convs[id];
    if(m.deleted){if(loc&&(loc.updatedAt||0)<=m.updatedAt){delete convs[id];del++;}continue;}
    if(cloudDirty.has(id)&&loc)continue; // こちらで直している最中はこちらを優先（送ったときにサーバーが前の版を残す）
    if(!loc||(m.updatedAt||0)>(loc.updatedAt||0)){try{const c=await cloudJson('convs/'+encodeURIComponent(id));if(c&&c.id){c.updatedAt=m.updatedAt;convs[id]=c;got++;}}catch(e){}}
    else if((loc.updatedAt||0)>(m.updatedAt||0))cloudDirty.add(id);}
  for(const [id,c] of Object.entries(convs))if(!srv[id]&&c.order&&c.order.length){if(!c.updatedAt)c.updatedAt=Date.now();cloudDirty.add(id);} // まだ送っていない会話
  if(got||del){if(!convs[conv.id]||(first&&!(conv.order&&conv.order.length))){ /* 消えた会話、または起動時に空の会話を開いていたら、いちばん新しい会話へ */const rest=Object.values(convs).filter(c=>c.order&&c.order.length).sort((a,b)=>convLastTs(b)-convLastTs(a));conv=rest[0]||Object.values(convs)[0];if(!conv){conv=newConversation();convs[conv.id]=conv;}}
    else conv=convs[conv.id];
    try{localStorage.setItem(CONVS_KEY,JSON.stringify(convs));localStorage.setItem(ACTIVE_KEY,conv.id);}catch(e){}
    renderAll();if(!first)cloudFetchMissingImgs();if(got&&!first)toast(`ほかの端末で更新された会話 ${got} 件を読み込みました`);else if(got&&first&&Object.keys(srv).length)toast(`クラウドから ${got} 件の会話を読み込みました`);}
  cloudSetState(cloudDirty.size?'saving':'ok');}

/* ---------- 送る ---------- */
function cloudMarkDirty(id){if(!id||!convs[id])return;if(cloudReady){convs[id].updatedAt=Date.now();}cloudDirty.add(id);cloudRemoved.delete(id);if(cloudReady)cloudFlushSoon();}
function cloudMarkRemoved(id){if(!id)return;cloudDirty.delete(id);cloudRemoved.add(id);if(cloudReady)cloudFlushSoon();}
function cloudFlushSoon(){clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudFlush,1500);}
async function cloudFlush(){if(!cloudReady||cloudFlushing)return;clearTimeout(cloudTimer);if(!cloudDirty.size&&!cloudRemoved.size&&!cloudKvDirty.size){cloudSetState('ok');return;}
  cloudFlushing=true;cloudSetState('saving');let fail=false;
  for(const id of [...cloudRemoved]){try{await cloudApi('convs/'+encodeURIComponent(id),{method:'DELETE'});cloudRemoved.delete(id);}catch(e){fail=true;}}
  for(const id of [...cloudDirty]){const c=convs[id];if(!c){cloudDirty.delete(id);continue;}if(!c.order||!c.order.length){cloudDirty.delete(id);continue;} // 空の会話は送らない
    const at=c.updatedAt||Date.now();try{await cloudPutJson('convs/'+encodeURIComponent(id),{updatedAt:at,conv:c});if((convs[id]&&convs[id].updatedAt)===at)cloudDirty.delete(id);}catch(e){fail=true;if(/大きすぎ|容量/.test(e.message))toast('クラウドに保存できませんでした: '+e.message);}}
  for(const name of [...cloudKvDirty]){try{await cloudPutJson('kv/'+name,{data:name==='settings'?cloudSettingsOut():links});cloudKvDirty.delete(name);}catch(e){fail=true;}}
  cloudFlushing=false;
  if(fail){cloudSetState(navigator.onLine===false?'offline':'error');clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudFlush,15000);}
  else cloudSetState(cloudDirty.size||cloudRemoved.size?'saving':'ok');
  if(!fail&&(cloudDirty.size||cloudRemoved.size))cloudFlushSoon();}
function cloudKvMark(name){cloudKvDirty.add(name);if(cloudReady)cloudFlushSoon();}

/* ---------- 画像パネルの画像 ---------- */
function cloudDataUrlToBlob(u){const m=/^data:([^;,]+)(;base64)?,(.*)$/.exec(u||'');if(!m)return null;const bin=m[2]?atob(m[3]):decodeURIComponent(m[3]);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:m[1]});}
async function cloudUploadImg(id,data){const b=cloudDataUrlToBlob(data);if(!b)return;try{await cloudApi('img/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':b.type||'application/octet-stream'},body:b});}catch(e){cloudImgQueue.set(id,data);toast('画像をクラウドに保存できませんでした（'+e.message+'）。あとでやり直します');clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>{const q=[...cloudImgQueue];cloudImgQueue.clear();q.forEach(([i,d])=>cloudUploadImg(i,d));cloudFlush();},20000);}}
// 画像を保存するたびに（この端末に置いたあと）クラウドにも送る
if(document.querySelector('meta[name="branchat-mode"][content="cloud"]')&&typeof figImgPut==='function'){const base=figImgPut;figImgPut=async function(id,data,opt){await base(id,data);if(opt&&opt.local)return;if(cloudReady)cloudUploadImg(id,data);else cloudImgQueue.set(id,data);};}
// 会話にあって、この端末に無い画像をクラウドから取ってくる（今の会話を先に）
async function cloudFetchMissingImgs(){const order=[conv].concat(Object.values(convs).filter(c=>c!==conv));const want=[];for(const c of order)for(const id of Object.keys((c&&c.imgs)||{}))if(!FIG_IMG_DATA[id]&&!want.includes(id))want.push(id);
  let n=0;for(const id of want){try{const r=await cloudApi('img/'+encodeURIComponent(id));const blob=await r.blob();const data=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(blob);});await figImgPut(id,data,{local:true});n++;if(n%4===0)renderAll();}catch(e){}}
  if(n)renderAll();}

/* ---------- 設定の「アカウント」 ---------- */
function cloudFmtBytes(b){return b>=1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';}
async function cloudFillAccount(){const box=document.getElementById('sCloudBox');if(!box)return;const me=cloudMe;
  box.querySelector('#sCloudWho').textContent=me?me.email:'（つながっていません）';
  try{const u=await cloudJson('me');cloudMe=u;box.querySelector('#sCloudUse').textContent=`使用量 ${cloudFmtBytes(u.usage.bytes)} / ${cloudFmtBytes(u.usage.quota)}`;}catch(e){box.querySelector('#sCloudUse').textContent='';}}
function cloudSettingsUI(){const dlg=document.getElementById('settings');if(!dlg||document.getElementById('sCloudBox'))return;
  // デスクトップ版だけの項目（ブリッジ・ダミー・Jev・会話のファイル保存・書き出し先のフォルダ）を隠す
  dlg.querySelectorAll('#sProvider option[value="dummy"],#sProvider option[value="bridge"],#sJudge option[value="jev"]').forEach(o=>{o.hidden=true;o.disabled=true;});
  ['bridgeHint','sJevBox','sStoreBox'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  const row=dlg.querySelector('#sExpBox .sExpRow');if(row)row.style.display='none';const dir=dlg.querySelector('#sExpDirect');if(dir&&dir.closest('label'))dir.closest('label').style.display='none';
  const h=dlg.querySelector('h2');const box=document.createElement('div');box.id='sCloudBox';
  box.innerHTML=`<label>アカウント（Web 版）</label><div class="sCloudRow"><b id="sCloudWho"></b> <span class="hint" id="sCloudUse"></span></div>
    <div class="sCloudBtns"><button class="small" type="button" id="sCloudRevs">この会話の版の履歴</button><button class="small" type="button" id="sCloudExport">すべてを書き出す</button><button class="small" type="button" id="sCloudTerms">利用上の注意</button></div>
    <div class="sCloudBtns"><button class="small" type="button" id="sCloudLogout">ログアウト</button><button class="small" type="button" id="sCloudWipe">ログアウトしてこの端末のデータを消す</button><button class="small danger" type="button" id="sCloudDelete">アカウントとデータを削除</button></div>
    <div class="hint">会話・図・画像はこのアカウントの保存先に自動で保存されます。API キーはこのブラウザの中だけに保存され、送りません。</div>`;
  h.insertAdjacentElement('afterend',box);
  box.querySelector('#sCloudRevs').onclick=()=>{dlg.close();cloudRevsOpen(conv.id);};
  box.querySelector('#sCloudExport').onclick=cloudExportAll;
  box.querySelector('#sCloudTerms').onclick=cloudShowTerms;
  box.querySelector('#sCloudLogout').onclick=async()=>{await cloudFlush();location.href='/cdn-cgi/access/logout';};
  box.querySelector('#sCloudWipe').onclick=async()=>{await cloudFlush();if(cloudDirty.size||cloudRemoved.size){if(!(await askConfirm('まだクラウドに送れていない変更があります。消すとその変更は失われます。続けますか？','消してログアウト')))return;}
    if(!(await askConfirm('この端末（このブラウザ）に置いた会話・画像・API キーを消して、ログアウトします。クラウドのデータは残ります。','消してログアウト')))return;await cloudClearLocal();try{localStorage.removeItem(CLOUD_OWNER_KEY);}catch(e){}location.href='/cdn-cgi/access/logout';};
  box.querySelector('#sCloudDelete').onclick=cloudDeleteAccount;
  const kh=dlg.querySelector('#sKey');if(kh&&kh.previousElementSibling&&kh.previousElementSibling.tagName==='LABEL')kh.previousElementSibling.textContent='APIキー（Claude API。このブラウザの中だけに保存し、サーバーには送りません）';}
async function cloudExportAll(){toast('クラウドの会話と画像をそろえています…');try{await cloudPull(false);await cloudFetchMissingImgs();}catch(e){}if(typeof exportAllConvs==='function')exportAllConvs();}
async function cloudDeleteAccount(){if(!(await askConfirm('このアカウントの会話・図・画像・設定をクラウドからすべて削除し、この端末からも消します。元に戻せません。先に「すべてを書き出す」で手元に保存することをおすすめします。','削除へ進む')))return;
  const w=await figPrompt('確認のため「削除」と入力してください','');if(w==null||w.trim()!=='削除'){toast('削除をやめました');return;}
  try{await cloudApi('account',{method:'DELETE'});}catch(e){toast('削除できませんでした: '+e.message);return;}
  await cloudClearLocal();try{localStorage.removeItem(CLOUD_OWNER_KEY);}catch(e){}
  const d=document.createElement('dialog');d.innerHTML='<h2>削除しました</h2><p>アカウントとデータを削除しました。ログアウトします。</p><div class="btns"><button class="primary">OK</button></div>';document.body.appendChild(d);d.querySelector('button').onclick=()=>{location.href='/cdn-cgi/access/logout';};d.showModal();}

/* ---------- 会話の版の履歴 ---------- */
async function cloudRevsOpen(id){let d=document.getElementById('cloudRevsDlg');if(d)d.remove();d=document.createElement('dialog');d.id='cloudRevsDlg';const c=convs[id];
  d.innerHTML=`<h2>この会話の版の履歴</h2><p class="hint">「${figEsc((c&&c.title)||'')}」の、クラウドに残っている以前の版です（図の編集の前の状態も含みます）。開くと新しい会話として写しを作り、今の会話は変えません。</p><div id="cloudRevsList" class="cloudRevs">読み込んでいます…</div><div class="btns"><button id="cloudRevsClose">閉じる</button></div>`;
  document.body.appendChild(d);d.querySelector('#cloudRevsClose').onclick=()=>{d.close();d.remove();};d.showModal();
  let list=[];try{list=(await cloudJson('convs/'+encodeURIComponent(id)+'/revs')).revs||[];}catch(e){d.querySelector('#cloudRevsList').textContent='読み込めませんでした: '+e.message;return;}
  const box=d.querySelector('#cloudRevsList');if(!list.length){box.textContent='まだ以前の版はありません（10 分以上あけて保存すると版が残ります）。';return;}
  box.innerHTML=list.map(r=>`<div class="cloudRev"><span>${figEsc(new Date(r.savedAt).toLocaleString('ja-JP'))}</span><span class="hint">${figEsc(r.title||'')}・${cloudFmtBytes(r.size||0)}</span><button class="small" data-rev="${r.rev}">新しい会話として開く</button></div>`).join('');
  box.querySelectorAll('[data-rev]').forEach(b=>b.onclick=async()=>{try{const old=await cloudJson('convs/'+encodeURIComponent(id)+'/revs/'+b.dataset.rev);const nid=uid();old.id=nid;old.title=(old.title||'会話')+'（'+new Date(list.find(x=>String(x.rev)===b.dataset.rev).savedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' の版）';old.updatedAt=Date.now();convs[nid]=old;conv=old;persist();renderAll();cloudFetchMissingImgs();d.close();d.remove();toast('以前の版を新しい会話として開きました');}catch(e){toast('開けませんでした: '+e.message);}});}

/* ---------- Web 版の画面の調整 ---------- */
if(document.querySelector('meta[name="branchat-mode"][content="cloud"]')){
  const run=()=>{cloudSettingsUI();const sb=document.getElementById('settingsBtn');if(sb)sb.addEventListener('click',()=>{cloudSettingsUI();cloudFillAccount();});cloudSetState('sync');};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();}
