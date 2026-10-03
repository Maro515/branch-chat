// BranCHAT Figure 拡張（画像パネル）
// 顕微鏡・IHC・動物写真などの画像グリッド（type "grid"）と、ゲル／ウェスタンブロットの短冊（type "blot"）を ```figure の JSON で描く。
// 画像そのものは本文に入れず、この端末の images/（デスクトップ版 /api/img、ブラウザ版は localStorage）に保存して id で参照する。
// 寸法（px）は conv.imgs[id]={w,h,name} に持つ。スケールバーは µm/px から長さを計算する（要件書 §8）。
// 注釈（矢印・＊・文字・ROI 枠）はセル内の割合座標 (x,y: 0–1) で持ち、ブロック上のツールでクリックして足す。
'use strict';

const FIG_IMG_DEF={cols:3,cellIn:1.2,gap:3,fontPt:10,widthIn:2.5};
const FIG_IMG_META={}; // 会話に無いときの寸法の控え
function figImgMeta(id){return (typeof conv!=='undefined'&&conv&&conv.imgs&&conv.imgs[id])||FIG_IMG_META[id]||null;}
function figImgURL(id){if(typeof IS_DESKTOP!=='undefined'&&IS_DESKTOP)return '/api/img/'+encodeURIComponent(id);try{return localStorage.getItem('fimg:'+id)||'';}catch(e){return '';}}
function figIsImage(j){return !!(j&&j.kind==='image');}
// 画像を保存して {id,w,h,name} を返す。長辺 2000px まで縮小、PNG はそのまま、それ以外は JPEG
function figImgStore(file){return new Promise((res,rej)=>{const url=URL.createObjectURL(file);const im=new Image();im.onload=async()=>{URL.revokeObjectURL(url);const r=Math.min(1,2000/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*r));c.height=Math.max(1,Math.round(im.height*r));const g=c.getContext('2d');g.drawImage(im,0,0,c.width,c.height);
    const png=/png/i.test(file.type);const data=png?c.toDataURL('image/png'):c.toDataURL('image/jpeg',0.92);const id='im'+uid();const meta={w:c.width,h:c.height,name:String(file.name||'').replace(/\.[^.]+$/,'')};
    try{if(typeof IS_DESKTOP!=='undefined'&&IS_DESKTOP){const rr=await fetch('/api/img',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,data})});if(!rr.ok)throw new Error('保存に失敗しました');}else{localStorage.setItem('fimg:'+id,data);}}catch(e){rej(new Error('画像を保存できませんでした（'+e.message+'）'));return;}
    FIG_IMG_META[id]=meta;if(typeof conv!=='undefined'&&conv){conv.imgs=conv.imgs||{};conv.imgs[id]=meta;}res({id,...meta});};im.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('画像を読めませんでした'));};im.src=url;});}
// SVG 内の画像参照を data URL に置き換える（PNG 書き出し・添付用。<img> として読む SVG は外部参照を読めない）
async function figInlineImages(svg){const ids=[...new Set([...svg.matchAll(/href="\/api\/img\/([A-Za-z0-9_-]+)"/g)].map(m=>m[1]))];for(const id of ids){try{const b=await (await fetch('/api/img/'+id)).blob();const d=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b);});svg=svg.split('href="/api/img/'+id+'"').join('href="'+d+'"');}catch(e){}}return svg;}

// バックアップへの同梱: 会話が参照する画像を {id: dataURL} で返す／読み込む
async function figImgsExport(convList){const out={};for(const c of convList)for(const id of Object.keys(c.imgs||{})){if(out[id])continue;try{const u=figImgURL(id);if(!u)continue;if(u.startsWith('data:')){out[id]=u;continue;}const b=await (await fetch(u)).blob();out[id]=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b);});}catch(e){}}return out;}
async function figImgsImport(imgs){let n=0;for(const [id,data] of Object.entries(imgs||{})){if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||!/^data:image\/(png|jpeg);base64,/.test(data))continue;try{if(typeof IS_DESKTOP!=='undefined'&&IS_DESKTOP){const rr=await fetch('/api/img',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,data})});if(rr.ok)n++;}else{localStorage.setItem('fimg:'+id,data);n++;}}catch(e){}}return n;}

