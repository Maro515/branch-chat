// BranCHAT Figure 拡張（P3）
// 推定プロット・QQ・Bland–Altman・カテゴリ軸の折れ線・XY の誤差帯（学習曲線）・
// 多変数表（バブル、PCA: スコア／バイプロット／スクリー＋Parallel analysis／寄与率）・入れ子（SuperPlot）・
// スイマー・スパイダー・混同行列・ボルケーノ／MA・特徴量重要度（横棒）。
// figure-more.js の figAutoKindMore / figBuildDataMore / figRenderMore / figStatsMore から P3 フックで呼ばれる。
'use strict';

/* ---------- 図種の登録 ---------- */
FIG_TYPES.column.push(['estimation','推定プロット（差と 95% CI）'],['qq','QQ プロット（正規性）'],['bland-altman','Bland–Altman（2 列）']);
FIG_TYPES.grouped.push(['grouped-line','カテゴリ軸の折れ線＋誤差']);
FIG_TYPES.xy.push(['xy-band','折れ線＋誤差の帯（学習曲線）']);
FIG_TYPES.heatmap.push(['confusion','混同行列（行＝実際、列＝予測）']);
Object.assign(FIG_TYPES,{
  multi:[['bubble','バブルプロット'],['pca-scores','PCA スコア（PC1 × PC2）'],['pca-biplot','PCA バイプロット'],['pca-scree','PCA スクリー（Parallel analysis）'],['pca-variance','PCA 寄与率']],
  nested:[['superplot','入れ子散布（SuperPlot）']],
  swimmer:[['swimmer','スイマープロット']],
  spider:[['spider','スパイダープロット']],
  feature:[['volcano','ボルケーノ'],['ma','MA プロット']],
  importance:[['importance','特徴量重要度（横棒）']]});
const FIG_KINDS_P3=[['multi','多変数（行＝個体、列＝変数、Group 列任意）'],['nested','入れ子（Group, Subject, Value）'],['swimmer','スイマー（Patient, Duration, Response, …）'],['spider','スパイダー（Patient, Time, Change%）'],['feature','遺伝子表（Gene, log2FC, P）'],['importance','重要度（Feature, Value）']];
const FIG_DEF_P3={estCI:true,estText:true,estErr:'SD',qqLine:true,qqText:true,baLoA:true,baText:true,baMode:'diff',glErr:true,bandAlpha:0.2,
  bubMax:28,bubLegend:true,bubLabels:false,bubAlpha:0.5,
  pcaScale:true,pcaX:1,pcaY:2,pcaLabels:false,pcaEllipse:false,pcaPA:true,pcaNPA:100,pcaCum:true,
  spSubject:true,spErr:'SD',spSmall:true,
  swSort:'duration',swEvents:true,swArrow:true,swUnit:'',
  sdLines:true,sdEnd:true,sdColor:'group',
  volFC:1,volP:0.05,volQ:false,volLabels:10,volLines:true,volCounts:true,
  cmNorm:'none',cmScheme:'wb',cmValues:true,impN:'',impSort:'desc',impErr:true};
Object.assign(FIG_DEF,FIG_DEF_P3);FIG_STYLE_KEYS.push(...Object.keys(FIG_DEF_P3));
Object.assign(FIG_TOOLS_MORE,{
  estimation:[{k:'estErr',t:'select',l:'左の誤差',o:[['SD','平均 ± SD'],['SEM','平均 ± SEM'],['none','平均のみ']]},{k:'estCI',t:'check',l:'右軸に差と 95% CI'},{k:'estText',t:'check',l:'差・CI・P を書く'}],
  qq:[{k:'qqLine',t:'check',l:'恒等線'},{k:'qqText',t:'check',l:'Shapiro–Wilk の W と P を書く'}],
  'bland-altman':[{k:'baMode',t:'select',l:'縦軸',o:[['diff','差（A − B）'],['pct','% 差（差 / 平均 × 100）']]},{k:'baLoA',t:'check',l:'バイアスと 95% 一致限界の線'},{k:'baText',t:'check',l:'数値を書く'}],
  'grouped-line':[{k:'glErr',t:'check',l:'誤差棒'}],
  'xy-band':[{k:'bandAlpha',t:'select',l:'帯の濃さ',o:[['0.15','薄い'],['0.25','ふつう'],['0.4','濃い']]}],
  bubble:[{k:'bubMax',t:'select',l:'最大の泡（pt）',o:[['20','20'],['28','28'],['40','40']]},{k:'bubAlpha',t:'select',l:'透明度',o:[['0.5','50%'],['0.7','70%'],['1','不透明']]},{k:'bubLegend',t:'check',l:'大きさの凡例'},{k:'bubLabels',t:'check',l:'点に名前を書く'}],
  'pca-scores':[{k:'pcaScale',t:'check',l:'変数を標準化（相関行列）'},{k:'pcaX',t:'select',l:'横軸',o:[['1','PC1'],['2','PC2'],['3','PC3']]},{k:'pcaY',t:'select',l:'縦軸',o:[['2','PC2'],['1','PC1'],['3','PC3']]},{k:'pcaLabels',t:'check',l:'点に名前を書く'},{k:'pcaEllipse',t:'check',l:'群の 95% 楕円'}],
  'pca-biplot':[{k:'pcaScale',t:'check',l:'変数を標準化（相関行列）'},{k:'pcaX',t:'select',l:'横軸',o:[['1','PC1'],['2','PC2'],['3','PC3']]},{k:'pcaY',t:'select',l:'縦軸',o:[['2','PC2'],['1','PC1'],['3','PC3']]},{k:'pcaLabels',t:'check',l:'点に名前を書く'}],
  'pca-scree':[{k:'pcaScale',t:'check',l:'変数を標準化（相関行列）'},{k:'pcaPA',t:'check',l:'Parallel analysis の帯'}],
  'pca-variance':[{k:'pcaScale',t:'check',l:'変数を標準化（相関行列）'},{k:'pcaCum',t:'check',l:'累積の折れ線'}],
  superplot:[{k:'spSmall',t:'check',l:'反復の点を描く'},{k:'spSubject',t:'check',l:'個体の平均を大きな記号で'},{k:'spErr',t:'select',l:'誤差（個体平均の）',o:[['SD','SD'],['SEM','SEM'],['CI','95% CI'],['none','なし']]}],
  swimmer:[{k:'swSort',t:'select',l:'並べ方',o:[['duration','期間の長い順'],['input','入力順'],['group','群ごと']]},{k:'swEvents',t:'check',l:'イベントの記号'},{k:'swArrow',t:'check',l:'継続中の矢印'},{k:'swUnit',t:'text',l:'横軸の単位（例: Months）'}],
  spider:[{k:'sdLines',t:'check',l:'+20% / −30% の線'},{k:'sdEnd',t:'check',l:'最終点に記号'},{k:'sdColor',t:'select',l:'線の色',o:[['group','群ごと'],['patient','患者ごと'],['best','最良効果（PD/SD/PR）']]}],
  confusion:[{k:'cmNorm',t:'select',l:'セルの値',o:[['none','件数'],['row','件数と行の %（再現率）'],['col','件数と列の %（精度）']]},{k:'cmScheme',t:'select',l:'色',o:[['wb','白–青'],['wr','白–赤'],['gray','白–黒'],['viridis','Viridis']]},{k:'cmValues',t:'check',l:'セルに値を書く'}],
  volcano:[{k:'volFC',t:'select',l:'|log2FC| のしきい値',o:[['0.585','0.585（1.5 倍）'],['1','1（2 倍）'],['2','2（4 倍）'],['0','なし']]},{k:'volP',t:'select',l:'P のしきい値',o:[['0.05','0.05'],['0.01','0.01'],['0.001','0.001']]},{k:'volQ',t:'check',l:'BH 補正した q を使う'},{k:'volLabels',t:'select',l:'名前を書く上位 n',o:[['0','なし'],['5','5'],['10','10'],['20','20']]},{k:'volLines',t:'check',l:'しきい値の線'},{k:'volCounts',t:'check',l:'上昇・下降の数を書く'}],
  ma:[{k:'volFC',t:'select',l:'|log2FC| のしきい値',o:[['0.585','0.585'],['1','1'],['2','2'],['0','なし']]},{k:'volP',t:'select',l:'P のしきい値',o:[['0.05','0.05'],['0.01','0.01'],['0.001','0.001']]},{k:'volQ',t:'check',l:'BH 補正した q を使う'},{k:'volLabels',t:'select',l:'名前を書く上位 n',o:[['0','なし'],['5','5'],['10','10'],['20','20']]}],
  importance:[{k:'impN',t:'text',l:'上位 n 件（空で全部）'},{k:'impSort',t:'select',l:'並べ方',o:[['desc','大きい順'],['input','入力順']]},{k:'impErr',t:'check',l:'誤差棒（Error 列）'}]});

FIG_PROMPT+=`
さらに: column に estimation（2 群の推定プロット: 右軸に平均差と 95% CI）・qq（正規 QQ）・bland-altman（列 A, B）、grouped に grouped-line、xy に xy-band（反復の平均 ± 誤差の帯、学習曲線）。
kind "multi"（行＝個体、列＝変数、Group 列は文字）: type bubble（列 X, Y, Size, Color/Group 任意, Label 任意）、pca-scores・pca-biplot・pca-scree・pca-variance（数値列を変数として PCA）。
kind "nested": 列 Group, Subject（個体）, Value。type superplot。
kind "swimmer": 列 Patient, Duration（または Start と End）, Response/Group（任意）, Ongoing（1/0、任意）、ほかの数値列はイベントの時刻（列名がイベント名）。
kind "spider": 列 Patient, Time, Change（%）, Group（任意）。
kind "feature": 列 Gene, log2FC, P（または padj）, baseMean（任意）。type volcano か ma。
kind "importance": 列 Feature, Value, Error（任意）。
kind "heatmap" の type confusion: 行＝実際、列＝予測の件数行列。`;

/* ---------- 数値 ---------- */
// 対称行列の固有値分解（Jacobi）。values は降順、vectors[k] は k 番目の固有ベクトル
function figEigSym(A){const n=A.length;const a=A.map(r=>r.slice());const V=a.map((_,i)=>a.map((_,j)=>i===j?1:0));
  for(let sweep=0;sweep<100;sweep++){let off=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)off+=a[i][j]*a[i][j];if(off<1e-24)break;
    for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){if(Math.abs(a[p][q])<1e-300)continue;const th=(a[q][q]-a[p][p])/(2*a[p][q]);const t=(th>=0?1:-1)/(Math.abs(th)+Math.sqrt(th*th+1));const c=1/Math.sqrt(t*t+1),s=t*c;
      for(let k=0;k<n;k++){const kp=a[k][p],kq=a[k][q];a[k][p]=c*kp-s*kq;a[k][q]=s*kp+c*kq;}for(let k=0;k<n;k++){const pk=a[p][k],qk=a[q][k];a[p][k]=c*pk-s*qk;a[q][k]=s*pk+c*qk;}for(let k=0;k<n;k++){const vp=V[k][p],vq=V[k][q];V[k][p]=c*vp-s*vq;V[k][q]=s*vp+c*vq;}}}
  const ev=a.map((r,i)=>r[i]);const idx=ev.map((_,i)=>i).sort((x,y)=>ev[y]-ev[x]);
  return {values:idx.map(i=>ev[i]),vectors:idx.map(i=>{const v=V.map(r=>r[i]);let bi=0;v.forEach((x,k)=>{if(Math.abs(x)>Math.abs(v[bi]))bi=k;});return v[bi]<0?v.map(x=>-x):v;})};}
