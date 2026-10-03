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
};
const FIG_PT=96/72; // 1pt → px（SVG は px 単位で描き、1pt=1.333px）
const FIG_IN=96;    // 1in → px

/* ---------- データ表 ---------- */
// 文字列（TSV/CSV/Markdown表）→ {kind:'column'|'grouped'|'xy', cols:[{name,vals}]}
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
  kind=kind||(firstColText?'grouped':(cols.length>=2?'column':'column'));
  const groupsOf=cs=>{const g=[];for(const c of cs){let e=g.find(x=>x.name===c.name);if(!e){e={name:c.name,reps:[]};g.push(e);}e.reps.push(c);}return g;};
  if(kind==='column'){ // 列=群、行=反復（同名列は結合）
    const gs=groupsOf(cols.filter(c=>c.vals.some(v=>v!==null)));
    return {kind,groups:gs.map(g=>({name:g.name,values:g.reps.flatMap(c=>c.vals).filter(v=>v!==null)}))};
  }
  if(kind==='grouped'){ // 行=カテゴリ、列=群（同名列は反復）
    const cats=rowLabels;const gs=groupsOf(cols.slice(1).filter(c=>c.vals.some(v=>v!==null)));
    return {kind,cats,groups:gs.map(g=>({name:g.name,cells:cats.map((_,ri)=>g.reps.map(c=>c.vals[ri]).filter(v=>v!==null))}))};
  }
  // xy: 1列目=X、以降=Y（同名列は反復）
  const xs=cols[0].vals;const gs=groupsOf(cols.slice(1).filter(c=>c.vals.some(v=>v!==null)));
  return {kind:'xy',xname:cols[0].name,groups:gs.map(g=>({name:g.name,points:xs.map((x,ri)=>({x,ys:g.reps.map(c=>c.vals[ri]).filter(v=>v!==null)})).filter(p=>p.x!==null&&p.ys.length)}))};
}

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
function figStars(p,style){if(!(p<1))return 'ns';if(style==='num')return p<0.0001?'P<0.0001':'P='+p.toFixed(p<0.01?4:3);if(p<0.0001)return '****';if(p<0.001)return '***';if(p<0.01)return '**';if(p<0.05)return '*';return 'ns';}

