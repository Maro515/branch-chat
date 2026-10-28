// BranCHAT Figure 拡張（レイアウト）
// 複数の図を 1 枚の Figure に並べる。```figure の JSON が {"kind":"layout","cols":2,"labels":"A","page":"2col","panels":[図の指定,…]} のとき
// figRenderSpec から figRenderLayout が呼ばれる。各パネルは通常の図の指定（kind/type/data/style…）で、個別に ✎ で編集して書き戻せる。
// 隣り合う図は「プロット領域」（軸の内側）を揃える（列ごとに左の軸線、行ごとに上端を揃える。要件書 §10）。パネル記号は A, B, C…（または a, b, c）を自動採番。
// page（誌面幅）を指定すると全体を 1 段 89 mm／1.5 段 120 mm／2 段 183 mm に縮尺し、文字が 6 pt を下回れば警告する。
'use strict';

const FIG_PAGES={none:0,'1col':89,'1.5col':120,'2col':183}; // mm（Nature 系の代表値。投稿規定は誌ごとに確認）
const FIG_LAYOUT_DEF={cols:2,labels:'A',page:'none',gap:12,labelPt:14,align:true};
function figIsLayout(j){return !!(j&&(j.kind==='layout'||Array.isArray(j.panels)));}
// 配置（FIX-05）: spans[k]＝パネル k が横に占める列の数（大小混在）、insets＝[{panel:k,into:親の番号,x,y,w}]（親の中の割合の位置・幅に挿入図として重ねる。記号は付けない）。
// 隣り合う図は「プロット領域」を揃える（列ごとに左の軸線、行ごとに上端）。複数列にまたがるパネルは、最初の列の軸線に揃え、足りない幅は最後の列を広げる
function figRenderLayout(j){
  const specs=Array.isArray(j.panels)?j.panels:[];const n=specs.length;if(!n)return null;
  const panels=specs.map(p=>{if(!p||figIsLayout(p))return null;try{const r=figRenderSpec(p);return r&&r.svg?r:null;}catch(e){return null;}});
  const insets=(Array.isArray(j.insets)?j.insets:[]).filter(q=>q&&Number.isInteger(+q.panel)&&Number.isInteger(+q.into)&&+q.panel!==+q.into&&+q.panel>=0&&+q.panel<n&&+q.into>=0&&+q.into<n);const isIn=new Set(insets.map(q=>+q.panel));
  const flow=specs.map((_,k)=>k).filter(k=>!isIn.has(k));const nf=Math.max(1,flow.length);
  const cols=Math.max(1,Math.min(6,+j.cols||(nf<=1?1:nf<=4?2:3)));const spans=specs.map((_,k)=>Math.max(1,Math.min(cols,Math.round(+((j.spans||[])[k])||1))));
  const labels=j.labels==null?FIG_LAYOUT_DEF.labels:j.labels;const lfs=(+j.labelPt||FIG_LAYOUT_DEF.labelPt)*FIG_PT;const gap=(j.gap!=null&&isFinite(+j.gap)?+j.gap:FIG_LAYOUT_DEF.gap)*FIG_PT;const labelW=labels==='none'?0:lfs*1.3;const align=j.align!==false;
  const font=FIG_DEF.font;const fs=12*FIG_PT;const geo=panels.map(p=>p?{w:p.w,h:p.h,x0:p.plot?p.plot.x0:0,y0:p.plot?p.plot.y0:0}:{w:fs*12,h:fs*8,x0:0,y0:0});
  // 行と列に詰める（入りきらなければ次の行）
  const place={};let r=0,c=0;flow.forEach(k=>{const sp=spans[k];if(c+sp>cols){r++;c=0;}place[k]={r,c,sp};c+=sp;if(c>=cols){r++;c=0;}});const rows=Math.max(1,...flow.map(k=>place[k].r+1));
  const L=new Array(cols).fill(0),T=new Array(rows).fill(0);flow.forEach(k=>{const g=geo[k],P=place[k];if(align){L[P.c]=Math.max(L[P.c],g.x0);T[P.r]=Math.max(T[P.r],g.y0);}});
  const dx={},dy={};flow.forEach(k=>{const g=geo[k],P=place[k];dx[k]=align?L[P.c]-g.x0:0;dy[k]=align?T[P.r]-g.y0:0;});
  const W=new Array(cols).fill(0),H=new Array(rows).fill(0);flow.forEach(k=>{const g=geo[k],P=place[k];if(P.sp===1)W[P.c]=Math.max(W[P.c],dx[k]+g.w);H[P.r]=Math.max(H[P.r],dy[k]+g.h);});
  flow.forEach(k=>{const g=geo[k],P=place[k];if(P.sp===1)return;let avail=0;for(let q=P.c;q<P.c+P.sp;q++)avail+=W[q];avail+=(P.sp-1)*(gap+labelW);
    // グラフは、またいだ幅いっぱいに描き直す（高さはそのまま）。画像パネル・模式図などは元の大きさ
    const sp=specs[k];const chart=sp&&!['image','schematic','graphics','ga','layout'].includes(sp.kind)&&j.stretch!==false;
    if(chart&&avail-dx[k]>g.w+1){try{const ns=Object.assign({},sp,{style:Object.assign({},sp.style||{},{figW:+((avail-dx[k])/FIG_IN).toFixed(4),figH:+(g.h/FIG_IN).toFixed(4)})});const r2=figRenderSpec(ns);if(r2&&r2.svg){panels[k]=r2;geo[k]={w:r2.w,h:r2.h,x0:r2.plot?r2.plot.x0:0,y0:r2.plot?r2.plot.y0:0};dx[k]=align?Math.max(0,L[P.c]-geo[k].x0):0;dy[k]=align?Math.max(0,T[P.r]-geo[k].y0):0;H[P.r]=Math.max(H[P.r],dy[k]+geo[k].h);}}catch(e){}}
    const need=dx[k]+geo[k].w;if(need>avail)W[P.c+P.sp-1]+=need-avail;});
  const titleH=j.title?lfs*1.8:0;const cellX=[],cellY=[];let acc=0;for(let q=0;q<cols;q++){cellX.push(acc+labelW);acc+=labelW+W[q]+gap;}const totalW=acc-gap;acc=titleH;for(let q=0;q<rows;q++){cellY.push(acc);acc+=H[q]+gap;}const totalH=acc-gap;
  const box={};let body='';let li=0;
  flow.forEach(k=>{const p=panels[k],g=geo[k],P=place[k];const x=cellX[P.c]+dx[k],y=cellY[P.r]+dy[k];box[k]={x,y,w:g.w,h:g.h};
    if(p)body+=p.svg.replace(/^<svg[^>]*>/,`<svg x="${x}" y="${y}" width="${g.w}" height="${g.h}" viewBox="0 0 ${g.w} ${g.h}" data-panel="${k}">`);
    else body+=`<g data-panel="${k}"><rect x="${x}" y="${y}" width="${g.w}" height="${g.h}" fill="#fff" stroke="#bbb" stroke-width="${FIG_PT}" stroke-dasharray="${FIG_PT*4} ${FIG_PT*3}"/><text x="${x+g.w/2}" y="${y+g.h/2}" font-family="${font}" font-size="${fs}" text-anchor="middle" fill="#999">図を描けませんでした</text></g>`;
    if(labels!=='none'){const lab=labels==='a'?String.fromCharCode(97+li):String.fromCharCode(65+li);body+=`<text x="${cellX[P.c]-labelW+FIG_PT}" y="${cellY[P.r]+lfs*0.95}" font-family="${font}" font-size="${lfs}" font-weight="bold" text-anchor="start" data-label="${k}">${lab}</text>`;}li++;});
  // 挿入図: 親の箱の中の割合の位置に、親の幅の w 倍で縮めて重ねる（白い下地つき）
  insets.forEach(q=>{const k=+q.panel,par=box[+q.into],p=panels[k],g=geo[k];if(!par||!p)return;const wq=Math.max(0.1,Math.min(1,+q.w||0.4))*par.w;const sc=wq/g.w;const hq=g.h*sc;const x=par.x+Math.max(0,Math.min(1,+q.x||0))*par.w,y=par.y+Math.max(0,Math.min(1,+q.y||0))*par.h;
    body+=`<rect x="${x}" y="${y}" width="${wq}" height="${hq}" fill="#fff"/>`+p.svg.replace(/^<svg[^>]*>/,`<svg x="${x}" y="${y}" width="${wq}" height="${hq}" viewBox="0 0 ${g.w} ${g.h}" data-panel="${k}" data-inset="${+q.into}">`);box[k]={x,y,w:wq,h:hq,inset:true,scale:sc};});
  const title=j.title?`<text x="${totalW/2}" y="${lfs*1.1}" font-family="${font}" font-size="${lfs*0.9}" font-weight="bold" text-anchor="middle">${figEsc(j.title)}</text>`:'';
  const mm=FIG_PAGES[j.page]||(isFinite(+j.page)&&+j.page>0?+j.page:0);const scale=mm?mm/25.4*FIG_IN/totalW:1;const outW=totalW*scale,outH=totalH*scale; // SVG の単位は px（96/in）。300 dpi の PNG なら 183 mm → 2161 px
  const minPt=Math.min(...specs.map((p,k)=>(p&&p.style&&+p.style.fontPt||12)*(box[k]&&box[k].inset?box[k].scale:1)))*scale;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}"${mm?` data-mm="${mm}"`:''} viewBox="0 0 ${totalW} ${totalH}"><rect width="100%" height="100%" fill="#fff"/>${title}${body}</svg>`;
  return {svg,w:outW,h:outH,layout:true,n,cols,rows,scale,mm,minPt,missing:panels.filter(p=>!p).length,box,place,insets:insets.length};}