function figRng(seed){let s=seed>>>0;const u=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};return {u,n:()=>{let a=u()||1e-12;return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*u());}};}
// PCA。X: 行＝個体、列＝変数。scale=true で標準化（相関行列）。Parallel analysis は乱数（固定シード）で nPA 回
function figPCA(X,scale,nPA){const n=X.length,p=X[0].length;const mu=[],sdv=[];for(let j=0;j<p;j++){const col=X.map(r=>r[j]);mu.push(mean(col));sdv.push(sd(col)||1);}
  const Z=X.map(r=>r.map((v,j)=>(v-mu[j])/(scale?sdv[j]:1)));const C=[];for(let i=0;i<p;i++){C[i]=[];for(let j=0;j<p;j++){let s=0;for(let k=0;k<n;k++)s+=Z[k][i]*Z[k][j];C[i][j]=s/(n-1);}}
  const eg=figEigSym(C);const tot=eg.values.reduce((a,b)=>a+b,0);const scores=Z.map(r=>eg.vectors.map(v=>v.reduce((s,x,j)=>s+x*r[j],0)));
  let pa=null;if(nPA>0&&n>2){const R=figRng(20240613);const sims=[];for(let it=0;it<nPA;it++){const Y=[];for(let i=0;i<n;i++){const row=[];for(let j=0;j<p;j++)row.push(R.n()*(scale?1:sdv[j]));Y.push(row);}const m=[],s2=[];for(let j=0;j<p;j++){const col=Y.map(r=>r[j]);m.push(mean(col));s2.push(sd(col)||1);}const Zy=Y.map(r=>r.map((v,j)=>(v-m[j])/(scale?s2[j]:1)));const Cy=[];for(let i=0;i<p;i++){Cy[i]=[];for(let j=0;j<p;j++){let s=0;for(let k=0;k<n;k++)s+=Zy[k][i]*Zy[k][j];Cy[i][j]=s/(n-1);}}sims.push(figEigSym(Cy).values);}
    pa=eg.values.map((_,k)=>{const col=sims.map(s=>s[k]).sort((a,b)=>a-b);return {mean:mean(col),p5:quantile(col,0.05),p95:quantile(col,0.95)};});}
  return {n,p,mu,sd:sdv,values:eg.values,prop:eg.values.map(v=>v/tot),loadings:eg.vectors,scores,pa,scale};}
// 2 変数の 95% データ楕円（ggplot2 stat_ellipse と同じ: 半径 = sqrt(2·F(0.95; 2, n−1))）
function figEllipse(pts){const n=pts.length;if(n<3)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const mx=mean(xs),my=mean(ys);const sxx=variance(xs),syy=variance(ys),sxy=figCov(xs,ys);const tr=sxx+syy,det=sxx*syy-sxy*sxy;const d=Math.sqrt(Math.max(0,tr*tr/4-det));const l1=tr/2+d,l2=Math.max(1e-12,tr/2-d);const ang=Math.atan2(l1-sxx,sxy||1e-12);
  const F=figFQuant95(2,n-1);const k=Math.sqrt(2*F);const a=Math.sqrt(l1)*k,b=Math.sqrt(l2)*k;return {cx:mx,cy:my,a,b,ang,bx:Math.sqrt(Math.pow(a*Math.cos(ang),2)+Math.pow(b*Math.sin(ang),2)),by:Math.sqrt(Math.pow(a*Math.sin(ang),2)+Math.pow(b*Math.cos(ang),2))};}
function figFQuant95(d1,d2){let lo=0,hi=1000;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(fPvalue(m,d1,d2)>0.05)lo=m;else hi=m;}return (lo+hi)/2;}
// 混同行列の指標
function figCMStats(m){const k=m.length;const N=m.flat().reduce((a,b)=>a+b,0);const rs=m.map(r=>r.reduce((a,b)=>a+b,0)),cs=m[0].map((_,j)=>m.reduce((a,r)=>a+r[j],0));let diag=0;for(let i=0;i<k;i++)diag+=m[i][i];const acc=N?diag/N:NaN;let pe=0;for(let i=0;i<k;i++)pe+=rs[i]*cs[i]/(N*N||1);const kappa=pe<1?(acc-pe)/(1-pe):NaN;
  const per=m.map((r,i)=>{const tp=m[i][i],fn=rs[i]-tp,fp=cs[i]-tp,tn=N-tp-fn-fp;const rec=rs[i]?tp/rs[i]:NaN,pre=cs[i]?tp/cs[i]:NaN;return {tp,fn,fp,tn,recall:rec,precision:pre,spec:(tn+fp)?tn/(tn+fp):NaN,f1:(pre+rec)?2*pre*rec/(pre+rec):NaN};});return {N,acc,kappa,per,rs,cs};}

/* ---------- データ表の判定と組み立て ---------- */
const figTextCol=c=>c.raw.some(v=>v!==''&&isNaN(+v));
const figNUniq=c=>new Set(c.raw.filter(v=>v!=='')).size;
function figAutoKindP3(parsed){const cols=parsed.cols;const lc=figLC;
  if(typeof figAutoKindP4==='function'){const k=figAutoKindP4(parsed);if(k)return k;} // figure-omics.js
  if(cols.some(c=>/log2?\s*fc|fold|log2foldchange|効果量/.test(lc(c)))&&cols.some(c=>/^(p|pvalue|p\.?val(ue)?|padj|p_adj|fdr|q|qvalue|adj\.?p)/.test(lc(c))))return 'feature';
  if(parsed.firstColText&&cols.some(c=>/^(duration|end|stop|treatment|期間|終了|投与期間|on.?study|治療期間)/.test(lc(c))&&c.vals.some(v=>v!==null)))return 'swimmer';
  if(parsed.firstColText&&cols.some(c=>/^(time|week|month|day|visit|cycle|時点|週|月|日)/.test(lc(c))&&c.vals.some(v=>v!==null))&&cols.some(c=>/change|%|変化|縮小/.test(lc(c)))&&figNUniq(cols[0])<cols[0].raw.filter(v=>v!=='').length)return 'spider';
  if(cols.some(c=>/subject|mouse|animal|donor|replicate|個体|マウス|動物|ドナー|患者|検体/.test(lc(c)))&&cols.filter(figTextCol).length>=1&&cols.filter(c=>c.vals.some(v=>v!==null)&&!figTextCol(c)).length===1&&cols.length>=3&&cols.length<=4)return 'nested';
  if(cols.some(c=>/^(size|bubble|n|count|大きさ|数)$/.test(lc(c)))&&cols.filter(c=>c.vals.some(v=>v!==null)&&!figTextCol(c)).length>=3)return 'multi';
  if(cols.some(c=>/importance|重要度|gain|shap/.test(lc(c)))&&parsed.firstColText)return 'importance';
  return null;}
function figBuildDataP3(parsed,kind){
  if(typeof figBuildDataP4==='function'){const r=figBuildDataP4(parsed,kind);if(r!==undefined)return r;}
  if(kind==='multi')return figBuildMulti(parsed);if(kind==='nested')return figBuildNested(parsed);if(kind==='swimmer')return figBuildSwimmer(parsed);if(kind==='spider')return figBuildSpider(parsed);if(kind==='feature')return figBuildFeature(parsed);if(kind==='importance')return figBuildImportance(parsed);
  return undefined;}
function figBuildMulti(parsed){const cols=parsed.cols;const num=cols.filter(c=>c.vals.filter(v=>v!==null).length>=2&&!figTextCol(c));if(num.length<2)return null;const text=cols.filter(c=>!num.includes(c)&&c.raw.some(v=>v!==''));
  const nRows=cols[0].raw.length;const gCol=text.find(c=>c!==cols[0]||!parsed.firstColText?figNUniq(c)<=Math.max(2,nRows/2):false)||text.find(c=>figNUniq(c)<nRows&&figNUniq(c)>1)||null;const idCol=text.find(c=>c!==gCol)||null;
  const keep=[];for(let i=0;i<nRows;i++)if(num.every(c=>c.vals[i]!==null))keep.push(i);if(keep.length<2)return null;
  const pick=(re,used)=>num.find(c=>re.test(figLC(c))&&!used.includes(c))||num.find(c=>!used.includes(c))||null;
  const xC=pick(/^x$|^x[ _]|横|x軸/,[]),yC=pick(/^y$|^y[ _]|縦|y軸/,[xC]),sC=pick(/size|bubble|^n$|count|大きさ|数|weight/,[xC,yC]),cC=num.find(c=>![xC,yC,sC].includes(c)&&/color|colour|色|score|expr/.test(figLC(c)))||null;
  const groups=gCol?[...new Set(keep.map(i=>gCol.raw[i]||'(なし)'))]:[];
  return {kind:'multi',vars:num.map(c=>c.name),X:keep.map(i=>num.map(c=>c.vals[i])),ids:keep.map(i=>idCol?idCol.raw[i]:String(i+1)),group:gCol?keep.map(i=>gCol.raw[i]||'(なし)'):null,groups:groups.map(name=>({name})),
    bubble:{x:xC&&num.indexOf(xC),y:yC&&num.indexOf(yC),s:sC?num.indexOf(sC):-1,c:cC?num.indexOf(cC):-1,xname:xC&&xC.name,yname:yC&&yC.name,sname:sC&&sC.name,cname:cC&&cC.name}};}
function figBuildNested(parsed){const cols=parsed.cols;const vCol=cols.slice().reverse().find(c=>c.vals.some(v=>v!==null)&&!figTextCol(c));if(!vCol)return null;const rest=cols.filter(c=>c!==vCol&&c.raw.some(v=>v!==''));
  const sCol=rest.find(c=>/subject|mouse|animal|donor|replicate|個体|マウス|動物|ドナー|患者|検体|id/.test(figLC(c)))||rest[1]||null;const gCol=rest.find(c=>c!==sCol)||null;if(!gCol||!sCol)return null;
  const map={},order=[];vCol.vals.forEach((v,i)=>{if(v===null)return;const g=gCol.raw[i]||'(なし)',s=sCol.raw[i]||'(なし)';if(!map[g]){map[g]={name:g,subjects:[],values:[],_s:{}};order.push(g);}const G=map[g];if(!G._s[s]){G._s[s]={name:s,values:[]};G.subjects.push(G._s[s]);}G._s[s].values.push(v);G.values.push(v);});
  return {kind:'nested',groups:order.map(g=>{const G=map[g];delete G._s;G.means=G.subjects.map(s=>mean(s.values));return G;}),gname:gCol.name,sname:sCol.name,vname:vCol.name};}