/* ---------- 描画 ---------- */
const figImgTxt=(x,y,s,o)=>{o=o||{};const fs=o.size||12;return `<text x="${x}" y="${y}" font-family="${FIG_DEF.font}" font-size="${fs}" font-weight="${o.weight||'bold'}" text-anchor="${o.anchor||'middle'}" fill="${o.fill||'#000'}"${o.stroke?` stroke="${o.stroke}" stroke-width="${fs*0.18}" paint-order="stroke" stroke-linejoin="round"`:''}${o.extra?' '+o.extra:''}>${figEsc(s)}</text>`;};
function figRenderImage(spec){if(spec.type==='blot')return figRenderBlot(spec);return figRenderImgGrid(spec);}
// 注釈。cell: {x,y,w,h}、a: {t:'arrow'|'star'|'text'|'roi', x,y(割合), dir, len, color, text, w,h, shape, dash}
function figImgAnnots(annots,cellOf,fs){let s='';(annots||[]).forEach(a=>{const c=cellOf(a.cell||0);if(!c)return;const px=c.x+(+a.x||0)*c.w,py=c.y+(+a.y||0)*c.h;const col=a.color||'#fff';const stroke=col==='#fff'||col==='white'?'#000':'#fff';
  if(a.t==='arrow'){const len=(+a.len||0.18)*Math.min(c.w,c.h);const dir=((a.dir==null?225:+a.dir)*Math.PI/180);const tx=px+Math.cos(dir)*len,ty=py+Math.sin(dir)*len;const hl=len*0.4,hw=len*0.2;const ang=Math.atan2(py-ty,px-tx);const bx=px-Math.cos(ang)*hl,by=py-Math.sin(ang)*hl;
    s+=`<g data-annot="1"><line x1="${tx}" y1="${ty}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width="${FIG_PT*1.5}" stroke-linecap="round"/><polygon points="${px},${py} ${bx+Math.sin(ang)*hw},${by-Math.cos(ang)*hw} ${bx-Math.sin(ang)*hw},${by+Math.cos(ang)*hw}" fill="${col}" stroke="${stroke}" stroke-width="${FIG_PT*0.3}"/></g>`;}
  else if(a.t==='head'){const len=(+a.len||0.1)*Math.min(c.w,c.h);const dir=((a.dir==null?225:+a.dir)*Math.PI/180);const ang=dir+Math.PI;const bx=px-Math.cos(ang)*len,by=py-Math.sin(ang)*len;s+=`<polygon data-annot="1" points="${px},${py} ${bx+Math.sin(ang)*len*0.45},${by-Math.cos(ang)*len*0.45} ${bx-Math.sin(ang)*len*0.45},${by+Math.cos(ang)*len*0.45}" fill="${col}" stroke="${stroke}" stroke-width="${FIG_PT*0.3}"/>`;}
  else if(a.t==='star')s+=figImgTxt(px,py+fs*0.6,'*',{size:fs*1.8,fill:col,stroke,extra:'data-annot="1"'});
  else if(a.t==='text')s+=figImgTxt(px,py+fs*0.35,a.text||'',{size:fs*(+a.size||1),fill:col,stroke,anchor:a.anchor||'middle',extra:'data-annot="1"'});
  else if(a.t==='roi'){const w=(+a.w||0.25)*c.w,h=(+a.h||0.25)*c.h;const dash=a.dash===false?'':` stroke-dasharray="${FIG_PT*3} ${FIG_PT*2}"`;s+=a.shape==='circle'?`<ellipse data-annot="1" cx="${px}" cy="${py}" rx="${w/2}" ry="${h/2}" fill="none" stroke="${col}" stroke-width="${FIG_PT}"${dash}/>`:`<rect data-annot="1" x="${px-w/2}" y="${py-h/2}" width="${w}" height="${h}" fill="none" stroke="${col}" stroke-width="${FIG_PT}"${dash}/>`;}});return s;}