// レイアウト用のブロックの表示（figBlockHTML から）
// パネルの記号（挿入図には付けない）
function figLayoutLabels(j){const n=(j.panels||[]).length;const ins=new Set((j.insets||[]).map(q=>+q.panel));let li=0;return Array.from({length:n},(_,k)=>ins.has(k)?'挿入図':(j.labels==='a'?String.fromCharCode(97+li++):String.fromCharCode(65+li++)));}
function figLayoutBlockHTML(j,r,nodeId,index){const n=r.n;const L=figLayoutLabels(j);const lab=k=>L[k];
  const sel=(key,opts,cur)=>`<select class="small" data-figlay="${key}" data-tip="レイアウトの設定（回答に書き戻します）">${opts.map(([v,l])=>`<option value="${v}"${String(cur)===String(v)?' selected':''}>${l}</option>`).join('')}</select>`;
  const info=r.mm?`幅 ${r.mm} mm（${(r.scale*100).toFixed(0)}%、文字 ${r.minPt.toFixed(1)} pt${r.minPt<6?' — 6 pt 未満。パネルを減らすか列を減らしてください':''}。PNG 300 dpi は ${Math.round(r.w*300/96)} px 幅）`:`原寸 ${figSizeTxt(r.w,r.h)}`;
  return `<div class="figblock layout" data-fignode="${figEsc(nodeId||'')}" data-figidx="${index}">${r.svg}<div class="figbtns">${Array.from({length:n},(_,k)=>`<button class="small" data-figedit data-figpanel="${k}" data-tip="パネル ${lab(k)} を作成画面で編集する">✎ ${lab(k)}</button>`).join('')}<button class="small" data-figjson data-tip="指定（JSON）を直して回答に書き戻す">{}</button><button class="small" data-figpng data-tip="PNG（300 dpi）で保存">PNG</button><button class="small" data-figsvg data-tip="SVG で保存">SVG</button><button class="small" data-figcopy data-tip="画像をコピー">⧉</button>
  <span class="ui" style="margin-left:6px">列</span>${sel('cols',[[1,'1'],[2,'2'],[3,'3'],[4,'4']],r.cols)}<span class="ui">記号</span>${sel('labels',[['A','A B C'],['a','a b c'],['none','なし']],j.labels==null?'A':j.labels)}<span class="ui">誌面</span>${sel('page',[['none','原寸'],['1col','1 段 89 mm'],['1.5col','1.5 段 120 mm'],['2col','2 段 183 mm']],j.page||'none')}<span class="ui">軸を揃える</span><input type="checkbox" data-figlay="align"${j.align===false?'':' checked'}><button class="small" data-figarrange data-tip="パネルごとの幅（列の数）と、挿入図にするパネルを決める">配置…</button><span class="hint" style="margin-left:6px">${info}${r.missing?` ／ 描けないパネル ${r.missing}`:''}</span></div></div>`;}
