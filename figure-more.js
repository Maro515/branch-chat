// BranCHAT Figure 拡張（P2）
// 前後プロット・ヒストグラム・積み上げ棒・直線回帰・用量反応（4PL）・酵素反応（Michaelis–Menten）・
// 生存曲線（Kaplan–Meier + log-rank + at-risk 表）・ROC（AUC・DeLong）・ヒートマップ/相関行列（クラスタリング付き）・
// フォレストプロット・ウォーターフォール。figure.js の figBuildData / figRender / figAutoKind / figStatsHTML から呼ばれる。
// 描画の既定値は figure.js と同じ（要件書 付録B）。各図種の固有設定は「図種の設定」メニュー（FIG_TOOLS_MORE）。
'use strict';

/* ---------- 図種の登録 ---------- */
FIG_TYPES.column.push(['before-after','前後（対応のある線）'],['histogram','ヒストグラム']);
FIG_TYPES.grouped.push(['stacked-bar','積み上げ棒'],['stacked-100','100% 積み上げ棒']);
FIG_TYPES.xy.push(['xy-regression','散布＋直線回帰'],['xy-dose','用量反応（4PL あてはめ）'],['xy-mm','酵素反応（Michaelis–Menten）']);
Object.assign(FIG_TYPES,{survival:[['km','Kaplan–Meier 生存曲線'],['km-cuminc','累積発生']],roc:[['roc','ROC 曲線']],heatmap:[['heatmap','ヒートマップ'],['corr','相関行列（列どうし）']],forest:[['forest','フォレストプロット']],waterfall:[['waterfall','ウォーターフォール']]});
const FIG_KINDS_MORE=[['survival','生存（Time, Event, Group）'],['roc','ROC（マーカーの列, Class）'],['heatmap','行列（1列目＝行名、見出し＝列名）'],['forest','フォレスト（Study, Estimate, Lower, Upper）'],['waterfall','ウォーターフォール（Patient, Change%, Response）']];
const FIG_DEF_MORE={survCI:false,survCensor:true,survMedian:false,survRisk:true,survText:true,survY:'percent',
  rocFill:false,rocCutoff:true,rocPct:false,rocDir:'auto',rocCutPos:'right',rocCutSize:'0.8',rocCutText:'thr',
  hmScheme:'bwr',hmZ:false,hmValues:false,hmCluster:'none',hmBorder:'white',hmMin:'',hmMax:'',hmColPos:'bottom',
  forestLog:'auto',forestNull:'',forestText:true,forestWeights:true,forestFav:'',
  wfLines:true,wfValues:false,wfLabels:'none',
  baColor:'gray',baMean:false,histBins:'',histRel:'count',histGauss:false,stackLabels:'none',
  regBand:'ci',regBandStyle:'fill',regText:true,regIdent:false,doseX:'auto',doseVar:'4pl',doseGuide:true,doseText:true,doseBand:false,doseCI:true,mmText:true,mmBand:false};
Object.assign(FIG_DEF,FIG_DEF_MORE);FIG_STYLE_KEYS.push(...Object.keys(FIG_DEF_MORE));
const FIG_HM_SCHEMES={bwr:['#0000FF','#FFFFFF','#FF0000'],wb:['#FFFFFF','#08306B'],wr:['#FFFFFF','#B10026'],viridis:['#440154','#3B528B','#21918C','#5EC962','#FDE725'],ryg:['#D73027','#FFFFBF','#1A9850'],gray:['#FFFFFF','#000000']};
const FIG_RESP_COLORS={CR:'#1D4ED8',PR:'#60A5FA',SD:'#9CA3AF',PD:'#DC2626',NE:'#000000'};

// 図種ごとの固有設定（「図種の設定」メニュー）。キーは type を優先し、無ければ kind
const FIG_TOOLS_MORE={
  survival:[{k:'survY',t:'select',l:'Y 軸',o:[['percent','生存率 (%)'],['fraction','生存率 (0–1)']]},{k:'survCI',t:'check',l:'95% CI の帯'},{k:'survCensor',t:'check',l:'打ち切りの印'},{k:'survMedian',t:'check',l:'生存期間中央値の補助線'},{k:'survRisk',t:'check',l:'Number at risk 表'},{k:'survText',t:'check',l:'log-rank P と HR を書く'}],
  roc:[{k:'rocFill',t:'check',l:'AUC を塗る'},{k:'rocCutoff',t:'check',l:'最適カットオフ（Youden）を示す'},{k:'rocCutText',t:'select',l:'カットオフの文字',o:[['thr','しきい値（≥ 6.8）'],['sens','感度/特異度'],['both','しきい値と感度/特異度'],['none','記号だけ']]},{k:'rocCutPos',t:'select',l:'文字の位置',o:[['right','右上'],['left','左下'],['above','真上'],['below','真下']]},{k:'rocCutSize',t:'select',l:'文字の大きさ',o:[['0.7','小'],['0.8','ふつう'],['1','本文と同じ']]},{k:'rocPct',t:'check',l:'軸を % で表示'},{k:'rocDir',t:'select',l:'陽性の向き',o:[['auto','自動（AUC<0.5 なら反転）'],['high','値が大きいほど陽性'],['low','値が小さいほど陽性']]}],
  heatmap:[{k:'hmScheme',t:'select',l:'色',o:[['bwr','青–白–赤'],['wb','白–青'],['wr','白–赤'],['viridis','Viridis'],['ryg','赤–黄–緑'],['gray','白–黒']]},{k:'hmZ',t:'check',l:'行ごとに z スコア化'},{k:'hmValues',t:'check',l:'セルに値を書く'},{k:'hmCluster',t:'select',l:'クラスタリング（樹形図）',o:[['none','なし'],['rows','行'],['cols','列'],['both','行と列']]},{k:'hmBorder',t:'select',l:'セルの枠',o:[['white','白'],['black','黒'],['none','なし']]},{k:'hmColPos',t:'select',l:'列名の位置',o:[['bottom','下'],['top','上']]},{k:'hmMin',t:'text',l:'色の最小（空で自動）'},{k:'hmMax',t:'text',l:'色の最大（空で自動）'}],
  corr:[{k:'hmScheme',t:'select',l:'色',o:[['bwr','青–白–赤'],['ryg','赤–黄–緑'],['gray','白–黒']]},{k:'hmValues',t:'check',l:'セルに r を書く'},{k:'hmBorder',t:'select',l:'セルの枠',o:[['white','白'],['black','黒'],['none','なし']]},{k:'hmColPos',t:'select',l:'列名の位置',o:[['bottom','下'],['top','上']]}],
  forest:[{k:'forestLog',t:'select',l:'横軸',o:[['auto','自動（OR/HR/RR は対数）'],['true','対数'],['false','線形']]},{k:'forestNull',t:'text',l:'効果なしの線（空で自動）'},{k:'forestText',t:'check',l:'右に推定値 [95% CI] を書く'},{k:'forestWeights',t:'check',l:'n と重みの列を書く'},{k:'forestFav',t:'text',l:'軸の下の文字（例: 治療が有利|対照が有利）'}],
  waterfall:[{k:'wfLines',t:'check',l:'+20% / −30% の線'},{k:'wfValues',t:'check',l:'棒に値を書く'},{k:'wfLabels',t:'select',l:'X ラベル',o:[['none','なし'],['id','患者 ID']]}],
  'before-after':[{k:'baColor',t:'select',l:'線の色',o:[['gray','灰色'],['subject','個体ごと'],['black','黒']]},{k:'baMean',t:'check',l:'群の平均を太線で重ねる'}],
  histogram:[{k:'histBins',t:'text',l:'ビン数（空で自動）'},{k:'histRel',t:'select',l:'縦軸',o:[['count','度数'],['percent','相対度数 (%)']]},{k:'histGauss',t:'check',l:'ガウス曲線を重ねる'}],
  'stacked-bar':[{k:'stackLabels',t:'select',l:'区分の文字',o:[['none','なし'],['value','値'],['percent','割合 (%)']]}],
  'stacked-100':[{k:'stackLabels',t:'select',l:'区分の文字',o:[['none','なし'],['value','値'],['percent','割合 (%)']]}],
  'xy-regression':[{k:'regBand',t:'select',l:'帯',o:[['ci','95% 信頼帯'],['pi','95% 予測帯'],['none','なし']]},{k:'regBandStyle',t:'select',l:'帯の描き方',o:[['fill','塗り'],['dash','破線']]},{k:'regText',t:'check',l:'r・R²・P を書く'},{k:'regIdent',t:'check',l:'恒等線（y = x）'}],
  'xy-dose':[{k:'doseX',t:'select',l:'X の意味',o:[['auto','自動'],['conc','濃度（対数軸にする）'],['log','log(濃度)']]},{k:'doseVar',t:'select',l:'モデル',o:[['4pl','4 パラメータ（傾き可変）'],['3pl','3 パラメータ（傾き 1）']]},{k:'doseGuide',t:'check',l:'EC50 の補助線'},{k:'doseText',t:'check',l:'EC50・Hill・R² を書く'},{k:'doseCI',t:'check',l:'EC50 の 95% CI も書く'},{k:'doseBand',t:'check',l:'曲線の 95% 信頼帯'}],
  'xy-mm':[{k:'mmText',t:'check',l:'Vmax・Km を書く'},{k:'mmBand',t:'check',l:'曲線の 95% 信頼帯'}],
};
FIG_TOOLS.splice(1,0,{id:'kind',l:'図種の設定',get items(){const st=figState;if(!st)return [];return FIG_TOOLS_MORE[st.type]||FIG_TOOLS_MORE[st.kind]||[];}});

FIG_PROMPT+=`
ほかの kind / type: column に before-after（行＝同じ個体、列＝時点）・histogram、grouped に stacked-bar・stacked-100、xy に xy-regression（散布＋直線回帰）・xy-dose（X＝濃度、4PL あてはめ）・xy-mm（X＝基質濃度、Michaelis–Menten）。
kind "survival": data の列は Time, Event（1=イベント, 0=打ち切り）, Group（任意）。type は km か km-cuminc。
kind "roc": 数値の列（マーカー、複数可）と Class 列（1=陽性, 0=陰性）。type は roc。
kind "heatmap": 1列目＝行の名前、見出し＝列の名前の数値行列。type は heatmap か corr（列どうしの相関行列）。
kind "forest": 列は Study, Estimate, Lower, Upper, Weight（任意）, n（任意）。Estimate が空の行は小見出し、名前が Overall の行は菱形。
kind "waterfall": 列は Patient, Change（%）, Response（CR/PR/SD/PD、任意）。`;

/* ---------- 共通: スタイルと枠 ---------- */
function figStyle(spec){const o=Object.assign({},FIG_DEF,spec.opts||{});if(FIG_FONTS[o.fontFamily])o.font=FIG_FONTS[o.fontFamily];
  const fs=(+o.fontPt||12)*FIG_PT,h=fs*0.72,a=(+o.axisPt||1)*FIG_PT,tick=h*(+o.tickLen||0.7)*(o.tickDir==='in'?-1:1),ac=o.axisColor||'#000',fw=o.bold?'bold':'normal';
  const txt=(x,y,s,anchor,extra,sel,size)=>`<text ${sel?`data-sel="${sel}" `:''}x="${x}" y="${y}" font-family="${o.font}" font-size="${size||fs}" font-weight="${fw}" text-anchor="${anchor||'middle'}"${extra?' '+extra:''}>${figEsc(s)}</text>`;
  const raw=(x,y,inner,anchor,extra,size)=>`<text x="${x}" y="${y}" font-family="${o.font}" font-size="${size||fs}" font-weight="${fw}" text-anchor="${anchor||'middle'}"${extra?' '+extra:''}>${inner}</text>`;
  const S=i=>figSeriesOpt(o,i);const sym=(x,y,i,color,fill,shape)=>figSymbol(x,y,S(i).symPt*FIG_PT/2,shape||S(i).symbol,fill==='open'?'#fff':color,color);
  return {o,fs,h,a,tick,ac,fw,txt,raw,S,sym,dash:`${FIG_PT*3} ${FIG_PT*2}`};}
function figYRange(o,lo,hi){if(o.ymin!==''&&o.ymin!=null&&isFinite(+o.ymin))lo=+o.ymin;if(o.ymax!==''&&o.ymax!=null&&isFinite(+o.ymax))hi=+o.ymax;if(!(hi>lo))hi=lo+1;return [lo,hi];}
// 目盛。範囲が目盛を 30% 以上はみ出すときは目盛を 1 つ延ばし、少しのはみ出しは軸線を目盛で止めて描く（figure.js と同じ）
function figAxisLin(lo,hi,n,fmt){if(!(hi>lo))hi=lo+1;const t=figNiceTicks(lo,hi,n||5);const ts=t.ticks.slice();if(ts[0]-lo>t.step*0.4)ts.unshift(+(ts[0]-t.step).toFixed(10));if(hi-ts[ts.length-1]>t.step*0.4)ts.push(+(ts[ts.length-1]+t.step).toFixed(10));return {lo:Math.min(lo,ts[0]),hi:Math.max(hi,ts[ts.length-1]),ticks:ts.map(v=>({v,l:fmt?fmt(v):figFmt(v)}))};}
function figSup10(e){return `10<tspan dy="-0.5em" font-size="70%">${e}</tspan>`;}
// 対数の目盛（値は log10 のまま線形に置く）。lo/hi は log10 の値
function figAxisDecades(lo,hi){const e0=Math.floor(lo),e1=Math.ceil(hi);const step=e1-e0>8?2:1;const ticks=[];for(let e=e0;e<=e1;e+=step)ticks.push({v:e,raw:figSup10(e)});return {lo:e0,hi:Math.max(e1,e0+1),ticks};}
function figDark(hex){const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex||'');if(!m)return false;return (0.299*parseInt(m[1],16)+0.587*parseInt(m[2],16)+0.114*parseInt(m[3],16))<120;}
function figGrad(stops,t){t=Math.max(0,Math.min(1,isFinite(t)?t:0));const n=stops.length-1;const i=Math.min(n-1,Math.floor(t*n)),f=t*n-i;const c=s=>[1,3,5].map(k=>parseInt(s.slice(k,k+2),16));const A=c(stops[i]),B=c(stops[i+1]);return '#'+A.map((v,k)=>Math.round(v+(B[k]-v)*f).toString(16).padStart(2,'0')).join('');}
function figPtext(p){return !(p>=0)?'P = n/a':p<0.0001?'P < 0.0001':'P = '+p.toFixed(p<0.01?4:3);}
function figSci(v){if(!isFinite(v))return '–';const av=Math.abs(v);if(av>=1e-3&&av<1e5)return figFmt(+v.toPrecision(3));return v.toExponential(2).replace('e-','e−');}

