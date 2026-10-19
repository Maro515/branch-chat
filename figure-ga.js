// BranCHAT Figure 拡張（グラフィカルアブストラクト）
// ```figure の {"kind":"ga","theme":"soft|flat|line|glossy|mono","accent":"#0E9F9A","w":960,"h":540,"title":"…","items":[…]} を描く。
// イラストは医学・生化学の GA 300 件（15 ジャンル・41 誌）の調査で多かったモチーフを独自に描き起こしたもの（GA_LIB、87 種）。
// 形は 1 組だけ持ち、絵柄（テーマ）は 5 つから選ぶ: soft（ソフト陰影＋細い輪郭）/ flat（フラット）/ line（線画）/ glossy（立体）/ mono（モノトーン＋主役だけ 1 色）。
// 色は SVG の中で確定させて書き出す（CSS 変数や color-mix を使わない）ので、保存した SVG を他のソフトで開いても色が崩れない。
// items: {t:'motif',m,x,y,s,rot,flip,key,label} / {t:'text',x,y,text,size,bold,color,anchor} / {t:'arrow',x1,y1,x2,y2,kind:'arrow|inhibit|curved|dashed|double',color,width,label,bend} / {t:'box',x,y,w,h,title,fill,stroke,dash,r}
'use strict';
const GA_LIB=(()=>{
const P=(d,c)=>`<path class="${c}" d="${d}"/>`,C=(x,y,r,c)=>`<circle class="${c}" cx="${x}" cy="${y}" r="${r}"/>`,E=(x,y,rx,ry,c,t)=>`<ellipse class="${c}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"${t?` transform="${t}"`:''}/>`,R=(x,y,w,h,r,c,t)=>`<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"${t?` transform="${t}"`:''}/>`,L=(x1,y1,x2,y2,c)=>`<line class="${c}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
// 円周上の点
const around=(n,cx,cy,r,f)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2;return f(cx+Math.cos(a)*r,cy+Math.sin(a)*r,a,i);}).join('');
// なめらかな閉じた形（点列を Catmull-Rom で）
function blob(pts){const n=pts.length;let d=`M${pts[0][0]},${pts[0][1]}`;for(let i=0;i<n;i++){const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];d+=`C${(p1[0]+(p2[0]-p0[0])/6).toFixed(1)},${(p1[1]+(p2[1]-p0[1])/6).toFixed(1)} ${(p2[0]-(p3[0]-p1[0])/6).toFixed(1)},${(p2[1]-(p3[1]-p1[1])/6).toFixed(1)} ${p2[0]},${p2[1]}`;}return d+'Z';}
const radial=(cx,cy,rs)=>rs.map((r,i)=>{const a=i/rs.length*Math.PI*2-Math.PI/2;return [+(cx+Math.cos(a)*r).toFixed(1),+(cy+Math.sin(a)*r).toFixed(1)];});
const wave=(x0,x1,y,amp,per,ph)=>{let d='';for(let x=x0;x<=x1;x+=1){const yy=y+Math.sin((x-x0)/per*Math.PI*2+(ph||0))*amp;d+=(x===x0?'M':'L')+x+','+yy.toFixed(1);}return d;};

const MOTIFS={
 // ---- 細胞 ----
 cell_generic:{ja:'細胞',cat:'細胞',c:['#7FB2E5','#8E6CC2','#C9B6EE'],svg:
  C(50,50,38,'b')+E(40,38,12,7,'hl','rotate(-30 40 38)')+C(57,53,15,'b2 acc')+C(60,50,4.5,'b3')+C(30,62,3,'b3')+C(36,72,2.4,'b3')+C(70,30,2.6,'b3')},
 cancer_cell:{ja:'がん細胞',cat:'細胞',c:['#C98BD6','#6B3F94','#E8C9F0'],svg:
  P(blob(radial(50,51,[37,30,39,33,40,29,36,38,31,39,34,37])),'b')+E(38,35,10,6,'hl','rotate(-35 38 35)')+P(blob(radial(53,53,[18,14,19,13,17,15,20,14])),'b2 acc')+C(49,50,3.6,'b3')+C(58,57,2.8,'b3')+C(22,58,4,'b')+C(80,40,3.4,'b')},
 t_cell:{ja:'T 細胞',cat:'細胞',c:['#6FB7E2','#2F5F9E','#BFE0F6'],svg:
  around(16,50,50,36,(x,y,a)=>`<line class="d" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(50+Math.cos(a)*42).toFixed(1)}" y2="${(50+Math.sin(a)*42).toFixed(1)}"/>`)+C(50,50,35,'b acc')+E(39,37,10,6,'hl','rotate(-30 39 37)')+C(52,53,22,'b2')+C(56,48,4,'b3')+around(4,50,50,36,(x,y,a)=>{const g=(a*180/Math.PI+90).toFixed(0);return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${g})"><path class="b3 acc" d="M0,0 L0,-6 M0,-6 L-3.5,-10 M0,-6 L3.5,-10" stroke-width="2.6" fill="none" style="stroke:var(--c2)"/></g>`;})},
 macrophage:{ja:'マクロファージ',cat:'細胞',c:['#F0A877','#A3523A','#FAD7BF'],svg:
  P(blob([[50,10],[62,22],[80,16],[78,34],[92,46],[78,58],[84,78],[64,74],[52,90],[42,74],[20,82],[24,62],[8,50],[24,40],[18,20],[38,26]]),'b')+E(36,32,9,5,'hl','rotate(-30 36 32)')+P('M44,44 C44,36 60,34 62,44 C64,52 56,52 54,58 C52,64 42,60 44,52 Z','b2 acc')+C(66,60,4,'b3')+C(36,62,3.5,'b3')+C(64,34,3,'b3')},
 neutrophil:{ja:'好中球',cat:'細胞',c:['#F4B8C8','#9A4E9E','#FBE0E8'],svg:
  C(50,50,36,'b')+E(39,37,10,6,'hl','rotate(-30 39 37)')+P('M33,52 C30,42 40,38 44,44 C46,36 56,36 57,44 C62,38 72,44 68,52 C72,60 62,66 57,60 C54,68 44,66 44,60 C38,64 32,60 33,52Z','b2 acc')+around(9,50,50,27,(x,y)=>C(x.toFixed(1),y.toFixed(1),1.8,'b3'))},
 dendritic_cell:{ja:'樹状細胞',cat:'細胞',c:['#8FD0B5','#2E7D63','#CDEEE0'],svg:
  P('M50,30 C56,18 62,10 66,8 C64,16 60,24 62,32 C72,26 84,22 92,24 C84,30 74,36 70,42 C80,48 90,58 92,66 C82,62 72,56 66,60 C66,72 64,84 58,92 C56,82 54,72 48,68 C40,76 28,84 18,86 C24,76 32,68 34,60 C24,56 12,52 8,46 C18,44 30,46 36,40 C30,30 26,20 26,12 C34,18 42,26 50,30Z','b')+C(52,49,13,'b2 acc')+C(55,46,3,'b3')},
 rbc:{ja:'赤血球',cat:'細胞',c:['#E2524F','#B12C2E','#F59A92'],svg:
  E(50,50,40,30,'b')+E(50,50,22,15,'b2 acc')+E(36,36,10,5,'hl','rotate(-20 36 36)')},
 platelet:{ja:'血小板',cat:'細胞',c:['#F3C76A','#C08A1E','#FBE6B6'],svg:
  P(blob(radial(50,50,[28,22,30,20,27,24,30,21])),'b acc')+C(44,48,3,'b2')+C(56,54,2.5,'b2')+C(52,42,2,'b3')+E(42,40,7,4,'hl','rotate(-25 42 40)')},
 stem_cell:{ja:'幹細胞',cat:'細胞',c:['#9AD2E6','#3A8FB0','#DDF1F8'],svg:
  C(50,50,36,'b')+E(39,37,10,6,'hl','rotate(-30 39 37)')+C(50,52,24,'b2 acc')+C(54,48,5,'b3')+P('M26,30 L22,22 M74,30 L78,22 M50,14 L50,6','d')+C(22,20,3,'b3')+C(78,20,3,'b3')+C(50,5,3,'b3')},
 neuron:{ja:'神経細胞',cat:'細胞',c:['#F2B05E','#B4702A','#FBE2BE'],svg:
  P('M26,42 L12,30 M26,42 L10,46 M30,34 L24,16 M36,32 L44,14 M28,52 L14,62 M36,54 L30,70','d')+P(blob([[30,30],[42,32],[46,44],[40,56],[28,56],[22,44]]),'b acc')+C(34,44,5,'b2')+P('M44,46 C56,48 64,52 74,58 C80,62 84,66 88,72','d')+P('M88,72 L94,68 M88,72 L92,80 M88,72 L82,80','d')+R(52,45,7,5,2.5,'b3','rotate(12 55 48)')+R(64,51,7,5,2.5,'b3','rotate(22 67 54)')},
 adipocyte:{ja:'脂肪細胞',cat:'細胞',c:['#F6DE8E','#E0B23A','#FFF4CF'],svg:
  C(50,50,38,'b2')+C(52,48,32,'b acc')+E(42,38,10,6,'hl','rotate(-30 42 38)')+P('M18,62 C22,74 32,84 44,87 C34,82 26,74 22,62Z','b3')},
 // ---- 病原体 ----
 bacteria:{ja:'細菌',cat:'病原体',c:['#8CC66A','#4E8A2E','#D3EBC2'],svg:
  P('M84,56 C90,60 92,68 96,70 M82,62 C86,70 86,78 90,82 M16,44 C10,40 8,32 4,30 M18,38 C14,30 14,22 10,18','d')+R(14,34,72,32,16,'b acc','rotate(-12 50 50)')+E(36,42,12,4,'hl','rotate(-12 36 42)')+P('M38,50 C44,44 52,56 60,48','d')},
 virus:{ja:'ウイルス',cat:'病原体',c:['#E46E7F','#A7344A','#F7C3CB'],svg:
  around(12,50,50,30,(x,y,a)=>`<line class="d" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(50+Math.cos(a)*40).toFixed(1)}" y2="${(50+Math.sin(a)*40).toFixed(1)}"/>`)+around(12,50,50,41,(x,y)=>C(x.toFixed(1),y.toFixed(1),4.4,'b2'))+C(50,50,30,'b acc')+E(40,40,9,5,'hl','rotate(-30 40 40)')+C(56,56,4,'b3')+C(44,58,3,'b3')+C(60,42,3,'b3')},
 // ---- 細胞内 ----
 nucleus:{ja:'核',cat:'細胞内',c:['#9C7BD3','#5B3C9A','#D9CBF2'],svg:
  C(50,50,40,'b2')+C(50,50,35,'b')+around(10,50,50,37.5,(x,y)=>C(x.toFixed(1),y.toFixed(1),2.2,'b3'))+P('M30,46 C36,38 42,54 48,44 C54,34 60,52 66,42 M32,60 C40,54 46,66 54,58 C60,52 64,64 70,58','d')+C(58,62,8,'b2 acc')+E(40,34,10,6,'hl','rotate(-30 40 34)')},
 mitochondria:{ja:'ミトコンドリア',cat:'細胞内',c:['#F08A5D','#B8452A','#FCD2BC'],svg:
  R(8,24,84,52,26,'b acc','rotate(-15 50 50)')+R(14,30,72,40,20,'b3','rotate(-15 50 50)')+`<path class="d" d="M20,58 L26,38 L32,62 L38,36 L44,64 L50,34 L56,62 L62,36 L68,60 L74,40 L80,54" transform="rotate(-15 50 50)"/>`+E(30,34,12,4,'hl','rotate(-15 30 34)')},
 er:{ja:'小胞体',cat:'細胞内',c:['#7CC7C4','#2F807D','#CBEDEB'],svg:
  P('M10,30 C30,18 50,40 70,28 C80,22 88,24 92,30 L92,38 C86,32 80,32 70,38 C50,50 30,28 10,40Z','b acc')+P('M10,50 C30,38 50,60 70,48 C80,42 88,44 92,50 L92,58 C86,52 80,52 70,58 C50,70 30,48 10,60Z','b')+P('M10,70 C30,58 50,80 70,68 C80,62 88,64 92,70 L92,78 C86,72 80,72 70,78 C50,90 30,68 10,80Z','b')+[[18,28],[34,26],[52,36],[70,26],[22,48],[44,52],[62,48],[80,44],[30,68],[56,74],[78,64]].map(([x,y])=>C(x,y-3,1.8,'b2')).join('')},
 lysosome:{ja:'リソソーム',cat:'細胞内',c:['#E5A0C9','#A24E86','#F6D8EA'],svg:
  C(50,50,32,'b2')+C(50,50,28,'b acc')+[[42,44],[56,40],[60,56],[46,60],[52,50],[38,54]].map(([x,y])=>C(x,y,3.2,'b3')).join('')+E(40,38,8,5,'hl','rotate(-30 40 38)')},
 vesicle_exosome:{ja:'エクソソーム・小胞',cat:'細胞内',c:['#86C9E8','#2F7FAE','#D4EEF9'],svg:
  C(50,50,30,'b2')+C(50,50,25,'b3')+around(8,50,50,30,(x,y,a)=>`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(a*180/Math.PI+90).toFixed(0)})">${R(-3,-9,6,9,3,'b acc')}</g>`)+C(46,48,4,'b')+C(56,56,3,'b')+E(42,40,7,4,'hl','rotate(-30 42 40)')},
 membrane_receptor:{ja:'細胞膜と受容体',cat:'細胞内',c:['#F2C47E','#4D7FC1','#E7F0FB'],svg:
  Array.from({length:12},(_,i)=>{const x=6+i*8;return (x>36&&x<64)?'':C(x,56,3.4,'b')+C(x,74,3.4,'b')+L(x-1.2,59,x-1.2,66,'d')+L(x+1.2,59,x+1.2,66,'d')+L(x-1.2,64,x-1.2,71,'d')+L(x+1.2,64,x+1.2,71,'d');}).join('')+R(40,50,8,32,4,'b2 acc')+R(52,50,8,32,4,'b2 acc')+P('M36,50 C36,30 46,26 46,20 L54,20 C54,26 64,30 64,50Z','b2')+C(50,12,6,'b3')+P('M44,82 L40,94 M56,82 L60,94','d')+C(28,22,4,'b3')+C(74,28,4,'b3')},
 // ---- 分子 ----
 dna_helix:{ja:'DNA',cat:'分子',c:['#5B8DEF','#E8655A','#BFD2FA'],svg:
  (()=>{let s='';for(let i=0;i<9;i++){const y=10+i*10;const x1=50+Math.sin(i/9*Math.PI*2.2)*26,x2=50-Math.sin(i/9*Math.PI*2.2)*26;s+=`<line class="d" x1="${x1.toFixed(1)}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" style="stroke-width:3.2"/>`;}
   let a='',b='';for(let y=6;y<=94;y+=2){const t=(y-10)/90*Math.PI*2.2;a+=(y===6?'M':'L')+(50+Math.sin(t)*26).toFixed(1)+','+y;b+=(y===6?'M':'L')+(50-Math.sin(t)*26).toFixed(1)+','+y;}
   return s+`<path class="b acc" d="${a}" style="fill:none;stroke:var(--s1);stroke-width:6;stroke-linecap:round"/><path class="b2" d="${b}" style="fill:none;stroke:var(--s2);stroke-width:6;stroke-linecap:round"/>`;})()},
 rna_strand:{ja:'mRNA',cat:'分子',c:['#E58AA0','#8B3A5A','#F7CFD9'],svg:
  Array.from({length:10},(_,i)=>{const x=22+i*6.4;const y=50+Math.sin((x-14)/30*Math.PI*2)*12;return `<line class="d" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y-9).toFixed(1)}" style="stroke-width:3;stroke:var(--s2)"/>`;}).join('')+`<path class="b acc" d="${wave(14,84,50,12,30)}" style="fill:none;stroke:var(--s1);stroke-width:6;stroke-linecap:round"/>`+C(11,50,7,'b2')+P('M84,50 l3,-5 l3,5 l3,-5 l3,5','d')},
 antibody:{ja:'抗体',cat:'分子',c:['#5FA8D3','#1F5F8B','#BFDDF0'],svg:
  R(42,46,7,44,3.5,'b')+R(51,46,7,44,3.5,'b')+`<g transform="rotate(-38 46 46)">${R(42,8,7,40,3.5,'b')}${R(34,8,7,28,3.5,'b3 acc')}</g><g transform="rotate(38 54 46)">${R(51,8,7,40,3.5,'b')}${R(59,8,7,28,3.5,'b3 acc')}</g>`},
 protein_blob:{ja:'タンパク質',cat:'分子',c:['#9DBE6E','#577A2A','#DCEAC6'],svg:
  C(36,40,18,'b')+C(60,36,16,'b2 acc')+C(56,62,19,'b')+C(34,64,13,'b3')+E(32,34,7,4,'hl','rotate(-30 32 34)')},
 ligand_cytokine:{ja:'サイトカイン・リガンド',cat:'分子',c:['#F2A65A','#C46B1E','#FBDDBA'],svg:
  [[30,30,7],[56,24,6],[72,44,8],[44,52,9],[64,70,7],[30,70,6],[80,76,5],[18,50,5]].map(([x,y,r],i)=>i%3===0?C(x,y,r,'b acc'):i%3===1?`<polygon class="b2" points="${x},${y-r} ${x+r},${y+r*.8} ${x-r},${y+r*.8}"/>`:R(x-r,y-r,r*2,r*2,2,'b3')).join('')},
 phosphate:{ja:'リン酸化（P）',cat:'分子',c:['#F5C542','#B98A0E','#FDEBB0'],svg:
  C(50,50,30,'b acc')+`<text x="50" y="62" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="34" class="tx">P</text>`},
 small_molecule:{ja:'低分子化合物',cat:'分子',c:['#6E7FD6','#3B4AA3','#D3D9F6'],svg:
  `<polygon class="b3" points="50,22 72,35 72,61 50,74 28,61 28,35"/><polygon class="d" points="50,22 72,35 72,61 50,74 28,61 28,35" style="fill:none;stroke-width:3"/>`+P('M33,38 L50,28 M67,58 L50,68','d')+L(72,35,88,26,'d')+C(90,25,6,'b acc')+L(28,61,12,70,'d')+C(10,71,6,'b2')+L(50,22,50,8,'d')+C(50,7,5,'b')},
 ros:{ja:'活性酸素（ROS）',cat:'分子',c:['#F25C54','#B12A24','#FBC7C3'],svg:
  `<polygon class="b acc" points="${Array.from({length:16},(_,i)=>{const r=i%2?18:40,a=i/16*Math.PI*2;return (50+Math.cos(a)*r).toFixed(1)+','+(50+Math.sin(a)*r).toFixed(1);}).join(' ')}"/>`+C(50,50,14,'b3')+`<text x="50" y="56" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="16" class="tx">O•</text>`},
 // ---- 治療・送達 ----
 nanoparticle:{ja:'ナノ粒子',cat:'治療',c:['#7AD0C6','#2B8C80','#C9EEE9'],svg:
  around(14,50,50,30,(x,y,a)=>`<path class="d" d="M${x.toFixed(1)},${y.toFixed(1)} q${(Math.cos(a+0.6)*5).toFixed(1)},${(Math.sin(a+0.6)*5).toFixed(1)} ${(Math.cos(a)*10).toFixed(1)},${(Math.sin(a)*10).toFixed(1)}"/>`)+around(7,50,50,41,(x,y)=>C(x.toFixed(1),y.toFixed(1),3.4,'b2'))+C(50,50,30,'b acc')+[[44,46],[58,52],[50,60],[56,40]].map(([x,y])=>C(x,y,3.6,'b3')).join('')+E(40,38,9,5,'hl','rotate(-30 40 38)')},
 liposome_lnp:{ja:'リポソーム・LNP',cat:'治療',c:['#F3B36B','#B76E22','#FDE6C8'],svg:
  around(22,50,50,36,(x,y)=>C(x.toFixed(1),y.toFixed(1),3.6,'b'))+around(18,50,50,28,(x,y)=>C(x.toFixed(1),y.toFixed(1),3.2,'b'))+C(50,50,22,'b3')+`<path class="b2 acc" d="${wave(38,62,50,4,10)}" style="fill:none;stroke:var(--s2);stroke-width:3"/>`},
 hydrogel:{ja:'ハイドロゲル',cat:'治療',c:['#8EC5F0','#3A7DBF','#DCEEFC'],svg:
  P(blob(radial(50,52,[38,36,40,34,38,37,40,35])),'b')+[[30,40,46,30],[46,30,64,38],[64,38,70,58],[70,58,52,70],[52,70,32,62],[32,62,30,40],[46,30,52,50],[52,50,70,58],[52,50,32,62],[52,50,52,70]].map(([a,b,c,d])=>L(a,b,c,d,'d')).join('')+[[30,40],[46,30],[64,38],[70,58],[52,70],[32,62],[52,50]].map(([x,y])=>C(x,y,3.6,'b2 acc')).join('')+E(36,30,10,5,'hl','rotate(-25 36 30)')},
 syringe:{ja:'注射',cat:'治療',c:['#BFD7EA','#4C7FA8','#E9F2F9'],svg:
  `<g transform="rotate(-40 50 50)">${R(30,40,44,20,3,'b3')}${R(32,42,26,16,2,'b acc')}${R(74,46,8,8,1,'b2')}${L(82,50,98,50,'d')}${R(16,44,14,12,2,'b2')}${R(8,38,6,24,2,'b2')}${L(40,40,40,46,'d')}${L(48,40,48,46,'d')}${L(56,40,56,46,'d')}</g>`},
 pill:{ja:'錠剤・カプセル',cat:'治療',c:['#F06A6A','#F4F4F4','#B33A3A'],svg:
  `<g transform="rotate(-35 50 50)">${P('M50,32 L32,32 A18,18 0 0 0 32,68 L50,68Z','b acc')}${P('M50,32 L68,32 A18,18 0 0 1 68,68 L50,68Z','b2')}${E(34,40,9,3.5,'hl')}</g>`},
 iv_drip:{ja:'点滴',cat:'治療',c:['#9BC8E8','#3F7FB2','#E3F1FA'],svg:
  R(34,8,32,42,8,'b3')+R(36,22,28,26,6,'b acc')+R(46,50,8,8,2,'b2')+P('M50,58 C50,72 62,74 62,86 C62,92 56,94 52,92','d')+L(30,8,70,8,'d')+E(42,28,4,8,'hl')},
 light_laser:{ja:'光・レーザー',cat:'治療',c:['#F7D046','#E0902A','#FDF0B8'],svg:
  `<polygon class="b acc" points="56,6 26,54 46,54 38,94 74,40 52,40 64,6"/>`+E(52,22,4,8,'hl','rotate(25 52 22)')},
 // ---- 生物・臓器 ----
 mouse:{ja:'マウス',cat:'生物',c:['#C7CBD6','#F2A9B5','#8D93A3'],svg:
  P('M86,62 C96,64 98,76 90,80 C84,84 76,78 70,80','d')+P('M22,52 C24,36 40,28 58,30 C76,32 88,44 86,60 C84,72 70,76 52,76 C36,76 26,72 22,66 L12,62 C8,60 8,56 12,54Z','b acc')+C(34,34,9,'b')+C(34,34,5.5,'b2')+C(22,52,2.2,'ink')+C(9,58,2.6,'b2')+P('M10,58 L2,54 M10,60 L2,62','d')+P('M40,76 L38,84 M64,76 L66,84','d')+E(52,42,14,5,'hl','rotate(-8 52 42)')},
 human_figure:{ja:'人',cat:'生物',c:['#8FA9D6','#F2C9A9','#5C79AE'],svg:
  C(50,20,12,'b2')+P('M28,56 C28,40 38,34 50,34 C62,34 72,40 72,56 L72,64 C72,68 66,68 66,64 L66,54 L64,54 L64,92 C64,96 56,96 56,92 L56,70 L44,70 L44,92 C44,96 36,96 36,92 L36,54 L34,54 L34,64 C34,68 28,68 28,64Z','b acc')+E(44,42,6,3,'hl','rotate(-20 44 42)')},
 heart:{ja:'心臓',cat:'臓器',c:['#E2575B','#B03338','#F4A4A2'],svg:
  P('M46,34 L46,18 C46,8 58,6 66,10 C72,13 76,18 76,24 L68,26 C68,20 64,16 58,16 C54,16 54,20 54,24 L54,34Z','b2')+R(30,14,9,22,4.5,'b3')+P('M50,30 C34,22 16,32 18,50 C20,68 38,82 54,92 C70,82 86,66 84,48 C82,30 64,24 50,30Z','b acc')+P('M52,34 C58,50 50,66 58,86','d')+E(32,46,8,5,'hl','rotate(-35 32 46)')},
 liver:{ja:'肝臓',cat:'臓器',c:['#B6533F','#7E2F22','#E3A08E'],svg:
  P('M10,40 C14,26 36,22 56,24 C74,26 92,28 92,38 C92,48 80,56 66,62 C52,68 40,76 30,74 C18,72 8,58 10,40Z','b acc')+P('M58,26 C56,40 54,52 52,66','d')+P('M44,62 C46,70 50,74 56,72 C58,66 54,62 50,62Z','b3')+E(30,36,12,5,'hl','rotate(-10 30 36)')},
 brain:{ja:'脳',cat:'臓器',c:['#F2A7B8','#B9607A','#FBD9E2'],svg:
  P('M22,62 C10,58 8,40 18,32 C20,18 36,12 48,16 C58,8 76,12 80,24 C92,28 94,46 86,56 C88,68 76,76 66,72 C60,80 46,80 40,74 C32,78 22,72 22,62Z','b acc')+P('M30,30 C36,34 34,42 42,42 M50,20 C50,30 58,32 58,40 M70,26 C66,34 72,40 78,42 M26,52 C34,50 38,58 46,56 M54,52 C60,58 68,54 72,62 M44,66 C48,60 54,64 56,58','d')+P('M58,74 C60,82 58,88 54,94 L48,94 C52,88 52,80 50,74Z','b2')},
 lung:{ja:'肺',cat:'臓器',c:['#F09BAA','#B85068','#FBD3DB'],svg:
  R(46,6,8,26,4,'b3')+P('M50,30 L38,42 M50,30 L62,42','d')+P('M42,34 C30,30 16,40 14,58 C12,76 18,90 30,90 C40,90 44,80 44,66 L44,40Z','b acc')+P('M58,34 C70,30 84,40 86,58 C88,76 82,90 70,90 C60,90 56,80 56,66 L56,40Z','b')+P('M38,44 L30,58 M38,52 L34,70 M62,44 L70,58 M62,52 L66,70','d')+E(26,52,5,9,'hl','rotate(20 26 52)')},
 kidney:{ja:'腎臓',cat:'臓器',c:['#C9614F','#8D3527','#ECADA0'],svg:
  P('M54,14 C30,10 14,28 16,52 C18,76 36,92 56,86 C66,82 66,70 60,62 C56,56 56,46 60,40 C66,32 70,18 54,14Z','b acc')+P('M60,42 C68,44 74,40 80,36 M60,58 C68,58 72,64 78,70 M62,50 C72,50 80,52 88,54','d')+P('M62,52 C66,62 70,76 72,94','b2')+E(30,32,8,5,'hl','rotate(-40 30 32)')},
 intestine:{ja:'腸',cat:'臓器',c:['#F2A88E','#BF6249','#FBDACD'],svg:
  P('M20,30 C20,16 80,16 80,30 L80,78 C80,90 70,92 66,82 M20,30 L20,70 C20,82 34,82 34,70 C34,60 46,60 46,70 C46,80 58,80 58,70 C58,60 66,58 68,50 C70,42 60,40 54,44 C46,48 36,44 36,40 C36,34 48,34 52,36','tube acc')+P('M20,30 C20,16 80,16 80,30 L80,78 C80,90 70,92 66,82 M20,30 L20,70 C20,82 34,82 34,70 C34,60 46,60 46,70 C46,80 58,80 58,70 C58,60 66,58 68,50 C70,42 60,40 54,44 C46,48 36,44 36,40 C36,34 48,34 52,36','gut')},
 tumor_mass:{ja:'腫瘍',cat:'臓器',c:['#B985CF','#6E3F8C','#E3CDEE'],svg:
  [[50,50,20],[30,40,14],[70,38,15],[34,66,15],[66,66,16],[50,26,12],[50,76,12],[20,56,9],[82,54,10]].map(([x,y,r])=>C(x,y,r,'b acc')+C(x+r*.2,y+r*.1,r*.38,'b2')).join('')+E(40,30,8,4,'hl','rotate(-25 40 30)')},
 blood_vessel:{ja:'血管',cat:'臓器',c:['#E86B6B','#B23C3C','#F7C0C0'],svg:
  R(6,28,88,44,22,'b')+R(10,34,80,32,16,'b3')+E(30,50,9,6,'b2 acc')+E(52,46,9,6,'b2 acc')+E(72,54,9,6,'b2 acc')+E(30,50,4,2.5,'b')+E(52,46,4,2.5,'b')+E(72,54,4,2.5,'b')},
 // ---- 実験 ----
 microscope:{ja:'顕微鏡',cat:'実験',c:['#9AA6B8','#4E5B70','#D9DEE6'],svg:
  R(20,84,56,8,3,'b2')+P('M58,84 C74,76 74,52 60,44','d')+R(36,14,14,40,4,'b acc','rotate(-25 43 34)')+R(40,6,12,10,3,'b2','rotate(-25 46 11)')+R(30,60,30,6,2,'b')+R(52,48,8,36,3,'b2')+C(48,68,4,'b3')},
 plate_dish:{ja:'ウェルプレート',cat:'実験',c:['#A9C8E8','#4B7DB0','#E3EEF8'],svg:
  R(8,22,84,56,8,'b')+Array.from({length:12},(_,i)=>C(22+(i%4)*19,36+Math.floor(i/4)*14,5.6,i%5===0?'b2 acc':'b3')).join('')},
 tube_flask:{ja:'フラスコ・試験管',cat:'実験',c:['#A3D9C9','#3E8E77','#E6F6F1'],svg:
  P('M38,8 L62,8 M42,8 L42,38 L18,82 C16,88 20,92 26,92 L74,92 C80,92 84,88 82,82 L58,38 L58,8','b3')+P('M30,62 L70,62 L82,82 C84,88 80,92 74,92 L26,92 C20,92 16,88 18,82Z','b acc')+C(42,76,3,'b2')+C(56,82,2.4,'b2')+C(52,70,2,'b2')},
 plot_chart:{ja:'グラフ',cat:'実験',c:['#7FA7DB','#E7816F','#D6E3F4'],svg:
  P('M14,10 L14,86 L92,86','ink')+R(24,50,12,36,1,'b')+R(44,30,12,56,1,'b2 acc')+R(64,58,12,28,1,'b')+L(30,42,30,50,'d')+L(50,20,50,30,'d')+L(70,50,70,58,'d')},
 sequencer:{ja:'オミクス・ヒートマップ',cat:'実験',c:['#E46B5D','#4F86C6','#F6F2EE'],svg:
  Array.from({length:30},(_,i)=>{const r=Math.floor(i/6),c=i%6;const v=Math.sin(r*1.7+c*1.1);return R(14+c*12.5,18+r*13,11.5,12,1.5,v>0.25?'b acc':v<-0.25?'b2':'b3');}).join('')},
 b_cell:{ja:'B 細胞',cat:'細胞',c:['#7FC8A9','#2E7D5B','#CDEEDF'],svg:
  C(50,50,34,'b acc')+E(39,37,10,6,'hl','rotate(-30 39 37)')+C(52,52,21,'b2')+C(56,47,4,'b3')+around(6,50,50,34,(x,y,a)=>`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(a*180/Math.PI+90).toFixed(0)})"><path class="b3 acc" d="M0,0 L0,-7 M0,-7 L-4,-12 M0,-7 L4,-12" style="fill:none;stroke:var(--c2);stroke-width:3;stroke-linecap:round"/></g>`)},
 nk_cell:{ja:'NK 細胞',cat:'細胞',c:['#9FA8E8','#3D4AA8','#DCE0FA'],svg:
  C(50,50,34,'b acc')+E(39,37,10,6,'hl','rotate(-30 39 37)')+P('M42,44 C40,34 56,32 60,40 C64,48 58,54 54,58 C50,62 44,56 42,50Z','b2')+[[66,58],[62,66],[34,62],[70,46]].map(([x,y])=>C(x,y,3.2,'b3 acc')).join('')},
 fibroblast:{ja:'線維芽細胞',cat:'細胞',c:['#E9B98A','#9A6232','#F7E1C8'],svg:
  P('M6,58 C20,50 30,40 46,40 C60,40 72,34 94,26 C80,40 70,50 56,56 C42,62 26,64 6,58Z','b acc')+E(48,50,10,5,'b2','rotate(-15 48 50)')+P('M14,64 C30,70 52,70 70,62 M30,30 C44,26 60,26 76,18','d')+E(34,48,8,3,'hl','rotate(-15 34 48)')},
 endothelial:{ja:'内皮細胞',cat:'細胞',c:['#F1938C','#B04A45','#FAD0CC'],svg:
  R(6,56,88,22,6,'b3')+[10,32,54,76].map(x=>R(x,40,20,18,9,'b acc')+E(x+10,49,5,3,'b2')).join('')+P('M6,36 L94,36','d')},
 epithelial:{ja:'上皮（細胞の層）',cat:'細胞',c:['#9DCAE8','#3B79A8','#DCEEF8'],svg:
  R(6,74,88,12,3,'b3')+[8,26,44,62,80].map(x=>R(x,30,16,44,4,'b acc')+C(x+8,58,4.5,'b2')+P(`M${x+2},30 l2,-5 l2,5 l2,-5 l2,5 l2,-5 l2,5`,'d')).join('')},
 hepatocyte:{ja:'肝細胞',cat:'細胞',c:['#D9876E','#8E3F2C','#F2C9BB'],svg:
  `<polygon class="b acc" points="50,10 84,30 84,70 50,90 16,70 16,30"/>`+C(42,46,9,'b2')+C(60,58,7,'b2')+[[30,66],[66,34],[56,76]].map(([x,y])=>C(x,y,3,'b3')).join('')+E(36,28,9,4,'hl','rotate(-30 36 28)')},
 organoid:{ja:'オルガノイド',cat:'細胞',c:['#B7D98A','#5E8A2E','#E9F4D9'],svg:
  C(50,50,38,'b')+C(50,50,20,'b3')+around(14,50,50,29,(x,y)=>C(x.toFixed(1),y.toFixed(1),5,'b2 acc'))+E(36,30,10,5,'hl','rotate(-30 36 30)')},
 skin:{ja:'皮膚（断面）',cat:'臓器',c:['#F2C1A0','#C07A55','#FBE5D6'],svg:
  P('M6,30 C20,26 34,32 50,28 C66,24 80,30 94,26 L94,40 L6,44Z','b2')+R(6,42,88,24,0,'b')+R(6,66,88,24,0,'b3')+P('M30,44 C26,56 34,62 30,70 M70,44 C74,54 66,60 72,70','d')+C(30,72,4,'b2 acc')+C(72,72,4,'b2 acc')+[[18,80],[44,82],[60,78],[84,82]].map(([x,y])=>C(x,y,4,'b3')).join('')},
 bone_joint:{ja:'骨・関節',cat:'臓器',c:['#EDE3C8','#B8A06A','#FFF8E8'],svg:
  `<g transform="rotate(-35 50 50)">${R(40,24,20,52,6,'b acc')}${C(38,22,9,'b')}${C(62,22,9,'b')}${C(38,78,9,'b')}${C(62,78,9,'b')}${R(40,24,20,52,6,'b acc')}${E(46,40,3,12,'hl')}</g>`},
 pancreas:{ja:'膵臓',cat:'臓器',c:['#F1C27D','#B88234','#FBE6C4'],svg:
  P('M10,54 C10,40 24,38 34,42 C48,48 60,40 74,36 C86,32 94,40 90,48 C86,54 76,54 66,58 C52,64 40,70 26,70 C16,70 10,64 10,54Z','b acc')+P('M20,56 C36,56 54,50 82,42','d')+E(24,48,6,3,'hl','rotate(-15 24 48)')},
 stomach:{ja:'胃',cat:'臓器',c:['#F2A3A0','#B35A57','#FBD7D5'],svg:
  P('M30,8 L40,8 L40,22 C40,30 46,34 54,32 C70,28 84,40 82,58 C80,78 62,90 44,86 C30,82 26,68 34,60 C40,54 30,48 28,40 C26,32 30,24 30,8Z','b acc')+P('M44,40 C54,40 66,48 66,62 C66,72 58,78 50,76','d')+E(64,44,6,4,'hl','rotate(30 64 44)')},
 muscle:{ja:'骨格筋',cat:'臓器',c:['#D96A6A','#9E3838','#F2B9B9'],svg:
  R(8,40,10,20,3,'b3')+R(82,40,10,20,3,'b3')+P('M18,44 C34,28 66,28 82,44 L82,56 C66,72 34,72 18,56Z','b acc')+P('M24,46 C40,40 60,40 76,46 M22,50 L78,50 M24,54 C40,60 60,60 76,54','d')+E(40,40,10,3,'hl')},
 adipose:{ja:'脂肪組織',cat:'臓器',c:['#F6DE8E','#D9A936','#FFF4CF'],svg:
  [[30,32,18],[62,28,16],[76,56,15],[48,58,18],[24,66,14],[56,82,12]].map(([x,y,r])=>C(x,y,r,'b2')+C(x,y,r-2.5,'b acc')).join('')+E(28,26,6,3,'hl','rotate(-30 28 26)')},
 patient:{ja:'患者（ベッド）',cat:'生物',c:['#9DB7E0','#F2C9A9','#5C79AE'],svg:
  R(8,58,84,8,3,'b2')+R(8,46,10,20,3,'b3')+L(14,66,14,84,'d')+L(86,66,86,84,'d')+C(26,48,8,'b2')+P('M34,46 L88,46 C90,46 92,48 92,52 L92,58 L34,58Z','b acc')+P('M72,10 L72,40 M66,14 L78,14 L78,26 L66,26Z','d')},
 population:{ja:'集団（コホート）',cat:'生物',c:['#8FA9D6','#E58A7A','#5C79AE'],svg:
  Array.from({length:12},(_,i)=>{const x=16+(i%4)*22,y=24+Math.floor(i/4)*26;const c=i===5||i===10?'b2 acc':'b';return C(x,y-4,4.6,c)+P(`M${x-7},${y+12} C${x-7},${y+2} ${x+7},${y+2} ${x+7},${y+12}Z`,c);}).join('')},
 clinician:{ja:'医師・研究者',cat:'生物',c:['#DCE6F0','#F2C9A9','#5C79AE'],svg:
  C(50,22,12,'b2')+P('M24,92 L24,58 C24,44 36,38 50,38 C64,38 76,44 76,58 L76,92Z','b')+P('M50,38 L42,92 M50,38 L58,92','d')+P('M38,46 C36,60 40,66 46,66 M46,66 C50,72 56,70 56,64','d')+C(56,62,4,'b3 acc')},
 micrograph:{ja:'顕微鏡像',cat:'実験',c:['#2B2F45','#E26AA8','#6FD3E8'],svg:
  R(10,14,80,72,6,'b')+[[30,34,7],[54,30,6],[70,48,8],[40,58,8],[62,72,6],[24,70,6]].map(([x,y,r],i)=>C(x,y,r,i%2?'b2 acc':'b3')).join('')+R(66,78,16,3,1,'b3')},
 umap_tsne:{ja:'UMAP（点群）',cat:'実験',c:['#5B8DEF','#E8655A','#58B97A'],svg:
  P('M12,8 L12,88 L92,88','ink')+Array.from({length:36},(_,i)=>{const g=i%3,cx=[34,66,56][g],cy=[34,40,70][g],a=i*2.4,r=4+(i*7%9);return C((cx+Math.cos(a)*r).toFixed(1),(cy+Math.sin(a)*r*.8).toFixed(1),2.6,['b','b2 acc','b3'][g]);}).join('')},
 blot_gel:{ja:'ウェスタンブロット',cat:'実験',c:['#E9ECF0','#3A3F48','#8A93A0'],svg:
  R(8,16,84,68,4,'b')+[0,1,2,3].map(i=>R(16+i*19,30,14,6,3,i===2?'b2 acc':'b2','')).join('')+[0,1,2,3].map(i=>R(16+i*19,52,14,6,3,'b3')).join('')+[0,1,2,3].map(i=>R(16+i*19,70,14,5,2.5,'b2')).join('')},
 computer_ai:{ja:'AI・コンピュータ',cat:'実験',c:['#9AA6B8','#5B8DEF','#E3E8EF'],svg:
  R(10,16,80,52,5,'b')+R(16,22,68,40,2,'b3')+R(40,68,20,10,1,'b')+R(28,78,44,6,3,'b')+[[30,34],[30,50],[50,30],[50,42],[50,54],[70,42]].map(([x,y])=>C(x,y,3.6,'b2 acc')).join('')+P('M30,34 L50,30 L70,42 M30,34 L50,42 M30,50 L50,54 L70,42 M30,50 L50,42 L70,42','d')},
 gene_bar:{ja:'遺伝子（プロモーター・エクソン）',cat:'分子',c:['#5B8DEF','#E8A33D','#C8D7F6'],svg:
  L(6,56,94,56,'ink')+P('M16,56 L16,38 L28,38','ink')+`<polygon class="arrowhd" points="34,38 26,33 26,43" style="fill:#2d3440"/>`+R(32,48,14,16,2,'b acc')+R(54,48,10,16,2,'b')+R(72,48,16,16,2,'b')+R(8,50,6,12,2,'b2')},
 up_down:{ja:'増加・減少',cat:'記号',c:['#2E9D5B','#D64545','#999'],svg:
  `<polygon class="b acc" points="28,12 46,36 36,36 36,88 20,88 20,36 10,36"/><polygon class="b2" points="72,88 90,64 80,64 80,12 64,12 64,64 54,64"/>`},
 check_cross:{ja:'チェック・×',cat:'記号',c:['#2E9D5B','#D64545','#999'],svg:
  C(30,50,22,'b')+P('M19,50 L27,58 L42,42','tick')+C(72,50,22,'b2')+P('M63,41 L81,59 M81,41 L63,59','tick')},
 timeline:{ja:'時間軸',cat:'記号',c:['#5B8DEF','#E8A33D','#C8D7F6'],svg:
  L(8,60,88,60,'ink')+`<polygon points="96,60 86,54 86,66" style="fill:#2d3440"/>`+[16,36,56,76].map((x,i)=>C(x,60,6,i===2?'b2 acc':'b')+L(x,48,x,40,'d')).join('')+P('M50,20 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M50,14 L50,20 L54,22','d')},
 magnifier:{ja:'拡大（虫眼鏡）',cat:'記号',c:['#BFD7EA','#4C7FA8','#E9F2F9'],svg:
  L(62,62,88,88,'tick2')+C(42,42,26,'b2')+C(42,42,20,'b3 acc')+E(34,32,8,4,'hl','rotate(-35 34 32)')},
 lightning:{ja:'刺激・ストレス',cat:'記号',c:['#F7C846','#D88A1E','#FDF0B8'],svg:
  `<polygon class="b acc" points="58,6 24,52 46,52 36,94 78,40 54,40 68,6"/>`},
 enzyme:{ja:'酵素',cat:'分子',c:['#E8915A','#A9502A','#F8D2BA'],svg:
  P('M50,14 C72,14 88,30 88,50 C88,70 72,86 50,86 C34,86 20,76 15,62 L48,52 L15,38 C20,24 34,14 50,14Z','b acc')+C(56,32,5,'b3')+E(40,26,9,4,'hl','rotate(-25 40 26)')+C(18,50,6,'b2')},
 complex:{ja:'タンパク質複合体',cat:'分子',c:['#7FB2E5','#E59C6B','#9DD39B'],svg:
  E(36,54,20,24,'b')+E(64,50,18,22,'b2 acc')+C(50,24,14,'b3')+E(30,44,7,4,'hl','rotate(-30 30 44)')},
 apoptotic_cell:{ja:'アポトーシス細胞',cat:'細胞',c:['#B9A3C9','#6E5390','#E4DAEE'],svg:
  P(blob(radial(48,52,[30,26,32,24,30,27,31,25])),'b acc')+C(46,52,9,'b2')+C(40,46,3,'b2')+C(54,58,3,'b2')+[[82,30,8],[84,62,6],[16,30,6],[72,84,5]].map(([x,y,r])=>C(x,y,r,'b')).join('')},
 blood_drop:{ja:'血液（しずく）',cat:'臓器',c:['#D9403E','#9E2422','#F3A3A1'],svg:
  P('M50,8 C62,30 78,44 78,62 C78,78 66,90 50,90 C34,90 22,78 22,62 C22,44 38,30 50,8Z','b acc')+E(38,60,5,10,'hl','rotate(15 38 60)')},
 thrombus:{ja:'血栓',cat:'臓器',c:['#E86B6B','#8E2B2B','#F7C0C0'],svg:
  R(6,28,88,44,22,'b')+R(10,34,80,32,16,'b3')+P(blob([[38,38],[52,34],[64,40],[66,56],[54,64],[40,62],[34,50]]),'b2 acc')+P('M40,40 L62,60 M46,36 L60,62 M36,52 L66,46','d')+E(20,50,6,4,'b2')+E(82,50,6,4,'b2')},
 plaque:{ja:'動脈硬化プラーク',cat:'臓器',c:['#E86B6B','#E8C25A','#F7C0C0'],svg:
  R(6,24,88,52,26,'b')+R(10,32,80,36,18,'b3')+P('M26,68 C28,54 40,46 50,46 C60,46 72,54 74,68Z','b2 acc')+[[42,58],[52,54],[60,60]].map(([x,y])=>C(x,y,2.4,'b')).join('')},
 curved_arrow:{ja:'曲がった矢印・循環',cat:'記号',c:['#4A5568','#4A5568','#4A5568'],svg:
  `<path class="arrowln" d="M22,62 A30,30 0 1,1 62,80"/><polygon class="arrowhd" points="54,92 74,82 56,70"/>`},
 zoom_inset:{ja:'拡大の吹き出し',cat:'記号',c:['#8A97A8','#8A97A8','#8A97A8'],svg:
  C(24,70,10,'zoomc')+`<path class="zoomc" d="M30,62 L52,22 M33,77 L86,58"/>`+R(52,10,40,52,8,'zoomc')+C(66,30,6,'b3')+C(78,44,5,'b3')+C(70,48,4,'b3')},
 calendar:{ja:'カレンダー（日程）',cat:'記号',c:['#E46B5D','#F4F6F8','#9AA6B8'],svg:
  R(14,20,72,66,6,'b2')+R(14,20,72,16,6,'b acc')+L(30,12,30,26,'d')+L(70,12,70,26,'d')+Array.from({length:12},(_,i)=>R(22+(i%4)*15,44+Math.floor(i/4)*13,10,8,1.5,i===6?'b acc':'b3')).join('')},
 clipboard:{ja:'チェックリスト',cat:'記号',c:['#C9D6E6','#F7F9FB','#5B8DEF'],svg:
  R(18,14,64,78,6,'b')+R(24,22,52,64,3,'b2')+R(38,8,24,12,4,'b')+[36,52,68].map((y,i)=>P(`M30,${y} l4,4 l8,-8`,'tickb')+L(48,y,70,y,'d')).join('')},
 // ---- 記号 ----
 arrow:{ja:'矢印（促進）',cat:'記号',c:['#4A5568','#4A5568','#4A5568'],svg:`<path class="arrowln" d="M12,50 L78,50"/><polygon class="arrowhd" points="92,50 74,40 74,60"/>`},
 inhibit_bar:{ja:'抑制（T 字）',cat:'記号',c:['#C0392B','#C0392B','#C0392B'],svg:`<path class="arrowln inh" d="M12,50 L82,50"/><path class="arrowln inh" d="M84,32 L84,68"/>`},
};
return MOTIFS;})();
const GA_THEMES=[['soft','A ソフト陰影＋細い輪郭','淡いグラデーション＋同系色の細い輪郭。集めた GA で最も多い描き方'],['flat','B フラット・パステル','輪郭なしの淡いベタ塗り。柔らかい'],['line','C 線画＋淡い塗り','黒い輪郭＋淡い色。教科書・模式図らしい'],['glossy','D グラデーション・立体','光沢と影で立体的に。目を引く'],['mono','E モノトーン＋1色','灰色の濃淡＋「主役」だけ 1 色']];
const GA_THEME_KEYS=GA_THEMES.map(t=>t[0]);
const GA_CATS=['細胞','病原体','細胞内','分子','治療','生物','臓器','実験','記号'];
const GA_SIZES=[['wide','スライド 16:9（960×540）',960,540],['elsevier','横長 13:5（Elsevier 系、1040×400）',1040,400],['square','正方形（Cell 系、800×800）',800,800],['acs','ACS の TOC（3.25×1.75 in、975×525）',975,525]];
const GA_FONT="Arial, 'Hiragino Sans', 'IBM Plex Sans JP', sans-serif";
function gaHex(c){c=String(c||'#000').trim();if(/^#[0-9a-f]{3}$/i.test(c))c='#'+c.slice(1).split('').map(x=>x+x).join('');const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c);return m?[1,2,3].map(i=>parseInt(m[i],16)):[0,0,0];}
function gaMix(a,b,t){const A=gaHex(a),B=gaHex(b);return '#'+A.map((v,i)=>Math.max(0,Math.min(255,Math.round(v*t+B[i]*(1-t)))).toString(16).padStart(2,'0')).join('');}
const gaInk=th=>th==='line'?'#2b2f36':th==='mono'?'#56606d':'#4b5563';
// SVG 全体に 1 回だけ入れる共通の規則
const GA_BASE_CSS=`.gam .ink{fill:none;stroke:#2d3440;stroke-width:2.4;stroke-linecap:round}.gam circle.ink{fill:#2d3440;stroke:none}.gam .tube,.gam .gut{fill:none;stroke-linecap:round;stroke-linejoin:round}.gam .zoomc{fill:none;stroke:#8A97A8;stroke-width:2.6;stroke-dasharray:5 4}.gam rect.zoomc{fill:#ffffff;fill-opacity:.6}.gam .tick{fill:none;stroke:#fff;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}.gam .tickb{fill:none;stroke:#2E9D5B;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.gam .tick2{fill:none;stroke:#4C7FA8;stroke-width:10;stroke-linecap:round}`;
// 1 つのイラストの塗り方（絵柄ごと）。cls はそのイラストだけのクラス、uid はグラデーションの id の頭
function gaMotifStyle(cls,th,c,key,acc,uid){const [c1,c2,c3]=c;const K='#1d232b';const r=[];const add=(sel,decl)=>r.push(`.${cls} ${sel}{${decl}}`);let s1,s2,tx='#3a2a00',arrow=c1;
  if(th==='soft'){add('.b',`fill:url(#${uid}x);stroke:${gaMix(c1,K,.6)};stroke-width:1.3;stroke-linejoin:round`);add('.b2',`fill:url(#${uid}y);stroke:${gaMix(c2,K,.6)};stroke-width:1.3;stroke-linejoin:round`);add('.b3',`fill:url(#${uid}z);stroke:${gaMix(c3,K,.55)};stroke-width:1;stroke-linejoin:round`);add('.d',`fill:none;stroke:${gaMix(c2,K,.65)};stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round`);add('.hl','fill:#fff;opacity:.45');s1=gaMix(c1,'#ffffff',.85);s2=gaMix(c2,'#ffffff',.85);add('.tube',`stroke:${gaMix(c1,K,.6)};stroke-width:13`);add('.gut',`stroke:${gaMix(c1,'#ffffff',.7)};stroke-width:10.4`);}
  else if(th==='flat'){add('.b',`fill:${gaMix(c1,'#ffffff',.72)};stroke:none`);add('.b2',`fill:${gaMix(c2,'#ffffff',.78)};stroke:none`);add('.b3',`fill:${gaMix(c3,'#ffffff',.88)};stroke:none`);add('.d',`fill:none;stroke:${gaMix(c2,'#000000',.72)};stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round`);add('.hl','fill:#fff;opacity:.35');s1=gaMix(c1,'#ffffff',.82);s2=gaMix(c2,'#ffffff',.82);add('.tube',`stroke:${gaMix(c1,'#ffffff',.72)};stroke-width:13`);add('.gut',`stroke:${gaMix(c2,'#ffffff',.7)};stroke-width:2.4;stroke-dasharray:4 5`);}
  else if(th==='line'){const L='#2b2f36';add('.b',`fill:${gaMix(c1,'#ffffff',.28)};stroke:${L};stroke-width:2.2;stroke-linejoin:round`);add('.b2',`fill:${gaMix(c2,'#ffffff',.4)};stroke:${L};stroke-width:2.2;stroke-linejoin:round`);add('.b3',`fill:${gaMix(c3,'#ffffff',.34)};stroke:${L};stroke-width:2.2;stroke-linejoin:round`);add('.d',`fill:none;stroke:${L};stroke-width:2;stroke-linecap:round;stroke-linejoin:round`);add('.hl','display:none');s1=L;s2=gaMix(c2,'#000000',.7);add('.tube',`stroke:${L};stroke-width:14`);add('.gut',`stroke:${gaMix(c1,'#ffffff',.3)};stroke-width:9.6`);arrow=L;}
  else if(th==='glossy'){add('.b',`fill:url(#${uid}a);stroke:${gaMix(c1,'#000000',.55)};stroke-width:.8`);add('.b2',`fill:url(#${uid}b);stroke:${gaMix(c2,'#000000',.55)};stroke-width:.8`);add('.b3',`fill:url(#${uid}c);stroke:none`);add('.d',`fill:none;stroke:${gaMix(c2,'#000000',.62)};stroke-width:2;stroke-linecap:round;stroke-linejoin:round`);add('.hl','fill:#fff;opacity:.6');s1=c1;s2=c2;add('.tube',`stroke:${c1};stroke-width:13`);add('.gut',`stroke:${gaMix(c1,'#ffffff',.45)};stroke-width:4`);tx='#ffffff';}
  else{const G='#56606d';add('.b',`fill:#e1e5ea;stroke:${G};stroke-width:1.6`);add('.b2',`fill:#bcc3cc;stroke:${G};stroke-width:1.6`);add('.b3',`fill:#f3f5f7;stroke:${G};stroke-width:1.2`);add('.d',`fill:none;stroke:${G};stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round`);add('.hl','display:none');s1=key?acc:'#7d8692';s2='#9aa3ae';add('.tube',`stroke:${key?acc:'#aab2bc'};stroke-width:13`);add('.gut','stroke:#ffffff;stroke-width:2;opacity:.7');arrow=G;tx=key?'#ffffff':'#3d4652';
    if(key){add('.acc:not([style*="fill:none"])',`fill:${acc}!important`);add('.acc[style*="fill:none"]',`stroke:${acc}!important`);}}
  add('.tx',`fill:${tx}`);add('.arrowln',`fill:none;stroke:${arrow};stroke-width:7;stroke-linecap:round`);add('.arrowhd',`fill:${arrow}`);
  return {css:r.join(''),s1,s2};}
function gaMotifDefs(th,c,uid){const [c1,c2,c3]=c;
  if(th==='glossy'){const g=(id,col)=>`<radialGradient id="${uid}${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${gaMix(col,'#ffffff',.35)}"/><stop offset=".55" stop-color="${col}"/><stop offset="1" stop-color="${gaMix(col,'#000000',.7)}"/></radialGradient>`;return `<defs>${g('a',c1)}${g('b',c2)}${g('c',c3)}<filter id="${uid}f" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity=".22"/></filter></defs>`;}
  if(th==='soft'){const g=(id,col)=>`<linearGradient id="${uid}${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${gaMix(col,'#ffffff',.45)}"/><stop offset="1" stop-color="${gaMix(col,'#ffffff',.92)}"/></linearGradient>`;return `<defs>${g('x',c1)}${g('y',c2)}${g('z',c3)}</defs>`;}
  return '';}
let gaSeq=0;
// 1 つのイラスト（ネストした svg）。戻り値 {svg, css}
function gaMotif(m,x,y,s,o){const M=GA_LIB[m];if(!M)return {svg:'',css:''};o=o||{};const th=o.theme||'soft';const uid='g'+(++gaSeq).toString(36)+(o.salt||'');const cls=uid+'m';
  const st=gaMotifStyle(cls,th,M.c,!!o.key,o.acc||'#0E9F9A',uid);
  const inner=M.svg.replace(/var\(--s1\)/g,st.s1).replace(/var\(--s2\)/g,st.s2).replace(/var\(--c2\)/g,th==='mono'?(o.key?o.acc||'#0E9F9A':'#7d8692'):M.c[1]).replace(/var\(--c1\)/g,M.c[0]);
  const tr=[];if(o.rot)tr.push(`rotate(${+o.rot} 50 50)`);if(o.flip)tr.push('translate(100 0) scale(-1 1)');
  return {css:st.css,svg:`<svg class="gam ${cls}" x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 100 100" overflow="visible">${gaMotifDefs(th,M.c,uid)}<g${tr.length?` transform="${tr.join(' ')}"`:''}${th==='glossy'?` filter="url(#${uid}f)"`:''}>${inner}</g></svg>`};}
// 単体のイラスト（一覧のアイコン用）
function gaIconSVG(m,size,theme,key,acc){const r=gaMotif(m,0,0,100,{theme,key,acc});return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-4 -4 108 108"><style>${GA_BASE_CSS}${r.css}</style>${r.svg}</svg>`;}
const gaEsc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function gaText(x,y,text,o){o=o||{};const size=+o.size||14;const lines=String(text||'').split('\n');const lh=size*1.25;const y0=y-(lines.length-1)*lh/2;
  return `<text x="${x}" y="${y0}" font-family="${GA_FONT}" font-size="${size}" font-weight="${o.bold?'700':'400'}" fill="${o.color||'#1f2933'}" text-anchor="${o.anchor||'middle'}" dominant-baseline="middle">${lines.map((l,i)=>`<tspan x="${x}" dy="${i?lh:0}">${gaEsc(l)}</tspan>`).join('')}</text>`;}
// 矢印（arrow 促進 / inhibit 抑制 / curved 曲線 / dashed 破線 / double 両向き）
function gaArrow(it,th){const x1=+it.x1||0,y1=+it.y1||0,x2=+it.x2||0,y2=+it.y2||0;const w=+it.width||4;const col=it.color||(it.kind==='inhibit'?'#C0392B':gaInk(th));const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1;const ux=dx/len,uy=dy/len,nx=-uy,ny=ux;const hl=Math.max(10,w*3.4),hw=Math.max(6,w*2.1);
  let path,end=[x2,y2],dirx=ux,diry=uy;
  if(it.kind==='curved'){const b=(it.bend==null?0.3:+it.bend)*len;const cx=(x1+x2)/2+nx*b,cy=(y1+y2)/2+ny*b;const tx=x2-cx,ty=y2-cy,tl=Math.hypot(tx,ty)||1;dirx=tx/tl;diry=ty/tl;path=`M${x1},${y1} Q${cx.toFixed(1)},${cy.toFixed(1)} ${(x2-dirx*hl*.8).toFixed(1)},${(y2-diry*hl*.8).toFixed(1)}`;}
  else path=`M${x1},${y1} L${(x2-(it.kind==='inhibit'?0:ux*hl*.8)).toFixed(1)},${(y2-(it.kind==='inhibit'?0:uy*hl*.8)).toFixed(1)}`;
  const head=(px,py,ax,ay)=>{const bx=px-ax*hl,by=py-ay*hl;return `<polygon points="${px},${py} ${(bx-ay*hw).toFixed(1)},${(by+ax*hw).toFixed(1)} ${(bx+ay*hw).toFixed(1)},${(by-ax*hw).toFixed(1)}" fill="${col}"/>`;};
  let s=`<path d="${path}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"${it.kind==='dashed'?` stroke-dasharray="${w*2.2} ${w*1.8}"`:''}/>`;
  if(it.kind==='inhibit')s+=`<line x1="${(x2+nx*hw*1.4).toFixed(1)}" y1="${(y2+ny*hw*1.4).toFixed(1)}" x2="${(x2-nx*hw*1.4).toFixed(1)}" y2="${(y2-ny*hw*1.4).toFixed(1)}" stroke="${col}" stroke-width="${w*1.2}" stroke-linecap="round"/>`;else s+=head(x2,y2,dirx,diry);
  if(it.kind==='double'){s=s.replace(`M${x1},${y1}`,`M${(x1+ux*hl*.8).toFixed(1)},${(y1+uy*hl*.8).toFixed(1)}`)+head(x1,y1,-ux,-uy);}
  if(it.label)s+=gaText((x1+x2)/2+nx*16,(y1+y2)/2+ny*16,it.label,{size:it.labelSize||13,color:'#3d4955'});
  return s+`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${Math.max(16,w*4)}"/>`;}
function figIsGA(j){return !!(j&&j.kind==='ga');}
function figRenderGA(j){const th=GA_THEME_KEYS.includes(j.theme)?j.theme:'soft';const W=Math.max(200,+j.w||960),H=Math.max(120,+j.h||540);const acc=j.accent||'#0E9F9A';const salt=Math.random().toString(36).slice(2,6);
  let css=GA_BASE_CSS,body='';
  (j.items||[]).forEach((it,k)=>{const a=`data-gaitem="${k}"`;
    if(it.t==='box'){const r=it.r==null?14:+it.r;body+=`<g ${a}><rect x="${+it.x||0}" y="${+it.y||0}" width="${+it.w||200}" height="${+it.h||150}" rx="${r}" fill="${it.fill||'#f7f9fb'}" stroke="${it.stroke||'#dfe5ec'}" stroke-width="1.5"${it.dash?' stroke-dasharray="6 5"':''}/>${it.title?gaText((+it.x||0)+(+it.w||200)/2,(+it.y||0)+18,it.title,{size:it.titleSize||15,bold:true,color:it.titleColor||'#2d3440'}):''}</g>`;}
    else if(it.t==='text')body+=`<g ${a}>${gaText(+it.x||0,+it.y||0,it.text,it)}</g>`;
    else if(it.t==='arrow')body+=`<g ${a}>${gaArrow(it,th)}</g>`;
    else if(it.t==='motif'){const s=+it.s||100;const r=gaMotif(it.m,+it.x||0,+it.y||0,s,{theme:th,key:!!it.key,acc,rot:it.rot,flip:it.flip,salt});css+=r.css;body+=`<g ${a}>${r.svg}${it.label?gaText((+it.x||0)+s/2,(+it.y||0)+s+12,it.label,{size:it.labelSize||13,color:'#3d4955'}):''}${r.svg?'':`<rect x="${+it.x||0}" y="${+it.y||0}" width="${s}" height="${s}" fill="none" stroke="#c33" stroke-dasharray="4 3"/>`}</g>`;}});
  const title=j.title?gaText(24,30,j.title,{size:j.titleSize||20,bold:true,anchor:'start',color:'#1f2933'}):'';
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${css}</style><rect width="100%" height="100%" fill="${j.bg||'#ffffff'}"/>${title}${body}</svg>`,w:W,h:H,ga:true,plot:{x0:0,y0:0,w:W,h:H}};}

/* ---------- ひな形 ---------- */
function gaTemplate(kind,W,H){const m=20,top=56;const items=[];
  if(kind==='flow3'){const gap=44,bw=(W-2*m-2*gap)/3,bh=H-top-m;['背景・課題','介入・方法','結果・結論'].forEach((t,i)=>{const x=m+i*(bw+gap);items.push({t:'box',x:Math.round(x),y:top,w:Math.round(bw),h:Math.round(bh),title:t});if(i<2)items.push({t:'arrow',x1:Math.round(x+bw+6),y1:Math.round(top+bh/2),x2:Math.round(x+bw+gap-6),y2:Math.round(top+bh/2),kind:'arrow'});});}
  else if(kind==='flowv'){const gap=34,bh=(H-top-m-2*gap)/3;['背景・課題','介入・方法','結果・結論'].forEach((t,i)=>{const y=top+i*(bh+gap);items.push({t:'box',x:m,y:Math.round(y),w:W-2*m,h:Math.round(bh),title:t});if(i<2)items.push({t:'arrow',x1:Math.round(W/2),y1:Math.round(y+bh+4),x2:Math.round(W/2),y2:Math.round(y+bh+gap-4),kind:'arrow'});});}
  else if(kind==='compare'){const gap=24,bw=(W-2*m-gap)/2,bh=H-top-m;[['対照','#f4f6f8'],['処置','#eef6f3']].forEach(([t,f],i)=>items.push({t:'box',x:Math.round(m+i*(bw+gap)),y:top,w:Math.round(bw),h:Math.round(bh),title:t,fill:f}));}
  else if(kind==='hub'){const cw=W*0.3,ch=H*0.36;items.push({t:'box',x:Math.round(W/2-cw/2),y:Math.round(top+(H-top)/2-ch/2-10),w:Math.round(cw),h:Math.round(ch),title:'中心となる発見'});}
  return items;}
const GA_TEMPLATES=[['flow3','左 → 右の 3 段'],['flowv','上 → 下の 3 段'],['compare','左右の対比'],['hub','中心から放射'],['blank','白紙']];
function gaNewSpec(){const W=960,H=540;return {kind:'ga',theme:'soft',accent:'#0E9F9A',w:W,h:H,title:'',items:gaTemplate('flow3',W,H)};}

/* ---------- 作成画面 ---------- */
let gaState=null;
const GA_ACCENTS=['#0E9F9A','#2F6FD6','#D64545','#E08A1E','#7A4FBF','#2E9D5B','#1f2933'];
function gaDlgEnsure(){let d=document.querySelector('#figGaDlg');if(d)return d;
  const st=document.createElement('style');st.textContent=`#figGaDlg{width:min(1320px,97vw);max-width:none;max-height:95vh;padding:12px 14px}#figGaDlg .gaHead{display:flex;align-items:center;gap:8px;margin-bottom:8px}#figGaDlg .gaHead h2{margin:0;font-size:16px}#figGaDlg .sp{flex:1}
#figGaDlg .gaThemes{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}#figGaDlg .gaThemes button{display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:10px;font-size:12px}#figGaDlg .gaThemes button.on{outline:2px solid var(--glow,#b5e86b);background:rgba(181,232,107,.16)}#figGaDlg .gaThemes svg{background:#fff;border-radius:7px}
#figGaDlg .gaBody{display:grid;grid-template-columns:270px 1fr 250px;gap:12px;max-height:calc(95vh - 140px)}#figGaDlg .gaLeft,#figGaDlg .gaRight{overflow:auto;max-height:calc(95vh - 150px)}
#figGaDlg .gaAdd{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}#figGaDlg .gaAdd button{font-size:12px;padding:3px 8px}#figGaDlg #gaQ{width:100%;box-sizing:border-box;margin:4px 0}
#figGaDlg .gaCats{display:flex;flex-wrap:wrap;gap:3px;margin:4px 0}#figGaDlg .gaCats button{font-size:11px;padding:2px 8px;border-radius:999px}#figGaDlg .gaCats button.on{background:var(--glow,#b5e86b);color:#1a2a10}
#figGaDlg .gaPal{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;background:#fff;border-radius:10px;padding:6px}#figGaDlg .gaPal button{display:flex;flex-direction:column;align-items:center;gap:1px;padding:3px 1px;border:1px solid transparent;border-radius:8px;background:#fff;color:#33404d;font-size:9.5px;line-height:1.15;cursor:pointer}#figGaDlg .gaPal button:hover{border-color:#9fc77a;background:#f4faee}
#figGaDlg .gaCenter{display:flex;flex-direction:column;gap:8px;min-width:0}#figGaDlg #gaCanvas{background:#e9edf1;border-radius:10px;padding:10px;overflow:auto;flex:1;display:flex;align-items:flex-start;justify-content:center;touch-action:none}#figGaDlg #gaCanvas > svg{max-width:100%;height:auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18);cursor:default}
#figGaDlg .gaOut{display:flex;flex-wrap:wrap;gap:6px}#figGaDlg .gaRight .irow{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}#figGaDlg .gaRight label{font-size:11px;color:var(--muted)}#figGaDlg .gaRight input[type=text],#figGaDlg .gaRight textarea,#figGaDlg .gaRight select,#figGaDlg .gaRight input[type=number]{width:100%;box-sizing:border-box}#figGaDlg .gaRight .chk{flex-direction:row;align-items:center;gap:6px;font-size:12px}#figGaDlg .gaRight .btnrow{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}#figGaDlg .gaRight h4{margin:0 0 8px;font-size:13px}
#figGaDlg .sw{display:inline-block;width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #9aa3ae;margin:2px;cursor:pointer;padding:0}#figGaDlg .sw.on{box-shadow:0 0 0 2px #1f2933}
#figGaDlg .gaSelBox{fill:none;stroke:#2F6FD6;stroke-width:1.5;stroke-dasharray:5 4;pointer-events:none}#figGaDlg .gaH{fill:#fff;stroke:#2F6FD6;stroke-width:2;cursor:nwse-resize}#figGaDlg .gaH.pt{cursor:move}
@media (max-width:1000px){#figGaDlg .gaBody{grid-template-columns:1fr}}`;document.head.appendChild(st);
  d=document.createElement('dialog');d.id='figGaDlg';
  d.innerHTML=`<div class="gaHead"><h2>🧩 グラフィカルアブストラクト作成</h2><span class="hint" id="gaHint">左の一覧のイラストを押すとキャンバスに置かれます。ドラッグで移動、角の □ で大きさを変えられます。</span><span class="sp"></span><button class="small" id="gaUndo" data-tip="元に戻す（⌘Z）">↶</button><button class="small" id="gaRedo" data-tip="やり直す（⌘⇧Z）">↷</button><button id="gaClose">閉じる</button></div>
  <div class="gaThemes" id="gaThemes"></div>
  <div class="gaBody"><div class="gaLeft"><div class="gaAdd"><button class="small" data-gaadd="text">＋ 文字</button><button class="small" data-gaadd="arrow">＋ 矢印</button><button class="small" data-gaadd="inhibit">＋ 抑制（T 字）</button><button class="small" data-gaadd="curved">＋ 曲がった矢印</button><button class="small" data-gaadd="box">＋ 枠</button></div>
    <input id="gaQ" type="text" placeholder="イラストを探す（例: 細胞、マウス、DNA）"><div class="gaCats" id="gaCats"></div><div class="gaPal" id="gaPal"></div></div>
   <div class="gaCenter"><div id="gaCanvas" class="figPreview"></div><div class="gaOut"><button class="primary" id="gaAttach">チャットに添付して質問する</button><button id="gaUpdate">回答の図を更新</button><button class="small" id="gaCopy">画像をコピー</button><button class="small" id="gaPng">PNG（300 dpi）</button><button class="small" id="gaSvg">SVG</button><button class="small" id="gaJson">{} JSON</button></div></div>
   <div class="gaRight" id="gaInspect"></div></div>`;
  document.body.appendChild(d);gaDlgBind(d);return d;}
function figGaOpen(spec,src){const d=gaDlgEnsure();gaState={spec:JSON.parse(JSON.stringify(spec&&figIsGA(spec)?spec:gaNewSpec())),src:src||null,sel:null,undo:[],redo:[],cat:'細胞',q:'',replace:false};gaState.undo.push(JSON.stringify(gaState.spec));
  d.querySelector('#gaUpdate').style.display=src?'':'none';d.querySelector('#gaQ').value='';gaRenderThemes();gaRenderPal();gaSync();if(!d.open)d.showModal();}
function gaPush(){const s=JSON.stringify(gaState.spec);if(gaState.undo[gaState.undo.length-1]!==s){gaState.undo.push(s);if(gaState.undo.length>80)gaState.undo.shift();gaState.redo=[];}}
function gaRenderThemes(){const d=document.querySelector('#figGaDlg');const sp=gaState.spec;d.querySelector('#gaThemes').innerHTML=`<span class="hint" style="align-self:center">絵柄</span>`+GA_THEMES.map(([k,n,desc])=>`<button class="small${(sp.theme||'soft')===k?' on':''}" data-gatheme="${k}" data-tip="${gaEsc(desc)}">${gaIconSVG('cancer_cell',30,k,true,sp.accent)}${gaIconSVG('mitochondria',30,k,true,sp.accent)}<span>${n}</span></button>`).join('');}
function gaRenderPal(){const d=document.querySelector('#figGaDlg');const sp=gaState.spec;const q=gaState.q.trim().toLowerCase();
  d.querySelector('#gaCats').innerHTML=GA_CATS.map(c=>`<button class="small${!q&&gaState.cat===c?' on':''}" data-gacat="${c}">${c}</button>`).join('');
  const keys=Object.keys(GA_LIB).filter(k=>q?(GA_LIB[k].ja+' '+k+' '+GA_LIB[k].cat).toLowerCase().includes(q):GA_LIB[k].cat===gaState.cat);
  d.querySelector('#gaPal').innerHTML=keys.map(k=>`<button data-gam="${k}" data-tip="${gaEsc(GA_LIB[k].ja)}をキャンバスに置く">${gaIconSVG(k,44,sp.theme||'soft',true,sp.accent)}<span>${gaEsc(GA_LIB[k].ja)}</span></button>`).join('')||'<div class="hint" style="grid-column:1/-1;color:#5d6b7a">見つかりません</div>';}
function gaSync(keepInspector){const d=document.querySelector('#figGaDlg');const r=figRenderGA(gaState.spec);gaState.r=r;const cv=d.querySelector('#gaCanvas');cv.innerHTML=r.svg;gaOverlay();if(!keepInspector)gaInspector();
  d.querySelector('#gaUndo').disabled=gaState.undo.length<2;d.querySelector('#gaRedo').disabled=!gaState.redo.length;}
// 選んだ要素の枠とつまみ（キャンバスに足すだけで、図の指定には入らない）
function gaOverlay(){const d=document.querySelector('#figGaDlg');const svg=d.querySelector('#gaCanvas > svg');if(!svg)return;const k=gaState.sel;if(k==null)return;const it=gaState.spec.items[k];const el=svg.querySelector(`[data-gaitem="${k}"]`);if(!it||!el)return;const NS='http://www.w3.org/2000/svg';
  const add=(tag,attrs)=>{const e=document.createElementNS(NS,tag);for(const [a,v] of Object.entries(attrs))e.setAttribute(a,v);svg.appendChild(e);return e;};
  if(it.t==='arrow'){add('circle',{class:'gaH pt','data-gah':'p1',cx:it.x1,cy:it.y1,r:7});add('circle',{class:'gaH pt','data-gah':'p2',cx:it.x2,cy:it.y2,r:7});return;}
  let b;try{b=el.getBBox();}catch(e){return;}if(it.t==='motif')b={x:+it.x,y:+it.y,width:+it.s||100,height:+it.s||100};if(it.t==='box')b={x:+it.x,y:+it.y,width:+it.w,height:+it.h};
  add('rect',{class:'gaSelBox',x:b.x-4,y:b.y-4,width:b.width+8,height:b.height+8});add('rect',{class:'gaH','data-gah':'br',x:b.x+b.width-3,y:b.y+b.height-3,width:12,height:12});}
function gaPt(e){const svg=document.querySelector('#gaCanvas > svg');const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const m=svg.getScreenCTM();return m?pt.matrixTransform(m.inverse()):{x:0,y:0};}
function gaAddItem(it){const sp=gaState.spec;sp.items.push(it);gaState.sel=sp.items.length-1;gaPush();gaSync();}
function gaPlace(){const sp=gaState.spec;const n=sp.items.length;return {cx:(+sp.w||960)/2+((n*23)%120)-60,cy:(+sp.h||540)/2+((n*37)%100)-50};}
function gaDlgBind(d){const $=s=>d.querySelector(s);
  $('#gaClose').onclick=()=>d.close();
  $('#gaUndo').onclick=()=>{if(gaState.undo.length<2)return;gaState.redo.push(gaState.undo.pop());gaState.spec=JSON.parse(gaState.undo[gaState.undo.length-1]);gaState.sel=null;gaRenderThemes();gaRenderPal();gaSync();};
  $('#gaRedo').onclick=()=>{if(!gaState.redo.length)return;const s=gaState.redo.pop();gaState.undo.push(s);gaState.spec=JSON.parse(s);gaState.sel=null;gaRenderThemes();gaRenderPal();gaSync();};
  $('#gaThemes').addEventListener('click',e=>{const b=e.target.closest('[data-gatheme]');if(!b)return;gaState.spec.theme=b.dataset.gatheme;gaPush();gaRenderThemes();gaRenderPal();gaSync(true);});
  $('#gaCats').addEventListener('click',e=>{const b=e.target.closest('[data-gacat]');if(!b)return;gaState.cat=b.dataset.gacat;gaState.q='';$('#gaQ').value='';gaRenderPal();});
  $('#gaQ').addEventListener('input',e=>{gaState.q=e.target.value;gaRenderPal();});
  $('#gaPal').addEventListener('click',e=>{const b=e.target.closest('[data-gam]');if(!b)return;const m=b.dataset.gam;const sp=gaState.spec;const cur=gaState.sel!=null?sp.items[gaState.sel]:null;
    if(gaState.replace&&cur&&cur.t==='motif'){cur.m=m;gaState.replace=false;gaPush();gaSync();toast('イラストを差し替えました');return;}
    const s=Math.round(Math.min(+sp.w||960,+sp.h||540)*0.2);const p=gaPlace();gaAddItem({t:'motif',m,x:Math.round(p.cx-s/2),y:Math.round(p.cy-s/2),s});});
  d.querySelector('.gaAdd').addEventListener('click',e=>{const b=e.target.closest('[data-gaadd]');if(!b)return;const k=b.dataset.gaadd;const p=gaPlace();
    if(k==='text')gaAddItem({t:'text',x:Math.round(p.cx),y:Math.round(p.cy),text:'文字',size:16,bold:true,color:'#1f2933',anchor:'middle'});
    else if(k==='box')gaAddItem({t:'box',x:Math.round(p.cx-120),y:Math.round(p.cy-80),w:240,h:160,title:'見出し'});
    else gaAddItem({t:'arrow',x1:Math.round(p.cx-60),y1:Math.round(p.cy),x2:Math.round(p.cx+60),y2:Math.round(p.cy),kind:k==='inhibit'?'inhibit':k==='curved'?'curved':'arrow',width:4});});
  // ドラッグ（移動・大きさ・矢印の端）
  const cv=$('#gaCanvas');let drag=null,raf=0;
  cv.addEventListener('pointerdown',e=>{if(e.button!==0)return;const svg=cv.querySelector(':scope > svg');if(!svg||!svg.contains(e.target))return;const h=e.target.closest('[data-gah]');const g=e.target.closest('[data-gaitem]');const p=gaPt(e);
    if(h&&gaState.sel!=null){drag={mode:h.dataset.gah,k:gaState.sel,p0:p,o:JSON.parse(JSON.stringify(gaState.spec.items[gaState.sel])),moved:false};}
    else if(g){const k=+g.dataset.gaitem;gaState.sel=k;drag={mode:'move',k,p0:p,o:JSON.parse(JSON.stringify(gaState.spec.items[k])),moved:false};gaSync();}
    else{gaState.sel=null;gaSync();return;}
    try{cv.setPointerCapture(e.pointerId);}catch(err){}e.preventDefault();});
  cv.addEventListener('pointermove',e=>{if(!drag)return;const p=gaPt(e);const dx=p.x-drag.p0.x,dy=p.y-drag.p0.y;if(Math.hypot(dx,dy)>1.5)drag.moved=true;if(!drag.moved)return;const it=gaState.spec.items[drag.k],o=drag.o;const R=v=>Math.round(v);
    if(drag.mode==='move'){if(it.t==='arrow'){it.x1=R(o.x1+dx);it.y1=R(o.y1+dy);it.x2=R(o.x2+dx);it.y2=R(o.y2+dy);}else{it.x=R(o.x+dx);it.y=R(o.y+dy);}}
    else if(drag.mode==='p1'){it.x1=R(o.x1+dx);it.y1=R(o.y1+dy);}else if(drag.mode==='p2'){it.x2=R(o.x2+dx);it.y2=R(o.y2+dy);}
    else if(drag.mode==='br'){if(it.t==='motif')it.s=Math.max(16,R((+o.s||100)+(dx+dy)/2));else if(it.t==='box'){it.w=Math.max(30,R(o.w+dx));it.h=Math.max(24,R(o.h+dy));}else if(it.t==='text')it.size=Math.max(6,Math.round(((+o.size||14)*(1+dy/60))*2)/2);}
    if(!raf)raf=requestAnimationFrame(()=>{raf=0;gaSync(true);});});
  const end=()=>{if(!drag)return;const moved=drag.moved;drag=null;if(moved){gaPush();gaSync();}};cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  // キー操作（入力欄にいるときは何もしない）
  d.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select'))return;const mod=e.metaKey||e.ctrlKey;
    if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?$('#gaRedo'):$('#gaUndo')).click();return;}
    const k=gaState.sel;if(k==null)return;const it=gaState.spec.items[k];
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();gaState.spec.items.splice(k,1);gaState.sel=null;gaPush();gaSync();return;}
    if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();gaDup(k);return;}
    const mv={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(mv){e.preventDefault();const st=e.shiftKey?10:1;if(it.t==='arrow'){it.x1+=mv[0]*st;it.x2+=mv[0]*st;it.y1+=mv[1]*st;it.y2+=mv[1]*st;}else{it.x=(+it.x||0)+mv[0]*st;it.y=(+it.y||0)+mv[1]*st;}gaPush();gaSync(true);}});
  // 右の欄
  const ins=$('#gaInspect');
  ins.addEventListener('input',e=>{const el=e.target.closest('[data-gp]');if(!el)return;gaSetProp(el.dataset.gp,el.type==='checkbox'?el.checked:el.value);gaSync(true);});
  ins.addEventListener('change',e=>{const el=e.target.closest('[data-gp]');if(!el)return;gaPush();if(el.tagName==='SELECT'||el.type==='checkbox')gaSync();});
  ins.addEventListener('click',e=>{const sw=e.target.closest('[data-gsw]');if(sw){gaSetProp(sw.dataset.gsw,sw.dataset.v);gaPush();if(sw.dataset.gsw==='accent'){gaRenderThemes();gaRenderPal();}gaSync();return;}
    const b=e.target.closest('[data-gact]');if(!b)return;const a=b.dataset.gact,k=gaState.sel,items=gaState.spec.items;
    if(a==='del'&&k!=null){items.splice(k,1);gaState.sel=null;}else if(a==='dup'&&k!=null){gaDup(k);return;}else if(a==='front'&&k!=null){const [x]=items.splice(k,1);items.push(x);gaState.sel=items.length-1;}else if(a==='back'&&k!=null){const [x]=items.splice(k,1);items.unshift(x);gaState.sel=0;}
    else if(a==='replace'){gaState.replace=!gaState.replace;toast(gaState.replace?'左の一覧で、差し替えたいイラストを押してください':'差し替えをやめました');gaInspector();return;}
    else if(a==='tpl'){const v=ins.querySelector('[data-gtpl]').value;const sp=gaState.spec;const go=()=>{sp.items=gaTemplate(v,+sp.w||960,+sp.h||540);gaState.sel=null;gaPush();gaSync();};if(sp.items.some(x=>x.t!=='box'&&x.t!=='arrow')){askConfirm('いま置いてあるものを消して、ひな形に置き換えます。','置き換える').then(ok=>{if(ok)go();});}else go();return;}
    gaPush();gaSync();});
  // 出力
  const png=async dpi=>{const r=figRenderGA(gaState.spec);return figToPng(r.svg,r.w,r.h,dpi||300);};
  $('#gaPng').onclick=async()=>{const c=await png(300);const a=document.createElement('a');a.href=figPngDataURL(c,300);a.download=`graphical_abstract_${Date.now()}.png`;a.click();toast('PNG（300 dpi）を保存しました');};
  $('#gaSvg').onclick=()=>{const r=figRenderGA(gaState.spec);saveTextFile(`graphical_abstract_${Date.now()}.svg`,r.svg);};
  $('#gaCopy').onclick=async()=>{try{const c=await png(300);const blob=await new Promise(r=>c.toBlob(r,'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast('画像をコピーしました');}catch(e){toast('コピーできませんでした');}};
  $('#gaJson').onclick=async()=>{const txt=await figPrompt('図の指定（JSON）。直して OK で反映',JSON.stringify(gaState.spec,null,1),{multiline:true});if(txt==null)return;try{const j=JSON.parse(txt);if(!figIsGA(j))throw new Error('kind が ga ではありません');gaState.spec=j;gaState.sel=null;gaPush();gaRenderThemes();gaRenderPal();gaSync();}catch(e){toast('JSON の誤り: '+e.message);}};
  $('#gaAttach').onclick=async()=>{const j=gaState.spec;try{if(typeof imagesSupported!=='undefined'&&imagesSupported&&pendingImgs.length<4){const c=await png(150);const full=c.toDataURL('image/jpeg',.9);const tc=document.createElement('canvas');const sc=256/Math.max(c.width,c.height);tc.width=Math.round(c.width*sc);tc.height=Math.round(c.height*sc);tc.getContext('2d').drawImage(c,0,0,tc.width,tc.height);pendingImgs.push({full:{media_type:'image/jpeg',data:full.split(',')[1]},thumb:tc.toDataURL('image/jpeg',.8)});renderPlus();}}catch(e){}
    d.close();const t=document.querySelector('#input');t.value=(t.value?t.value+'\n':'')+'```figure\n'+JSON.stringify(j)+'\n```\n';if(typeof fitInput==='function')fitInput();t.focus();toast('グラフィカルアブストラクトを添付し、指定を入力欄に入れました');};
  $('#gaUpdate').onclick=()=>{const src=gaState.src;if(!src)return;const n=N(src.nodeId);if(!n)return;const b=figFindBlocks(n.content)[src.index];if(!b){toast('元の図が見つかりません');return;}let out='```figure\n'+JSON.stringify(gaState.spec)+'\n```';
    if(src.panel!=null){let lay;try{lay=JSON.parse(b.json);}catch(e){return;}if(!lay.panels||!lay.panels[src.panel])return;lay.panels[src.panel]=gaState.spec;out='```figure\n'+JSON.stringify(lay)+'\n```';}
    n.content=n.content.slice(0,b.start)+out+n.content.slice(b.end);persist();renderAll();d.close();toast('回答の図を更新しました');};}
function gaDup(k){const it=JSON.parse(JSON.stringify(gaState.spec.items[k]));if(it.t==='arrow'){it.x1+=20;it.x2+=20;it.y1+=20;it.y2+=20;}else{it.x=(+it.x||0)+20;it.y=(+it.y||0)+20;}gaAddItem(it);}
function gaSetProp(key,v){const sp=gaState.spec;const k=gaState.sel;const it=k!=null?sp.items[k]:null;const num=['s','rot','size','width','x','y','w','h','r','bend','titleSize','labelSize'];
  if(key.startsWith('g.')){const kk=key.slice(2);if(kk==='size'){const z=GA_SIZES.find(x=>x[0]===v);if(z){const fx=z[2]/(+sp.w||960),fy=z[3]/(+sp.h||540);sp.items.forEach(it=>{if(it.t==='arrow'){it.x1=Math.round(it.x1*fx);it.x2=Math.round(it.x2*fx);it.y1=Math.round(it.y1*fy);it.y2=Math.round(it.y2*fy);}else{it.x=Math.round((+it.x||0)*fx);it.y=Math.round((+it.y||0)*fy);if(it.t==='box'){it.w=Math.round(it.w*fx);it.h=Math.round(it.h*fy);}}});sp.w=z[2];sp.h=z[3];}}else sp[kk]=v;return;}
  if(key==='accent'){sp.accent=v;return;}
  if(!it)return;if(typeof v==='boolean'){if(v)it[key]=true;else delete it[key];return;}if(num.includes(key)){const n=parseFloat(v);if(isFinite(n))it[key]=n;return;}if(v==='')delete it[key];else it[key]=v;}
function gaInspector(){const d=document.querySelector('#figGaDlg');const ins=d.querySelector('#gaInspect');const sp=gaState.spec;const k=gaState.sel;const it=k!=null?sp.items[k]:null;
  const row=(l,c)=>`<div class="irow"><label>${l}</label>${c}</div>`;const txt=(key,v,ph)=>`<input type="text" data-gp="${key}" value="${gaEsc(v||'')}" placeholder="${gaEsc(ph||'')}">`;const num=(key,v,min,max,step)=>`<input type="number" data-gp="${key}" value="${v}" min="${min}" max="${max}" step="${step||1}">`;
  const sel=(key,v,opts)=>`<select data-gp="${key}">${opts.map(([a,b])=>`<option value="${a}"${String(a)===String(v)?' selected':''}>${b}</option>`).join('')}</select>`;const chk=(key,v,l)=>`<label class="irow chk"><input type="checkbox" data-gp="${key}"${v?' checked':''}> ${l}</label>`;
  const col=(key,v)=>`<input type="color" data-gp="${key}" value="${v}">`;const common=`<div class="btnrow"><button class="small" data-gact="front">前面へ</button><button class="small" data-gact="back">背面へ</button><button class="small" data-gact="dup">複製（⌘D）</button><button class="small" data-gact="del">削除（Delete）</button></div>`;
  let h='';
  if(!it){h=`<h4>全体</h4>`+row('題名（左上）',txt('g.title',sp.title,'例: ナノ粒子が腫瘍免疫を高める'))+row('大きさ',sel('g.size',(GA_SIZES.find(z=>z[2]===+sp.w&&z[3]===+sp.h)||['custom'])[0],GA_SIZES.map(z=>[z[0],z[1]]).concat((GA_SIZES.some(z=>z[2]===+sp.w&&z[3]===+sp.h))?[]:[['custom',`いまの大きさ（${sp.w}×${sp.h}）`]])))+row('背景',col('g.bg',sp.bg||'#ffffff'))
     +row('主役の色（E 案で「主役」にしたイラストに付く色）',`<div>${GA_ACCENTS.map(c=>`<button type="button" class="sw${(sp.accent||'#0E9F9A').toLowerCase()===c.toLowerCase()?' on':''}" data-gsw="accent" data-v="${c}" style="background:${c}"></button>`).join('')}</div>`)
     +row('ひな形（枠と矢印の配置）',`<select data-gtpl>${GA_TEMPLATES.map(([a,b])=>`<option value="${a}">${b}</option>`).join('')}</select><div class="btnrow"><button class="small" data-gact="tpl">このひな形にする</button></div>`)
     +`<div class="hint">キャンバスのイラスト・文字・矢印・枠を押すと、ここがその設定になります。Delete で削除、矢印キーで少しずつ動かせます。</div>`;}
  else if(it.t==='motif'){const M=GA_LIB[it.m];h=`<h4>イラスト「${gaEsc(M?M.ja:it.m)}」</h4>`+row('大きさ',num('s',it.s||100,16,800))+row('回転',sel('rot',it.rot||0,[[0,'なし'],[45,'45°'],[90,'90°'],[135,'135°'],[180,'180°'],[225,'225°'],[270,'270°'],[315,'315°']]))+chk('flip',it.flip,'左右反転')+chk('key',it.key,'主役（E 案で色が付く）')+row('ラベル（下に書く文字）',txt('label',it.label,'例: 腫瘍'))
     +`<div class="btnrow"><button class="small${gaState.replace?' primary':''}" data-gact="replace">${gaState.replace?'差し替えをやめる':'別のイラストに差し替える'}</button></div>`+common;}
  else if(it.t==='text'){h=`<h4>文字</h4>`+row('文字（改行で 2 行に）',`<textarea data-gp="text" rows="3">${gaEsc(it.text||'')}</textarea>`)+row('大きさ',num('size',it.size||14,6,72,0.5))+chk('bold',it.bold,'太字')+row('色',col('color',it.color||'#1f2933'))+row('揃え',sel('anchor',it.anchor||'middle',[['start','左揃え'],['middle','中央'],['end','右揃え']]))+common;}
  else if(it.t==='arrow'){h=`<h4>矢印</h4>`+row('種類',sel('kind',it.kind||'arrow',[['arrow','促進（→）'],['inhibit','抑制（T 字）'],['curved','曲がった矢印'],['dashed','破線の矢印'],['double','両向き']]))+row('太さ',num('width',it.width||4,1,20,0.5))+row('色',col('color',it.color||(it.kind==='inhibit'?'#C0392B':gaInk(sp.theme))))+(it.kind==='curved'?row('曲がり具合（− で逆向き）',num('bend',it.bend==null?0.3:it.bend,-1,1,0.05)):'')+row('ラベル',txt('label',it.label,'例: 活性化'))+`<div class="hint">両端の ○ をドラッグして向きと長さを変えられます。</div>`+common;}
  else if(it.t==='box'){h=`<h4>枠</h4>`+row('見出し',txt('title',it.title,'例: 結果'))+row('塗り',col('fill',it.fill||'#f7f9fb'))+row('枠線',col('stroke',it.stroke||'#dfe5ec'))+chk('dash',it.dash,'破線')+row('角の丸み',num('r',it.r==null?14:it.r,0,60))+common;}
  ins.innerHTML=h;}

/* ---------- チャットのブロック ---------- */
function figGaBlockHTML(j,r,nodeId,index){const th=GA_THEME_KEYS.includes(j.theme)?j.theme:'soft';return `<div class="figblock ga" data-fignode="${gaEsc(nodeId||'')}" data-figidx="${index}">${r.svg}<div class="figbtns"><button class="small" data-figedit data-tip="作成画面で編集する">✎ 編集</button><select class="small" data-figga="theme" data-tip="絵柄を切り替える（回答に書き戻します）">${GA_THEMES.map(([k,n])=>`<option value="${k}"${k===th?' selected':''}>${n}</option>`).join('')}</select><button class="small" data-figpng data-tip="PNG（300 dpi）で保存">PNG</button><button class="small" data-figsvg data-tip="SVG で保存">SVG</button><button class="small" data-figcopy data-tip="画像をコピー">⧉</button><button class="small" data-figjson data-tip="指定（JSON）を直して回答に書き戻す">{}</button></div></div>`;}
function figGaSet(fb,key,val){const nid=fb.dataset.fignode,idx=+fb.dataset.figidx;const n=N(nid);if(!n)return;const b=figFindBlocks(n.content)[idx];if(!b)return;let j;try{j=JSON.parse(b.json);}catch(e){return;}if(!figIsGA(j))return;j[key]=val;n.content=n.content.slice(0,b.start)+'```figure\n'+JSON.stringify(j)+'\n```'+n.content.slice(b.end);persist();renderAll();}

FIG_PROMPT+=`
グラフィカルアブストラクト（GA）を頼まれたら {"kind":"ga","theme":"soft","w":960,"h":540,"title":"短い題名","items":[…]} を 1 つの \`\`\`figure ブロックで出す（座標は px、原点は左上）。theme は soft（ソフト陰影＋細い輪郭）/ flat / line / glossy / mono（灰色＋主役だけ色）で、利用者が後から 5 つから選び直せる。
items の種類: {"t":"box","x","y","w","h","title"}（段・パネルの枠）/ {"t":"motif","m":"イラストのキー","x","y","s":大きさ(80〜160),"key":true（主役）,"label":"下に書く文字","flip":true,"rot":90} / {"t":"arrow","x1","y1","x2","y2","kind":"arrow|inhibit|curved|dashed|double","label"} / {"t":"text","x","y","text","size","bold":true}。
左 → 右（または上 → 下）に 3 段ほどの流れを作り、各段に 1〜3 個のイラストと短い言葉を置く。文字は少なく。イラストのキー（m）は次から選ぶ: ${Object.entries(GA_LIB).map(([k,v])=>k+'='+v.ja).join(', ')}。`;
