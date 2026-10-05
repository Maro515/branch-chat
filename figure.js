// BranCHAT Figure（Prism 9 同等の統計グラフ・P1 コア）
// 要件: ~/Applications/prism9-figure-spec/03_...要件定義書.md §6（描画エンジン）・付録B（既定値）に沿う。
// データ表 → 解析（記述統計・t検定/ANOVA+Tukey）→ グラフ（SVG）→ 書き出し（SVG/PNG）→ チャットへ添付。
// 統計は figure-stats.js（PrismLab 流用）。描画はここで要件書の既定値から作り直した。
'use strict';

/* ---------- 既定値（付録B） ---------- */
const FIG_DEF={
  wIn:3.0,hIn:2.0,            // X 軸 3.00 in × Y 軸 2.00 in（Wide）
  font:"Arial, Helvetica, 'Liberation Sans', sans-serif",fontPt:12,bold:true,
  axisPt:1,tickLen:0.7,        // 目盛の長さ＝数字の高さ×0.7
  colors:['#0000FF','#FF0000','#00C000','#A000E0','#FF8000','#000000','#906020','#000080','#600050'],
  symbols:['circle','square','triangle','triangle-down','diamond'],symPt:5.5,
  errType:'SD',capRatio:0.5,   // キャップ幅＝棒幅の 0.5
  barGap:{adj:0.5,group:1.0,first:0.5,last:0.5},
  boxWidth:0.65,violinWidth:0.85,
  bracketShape:'long',pThr:0.05,pStyle:'GP',
  barDots:false,legendPos:'right',frame:'L',grid:'none',tickDir:'out',ylog:false,xRot:0,barEdge:'series',fontFamily:'arial',refLine:'',errDir:'auto',fillAlpha:1,capW:0.5,axisColor:'#000000',
};
const FIG_FONTS={arial:"Arial, Helvetica, 'Liberation Sans', sans-serif",helvetica:"Helvetica, Arial, 'Liberation Sans', sans-serif",times:"'Times New Roman', Times, serif",noto:"'IBM Plex Sans JP', 'Hiragino Sans', sans-serif"};
const FIG_PT=96/72; // 1pt → px（SVG は px 単位で描き、1pt=1.333px）
const FIG_IN=96;    // 1in → px