// 数値 X・数値 Y の枠（軸・目盛・題・凡例）。cfg: {x:{lo,hi,ticks:[{v,l|raw}]}, y:同, xTitle,yTitle, legend:[{name,kind:'sym'|'rect'|'line',i}], wIn,hIn, padL,padB,padR,padT(追加分), xAxisAt}
function figFrame(spec,cfg){
  const st=figStyle(spec);const {o,fs,h,a,tick,ac,txt,raw,S,sym}=st;
  const plotW=(cfg.wIn||+o.wIn||3)*FIG_IN,plotH=(cfg.hIn||+o.hIn||2)*FIG_IN;
  const legend=cfg.legend||[];const legendPos=legend.length?(o.legendPos||'right'):'none';const xrot=+o.xRot||cfg.xRot||0;
  const legW=legendPos==='right'?Math.max(fs*(cfg.legendW||8),Math.max(...legend.map(it=>figTW(it.name,fs)))+fs*2.2):0;const padL=fs*(cfg.yTitle?4.2:2.8)+(cfg.padL||0),padB=fs*(cfg.xTitle?3.2:2)+(xrot?fs*2.2:0)+(legendPos==='bottom'?fs*1.8:0)+(cfg.padB||0),padR=fs*1.2+legW+(cfg.padR||0);const titleL=figTitleLines(spec.title,padL+plotW+padR-fs,fs);const padT=fs*1.6+(titleL.lines.length?fs*0.8+titleL.lines.length*titleL.size*1.2*0.85:0)+(cfg.padT||0);
  const W=padL+plotW+padR,H=padT+plotH+padB,x0=padL,y0=padT+plotH;const xs=cfg.x,ys=cfg.y;
  const xOf=v=>x0+(v-xs.lo)/(xs.hi-xs.lo)*plotW,yOf=v=>y0-(v-ys.lo)/(ys.hi-ys.lo)*plotH;
  const yT=ys.ticks.length&&!ys.cat?yOf(ys.ticks[ys.ticks.length-1].v):padT,yB=ys.ticks.length&&!ys.cat?yOf(ys.ticks[0].v):y0;const xA=xs.ticks.length&&!xs.cat?xOf(xs.ticks[0].v):x0,xB=xs.ticks.length&&!xs.cat?xOf(xs.ticks[xs.ticks.length-1].v):x0+plotW;
  let axes=`<line x1="${x0}" y1="${yB}" x2="${x0}" y2="${yT}" stroke="${ac}" stroke-width="${a}" stroke-linecap="square"/>`,grid='';
  if(o.frame==='box')axes+=`<rect x="${x0}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="${ac}" stroke-width="${a}"/>`;
  for(const t of ys.ticks){const y=yOf(t.v);axes+=`<line x1="${x0}" y1="${y}" x2="${x0-tick}" y2="${y}" stroke="${ac}" stroke-width="${a}"/>`+(t.raw?raw(x0-Math.max(0,tick)-fs*0.3,y+h/2,t.raw,'end'):txt(x0-Math.max(0,tick)-fs*0.3,y+h/2,t.l,'end'));if(o.grid==='major')grid+=`<line x1="${x0}" y1="${y}" x2="${x0+plotW}" y2="${y}" stroke="#bbb" stroke-width="${FIG_PT*0.5}"/>`;}
  const xAxisY=cfg.xAxisAt!=null?yOf(cfg.xAxisAt):y0;
  axes+=`<line x1="${xA}" y1="${xAxisY}" x2="${xB}" y2="${xAxisY}" stroke="${ac}" stroke-width="${a}" stroke-linecap="square"/>`;
  for(const t of xs.ticks){const x=xOf(t.v);axes+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+tick}" stroke="${ac}" stroke-width="${a}"/>`;const y=y0+Math.max(0,tick)+(xrot?fs*0.6:fs*1.05);const extra=xrot?`transform="rotate(-${xrot} ${x} ${y})"`:'';axes+=t.raw?raw(x,y,t.raw,xrot?'end':'middle',extra):txt(x,y,t.l,xrot?'end':'middle',extra);}
  if(o.refLine!==''&&o.refLine!=null&&isFinite(+o.refLine))grid+=`<line x1="${x0}" y1="${yOf(+o.refLine)}" x2="${x0+plotW}" y2="${yOf(+o.refLine)}" stroke="#444" stroke-width="${FIG_PT*0.75}" stroke-dasharray="${st.dash}"/>`;
  let titles='';if(cfg.yTitle)titles+=txt(x0-tick-fs*2.6,(yB+yT)/2,cfg.yTitle,'middle',`transform="rotate(-90 ${x0-tick-fs*2.6} ${(yB+yT)/2})"`,'ytitle');
  if(cfg.xTitle)titles+=txt(x0+plotW/2,y0+Math.max(0,tick)+(xs.ticks.length?fs*2.3:fs*1.2)+(xrot?fs*2:0),cfg.xTitle,'middle','','xtitle');
  let leg='';if(legendPos!=='none'){const bottom=legendPos==='bottom';const itemW=fs*7;const lx0=bottom?x0+plotW/2-itemW*legend.length/2:x0+plotW+fs*1.2;legend.forEach((it,k)=>{const lx=bottom?lx0+k*itemW:lx0;const ly=bottom?H-fs*0.6:padT+fs*(k*1.5+0.8);const so=S(it.i==null?k:it.i);const c=it.color||so.color;
    if(it.kind==='rect')leg+=`<rect x="${lx}" y="${ly-fs*0.55}" width="${fs*1.1}" height="${fs*0.75}" fill="${so.fill==='open'?'#fff':c}" stroke="${c}"/>`;else if(it.kind==='line')leg+=`<line x1="${lx}" y1="${ly-fs*0.2}" x2="${lx+fs*1.1}" y2="${ly-fs*0.2}" stroke="${c}" stroke-width="${so.lineW*FIG_PT*1.5}"/>`;else leg+=sym(lx+fs*0.5,ly-fs*0.2,it.i==null?k:it.i,c,it.fill||so.fill,it.shape);
    leg+=txt(lx+fs*1.5,ly,it.name,'start');});}
  const title=figTitleSVG(txt,x0+plotW/2,padT-fs*0.9-(cfg.padT||0),spec.title,W-fs,fs);
  const wrap=(body,extra)=>({svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${grid}<g data-sel="axes">${axes}</g>${titles}${body}${leg?`<g data-sel="legend">${leg}</g>`:''}${title}${figNotesSVG(o,x0,padT,plotW,plotH,fs,o.font,st.fw)}${extra||''}</svg>`,w:W,h:H,plot:{x0,y0:padT,w:plotW,h:plotH}});
  return Object.assign(st,{x0,y0,plotW,plotH,W,H,padT,padL,padB,padR,xOf,yOf,wrap,xAxisY});
}
// 有意差ブラケット（figure.js と同じ見た目）。pairs: [{a,b,p}]、centers: [{cx,top}]
function figBracketsMore(pairs,centers,F){const {o,h,fs,a,ac,txt}=F;const ps=pairs.filter(p=>o.showNs||p.p<o.pThr).map(p=>({...p,l:Math.min(p.a,p.b),r:Math.max(p.a,p.b)})).sort((p,q)=>(p.r-p.l)-(q.r-q.l));if(!ps.length)return {svg:'',n:0};
  const levels=[];for(const p of ps){let lv=0;for(;;lv++){if(!levels[lv]||!levels[lv].some(q=>!(p.r<q.l||p.l>q.r)))break;}(levels[lv]=levels[lv]||[]).push(p);p.lv=lv;}
  const base=Math.min(...centers.map(c=>c.top))-0.75*h;const topOf=(l,r)=>Math.min(...centers.slice(l,r+1).map(c=>c.top))-0.75*h;let s='';
  for(const p of ps){const y=Math.min(base,topOf(p.l,p.r))-p.lv*2*h-(p.lv?0.6*h:0);const xa=centers[p.l].cx,xb=centers[p.r].cx;const leg=o.bracketShape==='long'?h*0.7:h*0.3;s+=`<polyline points="${xa},${y+leg} ${xa},${y} ${xb},${y} ${xb},${y+leg}" fill="none" stroke="${ac}" stroke-width="${a}"/>`+txt((xa+xb)/2,y-fs*0.15,figStars(p.p,o.pStyle));}
  return {svg:s,n:levels.length};}
function figNLevels(pairs,o){const ps=pairs.filter(p=>o.showNs||p.p<o.pThr).map(p=>({l:Math.min(p.a,p.b),r:Math.max(p.a,p.b)})).sort((p,q)=>(p.r-p.l)-(q.r-q.l));const lv=[];for(const p of ps){let k=0;for(;;k++){if(!lv[k]||!lv[k].some(q=>!(p.r<q.l||p.l>q.r)))break;}(lv[k]=lv[k]||[]).push(p);}return lv.length;}

/* ---------- 共通: 数値 ---------- */
// Nelder–Mead（非線形あてはめ用）。f: 目的関数、x0: 初期値
function figNM(f,x0,opt){const n=x0.length;opt=opt||{};const step=opt.step||x0.map(v=>Math.abs(v)*0.1||0.1);let sx=[x0.slice()];for(let i=0;i<n;i++){const p=x0.slice();p[i]+=step[i];sx.push(p);}let fx=sx.map(f);
  for(let it=0;it<(opt.maxIt||4000);it++){const idx=fx.map((v,i)=>i).sort((a,b)=>fx[a]-fx[b]);sx=idx.map(i=>sx[i]);fx=idx.map(i=>fx[i]);
    if(Math.abs(fx[n]-fx[0])<=1e-12*(Math.abs(fx[0])+1e-12)&&it>50)break;
    const c=new Array(n).fill(0);for(let i=0;i<n;i++)for(let j=0;j<n;j++)c[j]+=sx[i][j]/n;const w=sx[n];
    const xr=c.map((v,j)=>v+(v-w[j]));const fr=f(xr);
    if(fr<fx[0]){const xe=c.map((v,j)=>v+2*(v-w[j]));const fe=f(xe);if(fe<fr){sx[n]=xe;fx[n]=fe;}else{sx[n]=xr;fx[n]=fr;}}
    else if(fr<fx[n-1]){sx[n]=xr;fx[n]=fr;}
    else{const xc=c.map((v,j)=>v+0.5*(w[j]-v));const fc=f(xc);if(fc<fx[n]){sx[n]=xc;fx[n]=fc;}else{for(let i=1;i<=n;i++){sx[i]=sx[i].map((v,j)=>sx[0][j]+0.5*(v-sx[0][j]));fx[i]=f(sx[i]);}}}}
  const best=fx.indexOf(Math.min(...fx));return {x:sx[best],f:fx[best]};}
function figCov(x,y){const n=x.length;if(n<2)return 0;const mx=mean(x),my=mean(y);let s=0;for(let i=0;i<n;i++)s+=(x[i]-mx)*(y[i]-my);return s/(n-1);}
// 直線回帰（傾き・切片・r・R²・P、信頼帯/予測帯）
function figLinFit(xy){const n=xy.length;if(n<3)return null;const x=xy.map(p=>p[0]),y=xy.map(p=>p[1]);const r=linReg(x.map(v=>[1,v]),y,['切片','傾き']);if(r.error)return null;const mx=mean(x);let sxx=0;for(const v of x)sxx+=(v-mx)*(v-mx);const tc=tQuantile(0.975,n-2);const pr=pearson(x,y);
  return {slope:r.beta[1],icpt:r.beta[0],se:r.se,r2:r.r2,r:pr.r,p:r.ps[1],n,rmse:r.rmse,ciLo:r.ciLo,ciHi:r.ciHi,at:v=>r.beta[0]+r.beta[1]*v,band:(v,pi)=>{const se=r.rmse*Math.sqrt((pi?1:0)+1/n+(v-mx)*(v-mx)/(sxx||1));const m=r.beta[0]+r.beta[1]*v;return {lo:m-tc*se,hi:m+tc*se};}};}
// 非線形あてはめの仕上げと SE/CI。Levenberg–Marquardt で最適点を詰め、漸近共分散 Cov = s²(JᵀJ)⁻¹（s² = SSE/(n−p)）から SE と 95% CI（t 分布）を出す。
// f(p,x) はモデル、xy は [x,y] の配列、fixed は固定するパラメータの添字（3PL の Hill）。曲線の 95% 信頼帯はデルタ法 sqrt(gᵀ Cov g)。
function figJac(f,p,xs,fixed){const n=xs.length,k=p.length;const J=[];for(let i=0;i<n;i++)J.push(new Array(k).fill(0));for(let j=0;j<k;j++){if(fixed&&fixed.includes(j))continue;const h=1e-6*Math.max(1,Math.abs(p[j]));const pp=p.slice(),pm=p.slice();pp[j]+=h;pm[j]-=h;for(let i=0;i<n;i++)J[i][j]=(f(pp,xs[i])-f(pm,xs[i]))/(2*h);}return J;}
function figLM(f,p0,xy,fixed,maxIt){let p=p0.slice();const xs=xy.map(q=>q[0]),ys=xy.map(q=>q[1]);const free=p.map((_,j)=>j).filter(j=>!(fixed&&fixed.includes(j)));const sse=q=>{let s=0;for(const [x,y] of xy){const e=f(q,x)-y;if(!isFinite(e))return Infinity;s+=e*e;}return s;};let cur=sse(p),lam=1e-3;
  for(let it=0;it<(maxIt||60);it++){const J=figJac(f,p,xs,fixed);const r=xs.map((x,i)=>ys[i]-f(p,x));const m=free.length;const A=[],g=[];for(let a=0;a<m;a++){A.push(new Array(m).fill(0));let s=0;for(let i=0;i<xs.length;i++)s+=J[i][free[a]]*r[i];g.push(s);for(let b=0;b<m;b++){let t=0;for(let i=0;i<xs.length;i++)t+=J[i][free[a]]*J[i][free[b]];A[a][b]=t;}}
    let improved=false;for(let tries=0;tries<10;tries++){const M=A.map((row,a)=>row.map((v,b)=>a===b?v*(1+lam):v));let d;try{const sc=M.map((row,a)=>1/Math.sqrt(Math.max(row[a],1e-300)));const M2=M.map((row,a)=>row.map((v,b)=>v*sc[a]*sc[b]));const g2=g.map((v,a)=>v*sc[a]);const d2=solveSym(M2,g2);d=d2&&d2.map((v,a)=>v*sc[a]);}catch(e){d=null;}if(!d||d.some(v=>!isFinite(v))){lam*=10;continue;}const q=p.slice();free.forEach((j,a)=>{q[j]+=d[a];});const nv=sse(q);if(nv<cur){const rel=(cur-nv)/(cur||1);p=q;cur=nv;lam=Math.max(1e-12,lam/3);improved=true;if(rel<1e-12)return {p,sse:cur,converged:true};break;}lam*=10;}
    if(!improved)break;}
  return {p,sse:cur,converged:false};}
function figNLSStats(f,p,xy,fixed){const n=xy.length,k=p.length;const free=p.map((_,j)=>j).filter(j=>!(fixed&&fixed.includes(j)));const df=n-free.length;if(df<1)return null;const xs=xy.map(q=>q[0]);let sse=0;for(const [x,y] of xy){const e=f(p,x)-y;sse+=e*e;}const s2=sse/df;const J=figJac(f,p,xs,fixed);const m=free.length;const A=[];for(let a=0;a<m;a++){A.push(new Array(m).fill(0));for(let b=0;b<m;b++){let t=0;for(let i=0;i<n;i++)t+=J[i][free[a]]*J[i][free[b]];A[a][b]=t;}}
  let inv;try{const sc=A.map((row,a)=>1/Math.sqrt(Math.max(row[a],1e-300)));const inv2=matInv(A.map((row,a)=>row.map((v,b)=>v*sc[a]*sc[b])));inv=inv2&&inv2.map((row,a)=>row.map((v,b)=>v*sc[a]*sc[b]));}catch(e){return null;}if(!inv||inv.some(r=>r.some(v=>!isFinite(v))))return null;const cov=p.map(()=>p.map(()=>0));free.forEach((j,a)=>free.forEach((l,b)=>{cov[j][l]=inv[a][b]*s2;}));const tc=tQuantile(0.975,df);const se=p.map((_,j)=>Math.sqrt(Math.max(0,cov[j][j])));
  const band=x=>{const g=p.map((_,j)=>{if(fixed&&fixed.includes(j))return 0;const h=1e-6*Math.max(1,Math.abs(p[j]));const pp=p.slice(),pm=p.slice();pp[j]+=h;pm[j]-=h;return (f(pp,x)-f(pm,x))/(2*h);});let v=0;for(let a=0;a<k;a++)for(let b=0;b<k;b++)v+=g[a]*cov[a][b]*g[b];return tc*Math.sqrt(Math.max(0,v));};
  return {se,ciLo:p.map((v,j)=>v-tc*se[j]),ciHi:p.map((v,j)=>v+tc*se[j]),cov,df,s2,sy:Math.sqrt(s2),tc,band};}
// 4PL: Y = Bottom + (Top − Bottom) / (1 + 10^((logEC50 − X)·Hill))。pts: [{lx, ys}]
function fig4PL(pts,variant){const xy=[];pts.forEach(p=>p.ys.forEach(y=>xy.push([p.lx,y])));if(xy.length<4)return null;const xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]);const B0=Math.min(...ys),T0=Math.max(...ys);const mid=(B0+T0)/2;let best=xy[0];for(const p of xy)if(Math.abs(p[1]-mid)<Math.abs(best[1]-mid))best=p;const E0=best[0];const H0=pearson(xs,ys).r<0?-1:1;
  const f=(p,x)=>p[0]+(p[1]-p[0])/(1+Math.pow(10,(p[2]-x)*p[3]));const sse=p=>{let s=0;for(const q of xy){const e=f(p,q[0])-q[1];s+=e*e;}return s;};const sp=(T0-B0)*0.1||1;
  let res;if(variant==='3pl'){const g=q=>sse([q[0],q[1],q[2],H0]);res=figNM(g,[B0,T0,E0],{step:[sp,sp,0.3]});res=figNM(g,res.x,{step:[sp*0.1,sp*0.1,0.05]});res.x=[...res.x,H0];}
  else{res=figNM(sse,[B0,T0,E0,H0],{step:[sp,sp,0.3,0.3]});res=figNM(sse,res.x,{step:[sp*0.1,sp*0.1,0.05,0.1]});}
  const fixed=variant==='3pl'?[3]:null;const lm=figLM(f,res.x,xy,fixed);if(lm.sse<=res.f){res.x=lm.p;res.f=lm.sse;}const st=figNLSStats(f,res.x,xy,fixed);
  const my=mean(ys);let sst=0;for(const y of ys)sst+=(y-my)*(y-my);return {p:res.x,sse:res.f,r2:sst?1-res.f/sst:NaN,at:x=>f(res.x,x),n:xy.length,stats:st,fixed};}
// Michaelis–Menten: V = Vmax·X / (Km + X)
function figMM(pts){const xy=[];pts.forEach(p=>p.ys.forEach(y=>xy.push([p.x,y])));if(xy.length<3)return null;const ys=xy.map(p=>p[1]);const V0=Math.max(...ys)*1.1;const half=V0/2;let best=xy[0];for(const p of xy)if(Math.abs(p[1]-half)<Math.abs(best[1]-half))best=p;const K0=Math.max(best[0],1e-9);
  const f=(p,x)=>p[0]*x/(p[1]+x);const sse=p=>{if(p[1]<=0)return 1e300;let s=0;for(const q of xy){const e=f(p,q[0])-q[1];s+=e*e;}return s;};
  let res=figNM(sse,[V0,K0],{step:[V0*0.1,K0*0.3]});res=figNM(sse,res.x,{step:[V0*0.01,K0*0.05]});const lm=figLM(f,res.x,xy,null);if(lm.sse<=res.f&&lm.p[1]>0){res.x=lm.p;res.f=lm.sse;}const st=figNLSStats(f,res.x,xy,null);const my=mean(ys);let sst=0;for(const y of ys)sst+=(y-my)*(y-my);return {p:res.x,sse:res.f,r2:sst?1-res.f/sst:NaN,at:x=>f(res.x,x),n:xy.length,stats:st};}
// Kaplan–Meier（Greenwood の分散、log-log 変換の 95% CI）
function figKM(times,events){const idx=times.map((t,i)=>i).sort((a,b)=>times[a]-times[b]);const n=times.length;const steps=[{t:0,s:1,lo:1,hi:1,n,d:0}];const censors=[];let s=1,v=0,i=0,atRisk=n;
  while(i<n){const t=times[idx[i]];let d=0,c=0;while(i<n&&times[idx[i]]===t){if(events[idx[i]])d++;else c++;i++;}
    if(d>0){s*=(atRisk-d)/atRisk;if(atRisk>d)v+=d/(atRisk*(atRisk-d));let lo=s,hi=s;if(s>0&&s<1){const se=Math.sqrt(v)/Math.abs(Math.log(s));lo=Math.pow(s,Math.exp(1.959964*se));hi=Math.pow(s,Math.exp(-1.959964*se));}steps.push({t,s,lo,hi,n:atRisk,d});}
    if(c>0)censors.push({t,s});atRisk-=d+c;}
  let med=null;for(const st of steps)if(st.t>0&&st.s<=0.5){med=st.t;break;}
  return {steps,censors,median:med,n,events:events.reduce((a,b)=>a+b,0),maxT:Math.max(...times)};}
// ROC（感度・特異度の点、AUC、DeLong の SE、Youden の最適カットオフ）
function figROC(pos,neg){const m=pos.length,n=neg.length;const thr=[...new Set(pos.concat(neg))].sort((a,b)=>b-a);const pts=[{fpr:0,tpr:0,thr:Infinity}];for(const t of thr)pts.push({fpr:neg.filter(v=>v>=t).length/n,tpr:pos.filter(v=>v>=t).length/m,thr:t});
  const psi=(p,q)=>p>q?1:p===q?0.5:0;const V10=pos.map(p=>{let s=0;for(const q of neg)s+=psi(p,q);return s/n;}),V01=neg.map(q=>{let s=0;for(const p of pos)s+=psi(p,q);return s/m;});const auc=mean(V10);const se=Math.sqrt((m>1?variance(V10):0)/m+(n>1?variance(V01):0)/n);
  let best=pts[0],bj=-Infinity;for(const p of pts){const j=p.tpr-p.fpr;if(j>bj){bj=j;best=p;}}
  return {pts,auc,se,lo:Math.max(0,auc-1.959964*se),hi:Math.min(1,auc+1.959964*se),youden:best,V10,V01,m,n};}
function figDeLongCompare(r1,r2){if(r1.m!==r2.m||r1.n!==r2.n)return null;const v=r1.se*r1.se+r2.se*r2.se-2*(figCov(r1.V10,r2.V10)/r1.m+figCov(r1.V01,r2.V01)/r1.n);if(!(v>0))return null;const z=(r1.auc-r2.auc)/Math.sqrt(v);return {z,p:2*(1-normCDF(Math.abs(z)))};}
// 階層的クラスタリング（ユークリッド距離・平均連結）。vecs: 行ベクトルの配列
function figHClust(vecs){const n=vecs.length;if(n<2)return {order:vecs.map((_,i)=>i),root:{leaf:0,h:0}};const dist=(a,b)=>{let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d;}return Math.sqrt(s);};
  const D=[];for(let i=0;i<n;i++){D[i]=[];for(let j=0;j<n;j++)D[i][j]=i===j?0:dist(vecs[i],vecs[j]);}let cl=vecs.map((v,i)=>({m:[i],node:{leaf:i,h:0}}));
  while(cl.length>1){let bi=0,bj=1,bd=Infinity;for(let i=0;i<cl.length;i++)for(let j=i+1;j<cl.length;j++){let s=0;for(const a of cl[i].m)for(const b of cl[j].m)s+=D[a][b];const d=s/(cl[i].m.length*cl[j].m.length);if(d<bd){bd=d;bi=i;bj=j;}}
    const A=cl[bi],B=cl[bj];const node={h:bd,left:A.node,right:B.node};cl=cl.filter((_,i)=>i!==bi&&i!==bj);cl.push({m:A.m.concat(B.m),node});}
  const order=[];const walk=nd=>{if(nd.leaf!==undefined)order.push(nd.leaf);else{walk(nd.left);walk(nd.right);}};walk(cl[0].node);return {order,root:cl[0].node};}
// 樹形図。pos(leaf)=葉の位置、base=葉側の座標、len=根までの長さ、dir='row'（左へ伸びる）|'col'（上へ伸びる）
function figDendro(tree,pos,base,len,dir,ac,a){const H=tree.root.h||1;let s='';const hc=h=>base-(h/H)*len;const seg=(p1,c1,p2,c2)=>dir==='row'?`<line x1="${c1}" y1="${p1}" x2="${c2}" y2="${p2}" stroke="${ac}" stroke-width="${a*0.75}"/>`:`<line x1="${p1}" y1="${c1}" x2="${p2}" y2="${c2}" stroke="${ac}" stroke-width="${a*0.75}"/>`;
  const rec=nd=>{if(nd.leaf!==undefined)return {p:pos(nd.leaf),c:base};const L=rec(nd.left),R=rec(nd.right);const c=hc(nd.h);s+=seg(L.p,L.c,L.p,c)+seg(R.p,R.c,R.p,c)+seg(L.p,c,R.p,c);return {p:(L.p+R.p)/2,c};};rec(tree.root);return `<g data-sel="dendro">${s}</g>`;}

/* ---------- データ表の判定と組み立て ---------- */
const figLC=c=>String(c.name||'').toLowerCase();
const figUniq=c=>[...new Set(c.raw.filter(v=>v!==''))];
const figIsBin=c=>{const u=figUniq(c);return u.length>0&&u.length<=2&&u.every(v=>/^(0|1|yes|no|true|false|dead|alive|death|event|censored?|died|y|n|あり|なし|有|無|死亡|生存|打ち切り)$/i.test(v));};
function figAutoKindMore(parsed){const cols=parsed.cols;
  if(typeof figAutoKindP3==='function'){const k=figAutoKindP3(parsed);if(k)return k;} // figure-more2.js
  const hasT=cols.some(c=>/^(time|day|days|month|months|week|weeks|year|years|os|pfs|dfs|生存期間|期間|日数|月数)$|time/.test(figLC(c))&&c.vals.some(v=>v!==null));const hasE=cols.some(c=>/event|status|death|dead|died|イベント|死亡|転帰|censor/.test(figLC(c))&&figIsBin(c));
  if(hasT&&hasE)return 'survival';
  if(cols.some(c=>/^(class|outcome|label|disease|truth|diagnosis|結果|疾患|陽性|正解|診断)$/.test(figLC(c))&&figUniq(c).length===2)&&cols.some(c=>c.vals.filter(v=>v!==null).length>=3&&figUniq(c).length>2))return 'roc';
  if(parsed.firstColText&&cols.some(c=>/lower|lcl|lci|下限/.test(figLC(c)))&&cols.some(c=>/upper|ucl|uci|上限/.test(figLC(c))))return 'forest';
  return null;}
function figBuildDataMore(parsed,kind){
  if(typeof figBuildDataP3==='function'){const r=figBuildDataP3(parsed,kind);if(r!==undefined)return r;}
  if(kind==='survival')return figBuildSurvival(parsed);if(kind==='roc')return figBuildROC(parsed);if(kind==='heatmap')return figBuildHeatmap(parsed);if(kind==='forest')return figBuildForest(parsed);if(kind==='waterfall')return figBuildWaterfall(parsed);
  return undefined;}
function figBuildSurvival(parsed){const cols=parsed.cols;
  const tCol=cols.find(c=>/time|day|month|week|year|日|月|週|年|期間|生存/.test(figLC(c))&&c.vals.some(v=>v!==null))||cols.find(c=>c.vals.some(v=>v!==null)&&!figIsBin(c));
  const eCol=cols.find(c=>c!==tCol&&/event|status|death|dead|died|イベント|死亡|転帰|censor/.test(figLC(c)))||cols.find(c=>c!==tCol&&figIsBin(c));if(!tCol||!eCol)return null;
  const gCol=cols.find(c=>c!==tCol&&c!==eCol&&/group|arm|treat|群|治療|strata|cohort/.test(figLC(c)))||cols.find(c=>c!==tCol&&c!==eCol&&c.raw.some(v=>v!==''&&isNaN(+v)))||null;
  const inv=/censor/.test(figLC(eCol));const ev=s=>{const v=String(s).trim().toLowerCase();const e=/^(1|yes|true|dead|death|event|died|y|あり|有|死亡)$/.test(v)?1:0;return inv?1-e:e;};
  const map={},order=[];tCol.vals.forEach((t,i)=>{if(t===null||eCol.raw[i]==='')return;const g=gCol?(gCol.raw[i]||'(なし)'):'All';if(!map[g]){map[g]={name:g,times:[],events:[]};order.push(g);}map[g].times.push(t);map[g].events.push(ev(eCol.raw[i]));});
  if(!order.length)return null;return {kind:'survival',groups:order.map(g=>map[g]),tname:tCol.name};}
function figBuildROC(parsed){const cols=parsed.cols;
  const cCol=cols.find(c=>/class|outcome|label|disease|status|positive|truth|diagnosis|結果|疾患|陽性|群|状態|正解|診断/.test(figLC(c))&&figUniq(c).length===2)||cols.slice().reverse().find(c=>figUniq(c).length===2);if(!cCol)return null;
  const u=figUniq(cCol);const posRe=/^(1|yes|true|positive|pos|disease|case|cancer|dead|y|陽性|あり|有|疾患|患者|悪性|癌|がん)$/i;let posVal=u.find(v=>posRe.test(v));if(posVal==null)posVal=u.slice().sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}))[1];
  const markers=cols.filter(c=>c!==cCol&&c.vals.filter(v=>v!==null).length>=3&&figUniq(c).length>2);
  const groups=markers.map(m=>{const pos=[],neg=[];m.vals.forEach((v,i)=>{if(v===null||cCol.raw[i]==='')return;(cCol.raw[i]===posVal?pos:neg).push(v);});return {name:m.name,pos,neg};}).filter(g=>g.pos.length&&g.neg.length);
  if(!groups.length)return null;return {kind:'roc',groups,posVal,cname:cCol.name};}
function figBuildHeatmap(parsed){const cols=parsed.cols;const first=parsed.firstColText;const dataCols=(first?cols.slice(1):cols).filter(c=>c.vals.some(v=>v!==null));if(!dataCols.length)return null;
  const rowsAll=first?parsed.rowLabels:cols[0].vals.map((_,i)=>String(i+1));const keep=rowsAll.map((_,ri)=>dataCols.some(c=>c.vals[ri]!==null));
  const rows=rowsAll.filter((_,i)=>keep[i]);const m=rowsAll.map((_,ri)=>dataCols.map(c=>c.vals[ri])).filter((_,i)=>keep[i]);return {kind:'heatmap',rows,cols:dataCols.map(c=>c.name),m,groups:[]};}
function figBuildForest(parsed){const cols=parsed.cols;const num=cols.filter(c=>c.vals.some(v=>v!==null));
  const lo=num.find(c=>/low|lcl|lci|lower|下限|2\.5/.test(figLC(c)));const hi=num.find(c=>c!==lo&&/up|ucl|uci|upper|上限|97\.5/.test(figLC(c)));
  const est=num.find(c=>c!==lo&&c!==hi&&/est|^or$|^hr$|^rr$|ratio|effect|point|^md$|smd|推定|効果|オッズ|ハザード/.test(figLC(c)))||num.find(c=>c!==lo&&c!==hi);if(!est)return null;
  const lo2=lo||num.find(c=>c!==est&&c!==hi),hi2=hi||num.find(c=>c!==est&&c!==lo2);if(!lo2||!hi2)return null;
  const w=num.find(c=>![est,lo2,hi2].includes(c)&&/weight|wt|重み|%/.test(figLC(c)))||null;const pc=num.find(c=>![est,lo2,hi2,w].includes(c)&&/^(p|pval|p_value|pvalue|p\.value|p値)$/.test(figLC(c)))||null;const nn=num.find(c=>![est,lo2,hi2,w].includes(c)&&/^n$|^n |size|例数|人数|患者数/.test(figLC(c)))||null;
  const items=parsed.rowLabels.map((lab,i)=>{const label=parsed.firstColText?lab:String(i+1);const e=est.vals[i];if(e===null)return {label,kind:'head'};return {label,est:e,lo:lo2.vals[i],hi:hi2.vals[i],w:w?w.vals[i]:null,n:nn?nn.vals[i]:null,p:pc?pc.vals[i]:null,kind:/overall|pooled|total|summary|combined|全体|統合|合計|random|fixed/i.test(label)?'pooled':'row'};}).filter(it=>it.kind==='head'||(it.lo!==null&&it.hi!==null));
  if(!items.some(it=>it.kind!=='head'))return null;return {kind:'forest',items,ename:est.name,sname:parsed.firstColText?cols[0].name:'',hasP:!!pc,groups:[]};}
function figBuildWaterfall(parsed){const cols=parsed.cols;const num=cols.filter(c=>c.vals.some(v=>v!==null));const ch=num.find(c=>/change|%|best|変化|縮小|resp/.test(figLC(c)))||num[0];if(!ch)return null;
  const resp=cols.find(c=>c!==ch&&c.raw.some(v=>/^(CR|PR|SD|PD|NE)$/i.test(v)))||null;const idCol=parsed.firstColText?cols[0]:null;
  const items=ch.vals.map((v,i)=>v===null?null:({id:idCol?idCol.raw[i]:String(i+1),v,resp:resp?String(resp.raw[i]||'').toUpperCase():null})).filter(Boolean).sort((p,q)=>q.v-p.v);
  const order=['CR','PR','SD','PD','NE'];const cats=resp?[...new Set(items.map(it=>it.resp))].filter(Boolean).sort((a,b)=>order.indexOf(a)-order.indexOf(b)):[];
  return {kind:'waterfall',items,cats,groups:cats.map(c=>({name:c}))};}

/* ---------- 描画 ---------- */
function figRenderMore(spec){const d=spec.data,t=spec.type;
  if(typeof figRenderP3==='function'){const r=figRenderP3(spec);if(r)return r;}
  if(d.kind==='survival')return figRenderSurvival(spec);if(d.kind==='roc')return figRenderROC(spec);if(d.kind==='heatmap')return figRenderHeatmap(spec);if(d.kind==='forest')return figRenderForest(spec);if(d.kind==='waterfall')return figRenderWaterfall(spec);
  if(t==='before-after')return figRenderBA(spec);if(t==='histogram')return figRenderHist(spec);if(t==='stacked-bar'||t==='stacked-100')return figRenderStacked(spec);
  if(t==='xy-regression')return figRenderReg(spec);if(t==='xy-dose')return figRenderDose(spec);if(t==='xy-mm')return figRenderMM(spec);
  return null;}

// 前後プロット（column: 行＝同じ個体、列＝時点）。有意差は対応のある t 検定（3 つ以上は Holm 補正）
function figPairedPairs(gs,cmp,ctrl){if(!cmp||cmp==='none'||gs.length<2)return [];const out=[];const idx=gs.map((_,i)=>i);const combos=cmp==='dunnett'?idx.filter(i=>i!==(ctrl||0)).map(i=>[ctrl||0,i]):idx.flatMap(i=>idx.filter(j=>j>i).map(j=>[i,j]));
  for(const [i,j] of combos){const A=gs[i].raw||gs[i].values,B=gs[j].raw||gs[j].values;const a=[],b=[];for(let r=0;r<Math.min(A.length,B.length);r++)if(A[r]!=null&&B[r]!=null){a.push(A[r]);b.push(B[r]);}if(a.length>=2){const r=tTestPaired(a,b);out.push({a:i,b:j,p:r.p,n:a.length,diff:r.diff,ciLo:r.ciLo,ciHi:r.ciHi});}}
  if(out.length>1){const adj=holm(out.map(p=>p.p));out.forEach((p,k)=>{p.praw=p.p;p.p=adj[k];});}return out;}
function figRenderBA(spec){const d=spec.data;const gs=d.groups,n=gs.length;if(!n||!gs.some(g=>g.values.length))return {svg:'',w:0,h:0};const o=Object.assign({},FIG_DEF,spec.opts||{});
  const all=gs.flatMap(g=>g.values);let lo=Math.min(...all),hi=Math.max(...all);if(lo>0&&lo<(hi-lo)*0.3)lo=0;
  const pairs=figPairedPairs(gs,spec.cmp,spec.ctrl);const nLv=figNLevels(pairs,o);const head=nLv?0.14+0.16*nLv:0.08;
  const [ylo,yhi]=figYRange(o,lo,hi+(hi-lo)*head);const ys=figAxisLin(ylo,yhi,5);const xs={lo:0,hi:n,cat:true,ticks:gs.map((g,i)=>({v:i+0.5,l:g.name}))};
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle,yTitle:o.yTitle});const {xOf,yOf,S,sym,a}=F;const nRows=Math.max(...gs.map(g=>(g.raw||g.values).length));
  let lines='';const pts=gs.map(()=>'');
  for(let r=0;r<nRows;r++){const seq=gs.map((g,i)=>{const v=(g.raw||g.values)[r];return v==null?null:[xOf(i+0.5),yOf(v)];});const col=o.baColor==='subject'?S(r).color:o.baColor==='black'?'#000':'#777';let path='';
    for(let i=0;i<n-1;i++)if(seq[i]&&seq[i+1])path+=`M${seq[i][0]},${seq[i][1]}L${seq[i+1][0]},${seq[i+1][1]}`;if(path)lines+=`<path d="${path}" stroke="${col}" stroke-width="${(+o.linePt||1)*FIG_PT}" fill="none"/>`;
    seq.forEach((p,i)=>{if(p)pts[i]+=sym(p[0],p[1],i,o.baColor==='subject'?S(r).color:S(i).color,S(i).fill);});}
  let means='';if(o.baMean)gs.forEach((g,i)=>{if(!g.values.length)return;const e=figErr(g.values,o.errType);const cx=xOf(i+0.5),w=(xOf(1)-xOf(0))*0.5;means+=`<line x1="${cx-w/2}" y1="${yOf(e.m)}" x2="${cx+w/2}" y2="${yOf(e.m)}" stroke="#000" stroke-width="${a*2.5}"/>`;});
  const centers=gs.map((g,i)=>({cx:xOf(i+0.5),top:yOf(g.values.length?Math.max(...g.values):ylo)}));const br=figBracketsMore(pairs,centers,F);
  const r=F.wrap(`<g data-sel="lines">${lines}</g>${means}${gs.map((g,i)=>`<g data-sel="series:${i}">${pts[i]}</g>`).join('')}${br.svg?`<g data-sel="brackets">${br.svg}</g>`:''}`);r.res={pairs,test:n===2?'対応のある t 検定':'対応のある t 検定 + Holm 補正'};return r;}

// ヒストグラム（column: 群ごとの値を同じビンで集計）
function figRenderHist(spec){const d=spec.data;const gs=d.groups.filter(g=>g.values.length);if(!gs.length)return {svg:'',w:0,h:0};const o=Object.assign({},FIG_DEF,spec.opts||{});
  const all=gs.flatMap(g=>g.values);const mn=Math.min(...all),mx=Math.max(...all);const k=o.histBins!==''&&+o.histBins>0?+o.histBins:Math.ceil(Math.log2(all.length)+1);
  const nt=figNiceTicks(mn,mx===mn?mn+1:mx,k);const step=nt.step;const start=Math.floor(mn/step)*step;const nb=Math.max(1,Math.ceil((mx-start)/step+1e-9));const edges=[];for(let i=0;i<=nb;i++)edges.push(start+i*step);
  const pct=o.histRel==='percent';const counts=gs.map(g=>{const c=new Array(nb).fill(0);for(const v of g.values){let b=Math.floor((v-start)/step+1e-9);if(b>=nb)b=nb-1;c[b]++;}return pct?c.map(x=>x/g.values.length*100):c;});
  let top=Math.max(...counts.flat());if(o.histGauss)gs.forEach(g=>{if(g.values.length>1)top=Math.max(top,step*(pct?100:g.values.length)/((sd(g.values)||1)*Math.sqrt(2*Math.PI)));});const [ylo,yhi]=figYRange(o,0,top*1.08||1);let ys=figAxisLin(ylo,yhi,5);if(!pct&&ys.ticks.some(t=>t.v%1)){const stp=Math.max(1,Math.ceil((yhi-ylo)/5));const tk=[];for(let v=Math.floor(ylo);v<yhi+stp;v+=stp)tk.push({v,l:figFmt(v)});ys={lo:tk[0].v,hi:tk[tk.length-1].v,ticks:tk};}
  const every=Math.max(1,Math.ceil(nb/8));const xs={lo:start,hi:start+nb*step,ticks:edges.filter((e,i)=>i%every===0).map(v=>({v,l:figFmt(+v.toFixed(6))}))};
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle,yTitle:o.yTitle||(pct?'Relative frequency (%)':'Frequency'),legend:gs.length>1?gs.map((g,i)=>({name:g.name,kind:'rect',i})):[]});const {xOf,yOf,S,a}=F;
  let body='';gs.forEach((g,i)=>{const so=S(i),c=so.color;let s='';counts[i].forEach((v,b)=>{if(!(v>0))return;const x1=xOf(edges[b]),x2=xOf(edges[b+1]);s+=`<rect x="${x1}" y="${yOf(v)}" width="${x2-x1}" height="${yOf(0)-yOf(v)}" fill="${so.fill==='open'?'#fff':c}" fill-opacity="${gs.length>1?Math.min(+o.fillAlpha,0.5):+o.fillAlpha}" stroke="${o.barEdge==='black'?'#000':c}" stroke-width="${a}"/>`;});
    if(o.histGauss&&g.values.length>1){const m=mean(g.values),sdv=sd(g.values)||1;const N=100;const pts=[];for(let q=0;q<=N;q++){const x=xs.lo+(xs.hi-xs.lo)*q/N;const dens=Math.exp(-0.5*Math.pow((x-m)/sdv,2))/(sdv*Math.sqrt(2*Math.PI));const y=dens*step*(pct?100:g.values.length);pts.push(`${xOf(x)},${yOf(Math.min(y,ys.hi))}`);}s+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="${so.lineW*FIG_PT*1.5}"/>`;}
    body+=`<g data-sel="series:${i}">${s}</g>`;});
  const r=F.wrap(body);r.res={bins:nb,step,start,counts,edges,pct};return r;}