// スケールバー。sb: {umPerPx,len,unit,pos:'br'|'bl'|'tr'|'tl',color,thick,labelOn:'first'|'all'|'none'}
function figScaleBar(sb,c,imgW,k,fs){if(!sb||!(+sb.len>0)||!(+sb.umPerPx>0)||!imgW)return '';const s=c.w/imgW*(c.sliceScale||1);const len=+sb.len/+sb.umPerPx*s;if(!(len>0)||len>c.w*0.9)return '';const th=(+sb.thick||2)*FIG_PT;const col=sb.color==='black'?'#000':'#fff';const pad=fs*0.6;const pos=sb.pos||'br';
  const x=/l/.test(pos)?c.x+pad:c.x+c.w-pad-len;const y=/t/.test(pos)?c.y+pad+(sb.labelOn!=='none'?fs*1.1:0):c.y+c.h-pad-th;let out=`<rect x="${x}" y="${y}" width="${len}" height="${th}" fill="${col}" data-scalebar="1"/>`;
  const on=sb.labelOn||'first';if(on==='all'||(on==='first'&&k===0))out+=figImgTxt(/l/.test(pos)?x:x+len,/t/.test(pos)?y-fs*0.3:y-fs*0.35,`${figFmt(+sb.len)} ${sb.unit||'µm'}`,{size:fs*0.9,fill:col,stroke:col==='#fff'?'#000':'#fff',anchor:/l/.test(pos)?'start':'end'});return out;}