function figBuildSwimmer(parsed){const cols=parsed.cols;const lc=figLC;const idCol=cols[0];const num=cols.filter(c=>c!==idCol&&c.vals.some(v=>v!==null)&&!figTextCol(c));
  const endC=num.find(c=>/^(duration|end|stop|length|期間|終了|treatment|on.?study|治療期間|投与期間|months|weeks|days|time)/.test(lc(c)))||num[0];if(!endC)return null;const startC=num.find(c=>c!==endC&&/^(start|begin|開始|治療開始)/.test(lc(c)))||null;
  const binCols=cols.filter(c=>c!==idCol&&c!==endC&&c!==startC&&figIsBin(c));const ongC=binCols.find(c=>/ongoing|continu|継続|治療中|alive/.test(lc(c)))||null;
  const text=cols.filter(c=>c!==idCol&&c!==ongC&&figTextCol(c));const gCol=text.find(c=>/response|best|group|arm|cohort|治療|奏効|効果|群/.test(lc(c)))||text[0]||null;
  const evCols=num.filter(c=>c!==endC&&c!==startC&&c!==ongC);const order=['CR','PR','SD','PD','NE'];
  const items=idCol.raw.map((id,i)=>{const e=endC.vals[i];if(id===''||e===null)return null;const st=startC?(startC.vals[i]||0):0;return {id,start:st,end:startC?e:st+e,group:gCol?String(gCol.raw[i]||'').trim():'',ongoing:ongC?/^(1|yes|true|y|あり|有|継続)$/i.test(ongC.raw[i]):false,events:evCols.map((c,k)=>({k,t:c.vals[i]})).filter(ev=>ev.t!==null)};}).filter(Boolean);
  if(!items.length)return null;const gs=[...new Set(items.map(it=>it.group).filter(Boolean))].sort((a,b)=>{const ia=order.indexOf(a.toUpperCase()),ib=order.indexOf(b.toUpperCase());return (ia<0?9:ia)-(ib<0?9:ib)||a.localeCompare(b);});
  return {kind:'swimmer',items,eventNames:evCols.map(c=>c.name),groups:gs.map(name=>({name})),tname:endC.name};}
function figBuildSpider(parsed){const cols=parsed.cols;const lc=figLC;
  if(parsed.firstColText){const idCol=cols[0];const tCol=cols.find(c=>c!==idCol&&/time|week|month|day|visit|cycle|時点|週|月|日/.test(lc(c))&&!figTextCol(c))||cols.find(c=>c!==idCol&&!figTextCol(c)&&c.vals.some(v=>v!==null));const vCol=cols.find(c=>c!==idCol&&c!==tCol&&/change|%|変化|縮小|sum|size|径/.test(lc(c))&&!figTextCol(c))||cols.find(c=>c!==idCol&&c!==tCol&&!figTextCol(c)&&c.vals.some(v=>v!==null));if(!tCol||!vCol)return null;
    const gCol=cols.find(c=>![idCol,tCol,vCol].includes(c)&&figTextCol(c))||null;const map={},order=[];idCol.raw.forEach((id,i)=>{if(id===''||tCol.vals[i]===null||vCol.vals[i]===null)return;if(!map[id]){map[id]={id,group:gCol?gCol.raw[i]:'',pts:[]};order.push(id);}map[id].pts.push([tCol.vals[i],vCol.vals[i]]);});
    const pats=order.map(id=>{const p=map[id];p.pts.sort((a,b)=>a[0]-b[0]);return p;});const gs=[...new Set(pats.map(p=>p.group).filter(Boolean))];return {kind:'spider',patients:pats,groups:gs.map(name=>({name})),tname:tCol.name,vname:vCol.name};}
  const tCol=cols[0];const pats=cols.slice(1).filter(c=>c.vals.some(v=>v!==null)).map(c=>({id:c.name,group:'',pts:tCol.vals.map((t,i)=>t===null||c.vals[i]===null?null:[t,c.vals[i]]).filter(Boolean).sort((a,b)=>a[0]-b[0])}));if(!pats.length)return null;return {kind:'spider',patients:pats,groups:[],tname:tCol.name,vname:''};}
function figBuildFeature(parsed){const cols=parsed.cols;const lc=figLC;const fc=cols.find(c=>/log2?\s*fc|fold|log2foldchange|効果量|logfc/.test(lc(c))&&!figTextCol(c));if(!fc)return null;
  const padj=cols.find(c=>/padj|p_adj|adj\.?p|fdr|^q|qvalue|q_value|q\.value/.test(lc(c))&&!figTextCol(c))||null;const p=cols.find(c=>c!==padj&&/^(p|pvalue|p\.?val(ue)?|p_value|pval)$/.test(lc(c))&&!figTextCol(c))||padj;if(!p)return null;
  const base=cols.find(c=>/basemean|mean|avg|expr|logcpm|aveexpr|平均/.test(lc(c))&&!figTextCol(c)&&c!==fc&&c!==p)||null;const nameC=cols.find(c=>figTextCol(c))||null;
  const items=fc.vals.map((v,i)=>{const pv=p.vals[i];if(v===null||pv===null||!(pv>0))return null;return {name:nameC?nameC.raw[i]:String(i+1),fc:v,p:pv,q:padj?padj.vals[i]:null,base:base?base.vals[i]:null};}).filter(Boolean);if(!items.length)return null;
  if(!padj){const qs=bhFDR(items.map(it=>it.p));items.forEach((it,i)=>{it.q=qs[i];});}return {kind:'feature',items,pname:p.name,qname:padj?padj.name:'BH q',fcname:fc.name,bname:base?base.name:'',groups:[]};}
function figBuildImportance(parsed){const cols=parsed.cols;const num=cols.filter(c=>c.vals.some(v=>v!==null)&&!figTextCol(c));const vC=num.find(c=>/importance|重要度|gain|shap|value|score|coef/.test(figLC(c)))||num[0];if(!vC)return null;const eC=num.find(c=>c!==vC&&/err|sd|se|std|誤差/.test(figLC(c)))||null;
  const items=vC.vals.map((v,i)=>v===null?null:({name:parsed.firstColText?parsed.rowLabels[i]:String(i+1),v,e:eC?eC.vals[i]:null})).filter(Boolean);if(!items.length)return null;return {kind:'importance',items,vname:vC.name,groups:[]};}

/* ---------- 描画 ---------- */
function figRenderP3(spec){const d=spec.data,t=spec.type;
  if(typeof figRenderP4==='function'){const r=figRenderP4(spec);if(r)return r;}
  if(d.kind==='multi')return /^pca/.test(t)?figRenderPCA(spec):figRenderBubble(spec);if(d.kind==='nested')return figRenderSuper(spec);if(d.kind==='swimmer')return figRenderSwimmer(spec);if(d.kind==='spider')return figRenderSpider(spec);if(d.kind==='feature')return figRenderVolcano(spec);if(d.kind==='importance')return figRenderImportance(spec);
  if(d.kind==='heatmap'&&t==='confusion')return figRenderConfusion(spec);
  if(t==='estimation')return figRenderEstimation(spec);if(t==='qq')return figRenderQQ(spec);if(t==='bland-altman')return figRenderBA2(spec);if(t==='grouped-line')return figRenderGroupedLine(spec);if(t==='xy-band')return figRenderBand(spec);
  return null;}
// 利用者がサイズを変えていないときだけ図種の既定サイズを使う
const figDefSize=(spec,k)=>(spec.opts||{})[k]==null;
const figErrBarP3=(F,cx,m,e,w,c)=>{if(!(e>0))return '';const {yOf,a,o}=F;const yT=yOf(m+e),yB=yOf(m-e),cw=w*(+o.capW||0.5);return `<line x1="${cx}" y1="${yT}" x2="${cx}" y2="${yB}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-cw/2}" y1="${yT}" x2="${cx+cw/2}" y2="${yT}" stroke="${c}" stroke-width="${a}"/><line x1="${cx-cw/2}" y1="${yB}" x2="${cx+cw/2}" y2="${yB}" stroke="${c}" stroke-width="${a}"/>`;};

// 推定プロット（column: 群 1 以降 と 群 0（対照）の平均差を右軸に。Welch の t 検定の 95% CI）
function figRenderEstimation(spec){const d=spec.data;const gs=d.groups.filter(g=>g.values.length);const n=gs.length;if(n<2)return {svg:'',w:0,h:0};const o=Object.assign({},FIG_DEF,spec.opts||{});
  const c=Math.max(0,Math.min(n-1,+spec.ctrl||0));const m0=mean(gs[c].values);const diffs=gs.map((g,i)=>i===c||g.values.length<2||gs[c].values.length<2?null:tTest2(g.values,gs[c].values,{welch:true}));
  const all=gs.flatMap(g=>g.values);const dv=diffs.filter(Boolean).flatMap(r=>[m0+r.ciLo,m0+r.ciHi]);let lo=Math.min(...all,...dv),hi=Math.max(...all,...dv);const pad=(hi-lo)*0.06||1;const [ylo,yhi]=figYRange(o,lo-pad,hi+pad);const ys=figAxisLin(ylo,yhi,5);
  const nd=diffs.filter(Boolean).length;const xs={lo:0,hi:n+(o.estCI?nd+0.4:0),cat:true,ticks:gs.map((g,i)=>({v:i+0.5,l:g.name}))};
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle,yTitle:o.yTitle,padR:o.estCI?F0(o)*3.6:0});const {xOf,yOf,S,sym,a,fs,h,txt,ac,dash}=F;const slot=xOf(1)-xOf(0),bw=slot*0.6;
  let body='',right='',texts='';const centers=[];
  gs.forEach((g,i)=>{const so=S(i),col=so.color;const cx=xOf(i+0.5);const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(g.values,yOf,r,bw*0.9);let s='';g.values.forEach((v,k)=>{s+=sym(cx+pos[k].dx,pos[k].y,i,col,so.fill);});
    const e=figErr(g.values,o.estErr);const lw=bw*0.5;s+=`<line x1="${cx-lw/2}" y1="${yOf(e.m)}" x2="${cx+lw/2}" y2="${yOf(e.m)}" stroke="#000" stroke-width="${a*2}"/>`+figErrBarP3(F,cx,e.m,e.e,bw,'#000');body+=`<g data-sel="series:${i}">${s}</g>`;centers.push({cx,top:yOf(Math.max(...g.values))});});
  if(o.estCI){const step=ys.ticks.length>1?ys.ticks[1].v-ys.ticks[0].v:1;const rx=xOf(n+0.4+nd);const yTop=yOf(ys.hi),yBot=yOf(ys.lo);
    right+=`<line x1="${rx}" y1="${yBot}" x2="${rx}" y2="${yTop}" stroke="${ac}" stroke-width="${a}"/>`;const k0=Math.ceil((ys.lo-m0)/step-1e-9),k1=Math.floor((ys.hi-m0)/step+1e-9);for(let k=k0;k<=k1;k++){const v=+(k*step).toFixed(10);const y=yOf(m0+v);right+=`<line x1="${rx}" y1="${y}" x2="${rx+Math.abs(F.tick)}" y2="${y}" stroke="${ac}" stroke-width="${a}"/>`+txt(rx+Math.abs(F.tick)+fs*0.3,y+h/2,figFmt(v),'start');}
    right+=txt(rx+Math.abs(F.tick)+fs*2.8,(yTop+yBot)/2,'Difference between means','middle',`transform="rotate(90 ${rx+Math.abs(F.tick)+fs*2.8} ${(yTop+yBot)/2})"`);
    right+=`<line x1="${xOf(c+0.5)}" y1="${yOf(m0)}" x2="${rx}" y2="${yOf(m0)}" stroke="#666" stroke-width="${a*0.6}" stroke-dasharray="${FIG_PT} ${FIG_PT*1.5}"/>`;let slotK=0;
    diffs.forEach((r,i)=>{if(!r)return;const dx=xOf(n+0.4+slotK+0.5);slotK++;const mi=mean(gs[i].values);right+=`<line x1="${xOf(i+0.5)}" y1="${yOf(mi)}" x2="${dx}" y2="${yOf(mi)}" stroke="#666" stroke-width="${a*0.6}" stroke-dasharray="${FIG_PT} ${FIG_PT*1.5}"/>`;
      right+=`<line x1="${dx}" y1="${yOf(m0+r.ciLo)}" x2="${dx}" y2="${yOf(m0+r.ciHi)}" stroke="${S(i).color}" stroke-width="${a*1.5}"/>`+figSymbol(dx,yOf(mi),S(i).symPt*FIG_PT*0.7,'circle',S(i).color,S(i).color);
      if(o.estText){const ty=Math.max(F.padT+fs*0.8,yOf(m0+r.ciHi)-fs*0.5);texts+=txt(dx,ty-fs*0.95,`${figFmt(+r.diff.toPrecision(3))} [${figFmt(+r.ciLo.toPrecision(3))}, ${figFmt(+r.ciHi.toPrecision(3))}]`,'middle',null,null,fs*0.75)+txt(dx,ty,figPtext(r.p),'middle',null,null,fs*0.75);}});
    right+=`<line x1="${xOf(n+0.2)}" y1="${yTop}" x2="${xOf(n+0.2)}" y2="${yBot}" stroke="#aaa" stroke-width="${a*0.5}"/>`;}
  const r=F.wrap(right+body+(texts?`<g data-sel="text">${texts}</g>`:''));r.res={diffs,ctrl:c,m0};return r;}
