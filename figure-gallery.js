// BranCHAT Figure 拡張（図の一覧）
// 「どんな図になるか」を見て選べるよう、図種ごとの例のデータ（figSample）を実際に描いた小さな図（サムネイル）を並べる。
// 作成画面のツール行「▦ グラフの種類」、グラフメニューの「▦ グラフの種類: …」、左の「グラフ」のボタンから開く（種類の選択はこの一覧だけ。プルダウンは出さない）（#figGalDlg は JS で生成）。
// 選ぶと: 同じ表の型なら種類だけ変える。表の型が違う／「例のデータも入れる」なら例のデータを入れる（自分のデータがあるときは確認）。
'use strict';

const FIG_DEFAULT_TEXT='Control\tTreated\n12.1\t15.4\n11.8\t16.0\n12.6\t14.9\n13.0\t15.8\n12.3\t16.3';
// 一覧の見出し（表の型ごと）
const FIG_GAL_KINDS=[['群の比較（列＝群、行＝反復）',['column']],['カテゴリ × 群',['grouped']],['XY・あてはめ',['xy']],['臨床（生存・ROC・フォレスト・ウォーターフォール・スイマー・スパイダー）',['survival','roc','forest','waterfall','swimmer','spider']],['行列・多変数（ヒートマップ・PCA・SuperPlot・重要度）',['heatmap','multi','nested','importance']],['遺伝子・オミクス',['feature','omics']]];