function figRenderImgGrid(spec){const imgs=(spec.images||[]).filter(Boolean);const n=imgs.length;if(!n)return null;const cols=Math.max(1,Math.min(8,+spec.cols||Math.min(n,FIG_IMG_DEF.cols)));const rows=Math.ceil(n/cols);
  const fs=(+spec.fontPt||FIG_IMG_DEF.fontPt)*FIG_PT;const cellW=(+spec.cellIn||FIG_IMG_DEF.cellIn)*FIG_IN;const m0=figImgMeta(imgs[0].img);const asp=+spec.aspect>0?+spec.aspect:(m0?m0.h/m0.w:1);const cellH=cellW*asp;const gap=(spec.gap==null?FIG_IMG_DEF.gap:+spec.gap)*FIG_PT;
  const rl=spec.rowLabels||[],cl=spec.colLabels||[];const rowLabW=rl.length?(spec.rowVert?fs*1.5:Math.max(...rl.map(s=>String(s).length))*fs*0.6+fs*0.6):0;const colLabH=cl.length?fs*1.5:0;const titleH=spec.title?fs*2:0;
  const x0=rowLabW,y0=titleH+colLabH;const W=x0+cols*cellW+(cols-1)*gap,H=y0+rows*cellH+(rows-1)*gap;const cells=[];
  let body='',labels='';imgs.forEach((im,k)=>{const r=Math.floor(k/cols),c=k%cols;const x=x0+c*(cellW+gap),y=y0+r*(cellH+gap);const meta=figImgMeta(im.img);const cell={x,y,w:cellW,h:cellH,sliceScale:meta?Math.max(cellW/meta.w,cellH/meta.h)/(cellW/meta.w):1};cells.push(cell);
    const url=im.img?figImgURL(im.img):'';body+=`<g data-cell="${k}"><rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${url?'#000':'#e5e5e5'}"/>${url?`<image href="${url}" x="${x}" y="${y}" width="${cellW}" height="${cellH}" preserveAspectRatio="xMidYMid slice"/>`:figImgTxt(x+cellW/2,y+cellH/2,'画像なし',{size:fs,fill:'#888',weight:'normal'})}`;
    if(im.label)body+=figImgTxt(x+fs*0.5,y+fs*1.2,im.label,{size:fs,fill:im.labelColor||'#fff',stroke:'#000',anchor:'start'});
    if(spec.scale&&im.scaleBar!==false)body+=figScaleBar(spec.scale,cell,meta?meta.w:0,k,fs);
    body+=figImgAnnots((spec.annots||[]).filter(a=>(a.cell||0)===k),()=>cell,fs)+`<rect data-cellbox="${k}" x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="none" pointer-events="all"/></g>`;});
  cl.forEach((s,c)=>{if(c>=cols)return;labels+=figImgTxt(x0+c*(cellW+gap)+cellW/2,titleH+fs*1.05,s,{size:fs,fill:(spec.colColors||[])[c]||'#000'});});
  rl.forEach((s,r)=>{if(r>=rows)return;const cy=y0+r*(cellH+gap)+cellH/2;labels+=spec.rowVert?figImgTxt(fs*1.0,cy,s,{size:fs,extra:`transform="rotate(-90 ${fs*1.0} ${cy})"`}):figImgTxt(rowLabW-fs*0.5,cy+fs*0.35,s,{size:fs,anchor:'end'});});
  const title=spec.title?figImgTxt(x0+(W-x0)/2,fs*1.3,spec.title,{size:fs*1.2}):'';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${title}<g data-sel="axes">${labels}</g>${body}</svg>`;
  return {svg,w:W,h:H,plot:{x0,y0,w:W-x0,h:H-y0},image:true,cells,n,cols,rows};}
// ブロット: bands=[{img,name,kda}]（上から順の短冊）、lanes=['1','2',…]、conds=[{name,vals:['−','+',…],wedge:true}]、groups=[{name,from,to}]（0 始まりのレーン）
function figRenderBlot(spec){const bands=(spec.bands||[]).filter(Boolean);if(!bands.length)return null;const fs=(+spec.fontPt||FIG_IMG_DEF.fontPt)*FIG_PT;const W0=(+spec.widthIn||FIG_IMG_DEF.widthIn)*FIG_IN;const gap=(spec.gap==null?4:+spec.gap)*FIG_PT;
  const conds=spec.conds||[],lanes=spec.lanes||[],groups=spec.groups||[];const nl=Math.max(lanes.length,...conds.map(c=>(c.vals||[]).length),1);const laneW=W0/nl;
  const condNameW=conds.length?Math.max(...conds.map(c=>String(c.name||'').length))*fs*0.6+fs*0.6:0;const kdaW=bands.some(b=>b.kda!=null&&b.kda!=='')?fs*3.2:0;const leftW=Math.max(condNameW,kdaW);const rightW=bands.some(b=>b.name)?Math.max(...bands.map(b=>String(b.name||'').length))*fs*0.6+fs*0.6:0;
  const titleH=spec.title?fs*2:0;const groupH=groups.length?fs*1.6:0;const condH=conds.length*fs*1.3;const laneH=lanes.length?(spec.laneRot?fs*2.6:fs*1.3):0;const x0=leftW,y0=titleH+groupH+condH+laneH+fs*0.3;
  let body='',labels='',y=y0;const cells=[];bands.forEach((b,k)=>{const meta=figImgMeta(b.img);const h=+b.heightIn>0?+b.heightIn*FIG_IN:(meta?W0*meta.h/meta.w:W0*0.16);const url=b.img?figImgURL(b.img):'';const cell={x:x0,y,w:W0,h,sliceScale:1};cells.push(cell);
    body+=`<g data-cell="${k}"><rect x="${x0}" y="${y}" width="${W0}" height="${h}" fill="${url?'#fff':'#eee'}" stroke="${b.frame===false?'none':'#000'}" stroke-width="${FIG_PT*0.5}"/>${url?`<image href="${url}" x="${x0}" y="${y}" width="${W0}" height="${h}" preserveAspectRatio="none"/>`:figImgTxt(x0+W0/2,y+h/2+fs*0.35,'画像なし',{size:fs,fill:'#888',weight:'normal'})}`;
    if(b.kda!=null&&b.kda!=='')labels+=`<line x1="${x0-fs*0.5}" y1="${y+h/2}" x2="${x0-fs*0.1}" y2="${y+h/2}" stroke="#000" stroke-width="${FIG_PT*0.75}"/>`+figImgTxt(x0-fs*0.6,y+h/2+fs*0.35,`${b.kda}${/kda|kd/i.test(String(b.kda))?'':' kDa'}`,{size:fs*0.9,anchor:'end',weight:'normal'});
    if(b.name)labels+=figImgTxt(x0+W0+fs*0.5,y+h/2+fs*0.35,b.name,{size:fs,anchor:'start'});
    body+=figImgAnnots((spec.annots||[]).filter(a=>(a.cell||0)===k),()=>cell,fs)+`<rect data-cellbox="${k}" x="${x0}" y="${y}" width="${W0}" height="${h}" fill="none" pointer-events="all"/></g>`;y+=h+gap;});
  const H=y-gap;let ty=titleH;const lx=i=>x0+(i+0.5)*laneW;
  groups.forEach(g=>{const a=Math.max(0,+g.from||0),bb=Math.min(nl-1,g.to==null?nl-1:+g.to);const xa=x0+a*laneW+fs*0.2,xb=x0+(bb+1)*laneW-fs*0.2;labels+=`<line x1="${xa}" y1="${ty+fs*1.4}" x2="${xb}" y2="${ty+fs*1.4}" stroke="#000" stroke-width="${FIG_PT*0.75}"/>`+figImgTxt((xa+xb)/2,ty+fs*1.05,g.name||'',{size:fs});});ty+=groupH;
  conds.forEach(c=>{labels+=figImgTxt(x0-fs*0.5,ty+fs*1.0,c.name||'',{size:fs,anchor:'end'});if(c.wedge){labels+=`<polygon points="${x0+fs*0.2},${ty+fs*1.05} ${x0+W0-fs*0.2},${ty+fs*1.05} ${x0+W0-fs*0.2},${ty+fs*0.25}" fill="#000"/>`;}else (c.vals||[]).forEach((v,i)=>{labels+=figImgTxt(lx(i),ty+fs*1.0,v,{size:fs,weight:'normal'});});ty+=fs*1.3;});
  lanes.forEach((l,i)=>{if(i>=nl)return;labels+=spec.laneRot?figImgTxt(lx(i)+fs*0.3,ty+fs*2.2,l,{size:fs,anchor:'start',extra:`transform="rotate(-45 ${lx(i)+fs*0.3} ${ty+fs*2.2})"`,weight:'normal'}):figImgTxt(lx(i),ty+fs*1.0,l,{size:fs,weight:'normal'});});
  const title=spec.title?figImgTxt(x0+W0/2,fs*1.3,spec.title,{size:fs*1.2}):'';const W=x0+W0+rightW;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${title}<g data-sel="axes">${labels}</g>${body}</svg>`;
  return {svg,w:W,h:H,plot:{x0,y0,w:W0,h:H-y0},image:true,cells,n:bands.length,blot:true};}