// 積み上げ棒（grouped: カテゴリごとに群の平均を積む）
function figRenderStacked(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const pct=spec.type==='stacked-100';const nc=d.cats.length;if(!nc||!d.groups.length)return {svg:'',w:0,h:0};
  const vals=d.cats.map((c,ci)=>d.groups.map(g=>{const v=g.cells[ci]||[];return v.length?mean(v):0;}));const tot=vals.map(r=>r.reduce((s,v)=>s+Math.max(0,v),0));const seg=vals.map((r,ci)=>r.map(v=>pct?(tot[ci]?Math.max(0,v)/tot[ci]*100:0):Math.max(0,v)));
  const [ylo,yhi]=figYRange(o,0,pct?100:(Math.max(...tot)||1)*1.05);const ys=figAxisLin(ylo,yhi,5);const xs={lo:0,hi:nc,cat:true,ticks:d.cats.map((c,i)=>({v:i+0.5,l:c}))};
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle,yTitle:o.yTitle||(pct?'Percent':''),legend:d.groups.map((g,i)=>({name:g.name,kind:'rect',i}))});const {xOf,yOf,S,a,fs,h,txt}=F;
  const bw=(xOf(1)-xOf(0))*0.6;const series=d.groups.map(()=>'');
  d.cats.forEach((c,ci)=>{let acc=0;const cx=xOf(ci+0.5);d.groups.forEach((g,gi)=>{const v=seg[ci][gi];if(!(v>0))return;const y1=yOf(acc),y2=yOf(acc+v);const so=S(gi);const fill=so.fill==='open'?'#fff':so.color;
    series[gi]+=`<rect x="${cx-bw/2}" y="${y2}" width="${bw}" height="${y1-y2}" fill="${fill}" fill-opacity="${+o.fillAlpha}" stroke="${o.barEdge==='black'?'#000':so.color}" stroke-width="${a}"/>`;
    if(o.stackLabels!=='none'&&y1-y2>fs*1.1){const lab=o.stackLabels==='percent'?figFmt(+(pct?v:(tot[ci]?v/tot[ci]*100:0)).toFixed(1))+'%':figFmt(+vals[ci][gi].toFixed(2));series[gi]+=txt(cx,(y1+y2)/2+h/2,lab,'middle',`fill="${figDark(fill)&&+o.fillAlpha>0.6?'#fff':'#000'}"`,null,fs*0.85);}
    acc+=v;});});
  const r=F.wrap(d.groups.map((g,i)=>`<g data-sel="series:${i}">${series[i]}</g>`).join(''));r.res={vals,tot,pct};return r;}

