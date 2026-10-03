// BranCHAT Figure 拡張（レイアウト）
// 複数の図を 1 枚の Figure に並べる。```figure の JSON が {"kind":"layout","cols":2,"labels":"A","page":"2col","panels":[図の指定,…]} のとき
// figRenderSpec から figRenderLayout が呼ばれる。各パネルは通常の図の指定（kind/type/data/style…）で、個別に ✎ で編集して書き戻せる。
// 隣り合う図は「プロット領域」（軸の内側）を揃える（列ごとに左の軸線、行ごとに上端を揃える。要件書 §10）。パネル記号は A, B, C…（または a, b, c）を自動採番。
// page（誌面幅）を指定すると全体を 1 段 89 mm／1.5 段 120 mm／2 段 183 mm に縮尺し、文字が 6 pt を下回れば警告する。
'use strict';

const FIG_PAGES={none:0,'1col':89,'1.5col':120,'2col':183}; // mm（Nature 系の代表値。投稿規定は誌ごとに確認）
const FIG_LAYOUT_DEF={cols:2,labels:'A',page:'none',gap:12,labelPt:14,align:true};
function figIsLayout(j){return !!(j&&(j.kind==='layout'||Array.isArray(j.panels)));}
function figRenderLayout(j){
  const specs=Array.isArray(j.panels)?j.panels:[];const n=specs.length;if(!n)return null;
  const panels=specs.map(p=>{if(!p||figIsLayout(p))return null;try{const r=figRenderSpec(p);return r&&r.svg?r:null;}catch(e){return null;}});
  const cols=Math.max(1,Math.min(6,+j.cols||(n<=1?1:n<=4?2:3)));const rows=Math.ceil(n/cols);
  const labels=j.labels==null?FIG_LAYOUT_DEF.labels:j.labels;const lfs=(+j.labelPt||FIG_LAYOUT_DEF.labelPt)*FIG_PT;const gap=(j.gap!=null&&isFinite(+j.gap)?+j.gap:FIG_LAYOUT_DEF.gap)*FIG_PT;const labelW=labels==='none'?0:lfs*1.3;const align=j.align!==false;
  const font=FIG_DEF.font;const fs=12*FIG_PT;const geo=panels.map(p=>p?{w:p.w,h:p.h,x0:p.plot?p.plot.x0:0,y0:p.plot?p.plot.y0:0}:{w:fs*12,h:fs*8,x0:0,y0:0});
  const L=new Array(cols).fill(0),T=new Array(rows).fill(0);geo.forEach((g,k)=>{const c=k%cols,r=Math.floor(k/cols);if(align){L[c]=Math.max(L[c],g.x0);T[r]=Math.max(T[r],g.y0);}});
  const dx=geo.map((g,k)=>align?L[k%cols]-g.x0:0),dy=geo.map((g,k)=>align?T[Math.floor(k/cols)]-g.y0:0);
  const W=new Array(cols).fill(0),H=new Array(rows).fill(0);geo.forEach((g,k)=>{const c=k%cols,r=Math.floor(k/cols);W[c]=Math.max(W[c],dx[k]+g.w);H[r]=Math.max(H[r],dy[k]+g.h);});
  const titleH=j.title?lfs*1.8:0;const cellX=[],cellY=[];let acc=0;for(let c=0;c<cols;c++){cellX.push(acc+labelW);acc+=labelW+W[c]+gap;}const totalW=acc-gap;acc=titleH;for(let r=0;r<rows;r++){cellY.push(acc);acc+=H[r]+gap;}const totalH=acc-gap;
  let body='';panels.forEach((p,k)=>{const c=k%cols,r=Math.floor(k/cols);const x=cellX[c]+dx[k],y=cellY[r]+dy[k];const g=geo[k];
    if(p)body+=p.svg.replace(/^<svg[^>]*>/,`<svg x="${x}" y="${y}" width="${g.w}" height="${g.h}" viewBox="0 0 ${g.w} ${g.h}" data-panel="${k}">`);
    else body+=`<g data-panel="${k}"><rect x="${x}" y="${y}" width="${g.w}" height="${g.h}" fill="#fff" stroke="#bbb" stroke-width="${FIG_PT}" stroke-dasharray="${FIG_PT*4} ${FIG_PT*3}"/><text x="${x+g.w/2}" y="${y+g.h/2}" font-family="${font}" font-size="${fs}" text-anchor="middle" fill="#999">図を描けませんでした</text></g>`;
    if(labels!=='none'){const lab=labels==='a'?String.fromCharCode(97+k):labels==='none'?'':String.fromCharCode(65+k);body+=`<text x="${cellX[c]-labelW+FIG_PT}" y="${cellY[r]+lfs*0.95}" font-family="${font}" font-size="${lfs}" font-weight="bold" text-anchor="start" data-label="${k}">${lab}</text>`;}});
  const title=j.title?`<text x="${totalW/2}" y="${lfs*1.1}" font-family="${font}" font-size="${lfs*0.9}" font-weight="bold" text-anchor="middle">${figEsc(j.title)}</text>`:'';
  const mm=FIG_PAGES[j.page]||(isFinite(+j.page)&&+j.page>0?+j.page:0);const scale=mm?mm*72/25.4/totalW:1;const outW=totalW*scale,outH=totalH*scale;
  const minPt=Math.min(...specs.map(p=>p&&p.style&&+p.style.fontPt||12))*scale;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${totalW} ${totalH}"><rect width="100%" height="100%" fill="#fff"/>${title}${body}</svg>`;
  return {svg,w:outW,h:outH,layout:true,n,cols,rows,scale,mm,minPt,missing:panels.filter(p=>!p).length};}