/* ---------- チャットのブロック ---------- */
function figImageBlockHTML(j,r,nodeId,index){const sel=(key,opts,cur)=>`<select class="small" data-figimg="${key}" data-tip="画像パネルの設定（回答に書き戻します）">${opts.map(([v,l])=>`<option value="${v}"${String(cur)===String(v)?' selected':''}>${l}</option>`).join('')}</select>`;const sb=j.scale||{};
  const tools=`<span class="ui" style="margin-left:6px">注釈</span>${[['arrow','矢印'],['head','矢頭'],['star','＊'],['text','文字'],['roi','ROI 枠']].map(([t,l])=>`<button class="small" data-figtool="${t}" data-tip="押してから画像の場所をクリック">${l}</button>`).join('')}<button class="small" data-figimg="undo" data-tip="最後の注釈を消す">⌫</button>`;
  const grid=!r.blot;const ctl=grid?`<span class="ui" style="margin-left:6px">列</span>${sel('cols',[1,2,3,4,5,6].map(v=>[v,v]),r.cols)}<span class="ui">セル幅</span>${sel('cellIn',[[0.8,'0.8 in'],[1,'1.0 in'],[1.2,'1.2 in'],[1.5,'1.5 in'],[2,'2.0 in']],j.cellIn||FIG_IMG_DEF.cellIn)}<span class="ui">スケールバー</span><input class="small" data-figimg="umPerPx" type="number" step="any" min="0" placeholder="µm/px" value="${sb.umPerPx||''}" style="width:64px" data-tip="1 画素あたりの長さ（µm/px）"><input class="small" data-figimg="len" type="number" step="any" min="0" placeholder="長さ" value="${sb.len||''}" style="width:52px" data-tip="バーの長さ">${sel('unit',[['µm','µm'],['nm','nm'],['mm','mm']],sb.unit||'µm')}${sel('labelOn',[['first','表示: 1 枚目'],['all','表示: 全部'],['none','表示: なし']],sb.labelOn||'first')}${sel('color',[['white','白'],['black','黒']],sb.color||'white')}${sel('pos',[['br','右下'],['bl','左下'],['tr','右上'],['tl','左上']],sb.pos||'br')}`:`<span class="ui" style="margin-left:6px">幅</span>${sel('widthIn',[[2,'2.0 in'],[2.5,'2.5 in'],[3,'3.0 in'],[4,'4.0 in']],j.widthIn||FIG_IMG_DEF.widthIn)}<span class="ui">レーン名</span>${sel('laneRot',[['0','横'],['1','45°']],j.laneRot?1:0)}`;
  return `<div class="figblock image" data-fignode="${figEsc(nodeId||'')}" data-figidx="${index}">${r.svg}<div class="figbtns"><button class="small" data-figpng data-tip="PNG（300 dpi）で保存">PNG</button><button class="small" data-figsvg data-tip="SVG で保存">SVG</button><button class="small" data-figcopy data-tip="画像をコピー">⧉</button>${ctl}${tools}</div></div>`;}