function kde(v,lo,hi,n){const s=sd(v)||1,iqrv=quantile(v,0.75)-quantile(v,0.25);const h=0.9*Math.min(s,iqrv/1.34||s)*Math.pow(v.length,-0.2)||1;const out=[];for(let i=0;i<=n;i++){const x=lo+(hi-lo)*i/n;let d=0;for(const p of v)d+=Math.exp(-0.5*Math.pow((x-p)/h,2));out.push([x,d/(v.length*h*Math.sqrt(2*Math.PI))]);}return out;}
/* ---------- 描画（SVG） ---------- */
function figNiceTicks(lo,hi,n){if(!(hi>lo)){hi=lo+1;}const span=hi-lo;const raw=span/Math.max(1,n);const mag=Math.pow(10,Math.floor(Math.log10(raw)));const cand=[1,2,2.5,5,10].map(c=>c*mag);const step=cand.find(c=>span/c<=n+0.5)||cand[cand.length-1];const t0=Math.ceil(lo/step-1e-9)*step,t1=Math.floor(hi/step+1e-9)*step;const ts=[];for(let v=t0;v<=t1+1e-9;v+=step)ts.push(+v.toFixed(10));return {step,ticks:ts};}
function figFmt(v){return Math.abs(v)>=1e5||(Math.abs(v)<1e-3&&v!==0)?v.toExponential(1):String(+v.toFixed(6)).replace(/\.?0+$/,'')||'0';}
function figSymbol(x,y,r,shape,fill,stroke){
  switch(shape){
    case 'square':return `<rect x="${x-r}" y="${y-r}" width="${2*r}" height="${2*r}" fill="${fill}" stroke="${stroke}" stroke-width="${FIG_PT}"/>`;
    case 'triangle':return `<polygon points="${x},${y-r*1.15} ${x-r*1.1},${y+r*0.85} ${x+r*1.1},${y+r*0.85}" fill="${fill}" stroke="${stroke}" stroke-width="${FIG_PT}"/>`;
    case 'triangle-down':return `<polygon points="${x},${y+r*1.15} ${x-r*1.1},${y-r*0.85} ${x+r*1.1},${y-r*0.85}" fill="${fill}" stroke="${stroke}" stroke-width="${FIG_PT}"/>`;
    case 'diamond':return `<polygon points="${x},${y-r*1.2} ${x+r*1.2},${y} ${x},${y+r*1.2} ${x-r*1.2},${y}" fill="${fill}" stroke="${stroke}" stroke-width="${FIG_PT}"/>`;
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

function figRender(spec){
  const d=spec.data;if(!d)return {svg:'',w:0,h:0};
  const o=Object.assign({},FIG_DEF,spec.opts||{});const fs=o.fontPt*FIG_PT,h=fs*0.72,a=o.axisPt*FIG_PT,tick=h*o.tickLen;
  const plotW=o.wIn*FIG_IN,plotH=o.hIn*FIG_IN;const padL=fs*4.2,padB=fs*3.2,padT=fs*1.6,padR=fs*1.2+(spec.legend!=='none'&&d.groups.length>1&&d.kind!=='column'?fs*8:0);
  const W=padL+plotW+padR,H=padT+plotH+padB;const x0=padL,y0=padT+plotH; // 原点（左下）
  const fw=o.bold?'bold':'normal';const txt=(x,y,s,anchor,extra)=>`<text x="${x}" y="${y}" font-family="${o.font}" font-size="${fs}" font-weight="${fw}" text-anchor="${anchor||'middle'}" ${extra||''}>${figEsc(s)}</text>`;
  let body='',over='';
  // ---- Y 範囲 ----
  const allY=[];let yTitle=o.yTitle||'';let xTitle=o.xTitle||'';
  const type=spec.type;
  const col=i=>o.colors[i%o.colors.length];
  if(d.kind==='column'||d.kind==='grouped'){
    const cells=d.kind==='column'?d.groups.map(g=>g.values):d.groups.flatMap(g=>g.cells);
    for(const v of cells){if(!v.length)continue;if(type==='box'){allY.push(...v);}else{const e=figErr(v,o.errType);allY.push(e.m+e.e,e.m-e.e);if(type==='scatter'||type==='violin')allY.push(...v);}}
    if(type==='bar'||type==='grouped-bar')allY.push(0);
  }else{for(const g of d.groups)for(const p of g.points){const e=figErr(p.ys,o.errType);allY.push(e.m+e.e,e.m-e.e);if(type==='xy-points')allY.push(...p.ys);}}
  let ymin=Math.min(...allY),ymax=Math.max(...allY);if(!isFinite(ymin)){ymin=0;ymax=1;}
  if(o.ymin!==''&&o.ymin!=null&&isFinite(+o.ymin))ymin=+o.ymin;else if(ymin>0&&(type==='bar'||type==='grouped-bar'))ymin=0;else if(ymin>0&&ymin<(ymax-ymin)*0.3)ymin=0;
  if(o.ymax!==''&&o.ymax!=null&&isFinite(+o.ymax))ymax=+o.ymax;
  const yt=figNiceTicks(ymin,ymax+(ymax-ymin)*(spec.compare?0.35:0.06),5);const yLo=Math.min(ymin,yt.ticks[0]),yHi=Math.max(ymax+(ymax-ymin)*(spec.compare?0.35:0.06),yt.ticks[yt.ticks.length-1]);
  const yOf=v=>y0-(v-yLo)/(yHi-yLo)*plotH;
  // ---- 軸（L 字、目盛は外向き、軸線は最後の目盛で終わる） ----
  const yAxisTop=yOf(yt.ticks[yt.ticks.length-1]),yAxisBot=yOf(yt.ticks[0]);
  let axes=`<line x1="${x0}" y1="${yAxisBot}" x2="${x0}" y2="${yAxisTop}" stroke="#000" stroke-width="${a}" stroke-linecap="square"/>`;
  for(const t of yt.ticks){const y=yOf(t);axes+=`<line x1="${x0}" y1="${y}" x2="${x0-tick}" y2="${y}" stroke="#000" stroke-width="${a}"/>`+txt(x0-tick-fs*0.3,y+h/2,figFmt(t),'end');}
  if(yTitle)axes+=txt(x0-tick-fs*2.6,(yAxisTop+yAxisBot)/2,yTitle,'middle',`transform="rotate(-90 ${x0-tick-fs*2.6} ${(yAxisTop+yAxisBot)/2})"`);
  // ---- 本体 ----
  const errBar=(cx,m,e,w,color,upOnly)=>{if(!(e>0))return '';const yT=yOf(m+e),yB=upOnly?yOf(m):yOf(m-e);const cw=w*o.capRatio;let s=`<line x1="${cx}" y1="${yT}" x2="${cx}" y2="${yB}" stroke="${color}" stroke-width="${a}"/>`;s+=`<line x1="${cx-cw/2}" y1="${yT}" x2="${cx+cw/2}" y2="${yT}" stroke="${color}" stroke-width="${a}"/>`;if(!upOnly)s+=`<line x1="${cx-cw/2}" y1="${yB}" x2="${cx+cw/2}" y2="${yB}" stroke="${color}" stroke-width="${a}"/>`;return s;};
  const centers=[]; // ブラケット用: 群ごとの中心 x と上端 y
  if(d.kind==='column'){
    const n=d.groups.length;const g=o.barGap;const unit=plotW/(g.first+n+(n-1)*g.adj+g.last);const bw=unit*(type==='bar'?1:0.67);
    let xAxis=`<line x1="${x0}" y1="${y0}" x2="${x0+plotW}" y2="${y0}" stroke="#000" stroke-width="${a}" stroke-linecap="square"/>`;
    d.groups.forEach((gr,i)=>{const cx=x0+unit*(g.first+0.5+i*(1+g.adj));const v=gr.values;const c=col(i);const e=figErr(v,o.errType);let top=e.m+e.e;
      xAxis+=`<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0+tick}" stroke="#000" stroke-width="${a}"/>`+txt(cx,y0+tick+fs*1.05,gr.name);
      if(type==='bar'){body+=`<rect x="${cx-bw/2}" y="${yOf(Math.max(0,e.m))}" width="${bw}" height="${Math.abs(yOf(e.m)-yOf(0))}" fill="${o.barFill==='open'?'#fff':c}" stroke="${c}" stroke-width="${a}"/>`+errBar(cx,e.m,e.e,bw,'#000',true);}
      else if(type==='scatter'){const r=o.symPt*FIG_PT/2;const pos=figArrangeDots(v,yOf,r,bw*0.9);v.forEach((val,k)=>{body+=figSymbol(cx+pos[k].dx,pos[k].y,r,o.symbols[i%o.symbols.length],c,c);});
        const lw=bw*o.capRatio*2;body+=`<line x1="${cx-lw/2}" y1="${yOf(e.m)}" x2="${cx+lw/2}" y2="${yOf(e.m)}" stroke="#000" stroke-width="${a*2}"/>`+errBar(cx,e.m,e.e,bw,'#000',false);top=Math.max(top,...v);}
      else if(type==='box'){if(v.length>=2){const q1=quantile(v,0.25),q2=quantile(v,0.5),q3=quantile(v,0.75),iqr=q3-q1;const inl=v.filter(x=>x>=q1-1.5*iqr&&x<=q3+1.5*iqr);const lo=Math.min(...inl),hi=Math.max(...inl);const w2=bw*o.boxWidth;
        body+=`<line x1="${cx}" y1="${yOf(hi)}" x2="${cx}" y2="${yOf(q3)}" stroke="${c}" stroke-width="${a}"/><line x1="${cx}" y1="${yOf(q1)}" x2="${cx}" y2="${yOf(lo)}" stroke="${c}" stroke-width="${a}"/>`;
        body+=`<line x1="${cx-w2*0.27}" y1="${yOf(hi)}" x2="${cx+w2*0.27}" y2="${yOf(hi)}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-w2*0.27}" y1="${yOf(lo)}" x2="${cx+w2*0.27}" y2="${yOf(lo)}" stroke="${c}" stroke-width="${a}"/>`;
        body+=`<rect x="${cx-w2/2}" y="${yOf(q3)}" width="${w2}" height="${yOf(q1)-yOf(q3)}" fill="${figHalf(c)}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-w2/2}" y1="${yOf(q2)}" x2="${cx+w2/2}" y2="${yOf(q2)}" stroke="${c}" stroke-width="${a}"/>`;
        v.filter(x=>x<q1-1.5*iqr||x>q3+1.5*iqr).forEach(x=>{body+=figSymbol(cx,yOf(x),o.symPt*FIG_PT/2,'circle',c,c);});top=Math.max(...v);}}
      else if(type==='violin'){if(v.length>=2){const lo=Math.min(...v),hi=Math.max(...v);const k=kde(v,lo,hi,40);const mx=Math.max(...k.map(p=>p[1]))||1;const w2=bw*o.violinWidth/2;
        const left=k.map(p=>`${cx-p[1]/mx*w2},${yOf(p[0])}`),right=k.slice().reverse().map(p=>`${cx+p[1]/mx*w2},${yOf(p[0])}`);
        body+=`<polygon points="${left.concat(right).join(' ')}" fill="${figHalf(c)}" stroke="${c}" stroke-width="${a}"/>`;
        const q1=quantile(v,0.25),q2=quantile(v,0.5),q3=quantile(v,0.75);const wAt=y=>{const p=k.reduce((b,p)=>Math.abs(p[0]-y)<Math.abs(b[0]-y)?p:b);return p[1]/mx*w2;};
        body+=`<line x1="${cx-wAt(q2)}" y1="${yOf(q2)}" x2="${cx+wAt(q2)}" y2="${yOf(q2)}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-wAt(q1)}" y1="${yOf(q1)}" x2="${cx+wAt(q1)}" y2="${yOf(q1)}" stroke="${c}" stroke-width="${a}" stroke-dasharray="${a*2} ${a*2}"/><line x1="${cx-wAt(q3)}" y1="${yOf(q3)}" x2="${cx+wAt(q3)}" y2="${yOf(q3)}" stroke="${c}" stroke-width="${a}" stroke-dasharray="${a*2} ${a*2}"/>`;top=hi;}}
      centers.push({cx,top:yOf(top),name:gr.name});});
    axes+=xAxis;if(xTitle)axes+=txt(x0+plotW/2,y0+tick+fs*2.3,xTitle);
  }else if(d.kind==='grouped'){
    const nc=d.cats.length,ng=d.groups.length;const g=o.barGap;const unit=plotW/(g.first+nc*(ng+(ng-1)*g.adj)+(nc-1)*g.group+g.last);const bw=unit;
    let xAxis=`<line x1="${x0}" y1="${y0}" x2="${x0+plotW}" y2="${y0}" stroke="#000" stroke-width="${a}" stroke-linecap="square"/>`;
    d.cats.forEach((cat,ci)=>{const start=x0+unit*(g.first+ci*(ng+(ng-1)*g.adj+g.group));const catCenter=start+unit*(ng+(ng-1)*g.adj)/2;
      xAxis+=`<line x1="${catCenter}" y1="${y0}" x2="${catCenter}" y2="${y0+tick}" stroke="#000" stroke-width="${a}"/>`+txt(catCenter,y0+tick+fs*1.05,cat);
      d.groups.forEach((gr,gi)=>{const v=gr.cells[ci]||[];if(!v.length)return;const cx=start+unit*(0.5+gi*(1+g.adj));const c=col(gi);const e=figErr(v,o.errType);
        if(type==='grouped-scatter'){const r=o.symPt*FIG_PT/2;const pos=figArrangeDots(v,yOf,r,bw*0.9);v.forEach((val,k)=>{body+=figSymbol(cx+pos[k].dx,pos[k].y,r,o.symbols[gi%o.symbols.length],c,c);});body+=`<line x1="${cx-bw*0.5}" y1="${yOf(e.m)}" x2="${cx+bw*0.5}" y2="${yOf(e.m)}" stroke="#000" stroke-width="${a*2}"/>`+errBar(cx,e.m,e.e,bw,'#000',false);}
        else{body+=`<rect x="${cx-bw/2}" y="${yOf(Math.max(0,e.m))}" width="${bw}" height="${Math.abs(yOf(e.m)-yOf(0))}" fill="${o.barFill==='open'?'#fff':c}" stroke="${c}" stroke-width="${a}"/>`+errBar(cx,e.m,e.e,bw,'#000',true);}});});
    axes+=xAxis;if(xTitle)axes+=txt(x0+plotW/2,y0+tick+fs*2.3,xTitle);
  }else{ // xy
    const xs=d.groups.flatMap(g=>g.points.map(p=>p.x));let xmin=Math.min(...xs),xmax=Math.max(...xs);if(!(xmax>xmin)){xmax=xmin+1;}
    const xt=figNiceTicks(xmin,xmax,6);const xLo=Math.min(xmin,xt.ticks[0]),xHi=Math.max(xmax,xt.ticks[xt.ticks.length-1]);const xOf=x=>x0+(x-xLo)/(xHi-xLo)*plotW;
    const xa0=xOf(xt.ticks[0]),xa1=xOf(xt.ticks[xt.ticks.length-1]);
    let xAxis=`<line x1="${xa0}" y1="${y0}" x2="${xa1}" y2="${y0}" stroke="#000" stroke-width="${a}" stroke-linecap="square"/>`;
    for(const t of xt.ticks){const x=xOf(t);xAxis+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+tick}" stroke="#000" stroke-width="${a}"/>`+txt(x,y0+tick+fs*1.05,figFmt(t));}
    if(xTitle||d.xname)xAxis+=txt((xa0+xa1)/2,y0+tick+fs*2.3,xTitle||d.xname);
    d.groups.forEach((gr,gi)=>{const c=col(gi);const pts=gr.points.slice().sort((p,q)=>p.x-q.x);const r=o.symPt*FIG_PT/2;const w=r*2*1.2;
      if(type!=='xy-points')body+=`<polyline points="${pts.map(p=>`${xOf(p.x)},${yOf(mean(p.ys))}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${a}" stroke-linejoin="round"/>`;
      pts.forEach(p=>{const e=figErr(p.ys,o.errType);const cx=xOf(p.x);if(type==='xy-points'){p.ys.forEach(y=>{body+=figSymbol(cx,yOf(y),r,o.symbols[gi%o.symbols.length],c,c);});}else{body+=errBar(cx,e.m,e.e,w,c,false)+figSymbol(cx,yOf(e.m),r,o.symbols[gi%o.symbols.length],c,c);}});});
    axes+=xAxis;
  }
  // ---- 有意差ブラケット（アスタリスク＋長脚、脚はデータ上端＋0.75h、段の間隔 2h） ----
  if(spec.compare&&spec.compare.pairs&&centers.length){
    const ps=spec.compare.pairs.filter(p=>o.showNs||p.p<o.pThr).map(p=>({...p,l:Math.min(p.a,p.b),r:Math.max(p.a,p.b)})).sort((p,q)=>(p.r-p.l)-(q.r-q.l));
    const levels=[];const topOf=(l,r)=>Math.min(...centers.slice(l,r+1).map(c=>c.top));
    for(const p of ps){let lv=0;for(;;lv++){if(!levels[lv]||!levels[lv].some(q=>!(p.r<q.l||p.l>q.r)))break;}(levels[lv]=levels[lv]||[]).push(p);p.lv=lv;}
    const base=Math.min(...centers.map(c=>c.top))-0.75*h;const dataTop=(l,r)=>topOf(l,r)-0.75*h;
    for(const p of ps){const y=Math.min(base,dataTop(p.l,p.r))-p.lv*2*h-(p.lv?0.6*h:0);const xa=centers[p.l].cx,xb=centers[p.r].cx;const leg=o.bracketShape==='long'?h*0.7:h*0.3;
      over+=`<polyline points="${xa},${y+leg} ${xa},${y} ${xb},${y} ${xb},${y+leg}" fill="none" stroke="#000" stroke-width="${a}"/>`+txt((xa+xb)/2,y-0.15*FIG_IN/2.54*0+fs*0.3-fs*0.15,figStars(p.p,o.pStyle));}
  }
  // ---- 凡例（右） ----
  if(spec.legend!=='none'&&d.groups.length>1&&d.kind!=='column'){const lx=x0+plotW+fs*1.2;d.groups.forEach((gr,i)=>{const ly=padT+fs*(i*1.5+0.8);const c=col(i);
    if(d.kind==='grouped'&&type!=='grouped-scatter')over+=`<rect x="${lx}" y="${ly-fs*0.55}" width="${fs*1.1}" height="${fs*0.75}" fill="${c}" stroke="${c}"/>`;else over+=figSymbol(lx+fs*0.5,ly-fs*0.2,o.symPt*FIG_PT/2,o.symbols[i%o.symbols.length],c,c);
    over+=txt(lx+fs*1.5,ly,gr.name,'start');});}
  if(spec.title)over+=txt(x0+plotW/2,padT-fs*0.4,spec.title);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${axes}${body}${over}</svg>`;
  return {svg,w:W,h:H};
}

/* ---------- 書き出し ---------- */
function figToPng(svg,w,h,dpi){return new Promise((res,rej)=>{const scale=(dpi||300)/96;const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);const g=c.getContext('2d');const im=new Image();im.onload=()=>{g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);res(c);};im.onerror=e=>rej(new Error('描画に失敗しました'));im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});}

/* ---------- 画面 ---------- */
const FIG_TYPES={column:[['scatter','散布ドット＋平均±誤差'],['bar','棒＋誤差'],['box','箱ひげ'],['violin','バイオリン']],grouped:[['grouped-bar','集合棒＋誤差'],['grouped-scatter','集合散布']],xy:[['xy-line','折れ線＋記号＋誤差'],['xy-points','散布（全点）']]};
let figState=null; // {text, kind, type, opts, title, compare, mode}
function figOpen(init){
  const $=s=>document.querySelector(s);
  figState=Object.assign({text:'',kind:'',type:'',opts:{errType:'SD',pThr:0.05,pStyle:'GP',showNs:false,yTitle:'',xTitle:'',ymin:'',ymax:'',barFill:'solid',bracketShape:'long'},title:'',cmp:'none',ctrl:0},init||{});
  if(!figState.text)figState.text='Control\tTreated\n12.1\t15.4\n11.8\t16.0\n12.6\t14.9\n13.0\t15.8\n12.3\t16.3';
  $('#figData').value=figState.text;$('#figTitle').value=figState.title||'';$('#figKind').value=figState.kind||'column';$('#figCmp').value=figState.cmp||'none';
  document.querySelectorAll('#figDlg [data-fopt]').forEach(el=>{const v=figState.opts[el.dataset.fopt];if(el.type==='checkbox')el.checked=!!v;else el.value=v==null?'':v;});
  figSync(true);$('#figDlg').showModal();
}
function figSync(reset){
  const $=s=>document.querySelector(s);const st=figState;st.text=$('#figData').value;
  const parsed=figParseTable(st.text);const autoKind=parsed?(parsed.firstColText?'grouped':'column'):'column';
  if(reset||!st.kind){st.kind=st.kind||autoKind;}
  // 表の型の選択肢
  const kindSel=$('#figKind');if(kindSel.value!==st.kind){kindSel.value=st.kind;}
  const types=FIG_TYPES[st.kind]||FIG_TYPES.column;if(!types.some(t=>t[0]===st.type))st.type=types[0][0];
  $('#figType').innerHTML=types.map(t=>`<option value="${t[0]}"${t[0]===st.type?' selected':''}>${t[1]}</option>`).join('');
  const data=figBuildData(parsed,st.kind);st.data=data;
  $('#figCmpRow').style.display=st.kind==='column'?'':'none';
  let compare=null,note='';
  if(data&&st.kind==='column'&&st.cmp!=='none'){compare=figCompare(data.groups,st.cmp,st.ctrl);note=compare.note||'';
    $('#figCtrl').innerHTML=data.groups.map((g,i)=>`<option value="${i}"${i===st.ctrl?' selected':''}>${g.name}</option>`).join('');$('#figCtrl').style.display=st.cmp==='dunnett'?'':'none';}
  else{$('#figCtrl').style.display='none';}
  const spec={data,type:st.type,opts:st.opts,title:$('#figTitle').value.trim(),compare,legend:'right'};st.spec=spec;
  try{const r=figRender(spec);st.svg=r.svg;st.w=r.w;st.h=r.h;$('#figPreview').innerHTML=r.svg||'<div class="hint">データを貼り付けてください</div>';}
  catch(e){$('#figPreview').innerHTML='<div class="hint">描画できませんでした: '+figEsc(e.message)+'</div>';st.svg='';}
  // 統計の表
  let stat='';
  if(data){if(data.kind==='column'){stat='<table><tr><th>群</th><th>n</th><th>平均</th><th>SD</th><th>SEM</th><th>中央値</th></tr>'+data.groups.map(g=>{const v=g.values;const e=figErr(v,'SD');return `<tr><td>${figEsc(g.name)}</td><td>${v.length}</td><td>${v.length?e.m.toFixed(3):''}</td><td>${v.length>1?e.e.toFixed(3):''}</td><td>${v.length>1?(e.e/Math.sqrt(v.length)).toFixed(3):''}</td><td>${v.length?median(v).toFixed(3):''}</td></tr>`;}).join('')+'</table>';
      if(compare){stat+=`<div class="hint">${figEsc(compare.test)}${compare.anova&&isFinite(compare.anova.p)?` ／ 分散分析 P = ${compare.anova.p<0.0001?'<0.0001':compare.anova.p.toFixed(4)}`:''}</div>`;if(compare.pairs.length)stat+='<table><tr><th>比較</th><th>P 値</th><th>要約</th></tr>'+compare.pairs.map(p=>`<tr><td>${figEsc(data.groups[p.a].name)} vs ${figEsc(data.groups[p.b].name)}</td><td>${p.p<0.0001?'<0.0001':p.p.toFixed(4)}</td><td>${figStars(p.p,'GP')}</td></tr>`).join('')+'</table>';if(note)stat+=`<div class="hint">${figEsc(note)}</div>`;}}
    else if(data.kind==='grouped'){stat=`<div class="hint">カテゴリ ${data.cats.length} × 群 ${data.groups.length}（同名の列を反復として平均±${figEsc(st.opts.errType)}）</div>`;}
    else{stat=`<div class="hint">X: ${figEsc(data.xname)} ／ 系列 ${data.groups.length}（同名の列を反復として平均±${figEsc(st.opts.errType)}）</div>`;}}
  $('#figStats').innerHTML=stat;
}
function figInit(){
  const $=s=>document.querySelector(s);
  $('#figData').addEventListener('input',()=>figSync(false));
  $('#figKind').onchange=e=>{figState.kind=e.target.value;figSync(false);};
  $('#figType').onchange=e=>{figState.type=e.target.value;figSync(false);};
  $('#figTitle').addEventListener('input',()=>figSync(false));
  $('#figCmp').onchange=e=>{figState.cmp=e.target.value;figSync(false);};
  $('#figCtrl').onchange=e=>{figState.ctrl=+e.target.value;figSync(false);};
  document.querySelectorAll('#figDlg [data-fopt]').forEach(el=>{el.addEventListener(el.type==='checkbox'?'change':'input',()=>{figState.opts[el.dataset.fopt]=el.type==='checkbox'?el.checked:el.value;figSync(false);});});
  $('#figClose').onclick=()=>$('#figDlg').close();
  $('#figSvg').onclick=()=>{if(!figState.svg)return;saveTextFile(`figure_${Date.now()}.svg`,figState.svg);};
  $('#figPng').onclick=async()=>{if(!figState.svg)return;const c=await figToPng(figState.svg,figState.w,figState.h,300);const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download=`figure_${Date.now()}.png`;a.click();toast('PNG（300 dpi）を保存しました');};
  $('#figCopy').onclick=async()=>{if(!figState.svg)return;try{const c=await figToPng(figState.svg,figState.w,figState.h,300);const blob=await new Promise(r=>c.toBlob(r,'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast('画像をコピーしました');}catch(e){toast('コピーできませんでした');}};
  $('#figAttach').onclick=()=>figAttach().catch(e=>toast('添付できませんでした: '+(e.message||e)));
}
async function figAttach(){const $=s=>document.querySelector(s);if(!figState.svg)return;if(!imagesSupported){toast('この接続方式では画像を送れません');return;}
    const c=await figToPng(figState.svg,figState.w,figState.h,200);const full=c.toDataURL('image/jpeg',.9);const tc=document.createElement('canvas');const r=256/Math.max(c.width,c.height);tc.width=Math.round(c.width*r);tc.height=Math.round(c.height*r);tc.getContext('2d').drawImage(c,0,0,tc.width,tc.height);
    if(pendingImgs.length>=4){toast('添付できる画像は4枚までです');return;}pendingImgs.push({full:{media_type:'image/jpeg',data:full.split(',')[1]},thumb:tc.toDataURL('image/jpeg',.8)});
    conv.figures=conv.figures||[];conv.figures.push({id:uid(),ts:Date.now(),state:{text:figState.text,kind:figState.kind,type:figState.type,opts:figState.opts,title:figState.title,cmp:figState.cmp,ctrl:figState.ctrl}});persist();
    renderPlus();$('#figDlg').close();const t=$('#input');const typeName=(FIG_TYPES[figState.kind]||[]).find(x=>x[0]===figState.type);t.value=(t.value?t.value+'\n':'')+`【Figure】${$('#figTitle').value.trim()||typeName[1]}（${typeName[1]}、誤差: ${figState.opts.errType}${figState.cmp!=='none'?'、'+(figState.spec.compare?figState.spec.compare.test:''):''}）\n`+'```\n'+figState.text.trim()+'\n```\n';fitInput();t.focus();toast('図を添付し、データを入力欄に入れました。質問を添えて送信してください');}
// AI の回答の表から Figure を開く
function figFromTable(tableEl){const rows=[...tableEl.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(c=>c.textContent.trim()).join('\t'));figOpen({text:rows.join('\n')});}
document.addEventListener('DOMContentLoaded',figInit);
