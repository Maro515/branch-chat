// BranCHAT Figure 拡張（P3）
// 推定プロット・QQ・Bland–Altman・カテゴリ軸の折れ線・XY の誤差帯（学習曲線）・
// 多変数表（バブル、PCA: スコア／バイプロット／スクリー＋Parallel analysis／寄与率）・入れ子（SuperPlot）・
// スイマー・スパイダー・混同行列・ボルケーノ／MA・特徴量重要度（横棒）。
// figure-more.js の figAutoKindMore / figBuildDataMore / figRenderMore / figStatsMore から P3 フックで呼ばれる。
'use strict';

/* ---------- 図種の登録 ---------- */
FIG_TYPES.column.push(['estimation','推定プロット（差と 95% CI）'],['qq','QQ プロット（正規性）'],['bland-altman','Bland–Altman（2 列）'],['ecdf','累積分布（ECDF）'],['pie','円グラフ（列＝区分、値の合計）'],['donut','ドーナツ（列＝区分）']);
FIG_TYPES.grouped.push(['grouped-line','カテゴリ軸の折れ線＋誤差'],['pie','円グラフ（行＝区分）'],['donut','ドーナツ（行＝区分）']);
FIG_TYPES.xy.push(['xy-band','折れ線＋誤差の帯（学習曲線）']);
FIG_TYPES.heatmap.push(['confusion','混同行列（行＝実際、列＝予測）']);
Object.assign(FIG_TYPES,{
  multi:[['bubble','バブルプロット'],['pca-scores','PCA スコア（PC1 × PC2）'],['pca-biplot','PCA バイプロット'],['pca-scree','PCA スクリー（Parallel analysis）'],['pca-variance','PCA 寄与率']],
  nested:[['superplot','入れ子散布（SuperPlot）'],['barjitter','棒＋個別の点（点の形＝個体・副分類）']],
  swimmer:[['swimmer','スイマープロット']],
  spider:[['spider','スパイダープロット']],
  feature:[['volcano','ボルケーノ'],['ma','MA プロット'],['fcdot','効果量のドットプロット（選んだ遺伝子の log2FC）']],
  importance:[['importance','特徴量重要度（横棒）']]});
const FIG_KINDS_P3=[['multi','多変数（行＝個体、列＝変数、Group 列任意）'],['nested','入れ子（Group, Subject, Value）'],['swimmer','スイマー（Patient, Duration, Response, …）'],['spider','スパイダー（Patient, Time, Change%）'],['feature','遺伝子表（Gene, log2FC, P）'],['importance','重要度（Feature, Value）']];
const FIG_DEF_P3={estCI:true,estText:true,estErr:'SD',qqLine:true,qqText:true,baLoA:true,baText:true,baMode:'diff',glErr:true,bandAlpha:0.2,
  bubMax:28,bubLegend:true,bubLabels:false,bubAlpha:0.5,
  pcaScale:true,pcaX:1,pcaY:2,pcaLabels:false,pcaEllipse:false,pcaPA:true,pcaNPA:100,pcaCum:true,
  spSubject:true,spErr:'SD',spSmall:true,spColor:'group',
  swSort:'duration',swEvents:true,swArrow:true,swUnit:'',
  sdLines:true,sdEnd:true,sdColor:'group',pieLabels:'percent',pieStart:0,pieSort:false,
  volFC:1,volP:0.05,volQ:false,volSig:'auto',volGenes:'',volItalic:true,volNote:true,volLabels:10,volLines:true,volCounts:true,
  fdN:20,fdSort:'input',fdCap:50,bjStat:'all',bjErr:'SD',bjPt:'group',
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
  superplot:[{k:'spColor',t:'select',l:'色分け',o:[['group','群ごと'],['subject','個体（実験）ごと']]},{k:'spSmall',t:'check',l:'反復の点を描く'},{k:'spSubject',t:'check',l:'個体の平均を大きな記号で'},{k:'spErr',t:'select',l:'誤差（個体平均の）',o:[['SD','SD'],['SEM','SEM'],['CI','95% CI'],['none','なし']]}],
  swimmer:[{k:'swSort',t:'select',l:'並べ方',o:[['duration','期間の長い順'],['input','入力順'],['group','群ごと']]},{k:'swEvents',t:'check',l:'イベントの記号'},{k:'swArrow',t:'check',l:'継続中の矢印'},{k:'swUnit',t:'text',l:'横軸の単位（例: Months）'}],
  spider:[{k:'sdLines',t:'check',l:'+20% / −30% の線'},{k:'sdEnd',t:'check',l:'最終点に記号'},{k:'sdColor',t:'select',l:'線の色',o:[['group','群ごと'],['patient','患者ごと'],['best','最良効果（PD/SD/PR）']]}],
  pie:[{k:'pieLabels',t:'select',l:'区分の文字',o:[['percent','%'],['value','値'],['both','値と %'],['none','なし']]},{k:'pieSort',t:'check',l:'大きい順に並べる'}],
  donut:[{k:'pieLabels',t:'select',l:'区分の文字',o:[['percent','%'],['value','値'],['both','値と %'],['none','なし']]},{k:'pieSort',t:'check',l:'大きい順に並べる'}],
  confusion:[{k:'cmNorm',t:'select',l:'セルの値',o:[['none','件数'],['row','件数と行の %（再現率）'],['col','件数と列の %（精度）']]},{k:'cmScheme',t:'select',l:'色',o:[['wb','白–青'],['wr','白–赤'],['gray','白–黒'],['viridis','Viridis']]},{k:'cmValues',t:'check',l:'セルに値を書く'}],
  volcano:[{k:'volFC',t:'select',l:'|log2FC| のしきい値',o:[['0.585','0.585（1.5 倍）'],['1','1（2 倍）'],['2','2（4 倍）'],['0','なし']]},{k:'volP',t:'select',l:'P のしきい値',o:[['0.05','0.05'],['0.01','0.01'],['0.001','0.001']]},{k:'volSig',t:'select',l:'判定に使う値',o:[['auto','自動（q・FDR の列があればそれ、無ければ P）'],['p','P 値'],['q','表の q（FDR）の列'],['bh','P から BH 法で計算し直す']]},{k:'volLabels',t:'select',l:'名前を書く上位 n',o:[['0','なし'],['5','5'],['10','10'],['20','20']]},{k:'volGenes',t:'text',l:'ラベルする名前（カンマ区切り。例: MS4A1, SPIB, SPI1）'},{k:'volItalic',t:'check',l:'名前を斜体に（遺伝子名の慣例）'},{k:'volLines',t:'check',l:'しきい値の線'},{k:'volCounts',t:'check',l:'上昇・下降の数を書く'},{k:'volNote',t:'check',l:'P = 0 を丸めた件数を図に書く'}],
  ma:[{k:'volFC',t:'select',l:'|log2FC| のしきい値',o:[['0.585','0.585'],['1','1'],['2','2'],['0','なし']]},{k:'volP',t:'select',l:'P のしきい値',o:[['0.05','0.05'],['0.01','0.01'],['0.001','0.001']]},{k:'volSig',t:'select',l:'判定に使う値',o:[['auto','自動（q・FDR の列があればそれ、無ければ P）'],['p','P 値'],['q','表の q（FDR）の列'],['bh','P から BH 法で計算し直す']]},{k:'volLabels',t:'select',l:'名前を書く上位 n',o:[['0','なし'],['5','5'],['10','10'],['20','20']]},{k:'volGenes',t:'text',l:'ラベルする名前（カンマ区切り。例: MS4A1, SPIB, SPI1）'},{k:'volItalic',t:'check',l:'名前を斜体に（遺伝子名の慣例）'}],
  importance:[{k:'impN',t:'text',l:'上位 n 件（空で全部）'},{k:'impSort',t:'select',l:'並べ方',o:[['desc','大きい順'],['input','入力順']]},{k:'impErr',t:'check',l:'誤差棒（Error 列）'}]});