function F0(o){return (+o.fontPt||12)*FIG_PT;}

// QQ プロット（column: X＝実測値、Y＝正規分布から予測した値。群ごとに色分け）
function figRenderQQ(spec){const d=spec.data;const gs=d.groups.filter(g=>g.values.length>=3);if(!gs.length)return {svg:'',w:0,h:0};const o=Object.assign({},FIG_DEF,spec.opts||{});
  const ser=gs.map(g=>{const v=g.values.slice().sort((a,b)=>a-b);const n=v.length,m=mean(v),s=sd(v);const sw=shapiroWilk(v);return {pts:v.map((x,i)=>[x,m+s*normInv((i+1-0.375)/(n+0.25))]),sw,n};});
  const all=ser.flatMap(s=>s.pts.flat());const lo=Math.min(...all),hi=Math.max(...all),pad=(hi-lo)*0.06||1;const xs=figAxisLin(lo-pad,hi+pad,5);const ys=figAxisLin(lo-pad,hi+pad,5);
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||'Actual',yTitle:o.yTitle||'Predicted (normal)',legend:gs.length>1?gs.map((g,i)=>({name:g.name,kind:'sym',i})):[]});const {xOf,yOf,S,sym,a,fs,txt,dash}=F;
  let body='',texts='';if(o.qqLine){const l=Math.max(xs.lo,ys.lo),hh=Math.min(xs.hi,ys.hi);body+=`<line x1="${xOf(l)}" y1="${yOf(l)}" x2="${xOf(hh)}" y2="${yOf(hh)}" stroke="#888" stroke-width="${a*0.5}" stroke-dasharray="${dash}"/>`;}
  ser.forEach((s,i)=>{const so=S(i);let g='';s.pts.forEach(p=>{g+=sym(xOf(p[0]),yOf(p[1]),i,so.color,so.fill);});body+=`<g data-sel="series:${i}">${g}</g>`;if(o.qqText&&s.sw)texts+=txt(F.x0+F.plotW-fs*0.4,F.y0-fs*(ser.length-i)*1.15-fs*0.3,`${gs.length>1?gs[i].name+': ':''}W = ${s.sw.W.toFixed(3)}, ${figPtext(s.sw.p)}`,'end',`fill="${so.color}"`,null,fs*0.85);});
  const r=F.wrap(body+(texts?`<g data-sel="text">${texts}</g>`:''));r.res={ser:ser.map(s=>({sw:s.sw,n:s.n}))};return r;}

// Bland–Altman（column: 2 列を同じ個体の 2 法とみなす。X＝平均、Y＝差、バイアスと 95% 一致限界）
function figRenderBA2(spec){const d=spec.data;const gs=d.groups;if(gs.length<2)return {svg:'',w:0,h:0};const o=Object.assign({},FIG_DEF,spec.opts||{});const A=gs[0].raw||gs[0].values,B=gs[1].raw||gs[1].values;
  const pts=[];for(let i=0;i<Math.min(A.length,B.length);i++)if(A[i]!=null&&B[i]!=null){const m=(A[i]+B[i])/2,df=A[i]-B[i];pts.push([m,o.baMode==='pct'?(m?df/m*100:0):df]);}if(pts.length<2)return {svg:'',w:0,h:0};
  const diffs=pts.map(p=>p[1]);const bias=mean(diffs),s=sd(diffs),n=diffs.length;const loa=[bias-1.959964*s,bias+1.959964*s];const se=s/Math.sqrt(n),tc=tQuantile(0.975,n-1);const seL=s*Math.sqrt(3/n);
  const xsv=pts.map(p=>p[0]);const xp=(Math.max(...xsv)-Math.min(...xsv))*0.06||1;const xs=figAxisLin(Math.min(...xsv)-xp,Math.max(...xsv)+xp,5);const yv=[...diffs,...loa,0];const yp=(Math.max(...yv)-Math.min(...yv))*0.12||1;const [ylo,yhi]=figYRange(o,Math.min(...yv)-yp,Math.max(...yv)+yp);const ys=figAxisLin(ylo,yhi,5);
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||`Mean of ${gs[0].name} and ${gs[1].name}`,yTitle:o.yTitle||(o.baMode==='pct'?`Difference (%)`:`${gs[0].name} − ${gs[1].name}`),padR:o.baLoA&&o.baText?F0(o)*6:0});const {xOf,yOf,S,sym,a,fs,h,txt,dash,x0,plotW}=F;
  let lines='',texts='';if(o.baLoA){const L=(v,ds,lab)=>{if(v<ys.lo||v>ys.hi)return '';let t=`<line x1="${x0}" y1="${yOf(v)}" x2="${x0+plotW}" y2="${yOf(v)}" stroke="#000" stroke-width="${a*0.75}"${ds?` stroke-dasharray="${dash}"`:''}/>`;if(o.baText)t+=txt(x0+plotW+fs*0.3,yOf(v)+h/2,lab,'start',null,null,fs*0.8);return t;};
    lines+=L(bias,false,`Bias ${figFmt(+bias.toPrecision(3))}`)+L(loa[0],true,`−1.96 SD ${figFmt(+loa[0].toPrecision(3))}`)+L(loa[1],true,`+1.96 SD ${figFmt(+loa[1].toPrecision(3))}`);if(0>=ys.lo&&0<=ys.hi)lines+=`<line x1="${x0}" y1="${yOf(0)}" x2="${x0+plotW}" y2="${yOf(0)}" stroke="#aaa" stroke-width="${a*0.5}"/>`;}
  let body='';pts.forEach(p=>{body+=sym(xOf(p[0]),yOf(p[1]),0,S(0).color,S(0).fill);});
  const r=F.wrap(lines+`<g data-sel="series:0">${body}</g>`+(texts?`<g data-sel="text">${texts}</g>`:''));r.res={n,bias,sd:s,loa,biasCI:[bias-tc*se,bias+tc*se],loaCI:[[loa[0]-tc*seL,loa[0]+tc*seL],[loa[1]-tc*seL,loa[1]+tc*seL]],pct:o.baMode==='pct'};return r;}

// カテゴリ軸の折れ線（grouped: 群ごとにカテゴリをつないだ折れ線＋記号＋誤差）
function figRenderGroupedLine(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const nc=d.cats.length;if(!nc||!d.groups.length)return {svg:'',w:0,h:0};
  const yv=[];d.groups.forEach(g=>g.cells.forEach(v=>{if(v.length){const e=figErr(v,o.errType);yv.push(e.m+(o.glErr?e.e:0),e.m-(o.glErr?e.e:0));}}));if(!yv.length)return {svg:'',w:0,h:0};let lo=Math.min(...yv),hi=Math.max(...yv);const pad=(hi-lo)*0.08||1;if(lo>0&&lo<(hi-lo)*0.5)lo=0;else lo-=pad;const [ylo,yhi]=figYRange(o,lo,hi+pad);const ys=figAxisLin(ylo,yhi,5);
  const xs={lo:0,hi:nc,cat:true,ticks:d.cats.map((c,i)=>({v:i+0.5,l:c}))};const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle,yTitle:o.yTitle,legend:d.groups.length>1?d.groups.map((g,i)=>({name:g.name,kind:'sym',i})):[]});const {xOf,yOf,S,sym,a}=F;const slot=xOf(1)-xOf(0);
  let body='';d.groups.forEach((g,i)=>{const so=S(i),c=so.color;let s='',path='';g.cells.forEach((v,ci)=>{if(!v.length){return;}const e=figErr(v,o.errType);const cx=xOf(ci+0.5),cy=yOf(e.m);path+=(path?'L':'M')+`${cx},${cy}`;if(o.glErr)s+=figErrBarP3(F,cx,e.m,e.e,slot*0.25,c);s+=sym(cx,cy,i,c,so.fill);});body+=`<g data-sel="series:${i}"><path d="${path}" fill="none" stroke="${c}" stroke-width="${so.lineW*FIG_PT}"/>${s}</g>`;});
  const r=F.wrap(body);r.res={};return r;}