// ブロックのセレクトからレイアウトの設定を書き戻す
function figLayoutSet(fb,key,val){const nid=fb.dataset.fignode,idx=+fb.dataset.figidx;const n=N(nid);if(!n)return;const b=figFindBlocks(n.content)[idx];if(!b)return;let j;try{j=JSON.parse(b.json);}catch(e){return;}if(!figIsLayout(j))return;
  if(key==='cols')j.cols=+val;else if(key==='align')j.align=!!val;else j[key]=val;
  n.content=n.content.slice(0,b.start)+'```figure\n'+JSON.stringify(j)+'\n```'+n.content.slice(b.end);persist();renderAll();}
// 配置の小窓（FIX-05）: パネルごとに横の列の数と、挿入図（親・位置・幅の割合）
function figLayoutArrange(fb){const nid=fb.dataset.fignode,idx=+fb.dataset.figidx;const nd=N(nid);if(!nd)return;const b=figFindBlocks(nd.content)[idx];if(!b)return;let j;try{j=JSON.parse(b.json);}catch(e){return;}if(!figIsLayout(j))return;
  const n=(j.panels||[]).length;const cols=Math.max(1,+j.cols||2);const L=figLayoutLabels(j);const insOf=k=>(j.insets||[]).find(q=>+q.panel===k)||null;const nameOf=k=>{const p=j.panels[k]||{};return figEsc(String(p.title||p.figureTag||(FIG_TYPES[p.kind]||[]).find(x=>x[0]===p.type)?.[1]||p.kind||'図').slice(0,24));};
  let d=document.getElementById('figArrDlg');if(d)d.remove();d=document.createElement('dialog');d.id='figArrDlg';
  d.innerHTML=`<h2>配置</h2><p class="hint">横に占める列の数（最大 ${cols}）と、挿入図にするパネルを決めます。挿入図は親のパネルの中に、左上からの位置（%）と幅（親の幅に対する %）で重ねます。記号は付きません。</p>
    <table class="figArr"><tr><th>パネル</th><th>中身</th><th>列の数</th><th>挿入図にする（親）</th><th>左 %</th><th>上 %</th><th>幅 %</th></tr>${Array.from({length:n},(_,k)=>{const q=insOf(k);return `<tr data-k="${k}"><td>${L[k]}</td><td>${nameOf(k)}</td><td><select data-arr="span" aria-label="列の数">${Array.from({length:cols},(_,c)=>`<option value="${c+1}"${(+((j.spans||[])[k])||1)===c+1?' selected':''}>${c+1}</option>`).join('')}</select></td><td><select data-arr="into" aria-label="挿入図の親"><option value="">（しない）</option>${Array.from({length:n},(_,m)=>m===k?'':`<option value="${m}"${q&&+q.into===m?' selected':''}>パネル ${m+1}</option>`).join('')}</select></td><td><input type="number" data-arr="x" min="0" max="95" step="1" value="${q?Math.round((+q.x||0)*100):60}" aria-label="左からの位置 %"></td><td><input type="number" data-arr="y" min="0" max="95" step="1" value="${q?Math.round((+q.y||0)*100):5}" aria-label="上からの位置 %"></td><td><input type="number" data-arr="w" min="10" max="100" step="1" value="${q?Math.round((+q.w||0.4)*100):40}" aria-label="幅 %"></td></tr>`;}).join('')}</table>
    <div class="btns"><button id="figArrCancel">閉じる</button><button class="primary" id="figArrOk">書き戻す</button></div>`;
  document.body.appendChild(d);d.querySelector('#figArrCancel').onclick=()=>{d.close();d.remove();};
  d.querySelector('#figArrOk').onclick=()=>{const spans=[],ins=[];d.querySelectorAll('tr[data-k]').forEach(tr=>{const k=+tr.dataset.k;const v=s=>tr.querySelector(`[data-arr="${s}"]`).value;spans[k]=+v('span')||1;if(v('into')!=='')ins.push({panel:k,into:+v('into'),x:Math.max(0,Math.min(95,+v('x')||0))/100,y:Math.max(0,Math.min(95,+v('y')||0))/100,w:Math.max(10,Math.min(100,+v('w')||40))/100});});
    const bad=ins.find(q=>ins.some(o=>o.panel===q.into));if(bad){toast('挿入図の中に挿入図は置けません（親は通常のパネルにしてください）');return;}
    if(spans.some(x=>x>1))j.spans=spans;else delete j.spans;if(ins.length)j.insets=ins;else delete j.insets;
    nd.content=nd.content.slice(0,b.start)+'```figure\n'+JSON.stringify(j)+'\n```'+nd.content.slice(b.end);persist();renderAll();d.close();d.remove();toast('配置を書き戻しました');};
  d.showModal();}
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('.figblock [data-figarrange]');if(t)figLayoutArrange(t.closest('.figblock'));});
// 同じ発言の複数の ```figure を 1 つのレイアウトにまとめる（最初のブロックの位置に置き、残りを消す）
function figCombineBlocks(nodeId){const n=N(nodeId);if(!n)return;const blocks=figFindBlocks(n.content);const specs=[];for(const b of blocks){try{const j=JSON.parse(b.json);if(figIsLayout(j))specs.push(...(j.panels||[]));else specs.push(j);}catch(e){}}
  if(specs.length<2){toast('まとめる図が 2 つ以上ありません');return;}
  const lay={kind:'layout',cols:specs.length<=4?2:3,labels:'A',page:'none',panels:specs};let out='',pos=0;blocks.forEach((b,i)=>{out+=n.content.slice(pos,b.start);if(i===0)out+='```figure\n'+JSON.stringify(lay)+'\n```';pos=b.end;});out+=n.content.slice(pos);
  n.content=out.replace(/\n{3,}/g,'\n\n');persist();renderAll();toast(`${specs.length} 枚の図を 1 つのレイアウトにまとめました`);}

FIG_PROMPT+=`
複数の図を 1 枚の Figure に並べるときは {"kind":"layout","title":"任意","cols":2,"labels":"A","page":"none|1col|2col","panels":[図の指定, 図の指定, …]} を 1 つの \`\`\`figure ブロックで出す（panels の各要素は通常の図の指定。パネル記号 A, B, C… は自動、隣の図と軸の位置が揃う）。大きさを混ぜるときは "spans":[2,1,1]（パネルごとに横に占める列の数）、挿入図は "insets":[{"panel":2,"into":0,"x":0.6,"y":0.05,"w":0.35}]（panel を into の中の割合の位置・幅で重ねる。記号は付かない）。`;