FIG_TOOLS_MORE.fcdot=FIG_TOOLS_MORE.volcano.filter(t=>['volFC','volP','volSig','volGenes','volItalic'].includes(t.k)).concat([{k:'fdN',t:'select',l:'遺伝子を指定しないときの件数（有意な上位）',o:[['10','10'],['20','20'],['30','30'],['50','50']]},{k:'fdSort',t:'select',l:'並べ方',o:[['input','指定した順（群ごと）'],['fc','log2FC の大きい順']]},{k:'volLines',t:'check',l:'しきい値の帯と線'}]);
FIG_TOOLS_MORE.barjitter=[{k:'bjStat',t:'select',l:'棒の高さ',o:[['all','全部の値の平均'],['subject','個体ごとの平均の平均']]},{k:'bjErr',t:'select',l:'誤差',o:[['SD','SD'],['SEM','SEM'],['CI','95% CI'],['none','なし']]},{k:'bjPt',t:'select',l:'点の色',o:[['group','群の色'],['black','黒'],['open','白抜き']]},{k:'valLabels',t:'check',l:'棒の上に値（平均）を書く'}];

FIG_PROMPT+=`
さらに: column に estimation（2 群の推定プロット: 右軸に平均差と 95% CI）・qq（正規 QQ）・bland-altman（列 A, B）・ecdf（経験累積分布、生データから自動）・pie/donut（列＝区分、値の合計）、grouped に grouped-line・pie/donut（行＝区分）、xy に xy-band（反復の平均 ± 誤差の帯、学習曲線）。
kind "multi"（行＝個体、列＝変数、Group 列は文字）: type bubble（列 X, Y, Size, Color/Group 任意, Label 任意）、pca-scores・pca-biplot・pca-scree・pca-variance（数値列を変数として PCA）。
kind "nested": 列 Group, Subject（個体）, Value。type superplot か barjitter（棒＝群の平均＋誤差、点＝個々の値、点の形＝Subject。Subject に WT/OE や「既報値/再解析値」などの副分類を入れると、群をまたいで同じ形になる。style の bjStat:"all|subject"、bjErr:"SD|SEM|CI|none"、bjPt:"group|black|open"）。
kind "swimmer": 列 Patient, Duration（または Start と End）, Response/Group（任意）, Ongoing（1/0、任意）、ほかの数値列はイベントの時刻（列名がイベント名）。
kind "spider": 列 Patient, Time, Change（%）, Group（任意）。
kind "feature": 列 Gene, log2FC, P（または padj）, baseMean（任意）。type volcano か ma か fcdot（選んだ遺伝子の log2FC を横軸に並べるドットプロット。点の大きさ＝−log10 q、塗り＝有意、白抜き＝有意でない、|log2FC| のしきい値の帯。labelGenes の順に並べ、無ければ有意な上位 fdN 件。Group／Pathway などの文字の列があれば群ごとに区切り線と群名）。特定の遺伝子に名前を付けるときは最上位に "labelGenes":["MS4A1","SPIB"]（円で囲み、引き出し線つきで重ならないように置く）。判定に使う値は style の volSig: auto（q・FDR 列があればそれ）/ p / q / bh（P から BH で計算し直す）。
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
  const base=cols.find(c=>/basemean|mean|avg|expr|logcpm|aveexpr|平均/.test(lc(c))&&!figTextCol(c)&&c!==fc&&c!==p)||null;const nameC=cols.find(c=>figTextCol(c))||null;const grpC=cols.find(c=>c!==nameC&&figTextCol(c)&&/group|category|pathway|class|module|cluster|^set$|群|分類|経路|カテゴリ/.test(lc(c)))||null;
  const PMIN=1e-300;const onlyQ=!!padj&&padj===p;const hasQ=!!padj; // 補正済みの列しか無いとき（onlyQ）は、その列を q として扱い BH をかけ直さない // P が 0 や表示できないほど小さいときは 1e-300 に丸め、件数を数えて図注に書く（改善計画 3.4）
  const items=fc.vals.map((v,i)=>{const pv=p.vals[i];if(v===null||pv===null||!(pv>=0))return null;const qv=hasQ?padj.vals[i]:null;return {name:nameC?nameC.raw[i]:String(i+1),fc:v,p:Math.max(pv,PMIN),p0:pv<PMIN,qOrig:qv==null||!(qv>=0)?null:Math.max(qv,PMIN),q0:qv!=null&&qv>=0&&qv<PMIN,base:base?base.vals[i]:null,group:grpC?String(grpC.raw[i]==null?'':grpC.raw[i]).trim():''};}).filter(Boolean);if(!items.length)return null;
  const qs=onlyQ?items.map(it=>it.qOrig!=null?it.qOrig:it.p):bhFDR(items.map(it=>it.p));items.forEach((it,i)=>{it.qBH=Math.max(qs[i],PMIN);it.q=hasQ&&it.qOrig!=null?it.qOrig:it.qBH;});
  return {kind:'feature',items,onlyQ,pname:p.name,qname:hasQ?padj.name:'BH q',qcol:hasQ?padj.name:'',fcname:fc.name,bname:base?base.name:'',groups:[],p0:items.filter(it=>it.p0).length};}
function figBuildImportance(parsed){const cols=parsed.cols;const num=cols.filter(c=>c.vals.some(v=>v!==null)&&!figTextCol(c));const vC=num.find(c=>/importance|重要度|gain|shap|value|score|coef/.test(figLC(c)))||num[0];if(!vC)return null;const eC=num.find(c=>c!==vC&&/err|sd|se|std|誤差/.test(figLC(c)))||null;
  const items=vC.vals.map((v,i)=>v===null?null:({name:parsed.firstColText?parsed.rowLabels[i]:String(i+1),v,e:eC?eC.vals[i]:null})).filter(Boolean);if(!items.length)return null;return {kind:'importance',items,vname:vC.name,groups:[]};}

/* ---------- 描画 ---------- */
function figRenderP3(spec){const d=spec.data,t=spec.type;
  if(typeof figRenderP4==='function'){const r=figRenderP4(spec);if(r)return r;}
  if(d.kind==='multi')return /^pca/.test(t)?figRenderPCA(spec):figRenderBubble(spec);if(d.kind==='nested')return t==='barjitter'?figRenderBarJitter(spec):figRenderSuper(spec);if(d.kind==='swimmer')return figRenderSwimmer(spec);if(d.kind==='spider')return figRenderSpider(spec);if(d.kind==='feature')return t==='fcdot'?figRenderFcDot(spec):figRenderVolcano(spec);if(d.kind==='importance')return figRenderImportance(spec);
  if(d.kind==='heatmap'&&t==='confusion')return figRenderConfusion(spec);
  if(t==='estimation')return figRenderEstimation(spec);if(t==='pie'||t==='donut')return figRenderPie(spec);if(t==='ecdf')return figRenderECDF(spec);if(t==='qq')return figRenderQQ(spec);if(t==='bland-altman')return figRenderBA2(spec);if(t==='grouped-line')return figRenderGroupedLine(spec);if(t==='xy-band')return figRenderBand(spec);
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


// 円グラフ／ドーナツ（column: 列＝区分で値の合計、grouped: 行＝区分で群ごとに 1 つ）
function figRenderPie(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const donut=spec.type==='donut';const st=figStyle(spec);const {fs,a,txt,S}=st;
  let pies=[];if(d.kind==='grouped'){pies=d.groups.map(g=>({name:g.name,slices:d.cats.map((c,ci)=>({name:c,v:(g.cells[ci]||[]).reduce((x,y)=>x+y,0)}))}));}else{pies=[{name:'',slices:d.groups.map(g=>({name:g.name,v:g.values.reduce((x,y)=>x+y,0)}))}];}
  pies.forEach(p=>{p.slices=p.slices.filter(sl=>sl.v>0);if(o.pieSort)p.slices.sort((x,y)=>y.v-x.v);});pies=pies.filter(p=>p.slices.length);if(!pies.length)return {svg:'',w:0,h:0};
  const names=[...new Set(pies.flatMap(p=>p.slices.map(sl=>sl.name)))];const colOf=n=>S(names.indexOf(n)).color;const R=((spec.opts||{}).wIn==null?1.1:+o.wIn/2.5)*FIG_IN;const gap=fs*2;const legW=Math.max(...names.map(n=>figTW(n,fs)))+fs*2.4;
  const padT=fs*(spec.title?2.4:0.8)+(pies.length>1&&pies[0].name?fs*1.4:0);const padX=fs*(o.pieLabels==='both'?3:1.5);const W=padX+pies.length*(2*R+gap)-gap+padX+legW,H=padT+2*R+fs*1.2;let body='';
  pies.forEach((p,pi)=>{const cx=padX+pi*(2*R+gap)+R,cy=padT+R;const tot=p.slices.reduce((x,sl)=>x+sl.v,0);let ang=(+o.pieStart||0)*Math.PI/180-Math.PI/2;let s='';
    p.slices.forEach(sl=>{const da=sl.v/tot*2*Math.PI;const a1=ang,a2=ang+da;ang=a2;const r0=donut?R*0.55:0;const P=(r,t)=>`${cx+r*Math.cos(t)},${cy+r*Math.sin(t)}`;const big=da>Math.PI?1:0;
      const dpath=donut?`M${P(R,a1)} A${R},${R} 0 ${big} 1 ${P(R,a2)} L${P(r0,a2)} A${r0},${r0} 0 ${big} 0 ${P(r0,a1)} Z`:`M${cx},${cy} L${P(R,a1)} A${R},${R} 0 ${big} 1 ${P(R,a2)} Z`;s+=`<path d="${dpath}" fill="${colOf(sl.name)}" fill-opacity="${+o.fillAlpha}" stroke="#fff" stroke-width="${a}"/>`;
      if(o.pieLabels!=='none'&&da>0.12){const mid=(a1+a2)/2;const rr=donut?(R+r0)/2:R*0.62;const lab=o.pieLabels==='value'?figFmt(+sl.v.toPrecision(4)):o.pieLabels==='both'?`${figFmt(+sl.v.toPrecision(4))} (${(sl.v/tot*100).toFixed(1)}%)`:`${(sl.v/tot*100).toFixed(1)}%`;s+=txt(cx+rr*Math.cos(mid),cy+rr*Math.sin(mid)+fs*0.33,lab,'middle',`fill="${figDark(colOf(sl.name))?'#fff':'#000'}"`,null,fs*0.85);}});
    if(pies.length>1&&p.name)s+=txt(cx,padT-fs*0.5,p.name,'middle');body+=`<g data-sel="series:${pi}">${s}</g>`;});
  let leg='';const lx=W-legW+fs*0.4;names.forEach((n,k)=>{const ly=padT+fs*(k*1.5+0.8);leg+=`<rect x="${lx}" y="${ly-fs*0.55}" width="${fs*1.1}" height="${fs*0.75}" fill="${colOf(n)}"/>`+txt(lx+fs*1.5,ly,n,'start');});
  const title=figTitle1(txt,(W-legW)/2,fs*1.3,spec.title,W-fs,fs);
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${body}<g data-sel="legend">${leg}</g>${title}</svg>`,w:W,h:H,plot:{x0:fs,y0:padT,w:W-legW-fs,h:2*R},res:{pies:pies.map(p=>({name:p.name,total:p.slices.reduce((x,sl)=>x+sl.v,0),slices:p.slices}))}};}
// 累積分布（column: 群ごとの経験分布関数）
function figRenderECDF(spec){const d=spec.data;const gs=d.groups.filter(g=>g.values.length);if(!gs.length)return {svg:'',w:0,h:0};const o=Object.assign({},FIG_DEF,spec.opts||{});
  const all=gs.flatMap(g=>g.values);const pad=(Math.max(...all)-Math.min(...all))*0.05||1;const xs=figAxisLin(Math.min(...all)-pad,Math.max(...all)+pad,5);const ys={lo:0,hi:1,ticks:[0,0.25,0.5,0.75,1].map(v=>({v,l:figFmt(v)}))};
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||'Value',yTitle:o.yTitle||'Cumulative fraction',legend:gs.length>1?gs.map((g,i)=>({name:g.name,kind:'line',i})):[]});const {xOf,yOf,S}=F;
  let body='';gs.forEach((g,i)=>{const v=g.values.slice().sort((a,b)=>a-b);const n=v.length;const pts=[`${xOf(xs.lo)},${yOf(0)}`];v.forEach((x,k)=>{pts.push(`${xOf(x)},${yOf(k/n)}`);pts.push(`${xOf(x)},${yOf((k+1)/n)}`);});pts.push(`${xOf(xs.hi)},${yOf(1)}`);body+=`<g data-sel="series:${i}"><polyline points="${pts.join(' ')}" fill="none" stroke="${S(i).color}" stroke-width="${S(i).lineW*FIG_PT*1.5}"/></g>`;});
  const r=F.wrap(body);r.res={n:gs.map(g=>g.values.length),medians:gs.map(g=>median(g.values))};return r;}
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
  const maxSub=Math.max(...gs.map(g=>g.subjects.length));const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle,yTitle:o.yTitle||d.vname,legend:o.spSubject&&maxSub<=8?gs[0].subjects.map((s,i)=>({name:`${d.sname} ${i+1}`,kind:'sym',i,color:o.spColor==='subject'?FIG_PAL20[i%20]:'#000',fill:'solid',shape:FIG_SYMBOLS[i%FIG_SYMBOLS.length][0]})):[]});const {xOf,yOf,S,a,fs}=F;const bw=(xOf(1)-xOf(0))*0.6;const bySubj=o.spColor==='subject';const colOf=(gi,k)=>bySubj?FIG_PAL20[k%20]:S(gi).color;
  let body='';const centers=[];gs.forEach((g,i)=>{const so=S(i),c=so.color;const cx=xOf(i+0.5);let s='';
    if(o.spSmall){const vals=[],subj=[];g.subjects.forEach((sb,k)=>sb.values.forEach(v=>{vals.push(v);subj.push(k);}));const r=so.symPt*FIG_PT*0.3;const pos=figArrangeDots(vals,yOf,r,bw*0.9);vals.forEach((v,k)=>{s+=figSymbol(cx+pos[k].dx,pos[k].y,r,'circle',colOf(i,subj[k])+'66','none');});}
    if(o.spSubject){const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(g.means,yOf,r,bw*0.9);g.means.forEach((m,k)=>{s+=figSymbol(cx+pos[k].dx,pos[k].y,r,FIG_SYMBOLS[k%FIG_SYMBOLS.length][0],colOf(i,k),'#000');});}
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
  const title=figTitle1(txt,W/2,fs*1.4,spec.title,W-fs,fs);
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><g data-sel="series:0">${cells}</g><g data-sel="text">${texts}</g><g data-sel="axes">${labels}</g>${title}</svg>`,w:W,h:H,res:{stats}};}

// ボルケーノ／MA（feature）
// 判定に使う値（改善計画 3.4）: auto＝q・FDR の列があればそれ、無ければ P ／ p ／ q＝表の q 列（無ければ BH）／ bh＝P から BH で計算し直す。
// 以前の style.volQ（true/false）は q/p として読む
function figVolSig(spec,d){const raw=(spec&&spec.opts)||{};let m=raw.volSig||(raw.volQ===true?'q':raw.volQ===false?'p':'auto');if(m==='auto')m=d.qcol?'q':'p';if(m==='q'&&!d.qcol)m='bh';return m;}
function figVolValue(it,m){return m==='p'?it.p:m==='q'?(it.qOrig!=null?it.qOrig:it.qBH):it.qBH;}
// ラベルする名前（最上位の labelGenes 配列、または style.volGenes の文字）
function figVolGenes(spec){const o=(spec&&spec.opts)||{};let g=o.x&&Array.isArray(o.x.labelGenes)?o.x.labelGenes:null;if(!g&&o.volGenes)g=String(o.volGenes).split(/[,、\s]+/);return (g||[]).map(x=>String(x).trim()).filter(Boolean);}
// ラベルの置き場所: 点ごとに 8 方向・4 段の距離を試し、プロットの外にもほかのラベルにもかからない最初の位置（改善計画 2.2）
function figPlaceLabels(pts,F,fs,italic){const placed=[],out=[];const pad=fs*0.12;const lh=fs*0.7;
  const box=(x,y,w,anc)=>{const x0=anc==='end'?x-w:anc==='middle'?x-w/2:x;return {x0,y0:y-lh*1.26,x1:x0+w,y1:y+lh*0.5};}; // 文字の外枠（実測: 幅は見積もりの約 1.13 倍、上は基線から 1.25 字、下は 0.5 字）
  const inside=b=>b.x0>=F.x0+pad&&b.x1<=F.x0+F.plotW-pad&&b.y0>=F.padT+pad&&b.y1<=F.y0-pad;
  const hit=b=>placed.some(q=>!(b.x1+pad<q.x0||b.x0-pad>q.x1||b.y1+pad<q.y0||b.y0-pad>q.y1));
  for(const p of pts){const w=figTW(p.name,lh)*(italic?1.18:1.15);let best=null;
    for(const k of [1.2,2.2,3.4,4.8,6.5,8.5,11]){const d=fs*k;const cs=[[d*0.8,-d*0.55,'start'],[-d*0.8,-d*0.55,'end'],[d*0.8,d*0.75,'start'],[-d*0.8,d*0.75,'end'],[0,-d,'middle'],[0,d+lh*0.6,'middle'],[d*1.1,lh*0.3,'start'],[-d*1.1,lh*0.3,'end']];
      for(const [dx,dy,anc] of cs){const lx=p.x+dx,ly=p.y+dy;const bx=box(lx,ly,w,anc);if(inside(bx)&&!hit(bx)){best={lx,ly,anc,b:bx};break;}}if(best)break;}
    if(!best&&!p.ring)continue; // 上位 n のラベルは、置ける場所が無ければ描かない（指定した名前は必ず描く）
    if(!best){const anc=p.x>F.x0+F.plotW/2?'end':'start';const lx=p.x+(anc==='end'?-fs:fs),ly=Math.max(F.padT+lh,p.y-fs);best={lx,ly,anc,b:box(lx,ly,w,anc),forced:true};}
    placed.push(best.b);out.push(Object.assign({},p,best));}
  return out;}
function figRenderVolcano(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});const ma=spec.type==='ma';const items=d.items.filter(it=>!ma||it.base!==null);if(!items.length)return {svg:'',w:0,h:0};
  const fcT=+o.volFC||0,pT=+o.volP||0.05;const sig=figVolSig(spec,d);const pv=it=>figVolValue(it,sig);const cls=it=>(pv(it)<pT&&Math.abs(it.fc)>=fcT)?(it.fc>0?'up':'down'):'ns';const col={up:'#D62728',down:'#1F77B4',ns:'#BBBBBB'};
  const sigName=sig==='p'?(d.pname||'P'):sig==='q'?(d.qcol||'q'):'BH q';
  const X=items.map(it=>ma?Math.log2(Math.max(it.base,1e-9)):it.fc),Y=items.map(it=>ma?it.fc:-Math.log10(Math.max(pv(it),1e-300)));
  // 値が 0（下限未満）の点は 1e-300 にすると縦軸が 300 まで伸びてほかの点がつぶれるので、縦軸の上端に ▲ で描く（計算には 1e-300 を使う）
  const zero=it=>(sig==='q'&&it.qOrig!=null)?it.q0:it.p0;let capY=null;if(!ma&&items.some(zero)){const nz=items.map((it,i)=>zero(it)?null:Y[i]).filter(v=>v!=null);capY=(nz.length?Math.max(...nz):1)*1.1+0.3;items.forEach((it,i)=>{if(zero(it))Y[i]=capY;});}
  let xs,ys;if(ma){xs=figAxisLin(Math.min(...X),Math.max(...X),6);const yr=Math.max(...Y.map(Math.abs))*1.08||1;ys=figAxisLin(-yr,yr,5);}else{const xr=Math.max(...X.map(Math.abs),fcT)*1.08||1;xs=figAxisLin(-xr,xr,6);const [ylo,yhi]=figYRange(o,0,Math.max(...Y,-Math.log10(pT))*1.12||1);ys=figAxisLin(ylo,yhi,5);}
  const nUp=items.filter(it=>cls(it)==='up').length,nDown=items.filter(it=>cls(it)==='down').length;
  const legend=[{name:`Up (${nUp})`,kind:'sym',i:0,color:col.up,fill:'solid'},{name:`Down (${nDown})`,kind:'sym',i:0,color:col.down,fill:'solid'},{name:'NS',kind:'sym',i:0,color:col.ns,fill:'solid'}];
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||(ma?`log2 ${d.bname||'mean expression'}`:(d.fcname||'log2 fold change')),yTitle:o.yTitle||(ma?(d.fcname||'log2 fold change'):`−log10 ${sigName}`),legend:o.volCounts?legend:[],legendW:6.5,xAxisAt:ma?null:undefined});const {xOf,yOf,a,fs,txt,dash,x0,plotW,padT,y0}=F;
  let lines='';if(o.volLines){if(!ma){if(fcT>0)for(const v of [-fcT,fcT])lines+=`<line x1="${xOf(v)}" y1="${padT}" x2="${xOf(v)}" y2="${y0}" stroke="#666" stroke-width="${a*0.6}" stroke-dasharray="${dash}"/>`;const yp=-Math.log10(pT);if(yp>ys.lo&&yp<ys.hi)lines+=`<line x1="${x0}" y1="${yOf(yp)}" x2="${x0+plotW}" y2="${yOf(yp)}" stroke="#666" stroke-width="${a*0.6}" stroke-dasharray="${dash}"/>`;}else{for(const v of (fcT>0?[-fcT,0,fcT]:[0]))lines+=`<line x1="${x0}" y1="${yOf(v)}" x2="${x0+plotW}" y2="${yOf(v)}" stroke="#666" stroke-width="${a*0.6}" stroke-dasharray="${v?dash:'none'}"/>`;}}
  const r0=Math.max(1.2,Math.min(3,FIG_PT*3*Math.sqrt(300/Math.max(items.length,30))));let ns='',sg='';items.forEach((it,i)=>{const c=cls(it);const cx=xOf(X[i]),cy=yOf(Y[i]);const s=capY!=null&&zero(it)?`<path d="M${cx.toFixed(2)},${(cy-r0*1.7).toFixed(2)}L${(cx+r0*1.5).toFixed(2)},${(cy+r0).toFixed(2)}L${(cx-r0*1.5).toFixed(2)},${(cy+r0).toFixed(2)}Z" fill="${col[c]}" fill-opacity=".95"/>`:`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r0}" fill="${col[c]}" fill-opacity="${c==='ns'?0.6:0.85}"/>`;if(c==='ns')ns+=s;else sg+=s;});
  // ラベル: 指定した名前（円で囲む）を先に、上位 n を後から。全部まとめて重ならないように置く
  const want=figVolGenes(spec);const wantSet=new Set(want.map(g=>g.toLowerCase()));const pts=[];const used=new Set();const missing=[];
  want.forEach(g=>{const i=items.findIndex(it=>String(it.name).toLowerCase()===g.toLowerCase());if(i<0){missing.push(g);return;}if(used.has(i))return;used.add(i);pts.push({i,name:items[i].name,x:xOf(X[i]),y:yOf(Y[i]),ring:true});});
  const nl=+o.volLabels||0;if(nl>0)items.map((it,i)=>({it,i})).filter(x=>cls(x.it)!=='ns'&&!used.has(x.i)).sort((p,q)=>pv(p.it)-pv(q.it)).slice(0,nl).forEach(({it,i})=>{used.add(i);pts.push({i,name:it.name,x:xOf(X[i]),y:yOf(Y[i]),ring:false});});
  const italic=o.volItalic!==false;const lf=fs*0.7;const lab=figPlaceLabels(pts,F,fs,italic);let rings='',leads='',texts='';
  lab.forEach(L=>{if(L.ring)rings+=`<circle cx="${L.x.toFixed(2)}" cy="${L.y.toFixed(2)}" r="${(r0*1.9+1).toFixed(2)}" fill="none" stroke="#000" stroke-width="${a*0.8}"/>`;
    const ex=Math.min(Math.max(L.x,L.b.x0),L.b.x1),ey=Math.min(Math.max(L.y,L.b.y0),L.b.y1);const dd=Math.hypot(ex-L.x,ey-L.y);if(dd>r0*2.6){const rr=L.ring?r0*1.9+1:r0;const sx=L.x+(ex-L.x)/dd*rr,sy=L.y+(ey-L.y)/dd*rr;leads+=`<line x1="${sx.toFixed(2)}" y1="${sy.toFixed(2)}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(2)}" stroke="#333" stroke-width="${a*0.5}"/>`;}
    texts+=txt(L.lx,L.ly,L.name,L.anc,null,null,lf);});
  let note='';const n0=items.filter(zero).length;if(n0&&o.volNote!==false&&!ma)note=txt(x0+fs*0.3,y0-fs*0.35,`▲ ${sig==='p'?'P':sigName} = 0: ${n0} (at top)`,'start','fill="#555"',null,fs*0.55);
  const r=F.wrap(lines+`<g data-sel="series:0">${ns}${sg}</g>`+(lab.length?`<g data-sel="text">${rings}${leads}<g${italic?' font-style="italic"':''}>${texts}</g></g>`:'')+note);
  // BH で計算し直したときは、表の q 列による判定との違いを数える
  let diff=null;if(sig==='bh'&&d.qcol&&!d.onlyQ){const c2=it=>((it.qOrig!=null?it.qOrig:1)<pT&&Math.abs(it.fc)>=fcT)?(it.fc>0?'up':'down'):'ns';let upAdd=0,upDel=0,dnAdd=0,dnDel=0,n=0;items.forEach(it=>{const a1=c2(it),b1=cls(it);if(a1===b1)return;n++;if(b1==='up')upAdd++;if(a1==='up')upDel++;if(b1==='down')dnAdd++;if(a1==='down')dnDel++;});diff={n,upAdd,upDel,dnAdd,dnDel};}
  r.res={n:items.length,up:nUp,down:nDown,ns:items.length-nUp-nDown,fcT,pT,sig,sigName,n0,diff,genes:want,missing,top:items.slice().sort((p,q)=>pv(p)-pv(q)).slice(0,10).map(it=>Object.assign({},it,{v:pv(it)}))};return r;}