// 散布＋直線回帰（xy: 系列ごとに回帰、95% 信頼帯/予測帯、r・R²・P）
function figRenderReg(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const ser=d.groups.map(g=>{const xy=[];g.points.forEach(p=>p.ys.forEach(y=>xy.push([p.x,y])));return xy;});if(!ser.some(s=>s.length))return {svg:'',w:0,h:0};
  const fits=ser.map(xy=>figLinFit(xy));const allX=ser.flat().map(p=>p[0]),allY=ser.flat().map(p=>p[1]);const xpad=(Math.max(...allX)-Math.min(...allX))*0.05||1;const xs=figAxisLin(Math.min(...allX)-xpad,Math.max(...allX)+xpad,6);
  const bandY=[];const pi=o.regBand==='pi';if(o.regBand!=='none')fits.forEach(f=>{if(!f)return;for(let k=0;k<=20;k++){const b=f.band(xs.lo+(xs.hi-xs.lo)*k/20,pi);bandY.push(b.lo,b.hi);}});
  const ylo0=Math.min(...allY,...bandY),yhi0=Math.max(...allY,...bandY);const ypad=(yhi0-ylo0)*0.05||1;const [ylo,yhi]=figYRange(o,ylo0-ypad,yhi0+ypad);const ys=figAxisLin(ylo,yhi,5);
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||d.xname,yTitle:o.yTitle,legend:d.groups.length>1?d.groups.map((g,i)=>({name:g.name,kind:'sym',i})):[]});const {xOf,yOf,S,sym,a,fs,txt,dash}=F;
  let body='',texts='';
  ser.forEach((xy,i)=>{const so=S(i),c=so.color;let s='';const f=fits[i];
    if(f){const N=60;const gx=[];for(let k=0;k<=N;k++)gx.push(xs.lo+(xs.hi-xs.lo)*k/N);
      if(o.regBand!=='none'){const up=gx.map(x=>`${xOf(x)},${yOf(f.band(x,pi).hi)}`),lo=gx.slice().reverse().map(x=>`${xOf(x)},${yOf(f.band(x,pi).lo)}`);
        if(o.regBandStyle==='dash')s+=`<polyline points="${up.join(' ')}" fill="none" stroke="${c}" stroke-width="${a}" stroke-dasharray="${dash}"/><polyline points="${lo.join(' ')}" fill="none" stroke="${c}" stroke-width="${a}" stroke-dasharray="${dash}"/>`;else s+=`<polygon points="${up.concat(lo).join(' ')}" fill="${c}" fill-opacity="0.15" stroke="none"/>`;}
      s+=`<line x1="${xOf(xs.lo)}" y1="${yOf(f.at(xs.lo))}" x2="${xOf(xs.hi)}" y2="${yOf(f.at(xs.hi))}" stroke="${c}" stroke-width="${so.lineW*FIG_PT}"/>`;
      if(o.regText)texts+=txt(F.x0+fs*0.5,F.padT+fs*(i+1)*1.15,`${d.groups.length>1?d.groups[i].name+': ':''}r = ${f.r.toFixed(3)}, R² = ${f.r2.toFixed(3)}, ${figPtext(f.p)}`,'start',`fill="${c}"`,null,fs*0.85);}
    xy.forEach(p=>{s+=sym(xOf(p[0]),yOf(p[1]),i,c,so.fill);});body+=`<g data-sel="series:${i}">${s}</g>`;});
  let ident='';if(o.regIdent){const lo=Math.max(xs.lo,ys.lo),hi=Math.min(xs.hi,ys.hi);if(hi>lo)ident=`<line x1="${xOf(lo)}" y1="${yOf(lo)}" x2="${xOf(hi)}" y2="${yOf(hi)}" stroke="#888" stroke-width="${a}" stroke-dasharray="${dash}"/>`;}
  const r=F.wrap(ident+body+(texts?`<g data-sel="text">${texts}</g>`:''));r.res={fits};return r;}