// レイアウト用のブロックの表示（figBlockHTML から）
function figLayoutBlockHTML(j,r,nodeId,index){const n=r.n;const lab=k=>j.labels==='a'?String.fromCharCode(97+k):String.fromCharCode(65+k);
  const sel=(key,opts,cur)=>`<select class="small" data-figlay="${key}" data-tip="レイアウトの設定（回答に書き戻します）">${opts.map(([v,l])=>`<option value="${v}"${String(cur)===String(v)?' selected':''}>${l}</option>`).join('')}</select>`;
  const info=r.mm?`幅 ${r.mm} mm（${(r.scale*100).toFixed(0)}%、文字 ${r.minPt.toFixed(1)} pt${r.minPt<6?' — 6 pt 未満。パネルを減らすか列を減らしてください':''}）`:`原寸 ${(r.w/72).toFixed(2)} × ${(r.h/72).toFixed(2)} in`;
  return `<div class="figblock layout" data-fignode="${figEsc(nodeId||'')}" data-figidx="${index}">${r.svg}<div class="figbtns">${Array.from({length:n},(_,k)=>`<button class="small" data-figedit data-figpanel="${k}" data-tip="パネル ${lab(k)} を作成画面で編集する">✎ ${lab(k)}</button>`).join('')}<button class="small" data-figjson data-tip="指定（JSON）を直して回答に書き戻す">{}</button><button class="small" data-figpng data-tip="PNG（300 dpi）で保存">PNG</button><button class="small" data-figsvg data-tip="SVG で保存">SVG</button><button class="small" data-figcopy data-tip="画像をコピー">⧉</button>
  <span class="ui" style="margin-left:6px">列</span>${sel('cols',[[1,'1'],[2,'2'],[3,'3'],[4,'4']],r.cols)}<span class="ui">記号</span>${sel('labels',[['A','A B C'],['a','a b c'],['none','なし']],j.labels==null?'A':j.labels)}<span class="ui">誌面</span>${sel('page',[['none','原寸'],['1col','1 段 89 mm'],['1.5col','1.5 段 120 mm'],['2col','2 段 183 mm']],j.page||'none')}<span class="ui">軸を揃える</span><input type="checkbox" data-figlay="align"${j.align===false?'':' checked'}><span class="hint" style="margin-left:6px">${info}${r.missing?` ／ 描けないパネル ${r.missing}`:''}</span></div></div>`;}
// ブロックのセレクトからレイアウトの設定を書き戻す
function figLayoutSet(fb,key,val){const nid=fb.dataset.fignode,idx=+fb.dataset.figidx;const n=N(nid);if(!n)return;const b=figFindBlocks(n.content)[idx];if(!b)return;let j;try{j=JSON.parse(b.json);}catch(e){return;}if(!figIsLayout(j))return;
  if(key==='cols')j.cols=+val;else if(key==='align')j.align=!!val;else j[key]=val;
  n.content=n.content.slice(0,b.start)+'```figure\n'+JSON.stringify(j)+'\n```'+n.content.slice(b.end);persist();renderAll();}
// 同じ発言の複数の ```figure を 1 つのレイアウトにまとめる（最初のブロックの位置に置き、残りを消す）
function figCombineBlocks(nodeId){const n=N(nodeId);if(!n)return;const blocks=figFindBlocks(n.content);const specs=[];for(const b of blocks){try{const j=JSON.parse(b.json);if(figIsLayout(j))specs.push(...(j.panels||[]));else specs.push(j);}catch(e){}}
  if(specs.length<2){toast('まとめる図が 2 つ以上ありません');return;}
  const lay={kind:'layout',cols:specs.length<=4?2:3,labels:'A',page:'none',panels:specs};let out='',pos=0;blocks.forEach((b,i)=>{out+=n.content.slice(pos,b.start);if(i===0)out+='```figure\n'+JSON.stringify(lay)+'\n```';pos=b.end;});out+=n.content.slice(pos);
  n.content=out.replace(/\n{3,}/g,'\n\n');persist();renderAll();toast(`${specs.length} 枚の図を 1 つのレイアウトにまとめました`);}

FIG_PROMPT+=`
複数の図を 1 枚の Figure に並べるときは {"kind":"layout","title":"任意","cols":2,"labels":"A","page":"none|1col|2col","panels":[図の指定, 図の指定, …]} を 1 つの \`\`\`figure ブロックで出す（panels の各要素は通常の図の指定。パネル記号 A, B, C… は自動、隣の図と軸の位置が揃う）。`;