// 効果量のドットプロット（feature の fcdot。改善計画 3.2）: 選んだ遺伝子の log2FC を横軸に並べる。点の大きさ＝−log10 q（面積が比例）、塗り＝有意・白抜き＝有意でない、
// |log2FC| のしきい値の帯と 0 の基準線、Group／Pathway の列があれば群ごとに区切り線と群名。判定はボルケーノと同じ（volSig・volP・volFC）
function figRenderFcDot(spec){const d=spec.data;const o=Object.assign({},FIG_DEF,spec.opts||{});
  const fcT=+o.volFC||0,pT=+o.volP||0.05;const sig=figVolSig(spec,d);const pv=it=>figVolValue(it,sig);const sigName=sig==='p'?(d.pname||'P'):sig==='q'?(d.qcol||'q'):'BH q';
  const want=figVolGenes(spec);let items=[];const missing=[];
  if(want.length)want.forEach(g=>{const it=d.items.find(x=>String(x.name).toLowerCase()===g.toLowerCase());if(it&&!items.includes(it))items.push(it);else if(!it)missing.push(g);});
  else items=d.items.slice().sort((p,q)=>pv(p)-pv(q)).slice(0,+o.fdN>0?+o.fdN:20);
  if(!items.length)return {svg:'',w:0,h:0,res:{n:0,up:0,down:0,ns:0,fcT,pT,sig,sigName,n0:0,diff:null,genes:want,missing,top:[]}};
  if(o.fdSort==='fc')items=items.slice().sort((p,q)=>q.fc-p.fc);
  if(items.some(it=>it.group)){const order=[...new Set(items.map(it=>it.group||''))];items=order.flatMap(g=>items.filter(it=>(it.group||'')===g));} // 群は続けて並べる
  const n=items.length;const cap=+o.fdCap>0?+o.fdCap:50;const L=it=>Math.min(-Math.log10(Math.max(pv(it),1e-300)),cap);const lmax=Math.max(...items.map(L),-Math.log10(pT),1);
  const isSig=it=>pv(it)<pT&&Math.abs(it.fc)>=fcT;const fs0=(+o.fontPt||12)*FIG_PT;const italic=o.volItalic!==false;
  const xr=Math.max(...items.map(it=>Math.abs(it.fc)),fcT)*1.15||1;const xs=figAxisLin(-xr,xr,5);
  const ys={lo:0,hi:n,cat:true,ticks:items.map((it,i)=>({v:n-i-0.5,l:it.name,raw:italic?`<tspan font-style="italic">${figEsc(it.name)}</tspan>`:null}))};
  const groups=[...new Set(items.map(it=>it.group).filter(Boolean))];const grpW=groups.length?Math.max(...groups.map(g=>figTW(g,fs0*0.85)))+fs0*1.1:0;const sigLab=`${sigName} < ${pT}`+(fcT>0?`, |log2FC| ≥ ${fcT}`:'');const legW=Math.max(figTW(`−log10 ${sigName}`,fs0*0.8),figTW(sigLab,fs0*0.7)+fs0*1.6,fs0*4)+fs0*1.4;
  const labW=Math.max(...items.map(it=>figTW(String(it.name),fs0)));
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle||(d.fcname||'log2 fold change'),padL:Math.max(0,labW-fs0*1.6),padR:grpW+legW,wIn:figDefSize(spec,'wIn')?2.2:0,hIn:figDefSize(spec,'hIn')?Math.max(1.3,n*0.21):0});
  const {xOf,yOf,a,fs,txt,dash,x0,y0,plotW,padT,S}=F;const cUp=S(1).color,cDn=S(0).color;
  const rMin=fs*0.16,rMax=fs*0.55;const rOf=l=>rMin+(rMax-rMin)*Math.sqrt(Math.max(0,l)/lmax);
  let back='';if(o.volLines!==false&&fcT>0)back+=`<rect x="${xOf(-fcT)}" y="${padT}" width="${xOf(fcT)-xOf(-fcT)}" height="${y0-padT}" fill="#000" fill-opacity="0.06"/>`+[-fcT,fcT].map(v=>`<line x1="${xOf(v)}" y1="${padT}" x2="${xOf(v)}" y2="${y0}" stroke="#777" stroke-width="${a*0.6}" stroke-dasharray="${dash}"/>`).join('');
  back+=`<line x1="${xOf(0)}" y1="${padT}" x2="${xOf(0)}" y2="${y0}" stroke="#444" stroke-width="${a*0.8}"/>`;
  let seps='',glab='';if(groups.length){let start=0;for(let i=1;i<=n;i++){if(i===n||(items[i].group||'')!==(items[start].group||'')){const yA=yOf(n-start),yB=yOf(n-i);if(i<n)seps+=`<line x1="${x0}" y1="${yB}" x2="${x0+plotW}" y2="${yB}" stroke="#999" stroke-width="${a*0.6}"/>`;const g=items[start].group;if(g){const gx=x0+plotW+fs*0.35;glab+=`<line x1="${gx}" y1="${yA+fs*0.15}" x2="${gx}" y2="${yB-fs*0.15}" stroke="#000" stroke-width="${a}"/>`+txt(gx+fs*0.3,(yA+yB)/2+fs*0.3,g,'start','font-weight="bold"',null,fs*0.85);}start=i;}}}
  let dots='';items.forEach((it,i)=>{const cx=xOf(it.fc),cy=yOf(n-i-0.5);const c=it.fc>=0?cUp:cDn;const r=rOf(L(it));dots+=`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="${isSig(it)?c:'#fff'}" stroke="${c}" stroke-width="${a*0.9}"><title>${figEsc(it.name)}: log2FC ${it.fc.toFixed(2)}, ${sigName} ${figSci(pv(it))}</title></circle>`;});
  const cand=[1.3,2,3,5,10,20,50,100,200,300].filter(v=>v<=lmax*1.001);const pick=cand.length<=3?cand:[cand[0],cand[Math.floor(cand.length/2)],cand[cand.length-1]];
  const lx=x0+plotW+grpW+fs*0.8;let ly=padT+fs*0.6;let leg=txt(lx,ly,`−log10 ${sigName}`,'start',null,null,fs*0.8);ly+=fs*0.5;
  pick.forEach(v=>{const r=rOf(v);ly+=Math.max(r*2,fs*0.9)*0.5+fs*0.35;leg+=`<circle cx="${lx+rMax}" cy="${ly}" r="${r}" fill="#888" stroke="#555" stroke-width="${a*0.6}"/>`+txt(lx+rMax*2+fs*0.4,ly+fs*0.28,v>=10||v===2||v===3||v===5?String(v):v.toFixed(1),'start',null,null,fs*0.75);ly+=Math.max(r*2,fs*0.9)*0.5;});
  ly+=fs*1.1;leg+=`<circle cx="${lx+rMax}" cy="${ly-fs*0.25}" r="${rMin*1.6}" fill="#555" stroke="#555" stroke-width="${a*0.8}"/>`+txt(lx+rMax*2+fs*0.4,ly,sigLab,'start',null,null,fs*0.7);ly+=fs*1.05;
  leg+=`<circle cx="${lx+rMax}" cy="${ly-fs*0.25}" r="${rMin*1.6}" fill="#fff" stroke="#555" stroke-width="${a*0.8}"/>`+txt(lx+rMax*2+fs*0.4,ly,'NS','start',null,null,fs*0.7);
  const r=F.wrap(back+seps+`<g data-sel="series:0">${dots}</g>`+(glab?`<g data-sel="text">${glab}</g>`:'')+`<g data-sel="legend">${leg}</g>`);
  const up=items.filter(it=>isSig(it)&&it.fc>0).length,down=items.filter(it=>isSig(it)&&it.fc<0).length;
  r.res={n,up,down,ns:n-up-down,fcT,pT,sig,sigName,n0:0,diff:null,genes:want,missing,top:items.slice(0,10).map(it=>Object.assign({},it,{v:pv(it)})),fcdot:true,groups};return r;}