// 用量反応（xy: X＝濃度または log 濃度、4PL あてはめ、EC50 の補助線）
function figRenderDose(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const xsAll=d.groups.flatMap(g=>g.points.map(p=>p.x));if(!xsAll.length)return {svg:'',w:0,h:0};
  const pos=xsAll.filter(x=>x>0);let mode=o.doseX;if(mode==='auto')mode=(pos.length===xsAll.length&&Math.max(...pos)/Math.min(...pos)>=50)?'conc':'log';const conc=mode==='conc';const L=x=>conc?Math.log10(x):x;
  const ser=d.groups.map(g=>g.points.filter(p=>!conc||p.x>0).map(p=>({lx:L(p.x),ys:p.ys})).sort((p,q)=>p.lx-q.lx));const skipped=conc?xsAll.filter(x=>!(x>0)).length:0;
  const fits=ser.map(s=>fig4PL(s,o.doseVar));const lxs=ser.flat().map(p=>p.lx);if(!lxs.length)return {svg:'',w:0,h:0};const xlo=Math.min(...lxs),xhi=Math.max(...lxs),span=(xhi-xlo)||1;
  const xs=conc?figAxisDecades(xlo-0.3,xhi+0.3):figAxisLin(xlo-span*0.08,xhi+span*0.08,6);
  const yv=[];ser.forEach(s=>s.forEach(p=>{const e=figErr(p.ys,o.errType);yv.push(e.m+e.e,e.m-e.e);}));fits.forEach(f=>{if(f)yv.push(f.p[0],f.p[1]);});const ypad=(Math.max(...yv)-Math.min(...yv))*0.06||1;const [ylo,yhi]=figYRange(o,Math.min(...yv)-ypad,Math.max(...yv)+ypad);const ys=figAxisLin(ylo,yhi,5);
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||d.xname,yTitle:o.yTitle,legend:d.groups.length>1?d.groups.map((g,i)=>({name:g.name,kind:'sym',i})):[]});const {xOf,yOf,S,sym,a,fs,h,txt,dash}=F;
  let body='',texts='';const textLines=[];const errBar=(cx,m,e,w,c)=>{if(!(e>0))return '';const yT=yOf(m+e),yB=yOf(m-e),cw=w*(+o.capW||0.5);return `<line x1="${cx}" y1="${yT}" x2="${cx}" y2="${yB}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-cw/2}" y1="${yT}" x2="${cx+cw/2}" y2="${yT}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-cw/2}" y1="${yB}" x2="${cx+cw/2}" y2="${yB}" stroke="${c}" stroke-width="${a}"/>`;};
  ser.forEach((pts,i)=>{const so=S(i),c=so.color;let s='';const f=fits[i];
    if(f){const N=150;const cv=[];const cl=v=>Math.max(ys.lo,Math.min(ys.hi,v));if(o.doseBand&&f.stats){const up=[],lo=[];for(let k=0;k<=N;k++){const x=xs.lo+(xs.hi-xs.lo)*k/N;const b=f.stats.band(x);up.push(`${xOf(x)},${yOf(cl(f.at(x)+b))}`);lo.unshift(`${xOf(x)},${yOf(cl(f.at(x)-b))}`);}s+=`<polygon points="${up.concat(lo).join(' ')}" fill="${c}" fill-opacity="0.15" stroke="none"/>`;}for(let k=0;k<=N;k++){const x=xs.lo+(xs.hi-xs.lo)*k/N;cv.push(`${xOf(x)},${yOf(cl(f.at(x)))}`);}s+=`<polyline points="${cv.join(' ')}" fill="none" stroke="${c}" stroke-width="${so.lineW*FIG_PT}"/>`;
      const E=f.p[2],y50=(f.p[0]+f.p[1])/2;if(o.doseGuide&&E>=xs.lo&&E<=xs.hi)s+=`<polyline points="${F.x0},${yOf(y50)} ${xOf(E)},${yOf(y50)} ${xOf(E)},${F.y0}" fill="none" stroke="${c}" stroke-width="${a*0.75}" stroke-dasharray="${dash}"/>`;
      if(o.doseText){const lab=f.p[3]<0?'IC50':'EC50';const val=conc?figSci(Math.pow(10,E)):'10^'+E.toFixed(2);const ciS=o.doseCI&&f.stats?(conc?` (95% CI ${figSci(Math.pow(10,f.stats.ciLo[2]))}–${figSci(Math.pow(10,f.stats.ciHi[2]))})`:` (95% CI 10^${f.stats.ciLo[2].toFixed(2)}–10^${f.stats.ciHi[2].toFixed(2)})`):'';const pre=d.groups.length>1?d.groups[i].name+': ':'';const ls=ciS?[`${pre}${lab} = ${val}${ciS}`,`${pre}Hill = ${f.p[3].toFixed(2)}, R² = ${f.r2.toFixed(3)}`]:[`${pre}${lab} = ${val}, Hill = ${f.p[3].toFixed(2)}, R² = ${f.r2.toFixed(3)}`];ls.forEach(l=>textLines.push({l,c,dec:f.p[3]<0}));}}
    pts.forEach(p=>{const e=figErr(p.ys,o.errType);const cx=xOf(p.lx);s+=errBar(cx,e.m,e.e,so.symPt*FIG_PT*1.2,c)+sym(cx,yOf(e.m),i,c,so.fill);});body+=`<g data-sel="series:${i}">${s}</g>`;});
  const decAll=textLines.length&&textLines.every(t=>t.dec);textLines.forEach((t,k)=>{const y=decAll?F.y0-fs*0.3-(textLines.length-1-k)*fs*1.15:F.padT+fs*(k+1)*1.15;texts+=txt(F.x0+fs*0.5,y,t.l,'start',`fill="${t.c}"`,null,fs*0.85);});
  const r=F.wrap(body+(texts?`<g data-sel="text">${texts}</g>`:''));r.res={fits,mode,skipped};return r;}