function figImageSet(fb,key,val){const nid=fb.dataset.fignode,idx=+fb.dataset.figidx;const n=N(nid);if(!n)return;const b=figFindBlocks(n.content)[idx];if(!b)return;let j;try{j=JSON.parse(b.json);}catch(e){return;}if(!figIsImage(j))return;
  if(key==='undo'){if(j.annots&&j.annots.length)j.annots.pop();else{toast('消す注釈がありません');return;}}
  else if(['umPerPx','len','unit','labelOn','color','pos'].includes(key)){j.scale=j.scale||{};if(key==='umPerPx'||key==='len')j.scale[key]=+val||0;else j.scale[key]=val;}
  else if(key==='cols')j.cols=+val;else if(key==='cellIn'||key==='widthIn')j[key]=+val;else if(key==='laneRot')j.laneRot=val==='1';else j[key]=val;
  n.content=n.content.slice(0,b.start)+'```figure\n'+JSON.stringify(j)+'\n```'+n.content.slice(b.end);persist();renderAll();}
let figImgTool=null; // 選択中の注釈ツール {fb,t}
function figImageToolClick(fb,t){if(figImgTool&&figImgTool.t===t&&figImgTool.fb===fb){figImgTool=null;fb.querySelectorAll('[data-figtool]').forEach(b=>b.classList.remove('on'));return;}figImgTool={fb,t};fb.querySelectorAll('[data-figtool]').forEach(b=>b.classList.toggle('on',b.dataset.figtool===t));toast('画像の中で、注釈を置く場所をクリックしてください');}
// 画像のセルをクリック → 割合座標で注釈を足して書き戻す
function figImageCellClick(fb,cellEl,ev){if(!figImgTool||figImgTool.fb!==fb)return false;const t=figImgTool.t;const box=cellEl.getBoundingClientRect();const x=+((ev.clientX-box.left)/box.width).toFixed(3),y=+((ev.clientY-box.top)/box.height).toFixed(3);const k=+cellEl.dataset.cellbox;
  const a={t,cell:k,x,y};if(t==='text'){const s=prompt('書く文字');if(!s)return true;a.text=s;}if(t==='roi'){a.w=0.25;a.h=0.25;}
  const nid=fb.dataset.fignode,idx=+fb.dataset.figidx;const n=N(nid);if(!n)return true;const b=figFindBlocks(n.content)[idx];if(!b)return true;let j;try{j=JSON.parse(b.json);}catch(e){return true;}(j.annots=j.annots||[]).push(a);
  n.content=n.content.slice(0,b.start)+'```figure\n'+JSON.stringify(j)+'\n```'+n.content.slice(b.end);persist();renderAll();figImgTool=null;return true;}