/* ---------- データ表 ---------- */
// 文字列（TSV/CSV/Markdown表）→ {kind:'column'|'grouped'|'xy', cols:[{name,vals}]}
// 文字幅の見積もり（和文 1.0、欧文 0.58 × 文字高さ）と、題名を幅に収める（縮小 → 2 行）
function figTW(s,fs){let w=0;for(const ch of String(s||''))w+=/[\u3000-\u9fff\uff00-\uffef]/.test(ch)?fs*1.0:/[A-Z0-9@#%&WM]/.test(ch)?fs*0.72:/[ijl.,:;'|!\s]/.test(ch)?fs*0.3:fs*0.58;return w;}
function figTitleLines(title,maxW,fs){const t=String(title||'');if(!t)return {lines:[],size:fs};const w=figTW(t,fs);if(w<=maxW)return {lines:[t],size:fs};if(w*0.8<=maxW)return {lines:[t],size:fs*maxW/w};
  // 2 行に分ける（空白か読点の近くで）
  const half=t.length/2;let cut=-1;for(let i=0;i<t.length;i++){if(/[ 、，,。：:／/]/.test(t[i])&&Math.abs(i-half)<Math.abs(cut-half))cut=i;}if(cut<0)cut=Math.floor(half);const a=t.slice(0,cut+1).trim(),b=t.slice(cut+1).trim();const w2=Math.max(figTW(a,fs),figTW(b,fs));return {lines:[a,b],size:w2<=maxW?fs:fs*Math.max(0.6,maxW/w2)};}
function figTitle1(txt,cx,y,title,maxW,fs){if(!title)return '';const w=figTW(title,fs);const size=w>maxW?fs*Math.max(0.55,maxW/w):fs;return txt(cx,y,title,'middle','','title',size);}
function figTitleSVG(txt,cx,yBase,title,maxW,fs){const tl=figTitleLines(title,maxW,fs);if(!tl.lines.length)return '';const lh=tl.size*1.2;return tl.lines.map((l,i)=>txt(cx,yBase-(tl.lines.length-1-i)*lh,l,'middle','','title',tl.size)).join('');}
// 任意の文字（注釈）。o.notes=[{x,y（プロット領域に対する割合 0–1、y は上から）,text,size（文字高さの倍率）,color,anchor}]。ドラッグで動かせるよう data-note を付ける
function figNotesSVG(o,x0,y0top,plotW,plotH,fs,font,fw){const ns=Array.isArray(o.notes)?o.notes:[];if(!ns.length)return '';return '<g data-sel="notes">'+ns.map((n,k)=>{const x=x0+(+n.x||0)*plotW,y=y0top+(+n.y||0)*plotH;const size=fs*(+n.size||0.85);const lines=String(n.text||'').split('\n');return lines.map((l,i)=>`<text data-note="${k}" x="${x}" y="${y+i*size*1.2}" font-family="${font}" font-size="${size}" font-weight="${n.bold===false?'normal':fw}" text-anchor="${n.anchor||'start'}" fill="${n.color||'#000'}">${figEsc(l)}</text>`).join('');}).join('')+'</g>';}
function figParseTable(text){
  let lines=String(text||'').replace(/\r/g,'').split('\n').map(l=>l.replace(/^\s*\|/,'').replace(/\|\s*$/,'')).filter(l=>l.trim()&&!/^\s*[:\-| ]+\s*$/.test(l));
  if(!lines.length)return null;
  const sep=lines[0].includes('\t')?'\t':lines[0].includes('|')?'|':lines[0].includes(',')?',':/\s{2,}/;
  const rows=lines.map(l=>l.split(sep).map(c=>c.trim()));
  const w=Math.max(...rows.map(r=>r.length));rows.forEach(r=>{while(r.length<w)r.push('');});
  const num=s=>{if(s===''||s==null)return null;const v=Number(String(s).replace(/[,，]/g,'').replace(/^[<>≈~]/,''));return Number.isFinite(v)?v:null;};
  const head=rows[0];const headIsText=head.some(c=>num(c)===null&&c!=='');
  const body=headIsText?rows.slice(1):rows;const names=headIsText?head:head.map((_,i)=>String.fromCharCode(65+i));
  const firstColText=body.some(r=>r[0]!==''&&num(r[0])===null);
  const cols=names.map((n,i)=>({name:n||String.fromCharCode(65+i),raw:body.map(r=>r[i]),vals:body.map(r=>num(r[i]))}));
  return {cols,firstColText,rowLabels:body.map(r=>r[0])};
}
// 表の型を決める: 1列目が文字→grouped（行=カテゴリ、列=群。同名の列は反復）/ 1列目が数値で列が2本以上→xy / それ以外→column（列=群、行=反復）
function figBuildData(parsed,kind){
  if(!parsed)return null;const {cols,firstColText,rowLabels}=parsed;
  kind=kind||figAutoKind(parsed);
  if(typeof figBuildDataMore==='function'){const r=figBuildDataMore(parsed,kind);if(r!==undefined)return r;} // figure-more.js の図種

  const groupsOf=cs=>{const g=[];for(const c of cs){let e=g.find(x=>x.name===c.name);if(!e){e={name:c.name,reps:[]};g.push(e);}e.reps.push(c);}return g;};
  if(kind==='column'){ // 列=群、行=反復（同名列は結合）
    const gs=groupsOf(cols.filter(c=>c.vals.some(v=>v!==null)));
    return {kind,groups:gs.map(g=>({name:g.name,values:g.reps.flatMap(c=>c.vals).filter(v=>v!==null),raw:g.reps[0].vals}))}; // raw は行の対応を保った値（前後プロット用）
  }
  if(kind==='grouped'){ // 行=カテゴリ、列=群（同名列は反復）
    const cats=rowLabels;const gs=groupsOf(cols.slice(1).filter(c=>c.vals.some(v=>v!==null)));
    return {kind,cats,groups:gs.map(g=>({name:g.name,cells:cats.map((_,ri)=>g.reps.map(c=>c.vals[ri]).filter(v=>v!==null))}))};
  }
  // xy: 1列目=X、以降=Y（同名列は反復）
  const xs=cols[0].vals;const gs=groupsOf(cols.slice(1).filter(c=>c.vals.some(v=>v!==null)));
  return {kind:'xy',xname:cols[0].name,groups:gs.map(g=>({name:g.name,points:xs.map((x,ri)=>({x,ys:g.reps.map(c=>c.vals[ri]).filter(v=>v!==null)})).filter(p=>p.x!==null&&p.ys.length)}))};
}

// 表の型の自動判定（figure-more.js が生存・ROC・フォレストを先に判定する）
function figAutoKind(parsed){if(typeof figAutoKindMore==='function'){const k=figAutoKindMore(parsed);if(k)return k;}return parsed.firstColText?'grouped':'column';}

/* ---------- 解析 ---------- */
function figErr(vals,type){const n=vals.length;if(!n)return {m:NaN,e:0};const m=mean(vals);if(n<2)return {m,e:0};const s=sd(vals);if(type==='SEM')return {m,e:s/Math.sqrt(n)};if(type==='CI'){const t=tQuantile(0.975,n-1);return {m,e:t*s/Math.sqrt(n)};}if(type==='none')return {m,e:0};return {m,e:s};}
// 群間比較: 2群は Welch t、3群以上は一元配置分散分析 + Tukey（全比較）または Dunnett（対照群との比較）
function figCompare(groups,mode,ctrl){
  const gs=groups.filter(g=>g.values.length>=2);if(gs.length<2)return {pairs:[],note:'各群に2つ以上の値が必要です'};
  if(gs.length===2){const r=tTest2(gs[0].values,gs[1].values,{welch:true});return {test:'Welch の t 検定',pairs:[{a:0,b:1,p:r.p}]};}
  const an=anova1(gs.map(g=>({label:g.name,values:g.values})));const k=gs.length,dfE=an.df2;let ssw=0;for(const g of gs){const m=mean(g.values);for(const v of g.values)ssw+=(v-m)*(v-m);}const msE=ssw/dfE;
  const pairs=[];
  if(mode==='dunnett'){const c=Math.max(0,Math.min(k-1,ctrl||0));const n0=gs[c].values.length;const idx=gs.map((_,i)=>i).filter(i=>i!==c);const lam=idx.map(i=>Math.sqrt(gs[i].values.length/(gs[i].values.length+n0)));
    idx.forEach((i,j)=>{const d=Math.abs(mean(gs[i].values)-mean(gs[c].values))/Math.sqrt(msE*(1/gs[i].values.length+1/n0));let p;try{p=pdunnett(d,lam,dfE,true);}catch(e){p=tPvalue(d,dfE)*idx.length;}pairs.push({a:c,b:i,p:Math.min(1,p)});});
    return {test:'一元配置分散分析 + Dunnett',anova:an,pairs};}
  for(let i=0;i<k;i++)for(let j=i+1;j<k;j++){const d=Math.abs(mean(gs[i].values)-mean(gs[j].values))/Math.sqrt(msE/2*(1/gs[i].values.length+1/gs[j].values.length));pairs.push({a:i,b:j,p:Math.min(1,ptukeyP(d,k,dfE))});}
  return {test:'一元配置分散分析 + Tukey',anova:an,pairs};
}
// grouped: カテゴリごとに群同士を比較（各カテゴリで一元配置分散分析＋Tukey、2群なら Welch t）
function figCompareGrouped(d,mode,ctrl){const out=[];d.cats.forEach((cat,ci)=>{const gs=d.groups.map((g,gi)=>({name:g.name,values:g.cells[ci]||[],gi})).filter(g=>g.values.length>=2);if(gs.length<2)return;const r=figCompare(gs,mode,ctrl);if(r.pairs)r.pairs.forEach(p=>out.push({ci,a:gs[p.a].gi,b:gs[p.b].gi,p:p.p}));});return {test:'カテゴリごとに '+(d.groups.length===2?'Welch の t 検定':'一元配置分散分析 + '+(mode==='dunnett'?'Dunnett':'Tukey'))+'（2元配置ではありません）',pairs:out};}
function figStars(p,style){if(!(p<1))return 'ns';if(style==='num')return p<0.0001?'P<0.0001':'P='+p.toFixed(p<0.01?4:3);if(p<0.0001)return '****';if(p<0.001)return '***';if(p<0.01)return '**';if(p<0.05)return '*';return 'ns';}

function kde(v,lo,hi,n){const s=sd(v)||1,iqrv=quantile(v,0.75)-quantile(v,0.25);const h=0.9*Math.min(s,iqrv/1.34||s)*Math.pow(v.length,-0.2)||1;const out=[];for(let i=0;i<=n;i++){const x=lo+(hi-lo)*i/n;let d=0;for(const p of v)d+=Math.exp(-0.5*Math.pow((x-p)/h,2));out.push([x,d/(v.length*h*Math.sqrt(2*Math.PI))]);}return out;}
/* ---------- 描画（SVG） ---------- */
// データが最後の目盛を 40% 以上はみ出すときは目盛を 1 つ延ばす（figure-more.js の figAxisLin と同じ規則）
function figExtendTicks(t,lo,hi){const ts=t.ticks.slice();if(ts.length&&ts[0]-lo>t.step*0.4)ts.unshift(+(ts[0]-t.step).toFixed(10));if(ts.length&&hi-ts[ts.length-1]>t.step*0.4)ts.push(+(ts[ts.length-1]+t.step).toFixed(10));return {step:t.step,ticks:ts};}
function figNiceTicks(lo,hi,n){if(!(hi>lo)){hi=lo+1;}const span=hi-lo;const raw=span/Math.max(1,n);const mag=Math.pow(10,Math.floor(Math.log10(raw)));const cand=[1,2,2.5,5,10].map(c=>c*mag);const step=cand.find(c=>span/c<=n+0.5)||cand[cand.length-1];const t0=Math.ceil(lo/step-1e-9)*step,t1=Math.floor(hi/step+1e-9)*step;const ts=[];for(let v=t0;v<=t1+1e-9;v+=step)ts.push(+v.toFixed(10));return {step,ticks:ts};}
function figPow(v){const e=Math.round(Math.log10(v));return e>=0&&e<=3?String(Math.pow(10,e)):'10^'+e;}
function figFmt(v){if(Math.abs(v)>=1e5||(Math.abs(v)<1e-3&&v!==0))return v.toExponential(1);let t=(+v.toFixed(6)).toString();if(t.includes('.'))t=t.replace(/0+$/,'').replace(/\.$/,'');return t||'0';}
function figSymbol(x,y,r,shape,fill,stroke){if(!(r>0))return '';
  switch(shape){
    case 'square':return `<rect x="${x-r}" y="${y-r}" width="${2*r}" height="${2*r}" fill="${fill}" stroke="${stroke}" stroke-width="${FIG_PT}"/>`;
    case 'triangle':return `<polygon points="${x},${y-r*1.15} ${x-r*1.1},${y+r*0.85} ${x+r*1.1},${y+r*0.85}" fill="${fill}" stroke="${stroke}" stroke-width="${FIG_PT}"/>`;
    case 'triangle-down':return `<polygon points="${x},${y+r*1.15} ${x-r*1.1},${y-r*0.85} ${x+r*1.1},${y-r*0.85}" fill="${fill}" stroke="${stroke}" stroke-width="${FIG_PT}"/>`;
    case 'diamond':return `<polygon points="${x},${y-r*1.2} ${x+r*1.2},${y} ${x},${y+r*1.2} ${x-r*1.2},${y}" fill="${fill}" stroke="${stroke}" stroke-width="${FIG_PT}"/>`;
    case 'plus':return `<path d="M${x-r},${y}H${x+r}M${x},${y-r}V${y+r}" stroke="${stroke}" stroke-width="${FIG_PT*1.3}" fill="none"/>`;
    case 'cross':return `<path d="M${x-r*0.85},${y-r*0.85}L${x+r*0.85},${y+r*0.85}M${x-r*0.85},${y+r*0.85}L${x+r*0.85},${y-r*0.85}" stroke="${stroke}" stroke-width="${FIG_PT*1.3}" fill="none"/>`;
    default:return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${FIG_PT}"/>`;
  }
}
const figEsc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function figHalf(hex){return hex+'80';} // 50% 透明

// 散布ドットの Standard 配置: 値を幅ごとのビンに入れ、同じビンの点を中心から左右に並べる（Prism の見た目に近い決定的な配置）
function figArrangeDots(vals,yOf,r,maxW){
  const items=vals.map((v,i)=>({v,y:yOf(v),i})).sort((a,b)=>a.y-b.y);const out=new Array(vals.length);const binH=r*2.1;let bin=[],binY=null;
  const flush=()=>{const n=bin.length;const step=Math.min(r*2.2,maxW/Math.max(1,n-1)||r*2.2);bin.forEach((it,k)=>{const off=(k-(n-1)/2)*step;out[it.i]={dx:Math.max(-maxW/2,Math.min(maxW/2,off)),y:it.y};});bin=[];};
  for(const it of items){if(binY===null||Math.abs(it.y-binY)>binH){if(bin.length)flush();binY=it.y;}bin.push(it);}if(bin.length)flush();
  return out;
}

function figSeriesOpt(o,i){const ov=(o.series&&o.series[i])||{};const colors=o.colors||FIG_DEF.colors,symbols=o.symbols||FIG_DEF.symbols;return {name:ov.name||'',color:ov.color||colors[i%colors.length],symbol:ov.symbol||symbols[i%symbols.length],symPt:+(ov.symPt!=null&&ov.symPt!==''?ov.symPt:(o.symPt!=null&&o.symPt!==''?o.symPt:FIG_DEF.symPt)),fill:ov.fill||'solid',lineW:+(ov.lineW||o.linePt||1)};}
function figRender(spec){
  const d=spec.data;if(!d)return {svg:'',w:0,h:0};
  if(typeof figRenderMore==='function'){const r=figRenderMore(spec);if(r)return r;} // figure-more.js の図種
  const o=Object.assign({},FIG_DEF,spec.opts||{});if(FIG_FONTS[o.fontFamily])o.font=FIG_FONTS[o.fontFamily];const fs=(+o.fontPt||12)*FIG_PT,h=fs*0.72,a=(+o.axisPt||1)*FIG_PT,tick=h*(+o.tickLen||0.7)*(o.tickDir==='in'?-1:1);
  const plotW=(+o.wIn||3)*FIG_IN,plotH=(+o.hIn||2)*FIG_IN;const legendPos=o.legendPos||(o.legend==='none'?'none':'right');const showLegend=legendPos!=='none'&&d.groups.length>1&&d.kind!=='column';const ac=o.axisColor||'#000';
  const xrot=+o.xRot||0;const legW=showLegend&&legendPos==='right'?Math.max(fs*5,Math.max(...d.groups.map(g=>figTW(g.name,fs)))+fs*2.2):0;const padL=fs*4.2,padB=fs*3.2+(xrot?fs*2.2:0)+(showLegend&&legendPos==='bottom'?fs*1.8:0),padR=fs*1.2+legW;const titleL=figTitleLines(spec.title,padL+plotW+padR-fs,fs);const padT=fs*1.6+(titleL.lines.length?fs*0.8+titleL.lines.length*titleL.size*1.2*0.85:0);
  const W=padL+plotW+padR,H=padT+plotH+padB;const x0=padL,y0=padT+plotH;
  const fw=o.bold?'bold':'normal';const txt=(x,y,s,anchor,extra,sel,size)=>`<text ${sel?`data-sel="${sel}" `:''}x="${x}" y="${y}" font-family="${o.font}" font-size="${size||fs}" font-weight="${fw}" text-anchor="${anchor||'middle'}" ${extra||''}>${figEsc(s)}</text>`;
  const type=spec.type;const S=i=>figSeriesOpt(o,i);
  const sym=(x,y,i,shape,color,fill)=>figSymbol(x,y,S(i).symPt*FIG_PT/2,shape||S(i).symbol,fill==='open'?'#fff':color,color);
  const allY=[];const yTitle=o.yTitle||'',xTitle=o.xTitle||'';
  if(d.kind==='column'||d.kind==='grouped'){
    const cells=d.kind==='column'?d.groups.map(g=>g.values):d.groups.flatMap(g=>g.cells);
    for(const v of cells){if(!v.length)continue;if(type==='box'){allY.push(...v);}else{const e=figErr(v,o.errType);allY.push(e.m+e.e,e.m-e.e);if(type==='scatter'||type==='violin'||type==='grouped-scatter')allY.push(...v);}}
    if(type==='bar'||type==='grouped-bar')allY.push(0);
  }else{for(const g of d.groups)for(const p of g.points){const e=figErr(p.ys,o.errType);allY.push(e.m+e.e,e.m-e.e);if(type==='xy-points')allY.push(...p.ys);}}
  let ymin=Math.min(...allY),ymax=Math.max(...allY);if(!isFinite(ymin)){ymin=0;ymax=1;}
  if(o.ymin!==''&&o.ymin!=null&&isFinite(+o.ymin))ymin=+o.ymin;else if(ymin>0&&(type==='bar'||type==='grouped-bar'))ymin=0;else if(ymin>0&&ymin<(ymax-ymin)*0.3)ymin=0;
  if(o.ymax!==''&&o.ymax!=null&&isFinite(+o.ymax))ymax=+o.ymax;
  let nLv=0;if(spec.compare&&spec.compare.pairs&&d.kind==='grouped'){nLv=Math.min(3,d.groups.length-1);}else if(spec.compare&&spec.compare.pairs){const ps0=spec.compare.pairs.filter(p=>o.showNs||p.p<o.pThr).map(p=>({l:Math.min(p.a,p.b),r:Math.max(p.a,p.b)})).sort((p,q)=>(p.r-p.l)-(q.r-q.l));const lv0=[];for(const p of ps0){let lv=0;for(;;lv++){if(!lv0[lv]||!lv0[lv].some(q=>!(p.r<q.l||p.l>q.r)))break;}(lv0[lv]=lv0[lv]||[]).push(p);}nLv=lv0.length;}
  const head=nLv?0.14+0.16*nLv:0.06;
  const yt=figExtendTicks(figNiceTicks(ymin,ymax+(ymax-ymin)*head,5),ymin,ymax+(ymax-ymin)*head);const yLo=Math.min(ymin,yt.ticks[0]),yHi=Math.max(ymax+(ymax-ymin)*head,yt.ticks[yt.ticks.length-1]);
  let yOf=v=>y0-(v-yLo)/(yHi-yLo)*plotH;let yTicks=yt.ticks;
  if(o.ylog){const pos=allY.filter(v=>v>0);if(pos.length){const lo=Math.min(...pos),hi=Math.max(...pos);const e0=Math.floor(Math.log10(lo)),e1=Math.ceil(Math.log10(hi*(1+head)));yTicks=[];for(let e=e0;e<=e1;e++)yTicks.push(Math.pow(10,e));const L0=Math.log10(yTicks[0]),L1=Math.log10(yTicks[yTicks.length-1]);yOf=v=>y0-(Math.log10(Math.max(v,yTicks[0]))-L0)/(L1-L0)*plotH;}}
  const yAxisTop=yOf(yTicks[yTicks.length-1]),yAxisBot=yOf(yTicks[0]);
  let axes=`<line x1="${x0}" y1="${yAxisBot}" x2="${x0}" y2="${yAxisTop}" stroke="${ac}" stroke-width="${a}" stroke-linecap="square"/>`;
  if(o.frame==='box')axes+=`<rect x="${x0}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="${ac}" stroke-width="${a}"/>`;
  let grid='';for(const t of yTicks){const y=yOf(t);axes+=`<line x1="${x0}" y1="${y}" x2="${x0-tick}" y2="${y}" stroke="${ac}" stroke-width="${a}"/>`+txt(x0-Math.max(0,tick)-fs*0.3,y+h/2,o.ylog?figPow(t):figFmt(t),'end');if(o.grid==='major')grid+=`<line x1="${x0}" y1="${y}" x2="${x0+plotW}" y2="${y}" stroke="#bbb" stroke-width="${FIG_PT*0.5}"/>`;}
  if(o.refLine!==''&&o.refLine!=null&&isFinite(+o.refLine))grid+=`<line x1="${x0}" y1="${yOf(+o.refLine)}" x2="${x0+plotW}" y2="${yOf(+o.refLine)}" stroke="#444" stroke-width="${FIG_PT*0.75}" stroke-dasharray="${FIG_PT*3} ${FIG_PT*2}"/>`;
  let titles='';
  if(yTitle)titles+=txt(x0-tick-fs*2.6,(yAxisTop+yAxisBot)/2,yTitle,'middle',`transform="rotate(-90 ${x0-tick-fs*2.6} ${(yAxisTop+yAxisBot)/2})"`,'ytitle');
  const xlab=(cx,s)=>xrot?txt(cx,y0+Math.max(0,tick)+fs*0.6,s,'end',`transform="rotate(-${xrot} ${cx} ${y0+Math.max(0,tick)+fs*0.6})"`):txt(cx,y0+Math.max(0,tick)+fs*1.05,s);
  const errBar=(cx,m,e,w,color,upOnly)=>{if(o.errDir==='both')upOnly=false;else if(o.errDir==='up')upOnly=true;const capR=+o.capW||o.capRatio;if(!(e>0))return '';const yT=yOf(m+e),yB=upOnly?yOf(m):yOf(m-e);const cw=w*capR;let s=`<line x1="${cx}" y1="${yT}" x2="${cx}" y2="${yB}" stroke="${color}" stroke-width="${a}"/>`;s+=`<line x1="${cx-cw/2}" y1="${yT}" x2="${cx+cw/2}" y2="${yT}" stroke="${color}" stroke-width="${a}"/>`;if(!upOnly)s+=`<line x1="${cx-cw/2}" y1="${yB}" x2="${cx+cw/2}" y2="${yB}" stroke="${color}" stroke-width="${a}"/>`;return s;};
  const centers=[];const gcenters=[];const series=[];const addS=(i,html)=>{series[i]=(series[i]||'')+html;};
  if(d.kind==='column'){
    const n=d.groups.length;const g=o.barGap;const unit=plotW/(g.first+n+(n-1)*g.adj+g.last);const bw=unit*(type==='bar'?1:0.67);
    let xAxis=`<line x1="${x0}" y1="${y0}" x2="${x0+plotW}" y2="${y0}" stroke="${ac}" stroke-width="${a}" stroke-linecap="square"/>`;
    d.groups.forEach((gr,i)=>{const cx=x0+unit*(g.first+0.5+i*(1+g.adj));const v=gr.values;const so=S(i),c=so.color;const e=figErr(v,o.errType);let top=e.m+e.e;let b='';
      xAxis+=`<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0+tick}" stroke="${ac}" stroke-width="${a}"/>`+xlab(cx,so.name||gr.name);
      if(type==='bar'){const base=o.ylog?yTicks[0]:0;b+=`<rect x="${cx-bw/2}" y="${yOf(Math.max(base,e.m))}" width="${bw}" height="${Math.abs(yOf(e.m)-yOf(base))}" fill="${so.fill==='open'?'#fff':c}" fill-opacity="${o.barDots?Math.min(+o.fillAlpha,0.5):+o.fillAlpha}" stroke="${o.barEdge==='black'?'#000':c}" stroke-width="${a}"/>`+errBar(cx,e.m,e.e,bw,'#000',!o.barDots);if(o.barDots){const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(v,yOf,r,bw*0.8);v.forEach((val,k)=>{b+=sym(cx+pos[k].dx,pos[k].y,i,null,o.barEdge==='black'?'#000':c,so.fill);});top=Math.max(top,...v);}}
      else if(type==='scatter'){const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(v,yOf,r,bw*0.9);v.forEach((val,k)=>{b+=sym(cx+pos[k].dx,pos[k].y,i,null,c,so.fill);});
        const lw=bw*o.capRatio*2;b+=`<line x1="${cx-lw/2}" y1="${yOf(e.m)}" x2="${cx+lw/2}" y2="${yOf(e.m)}" stroke="#000" stroke-width="${a*2}"/>`+errBar(cx,e.m,e.e,bw,'#000',false);top=Math.max(top,...v);}
      else if(type==='box'){if(v.length>=2){const q1=quantile(v,0.25),q2=quantile(v,0.5),q3=quantile(v,0.75),iqr=q3-q1;const inl=v.filter(x=>x>=q1-1.5*iqr&&x<=q3+1.5*iqr);const lo=Math.min(...inl),hi=Math.max(...inl);const w2=bw*o.boxWidth;
        b+=`<line x1="${cx}" y1="${yOf(hi)}" x2="${cx}" y2="${yOf(q3)}" stroke="${c}" stroke-width="${a}"/><line x1="${cx}" y1="${yOf(q1)}" x2="${cx}" y2="${yOf(lo)}" stroke="${c}" stroke-width="${a}"/>`;
        b+=`<line x1="${cx-w2*0.27}" y1="${yOf(hi)}" x2="${cx+w2*0.27}" y2="${yOf(hi)}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-w2*0.27}" y1="${yOf(lo)}" x2="${cx+w2*0.27}" y2="${yOf(lo)}" stroke="${c}" stroke-width="${a}"/>`;
        b+=`<rect x="${cx-w2/2}" y="${yOf(q3)}" width="${w2}" height="${yOf(q1)-yOf(q3)}" fill="${so.fill==='open'?'#fff':figHalf(c)}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-w2/2}" y1="${yOf(q2)}" x2="${cx+w2/2}" y2="${yOf(q2)}" stroke="${c}" stroke-width="${a}"/>`;
        if(o.barDots){const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(v,yOf,r,w2*0.9);v.forEach((val,k)=>{b+=sym(cx+pos[k].dx,pos[k].y,i,null,o.barEdge==='black'?'#000':c,so.fill);});}else v.filter(x=>x<q1-1.5*iqr||x>q3+1.5*iqr).forEach(x=>{b+=sym(cx,yOf(x),i,null,c,so.fill);});top=Math.max(...v);}}
      else if(type==='violin'){if(v.length>=2){const lo=Math.min(...v),hi=Math.max(...v);const k=kde(v,lo,hi,40);const mx=Math.max(...k.map(p=>p[1]))||1;const w2=bw*o.violinWidth/2;
        const left=k.map(p=>`${cx-p[1]/mx*w2},${yOf(p[0])}`),right=k.slice().reverse().map(p=>`${cx+p[1]/mx*w2},${yOf(p[0])}`);
        b+=`<polygon points="${left.concat(right).join(' ')}" fill="${so.fill==='open'?'#fff':figHalf(c)}" stroke="${c}" stroke-width="${a}"/>`;
        const q1=quantile(v,0.25),q2=quantile(v,0.5),q3=quantile(v,0.75);const wAt=y=>{const p=k.reduce((bb,p)=>Math.abs(p[0]-y)<Math.abs(bb[0]-y)?p:bb);return p[1]/mx*w2;};
        b+=`<line x1="${cx-wAt(q2)}" y1="${yOf(q2)}" x2="${cx+wAt(q2)}" y2="${yOf(q2)}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-wAt(q1)}" y1="${yOf(q1)}" x2="${cx+wAt(q1)}" y2="${yOf(q1)}" stroke="${c}" stroke-width="${a}" stroke-dasharray="${a*2} ${a*2}"/><line x1="${cx-wAt(q3)}" y1="${yOf(q3)}" x2="${cx+wAt(q3)}" y2="${yOf(q3)}" stroke="${c}" stroke-width="${a}" stroke-dasharray="${a*2} ${a*2}"/>`;if(o.barDots){const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(v,yOf,r,w2*1.6);v.forEach((val,k)=>{b+=sym(cx+pos[k].dx,pos[k].y,i,null,o.barEdge==='black'?'#000':c,so.fill);});}top=hi;}}
      addS(i,b);centers.push({cx,top:yOf(top),name:gr.name});});
    axes+=xAxis;if(xTitle)titles+=txt(x0+plotW/2,y0+Math.max(0,tick)+fs*2.3+(xrot?fs*2:0),xTitle,'middle','','xtitle');
  }else if(d.kind==='grouped'){
    const nc=d.cats.length,ng=d.groups.length;const g=o.barGap;const unit=plotW/(g.first+nc*(ng+(ng-1)*g.adj)+(nc-1)*g.group+g.last);const bw=unit;
    let xAxis=`<line x1="${x0}" y1="${y0}" x2="${x0+plotW}" y2="${y0}" stroke="${ac}" stroke-width="${a}" stroke-linecap="square"/>`;
    d.cats.forEach((cat,ci)=>{const start=x0+unit*(g.first+ci*(ng+(ng-1)*g.adj+g.group));const catCenter=start+unit*(ng+(ng-1)*g.adj)/2;
      xAxis+=`<line x1="${catCenter}" y1="${y0}" x2="${catCenter}" y2="${y0+tick}" stroke="${ac}" stroke-width="${a}"/>`+xlab(catCenter,cat);
      d.groups.forEach((gr,gi)=>{const v=gr.cells[ci]||[];if(!v.length)return;const cx=start+unit*(0.5+gi*(1+g.adj));const so=S(gi),c=so.color;const e=figErr(v,o.errType);let b='';
        if(type==='grouped-scatter'){const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(v,yOf,r,bw*0.9);v.forEach((val,k)=>{b+=sym(cx+pos[k].dx,pos[k].y,gi,null,c,so.fill);});b+=`<line x1="${cx-bw*0.5}" y1="${yOf(e.m)}" x2="${cx+bw*0.5}" y2="${yOf(e.m)}" stroke="#000" stroke-width="${a*2}"/>`+errBar(cx,e.m,e.e,bw,'#000',false);}
        else{const base=o.ylog?yTicks[0]:0;b+=`<rect x="${cx-bw/2}" y="${yOf(Math.max(base,e.m))}" width="${bw}" height="${Math.abs(yOf(e.m)-yOf(base))}" fill="${so.fill==='open'?'#fff':c}" fill-opacity="${o.barDots?Math.min(+o.fillAlpha,0.5):+o.fillAlpha}" stroke="${o.barEdge==='black'?'#000':c}" stroke-width="${a}"/>`+errBar(cx,e.m,e.e,bw,'#000',!o.barDots);if(o.barDots){const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(v,yOf,r,bw*0.8);v.forEach((val,k)=>{b+=sym(cx+pos[k].dx,pos[k].y,gi,null,o.barEdge==='black'?'#000':c,so.fill);});}}
        gcenters.push({ci,gi,cx,top:yOf(Math.max(e.m+e.e,...(o.barDots||type==='grouped-scatter'?v:[])))});addS(gi,b);});});
    axes+=xAxis;if(xTitle)titles+=txt(x0+plotW/2,y0+Math.max(0,tick)+fs*2.3+(xrot?fs*2:0),xTitle,'middle','','xtitle');
  }else{
    const xs=d.groups.flatMap(g=>g.points.map(p=>p.x));let xmin=Math.min(...xs),xmax=Math.max(...xs);if(!(xmax>xmin)){xmax=xmin+1;}
    const xt=figExtendTicks(figNiceTicks(xmin,xmax,6),xmin,xmax);const xLo=Math.min(xmin,xt.ticks[0]),xHi=Math.max(xmax,xt.ticks[xt.ticks.length-1]);const xOf=x=>x0+(x-xLo)/(xHi-xLo)*plotW;
    const xa0=xOf(xt.ticks[0]),xa1=xOf(xt.ticks[xt.ticks.length-1]);
    let xAxis=`<line x1="${xa0}" y1="${y0}" x2="${xa1}" y2="${y0}" stroke="${ac}" stroke-width="${a}" stroke-linecap="square"/>`;
    for(const t of xt.ticks){const x=xOf(t);xAxis+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+tick}" stroke="${ac}" stroke-width="${a}"/>`+xlab(x,figFmt(t));}
    if(xTitle||d.xname)titles+=txt((xa0+xa1)/2,y0+Math.max(0,tick)+fs*2.3+(xrot?fs*2:0),xTitle||d.xname,'middle','','xtitle');
    d.groups.forEach((gr,gi)=>{const so=S(gi),c=so.color;const pts=gr.points.slice().sort((p,q)=>p.x-q.x);const r=so.symPt*FIG_PT/2;const w=r*2*1.2;let b='';
      if(type!=='xy-points')b+=`<polyline points="${pts.map(p=>`${xOf(p.x)},${yOf(mean(p.ys))}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${so.lineW*FIG_PT}" stroke-linejoin="round"/>`;
      pts.forEach(p=>{const e=figErr(p.ys,o.errType);const cx=xOf(p.x);if(type==='xy-points'){p.ys.forEach(y=>{b+=sym(cx,yOf(y),gi,null,c,so.fill);});}else{b+=errBar(cx,e.m,e.e,w,c,false)+sym(cx,yOf(e.m),gi,null,c,so.fill);}});
      addS(gi,b);});
    axes+=xAxis;
  }
  let brackets='';
  if(spec.compare&&spec.compare.pairs&&d.kind==='grouped'&&gcenters.length){
    const ps=spec.compare.pairs.filter(p=>o.showNs||p.p<o.pThr);const byCat={};ps.forEach(p=>(byCat[p.ci]=byCat[p.ci]||[]).push(p));
    for(const ci of Object.keys(byCat)){const cs=gcenters.filter(c=>c.ci===+ci).sort((x,y)=>x.gi-y.gi);const idx=g=>cs.findIndex(c=>c.gi===g);const list=byCat[ci].map(p=>({...p,l:Math.min(idx(p.a),idx(p.b)),r:Math.max(idx(p.a),idx(p.b))})).filter(p=>p.l>=0&&p.r>=0).sort((p,q)=>(p.r-p.l)-(q.r-q.l));const levels=[];for(const p of list){let lv=0;for(;;lv++){if(!levels[lv]||!levels[lv].some(q=>!(p.r<q.l||p.l>q.r)))break;}(levels[lv]=levels[lv]||[]).push(p);p.lv=lv;}
      const topOf=(l,r)=>Math.min(...cs.slice(l,r+1).map(c=>c.top));const base=Math.min(...cs.map(c=>c.top))-0.75*h;
      for(const p of list){const y=Math.min(base,topOf(p.l,p.r)-0.75*h)-p.lv*2*h-(p.lv?0.6*h:0);const xa=cs[p.l].cx,xb=cs[p.r].cx;const leg=o.bracketShape==='long'?h*0.7:h*0.3;brackets+=`<polyline points="${xa},${y+leg} ${xa},${y} ${xb},${y} ${xb},${y+leg}" fill="none" stroke="${ac}" stroke-width="${a}"/>`+txt((xa+xb)/2,y-fs*0.15,figStars(p.p,o.pStyle));}}
  }
  else if(spec.compare&&spec.compare.pairs&&centers.length){
    const ps=spec.compare.pairs.filter(p=>o.showNs||p.p<o.pThr).map(p=>({...p,l:Math.min(p.a,p.b),r:Math.max(p.a,p.b)})).sort((p,q)=>(p.r-p.l)-(q.r-q.l));
    const levels=[];const topOf=(l,r)=>Math.min(...centers.slice(l,r+1).map(c=>c.top));
    for(const p of ps){let lv=0;for(;;lv++){if(!levels[lv]||!levels[lv].some(q=>!(p.r<q.l||p.l>q.r)))break;}(levels[lv]=levels[lv]||[]).push(p);p.lv=lv;}
    const base=Math.min(...centers.map(c=>c.top))-0.75*h;const dataTop=(l,r)=>topOf(l,r)-0.75*h;
    for(const p of ps){const y=Math.min(base,dataTop(p.l,p.r))-p.lv*2*h-(p.lv?0.6*h:0);const xa=centers[p.l].cx,xb=centers[p.r].cx;const leg=o.bracketShape==='long'?h*0.7:h*0.3;
      brackets+=`<polyline points="${xa},${y+leg} ${xa},${y} ${xb},${y} ${xb},${y+leg}" fill="none" stroke="${ac}" stroke-width="${a}"/>`+txt((xa+xb)/2,y-fs*0.15,figStars(p.p,o.pStyle));}
  }
  let legend='';
  if(showLegend){const bottom=legendPos==='bottom';const itemW=fs*7;const lx0=bottom?x0+plotW/2-itemW*d.groups.length/2:x0+plotW+fs*1.2;d.groups.forEach((gr,i)=>{const lx=bottom?lx0+i*itemW:lx0;const ly=bottom?H-fs*0.6:padT+fs*(i*1.5+0.8);const so=S(i),c=so.color;
    if(d.kind==='grouped'&&type!=='grouped-scatter')legend+=`<rect x="${lx}" y="${ly-fs*0.55}" width="${fs*1.1}" height="${fs*0.75}" fill="${so.fill==='open'?'#fff':c}" stroke="${c}"/>`;else legend+=sym(lx+fs*0.5,ly-fs*0.2,i,null,c,so.fill);
    legend+=txt(lx+fs*1.5,ly,so.name||gr.name,'start');});}
  const title=figTitleSVG(txt,x0+plotW/2,padT-fs*0.9,spec.title,W-fs,fs);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${grid}<g data-sel="axes">${axes}</g>${titles}${series.map((s,i)=>`<g data-sel="series:${i}">${s||''}</g>`).join('')}${brackets?`<g data-sel="brackets">${brackets}</g>`:''}${legend?`<g data-sel="legend">${legend}</g>`:''}${title}${figNotesSVG(o,x0,padT,plotW,plotH,fs,o.font,fw)}</svg>`;
  return {svg,w:W,h:H,plot:{x0,y0:padT,w:plotW,h:plotH}}; // plot はレイアウトで軸を揃えるための プロット領域
}

/* ---------- 書き出し ---------- */
// PNG に解像度（pHYs チャンク、dpi）を書き込む。canvas.toDataURL は解像度を持たないため
const figCrcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function figCrc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=figCrcTable[(c^bytes[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function figPngDataURL(canvas,dpi){const url=canvas.toDataURL('image/png');try{const b64=url.split(',')[1];const bin=atob(b64);const src=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)src[i]=bin.charCodeAt(i);
  const ppm=Math.round((dpi||300)/0.0254);const chunk=new Uint8Array(4+4+9+4);const dv=new DataView(chunk.buffer);dv.setUint32(0,9);chunk.set([0x70,0x48,0x59,0x73],4);dv.setUint32(8,ppm);dv.setUint32(12,ppm);chunk[16]=1;dv.setUint32(17,figCrc32(chunk.subarray(4,17)));
  const ihdrEnd=8+4+4+13+4;const out=new Uint8Array(src.length+chunk.length);out.set(src.subarray(0,ihdrEnd),0);out.set(chunk,ihdrEnd);out.set(src.subarray(ihdrEnd),ihdrEnd+chunk.length);let s='';for(let i=0;i<out.length;i+=0x8000)s+=String.fromCharCode.apply(null,out.subarray(i,i+0x8000));return 'data:image/png;base64,'+btoa(s);}catch(e){return url;}}
async function figToPng(svg,w,h,dpi){if(typeof figInlineImages==='function'&&svg.includes('/api/img/'))svg=await figInlineImages(svg); // 画像パネルの画像を埋め込む
  return new Promise((res,rej)=>{const scale=(dpi||300)/96;const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);const g=c.getContext('2d');const im=new Image();im.onload=()=>{g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);res(c);};im.onerror=e=>rej(new Error('描画に失敗しました'));im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});}


// Electron は window.prompt を持たないので、アプリ内の入力ダイアログを使う。Promise<string|null>
function figPrompt(title,def,opt){opt=opt||{};return new Promise(res=>{let dlg=document.querySelector('#figPromptDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='figPromptDlg';dlg.innerHTML=`<h2 id="figPromptTitle" style="font-size:14px"></h2><div id="figPromptHint" class="hint" style="white-space:pre-wrap;margin-bottom:6px"></div><input id="figPromptIn" type="text" style="width:100%"><textarea id="figPromptTa" style="width:100%;min-height:160px;font:12px ui-monospace,Menlo,monospace;display:none"></textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="small" id="figPromptCancel">取消</button><button class="small primary" id="figPromptOk">OK</button></div>`;dlg.style.maxWidth='520px';document.body.appendChild(dlg);}
  const inp=dlg.querySelector('#figPromptIn'),ta=dlg.querySelector('#figPromptTa');dlg.querySelector('#figPromptTitle').textContent=title||'';dlg.querySelector('#figPromptHint').textContent=opt.hint||'';inp.style.display=opt.multiline?'none':'';ta.style.display=opt.multiline?'':'none';const f=opt.multiline?ta:inp;f.value=def==null?'':String(def);
  const done=v=>{dlg.close();dlg.onclose=null;res(v);};dlg.querySelector('#figPromptOk').onclick=()=>done(f.value);dlg.querySelector('#figPromptCancel').onclick=()=>done(null);dlg.onclose=()=>res(null);inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();done(f.value);}};dlg.showModal();setTimeout(()=>{f.focus();f.select();},30);});}
/* ---------- 表ファイルの読み込み（CSV / TSV / XLSX）。XLSX は ZIP を自前で読み、DecompressionStream('deflate-raw') で展開する ---------- */
async function figReadTableFile(file){const name=String(file.name||'');if(/\.xlsx$/i.test(name)||/spreadsheetml/.test(file.type))return figReadXlsx(await file.arrayBuffer());const text=await file.text();return [{name:name.replace(/\.[^.]+$/,''),tsv:figCsvToTsv(text)}];}
function figCsvToTsv(text){const t=String(text).replace(/^﻿/,'').replace(/\r/g,'');if(t.includes('\t'))return t;const rows=[];let row=[],cell='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=ch;}else if(ch==='"')q=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}else cell+=ch;}if(cell!==''||row.length){row.push(cell);rows.push(row);}return rows.map(r=>r.join('\t')).join('\n');}
async function figUnzip(buf){const dv=new DataView(buf);let eocd=-1;for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-70000);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}}if(eocd<0)throw new Error('ZIP ではありません');const n=dv.getUint16(eocd+10,true),cd=dv.getUint32(eocd+16,true);const files={};let p=cd;
  for(let k=0;k<n;k++){if(dv.getUint32(p,true)!==0x02014b50)break;const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),fn=dv.getUint16(p+28,true),ex=dv.getUint16(p+30,true),cm=dv.getUint16(p+32,true),lh=dv.getUint32(p+42,true);const nm=new TextDecoder().decode(new Uint8Array(buf,p+46,fn));const lfn=dv.getUint16(lh+26,true),lex=dv.getUint16(lh+28,true);const data=new Uint8Array(buf,lh+30+lfn+lex,csize);files[nm]={method,data};p+=46+fn+ex+cm;}
  const out={};for(const [nm,f] of Object.entries(files)){if(!/\.(xml|rels)$/.test(nm))continue;let bytes;if(f.method===0)bytes=f.data;else if(f.method===8){const ds=new DecompressionStream('deflate-raw');const w=ds.writable.getWriter();w.write(f.data);w.close();bytes=new Uint8Array(await new Response(ds.readable).arrayBuffer());}else continue;out[nm]=new TextDecoder().decode(bytes);}return out;}
async function figReadXlsx(buf){const z=await figUnzip(buf);const parse=x=>new DOMParser().parseFromString(x,'application/xml');const ss=[];if(z['xl/sharedStrings.xml'])[...parse(z['xl/sharedStrings.xml']).getElementsByTagName('si')].forEach(si=>ss.push([...si.getElementsByTagName('t')].map(t=>t.textContent).join('')));
  const wb=z['xl/workbook.xml']?parse(z['xl/workbook.xml']):null;const rels=z['xl/_rels/workbook.xml.rels']?parse(z['xl/_rels/workbook.xml.rels']):null;const relMap={};if(rels)[...rels.getElementsByTagName('Relationship')].forEach(r=>relMap[r.getAttribute('Id')]=r.getAttribute('Target'));
  const sheets=wb?[...wb.getElementsByTagName('sheet')].map(sh=>({name:sh.getAttribute('name'),path:'xl/'+String(relMap[sh.getAttribute('r:id')]||'').replace(/^\/?xl\//,'').replace(/^\//,'')})):Object.keys(z).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).map(k=>({name:k,path:k}));
  const col=ref=>{let c=0;for(const ch of ref.replace(/\d+/g,''))c=c*26+(ch.charCodeAt(0)-64);return c-1;};const out=[];
  for(const sh of sheets){const xml=z[sh.path];if(!xml)continue;const doc=parse(xml);const rows=[];[...doc.getElementsByTagName('row')].forEach(r=>{const cells=[];[...r.getElementsByTagName('c')].forEach(c=>{const ref=c.getAttribute('r')||'';const ci=ref?col(ref):cells.length;const t=c.getAttribute('t');let v='';const vEl=c.getElementsByTagName('v')[0];if(t==='s'){v=ss[+(vEl?vEl.textContent:0)]||'';}else if(t==='inlineStr'){v=[...c.getElementsByTagName('t')].map(x=>x.textContent).join('');}else if(t==='b'){v=vEl&&vEl.textContent==='1'?'TRUE':'FALSE';}else v=vEl?vEl.textContent:'';while(cells.length<ci)cells.push('');cells[ci]=v;});rows.push(cells);});
    const w=Math.max(0,...rows.map(r=>r.length));const tsv=rows.filter(r=>r.some(v=>v!=='')).map(r=>{while(r.length<w)r.push('');return r.map(v=>String(v).replace(/[\t\n]/g,' ')).join('\t');}).join('\n');if(tsv.trim())out.push({name:sh.name,tsv});}
  if(!out.length)throw new Error('シートに表がありません');return out;}
// Figure 作成画面に表ファイルを読み込む（複数シートなら選ばせる）
async function figLoadTableFiles(files){const f=[...files].find(x=>/\.(xlsx|csv|tsv|txt)$/i.test(x.name)||/csv|tab|excel|spreadsheet|text\/plain/.test(x.type));if(!f){toast('CSV / TSV / XLSX のファイルを選んでください');return;}
  try{const sheets=await figReadTableFile(f);let sh=sheets[0];if(sheets.length>1){const pick=await figPrompt('シートを選んでください（番号）','1',{hint:sheets.map((x,i)=>`${i+1}. ${x.name}`).join('\n')});if(pick==null)return;const k=+pick-1;if(!(k>=0&&k<sheets.length))return;sh=sheets[k];}
    const ta=document.querySelector('#figData');ta.value=sh.tsv;figState.text=sh.tsv;figSync();figPushUndo();toast(`「${sh.name}」を読み込みました（${sh.tsv.split('\n').length} 行）。表の型とグラフを選んでください`);}catch(e){toast('読み込めませんでした: '+e.message);}}
// チャットのブロックで文字をダブルクリック → 編集（空にすると削除）
async function figNoteEditBlock(fb,k){const nid=fb.dataset.fignode,idx=+fb.dataset.figidx;const nd=N(nid);if(!nd)return;const b=figFindBlocks(nd.content)[idx];if(!b)return;let j;try{j=JSON.parse(b.json);}catch(e){return;}let target=j;const svg=fb.querySelector(':scope > svg');const el=svg&&svg.querySelector(`[data-note="${k}"]`);const panelEl=el&&el.closest('svg[data-panel]');if(panelEl&&j.panels)target=j.panels[+panelEl.getAttribute('data-panel')];const n=target&&target.style&&target.style.notes&&target.style.notes[k];if(!n)return;
  const v=await figPrompt('書き込んだ文字を編集（空にして OK で削除）',n.text||'');if(v==null)return;if(!v.trim())target.style.notes.splice(k,1);else n.text=v;nd.content=nd.content.slice(0,b.start)+'```figure\n'+JSON.stringify(j)+'\n```'+nd.content.slice(b.end);persist();renderAll();}
// 注釈（文字）のドラッグ終了。chat のブロックは書き戻し、作成画面は状態を更新
// ROC のカットオフ文字（data-cut=系列番号）: ドラッグで series[i].cutDx/cutDy（プロット領域に対する割合）を、ダブルクリックで cutText を書く
function figCutTarget(fb,i){const nid=fb.dataset.fignode,idx=+fb.dataset.figidx;const nd=N(nid);if(!nd)return null;const b=figFindBlocks(nd.content)[idx];if(!b)return null;let j;try{j=JSON.parse(b.json);}catch(e){return null;}let target=j;const svg=fb.querySelector(':scope > svg');const el=svg&&svg.querySelector(`[data-cut="${i}"]`);const panelEl=el&&el.closest('svg[data-panel]');if(panelEl&&j.panels)target=j.panels[+panelEl.getAttribute('data-panel')];if(!target)return null;target.style=target.style||{};target.style.series=target.style.series||{};target.style.series[i]=target.style.series[i]||{};return {nd,b,j,target,ov:target.style.series[i]};}
function figCutWrite(t){t.nd.content=t.nd.content.slice(0,t.b.start)+'```figure\n'+JSON.stringify(t.j)+'\n```'+t.nd.content.slice(t.b.end);persist();renderAll();}
function figCutDragEnd(fb,i,dx,dy){if(fb.id==='figPreview'){const st=figState;if(!st||!st.plot)return;const o=st.opts;o.series=o.series||{};o.series[i]=o.series[i]||{};o.series[i].cutDx=+((+o.series[i].cutDx||0)+dx/st.plot.w).toFixed(3);o.series[i].cutDy=+((+o.series[i].cutDy||0)+dy/st.plot.h).toFixed(3);figSync();figPushUndo();return;}
  const t=figCutTarget(fb,i);if(!t)return;const r=figRenderSpec(t.target);if(!r||!r.plot)return;t.ov.cutDx=+((+t.ov.cutDx||0)+dx/r.plot.w).toFixed(3);t.ov.cutDy=+((+t.ov.cutDy||0)+dy/r.plot.h).toFixed(3);figCutWrite(t);}
async function figCutEditBlock(fb,i){const t=figCutTarget(fb,i);if(!t)return;const s=await figPrompt('カットオフの文字を書き換える',t.ov.cutText||'',{hint:'空にすると自動の文字（≥ 6.8 など）に戻ります。消すには「消す」と入力'});if(s==null)return;if(s.trim()==='消す'){t.ov.cutHide=true;delete t.ov.cutText;}else if(!s)delete t.ov.cutText;else t.ov.cutText=s;figCutWrite(t);}
function figNoteDragEnd(fb,k,dx,dy){if(fb.id==='figPreview'){const st=figState;const n=st&&st.opts.notes&&st.opts.notes[k];if(!n||!st.plot)return;n.x=+((+n.x||0)+dx/st.plot.w).toFixed(3);n.y=+((+n.y||0)+dy/st.plot.h).toFixed(3);figSync();figPushUndo();return;}
  const nid=fb.dataset.fignode,idx=+fb.dataset.figidx;const nd=N(nid);if(!nd)return;const b=figFindBlocks(nd.content)[idx];if(!b)return;let j;try{j=JSON.parse(b.json);}catch(e){return;}let target=j;const svg=fb.querySelector(':scope > svg');const panelEl=svg&&svg.querySelector(`[data-note="${k}"]`)&&svg.querySelector(`[data-note="${k}"]`).closest('svg[data-panel]');if(panelEl&&j.panels)target=j.panels[+panelEl.getAttribute('data-panel')];if(!target)return;
  const r=figRenderSpec(target);const n=target.style&&target.style.notes&&target.style.notes[k];if(!n||!r||!r.plot)return;n.x=+((+n.x||0)+dx/r.plot.w).toFixed(3);n.y=+((+n.y||0)+dy/r.plot.h).toFixed(3);nd.content=nd.content.slice(0,b.start)+'```figure\n'+JSON.stringify(j)+'\n```'+nd.content.slice(b.end);persist();renderAll();}
/* ---------- 仕様（チャットとの受け渡し） ---------- */
// ```figure の中の JSON: {title, kind, type, err, compare, ctrl, ytitle, xtitle, ymin, ymax, data(TSV), style:{...}}
function figSpecFromState(st){return Object.assign({},st.opts.x||{},{title:st.title||'',kind:st.kind,type:st.type,err:st.opts.errType,compare:st.cmp||'none',ctrl:st.ctrl||0,ytitle:st.opts.yTitle||'',xtitle:st.opts.xTitle||'',ymin:st.opts.ymin||'',ymax:st.opts.ymax||'',data:st.text,style:figStyleOf(st.opts)});}
const FIG_STYLE_KEYS=['notes','fontPt','bold','axisPt','tickLen','wIn','hIn','symPt','linePt','barFill','bracketShape','pStyle','showNs','legend','scheme','series','barDots','legendPos','frame','grid','tickDir','ylog','xRot','barEdge','fontFamily','refLine','errDir','fillAlpha','capW','axisColor'];
function figStyleOf(o){const st={};for(const k of FIG_STYLE_KEYS)if(o[k]!==undefined&&o[k]!==''&&o[k]!==null)st[k]=o[k];return st;}
function figStateFromSpec(j){j=j||{};const opts=Object.assign({errType:j.err||'SD',pThr:0.05,pStyle:'GP',showNs:false,yTitle:j.ytitle||'',xTitle:j.xtitle||'',ymin:j.ymin==null?'':j.ymin,ymax:j.ymax==null?'':j.ymax,barFill:'solid',bracketShape:'long'},j.style||{});
  const known=new Set(['title','kind','type','err','compare','ctrl','ytitle','xtitle','ymin','ymax','data','style']);const x={};for(const k of Object.keys(j))if(!known.has(k))x[k]=j[k];if(Object.keys(x).length)opts.x=x; // 図種固有の追加項目（GSEA の nes/pval/fdr など）は opts.x に保ち、書き戻しで元に戻す
  if(opts.scheme&&FIG_SCHEMES[opts.scheme])opts.colors=FIG_SCHEMES[opts.scheme];
  return {text:String(j.data||'').trim(),kind:j.kind||'',type:j.type||'',opts,title:j.title||'',cmp:j.compare||'none',ctrl:+(j.ctrl||0)};}
function figRenderSpec(j){if(typeof figRenderLayout==='function'&&figIsLayout(j))return figRenderLayout(j); // figure-layout.js
  if(typeof figRenderImage==='function'&&figIsImage(j))return figRenderImage(j); // figure-image.js
  if(typeof figRenderSchematic==='function'&&figIsSchematic(j))return figRenderSchematic(j); // figure-schematic.js
  const st=figStateFromSpec(j);const parsed=figParseTable(st.text);if(!parsed)return null;const kind=st.kind||figAutoKind(parsed);const data=figBuildData(parsed,kind);if(!data)return null;const types=FIG_TYPES[kind]||FIG_TYPES.column;const type=types.some(t=>t[0]===st.type)?st.type:types[0][0];
  const compare=st.cmp!=='none'?(kind==='column'?figCompare(data.groups,st.cmp,st.ctrl):kind==='grouped'?figCompareGrouped(data,st.cmp,st.ctrl):null):null;return figRender({data,type,opts:st.opts,title:st.title,compare,cmp:st.cmp,ctrl:st.ctrl,legend:st.opts.legend||'right'});}
const FIG_SCHEMES={prism:['#0000FF','#FF0000','#00C000','#A000E0','#FF8000','#000000','#906020','#000080','#600050'],colorblind:['#0072B2','#D55E00','#009E73','#CC79A7','#E69F00','#56B4E9','#F0E442','#000000'],gray:['#000000','#707070','#B0B0B0','#404040','#909090','#D0D0D0'],nature:['#E64B35','#4DBBD5','#00A087','#3C5488','#F39B7F','#8491B4','#91D1C2','#DC0000']};
// AI に渡す書き方の説明（buildContext から参照）
let FIG_PROMPT=`## 図（Figure）の作り方
利用者に図・グラフを求められたら、説明のあとに次の形の \`\`\`figure ブロックを1つ出してください（アプリがその場で描画します）。データは利用者が示した数値を使い、無ければ仮の数値だと明記します。
\`\`\`figure
{"title":"任意","kind":"column|grouped|xy","type":"scatter|bar|box|violin|grouped-bar|grouped-scatter|xy-line|xy-points","err":"SD|SEM|CI","compare":"none|all|dunnett","ytitle":"Y 軸の題","xtitle":"X 軸の題","data":"A\\tB\\tC\\n1\\t2\\t3\\n..."}
\`\`\`
data はタブ区切り。column は列＝群・行＝反復、grouped は1列目＝カテゴリで同名の列が反復、xy は1列目＝X。compare は column と grouped で使える（all=全比較: 2 群なら Welch t、3 群以上は ANOVA+Tukey。dunnett=対照群と比較。grouped はカテゴリごとに群を比較してブラケットを付ける）。
"style" で指定できる主な項目（利用者が「点も重ねて」「幅を広く」などと言ったら使う。編集画面の設定と同じもの）: wIn/hIn（プロット領域の幅・高さ in、既定 3×2）, fontPt（文字 pt、既定 12）, barDots:true（棒・箱・バイオリンに個々の点を重ねる）, legendPos:"right|bottom|none", scheme:"prism|colorblind|gray|nature", series:[{color,symbol,symPt,fill:"open"}], ylog:true, refLine（基準線の Y）, xRot（X ラベルの角度）, grid:"major", frame:"box", stackLabels:"percent|value"（積み上げ棒の区分の文字）, errDir, capW。
図種固有の項目は「図種の設定」と同じキー: survCI/survMedian/survRisk（生存）, rocFill/rocCutoff, forestLog:"true|false"/forestNull（フォレスト: OR/HR/RR なら対数軸）, pcaEllipse:true（PCA の 95% 楕円）, hmCluster:"rows|cols|both"/hmZ（ヒートマップ）, regBand:"ci|pi", doseBand/doseCI（用量反応）, spColor:"subject"（SuperPlot を個体ごとに色分け）, pieLabels:"percent|value|both", volLabels, mhLabels。
注意: できないと決めつけない。幅・高さ・文字サイズ・点の重ね描き・楕円・HR・at-risk 表・対数軸はすべて指定できる。ROC の AUC と 95% CI、KM の log-rank P と HR、用量反応の EC50/IC50・Hill・R²、酵素反応の Vmax/Km、回帰の r/R²/P は自動で図に書かれる（「要確認」と言わず、書かれると説明する）。xy で記号を消すには style.symPt を 0。bland-altman の差は 1 列目 − 2 列目（ytitle もその向きで書く）。列名は意味が伝わるもの（例: OR, Lower, Upper, P）にする。`;


/* ---------- ツールメニュー（Prism のリボンにならった編集ボタン） ---------- */
// 各項目: {k:opts のキー, t:種類 select|num|check|color|text|btn, l:ラベル, o:選択肢, min,max,step, act:ボタンの動作}
const FIG_TOOLS=[
 {id:'graph',l:'グラフ',items:[
   {k:'__gallery',t:'btn',l:'▦ 図の一覧から選ぶ（見本つき）'},
   {k:'__type',t:'select',l:'種類（いまの表の形で描けるもの）',o:()=>(FIG_TYPES[figState.kind]||FIG_TYPES.column)},
   {k:'errType',t:'select',l:'誤差',o:[['SD','SD'],['SEM','SEM'],['CI','95% CI'],['none','なし']]},
   {k:'errDir',t:'select',l:'誤差棒の向き',o:[['auto','自動（棒は上のみ）'],['both','上下'],['up','上のみ']]},
   {k:'capW',t:'num',l:'キャップ幅（棒幅×）',min:0,max:1.5,step:0.1},
   {k:'barDots',t:'check',l:'棒・箱・バイオリンに点を重ねる'},
   {k:'barFill',t:'select',l:'棒の塗り',o:[['solid','塗り'],['open','白抜き']]},
   {k:'fillAlpha',t:'num',l:'塗りの濃さ (0–1)',min:0.1,max:1,step:0.1},
   {k:'barEdge',t:'select',l:'棒・点の縁',o:[['series','系列の色'],['black','黒']]},
   {k:'symPt',t:'num',l:'記号の大きさ (pt)',min:2,max:20,step:0.5},
   {k:'linePt',t:'num',l:'線の太さ (pt)',min:0.25,max:6,step:0.25},
 ]},
 {id:'axes',l:'軸',items:[
   {k:'frame',t:'select',l:'枠',o:[['L','L 字（既定）'],['box','四方の枠'],['none','左 Y と下 X のみ']]},
   {k:'axisPt',t:'num',l:'軸の太さ (pt)',min:0.25,max:4,step:0.25},
   {k:'axisColor',t:'color',l:'軸の色'},
   {k:'tickDir',t:'select',l:'目盛の向き',o:[['out','外向き'],['in','内向き']]},
   {k:'tickLen',t:'num',l:'目盛の長さ（数字の高さ×）',min:0,max:3,step:0.1},
   {k:'grid',t:'select',l:'グリッド',o:[['none','なし'],['major','主目盛']]},
   {k:'ylog',t:'check',l:'Y 軸を対数に'},
   {k:'ymin',t:'text',l:'Y の最小（空で自動）'},
   {k:'ymax',t:'text',l:'Y の最大（空で自動）'},
   {k:'refLine',t:'text',l:'基準線（Y の値、空でなし）'},
   {k:'xRot',t:'select',l:'X ラベルの回転',o:[['0','なし'],['45','45°'],['90','90°']]},
 ]},
 {id:'text',l:'文字',items:[
   {k:'fontFamily',t:'select',l:'書体',o:[['arial','Arial'],['helvetica','Helvetica'],['times','Times New Roman'],['noto','IBM Plex Sans JP（日本語）']]},
   {k:'fontPt',t:'num',l:'大きさ (pt)',min:6,max:24,step:1},
   {k:'bold',t:'check',l:'太字'},
   {k:'__title',t:'text',l:'題名'},
   {k:'yTitle',t:'text',l:'Y 軸の題'},
   {k:'xTitle',t:'text',l:'X 軸の題'},
 ]},
 {id:'color',l:'配色',items:[
   {k:'scheme',t:'select',l:'配色セット',o:[['prism','既定（青・赤・緑…）'],['colorblind','色覚多様性に配慮'],['nature','誌面風'],['gray','グレースケール']]},
   {k:'__seriesColors',t:'series'},
 ]},
 {id:'annot',l:'注釈',items:[
   {k:'__noteHint',t:'hint',l:'自由な文字（例: n = 20、p = 0.03、≥ 6.8）をグラフの好きな場所に書き込めます。ボタンを押してからプレビューの書きたい場所をクリック → 文字を入力。書いた文字はドラッグで動かせます。'},{k:'__noteAdd',t:'btn',l:'＋ グラフに文字を書き込む'},{k:'__noteSize',t:'select',l:'書き込む文字の大きさ',o:[['0.7','小'],['0.85','ふつう'],['1','本文と同じ'],['1.2','大']]},{k:'__noteColor',t:'color',l:'書き込む文字の色'},{k:'__noteDel',t:'btn',l:'最後に書き込んだ文字を消す'},
   {k:'__cmp',t:'select',l:'有意差',o:[['none','なし'],['all','全比較'],['dunnett','対照群と比較']]},
   {k:'bracketShape',t:'select',l:'ブラケットの形',o:[['long','長脚'],['short','短脚']]},
   {k:'pStyle',t:'select',l:'P の表示',o:[['GP','アスタリスク'],['num','数値']]},
   {k:'showNs',t:'check',l:'ns も表示'},
   {k:'legendPos',t:'select',l:'凡例',o:[['right','右'],['bottom','下'],['none','なし']]},
 ]},
 {id:'size',l:'大きさ',items:[
   {k:'__preset',t:'select',l:'形',o:[['wide','横長 3×2 in（既定）'],['square','正方形 2.5×2.5 in'],['tall','縦長 2×3 in'],['small','小 2×1.4 in']]},
   {k:'wIn',t:'num',l:'幅 (in)',min:1,max:8,step:0.25},
   {k:'hIn',t:'num',l:'高さ (in)',min:1,max:8,step:0.25},
 ]},
];
const FIG_PRESETS={wide:[3,2],square:[2.5,2.5],tall:[2,3],small:[2,1.4]};
let figUndo=[],figRedo=[],figUndoTimer=null;
function figSnap(){const st=figState;return JSON.stringify({text:st.text,kind:st.kind,type:st.type,opts:st.opts,title:st.title,cmp:st.cmp,ctrl:st.ctrl});}
function figPushUndo(){const snap=figSnap();if(figUndo[figUndo.length-1]===snap)return;figUndo.push(snap);if(figUndo.length>60)figUndo.shift();figRedo=[];figUndoBtns();}
function figRestore(snap){const j=JSON.parse(snap);Object.assign(figState,j);const $=s=>document.querySelector(s);$('#figData').value=j.text;$('#figTitle').value=j.title||'';$('#figKind').value=j.kind;$('#figCmp').value=j.cmp||'none';document.querySelectorAll('#figDlg [data-fopt]').forEach(el=>{const v=j.opts[el.dataset.fopt];if(el.type==='checkbox')el.checked=!!v;else el.value=v==null?'':v;});figSync(false);}
function figUndoBtns(){const u=document.querySelector('#figUndoBtn'),r=document.querySelector('#figRedoBtn');if(u)u.disabled=figUndo.length<2;if(r)r.disabled=!figRedo.length;}
function figDoUndo(){if(figUndo.length<2)return;figRedo.push(figUndo.pop());figRestore(figUndo[figUndo.length-1]);figUndoBtns();}
function figDoRedo(){if(!figRedo.length)return;const s=figRedo.pop();figUndo.push(s);figRestore(s);figUndoBtns();}
function figToolsHTML(){return `<div class="figTools"><button class="small" id="figUndoBtn" data-tip="元に戻す">↶</button><button class="small" id="figRedoBtn" data-tip="やり直す">↷</button><span class="sep"></span><button class="small primary" data-fact="gallery" data-tip="図の見本の一覧から種類を選ぶ">▦ 図の一覧</button>${FIG_TOOLS.map(g=>`<div class="ftm" data-ftm="${g.id}"><button class="small">${g.l} ▾</button><div class="ftp" id="ftp-${g.id}"></div></div>`).join('')}<span class="sep"></span><button class="small" data-fact="copy" data-tip="画像をコピー">⧉ コピー</button><button class="small" data-fact="png" data-tip="PNG 300 dpi">PNG</button><button class="small" data-fact="png600" data-tip="PNG 600 dpi">PNG 600</button><button class="small" data-fact="svg" data-tip="SVG">SVG</button></div>`;}
function figToolPanel(g){
  const st=figState,o=st.opts;const val=k=>k==='__type'?st.type:k==='__title'?st.title:k==='__cmp'?st.cmp:k==='__noteSize'?(st.noteSize||'0.85'):k==='__noteColor'?(st.noteColor||'#000000'):k==='__preset'?(Object.entries(FIG_PRESETS).find(([n,v])=>v[0]==+(o.wIn||3)&&v[1]==+(o.hIn||2))||['custom'])[0]:(o[k]===undefined?(FIG_DEF[k]===undefined?'':FIG_DEF[k]):o[k]);
  if(!g.items.length)return '<div class="hint">この図種に固有の設定はありません</div>';
  return g.items.map(it=>{if(it.t==='series'){const gs=(st.data&&st.data.groups)||[];return gs.map((gr,i)=>{const so=figSeriesOpt(o,i);return `<div class="irow"><label>${figEsc(gr.name)}</label><span class="srow"><input type="color" data-tk="series.${i}.color" value="${so.color}"><select data-tk="series.${i}.symbol">${FIG_SYMBOLS.map(([a,b])=>`<option value="${a}"${a===so.symbol?' selected':''}>${b}</option>`).join('')}</select><select data-tk="series.${i}.fill"><option value="solid"${so.fill==='solid'?' selected':''}>塗り</option><option value="open"${so.fill==='open'?' selected':''}>白抜き</option></select></span></div>`;}).join('')||'<div class="hint">データを入れると系列ごとの色が出ます</div>';}
    const v=val(it.k);const opts=typeof it.o==='function'?it.o():it.o;
    if(it.t==='select')return `<div class="irow"><label>${it.l}</label><select data-tk="${it.k}">${(opts||[]).map(([a,b])=>`<option value="${a}"${String(a)===String(v)?' selected':''}>${b}</option>`).join('')}</select></div>`;
    if(it.t==='num')return `<div class="irow"><label>${it.l}</label><input type="number" data-tk="${it.k}" value="${v===''?'':v}" min="${it.min}" max="${it.max}" step="${it.step}"></div>`;
    if(it.t==='check')return `<label class="irow chk"><input type="checkbox" data-tk="${it.k}"${v&&v!=='0'?' checked':''}> ${it.l}</label>`;
    if(it.t==='color')return `<div class="irow"><label>${it.l}</label><input type="color" data-tk="${it.k}" value="${v||'#000000'}"></div>`;
    if(it.t==='btn')return `<div class="irow"><button type="button" class="small" data-tbtn="${it.k}">${it.l}</button></div>`;
    if(it.t==='hint')return `<div class="hint" style="margin:2px 0 6px">${it.l}</div>`;
    return `<div class="irow"><label>${it.l}</label><input type="text" data-tk="${it.k}" value="${figEsc(v==null?'':v)}"></div>`;}).join('');
}
function figApplyTool(k,v){
  const st=figState,o=st.opts;const $=s=>document.querySelector(s);
  if(k==='__gallery'){document.querySelectorAll('#figToolbar .ftm.open').forEach(x=>x.classList.remove('open'));figGalleryOpen();return;}
  if(k==='__noteSize'){st.noteSize=v;return;}if(k==='__noteColor'){st.noteColor=v;return;}
  if(k==='__noteAdd'){st.noteTool=!st.noteTool;document.querySelectorAll('#figToolbar .ftm.open').forEach(x=>x.classList.remove('open'));toast(st.noteTool?'右のプレビュー（グラフ）の、文字を書きたい場所をクリックしてください':'文字の書き込みをやめました');return;}
  if(k==='__noteDel'){if(o.notes&&o.notes.length){o.notes.pop();figSync();figPushUndo();}else toast('消す文字がありません');return;}
  if(k==='__type'){st.type=v;$('#figType').value=v;}
  else if(k==='__title'){st.title=v;$('#figTitle').value=v;}
  else if(k==='__cmp'){st.cmp=v;$('#figCmp').value=v;}
  else if(k==='__preset'){const p=FIG_PRESETS[v];if(p){o.wIn=p[0];o.hIn=p[1];}}
  else if(k.startsWith('series.')){const [,i,prop]=k.split('.');o.series=o.series||{};o.series[i]=o.series[i]||{};o.series[i][prop]=v;}
  else if(k==='scheme'){o.scheme=v;o.colors=FIG_SCHEMES[v];delete o.series;}
  else{o[k]=v;const f=document.querySelector(`#figDlg [data-fopt="${k}"]`);if(f){if(f.type==='checkbox')f.checked=!!v;else f.value=v;}}
  figSync(false);
}
function figToolsInit(){
  const bar=document.querySelector('#figToolbar');bar.innerHTML=figToolsHTML();
  bar.querySelectorAll('.ftm > button').forEach(b=>b.onclick=e=>{e.stopPropagation();const m=b.parentElement;const open=m.classList.contains('open');bar.querySelectorAll('.ftm.open').forEach(x=>x.classList.remove('open'));if(!open){const g=FIG_TOOLS.find(x=>x.id===m.dataset.ftm);m.querySelector('.ftp').innerHTML=figToolPanel(g);figBindTools(m.querySelector('.ftp'));m.classList.add('open');}});
  bar.querySelectorAll('.ftp').forEach(p=>p.addEventListener('click',e=>e.stopPropagation()));
  document.addEventListener('click',()=>bar.querySelectorAll('.ftm.open').forEach(x=>x.classList.remove('open')));
  bar.querySelector('#figUndoBtn').onclick=figDoUndo;bar.querySelector('#figRedoBtn').onclick=figDoRedo;
  bar.querySelectorAll('[data-fact]').forEach(b=>b.onclick=()=>{const act=b.dataset.fact;if(act==='gallery')figGalleryOpen();else if(act==='copy')document.querySelector('#figCopy').click();else if(act==='svg')document.querySelector('#figSvg').click();else figSavePng(act==='png600'?600:300);});
  document.addEventListener('keydown',e=>{if(!document.querySelector('#figDlg').open)return;const mod=e.metaKey||e.ctrlKey;if(mod&&e.key==='z'&&!e.shiftKey){e.preventDefault();figDoUndo();}else if(mod&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();figDoRedo();}});
}
function figBindTools(panel){panel.querySelectorAll('[data-tbtn]').forEach(b=>{b.addEventListener('click',()=>figApplyTool(b.dataset.tbtn,true));});panel.querySelectorAll('[data-tk]').forEach(el=>{el.addEventListener(el.type==='checkbox'||el.type==='color'||el.tagName==='SELECT'?'change':'input',()=>{const k=el.dataset.tk;let v=el.type==='checkbox'?el.checked:el.value;if(k==='bold'||k==='showNs'||k==='ylog'||k==='barDots')v=!!v;figApplyTool(k,v);const g=FIG_TOOLS.find(x=>x.id===panel.id.replace('ftp-',''));if(g&&g.id==='graph'&&k==='__type'){panel.innerHTML=figToolPanel(g);figBindTools(panel);}});});}
async function figSavePng(dpi){if(!figState.svg)return;const c=await figToPng(figState.svg,figState.w,figState.h,dpi);const a=document.createElement('a');a.href=figPngDataURL(c,dpi);a.download=`figure_${Date.now()}_${dpi}dpi.png`;a.click();toast(`PNG（${dpi} dpi）を保存しました`);}

/* ---------- 画面 ---------- */
const FIG_TYPES={column:[['scatter','散布ドット＋平均±誤差'],['bar','棒＋誤差'],['box','箱ひげ'],['violin','バイオリン']],grouped:[['grouped-bar','集合棒＋誤差'],['grouped-scatter','集合散布']],xy:[['xy-line','折れ線＋記号＋誤差'],['xy-points','散布（全点）']]};
const FIG_SYMBOLS=[['circle','● 丸'],['square','■ 四角'],['triangle','▲ 三角'],['triangle-down','▼ 逆三角'],['diamond','◆ ひし形'],['plus','＋'],['cross','×']];
let figState=null;
function figOpen(init){
  const $=s=>document.querySelector(s);
  figState=Object.assign({text:'',kind:'',type:'',opts:{errType:'SD',pThr:0.05,pStyle:'GP',showNs:false,yTitle:'',xTitle:'',ymin:'',ymax:'',barFill:'solid',bracketShape:'long',legend:'right',scheme:'prism'},title:'',cmp:'none',ctrl:0,sel:null,src:null},init||{});
  if(!figState.text)figState.text='Control\tTreated\n12.1\t15.4\n11.8\t16.0\n12.6\t14.9\n13.0\t15.8\n12.3\t16.3';
  $('#figData').value=figState.text;$('#figTitle').value=figState.title||'';$('#figKind').value=figState.kind||'column';$('#figCmp').value=figState.cmp||'none';
  document.querySelectorAll('#figDlg [data-fopt]').forEach(el=>{const v=figState.opts[el.dataset.fopt];if(el.type==='checkbox')el.checked=!!v;else el.value=v==null?'':v;});
  $('#figUpdate').style.display=figState.src?'':'none';
  figUndo=[];figRedo=[];
  figSync(true);figPushUndo();$('#figDlg').showModal();
}
function figSync(reset){
  const $=s=>document.querySelector(s);const st=figState;st.text=$('#figData').value;st.title=$('#figTitle').value.trim();
  const parsed=figParseTable(st.text);const autoKind=parsed?figAutoKind(parsed):'column';
  if(reset||!st.kind){st.kind=st.kind||autoKind;}
  const kindSel=$('#figKind');if(kindSel.value!==st.kind)kindSel.value=st.kind;
  const types=FIG_TYPES[st.kind]||FIG_TYPES.column;if(!types.some(t=>t[0]===st.type))st.type=types[0][0];
  $('#figType').innerHTML=types.map(t=>`<option value="${t[0]}"${t[0]===st.type?' selected':''}>${t[1]}</option>`).join('');
  const data=figBuildData(parsed,st.kind);st.data=data;
  $('#figCmpRow').style.display=(st.kind==='column'||st.kind==='grouped'||st.kind==='nested')?'':'none';
  let compare=null,note='';
  if(data&&(st.kind==='column'||st.kind==='grouped')&&st.cmp!=='none'){compare=st.kind==='grouped'?figCompareGrouped(data,st.cmp,st.ctrl):figCompare(data.groups,st.cmp,st.ctrl);note=compare.note||'';
    $('#figCtrl').innerHTML=data.groups.map((g,i)=>`<option value="${i}"${i===st.ctrl?' selected':''}>${g.name}</option>`).join('');$('#figCtrl').style.display=st.cmp==='dunnett'?'':'none';}
  else{$('#figCtrl').style.display='none';}
  if(st.opts.scheme&&FIG_SCHEMES[st.opts.scheme])st.opts.colors=FIG_SCHEMES[st.opts.scheme];
  const spec={data,type:st.type,opts:st.opts,title:st.title,compare,cmp:st.cmp,ctrl:st.ctrl,legend:st.opts.legend||'right'};st.spec=spec;
  try{const r=figRender(spec);st.svg=r.svg;st.w=r.w;st.h=r.h;st.res=r.res||null;st.plot=r.plot||null;$('#figPreview').innerHTML=r.svg||'<div class="hint">データを貼り付けてください</div>';}
  catch(e){$('#figPreview').innerHTML='<div class="hint">描画できませんでした: '+figEsc(e.message)+'</div>';st.svg='';}
  figMarkSel();if(!st.typing)figInspector(); // 右の欄で入力中は作り直さない（フォーカスが外れて 1 文字ずつしか打てなくなる）
  $('#figStats').innerHTML=figStatsHTML(data,compare,note,st);
  clearTimeout(figUndoTimer);figUndoTimer=setTimeout(figPushUndo,400);
}
// 左下の結果表（figure-more.js の図種は figStatsMore が先に返す）
function figStatsHTML(data,compare,note,st){
  if(typeof figStatsMore==='function'){const h=figStatsMore(data,st);if(h!=null)return h;}
  let stat='';
  if(data){if(data.kind==='column'){stat='<table><tr><th>群</th><th>n</th><th>平均</th><th>SD</th><th>SEM</th><th>中央値</th></tr>'+data.groups.map(g=>{const v=g.values;const e=figErr(v,'SD');return `<tr><td>${figEsc(g.name)}</td><td>${v.length}</td><td>${v.length?e.m.toFixed(3):''}</td><td>${v.length>1?e.e.toFixed(3):''}</td><td>${v.length>1?(e.e/Math.sqrt(v.length)).toFixed(3):''}</td><td>${v.length?median(v).toFixed(3):''}</td></tr>`;}).join('')+'</table>';
      if(compare&&compare.pairs){stat+=`<div class="hint">${figEsc(compare.test)}${compare.anova&&isFinite(compare.anova.p)?` ／ 分散分析 P = ${compare.anova.p<0.0001?'<0.0001':compare.anova.p.toFixed(4)}`:''}</div>`;if(compare.pairs.length)stat+='<table><tr><th>比較</th><th>P 値</th><th>要約</th></tr>'+compare.pairs.map(p=>`<tr><td>${figEsc(data.groups[p.a].name)} vs ${figEsc(data.groups[p.b].name)}</td><td>${p.p<0.0001?'<0.0001':p.p.toFixed(4)}</td><td>${figStars(p.p,'GP')}</td></tr>`).join('')+'</table>';if(note)stat+=`<div class="hint">${figEsc(note)}</div>`;}}
    else if(data.kind==='grouped'){stat=`<div class="hint">カテゴリ ${data.cats.length} × 群 ${data.groups.length}（同名の列を反復として平均±${figEsc(st.opts.errType)}）</div>`;if(compare&&compare.pairs){stat+=`<div class="hint">${figEsc(compare.test)}</div><table><tr><th>カテゴリ</th><th>比較</th><th>P 値</th><th>要約</th></tr>`+compare.pairs.map(p=>`<tr><td>${figEsc(data.cats[p.ci])}</td><td>${figEsc(data.groups[p.a].name)} vs ${figEsc(data.groups[p.b].name)}</td><td>${p.p<0.0001?'<0.0001':p.p.toFixed(4)}</td><td>${figStars(p.p,'GP')}</td></tr>`).join('')+'</table>';}}
    else{stat=`<div class="hint">X: ${figEsc(data.xname)} ／ 系列 ${data.groups.length}（同名の列を反復として平均±${figEsc(st.opts.errType)}）</div>`;}}
  return stat;
}
// プレビューの要素を選ぶ → 右の「選んだ要素」欄に細かい設定を出す
function figMarkSel(){document.querySelectorAll('#figPreview [data-sel]').forEach(el=>el.classList.toggle('sel',el.dataset.sel===figState.sel));}
function figInspector(){
  const $=s=>document.querySelector(s);const st=figState,o=st.opts;const sel=st.sel;const box=$('#figInspect');
  const row=(label,ctrl)=>`<div class="irow"><label>${label}</label>${ctrl}</div>`;
  const num=(k,v,step,min,max)=>`<input type="number" data-ik="${k}" value="${v}" step="${step||0.5}" min="${min||0}" ${max?`max="${max}"`:''}>`;
  const selx=(k,v,opts)=>`<select data-ik="${k}">${opts.map(([a,b])=>`<option value="${a}"${String(a)===String(v)?' selected':''}>${b}</option>`).join('')}</select>`;
  let h='',title='全体';
  if(sel&&sel.startsWith('series:')){const i=+sel.split(':')[1];const g=st.data&&st.data.groups[i];const so=figSeriesOpt(o,i);title=`系列「${figEsc(g?g.name:i+1)}」`;
    h+=row('表示名（凡例・軸）',`<input type="text" data-ik="series.name" value="${figEsc(so.name||'')}" placeholder="${figEsc(g?g.name:'')}">`)+row('色',`<input type="color" data-ik="series.color" value="${so.color}">`)+row('記号',selx('series.symbol',so.symbol,FIG_SYMBOLS))+row('記号の大きさ (pt)',num('series.symPt',so.symPt,0.5,2,20))+row('塗り',selx('series.fill',so.fill,[['solid','塗りつぶし'],['open','白抜き']]));
    if(st.kind==='xy')h+=row('線の太さ (pt)',num('series.lineW',so.lineW,0.25,0.25,6));
    h+=`<div class="hint">このボタンで系列の設定を既定に戻します</div><button class="small" data-iact="resetSeries">既定に戻す</button>`;}
  else if(sel&&sel.startsWith('cut:')){const i=+sel.split(':')[1];const g=st.data&&st.data.groups[i];const ov=(o.series&&o.series[i])||{};title=`カットオフの文字（${figEsc(g?g.name:i+1)}）`;
    h+=row('文字（空なら自動）',`<input type="text" data-ik="cut.cutText" value="${figEsc(ov.cutText||'')}" placeholder="自動（≥ 6.8 など）">`)+row('自動の内容',selx('rocCutText',o.rocCutText||'thr',[['thr','しきい値（≥ 6.8）'],['sens','感度/特異度'],['both','両方'],['none','なし']]))+row('大きさ',selx('rocCutSize',String(o.rocCutSize||'0.8'),[['0.6','小'],['0.8','ふつう'],['1','本文と同じ'],['1.2','大']]))+row('基準の位置',selx('rocCutPos',o.rocCutPos||'right',[['right','右上'],['left','左下'],['above','真上'],['below','真下']]))+`<div class="hint">文字はプレビューでドラッグして動かせます</div><button class="small" data-iact="resetCut">ずらした位置を戻す</button> <button class="small" data-iact="hideCut">この文字を消す</button>`;}
  else if(sel&&sel.startsWith('note:')){const k=+sel.split(':')[1];const n=(o.notes||[])[k];if(n){title=`書き込んだ文字「${figEsc(String(n.text||'').slice(0,12))}」`;h+=row('文字',`<textarea data-ik="note.text" rows="2" style="width:100%">${figEsc(n.text||'')}</textarea>`)+row('大きさ',selx('note.size',n.size||0.85,[['0.7','小'],['0.85','ふつう'],['1','本文と同じ'],['1.2','大'],['1.5','特大']]))+row('色',`<input type="color" data-ik="note.color" value="${n.color||'#000000'}">`)+row('揃え',selx('note.anchor',n.anchor||'start',[['start','左揃え'],['middle','中央'],['end','右揃え']]))+row('太さ',selx('note.bold',n.bold===false?'0':'1',[['1','太字'],['0','標準']]))+`<div class="hint">文字はプレビューでドラッグして動かせます</div><button class="small" data-iact="delNote">この文字を消す</button>`;}else{title='文字';h+='<div class="hint">見つかりません</div>';}}
  else if(sel==='axes'){title='軸と目盛';h+=row('軸の太さ (pt)',num('axisPt',o.axisPt||1,0.25,0.25,4))+row('目盛の長さ (数字の高さ×)',num('tickLen',o.tickLen||0.7,0.1,0,3))+row('文字の大きさ (pt)',num('fontPt',o.fontPt||12,1,6,24))+row('太字',selx('bold',o.bold===false?'0':'1',[['1','太字'],['0','標準']]))+row('Y の最小',`<input type="text" data-ik="ymin" value="${figEsc(o.ymin||'')}" placeholder="自動">`)+row('Y の最大',`<input type="text" data-ik="ymax" value="${figEsc(o.ymax||'')}" placeholder="自動">`);}
  else if(sel==='ytitle'||sel==='xtitle'){title=sel==='ytitle'?'Y 軸の題':'X 軸の題';h+=row('文字',`<input type="text" data-ik="${sel==='ytitle'?'yTitle':'xTitle'}" value="${figEsc(sel==='ytitle'?o.yTitle:o.xTitle)}">`);}
  else if(sel==='title'){title='題名';h+=row('文字',`<input type="text" data-ik="title" value="${figEsc(st.title)}">`);}
  else if(sel==='brackets'){title='有意差のブラケット';h+=row('形',selx('bracketShape',o.bracketShape||'long',[['long','長脚'],['short','短脚']]))+row('P の表示',selx('pStyle',o.pStyle||'GP',[['GP','アスタリスク'],['num','数値']]))+row('ns も表示',selx('showNs',o.showNs?'1':'0',[['0','表示しない'],['1','表示する']]));}
  else if(sel==='legend'){title='凡例';h+=row('表示',selx('legend',o.legend||'right',[['right','右に表示'],['none','表示しない']]));const gs=(st.data&&st.data.groups)||[];if(gs.length)h+='<div class="hint">凡例の文字（系列の表示名）。空なら列名のまま</div>'+gs.map((g,i)=>row(figEsc(g.name),`<input type="text" data-ik="sname.${i}" value="${figEsc(figSeriesOpt(o,i).name||'')}" placeholder="${figEsc(g.name)}">`)).join('');}
  else{h+=row('配色',selx('scheme',o.scheme||'prism',[['prism','既定（青・赤・緑…）'],['colorblind','色覚多様性に配慮'],['nature','誌面風（赤・水色・緑…）'],['gray','グレースケール']]))+row('文字の大きさ (pt)',num('fontPt',o.fontPt||12,1,6,24))+row('記号の大きさ (pt)',num('symPt',o.symPt||5.5,0.5,2,20))+row('軸の太さ (pt)',num('axisPt',o.axisPt||1,0.25,0.25,4))+row('幅 (in)',num('wIn',o.wIn||3,0.25,1,8))+row('高さ (in)',num('hIn',o.hIn||2,0.25,1,8))+row('棒の塗り',selx('barFill',o.barFill||'solid',[['solid','塗り'],['open','白抜き']]))+`<div class="hint">プレビューの点・棒・軸・題名・ブラケット・凡例をクリックすると、その要素の設定に切り替わります。</div>`;}
  box.innerHTML=`<h4>${title}${sel?' <button class="small" data-iact="unsel">全体の設定へ</button>':''}</h4>${h}`;
  box.querySelectorAll('[data-ik]').forEach(el=>{el.addEventListener(el.type==='color'||el.tagName==='SELECT'?'change':'input',()=>{const k=el.dataset.ik;let v=el.value;
    if(k.startsWith('sname.')){const i=+k.slice(6);o.series=o.series||{};o.series[i]=o.series[i]||{};if(v)o.series[i].name=v;else delete o.series[i].name;}
    else if(k.startsWith('note.')){const i=+st.sel.split(':')[1];const n=(o.notes||[])[i];if(n){const kk=k.slice(5);if(kk==='bold')n.bold=v==='1';else if(kk==='size')n.size=+v;else n[kk]=v;}}
    else if(k.startsWith('cut.')){const i=+st.sel.split(':')[1];o.series=o.series||{};o.series[i]=o.series[i]||{};if(v)o.series[i][k.slice(4)]=v;else delete o.series[i][k.slice(4)];}
    else if(k.startsWith('series.')){const i=+st.sel.split(':')[1];o.series=o.series||{};o.series[i]=o.series[i]||{};if(k==='series.name'&&!v)delete o.series[i].name;else o.series[i][k.slice(7)]=v;}
    else if(k==='title'){$('#figTitle').value=v;}else if(k==='bold'||k==='showNs'){o[k]=v==='1';}else if(k==='scheme'){o.scheme=v;o.colors=FIG_SCHEMES[v];delete o.series;}else{o[k]=v;}
    const f=document.querySelector(`#figDlg [data-fopt="${k}"]`);if(f){if(f.type==='checkbox')f.checked=!!o[k];else f.value=v;}
    const typing=el.tagName==='TEXTAREA'||el.type==='text'||el.type==='number';st.typing=typing;try{figSync(false);}finally{st.typing=false;}});el.addEventListener('change',()=>{if(el.tagName==='TEXTAREA'||el.type==='text'||el.type==='number')figPushUndo();});});
  box.querySelectorAll('[data-iact]').forEach(b=>b.onclick=()=>{if(b.dataset.iact==='unsel')st.sel=null;else if(b.dataset.iact==='resetSeries'&&o.series)delete o.series[+st.sel.split(':')[1]];else if(b.dataset.iact==='delNote'&&o.notes){o.notes.splice(+st.sel.split(':')[1],1);st.sel=null;}else if(b.dataset.iact==='resetCut'||b.dataset.iact==='hideCut'){const i=+st.sel.split(':')[1];o.series=o.series||{};o.series[i]=o.series[i]||{};if(b.dataset.iact==='hideCut'){o.series[i].cutHide=true;st.sel=null;}else{delete o.series[i].cutDx;delete o.series[i].cutDy;}}figSync(false);figPushUndo();});
}
function figInit(){
  const $=s=>document.querySelector(s);
  $('#figData').addEventListener('input',()=>figSync(false));
  $('#figKind').onchange=e=>{figState.kind=e.target.value;figSync(false);};
  $('#figType').onchange=e=>{figState.type=e.target.value;figSync(false);};{const gb=$('#figGalBtn');if(gb)gb.onclick=()=>figGalleryOpen();}
  $('#figTitle').addEventListener('input',()=>figSync(false));
  $('#figCmp').onchange=e=>{figState.cmp=e.target.value;figSync(false);};
  $('#figCtrl').onchange=e=>{figState.ctrl=+e.target.value;figSync(false);};
  document.querySelectorAll('#figDlg [data-fopt]').forEach(el=>{el.addEventListener(el.type==='checkbox'?'change':'input',()=>{figState.opts[el.dataset.fopt]=el.type==='checkbox'?el.checked:el.value;figSync(false);});});
  $('#figFileBtn').onclick=()=>$('#figFile').click();$('#figFile').onchange=async()=>{await figLoadTableFiles($('#figFile').files);$('#figFile').value='';};$('#figData').addEventListener('drop',e=>{const fs=[...e.dataTransfer.files];if(fs.length){e.preventDefault();figLoadTableFiles(fs);}});
  $('#figPreview').addEventListener('click',e=>{if(figState&&figState.noteTool){const svg=e.target.closest('svg')||$('#figPreview svg');const plot=figState.plot;if(!svg||!plot){toast('この図には文字を置けません');figState.noteTool=false;return;}const rect=svg.getBoundingClientRect();const vb=svg.viewBox.baseVal;const sc=vb&&vb.width?vb.width/rect.width:1;const px=(e.clientX-rect.left)*sc,py=(e.clientY-rect.top)*sc;figState.noteTool=false;figPrompt('グラフに書き込む文字（改行は \\n）','').then(text=>{if(!text)return;const o=figState.opts;(o.notes=o.notes||[]).push({x:+((px-plot.x0)/plot.w).toFixed(3),y:+((py-plot.y0)/plot.h).toFixed(3),text:text.replace(/\\n/g,'\n'),size:+(figState.noteSize||0.85),color:figState.noteColor||'#000000'});figSync();figPushUndo();});return;}
    const nt=e.target.closest&&e.target.closest('[data-note]');if(nt){figState.sel='note:'+nt.dataset.note;figMarkSel();figInspector();return;}
    const ct=e.target.closest&&e.target.closest('[data-cut]');if(ct){figState.sel='cut:'+ct.dataset.cut;figMarkSel();figInspector();return;}
    const t=e.target.closest&&e.target.closest('[data-sel]');figState.sel=t?t.dataset.sel:null;figMarkSel();figInspector();});
  $('#figClose').onclick=()=>$('#figDlg').close();
  $('#figSvg').onclick=()=>{if(!figState.svg)return;saveTextFile(`figure_${Date.now()}.svg`,figState.svg);};
  $('#figPng').onclick=async()=>{if(!figState.svg)return;const c=await figToPng(figState.svg,figState.w,figState.h,300);const a=document.createElement('a');a.href=figPngDataURL(c,300);a.download=`figure_${Date.now()}.png`;a.click();toast('PNG（300 dpi）を保存しました');};
  $('#figCopy').onclick=async()=>{if(!figState.svg)return;try{const c=await figToPng(figState.svg,figState.w,figState.h,300);const blob=await new Promise(r=>c.toBlob(r,'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast('画像をコピーしました');}catch(e){toast('コピーできませんでした');}};
  $('#figAttach').onclick=()=>figAttach().catch(e=>toast('添付できませんでした: '+(e.message||e)));
  $('#figUpdate').onclick=()=>figUpdateSource();
}
// 編集した内容を、元の回答の ```figure ブロックに書き戻す
function figUpdateSource(){const src=figState.src;if(!src)return;const n=N(src.nodeId);if(!n)return;const blocks=figFindBlocks(n.content);const b=blocks[src.index];if(!b){toast('元の図が見つかりません');return;}
  let spec=figSpecFromState(figState);if(src.panel!=null){let lay;try{lay=JSON.parse(b.json);}catch(e){toast('レイアウトを読めませんでした');return;}if(!lay.panels||!lay.panels[src.panel]){toast('パネルが見つかりません');return;}lay.panels[src.panel]=spec;spec=lay;} // レイアウトのパネルを差し替え
  const json=JSON.stringify(spec);n.content=n.content.slice(0,b.start)+'```figure\n'+json+'\n```'+n.content.slice(b.end);persist();renderAll();document.querySelector('#figDlg').close();toast('回答の図を更新しました');}
function figFindBlocks(text){const out=[];const re=/```figure[ \t]*\n([\s\S]*?)\n```/g;let m;while((m=re.exec(String(text||''))))out.push({start:m.index,end:m.index+m[0].length,json:m[1]});return out;}
async function figAttach(){const $=s=>document.querySelector(s);if(!figState.svg)return;if(!imagesSupported){toast('この接続方式では画像を送れません');return;}
  const c=await figToPng(figState.svg,figState.w,figState.h,200);const full=c.toDataURL('image/jpeg',.9);const tc=document.createElement('canvas');const r=256/Math.max(c.width,c.height);tc.width=Math.round(c.width*r);tc.height=Math.round(c.height*r);tc.getContext('2d').drawImage(c,0,0,tc.width,tc.height);
  if(pendingImgs.length>=4){toast('添付できる画像は4枚までです');return;}pendingImgs.push({full:{media_type:'image/jpeg',data:full.split(',')[1]},thumb:tc.toDataURL('image/jpeg',.8)});
  conv.figures=conv.figures||[];conv.figures.push({id:uid(),ts:Date.now(),spec:figSpecFromState(figState)});persist();
  renderPlus();$('#figDlg').close();const t=$('#input');t.value=(t.value?t.value+'\n':'')+'```figure\n'+JSON.stringify(figSpecFromState(figState))+'\n```\n';fitInput();t.focus();toast('図を添付し、図の指定を入力欄に入れました。質問を添えて送信してください');}
// チャットの本文にある ```figure ブロックを描画する（mdBlocks から呼ばれる）。JSON が途中（生成中）なら作成中の表示
function figBlockHTML(json,nodeId,index){
  let j=null;try{j=JSON.parse(json);}catch(e){return `<div class="figblock waiting"><span class="spin4 mini"><i></i><i></i><i></i><i></i></span><span class="ui">図を作成中…</span></div>`;}
  let r=null;try{r=figRenderSpec(j);}catch(e){r=null;}
  if(!r||!r.svg)return `<div class="figblock"><div class="hint">図を描けませんでした（データの形を確認してください）</div><pre>${figEsc(json)}</pre></div>`;
  if(r.layout)return figLayoutBlockHTML(j,r,nodeId,index);if(r.image)return figImageBlockHTML(j,r,nodeId,index);if(r.schematic)return figSchematicBlockHTML(j,r,nodeId,index);
  return `<div class="figblock" data-fignode="${figEsc(nodeId||'')}" data-figidx="${index}">${r.svg}<div class="figbtns"><button class="small" data-figedit data-tip="この図を作成画面で編集する">✎ 編集</button><button class="small" data-figpng data-tip="PNG（300 dpi）で保存">PNG</button><button class="small" data-figsvg data-tip="SVG で保存">SVG</button><button class="small" data-figcopy data-tip="画像をコピー">⧉</button></div></div>`;
}
function figOpenFromBlock(el,panel){const nid=el.dataset.fignode,idx=+el.dataset.figidx;const n=N(nid);if(!n)return;const b=figFindBlocks(n.content)[idx];if(!b)return;let j;try{j=JSON.parse(b.json);}catch(e){toast('図の指定を読めませんでした');return;}
  const src={nodeId:nid,index:idx};if(typeof figIsLayout==='function'&&figIsLayout(j)){const k=panel==null?0:+panel;j=(j.panels||[])[k];if(!j){toast('パネルが見つかりません');return;}src.panel=k;} // レイアウトの中の 1 パネルを編集
  if(typeof figIsImage==='function'&&figIsImage(j)&&typeof figImgOpen==='function'){figImgOpen(j,src);return;} // 画像パネルは専用の画面
  const st=figStateFromSpec(j);st.src=src;figOpen(st);}
async function figBlockAction(el,act){const svgEl=el.querySelector('svg');if(!svgEl)return;const svg=svgEl.outerHTML;const w=+svgEl.getAttribute('width'),h=+svgEl.getAttribute('height');
  if(act==='svg'){let out=svg;const mm=+svgEl.getAttribute('data-mm');if(mm>0){const hmm=mm*h/w;out=out.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/,`<svg$1 width="${mm}mm" height="${hmm.toFixed(3)}mm"`);} // 誌面幅の指定があれば物理単位で
    if(typeof figInlineImages==='function')out=await figInlineImages(out);saveTextFile(`figure_${Date.now()}.svg`,out);return;}
  const c=await figToPng(svg,w,h,300);if(act==='png'){const a=document.createElement('a');a.href=figPngDataURL(c,300);a.download=`figure_${Date.now()}.png`;a.click();toast('PNG（300 dpi）を保存しました');}
  else{try{const blob=await new Promise(r=>c.toBlob(r,'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast('画像をコピーしました');}catch(e){toast('コピーできませんでした');}}}
function figFromTable(tableEl){const rows=[...tableEl.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(c=>c.textContent.trim()).join('\t'));figOpen({text:rows.join('\n')});}
document.addEventListener('DOMContentLoaded',()=>{figInit();figToolsInit();});