// XY の帯（xy: 各 X の反復の平均を線で、平均 ± 誤差を半透明の帯で。学習曲線など）
function figRenderBand(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const ser=d.groups.map(g=>g.points.slice().sort((p,q)=>p.x-q.x).map(p=>({x:p.x,...figErr(p.ys,o.errType)})));if(!ser.some(s=>s.length))return {svg:'',w:0,h:0};
  const xsAll=ser.flat().map(p=>p.x);const xpad=(Math.max(...xsAll)-Math.min(...xsAll))*0.04||1;const xs=figAxisLin(Math.min(...xsAll)-xpad,Math.max(...xsAll)+xpad,6);const yv=ser.flat().flatMap(p=>[p.m+p.e,p.m-p.e]);const yp=(Math.max(...yv)-Math.min(...yv))*0.08||1;const [ylo,yhi]=figYRange(o,Math.min(...yv)-yp,Math.max(...yv)+yp);const ys=figAxisLin(ylo,yhi,5);
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||d.xname,yTitle:o.yTitle,legend:d.groups.length>1?d.groups.map((g,i)=>({name:g.name,kind:'line',i})):[]});const {xOf,yOf,S,sym}=F;
  let body='';ser.forEach((pts,i)=>{const so=S(i),c=so.color;if(!pts.length)return;const up=pts.map(p=>`${xOf(p.x)},${yOf(p.m+p.e)}`),lo=pts.slice().reverse().map(p=>`${xOf(p.x)},${yOf(p.m-p.e)}`);let s=`<polygon points="${up.concat(lo).join(' ')}" fill="${c}" fill-opacity="${+o.bandAlpha}" stroke="none"/>`;s+=`<polyline points="${pts.map(p=>`${xOf(p.x)},${yOf(p.m)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${so.lineW*FIG_PT*1.5}"/>`;if(pts.length<=30)pts.forEach(p=>{s+=sym(xOf(p.x),yOf(p.m),i,c,so.fill);});body+=`<g data-sel="series:${i}">${s}</g>`;});
  const r=F.wrap(body);r.res={err:o.errType};return r;}

// バブル（multi: X, Y, 大きさ＝面積比例、色＝群または連続値）
function figRenderBubble(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const b=d.bubble;if(b.x==null||b.y==null)return {svg:'',w:0,h:0};const X=d.X.map(r=>r[b.x]),Y=d.X.map(r=>r[b.y]);const Sz=b.s>=0?d.X.map(r=>r[b.s]):null;const Cv=b.c>=0?d.X.map(r=>r[b.c]):null;
  const maxR=(+o.bubMax||28)*FIG_PT/2,minR=3*FIG_PT;const smax=Sz?Math.max(...Sz):1,smin=Sz?Math.min(...Sz):1;const rOf=v=>Sz?Math.sqrt(Math.max(0,v)/smax)*maxR:FIG_PT*4;
  const xp=(Math.max(...X)-Math.min(...X))*0.1||1,yp=(Math.max(...Y)-Math.min(...Y))*0.1||1;const xs=figAxisLin(Math.min(...X)-xp,Math.max(...X)+xp,5);const [ylo,yhi]=figYRange(o,Math.min(...Y)-yp,Math.max(...Y)+yp);const ys=figAxisLin(ylo,yhi,5);
  const cont=Cv&&!d.group;const legend=d.group?d.groups.map((g,i)=>({name:g.name,kind:'sym',i})):[];const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||b.xname,yTitle:o.yTitle||b.yname,legend,legendW:8,padR:(o.bubLegend&&Sz)||cont?F0(o)*6:0});const {xOf,yOf,S,a,fs,h,txt,x0,plotW,padT,plotH}=F;
  const cmin=cont?Math.min(...Cv):0,cmax=cont?Math.max(...Cv):1;const colorOf=i=>cont?figGrad(FIG_HM_SCHEMES.viridis,(Cv[i]-cmin)/((cmax-cmin)||1)):d.group?S(Math.max(0,d.groups.findIndex(g=>g.name===d.group[i]))).color:S(0).color;
  const idx=d.X.map((_,i)=>i).sort((i,j)=>(Sz?Sz[j]-Sz[i]:0));let body='',labels='';idx.forEach(i=>{const c=colorOf(i);body+=`<circle cx="${xOf(X[i])}" cy="${yOf(Y[i])}" r="${Math.max(minR,rOf(Sz?Sz[i]:1))}" fill="${c}" fill-opacity="${+o.bubAlpha}" stroke="${c}" stroke-width="${a*0.75}"/>`;if(o.bubLabels)labels+=txt(xOf(X[i]),yOf(Y[i])+h/2,d.ids[i],'middle',null,null,fs*0.75);});
  let leg='';const lx=x0+plotW+fs*1.2+(legend.length&&(o.legendPos||'right')==='right'?fs*8:0);let ly=padT+fs*0.4;
  if(cont){const gid='bubg'+Math.random().toString(36).slice(2,7);const bh=plotH*0.5;leg+=`<defs><linearGradient id="${gid}" x1="0" y1="1" x2="0" y2="0">${FIG_HM_SCHEMES.viridis.map((c,k,arr)=>`<stop offset="${k/(arr.length-1)*100}%" stop-color="${c}"/>`).join('')}</linearGradient></defs><rect x="${lx}" y="${ly}" width="${fs*0.8}" height="${bh}" fill="url(#${gid})" stroke="#000" stroke-width="${a*0.5}"/>`+txt(lx+fs*1.1,ly+h,figFmt(+cmax.toPrecision(3)),'start',null,null,fs*0.8)+txt(lx+fs*1.1,ly+bh,figFmt(+cmin.toPrecision(3)),'start',null,null,fs*0.8)+txt(lx,ly-fs*0.4,b.cname||'','start',null,null,fs*0.8);ly+=bh+fs*1.6;}
  if(o.bubLegend&&Sz){const mid=Math.sqrt(smin*smax);const vals=[smin,mid,smax];leg+=txt(lx,ly+h,b.sname||'Size','start',null,null,fs*0.8);let cy=ly+fs*1.2+rOf(smax);vals.slice().reverse().forEach(v=>{const r=Math.max(minR,rOf(v));leg+=`<circle cx="${lx+rOf(smax)}" cy="${cy}" r="${r}" fill="none" stroke="#000" stroke-width="${a*0.6}"/>`+txt(lx+rOf(smax)*2+fs*0.4,cy+h/2,figFmt(+v.toPrecision(4)),'start',null,null,fs*0.8);cy+=r*2+fs*0.5;});}
  const r=F.wrap(`<g data-sel="series:0">${body}</g>${labels?`<g data-sel="text">${labels}</g>`:''}${leg?`<g data-sel="legend2">${leg}</g>`:''}`);r.res={n:d.X.length,size:Sz?{min:smin,mid:Math.sqrt(smin*smax),max:smax}:null,cont};return r;}

// PCA（multi）: スコア／バイプロット／スクリー／寄与率
function figRenderPCA(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const t=spec.type;if(d.X.length<3||d.vars.length<2)return {svg:'',w:0,h:0};
  const pca=figPCA(d.X,!!o.pcaScale,t==='pca-scree'&&o.pcaPA?(+o.pcaNPA||100):0);const k=pca.values.length;const pc=(i)=>`PC${i} (${(pca.prop[i-1]*100).toFixed(1)}%)`;
  if(t==='pca-scree'||t==='pca-variance'){const xs={lo:0,hi:k,cat:true,ticks:pca.values.map((_,i)=>({v:i+0.5,l:'PC'+(i+1)}))};const scree=t==='pca-scree';const yv=scree?pca.values.concat(pca.pa?pca.pa.map(p=>p.p95):[]):[100];const [ylo,yhi]=figYRange(o,0,scree?Math.max(...yv)*1.1:100);const ys=figAxisLin(ylo,yhi,5);
    const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||'Principal component',yTitle:o.yTitle||(scree?'Eigenvalue':'Proportion of variance (%)'),legend:scree&&pca.pa?[{name:'Eigenvalue',kind:'sym',i:0},{name:'Parallel analysis',kind:'line',i:1}]:(!scree&&o.pcaCum?[{name:'Individual',kind:'rect',i:0},{name:'Cumulative',kind:'sym',i:1}]:[]),legendW:scree&&pca.pa?10:8});const {xOf,yOf,S,sym,a,fs,h,txt}=F;let body='';
    if(scree){if(pca.pa){const up=pca.pa.map((p,i)=>`${xOf(i+0.5)},${yOf(p.p95)}`),lo=pca.pa.slice().reverse().map((p,i)=>`${xOf(k-1-i+0.5)},${yOf(p.p5)}`);body+=`<polygon points="${up.concat(lo).join(' ')}" fill="${S(1).color}" fill-opacity="0.15"/><polyline points="${pca.pa.map((p,i)=>`${xOf(i+0.5)},${yOf(p.mean)}`).join(' ')}" fill="none" stroke="${S(1).color}" stroke-width="${a}" stroke-dasharray="${F.dash}"/>`;}
      body+=`<polyline points="${pca.values.map((v,i)=>`${xOf(i+0.5)},${yOf(v)}`).join(' ')}" fill="none" stroke="${S(0).color}" stroke-width="${S(0).lineW*FIG_PT}"/>`;pca.values.forEach((v,i)=>{body+=sym(xOf(i+0.5),yOf(v),0,S(0).color,S(0).fill);});if(1>=ys.lo&&1<=ys.hi&&o.pcaScale)body+=`<line x1="${F.x0}" y1="${yOf(1)}" x2="${F.x0+F.plotW}" y2="${yOf(1)}" stroke="#999" stroke-width="${a*0.5}" stroke-dasharray="${F.dash}"/>`;}
    else{const bw=(xOf(1)-xOf(0))*0.6;let cum=0;const cp=[];pca.prop.forEach((p,i)=>{const v=p*100;cum+=v;cp.push(cum);body+=`<rect x="${xOf(i+0.5)-bw/2}" y="${yOf(v)}" width="${bw}" height="${yOf(0)-yOf(v)}" fill="${S(0).color}" fill-opacity="${+o.fillAlpha}" stroke="${S(0).color}" stroke-width="${a}"/>`+txt(xOf(i+0.5),yOf(v)-fs*0.3,v.toFixed(1)+'%','middle',null,null,fs*0.7);});
      if(o.pcaCum){body+=`<polyline points="${cp.map((v,i)=>`${xOf(i+0.5)},${yOf(Math.min(100,v))}`).join(' ')}" fill="none" stroke="${S(1).color}" stroke-width="${S(1).lineW*FIG_PT}"/>`;cp.forEach((v,i)=>{body+=sym(xOf(i+0.5),yOf(Math.min(100,v)),1,S(1).color,S(1).fill);});}}
    const r=F.wrap(`<g data-sel="series:0">${body}</g>`);r.res={pca};return r;}
  const ax=Math.min(k,Math.max(1,+o.pcaX||1))-1,ay=Math.min(k,Math.max(1,+o.pcaY||2))-1;const sx=pca.scores.map(s=>s[ax]),sy=pca.scores.map(s=>s[ay]);const bip=t==='pca-biplot';
  let lx=[],ly=[],scl=1;if(bip){const L=pca.loadings;const lxr=L[ax].map(v=>v),lyr=L[ay].map(v=>v);const mxS=Math.max(Math.max(...sx.map(Math.abs)),1e-9),myS=Math.max(Math.max(...sy.map(Math.abs)),1e-9);const mxL=Math.max(...lxr.map(Math.abs),1e-9),myL=Math.max(...lyr.map(Math.abs),1e-9);scl=0.9*Math.min(mxS/mxL,myS/myL);lx=lxr.map(v=>v*scl);ly=lyr.map(v=>v*scl);}
  const allX=sx.concat(lx),allY=sy.concat(ly);if(o.pcaEllipse&&d.group&&!bip)d.groups.forEach((g,k2)=>{const pts=sx.map((x,i)=>d.group[i]===g.name?[x,sy[i]]:null).filter(Boolean);const e=figEllipse(pts);if(e){allX.push(e.cx-e.bx,e.cx+e.bx);allY.push(e.cy-e.by,e.cy+e.by);}});const xr=Math.max(...allX.map(Math.abs))*1.1||1,yr=Math.max(...allY.map(Math.abs))*1.1||1;const xs=figAxisLin(-xr,xr,5),ys=figAxisLin(-yr,yr,5);
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||pc(ax+1),yTitle:o.yTitle||pc(ay+1),legend:d.group?d.groups.map((g,i)=>({name:g.name,kind:'sym',i})):[],wIn:figDefSize(spec,'wIn')?3:0,hIn:figDefSize(spec,'hIn')?3:0});const {xOf,yOf,S,sym,a,fs,h,txt}=F;
  let body=`<line x1="${xOf(0)}" y1="${F.padT}" x2="${xOf(0)}" y2="${F.y0}" stroke="#bbb" stroke-width="${a*0.5}" stroke-dasharray="${F.dash}"/><line x1="${F.x0}" y1="${yOf(0)}" x2="${F.x0+F.plotW}" y2="${yOf(0)}" stroke="#bbb" stroke-width="${a*0.5}" stroke-dasharray="${F.dash}"/>`;
  const gi=i=>d.group?Math.max(0,d.groups.findIndex(g=>g.name===d.group[i])):0;const ell=[];if(o.pcaEllipse&&d.group&&!bip)d.groups.forEach((g,k2)=>{const pts=sx.map((x,i)=>gi(i)===k2?[x,sy[i]]:null).filter(Boolean);const e=figEllipse(pts);if(e){const N=72;const ps=[];for(let q=0;q<=N;q++){const th=q/N*2*Math.PI;const ex=e.a*Math.cos(th),ey=e.b*Math.sin(th);const px=e.cx+ex*Math.cos(e.ang)-ey*Math.sin(e.ang),py=e.cy+ex*Math.sin(e.ang)+ey*Math.cos(e.ang);ps.push(`${xOf(px)},${yOf(py)}`);}ell.push(`<polygon points="${ps.join(' ')}" fill="${S(k2).color}" fill-opacity="0.1" stroke="${S(k2).color}" stroke-width="${a*0.75}" stroke-dasharray="${F.dash}"/>`);}});
  const series=(d.group?d.groups:[{name:''}]).map(()=>'');let labels='';sx.forEach((x,i)=>{const g=gi(i);const so=S(g);series[g]+=sym(xOf(x),yOf(sy[i]),g,so.color,so.fill);if(o.pcaLabels)labels+=txt(xOf(x)+fs*0.5,yOf(sy[i])-fs*0.3,d.ids[i],'start',null,null,fs*0.7);});
  let arrows='';if(bip){const mk='pcaArr'+Math.random().toString(36).slice(2,6);arrows+=`<defs><marker id="${mk}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0L6,3L0,6z" fill="#000"/></marker></defs>`;d.vars.forEach((v,j)=>{const x2=xOf(lx[j]),y2=yOf(ly[j]);arrows+=`<line x1="${xOf(0)}" y1="${yOf(0)}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${a}" marker-end="url(#${mk})"/>`+txt(x2+(lx[j]>=0?fs*0.4:-fs*0.4),y2+(ly[j]>=0?-fs*0.3:fs*0.9),v,lx[j]>=0?'start':'end',null,null,fs*0.8);});}
  const r=F.wrap(body+ell.join('')+series.map((s,i)=>`<g data-sel="series:${i}">${s}</g>`).join('')+(arrows?`<g data-sel="loadings">${arrows}</g>`:'')+(labels?`<g data-sel="text">${labels}</g>`:''));r.res={pca,ax,ay,scl};return r;}