/* ---------- 例のデータ ---------- */
function figSample(kind,type){
  const R=figRng(20261006+kind.length*131+type.length*17+type.charCodeAt(0));const nrm=(m,s)=>m+s*R.n();const f1=v=>(+v).toFixed(1),f2=v=>(+v).toFixed(2);
  const J=(h,rows)=>[h.join('\t')].concat(rows.map(r=>r.join('\t'))).join('\n');const rep=(n,fn)=>Array.from({length:n},(_,i)=>fn(i));
  const sp=(data,extra)=>Object.assign({kind,type,data},extra||{});
  if(kind==='column'){
    if(type==='before-after')return sp(J(['Pre','Post'],rep(7,()=>{const a=nrm(10,1.5);return [f1(a),f1(a+nrm(2.5,1))];})),{compare:'all'});
    if(type==='histogram')return sp(J(['Control','Treated'],rep(40,()=>[f1(nrm(50,8)),f1(nrm(62,9))])));
    if(type==='qq')return sp(J(['Value'],rep(24,()=>[f2(nrm(10,2))])));
    if(type==='bland-altman')return sp(J(['Method A','Method B'],rep(18,()=>{const a=nrm(50,12);return [f1(a),f1(a+nrm(1.5,3))];})));
    if(type==='pie'||type==='donut')return sp(J(['CR','PR','SD','PD'],[[8,14,10,6]]));
    if(type==='ecdf')return sp(J(['Control','Treated'],rep(20,()=>[f1(nrm(10,2)),f1(nrm(13,2.5))])));
    const n=type==='violin'||type==='box'?14:7;return sp(J(['Control','Low','High'],rep(n,()=>[f1(nrm(10,1.5)),f1(nrm(12.5,1.8)),f1(nrm(16,2))])),{compare:type==='estimation'?'none':'all'});}
  if(kind==='grouped'){
    if(type==='pie'||type==='donut')return sp(J(['Subtype','n'],[['GCB',42],['ABC',31],['Unclassified',12],['Other',7]]));
    const cats=['Day 0','Day 7','Day 14'];return sp(J(['Time','Control','Control','Control','Drug','Drug','Drug'],cats.map((c,i)=>[c,...rep(3,()=>f1(nrm(10+i*2,1))),...rep(3,()=>f1(nrm(10+i*6,1.4)))])));}
  if(kind==='xy'){
    if(type==='xy-regression'||type==='xy-points')return sp(J(['Dose','Response'],rep(16,i=>[f1(1+i*0.6),f1(nrm(2+1.8*(1+i*0.6),1.6))])));
    if(type==='xy-dose')return sp(J(['Conc (M)','Viability','Viability','Viability'],[1e-9,3e-9,1e-8,3e-8,1e-7,3e-7,1e-6,3e-6,1e-5].map(c=>{const y=5+95/(1+Math.pow(c/8e-8,1.1));return [c.toExponential(0),...rep(3,()=>f1(nrm(y,4)))];})));
    if(type==='xy-mm')return sp(J(['[S] (µM)','v','v'],[1,2,5,10,20,40,80,160].map(s=>{const v=100*s/(12+s);return [s,...rep(2,()=>f1(nrm(v,3)))];})));
    if(type==='xy-band')return sp(J(['Epoch','Train','Train','Train','Valid','Valid','Valid'],rep(12,i=>[i+1,...rep(3,()=>f2(nrm(1.6*Math.exp(-i/3)+0.2,0.05))),...rep(3,()=>f2(nrm(1.6*Math.exp(-i/4)+0.45,0.08)))])));
    return sp(J(['Day','Control','Control','Control','Drug','Drug','Drug'],[0,3,7,10,14,17,21].map(d=>[d,...rep(3,()=>f1(nrm(100*Math.exp(d*0.09),8+d))),...rep(3,()=>f1(nrm(100*Math.exp(d*0.04),6+d*0.6)))])));}
  if(kind==='survival'){const rows=[];[['Control',9],['Drug',17]].forEach(([g,sc])=>rep(22,()=>{const t=-sc*Math.log(1-R.u()*0.98);const cens=R.u()<0.22||t>30;rows.push([f1(Math.min(t,30)),cens?0:1,g]);}));return sp(J(['Time','Event','Group'],rows),{xtitle:'Months'});}
  if(kind==='roc')return sp(J(['MarkerA','MarkerB','Class'],rep(40,i=>{const pos=i<18;return [f1(nrm(pos?7.5:5,1.2)),f1(nrm(pos?6.2:5.2,1.4)),pos?1:0];})));
  if(kind==='forest')return sp(J(['Study','HR','Lower','Upper','Weight'],[['Trial A',0.62,0.41,0.94,18],['Trial B',0.81,0.60,1.09,26],['Trial C',0.70,0.48,1.02,20],['Trial D',1.05,0.72,1.53,16],['Trial E',0.58,0.39,0.86,20],['Overall',0.74,0.63,0.87,'']]));
  if(kind==='waterfall')return sp(J(['Patient','Change','Response'],rep(22,i=>{const c=Math.round(nrm(-18,34));const v=Math.max(-100,Math.min(60,c));return ['P'+(i+1),v,v<=-99?'CR':v<=-30?'PR':v>=20?'PD':'SD'];})));
  if(kind==='swimmer')return sp(J(['Patient','Duration','Response','Ongoing','Progression'],rep(10,i=>{const d=Math.round(4+R.u()*20);const on=R.u()<0.4;return ['P'+(i+1),d,['CR','PR','PR','SD','PD'][i%5],on?1:0,on?'':d];})));
  if(kind==='spider'){const rows=[];rep(8,i=>{const slope=nrm(-4,7);let v=0;[0,6,12,18,24].forEach((w,k)=>{if(k)v+=slope+nrm(0,4);rows.push(['P'+(i+1),w,f1(Math.max(-100,v))]);});});return sp(J(['Patient','Week','Change'],rows));}
  if(kind==='heatmap'){
    if(type==='confusion')return sp(J(['Actual','A','B','C'],[['A',42,5,3],['B',6,38,6],['C',2,7,41]]));
    if(type==='corr')return sp(J(['Age','LDH','CRP','Alb','Hb'],rep(24,()=>{const z=R.n();return [f1(60+8*z+nrm(0,6)),f1(250+60*z+nrm(0,40)),f2(1+0.8*z+nrm(0,0.6)),f2(3.8-0.4*z+nrm(0,0.3)),f1(12-1.2*z+nrm(0,1))];})));
    return sp(J(['Gene','C1','C2','C3','T1','T2','T3'],rep(10,i=>['Gene'+(i+1),...rep(3,()=>f1(nrm(i<5?4:8,0.8))),...rep(3,()=>f1(nrm(i<5?8:4,0.8)))])),{style:{hmCluster:'rows'}});}
  if(kind==='multi'){
    if(type==='bubble')return sp(J(['Id','X','Y','Size','Group'],rep(14,i=>['s'+i,f1(nrm(5,2)),f1(nrm(5,2)),Math.round(5+R.u()*60),i%2?'A':'B'])));
    return sp(J(['Sample','Group','v1','v2','v3','v4','v5'],rep(30,i=>{const g=i%3;const a=nrm(g*2.2,1),b=nrm(g===1?2:0,1);return ['s'+i,'G'+(g+1),f2(a+nrm(0,0.4)),f2(a*0.8+nrm(0,0.5)),f2(b+nrm(0,0.4)),f2(b*0.7-a*0.3+nrm(0,0.5)),f2(nrm(0,1))];})),{style:{pcaEllipse:true}});}
  if(kind==='nested'){const rows=[];[['Control',10],['Drug',14]].forEach(([g,m],gi)=>rep(3,s=>{const sm=nrm(m,1);rep(8,()=>rows.push([g,'Exp'+(s+1),f1(nrm(sm,1.2))]));}));return sp(J(['Group','Experiment','Value'],rows),{compare:'all',style:{spColor:'subject'}});}
  if(kind==='feature'){const rows=rep(260,i=>{const fc=nrm(0,1.3);const p=Math.min(1,Math.pow(10,-Math.abs(fc)*(1.2+R.u()*2.2))+R.u()*0.02);return ['G'+(i+1),Math.round(Math.pow(10,1+R.u()*3)),f2(fc),p.toExponential(2)];});return sp(J(['Gene','baseMean','log2FC','pvalue'],rows));}
  if(kind==='importance')return sp(J(['Feature','Importance'],[['LDH',0.24],['Age',0.19],['Stage',0.16],['ECOG PS',0.13],['Albumin',0.11],['CRP',0.08],['Sex',0.05],['BMI',0.04]]));
  if(kind==='omics'){
    if(type==='manhattan')return sp(J(['SNP','CHR','BP','P'],rep(600,i=>{const chr=1+Math.floor(i/50);const hit=chr===6&&i%50>20&&i%50<27;return ['rs'+i,chr,(i%50)*2e6+Math.round(R.u()*1e6),Math.pow(10,-(hit?6+R.u()*4:R.u()*R.u()*5)).toExponential(2)];})));
    if(type==='embedding')return sp(J(['UMAP_1','UMAP_2','cluster'],rep(240,i=>{const c=i%4;const cx=[0,6,2,7][c],cy=[0,1,6,7][c];return [f2(nrm(cx,1)),f2(nrm(cy,1)),['B','T','NK','Mono'][c]];})));
    if(type==='gsea')return sp(J(['Rank','Metric','Hit'],rep(300,i=>[i+1,f2(3-i/50),(i<90?R.u()<0.28:R.u()<0.04)?1:0])),{nes:1.92,pval:0.001,fdr:0.012});
    if(type==='enrich-bar'||type==='enrich-dot')return sp(J(['Term','GeneRatio','Count','p.adjust'],[['B cell activation','24/300',24,'1e-9'],['Lymphocyte differentiation','21/300',21,'4e-8'],['NF-kB signaling','16/300',16,'2e-6'],['Antigen presentation','12/300',12,'8e-5'],['Cell cycle','10/300',10,'1e-3'],['Apoptosis','8/300',8,'0.01'],['Glycolysis','6/300',6,'0.03']]));
    if(type==='dotplot'){const genes=['MS4A1','CD79A','CD3E','CD8A','NKG7','LYZ'],cl=['B','CD4 T','CD8 T','NK','Mono'];const on={MS4A1:[0],CD79A:[0],CD3E:[1,2],CD8A:[2],NKG7:[2,3],LYZ:[4]};return sp(J(['Gene','Cluster','Pct','Avg'],genes.flatMap(g=>cl.map((c,ci)=>{const hi=on[g].includes(ci);return [g,c,Math.round(hi?70+R.u()*25:2+R.u()*12),f2(hi?2+R.u()*1.5:R.u()*0.3)];}))));}
    if(type==='sbs96')return sp(J(['Type','Count'],['C>A','C>G','C>T','T>A','T>C','T>G'].flatMap(s=>'ACGT'.split('').flatMap(l=>'ACGT'.split('').map(r=>[l+'['+s+']'+r,Math.round((s==='C>T'?(r==='G'?70:22):s==='T>C'?14:6)*(0.5+R.u()))])))));
    if(type==='oncoprint'){const genes=['TP53','MYD88','CD79B','KMT2D','CREBBP','EZH2'];const kinds=['Missense','Nonsense','Amp','Del','Frameshift'];return sp(J(['Gene',...rep(16,i=>'S'+(i+1))],genes.map((g,gi)=>[g,...rep(16,()=>R.u()<0.42-gi*0.05?kinds[Math.floor(R.u()*kinds.length)]:'')])));}
    if(type==='logo')return sp(J(['seq'],rep(20,()=>['TGACTCA'.split('').map((ch,k)=>R.u()<(k===3?0.5:0.12)?'ACGT'[Math.floor(R.u()*4)]:ch).join('')])));
    if(type==='sankey')return sp(J(['From','To','Value'],[['Screened','Enrolled',120],['Screened','Excluded',30],['Enrolled','Arm A',60],['Enrolled','Arm B',60],['Arm A','Responder',38],['Arm A','Non-responder',22],['Arm B','Responder',24],['Arm B','Non-responder',36]]));
    if(type==='rank')return sp(J(['Gene','Score'],rep(120,i=>['G'+(i+1),f2(3*Math.tanh((60-i)/28)+nrm(0,0.08))])),{style:{rankHi:'G1,G2,G120'}});
    if(type==='network')return sp(J(['From','To'],[['MYD88','IRAK4'],['IRAK4','IRAK1'],['IRAK1','TRAF6'],['TRAF6','TAK1'],['TAK1','IKK'],['IKK','NFKB1'],['CD79B','SYK'],['SYK','BTK'],['BTK','PLCG2'],['PLCG2','PKCb'],['PKCb','CARD11'],['CARD11','BCL10'],['BCL10','MALT1'],['MALT1','IKK'],['BTK','IKK'],['NFKB1','BCL2']]));
    if(type==='tree')return sp(J(['tree'],[['(((Human:0.6,Chimp:0.7):0.9,(Mouse:1.6,Rat:1.5):1.2):1.4,(Chicken:3.1,Zebrafish:4.2):0.8);']]));
    return null;}
  return null;}