// 酵素反応（xy: X＝基質濃度、Michaelis–Menten あてはめ）
function figRenderMM(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const ser=d.groups.map(g=>g.points.filter(p=>p.x>=0).slice().sort((p,q)=>p.x-q.x));if(!ser.some(s=>s.length))return {svg:'',w:0,h:0};
  const fits=ser.map(s=>figMM(s));const xmax=Math.max(...ser.flat().map(p=>p.x));const xs=figAxisLin(0,xmax*1.05||1,6);
  const yv=[];ser.forEach(s=>s.forEach(p=>{const e=figErr(p.ys,o.errType);yv.push(e.m+e.e,e.m-e.e);}));fits.forEach(f=>{if(f)yv.push(f.p[0]);});const [ylo,yhi]=figYRange(o,0,Math.max(...yv)*1.08||1);const ys=figAxisLin(ylo,yhi,5);
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||d.xname,yTitle:o.yTitle,legend:d.groups.length>1?d.groups.map((g,i)=>({name:g.name,kind:'sym',i})):[]});const {xOf,yOf,S,sym,a,fs,txt,dash}=F;
  let body='',texts='';const errBar=(cx,m,e,w,c)=>{if(!(e>0))return '';const yT=yOf(m+e),yB=yOf(m-e),cw=w*(+o.capW||0.5);return `<line x1="${cx}" y1="${yT}" x2="${cx}" y2="${yB}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-cw/2}" y1="${yT}" x2="${cx+cw/2}" y2="${yT}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-cw/2}" y1="${yB}" x2="${cx+cw/2}" y2="${yB}" stroke="${c}" stroke-width="${a}"/>`;};
  ser.forEach((pts,i)=>{const so=S(i),c=so.color;let s='';const f=fits[i];
    if(f){const N=150;const cv=[];const cl=v=>Math.max(ys.lo,Math.min(ys.hi,v));if(o.mmBand&&f.stats){const up=[],lo=[];for(let k=0;k<=N;k++){const x=xs.lo+(xs.hi-xs.lo)*k/N;const b=f.stats.band(x);up.push(`${xOf(x)},${yOf(cl(f.at(x)+b))}`);lo.unshift(`${xOf(x)},${yOf(cl(f.at(x)-b))}`);}s+=`<polygon points="${up.concat(lo).join(' ')}" fill="${c}" fill-opacity="0.15" stroke="none"/>`;}for(let k=0;k<=N;k++){const x=xs.lo+(xs.hi-xs.lo)*k/N;cv.push(`${xOf(x)},${yOf(cl(f.at(x)))}`);}s+=`<polyline points="${cv.join(' ')}" fill="none" stroke="${c}" stroke-width="${so.lineW*FIG_PT}"/>`;
      if(f.p[1]<=xs.hi)s+=`<polyline points="${F.x0},${yOf(f.p[0]/2)} ${xOf(f.p[1])},${yOf(f.p[0]/2)} ${xOf(f.p[1])},${F.y0}" fill="none" stroke="${c}" stroke-width="${a*0.75}" stroke-dasharray="${dash}"/>`;
      if(o.mmText)texts+=txt(F.x0+F.plotW-fs*0.4,F.y0-fs*(ser.length-i)*1.15-fs*0.3,`${d.groups.length>1?d.groups[i].name+': ':''}Vmax = ${figSci(f.p[0])}, Km = ${figSci(f.p[1])}, R² = ${f.r2.toFixed(3)}`,'end',`fill="${c}"`,null,fs*0.85);}
    pts.forEach(p=>{const e=figErr(p.ys,o.errType);const cx=xOf(p.x);s+=errBar(cx,e.m,e.e,so.symPt*FIG_PT*1.2,c)+sym(cx,yOf(e.m),i,c,so.fill);});body+=`<g data-sel="series:${i}">${s}</g>`;});
  const r=F.wrap(body+(texts?`<g data-sel="text">${texts}</g>`:''));r.res={fits};return r;}

// 生存曲線（Kaplan–Meier、打ち切り印、95% CI 帯、中央値の補助線、log-rank と HR、Number at risk 表）
function figRenderSurvival(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const gs=d.groups;if(!gs.length)return {svg:'',w:0,h:0};const cum=spec.type==='km-cuminc';const pct=o.survY!=='fraction';
  const km=gs.map(g=>figKM(g.times,g.events));const maxT=Math.max(...gs.map(g=>Math.max(...g.times)));const xs=figAxisLin(0,maxT||1,6);xs.lo=0;
  const Y=s=>(cum?1-s:s)*(pct?100:1);const ys={lo:0,hi:pct?100:1,ticks:(pct?[0,20,40,60,80,100]:[0,0.2,0.4,0.6,0.8,1]).map(v=>({v,l:figFmt(v)}))};
  let lr=null,hr=null;if(gs.length>=2){try{lr=logRank(gs.map(g=>({label:g.name,times:g.times,events:g.events})));}catch(e){lr=null;}if(gs.length===2&&lr&&lr.E[0]>0&&lr.E[1]>0&&lr.O[0]>0&&lr.O[1]>0){const v=(lr.O[0]/lr.E[0])/(lr.O[1]/lr.E[1]);const se=Math.sqrt(1/lr.E[0]+1/lr.E[1]);hr={hr:v,lo:v*Math.exp(-1.959964*se),hi:v*Math.exp(1.959964*se)};}}
  const fs0=(+o.fontPt||12)*FIG_PT;const labW=Math.max(...gs.map(g=>String(g.name).length))*fs0*0.55+fs0*0.6;const risk=o.survRisk;
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||d.tname||'Time',yTitle:o.yTitle||(cum?'Cumulative incidence'+(pct?' (%)':''):(pct?'Percent':'Fraction')+' survival'),legend:gs.length>1?gs.map((g,i)=>({name:g.name,kind:'line',i})):[],padB:risk?fs0*1.3*(gs.length+1)+fs0*0.4:0,padL:risk?Math.max(0,labW+fs0*0.9-fs0*4.2):0});const {xOf,yOf,S,a,fs,h,txt,dash,x0,y0}=F;
  let body='';km.forEach((k,i)=>{const so=S(i),c=so.color;const lw=so.lineW*FIG_PT;let s='';const endT=Math.max(k.maxT,0);
    if(o.survCI){const up=[],lo=[];let prev=k.steps[0];for(const st of k.steps){up.push(`${xOf(st.t)},${yOf(Y(prev.hi))}`,`${xOf(st.t)},${yOf(Y(st.hi))}`);lo.push(`${xOf(st.t)},${yOf(Y(prev.lo))}`,`${xOf(st.t)},${yOf(Y(st.lo))}`);prev=st;}up.push(`${xOf(endT)},${yOf(Y(prev.hi))}`);lo.push(`${xOf(endT)},${yOf(Y(prev.lo))}`);s+=`<polygon points="${up.concat(lo.reverse()).join(' ')}" fill="${c}" fill-opacity="0.15" stroke="none"/>`;}
    let path=`M${xOf(0)},${yOf(Y(1))}`;for(const st of k.steps.slice(1))path+=`H${xOf(st.t)}V${yOf(Y(st.s))}`;path+=`H${xOf(endT)}`;s+=`<path d="${path}" fill="none" stroke="${c}" stroke-width="${lw}" stroke-linejoin="miter"/>`;
    if(o.survCensor)for(const cs of k.censors)s+=`<line x1="${xOf(cs.t)}" y1="${yOf(Y(cs.s))-h*0.45}" x2="${xOf(cs.t)}" y2="${yOf(Y(cs.s))+h*0.45}" stroke="${c}" stroke-width="${lw}"/>`;
    if(o.survMedian&&k.median!=null&&!cum)s+=`<polyline points="${x0},${yOf(Y(0.5))} ${xOf(k.median)},${yOf(Y(0.5))} ${xOf(k.median)},${y0}" fill="none" stroke="${c}" stroke-width="${a*0.75}" stroke-dasharray="${dash}"/>`;
    body+=`<g data-sel="series:${i}">${s}</g>`;});
  let texts='';if(o.survText&&lr){const lines=[`Log-rank ${figPtext(lr.p)}`];if(hr)lines.push(`HR ${hr.hr.toFixed(2)} (95% CI ${hr.lo.toFixed(2)}–${hr.hi.toFixed(2)})`);lines.forEach((l,k)=>{texts+=cum?txt(x0+fs*0.5,F.padT+fs*(k+1)*1.15,l,'start',null,null,fs*0.85):txt(x0+fs*0.5,F.y0-fs*0.4-(lines.length-1-k)*fs*1.15,l,'start',null,null,fs*0.85);});}
  let table='';if(risk){const ty=y0+Math.max(0,F.tick)+fs*(o.xTitle||d.tname?3.4:2.4);table+=txt(x0,ty,'Number at risk','start',null,null,fs*0.85);gs.forEach((g,i)=>{const y=ty+fs*1.3*(i+1);table+=txt(x0-fs*1.0,y,g.name,'end',`fill="${S(i).color}"`,null,fs*0.85);for(const t of xs.ticks)table+=txt(xOf(t.v),y,String(atRiskAt(g.times,t.v)),'middle',null,null,fs*0.85);});}
  const r=F.wrap(body+(texts?`<g data-sel="text">${texts}</g>`:'')+(table?`<g data-sel="risk">${table}</g>`:''));r.res={km,lr,hr};return r;}