// 入れ子散布（nested: 反復の小さな点＋個体平均の大きな記号＋個体平均の平均 ± 誤差。検定は個体平均で）
function figRenderSuper(spec){const d=spec.data;const gs=d.groups.filter(g=>g.values.length);const n=gs.length;if(!n)return {svg:'',w:0,h:0};const o=Object.assign({},FIG_DEF,spec.opts||{});
  const all=gs.flatMap(g=>g.values);let lo=Math.min(...all),hi=Math.max(...all);if(lo>0&&lo<(hi-lo)*0.3)lo=0;const cmpGroups=gs.map(g=>({name:g.name,values:g.means}));const cmp=spec.cmp&&spec.cmp!=='none'?figCompare(cmpGroups,spec.cmp,spec.ctrl):null;const pairs=cmp?cmp.pairs:[];const nLv=figNLevels(pairs,o);const head=nLv?0.14+0.16*nLv:0.08;
  const [ylo,yhi]=figYRange(o,lo,hi+(hi-lo)*head);const ys=figAxisLin(ylo,yhi,5);const xs={lo:0,hi:n,cat:true,ticks:gs.map((g,i)=>({v:i+0.5,l:g.name}))};
  const maxSub=Math.max(...gs.map(g=>g.subjects.length));const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle,yTitle:o.yTitle||d.vname,legend:o.spSubject&&maxSub<=8?gs[0].subjects.map((s,i)=>({name:`${d.sname} ${i+1}`,kind:'sym',i,color:'#000',fill:'solid',shape:FIG_SYMBOLS[i%FIG_SYMBOLS.length][0]})):[]});const {xOf,yOf,S,a,fs}=F;const bw=(xOf(1)-xOf(0))*0.6;
  let body='';const centers=[];gs.forEach((g,i)=>{const so=S(i),c=so.color;const cx=xOf(i+0.5);let s='';
    if(o.spSmall){const vals=[],subj=[];g.subjects.forEach((sb,k)=>sb.values.forEach(v=>{vals.push(v);subj.push(k);}));const r=so.symPt*FIG_PT*0.3;const pos=figArrangeDots(vals,yOf,r,bw*0.9);vals.forEach((v,k)=>{s+=figSymbol(cx+pos[k].dx,pos[k].y,r,'circle',c+'66','none');});}
    if(o.spSubject){const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(g.means,yOf,r,bw*0.9);g.means.forEach((m,k)=>{s+=figSymbol(cx+pos[k].dx,pos[k].y,r,FIG_SYMBOLS[k%FIG_SYMBOLS.length][0],c,'#000');});}
    const e=figErr(g.means,o.spErr);const lw=bw*0.5;s+=`<line x1="${cx-lw/2}" y1="${yOf(e.m)}" x2="${cx+lw/2}" y2="${yOf(e.m)}" stroke="#000" stroke-width="${a*2}"/>`+figErrBarP3(F,cx,e.m,e.e,bw,'#000');body+=`<g data-sel="series:${i}">${s}</g>`;centers.push({cx,top:yOf(Math.max(...g.values))});});
  const br=figBracketsMore(pairs,centers,F);const r=F.wrap(body+(br.svg?`<g data-sel="brackets">${br.svg}</g>`:''));r.res={cmp,nsub:gs.map(g=>g.subjects.length)};return r;}

// スイマー（swimmer: 患者ごとの横棒、効果で色分け、イベントの記号、継続中の矢印）
function figRenderSwimmer(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});let items=d.items.slice();if(o.swSort==='duration')items.sort((p,q)=>(q.end-q.start)-(p.end-p.start));else if(o.swSort==='group'){const gi=it=>d.groups.findIndex(g=>g.name===it.group);items.sort((p,q)=>gi(p)-gi(q)||(q.end-q.start)-(p.end-p.start));}const n=items.length;if(!n)return {svg:'',w:0,h:0};
  const tmax=Math.max(...items.map(it=>Math.max(it.end,...it.events.map(e=>e.t))));const xs=figAxisLin(0,tmax*1.1||1,6);xs.lo=Math.min(0,Math.min(...items.map(it=>it.start)));const ys={lo:0,hi:n,cat:true,ticks:items.map((it,i)=>({v:n-i-0.5,l:it.id}))};
  const evShapes=['diamond','circle','square','triangle-down','plus','cross'];const legend=d.groups.map((g,i)=>({name:g.name,kind:'rect',i,color:(o.series&&o.series[i]&&o.series[i].color)||FIG_RESP_COLORS[g.name.toUpperCase()]||FIG_DEF.colors[i%FIG_DEF.colors.length]})).concat(o.swEvents?d.eventNames.map((e,k)=>({name:e,kind:'sym',i:k,color:'#000',fill:'solid',shape:evShapes[k%evShapes.length]})):[]).concat(o.swArrow&&items.some(it=>it.ongoing)?[{name:'Ongoing',kind:'line',i:0,color:'#000'}]:[]);
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||(d.tname+(o.swUnit?` (${o.swUnit})`:'')),yTitle:o.yTitle,legend,legendW:9,hIn:figDefSize(spec,'hIn')?Math.max(1.2,n*0.22):0,padL:Math.max(0,Math.max(...items.map(it=>String(it.id).length))*F0(o)*0.55-F0(o)*1.6),xAxisAt:null});const {xOf,yOf,S,a,fs,h,txt}=F;const rowH=yOf(0)-yOf(1),bh=rowH*0.6;
  let bars='',evs='';items.forEach((it,i)=>{const cy=yOf(n-i-0.5);const gi=d.groups.findIndex(g=>g.name===it.group);const c=gi>=0?legend[gi].color:'#888';const x1=xOf(it.start),x2=xOf(it.end);bars+=`<rect x="${x1}" y="${cy-bh/2}" width="${Math.max(0.5,x2-x1)}" height="${bh}" fill="${c}" fill-opacity="${+o.fillAlpha}" stroke="${o.barEdge==='black'?'#000':c}" stroke-width="${a*0.5}"/>`;
    if(o.swArrow&&it.ongoing){const ax=x2+fs*0.15,al=fs*0.9;bars+=`<line x1="${ax}" y1="${cy}" x2="${ax+al}" y2="${cy}" stroke="#000" stroke-width="${a*1.2}"/><polygon points="${ax+al-bh*0.35},${cy-bh*0.3} ${ax+al},${cy} ${ax+al-bh*0.35},${cy+bh*0.3}" fill="#000"/>`;}
    if(o.swEvents)it.events.forEach(e=>{evs+=figSymbol(xOf(e.t),cy,fs*0.28,evShapes[e.k%evShapes.length],'#000','#000');});});
  const r=F.wrap(`<g data-sel="series:0">${bars}</g><g data-sel="events">${evs}</g>`);r.res={n,median:median(items.map(it=>it.end-it.start)),ongoing:items.filter(it=>it.ongoing).length,groups:d.groups.map(g=>({name:g.name,n:items.filter(it=>it.group===g.name).length}))};return r;}