/* ---------- サムネイル ---------- */
const figGalCache={}; // 'kind/type' → SVG 文字列（'' は描けなかった）
function figGalThumb(kind,type){const key=kind+'/'+type;if(key in figGalCache)return figGalCache[key];let svg='';try{const s=figSample(kind,type);const r=s&&figRenderSpec(s);if(r&&r.svg&&!(r.res&&r.res.error))svg=r.svg.replace(/ data-(sel|note|cut|annot|node|panel)="[^"]*"/g,'');}catch(e){svg='';}figGalCache[key]=svg;return svg;}
function figGalList(){const out=[];for(const [label,kinds] of FIG_GAL_KINDS){const types=[];for(const kind of kinds)for(const t of (FIG_TYPES[kind]||[]))if(t[0]!=='auto')types.push({kind,type:t[0],name:t[1]});if(types.length)out.push({label,types});}return out;}

/* ---------- 一覧の画面 ---------- */
function figGalleryOpen(){
  let dlg=document.querySelector('#figGalDlg');
  if(!dlg){dlg=document.createElement('dialog');dlg.id='figGalDlg';
    dlg.innerHTML=`<div class="figGalHead"><h2 style="margin:0">▦ グラフの種類</h2><input id="figGalQ" type="text" placeholder="絞り込み（例: 生存、PCA、棒）" style="max-width:220px"><label class="hint" style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="figGalData"> 例のデータも入れる</label><span class="spacer" style="flex:1"></span><button id="figGalClose">閉じる</button></div><div class="hint" id="figGalHint" style="margin:6px 0"></div><div id="figGalBody"></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#figGalClose').onclick=()=>dlg.close();
    dlg.querySelector('#figGalQ').addEventListener('input',figGalFilter);
    dlg.querySelector('#figGalBody').addEventListener('click',e=>{const c=e.target.closest('[data-galkind]');if(c)figGalleryPick(c.dataset.galkind,c.dataset.galtype);});}
  const st=figState||{};const list=figGalList();
  dlg.querySelector('#figGalHint').innerHTML='図をクリックすると、その種類に切り替わります。<span class="figGalDot"></span> 印の図は、いまのデータのまま切り替えられます。それ以外（表の形が違う図）を選ぶと例のデータが入ります（自分のデータがあるときは確認します）。';
  dlg.querySelector('#figGalBody').innerHTML=list.map(g=>`<div class="figGalSec"><h3>${figEsc(g.label)}</h3><div class="figGalGrid">${g.types.map(t=>`<button type="button" class="figGalCard${st.kind===t.kind&&st.type===t.type?' on':''}${st.kind===t.kind?' same':''}" data-galkind="${t.kind}" data-galtype="${t.type}" data-q="${figEsc((t.name+' '+t.type+' '+t.kind).toLowerCase())}"${st.kind===t.kind?' title="いまのデータのまま切り替えられます"':''}><span class="th"></span><span class="nm">${figEsc(t.name)}</span></button>`).join('')}</div></div>`).join('');
  dlg.querySelector('#figGalQ').value='';dlg.showModal();
  const cur=dlg.querySelector('.figGalCard.on');if(cur)cur.scrollIntoView({block:'center'});
  // サムネイルは少しずつ描く（初回だけ計算。以後はキャッシュ）
  const cards=[...dlg.querySelectorAll('.figGalCard')];const token=figGalleryOpen.token=(figGalleryOpen.token||0)+1;
  (async()=>{let n=0;const t0=Date.now();let slice=Date.now();for(const c of cards){if(figGalleryOpen.token!==token||!dlg.open)return;const svg=figGalThumb(c.dataset.galkind,c.dataset.galtype);c.querySelector('.th').innerHTML=svg||'<span class="hint">（見本なし）</span>';n++;if(Date.now()-slice>24){await new Promise(r=>setTimeout(r));slice=Date.now();}}})();
}
function figGalFilter(){const dlg=document.querySelector('#figGalDlg');const q=dlg.querySelector('#figGalQ').value.trim().toLowerCase();dlg.querySelectorAll('.figGalSec').forEach(sec=>{let any=false;sec.querySelectorAll('.figGalCard').forEach(c=>{const ok=!q||c.dataset.q.includes(q);c.style.display=ok?'':'none';if(ok)any=true;});sec.style.display=any?'':'none';});}
// 図を選んだとき
async function figGalleryPick(kind,type){
  const $=s=>document.querySelector(s);const st=figState;if(!st)return;const dlg=$('#figGalDlg');const withData=$('#figGalData').checked;
  const text=$('#figData').value;const mine=!!text.trim()&&text!==FIG_DEFAULT_TEXT&&text!==st.sampleText; // 利用者が入れたデータか
  if(st.kind===kind&&!withData){st.type=type;dlg.close();figSync(false);figPushUndo();return;}
  const s=figSample(kind,type);if(!s){toast('この図の例のデータがありません');return;}
  if(mine&&!await askConfirm('いま入力されているデータを、この図の例のデータに置き換えます。\n（データを残したまま種類だけ変えられるのは、同じ表の形の図です）','置き換える'))return;
  $('#figData').value=s.data;st.text=s.data;st.sampleText=s.data;st.kind=kind;st.type=type;st.cmp=s.compare||'none';st.ctrl=0;st.sel=null;$('#figKind').value=kind;$('#figCmp').value=st.cmp;
  const o=st.opts;o.yTitle='';o.xTitle=s.xtitle||'';o.ymin='';o.ymax='';delete o.series;delete o.notes;const x={};for(const k of ['nes','pval','fdr'])if(s[k]!=null)x[k]=s[k];o.x=x;if(s.style)Object.assign(o,s.style);
  document.querySelectorAll('#figDlg [data-fopt]').forEach(el=>{const v=o[el.dataset.fopt];if(el.type==='checkbox')el.checked=!!v;else el.value=v==null?'':v;});
  dlg.close();figSync(false);figPushUndo();toast('例のデータを入れました。左の表を自分のデータに書き換えてください');
}