// ROC 曲線（AUC と 95% CI、Youden のカットオフ、DeLong の比較）
function figRenderROC(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});if(!d.groups.length)return {svg:'',w:0,h:0};
  const res=d.groups.map(g=>{let r=figROC(g.pos,g.neg),flipped=false;if(o.rocDir==='low'||(o.rocDir==='auto'&&r.auc<0.5)){r=figROC(g.pos.map(v=>-v),g.neg.map(v=>-v));flipped=true;}return Object.assign(r,{flipped,name:g.name});});
  const pct=o.rocPct;const ticks=[0,0.2,0.4,0.6,0.8,1].map(v=>({v,l:pct?figFmt(v*100):v.toFixed(1)}));const xs={lo:0,hi:1,ticks},ys={lo:0,hi:1,ticks};
  const so0=spec.opts||{};const sq=so0.wIn==null&&so0.hIn==null;
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||(pct?'100% – Specificity%':'1 – Specificity'),yTitle:o.yTitle||(pct?'Sensitivity%':'Sensitivity'),wIn:sq?2.5:0,hIn:sq?2.5:0});const {xOf,yOf,S,sym,a,fs,h,txt,dash,x0,y0}=F;
  let body=`<line x1="${xOf(0)}" y1="${yOf(0)}" x2="${xOf(1)}" y2="${yOf(1)}" stroke="#888" stroke-width="${a}" stroke-dasharray="${dash}"/>`;
  res.forEach((r,i)=>{const so=S(i),c=so.color;let s='';const pts=r.pts.map(p=>`${xOf(p.fpr)},${yOf(p.tpr)}`);
    if(o.rocFill)s+=`<polygon points="${pts.join(' ')} ${xOf(1)},${yOf(0)}" fill="${c}" fill-opacity="0.12" stroke="none"/>`;
    s+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="${so.lineW*FIG_PT}" stroke-linejoin="miter"/>`;
    if(o.rocCutoff&&r.youden&&isFinite(r.youden.thr)){const p=r.youden;const thr=r.flipped?-p.thr:p.thr;s+=sym(xOf(p.fpr),yOf(p.tpr),i,c,'open');const ct=o.rocCutText||'thr';const parts=[];if(ct==='thr'||ct==='both')parts.push(`${r.flipped?'≤':'≥'} ${figSci(thr)}`);if(ct==='sens'||ct==='both')parts.push(`Se ${(p.tpr*100).toFixed(0)}% / Sp ${((1-p.fpr)*100).toFixed(0)}%`);if(parts.length){const cs=fs*(+o.rocCutSize||0.8);const pos=o.rocCutPos||'right';const cx=xOf(p.fpr),cy=yOf(p.tpr);const px=pos==='right'?cx+fs*0.5:pos==='left'?cx-fs*0.5:cx,py=pos==='right'?cy-fs*0.35:pos==='left'?cy+cs*1.1:pos==='above'?cy-fs*0.6:cy+cs*1.2;s+=txt(px,py,parts.join('  '),pos==='right'?'start':pos==='left'?'end':'middle',`fill="${c}"`,null,cs);}}
    body+=`<g data-sel="series:${i}">${s}</g>`;});
  let leg='';res.forEach((r,i)=>{const y=y0-fs*0.5-(res.length-1-i)*fs*1.2;leg+=txt(x0+F.plotW-fs*0.4,y,`${res.length>1?r.name+': ':''}AUC ${r.auc.toFixed(3)} (${r.lo.toFixed(3)}–${r.hi.toFixed(3)})`,'end',`fill="${S(i).color}"`,null,fs*0.85);});
  const cmp=res.length===2?figDeLongCompare(res[0],res[1]):null;const out=F.wrap(body+`<g data-sel="text">${leg}</g>`);out.res={res,cmp};return out;}

// ヒートマップ・相関行列（色の割り当て、セル値、行/列のクラスタリングと樹形図、カラーバー）
function figRenderHeatmap(spec){const d=spec.data;const st=figStyle(spec);const {o,fs,h,a,ac,txt}=st;const corr=spec.type==='corr';let rows=d.rows,cols=d.cols,M=d.m;if(!rows.length||!cols.length)return {svg:'',w:0,h:0};
  if(corr){M=cols.map((_,i)=>cols.map((_,j)=>{const xs=[],ys=[];d.m.forEach(r=>{if(r[i]!==null&&r[j]!==null){xs.push(r[i]);ys.push(r[j]);}});return xs.length>=3?(i===j?1:pearson(xs,ys).r):NaN;}));rows=cols.slice();}
  else if(o.hmZ)M=M.map(r=>{const v=r.filter(x=>x!==null);if(v.length<2)return r;const m=mean(v),s=sd(v)||1;return r.map(x=>x===null?null:(x-m)/s);});
  let rowOrder=rows.map((_,i)=>i),colOrder=cols.map((_,i)=>i),rowTree=null,colTree=null;const cl=corr?'none':o.hmCluster;
  if((cl==='rows'||cl==='both')&&rows.length>1){rowTree=figHClust(M.map(r=>r.map(v=>v===null?0:v)));rowOrder=rowTree.order;}
  if((cl==='cols'||cl==='both')&&cols.length>1){colTree=figHClust(cols.map((_,j)=>M.map(r=>r[j]===null?0:r[j])));colOrder=colTree.order;}
  const nr=rows.length,nc=cols.length;const vals=M.flat().filter(v=>v!==null&&isFinite(v));
  let lo=o.hmMin!==''&&isFinite(+o.hmMin)?+o.hmMin:Math.min(...vals),hi=o.hmMax!==''&&isFinite(+o.hmMax)?+o.hmMax:Math.max(...vals);
  if(corr){lo=-1;hi=1;}else if(o.hmZ&&o.hmMin===''&&o.hmMax===''){const m=Math.max(Math.abs(lo),Math.abs(hi))||1;lo=-m;hi=m;}if(!(hi>lo))hi=lo+1;
  const scheme=FIG_HM_SCHEMES[o.hmScheme]||FIG_HM_SCHEMES.bwr;const colorOf=v=>figGrad(scheme,(v-lo)/(hi-lo));
  const plotW=(+o.wIn||3)*FIG_IN,plotH=(+o.hIn||2)*FIG_IN;const cell=Math.min(plotW/nc,plotH/nr);const gw=cell*nc,gh=cell*nr;
  const rowLabW=Math.max(...rows.map(r=>figTW(String(r),fs)))+fs*0.9;const colLen=Math.max(...cols.map(c=>String(c).length));const colRot=+o.xRot||(colLen*fs*0.55>cell*1.1?(colLen>8?90:45):0);
  const colLabH=colRot?colLen*fs*0.55*Math.sin(colRot*Math.PI/180)+fs*0.8:fs*1.4;const dendW=rowTree?fs*3:0,dendH=colTree?fs*3:0;const barW=fs*0.9,barGap=fs*1.2,barLabW=fs*3.2;
  const padT=fs*(spec.title?2.2:0.6)+dendH+(o.hmColPos==='top'?colLabH:0),padL=fs*0.5+dendW+(rowTree?0:rowLabW),padR=(rowTree?rowLabW:0)+barGap+barW+barLabW,padB=(o.hmColPos==='top'?fs*0.8:colLabH+fs*0.4)+(o.hmZ&&!corr?fs*0.8:0);
  const W=padL+gw+padR,H=padT+gh+padB,x0=padL,y0=padT;
  let cells='';rowOrder.forEach((ri,r)=>{colOrder.forEach((ci,c)=>{const v=M[ri][ci];const x=x0+c*cell,y=y0+r*cell;const ok=v!==null&&isFinite(v);const fill=ok?colorOf(Math.max(lo,Math.min(hi,v))):'#ddd';
    cells+=`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"${o.hmBorder==='none'?'':` stroke="${o.hmBorder==='black'?'#000':'#fff'}" stroke-width="${FIG_PT*0.5}"`}/>`;
    if(o.hmValues&&ok){const s=corr||o.hmZ?v.toFixed(2):figFmt(+v.toPrecision(3));cells+=txt(x+cell/2,y+cell/2+h*0.4,s,'middle',`fill="${figDark(fill)?'#fff':'#000'}"`,null,Math.min(fs*0.8,cell*0.42,cell*1.5/Math.max(1,s.length)));}});});
  let labels='';rowOrder.forEach((ri,r)=>{const y=y0+r*cell+cell/2+h/2;labels+=rowTree?txt(x0+gw+fs*0.4,y,rows[ri],'start'):txt(x0-fs*0.3,y,rows[ri],'end');});
  colOrder.forEach((ci,c)=>{const x=x0+c*cell+cell/2;if(o.hmColPos==='top'){const y=y0-fs*0.4;labels+=colRot?txt(x,y,cols[ci],'start',`transform="rotate(-${colRot} ${x} ${y})"`):txt(x,y,cols[ci]);}else{const y=y0+gh+fs*(colRot?0.5:1.1);labels+=colRot?txt(x,y,cols[ci],'end',`transform="rotate(-${colRot} ${x} ${y})"`):txt(x,y,cols[ci]);}});
  const frame=`<rect x="${x0}" y="${y0}" width="${gw}" height="${gh}" fill="none" stroke="${ac}" stroke-width="${a}"/>`;
  const bx=x0+gw+(rowTree?rowLabW:0)+barGap,bh=Math.min(gh,fs*8),by=y0;const gid='hmg_'+(o.hmScheme||'bwr')+'_'+Math.abs(Math.round(lo*1000+hi*7));
  let bar=`<defs><linearGradient id="${gid}" x1="0" y1="1" x2="0" y2="0">${scheme.map((c,i)=>`<stop offset="${i/(scheme.length-1)}" stop-color="${c}"/>`).join('')}</linearGradient></defs><rect x="${bx}" y="${by}" width="${barW}" height="${bh}" fill="url(#${gid})" stroke="${ac}" stroke-width="${a}"/>`;
  for(const t of figNiceTicks(lo,hi,4).ticks.filter(t=>t>=lo-1e-9&&t<=hi+1e-9)){const y=by+bh-(t-lo)/(hi-lo)*bh;bar+=`<line x1="${bx+barW}" y1="${y}" x2="${bx+barW-h*0.5}" y2="${y}" stroke="${ac}" stroke-width="${a}"/>`+txt(bx+barW+fs*0.3,y+h/2,figFmt(t),'start',null,null,fs*0.85);}
  if(o.hmZ&&!corr)bar+=txt(bx+barW/2,by+bh+fs*1.1,'z score','middle',null,null,fs*0.8);if(corr)bar+=txt(bx+barW/2,by-fs*0.4,'r','middle',null,null,fs*0.85);
  let dend='';if(rowTree)dend+=figDendro(rowTree,i=>y0+rowOrder.indexOf(i)*cell+cell/2,x0-fs*0.2,dendW-fs*0.4,'row',ac,a);if(colTree)dend+=figDendro(colTree,i=>x0+colOrder.indexOf(i)*cell+cell/2,y0-fs*0.2-(o.hmColPos==='top'?colLabH:0),dendH-fs*0.4,'col',ac,a);
  const title=figTitle1(txt,W/2,fs*1.4,spec.title,W-fs,fs);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><g data-sel="cells">${cells}</g>${frame}<g data-sel="axes">${labels}</g><g data-sel="legend">${bar}</g>${dend}${title}</svg>`;
  return {svg,w:W,h:H,res:{M,rows,cols,rowOrder,colOrder,lo,hi,corr}};}

// フォレストプロット（左に研究名・n・重み、中央に点＋CI、右に推定値 [95% CI]、Overall は菱形）
function figRenderForest(spec){const d=spec.data;const st=figStyle(spec);const {o,fs,h,a,ac,txt,dash}=st;const items=d.items;const rows=items.filter(it=>it.kind!=='head');if(!rows.length)return {svg:'',w:0,h:0};
  const vals=rows.flatMap(it=>[it.lo,it.hi,it.est]).filter(v=>v!==null&&isFinite(v));let log=o.forestLog==='auto'?(vals.every(v=>v>0)&&/\bor\b|\bhr\b|\brr\b|ratio|odds|hazard|オッズ|ハザード|リスク比/i.test(d.ename+' '+(o.xTitle||'')+' '+(spec.title||''))):(o.forestLog===true||o.forestLog==='true');if(log&&!vals.every(v=>v>0))log=false;
  const nullV=o.forestNull!==''&&isFinite(+o.forestNull)?+o.forestNull:(log?1:0);let lo=Math.min(...vals,nullV),hi=Math.max(...vals,nullV);
  let ticks;if(log){const cands=[0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,20,50,100,200,500,1000];ticks=cands.filter(c=>c>=lo*0.95&&c<=hi*1.05);if(ticks.length<2)ticks=[lo,hi];lo=Math.min(lo,ticks[0]);hi=Math.max(hi,ticks[ticks.length-1]);}else{const ax=figAxisLin(lo,hi,5);ticks=ax.ticks.map(t=>t.v);lo=ax.lo;hi=ax.hi;}
  const rowH=fs*1.5,n=items.length;const plotW=(+o.wIn||3)*FIG_IN*0.7,plotH=n*rowH;const hasHead=items.some(it=>it.kind==='head');
  const labW=Math.max(...items.map(it=>String(it.label).length))*fs*0.55+fs*(hasHead?1.6:0.8);const showN=o.forestWeights&&rows.some(it=>it.n!==null),showW=o.forestWeights&&rows.some(it=>it.w!==null);const nW=showN?fs*3:0,wW=showW?fs*4:0,txtW=o.forestText?fs*9:0,pW=d.hasP&&o.forestText?fs*4.5:0;
  const padT=fs*(spec.title?2.4:0.6)+fs*1.6,padL=fs*0.5+labW+nW+wW,padR=txtW+pW+fs*0.5,padB=fs*(o.xTitle?3.4:2.2)+(o.forestFav?fs*1.3:0);const W=padL+plotW+padR,H=padT+plotH+padB,x0=padL,y0=padT+plotH;
  const xOf=log?v=>x0+(Math.log10(v)-Math.log10(lo))/(Math.log10(hi)-Math.log10(lo))*plotW:v=>x0+(v-lo)/(hi-lo)*plotW;
  let axes=`<line x1="${x0}" y1="${y0}" x2="${x0+plotW}" y2="${y0}" stroke="${ac}" stroke-width="${a}" stroke-linecap="square"/>`;for(const t of ticks){const x=xOf(t);axes+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+Math.abs(st.tick)}" stroke="${ac}" stroke-width="${a}"/>`+txt(x,y0+Math.abs(st.tick)+fs*1.05,figFmt(t));}
  axes+=`<line x1="${xOf(nullV)}" y1="${padT}" x2="${xOf(nullV)}" y2="${y0}" stroke="${ac}" stroke-width="${a*0.75}" stroke-dasharray="${dash}"/>`;
  let titles='';if(o.xTitle)titles+=txt(x0+plotW/2,y0+Math.abs(st.tick)+fs*2.3,o.xTitle,'middle','','xtitle');if(o.forestFav){const [L,R]=String(o.forestFav).split('|');const fy=y0+Math.abs(st.tick)+fs*(o.xTitle?3.4:2.3);if(L)titles+=txt(xOf(nullV)-fs*0.4,fy,'← '+L.trim(),'end',null,null,fs*0.85);if(R)titles+=txt(xOf(nullV)+fs*0.4,fy,R.trim()+' →','start',null,null,fs*0.85);}
  const hy=padT-fs*0.5;let head=txt(fs*0.5,hy,d.sname||'Study','start');if(showN)head+=txt(fs*0.5+labW+nW-fs*0.3,hy,'n','end');if(showW)head+=txt(fs*0.5+labW+nW+wW-fs*0.3,hy,'Weight','end');head+=txt(x0+plotW/2,hy,d.ename||'Estimate');if(o.forestText)head+=txt(x0+plotW+fs*0.5,hy,`${d.ename||'Estimate'} [95% CI]`,'start');if(pW)head+=txt(x0+plotW+txtW+fs*0.5,hy,'P','start');
  const maxW=Math.max(...rows.map(it=>it.w||0))||0;let body='';
  items.forEach((it,i)=>{const y=padT+i*rowH+rowH/2;if(it.kind==='head'){body+=txt(fs*0.5,y+h/2,it.label,'start');return;}
    body+=txt(fs*0.5+(hasHead?fs*0.8:0),y+h/2,it.label,'start');if(showN&&it.n!==null)body+=txt(fs*0.5+labW+nW-fs*0.3,y+h/2,figFmt(it.n),'end');if(showW&&it.w!==null)body+=txt(fs*0.5+labW+nW+wW-fs*0.3,y+h/2,figFmt(+it.w.toFixed(1))+'%','end');
    const cl=Math.max(lo,it.lo),ch=Math.min(hi,it.hi);const x1=xOf(cl),x2=xOf(ch),xe=xOf(Math.max(lo,Math.min(hi,it.est)));
    if(it.kind==='pooled'){const dh=rowH*0.38;body+=`<polygon points="${x1},${y} ${xe},${y-dh} ${x2},${y} ${xe},${y+dh}" fill="${ac}" stroke="${ac}" stroke-width="${a}"/>`;}
    else{body+=`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ac}" stroke-width="${a}"/>`;if(it.lo<lo)body+=`<polygon points="${x1},${y} ${x1+h*0.6},${y-h*0.35} ${x1+h*0.6},${y+h*0.35}" fill="${ac}"/>`;if(it.hi>hi)body+=`<polygon points="${x2},${y} ${x2-h*0.6},${y-h*0.35} ${x2-h*0.6},${y+h*0.35}" fill="${ac}"/>`;
      const side=maxW&&it.w!==null?fs*0.3+fs*0.75*Math.sqrt(it.w/maxW):fs*0.6;body+=`<rect x="${xe-side/2}" y="${y-side/2}" width="${side}" height="${side}" fill="${ac}"/>`;}
    if(o.forestText)body+=txt(x0+plotW+fs*0.5,y+h/2,`${it.est.toFixed(2)} [${it.lo.toFixed(2)}, ${it.hi.toFixed(2)}]`,'start');if(pW&&it.p!=null)body+=txt(x0+plotW+txtW+fs*0.5,y+h/2,it.p<0.001?'<0.001':it.p.toFixed(3),'start');});
  const title=figTitle1(txt,W/2,fs*1.4,spec.title,W-fs,fs);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><g data-sel="axes">${axes}</g>${titles}<g data-sel="text">${head}</g><g data-sel="series:0">${body}</g>${title}</svg>`;
  return {svg,w:W,h:H,res:{log,nullV,items}};}

// ウォーターフォール（患者ごとの最良変化率を降順、効果で色分け、+20%/−30% の線）
function figRenderWaterfall(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const items=d.items;const n=items.length;if(!n)return {svg:'',w:0,h:0};
  const vs=items.map(it=>it.v);const [ylo,yhi]=figYRange(o,Math.min(-40,Math.min(...vs)*1.08),Math.max(30,Math.max(...vs)*1.08));const ys=figAxisLin(ylo,yhi,6);
  const ids=o.wfLabels==='id';const xs={lo:0,hi:n,cat:true,ticks:ids?items.map((it,i)=>({v:i+0.5,l:it.id})):[]};
  const colorOf=(it,i)=>{if(it.resp&&d.cats.length){const k=d.cats.indexOf(it.resp);const ov=o.series&&o.series[k]&&o.series[k].color;return ov||FIG_RESP_COLORS[it.resp]||FIG_DEF.colors[k%FIG_DEF.colors.length];}return it.v<=-30?FIG_RESP_COLORS.PR:it.v>=20?FIG_RESP_COLORS.PD:FIG_RESP_COLORS.SD;};
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||(ids?'':'Patients'),yTitle:o.yTitle||'Best change from baseline (%)',legend:d.cats.map((c,i)=>({name:c,kind:'rect',i,color:(o.series&&o.series[i]&&o.series[i].color)||FIG_RESP_COLORS[c]})),xAxisAt:0,xRot:ids?90:0});const {xOf,yOf,a,fs,h,txt,dash,x0}=F;
  let bars='';const bw=(xOf(1)-xOf(0))*0.8;items.forEach((it,i)=>{const c=colorOf(it,i);const y1=yOf(Math.max(0,it.v)),y2=yOf(Math.min(0,it.v));bars+=`<rect x="${xOf(i+0.5)-bw/2}" y="${y1}" width="${bw}" height="${Math.max(0.5,y2-y1)}" fill="${c}" fill-opacity="${+o.fillAlpha}" stroke="${o.barEdge==='black'?'#000':c}" stroke-width="${a*0.75}"/>`;
    if(o.wfValues)bars+=txt(xOf(i+0.5),it.v>=0?y1-fs*0.3:y2+fs*0.9,figFmt(Math.round(it.v)),'middle',null,null,Math.min(fs*0.7,bw*0.9));});
  let lines='';if(o.wfLines)for(const v of [20,-30])if(v>ys.lo&&v<ys.hi)lines+=`<line x1="${x0}" y1="${yOf(v)}" x2="${x0+F.plotW}" y2="${yOf(v)}" stroke="#444" stroke-width="${a*0.75}" stroke-dasharray="${dash}"/>`;
  const r=F.wrap(lines+`<g data-sel="series:0">${bars}</g>`);const cnt={};items.forEach(it=>{if(it.resp)cnt[it.resp]=(cnt[it.resp]||0)+1;});r.res={n,cnt,orr:items.filter(it=>it.resp?/^(CR|PR)$/.test(it.resp):it.v<=-30).length};return r;}

/* ---------- 左下の結果表 ---------- */
function figStatsMore(data,st){if(!data)return null;if(typeof figStatsP3==='function'){const h=figStatsP3(data,st);if(h!=null)return h;}const res=st.res||{};const t=st.type;const P=p=>p<0.0001?'<0.0001':p.toFixed(4);const esc=figEsc;
  if(data.kind==='survival'){const km=res.km||[];let s='<table><tr><th>群</th><th>n</th><th>イベント</th><th>中央値</th></tr>'+data.groups.map((g,i)=>`<tr><td>${esc(g.name)}</td><td>${g.times.length}</td><td>${g.events.reduce((a,b)=>a+b,0)}</td><td>${km[i]&&km[i].median!=null?figFmt(km[i].median):'未到達'}</td></tr>`).join('')+'</table>';
    if(res.lr)s+=`<div class="hint">Log-rank（Mantel–Cox）χ² = ${res.lr.chi2.toFixed(3)}, df = ${res.lr.df}, P = ${P(res.lr.p)}${res.hr?` ／ HR（${esc(data.groups[0].name)} / ${esc(data.groups[1].name)}、Mantel–Haenszel）= ${res.hr.hr.toFixed(3)}（95% CI ${res.hr.lo.toFixed(3)}–${res.hr.hi.toFixed(3)}）`:''}</div>`;
    s+='<div class="hint">同時刻はイベント→打ち切りの順。CI は Greenwood の分散と log-log 変換。</div>';return s;}
  if(data.kind==='roc'){const rs=res.res||[];let s=`<div class="hint">陽性 = 「${esc(data.posVal)}」（列 ${esc(data.cname)}）</div><table><tr><th>マーカー</th><th>陽性 n</th><th>陰性 n</th><th>AUC</th><th>95% CI（DeLong）</th><th>カットオフ</th><th>感度</th><th>特異度</th></tr>`+rs.map(r=>`<tr><td>${esc(r.name)}${r.flipped?'（値が小さいほど陽性）':''}</td><td>${r.m}</td><td>${r.n}</td><td>${r.auc.toFixed(3)}</td><td>${r.lo.toFixed(3)}–${r.hi.toFixed(3)}</td><td>≥ ${figSci(r.flipped?-r.youden.thr:r.youden.thr)}</td><td>${(r.youden.tpr*100).toFixed(1)}%</td><td>${((1-r.youden.fpr)*100).toFixed(1)}%</td></tr>`).join('')+'</table>';
    if(res.cmp)s+=`<div class="hint">2 曲線の比較（DeLong）: z = ${res.cmp.z.toFixed(3)}, P = ${P(res.cmp.p)}</div>`;return s;}
  if(data.kind==='heatmap'){return `<div class="hint">${res.corr?'列どうしの Pearson 相関（r）':'行 '+data.rows.length+' × 列 '+data.cols.length}${res.lo!=null?` ／ 色の範囲 ${figFmt(+res.lo.toPrecision(3))} – ${figFmt(+res.hi.toPrecision(3))}`:''}${st.opts.hmCluster&&st.opts.hmCluster!=='none'&&!res.corr?' ／ 階層的クラスタリング（ユークリッド距離・平均連結）':''}</div>`;}
  if(data.kind==='forest'){return `<div class="hint">${data.items.filter(it=>it.kind==='row').length} 件${res.log?' ／ 対数軸':''} ／ 効果なしの線 = ${res.nullV!=null?figFmt(res.nullV):''}。四角の大きさは重み（Weight 列）に比例。</div>`;}
  if(data.kind==='waterfall'){const c=res.cnt||{};return `<div class="hint">n = ${data.items.length}${Object.keys(c).length?' ／ '+Object.entries(c).map(([k,v])=>k+' '+v).join('、'):''} ／ ${res.orr!=null?(data.cats.length?'奏効（CR+PR）':'−30% 以下')+' '+res.orr+' 例（'+(res.orr/data.items.length*100).toFixed(1)+'%）':''}</div>`;}
  if(t==='before-after'){const pairs=res.pairs||[];let s=`<div class="hint">${esc(res.test||'対応のある t 検定')}（行＝同じ個体）</div>`;if(pairs.length)s+='<table><tr><th>比較</th><th>n</th><th>平均差</th><th>95% CI</th><th>P 値</th></tr>'+pairs.map(p=>`<tr><td>${esc(data.groups[p.a].name)} vs ${esc(data.groups[p.b].name)}</td><td>${p.n}</td><td>${p.diff.toFixed(3)}</td><td>${p.ciLo.toFixed(3)} – ${p.ciHi.toFixed(3)}</td><td>${P(p.p)}</td></tr>`).join('')+'</table>';return s;}
  if(t==='histogram'){return `<div class="hint">ビン ${res.bins||''}（幅 ${res.step!=null?figFmt(res.step):''}、開始 ${res.start!=null?figFmt(res.start):''}）／ 境界の値は大きい側のビン</div>`;}
  if(t==='stacked-bar'||t==='stacked-100'){return `<div class="hint">カテゴリごとに各群の平均を積み上げ${res.pct?'（合計で割って %）':''}。負の値は 0 として扱います。</div>`;}
  if(t==='xy-regression'){const fits=res.fits||[];return '<table><tr><th>系列</th><th>n</th><th>傾き</th><th>切片</th><th>r</th><th>R²</th><th>P（傾き）</th></tr>'+data.groups.map((g,i)=>{const f=fits[i];return f?`<tr><td>${esc(g.name)}</td><td>${f.n}</td><td>${figSci(f.slope)}（${figSci(f.ciLo[1])} – ${figSci(f.ciHi[1])}）</td><td>${figSci(f.icpt)}</td><td>${f.r.toFixed(3)}</td><td>${f.r2.toFixed(3)}</td><td>${P(f.p)}</td></tr>`:`<tr><td>${esc(g.name)}</td><td colspan="6">点が足りません（3 つ以上）</td></tr>`;}).join('')+'</table>';}
  if(t==='xy-dose'){const fits=res.fits||[];return `<div class="hint">X を ${res.mode==='conc'?'濃度として log10 に変換':'log(濃度) として使用'}${res.skipped?`（0 以下の ${res.skipped} 点はあてはめから除外）`:''}。4PL: Y = Bottom + (Top − Bottom)/(1 + 10^((logEC50 − X)·Hill))。Nelder–Mead → Levenberg–Marquardt の最小二乗。SE は漸近標準誤差（s²(JᵀJ)⁻¹）、CI は t 分布の 95%（Prism の asymptotic CI と同じ）。</div>`+data.groups.map((g,i)=>{const f=fits[i];if(!f)return `<div class="hint">${esc(g.name)}: 点が足りません（4 つ以上）</div>`;const st=f.stats;const row=(name,j,fmt)=>`<tr><td>${name}</td><td>${fmt(f.p[j])}</td><td>${st&&!(f.fixed&&f.fixed.includes(j))?fmt(st.se[j]):'固定'}</td><td>${st&&!(f.fixed&&f.fixed.includes(j))?fmt(st.ciLo[j])+' – '+fmt(st.ciHi[j]):'–'}</td></tr>`;return `<table><tr><th colspan="4">${esc(g.name)}（n = ${f.n}${st?'、df = '+st.df+'、Sy.x = '+figSci(st.sy):''}、R² = ${f.r2.toFixed(4)}）</th></tr><tr><th>パラメータ</th><th>推定値</th><th>SE</th><th>95% CI</th></tr>${row('Bottom',0,figSci)}${row('Top',1,figSci)}${row('logEC50',2,v=>v.toFixed(4))}<tr><td>EC50</td><td>${figSci(Math.pow(10,f.p[2]))}</td><td>–</td><td>${st?figSci(Math.pow(10,st.ciLo[2]))+' – '+figSci(Math.pow(10,st.ciHi[2])):'–'}</td></tr>${row('Hill',3,v=>v.toFixed(4))}</table>`;}).join('');}
  if(t==='xy-mm'){const fits=res.fits||[];return '<div class="hint">Michaelis–Menten: V = Vmax·[S]/(Km + [S])。Nelder–Mead → Levenberg–Marquardt の最小二乗。SE は漸近標準誤差、CI は t 分布の 95%。</div>'+data.groups.map((g,i)=>{const f=fits[i];if(!f)return `<div class="hint">${esc(g.name)}: 点が足りません</div>`;const st=f.stats;const row=(name,j)=>`<tr><td>${name}</td><td>${figSci(f.p[j])}</td><td>${st?figSci(st.se[j]):'–'}</td><td>${st?figSci(st.ciLo[j])+' – '+figSci(st.ciHi[j]):'–'}</td></tr>`;return `<table><tr><th colspan="4">${esc(g.name)}（n = ${f.n}${st?'、df = '+st.df+'、Sy.x = '+figSci(st.sy):''}、R² = ${f.r2.toFixed(4)}）</th></tr><tr><th>パラメータ</th><th>推定値</th><th>SE</th><th>95% CI</th></tr>${row('Vmax',0)}${row('Km',1)}</table>`;}).join('');}
  return null;}

/* ---------- 画面 ---------- */
document.addEventListener('DOMContentLoaded',()=>{const sel=document.querySelector('#figKind');if(sel)FIG_KINDS_MORE.forEach(([v,l])=>{const op=document.createElement('option');op.value=v;op.textContent=l;sel.appendChild(op);});});