// スパイダー（spider: 患者ごとの腫瘍径変化率の折れ線、+20%/−30% の線）
function figRenderSpider(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const pats=d.patients.filter(p=>p.pts.length);if(!pats.length)return {svg:'',w:0,h:0};
  const allT=pats.flatMap(p=>p.pts.map(q=>q[0])),allV=pats.flatMap(p=>p.pts.map(q=>q[1]));const xs=figAxisLin(Math.min(0,...allT),Math.max(...allT)*1.04||1,6);const [ylo,yhi]=figYRange(o,Math.min(-40,Math.min(...allV)*1.1),Math.max(30,Math.max(...allV)*1.1));const ys=figAxisLin(ylo,yhi,6);
  const best=p=>{const m=Math.min(...p.pts.map(q=>q[1]));return m<=-30?'PR':Math.max(...p.pts.map(q=>q[1]))>=20?'PD':'SD';};const mode=o.sdColor;const cats=mode==='best'?['PR','SD','PD'].filter(c=>pats.some(p=>best(p)===c)):mode==='group'&&d.groups.length?d.groups.map(g=>g.name):[];
  const colorOf=(p,i)=>mode==='patient'||!cats.length?FIG_DEF.colors[i%FIG_DEF.colors.length]:mode==='best'?FIG_RESP_COLORS[best(p)]:figSeriesOpt(o,Math.max(0,cats.indexOf(p.group))).color;
  const legend=cats.map((c,i)=>({name:c,kind:'line',i,color:mode==='best'?FIG_RESP_COLORS[c]:figSeriesOpt(o,i).color}));
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||d.tname,yTitle:o.yTitle||'Change from baseline (%)',legend,xAxisAt:ys.lo<0&&ys.hi>0?0:null});const {xOf,yOf,a,fs,dash,x0,plotW}=F;
  let lines='';if(o.sdLines)for(const v of [20,-30])if(v>ys.lo&&v<ys.hi)lines+=`<line x1="${x0}" y1="${yOf(v)}" x2="${x0+plotW}" y2="${yOf(v)}" stroke="#444" stroke-width="${a*0.75}" stroke-dasharray="${dash}"/>`;
  let body='';pats.forEach((p,i)=>{const c=colorOf(p,i);const pts=p.pts.map(q=>`${xOf(q[0])},${yOf(q[1])}`);body+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="${(+o.linePt||1)*FIG_PT}" stroke-linejoin="round"/>`;if(o.sdEnd){const l=p.pts[p.pts.length-1];body+=figSymbol(xOf(l[0]),yOf(l[1]),fs*0.22,'circle',c,c);}});
  const r=F.wrap(lines+`<g data-sel="series:0">${body}</g>`);const cnt={PR:0,SD:0,PD:0};pats.forEach(p=>cnt[best(p)]++);r.res={n:pats.length,cnt};return r;}

// 混同行列（heatmap の type confusion: 行＝実際、列＝予測、件数と %）
function figRenderConfusion(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const m=d.m.map(r=>r.map(v=>v===null?0:v));const R=d.rows.length,C=d.cols.length;if(!R||!C)return {svg:'',w:0,h:0};const st=figStyle(spec);const {fs,h,a,ac,txt}=st;
  const cell=Math.max(fs*2.6,Math.min(fs*4.5,(+o.wIn||3)*FIG_IN/Math.max(R,C)));const labW=Math.max(...d.rows.map(s=>String(s).length))*fs*0.55+fs*0.6;const padL=labW+fs*2.2,padT=fs*(spec.title?2.4:0.8)+fs*2.4,W=padL+C*cell+fs*1.2,H=padT+R*cell+fs*0.8;
  const stats=figCMStats(m);const mx=Math.max(...m.flat(),1);const sc=FIG_HM_SCHEMES[o.cmScheme]||FIG_HM_SCHEMES.wb;let cells='',texts='';
  m.forEach((row,i)=>row.forEach((v,j)=>{const x=padL+j*cell,y=padT+i*cell;const col=figGrad(sc,v/mx);cells+=`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${col}" stroke="#fff" stroke-width="${a}"/>`;
    if(o.cmValues){const fc=figDark(col)?'#fff':'#000';const pct=o.cmNorm==='row'?(stats.rs[i]?v/stats.rs[i]*100:0):o.cmNorm==='col'?(stats.cs[j]?v/stats.cs[j]*100:0):null;texts+=txt(x+cell/2,y+cell/2+(pct!=null?-fs*0.15:h/2),figFmt(v),'middle',`fill="${fc}"`,null,fs*(pct!=null?0.95:1.1));if(pct!=null)texts+=txt(x+cell/2,y+cell/2+fs*0.95,pct.toFixed(1)+'%','middle',`fill="${fc}"`,null,fs*0.75);}}));
  let labels='';d.rows.forEach((s,i)=>{labels+=txt(padL-fs*0.4,padT+i*cell+cell/2+h/2,s,'end');});d.cols.forEach((s,j)=>{labels+=txt(padL+j*cell+cell/2,padT-fs*0.4,s,'middle');});
  labels+=txt(padL+C*cell/2,padT-fs*1.6,'Predicted','middle')+txt(padL-labW-fs*1.2,padT+R*cell/2,'Actual','middle',`transform="rotate(-90 ${padL-labW-fs*1.2} ${padT+R*cell/2})"`);
  const title=spec.title?txt(W/2,fs*1.4,spec.title,'middle','','title'):'';
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><g data-sel="series:0">${cells}</g><g data-sel="text">${texts}</g><g data-sel="axes">${labels}</g>${title}</svg>`,w:W,h:H,res:{stats}};}

// ボルケーノ／MA（feature）
function figRenderVolcano(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const ma=spec.type==='ma';const items=d.items.filter(it=>!ma||it.base!==null);if(!items.length)return {svg:'',w:0,h:0};
  const fcT=+o.volFC||0,pT=+o.volP||0.05;const useQ=!!o.volQ;const pv=it=>useQ&&it.q!=null?it.q:it.p;const cls=it=>(pv(it)<pT&&Math.abs(it.fc)>=fcT)?(it.fc>0?'up':'down'):'ns';const col={up:'#D62728',down:'#1F77B4',ns:'#BBBBBB'};
  const X=items.map(it=>ma?Math.log2(Math.max(it.base,1e-9)):it.fc),Y=items.map(it=>ma?it.fc:-Math.log10(Math.max(pv(it),1e-300)));
  let xs,ys;if(ma){xs=figAxisLin(Math.min(...X),Math.max(...X),6);const yr=Math.max(...Y.map(Math.abs))*1.08||1;ys=figAxisLin(-yr,yr,5);}else{const xr=Math.max(...X.map(Math.abs),fcT)*1.08||1;xs=figAxisLin(-xr,xr,6);const [ylo,yhi]=figYRange(o,0,Math.max(...Y,-Math.log10(pT))*1.08||1);ys=figAxisLin(ylo,yhi,5);}
  const legend=[{name:`Up (${items.filter(it=>cls(it)==='up').length})`,kind:'sym',i:0,color:col.up,fill:'solid'},{name:`Down (${items.filter(it=>cls(it)==='down').length})`,kind:'sym',i:0,color:col.down,fill:'solid'},{name:'NS',kind:'sym',i:0,color:col.ns,fill:'solid'}];
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||(ma?`log2 ${d.bname||'mean expression'}`:(d.fcname||'log2 fold change')),yTitle:o.yTitle||(ma?(d.fcname||'log2 fold change'):`−log10 ${useQ?d.qname:(d.pname||'P')}`),legend:o.volCounts?legend:[],legendW:6.5,xAxisAt:ma?null:undefined});const {xOf,yOf,a,fs,h,txt,dash,x0,plotW,padT,y0}=F;
  let lines='';if(o.volLines){if(!ma){if(fcT>0)for(const v of [-fcT,fcT])lines+=`<line x1="${xOf(v)}" y1="${padT}" x2="${xOf(v)}" y2="${y0}" stroke="#666" stroke-width="${a*0.6}" stroke-dasharray="${dash}"/>`;const yp=-Math.log10(pT);if(yp>ys.lo&&yp<ys.hi)lines+=`<line x1="${x0}" y1="${yOf(yp)}" x2="${x0+plotW}" y2="${yOf(yp)}" stroke="#666" stroke-width="${a*0.6}" stroke-dasharray="${dash}"/>`;}else{for(const v of (fcT>0?[-fcT,0,fcT]:[0]))lines+=`<line x1="${x0}" y1="${yOf(v)}" x2="${x0+plotW}" y2="${yOf(v)}" stroke="#666" stroke-width="${a*0.6}" stroke-dasharray="${v?dash:'none'}"/>`;}}
  const r0=Math.max(1.2,Math.min(3,FIG_PT*3*Math.sqrt(300/Math.max(items.length,30))));let ns='',sig='';items.forEach((it,i)=>{const c=cls(it);const s=`<circle cx="${xOf(X[i])}" cy="${yOf(Y[i])}" r="${r0}" fill="${col[c]}" fill-opacity="${c==='ns'?0.6:0.85}"/>`;if(c==='ns')ns+=s;else sig+=s;});
  let labels='';const nl=+o.volLabels||0;if(nl>0){const cand=items.map((it,i)=>({it,i})).filter(x=>cls(x.it)!=='ns').sort((p,q)=>pv(p.it)-pv(q.it)).slice(0,nl);const placed=[];cand.forEach(({it,i})=>{let x=xOf(X[i])+fs*0.4,y=yOf(Y[i])-fs*0.2;const anchor=X[i]>=0||ma?'start':'end';if(anchor==='end')x=xOf(X[i])-fs*0.4;for(let k=0;k<12&&placed.some(p=>Math.abs(p.y-y)<fs*0.9&&Math.abs(p.x-x)<fs*4);k++)y-=fs*0.9;placed.push({x,y});labels+=txt(x,y,it.name,anchor,null,null,fs*0.7);});}
  const r=F.wrap(lines+`<g data-sel="series:0">${ns}${sig}</g>`+(labels?`<g data-sel="text">${labels}</g>`:''));r.res={n:items.length,up:items.filter(it=>cls(it)==='up').length,down:items.filter(it=>cls(it)==='down').length,fcT,pT,useQ,top:items.slice().sort((p,q)=>pv(p)-pv(q)).slice(0,10)};return r;}

// 特徴量重要度（importance: 横棒を大きい順）
function figRenderImportance(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});let items=d.items.slice();if(o.impSort!=='input')items.sort((p,q)=>q.v-p.v);const nTop=o.impN!==''&&+o.impN>0?+o.impN:items.length;items=items.slice(0,nTop);const n=items.length;if(!n)return {svg:'',w:0,h:0};
  const xv=items.flatMap(it=>[it.v+(o.impErr&&it.e?it.e:0),it.v-(o.impErr&&it.e?it.e:0)]);const xs=figAxisLin(Math.min(0,...xv),Math.max(0,...xv)*1.05||1,5);const ys={lo:0,hi:n,cat:true,ticks:items.map((it,i)=>({v:n-i-0.5,l:it.name}))};
  const labW=Math.max(...items.map(it=>String(it.name).length))*F0(o)*0.55;const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||d.vname,padL:Math.max(0,labW-F0(o)*1.6),hIn:figDefSize(spec,'hIn')?Math.max(1.2,n*0.25):0});const {xOf,yOf,S,a}=F;const bh=(yOf(0)-yOf(1))*0.65;const c=S(0).color;
  let body='';items.forEach((it,i)=>{const cy=yOf(n-i-0.5);const x1=xOf(Math.min(0,it.v)),x2=xOf(Math.max(0,it.v));body+=`<rect x="${x1}" y="${cy-bh/2}" width="${Math.max(0.5,x2-x1)}" height="${bh}" fill="${c}" fill-opacity="${+o.fillAlpha}" stroke="${o.barEdge==='black'?'#000':c}" stroke-width="${a*0.75}"/>`;if(o.impErr&&it.e){const ex=xOf(it.v);body+=`<line x1="${xOf(it.v-it.e)}" y1="${cy}" x2="${xOf(it.v+it.e)}" y2="${cy}" stroke="#000" stroke-width="${a}"/><line x1="${xOf(it.v-it.e)}" y1="${cy-bh*0.25}" x2="${xOf(it.v-it.e)}" y2="${cy+bh*0.25}" stroke="#000" stroke-width="${a}"/><line x1="${xOf(it.v+it.e)}" y1="${cy-bh*0.25}" x2="${xOf(it.v+it.e)}" y2="${cy+bh*0.25}" stroke="#000" stroke-width="${a}"/>`;}});
  const r=F.wrap(`<g data-sel="series:0">${body}</g>`);r.res={n,total:d.items.length};return r;}

/* ---------- 左下の結果表 ---------- */
function figStatsP3(data,st){if(!data)return null;if(typeof figStatsP4==='function'){const h=figStatsP4(data,st);if(h!=null)return h;}const res=st.res||{};const t=st.type;const P=p=>!(p>=0)?'–':p<0.0001?'<0.0001':p.toFixed(4);const esc=figEsc;const f3=v=>isFinite(v)?figFmt(+v.toPrecision(4)):'–';
  if(data.kind==='multi'){if(/^pca/.test(t)){const pca=res.pca;if(!pca)return '<div class="hint">PCA には 3 行以上・2 変数以上が必要です</div>';let s=`<div class="hint">PCA（${pca.scale?'標準化・相関行列':'中心化のみ・共分散行列'}）: n = ${pca.n}、変数 ${pca.p}${pca.pa?' ／ Parallel analysis（同じ n・変数数の正規乱数 '+(st.opts.pcaNPA||100)+' 回。帯は 5–95 パーセンタイル、破線は平均。固有値が帯を上回る成分を採用）':''}</div><table><tr><th>PC</th><th>固有値</th><th>寄与率</th><th>累積</th>${pca.pa?'<th>PA 平均</th><th>PA 95%</th>':''}</tr>`;let cum=0;pca.values.forEach((v,i)=>{cum+=pca.prop[i];s+=`<tr><td>PC${i+1}</td><td>${v.toFixed(4)}</td><td>${(pca.prop[i]*100).toFixed(2)}%</td><td>${(cum*100).toFixed(2)}%</td>${pca.pa?`<td>${pca.pa[i].mean.toFixed(3)}</td><td>${pca.pa[i].p95.toFixed(3)}</td>`:''}</tr>`;});s+='</table>';
      const show=Math.min(pca.p,3);s+=`<table><tr><th>ローディング</th>${Array.from({length:show},(_,k)=>`<th>PC${k+1}</th>`).join('')}</tr>`+data.vars.map((v,j)=>`<tr><td>${esc(v)}</td>${Array.from({length:show},(_,k)=>`<td>${pca.loadings[k][j].toFixed(3)}</td>`).join('')}</tr>`).join('')+'</table>';if(res.scl)s+=`<div class="hint">バイプロットのローディングは ${res.scl.toFixed(2)} 倍（スコアの 90% に収める）</div>`;return s;}
    return `<div class="hint">n = ${res.n||data.X.length}${res.size?` ／ 大きさ（面積比例）: 最小 ${f3(res.size.min)}、中間 ${f3(res.size.mid)}（幾何平均）、最大 ${f3(res.size.max)}`:''}${res.cont?' ／ 色＝'+esc(data.bubble.cname):''}${data.group?' ／ 群 '+data.groups.length:''}</div>`;}
  if(data.kind==='nested'){const c=res.cmp;let s=`<div class="hint">入れ子: 群 ${data.groups.length}、個体 ${res.nsub?res.nsub.join(' / '):''}。小さな点＝反復、記号＝個体の平均、横線＝個体平均の平均。検定は個体平均で行います（${c?esc(c.test):'比較なし'}）。</div>`;s+='<table><tr><th>群</th><th>個体</th><th>反復</th><th>平均（個体平均の）</th><th>SD</th></tr>'+data.groups.map(g=>`<tr><td>${esc(g.name)}</td><td>${g.subjects.length}</td><td>${g.values.length}</td><td>${f3(mean(g.means))}</td><td>${g.means.length>1?f3(sd(g.means)):'–'}</td></tr>`).join('')+'</table>';
    if(c&&c.pairs.length)s+='<table><tr><th>比較</th><th>P 値</th></tr>'+c.pairs.map(p=>`<tr><td>${esc(data.groups[p.a].name)} vs ${esc(data.groups[p.b].name)}</td><td>${P(p.p)}</td></tr>`).join('')+'</table>';return s;}
  if(data.kind==='swimmer'){return `<div class="hint">n = ${res.n} ／ 期間の中央値 ${f3(res.median)} ／ 継続中 ${res.ongoing}${res.groups&&res.groups.length?' ／ '+res.groups.map(g=>esc(g.name)+' '+g.n).join('、'):''}${data.eventNames.length?' ／ イベント: '+data.eventNames.map(esc).join('、'):''}</div>`;}
  if(data.kind==='spider'){const c=res.cnt||{};return `<div class="hint">n = ${res.n} ／ 最良変化で分類: PR（≤ −30%）${c.PR||0}、SD ${c.SD||0}、PD（≥ +20%）${c.PD||0}。確定効果ではなく腫瘍径の変化だけの分類です。</div>`;}
  if(data.kind==='feature'){let s=`<div class="hint">n = ${res.n} ／ しきい値 |log2FC| ≥ ${res.fcT}、${res.useQ?esc(data.qname):esc(data.pname)} < ${res.pT} ／ 上昇 ${res.up}、下降 ${res.down}${data.qname==='BH q'?' ／ q は P から BH 法で算出':''}</div>`;if(res.top&&res.top.length)s+='<table><tr><th>上位</th><th>log2FC</th><th>P</th><th>q</th></tr>'+res.top.map(it=>`<tr><td>${esc(it.name)}</td><td>${it.fc.toFixed(3)}</td><td>${figSci(it.p)}</td><td>${it.q!=null?figSci(it.q):'–'}</td></tr>`).join('')+'</table>';return s;}
  if(data.kind==='importance'){return `<div class="hint">${res.n} / ${res.total} 件を表示（${st.opts.impSort==='input'?'入力順':'大きい順'}）</div>`;}
  if(data.kind==='heatmap'&&t==='confusion'){const s0=res.stats;if(!s0)return null;let s=`<div class="hint">N = ${s0.N} ／ 正確度 ${(s0.acc*100).toFixed(1)}% ／ Cohen の κ = ${isFinite(s0.kappa)?s0.kappa.toFixed(3):'–'}</div><table><tr><th>クラス</th><th>再現率（感度）</th><th>精度（PPV）</th><th>特異度</th><th>F1</th></tr>`+data.rows.map((r,i)=>{const p=s0.per[i];const pc=v=>isFinite(v)?(v*100).toFixed(1)+'%':'–';return `<tr><td>${esc(r)}</td><td>${pc(p.recall)}</td><td>${pc(p.precision)}</td><td>${pc(p.spec)}</td><td>${isFinite(p.f1)?p.f1.toFixed(3):'–'}</td></tr>`;}).join('')+'</table>';return s;}
  if(t==='estimation'){const ds=res.diffs||[];const gs=data.groups;let s=`<div class="hint">右軸＝対照（${esc(gs[res.ctrl]?gs[res.ctrl].name:'')}）との平均差。Welch の t 検定の 95% CI。右軸の 0 は対照の平均の高さ。</div><table><tr><th>比較</th><th>平均差</th><th>95% CI</th><th>t</th><th>df</th><th>P</th></tr>`;ds.forEach((r,i)=>{if(!r)return;s+=`<tr><td>${esc(gs[i].name)} − ${esc(gs[res.ctrl].name)}</td><td>${f3(r.diff)}</td><td>${f3(r.ciLo)} – ${f3(r.ciHi)}</td><td>${r.t.toFixed(3)}</td><td>${r.df.toFixed(1)}</td><td>${P(r.p)}</td></tr>`;});return s+'</table>';}
  if(t==='qq'){const ser=res.ser||[];return '<div class="hint">X＝実測値、Y＝同じ平均・SD の正規分布から予測した値（Blom の順位統計量）。直線に乗れば正規分布に近い。</div><table><tr><th>群</th><th>n</th><th>Shapiro–Wilk W</th><th>P</th></tr>'+data.groups.filter(g=>g.values.length>=3).map((g,i)=>{const s=ser[i];return `<tr><td>${esc(g.name)}</td><td>${s?s.n:''}</td><td>${s&&s.sw?s.sw.W.toFixed(4):'–'}</td><td>${s&&s.sw?P(s.sw.p):'–'}</td></tr>`;}).join('')+'</table>';}
  if(t==='bland-altman'){if(res.n==null)return '<div class="hint">2 列（同じ行＝同じ個体）が必要です</div>';return `<div class="hint">${esc(data.groups[0].name)} − ${esc(data.groups[1].name)}${res.pct?'（平均に対する %）':''}、n = ${res.n}</div><table><tr><th></th><th>値</th><th>95% CI</th></tr><tr><td>バイアス（平均差）</td><td>${f3(res.bias)}</td><td>${f3(res.biasCI[0])} – ${f3(res.biasCI[1])}</td></tr><tr><td>SD</td><td>${f3(res.sd)}</td><td></td></tr><tr><td>下側一致限界（−1.96 SD）</td><td>${f3(res.loa[0])}</td><td>${f3(res.loaCI[0][0])} – ${f3(res.loaCI[0][1])}</td></tr><tr><td>上側一致限界（+1.96 SD）</td><td>${f3(res.loa[1])}</td><td>${f3(res.loaCI[1][0])} – ${f3(res.loaCI[1][1])}</td></tr></table>`;}
  if(t==='grouped-line'){return '<div class="hint">カテゴリごとの各群の平均を線でつなぎ、誤差棒は選んだ種類（SD/SEM/CI）。</div>';}
  if(t==='xy-band'){return `<div class="hint">各 X の反復の平均を線、平均 ± ${esc(res.err||'SD')} を帯で描いています。</div>`;}
  return null;}

/* ---------- 画面 ---------- */
document.addEventListener('DOMContentLoaded',()=>{const sel=document.querySelector('#figKind');if(sel)FIG_KINDS_P3.forEach(([v,l])=>{const op=document.createElement('option');op.value=v;op.textContent=l;sel.appendChild(op);});});