// 棒＋個別の点（nested の barjitter。改善計画 3.2）: 棒＝群の平均（全反復、または個体平均の平均）± 誤差、点＝個々の値。点の形＝個体（副分類: WT/OE、既報値/再解析値など）。名前が同じ個体は群をまたいで同じ形
function figRenderBarJitter(spec){const d=spec.data;const gs=d.groups.filter(g=>g.values.length);const n=gs.length;if(!n)return {svg:'',w:0,h:0};const o=Object.assign({},FIG_DEF,spec.opts||{});
  const subj=[];gs.forEach(g=>g.subjects.forEach(s=>{if(!subj.includes(s.name))subj.push(s.name);}));const shapeOf=k=>FIG_SYMBOLS[k%FIG_SYMBOLS.length][0];
  const bySub=o.bjStat==='subject';const vals=g=>bySub?g.means:g.values;const ers=gs.map(g=>figErr(vals(g),o.bjErr||'SD'));
  const cmp=spec.cmp&&spec.cmp!=='none'?figCompare(gs.map(g=>({name:g.name,values:vals(g)})),spec.cmp,spec.ctrl):null;const pairs=cmp?cmp.pairs:[];const nLv=figNLevels(pairs,o);const head=(nLv?0.14+0.16*nLv:0.08)+(o.valLabels?0.08:0);
  const all=gs.flatMap(g=>g.values).concat(ers.map(e=>e.m+(e.e||0)));const lo=Math.min(0,...all),hi=Math.max(...all);
  const [ylo,yhi]=figYRange(o,lo,hi+(hi-lo)*head);const ys=figAxisLin(ylo,yhi,5);const xs={lo:0,hi:n,cat:true,ticks:gs.map((g,i)=>({v:i+0.5,l:g.name}))};
  const ptFill=o.bjPt==='open'?'open':'solid';const legend=subj.length>1&&subj.length<=10?subj.map((nm,k)=>({name:nm,kind:'sym',i:0,color:'#000',fill:ptFill,shape:shapeOf(k)})):[];
  const F=figFrame(spec,{x:xs,y:ys,xTitle:o.xTitle,yTitle:o.yTitle||d.vname,legend});const {xOf,yOf,S,a,fs,txt}=F;const bw=(xOf(1)-xOf(0))*0.62;const base=Math.max(ys.lo,0);
  let body='';const centers=[];gs.forEach((g,i)=>{const so=S(i),c=so.color;const cx=xOf(i+0.5);const e=ers[i];let s='';
    s+=`<rect x="${cx-bw/2}" y="${yOf(Math.max(base,e.m))}" width="${bw}" height="${Math.abs(yOf(e.m)-yOf(base))}" fill="${figPaint(so.fillSet?so.fill:(o.barFill||so.fill),c)}" fill-opacity="${Math.min(+o.fillAlpha,0.45)}" stroke="${o.barEdge==='black'?'#000':c}" stroke-width="${a}"/>`+figErrBarP3(F,cx,e.m,e.e,bw*0.6,'#000');
    const pv=[],pk=[];g.subjects.forEach(sb=>{const k=subj.indexOf(sb.name);(bySub?[mean(sb.values)]:sb.values).forEach(v=>{pv.push(v);pk.push(k);});});
    const r=so.symPt*FIG_PT/2;const pos=figArrangeDots(pv,yOf,r,bw*0.85);const pc=o.bjPt==='black'?'#000':c;pv.forEach((v,k)=>{s+=figSymbol(cx+pos[k].dx,pos[k].y,r,shapeOf(pk[k]),o.bjPt==='open'?'#fff':pc,o.bjPt==='open'?pc:'#000');});
    const top=Math.max(e.m+(e.e||0),...pv);if(o.valLabels)s+=txt(cx,yOf(top)-fs*0.3,figValFmt(e.m,o),'middle','',null,fs*0.75);
    body+=`<g data-sel="series:${i}">${s}</g>`;centers.push({cx,top:yOf(top)-(o.valLabels?fs*0.85:0)});});
  const br=figBracketsMore(pairs,centers,F);const r=F.wrap(body+(br.svg?`<g data-sel="brackets">${br.svg}</g>`:''));r.res={cmp,nsub:gs.map(g=>g.subjects.length),bj:true,stat:bySub?'subject':'all',err:o.bjErr||'SD',subjects:subj};return r;}

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
  if(data.kind==='nested'&&res.bj){const c=res.cmp;const all=res.stat!=='subject';let s=`<div class="hint">棒＋個別の点: 棒＝${all?'全部の値':'個体ごとの平均'}の平均 ± ${esc(res.err)}、点＝${all?'個々の値':'個体の平均'}、点の形＝${esc(data.sname)}（${(res.subjects||[]).map(esc).join(' / ')}）。検定は${all?'全部の値':'個体ごとの平均'}で行います（${c?esc(c.test):'比較なし'}）。</div>`;
    s+='<table><tr><th>群</th><th>個体</th><th>値の数</th><th>平均</th><th>SD</th></tr>'+data.groups.map(g=>{const v=all?g.values:g.means;return `<tr><td>${esc(g.name)}</td><td>${g.subjects.length}</td><td>${g.values.length}</td><td>${f3(mean(v))}</td><td>${v.length>1?f3(sd(v)):'–'}</td></tr>`;}).join('')+'</table>';
    if(c&&c.pairs.length)s+='<table><tr><th>比較</th><th>P 値</th></tr>'+c.pairs.map(p=>`<tr><td>${esc(data.groups[p.a].name)} vs ${esc(data.groups[p.b].name)}</td><td>${P(p.p)}</td></tr>`).join('')+'</table>';return s;}
  if(data.kind==='nested'){const c=res.cmp;let s=`<div class="hint">入れ子: 群 ${data.groups.length}、個体 ${res.nsub?res.nsub.join(' / '):''}。小さな点＝反復、記号＝個体の平均、横線＝個体平均の平均。検定は個体平均で行います（${c?esc(c.test):'比較なし'}）。</div>`;s+='<table><tr><th>群</th><th>個体</th><th>反復</th><th>平均（個体平均の）</th><th>SD</th></tr>'+data.groups.map(g=>`<tr><td>${esc(g.name)}</td><td>${g.subjects.length}</td><td>${g.values.length}</td><td>${f3(mean(g.means))}</td><td>${g.means.length>1?f3(sd(g.means)):'–'}</td></tr>`).join('')+'</table>';
    if(c&&c.pairs.length)s+='<table><tr><th>比較</th><th>P 値</th></tr>'+c.pairs.map(p=>`<tr><td>${esc(data.groups[p.a].name)} vs ${esc(data.groups[p.b].name)}</td><td>${P(p.p)}</td></tr>`).join('')+'</table>';return s;}
  if(data.kind==='swimmer'){return `<div class="hint">n = ${res.n} ／ 期間の中央値 ${f3(res.median)} ／ 継続中 ${res.ongoing}${res.groups&&res.groups.length?' ／ '+res.groups.map(g=>esc(g.name)+' '+g.n).join('、'):''}${data.eventNames.length?' ／ イベント: '+data.eventNames.map(esc).join('、'):''}</div>`;}
  if(data.kind==='spider'){const c=res.cnt||{};return `<div class="hint">n = ${res.n} ／ 最良変化で分類: PR（≤ −30%）${c.PR||0}、SD ${c.SD||0}、PD（≥ +20%）${c.PD||0}。確定効果ではなく腫瘍径の変化だけの分類です。</div>`;}
  if(data.kind==='feature'){const sigTxt={p:'P 値（'+esc(data.pname)+'）',q:'表の q・FDR 列（'+esc(data.qcol)+'）',bh:'P から BH 法で計算し直した q'}[res.sig]||esc(res.sigName);
    const cond=`判定: ${res.sig==='p'?data.pname:res.sig==='q'?data.qcol:'BH q (from '+data.pname+')'} < ${res.pT}, |${data.fcname}| >= ${res.fcT}; up ${res.up}, down ${res.down}, NS ${res.ns}; n = ${res.n}`+(res.n0?`; ${res.n0} with value 0 shown at the top (1e-300 used)`:'');
    let s=`<div class="hint">判定に使った値: <b>${sigTxt}</b> ／ しきい値: ${esc(res.sigName)} &lt; ${res.pT}、|log2FC| ≥ ${res.fcT} ／ 件数: 上昇 ${res.up}、下降 ${res.down}、有意でない ${res.ns}（計 ${res.n}）${data.onlyQ?' ／ 表には補正済みの列だけがあるため、それを q として使っています':''}${res.n0?` ／ 値が 0（表示の下限未満）の ${res.n0} 件は、縦軸の上端に ▲ で描き（計算には 1e-300 を使用）、図に注記しました`:''}</div>`;
    if(res.diff)s+=`<div class="hint" style="color:#b45309">元の q 列（${esc(data.qcol)}）と ${res.diff.n} 件で判定が異なります（上昇 +${res.diff.upAdd}／−${res.diff.upDel}、下降 +${res.diff.dnAdd}／−${res.diff.dnDel}）。</div>`;
    if(res.genes&&res.genes.length)s+=`<div class="hint">ラベルした名前: ${res.genes.map(esc).join(', ')}${res.missing&&res.missing.length?` ／ <span style="color:#b45309">表に見つからない名前: ${res.missing.map(esc).join(', ')}</span>`:''}</div>`;
    s+=`<button class="small" type="button" data-copytext="${esc(cond)}" aria-label="判定の条件をコピー">⧉ 判定の条件をコピー</button>`;
    if(res.top&&res.top.length)s+='<table><tr><th>上位</th><th>log2FC</th><th>P</th><th>q（表）</th><th>q（BH）</th></tr>'+res.top.map(it=>`<tr><td>${esc(it.name)}</td><td>${it.fc.toFixed(3)}</td><td>${it.p0?'0（→1e-300）':figSci(it.p)}</td><td>${it.qOrig!=null?figSci(it.qOrig):'–'}</td><td>${figSci(it.qBH)}</td></tr>`).join('')+'</table>';return s;}
  if(data.kind==='importance'){return `<div class="hint">${res.n} / ${res.total} 件を表示（${st.opts.impSort==='input'?'入力順':'大きい順'}）</div>`;}
  if(data.kind==='heatmap'&&t==='confusion'){const s0=res.stats;if(!s0)return null;let s=`<div class="hint">N = ${s0.N} ／ 正確度 ${(s0.acc*100).toFixed(1)}% ／ Cohen の κ = ${isFinite(s0.kappa)?s0.kappa.toFixed(3):'–'}</div><table><tr><th>クラス</th><th>再現率（感度）</th><th>精度（PPV）</th><th>特異度</th><th>F1</th></tr>`+data.rows.map((r,i)=>{const p=s0.per[i];const pc=v=>isFinite(v)?(v*100).toFixed(1)+'%':'–';return `<tr><td>${esc(r)}</td><td>${pc(p.recall)}</td><td>${pc(p.precision)}</td><td>${pc(p.spec)}</td><td>${isFinite(p.f1)?p.f1.toFixed(3):'–'}</td></tr>`;}).join('')+'</table>';return s;}
  if(t==='estimation'){const ds=res.diffs||[];const gs=data.groups;let s=`<div class="hint">右軸＝対照（${esc(gs[res.ctrl]?gs[res.ctrl].name:'')}）との平均差。Welch の t 検定の 95% CI。右軸の 0 は対照の平均の高さ。</div><table><tr><th>比較</th><th>平均差</th><th>95% CI</th><th>t</th><th>df</th><th>P</th></tr>`;ds.forEach((r,i)=>{if(!r)return;s+=`<tr><td>${esc(gs[i].name)} − ${esc(gs[res.ctrl].name)}</td><td>${f3(r.diff)}</td><td>${f3(r.ciLo)} – ${f3(r.ciHi)}</td><td>${r.t.toFixed(3)}</td><td>${r.df.toFixed(1)}</td><td>${P(r.p)}</td></tr>`;});return s+'</table>';}
  if(t==='pie'||t==='donut'){const ps=res.pies||[];return ps.map(p=>`<table><tr><th colspan="3">${esc(p.name||'')}合計 ${figFmt(+p.total.toPrecision(5))}</th></tr><tr><th>区分</th><th>値</th><th>%</th></tr>${p.slices.map(sl=>`<tr><td>${esc(sl.name)}</td><td>${figFmt(+sl.v.toPrecision(5))}</td><td>${(sl.v/p.total*100).toFixed(1)}</td></tr>`).join('')}</table>`).join('');}
  if(t==='ecdf'){return `<div class="hint">経験累積分布 F(x) = x 以下の割合。n = ${(res.n||[]).join(', ')}、中央値 ${(res.medians||[]).map(m=>figFmt(+m.toPrecision(4))).join(', ')}</div>`;}
  if(t==='qq'){const ser=res.ser||[];return '<div class="hint">X＝実測値、Y＝同じ平均・SD の正規分布から予測した値（Blom の順位統計量）。直線に乗れば正規分布に近い。</div><table><tr><th>群</th><th>n</th><th>Shapiro–Wilk W</th><th>P</th></tr>'+data.groups.filter(g=>g.values.length>=3).map((g,i)=>{const s=ser[i];return `<tr><td>${esc(g.name)}</td><td>${s?s.n:''}</td><td>${s&&s.sw?s.sw.W.toFixed(4):'–'}</td><td>${s&&s.sw?P(s.sw.p):'–'}</td></tr>`;}).join('')+'</table>';}
  if(t==='bland-altman'){if(res.n==null)return '<div class="hint">2 列（同じ行＝同じ個体）が必要です</div>';return `<div class="hint">${esc(data.groups[0].name)} − ${esc(data.groups[1].name)}${res.pct?'（平均に対する %）':''}、n = ${res.n}</div><table><tr><th></th><th>値</th><th>95% CI</th></tr><tr><td>バイアス（平均差）</td><td>${f3(res.bias)}</td><td>${f3(res.biasCI[0])} – ${f3(res.biasCI[1])}</td></tr><tr><td>SD</td><td>${f3(res.sd)}</td><td></td></tr><tr><td>下側一致限界（−1.96 SD）</td><td>${f3(res.loa[0])}</td><td>${f3(res.loaCI[0][0])} – ${f3(res.loaCI[0][1])}</td></tr><tr><td>上側一致限界（+1.96 SD）</td><td>${f3(res.loa[1])}</td><td>${f3(res.loaCI[1][0])} – ${f3(res.loaCI[1][1])}</td></tr></table>`;}
  if(t==='grouped-line'){return '<div class="hint">カテゴリごとの各群の平均を線でつなぎ、誤差棒は選んだ種類（SD/SEM/CI）。</div>';}
  if(t==='xy-band'){return `<div class="hint">各 X の反復の平均を線、平均 ± ${esc(res.err||'SD')} を帯で描いています。</div>`;}
  return null;}

/* ---------- 画面 ---------- */
document.addEventListener('DOMContentLoaded',()=>{const sel=document.querySelector('#figKind');if(sel)FIG_KINDS_P3.forEach(([v,l])=>{const op=document.createElement('option');op.value=v;op.textContent=l;sel.appendChild(op);});});