// ＋メニュー「画像パネルを作る」: 画像を保存し、入力欄に ```figure を入れる（AI に見せるため縮小版も添付）
async function figImportImages(files){const list=[...files].filter(f=>/^image\/(png|jpeg|jpg|webp|gif|bmp|tiff?)$/i.test(f.type)).slice(0,12);if(!list.length){toast('画像ファイルを選んでください');return;}const imgs=[];for(const f of list){try{imgs.push(await figImgStore(f));}catch(e){toast(e.message);}}if(!imgs.length)return;
  const spec={kind:'image',type:'grid',cols:Math.min(imgs.length,3),images:imgs.map(m=>({img:m.id,label:m.name})),scale:{umPerPx:0,len:20,unit:'µm',labelOn:'first'}};persist();
  const t=document.querySelector('#input');t.value=(t.value?t.value+'\n':'')+'```figure\n'+JSON.stringify(spec)+'\n```\n';if(typeof fitInput==='function')fitInput();t.focus();
  if(typeof addImages==='function'&&typeof pendingImgs!=='undefined'&&pendingImgs.length<4){try{await addImages(list.slice(0,4-pendingImgs.length));}catch(e){}}
  toast(`画像 ${imgs.length} 枚を保存し、画像パネルの指定を入力欄に入れました。並べ方やスケールバー（µm/px）の指示を添えて送信するか、そのまま送って下のツールで整えてください`);}

FIG_PROMPT+=`
画像パネル（顕微鏡・IHC・ブロット）は kind "image"。画像は利用者が添付・保存したもので、id（"im…"）でだけ参照できる（新しい画像は作れない。利用者の指定にある id をそのまま使う）。
type "grid": {"kind":"image","type":"grid","cols":3,"cellIn":1.2,"rowLabels":["Control","Zolmin"],"colLabels":["DAPI","GFP","Merge"],"colColors":["#4040FF","#00C000",""],"images":[{"img":"id","label":"左上の文字"},…],"scale":{"umPerPx":0.65,"len":20,"unit":"µm","pos":"br","color":"white","labelOn":"first"},"annots":[{"t":"arrow|head|star|text|roi","cell":0,"x":0.5,"y":0.5,"dir":225,"text":"","color":"white"}]}（x,y はセル内の割合 0–1）。
type "blot": {"kind":"image","type":"blot","widthIn":2.5,"lanes":["1","2","3","4"],"conds":[{"name":"Zolmin","vals":["−","+","−","+"]},{"name":"濃度","wedge":true}],"groups":[{"name":"Raji","from":0,"to":1}],"bands":[{"img":"id","name":"CD20","kda":"35"},{"img":"id","name":"β-actin","kda":"42"}]}。
画像パネルは layout の panels にも入れられる。`;
