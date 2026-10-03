// BranCHAT Figure: 数学コア（PrismLab から流用。t/F/χ²/Studentized range の分布、記述統計、検定、Tukey/Dunnett、KM など。PrismLab 側で scipy と照合済み）
'use strict';
/* ---------------- 数学コア：特殊関数 ---------------- */
const LANCZOS=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
function lgamma(z){
  if(z<0.5)return Math.log(Math.PI/Math.sin(Math.PI*z))-lgamma(1-z);
  z-=1;let x=0.99999999999980993;
  for(let i=0;i<8;i++)x+=LANCZOS[i]/(z+i+1);
  const t=z+7.5;
  return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);
}
function betacf(a,b,x){
  const FPMIN=1e-300;let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;
  if(Math.abs(d)<FPMIN)d=FPMIN;d=1/d;let h=d;
  for(let m=1;m<=300;m++){
    const m2=2*m;
    let aa=m*(b-m)*x/((qam+m2)*(a+m2));
    d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;
    c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;
    d=1/d;h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
    d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;
    c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;
    d=1/d;const del=d*c;h*=del;
    if(Math.abs(del-1)<3e-13)break;
  }
  return h;
}
function ibeta(a,b,x){ // 正則化不完全ベータ関数 I_x(a,b)
  if(x<=0)return 0;if(x>=1)return 1;
  const bt=Math.exp(lgamma(a+b)-lgamma(a)-lgamma(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)?bt*betacf(a,b,x)/a:1-bt*betacf(b,a,1-x)/b;
}
function gammaincP(s,x){ // 正則化下側不完全ガンマ P(s,x)
  if(x<=0)return 0;
  if(x<s+1){
    let term=1/s,sum=term;
    for(let n=1;n<600;n++){term*=x/(s+n);sum+=term;if(term<sum*1e-15)break;}
    return sum*Math.exp(-x+s*Math.log(x)-lgamma(s));
  }
  let b=x+1-s,c=1e300,d=1/b,h=d;
  for(let i=1;i<600;i++){
    const an=-i*(i-s);b+=2;
    d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;
    c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;
    d=1/d;const del=d*c;h*=del;
    if(Math.abs(del-1)<1e-15)break;
  }
  return 1-h*Math.exp(-x+s*Math.log(x)-lgamma(s));
}
function normCDF(z){
  if(!isFinite(z))return z>0?1:0;
  const p=0.5*gammaincP(0.5,z*z/2);
  return z>=0?0.5+p:0.5-p;
}
function normInv(p){ // Acklam近似
  if(p<=0)return -Infinity;if(p>=1)return Infinity;
  const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
  const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
  const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
  const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
  const pl=0.02425;let q,r;
  if(p<pl){q=Math.sqrt(-2*Math.log(p));return(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  if(p>1-pl){q=Math.sqrt(-2*Math.log(1-p));return-(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  q=p-0.5;r=q*q;
  return(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
function tCDF(t,df){ // 下側確率
  if(!isFinite(t))return t>0?1:0;
  const x=df/(df+t*t);
  const p=0.5*ibeta(df/2,0.5,x);
  return t>=0?1-p:p;
}
function tPvalue(t,df){return 2*(1-tCDF(Math.abs(t),df));} // 両側
function tQuantile(p,df){ // 下側p分位点（二分法）
  if(p<=0)return -Infinity;if(p>=1)return Infinity;
  let lo=-500,hi=500;
  for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(tCDF(mid,df)<p)lo=mid;else hi=mid;}
  return (lo+hi)/2;
}
function fPvalue(F,d1,d2){ // 上側確率
  if(F<=0)return 1;
  return 1-ibeta(d1/2,d2/2,d1*F/(d1*F+d2));
}
function chi2Pvalue(x,k){if(x<=0)return 1;return 1-gammaincP(k/2,x/2);}

/* ---------------- 基本統計量 ---------------- */
function sum(v){let s=0;for(const x of v)s+=x;return s;}
function mean(v){return sum(v)/v.length;}
function variance(v){ // 不偏分散
  if(v.length<2)return NaN;
  const m=mean(v);let s=0;for(const x of v)s+=(x-m)*(x-m);
  return s/(v.length-1);
}
function sd(v){return Math.sqrt(variance(v));}
function quantile(v,q){ // R type-7
  const s=[...v].sort((a,b)=>a-b);
  if(s.length===0)return NaN;
  const h=(s.length-1)*q,lo=Math.floor(h),hi=Math.ceil(h);
  return s[lo]+(h-lo)*(s[hi]-s[lo]);
}
function median(v){return quantile(v,0.5);}
function ranksAvg(v){ // 同順位は平均ランク、タイ情報も返す
  const idx=v.map((x,i)=>[x,i]).sort((a,b)=>a[0]-b[0]);
  const ranks=new Array(v.length);const ties=[];
  let i=0;
  while(i<idx.length){
    let j=i;
    while(j+1<idx.length&&idx[j+1][0]===idx[i][0])j++;
    const r=(i+j)/2+1;
    for(let k=i;k<=j;k++)ranks[idx[k][1]]=r;
    if(j>i)ties.push(j-i+1);
    i=j+1;
  }
  return {ranks,ties};
}
function polyAsc(cs,x){let r=0;for(let i=cs.length-1;i>=0;i--)r=r*x+cs[i];return r;}

/* ---------------- Shapiro-Wilk 正規性検定 (Royston AS R94) ---------------- */
function shapiroWilk(data){
  const x=[...data].sort((a,b)=>a-b);const n=x.length;
  if(n<3)return null;
  if(x[n-1]-x[0]===0)return null; // 全て同値
  const m=new Array(n);
  for(let i=0;i<n;i++)m[i]=normInv(((i+1)-0.375)/(n+0.25));
  let mm=0;for(const v of m)mm+=v*v;
  const rsn=1/Math.sqrt(n);
  const a=new Array(n).fill(0);
  if(n>5){
    const cn=m[n-1]/Math.sqrt(mm),cn1=m[n-2]/Math.sqrt(mm);
    a[n-1]=polyAsc([cn,0.221157,-0.147981,-2.071190,4.434685,-2.706056],rsn);
    a[n-2]=polyAsc([cn1,0.042981,-0.293762,-1.752461,5.682633,-3.582633],rsn);
    const phi=(mm-2*m[n-1]*m[n-1]-2*m[n-2]*m[n-2])/(1-2*a[n-1]*a[n-1]-2*a[n-2]*a[n-2]);
    for(let i=2;i<n-2;i++)a[i]=m[i]/Math.sqrt(phi);
    a[0]=-a[n-1];a[1]=-a[n-2];
  }else{
    if(n===3){a[0]=-Math.SQRT1_2;a[2]=Math.SQRT1_2;}
    else{
      const cn=m[n-1]/Math.sqrt(mm);
      a[n-1]=polyAsc([cn,0.221157,-0.147981,-2.071190,4.434685,-2.706056],rsn);
      const phi=(mm-2*m[n-1]*m[n-1])/(1-2*a[n-1]*a[n-1]);
      for(let i=1;i<n-1;i++)a[i]=m[i]/Math.sqrt(phi);
      a[0]=-a[n-1];
    }
  }
  const mx=mean(x);
  let num=0,den=0;
  for(let i=0;i<n;i++){num+=a[i]*x[i];den+=(x[i]-mx)*(x[i]-mx);}
  let W=num*num/den;
  if(W>1)W=1;
  let p;
  if(n===3){
    p=Math.max(0,Math.min(1,(6/Math.PI)*(Math.asin(Math.sqrt(W))-Math.asin(Math.sqrt(0.75)))));
  }else if(n<=11){
    const g=-2.273+0.459*n;
    const mu=polyAsc([0.5440,-0.39978,0.025054,-6.714e-4],n);
    const sig=Math.exp(polyAsc([1.3822,-0.77857,0.062767,-0.0020322],n));
    const z=(-Math.log(g-Math.log(1-W))-mu)/sig;
    p=1-normCDF(z);
  }else{
    const ln=Math.log(n);
    const mu=polyAsc([-1.5861,-0.31082,-0.083751,0.0038915],ln);
    const sig=Math.exp(polyAsc([-0.4803,-0.082676,0.0030302],ln));
    const z=(Math.log(1-W)-mu)/sig;
    p=1-normCDF(z);
  }
  return {W,p,n};
}
/* ---------------- 行列演算 ---------------- */
function matMul(A,B){
  const n=A.length,m=B[0].length,k=B.length;
  const C=Array.from({length:n},()=>new Array(m).fill(0));
  for(let i=0;i<n;i++)for(let l=0;l<k;l++){const a=A[i][l];if(a===0)continue;for(let j=0;j<m;j++)C[i][j]+=a*B[l][j];}
  return C;
}
function matT(A){return A[0].map((_,j)=>A.map(r=>r[j]));}
function matInv(A){ // Gauss-Jordan（部分ピボット）
  const n=A.length;
  const M=A.map((r,i)=>[...r,...Array.from({length:n},(_,j)=>i===j?1:0)]);
  for(let col=0;col<n;col++){
    let piv=col;
    for(let r=col+1;r<n;r++)if(Math.abs(M[r][col])>Math.abs(M[piv][col]))piv=r;
    if(Math.abs(M[piv][col])<1e-12)return null; // 特異行列
    [M[col],M[piv]]=[M[piv],M[col]];
    const d=M[col][col];
    for(let j=0;j<2*n;j++)M[col][j]/=d;
    for(let r=0;r<n;r++){
      if(r===col)continue;
      const f=M[r][col];if(f===0)continue;
      for(let j=0;j<2*n;j++)M[r][j]-=f*M[col][j];
    }
  }
  return M.map(r=>r.slice(n));
}
function solveSym(A,b){const inv=matInv(A);if(!inv)return null;return inv.map(r=>r.reduce((s,v,j)=>s+v*b[j],0));}

/* ---------------- 検定：連続量 ---------------- */
function descStats(v){
  const n=v.length;
  const q1=quantile(v,0.25),q3=quantile(v,0.75);
  return {n,mean:mean(v),sd:sd(v),se:sd(v)/Math.sqrt(n),median:median(v),q1,q3,iqr:q3-q1,
          min:Math.min(...v),max:Math.max(...v)};
}
function tTest2(x,y,{welch=true}={}){
  const n1=x.length,n2=y.length,m1=mean(x),m2=mean(y),v1=variance(x),v2=variance(y);
  let t,df,se;
  if(welch){
    se=Math.sqrt(v1/n1+v2/n2);
    t=(m1-m2)/se;
    df=Math.pow(v1/n1+v2/n2,2)/(Math.pow(v1/n1,2)/(n1-1)+Math.pow(v2/n2,2)/(n2-1));
  }else{
    const sp2=((n1-1)*v1+(n2-1)*v2)/(n1+n2-2);
    se=Math.sqrt(sp2*(1/n1+1/n2));
    t=(m1-m2)/se;df=n1+n2-2;
  }
  const p=tPvalue(t,df);
  const tc=tQuantile(0.975,df);
  const d=(m1-m2)/Math.sqrt(((n1-1)*v1+(n2-1)*v2)/(n1+n2-2)); // Cohen's d (pooled)
  return {t,df,p,diff:m1-m2,ciLo:m1-m2-tc*se,ciHi:m1-m2+tc*se,cohenD:d,welch};
}
function tTestPaired(x,y){
  const d=x.map((v,i)=>v-y[i]);
  const n=d.length,md=mean(d),sdd=sd(d),se=sdd/Math.sqrt(n);
  const t=md/se,df=n-1,p=tPvalue(t,df);
  const tc=tQuantile(0.975,df);
  return {t,df,p,diff:md,ciLo:md-tc*se,ciHi:md+tc*se,cohenD:md/sdd,d};
}
function mannWhitney(x,y){
  const n1=x.length,n2=y.length,N=n1+n2;
  const all=[...x,...y];
  const {ranks,ties}=ranksAvg(all);
  let r1=0;for(let i=0;i<n1;i++)r1+=ranks[i];
  const U1=r1-n1*(n1+1)/2;
  const U=Math.min(U1,n1*n2-U1);
  const mu=n1*n2/2;
  let tieSum=0;for(const t of ties)tieSum+=t*t*t-t;
  const sig=Math.sqrt(n1*n2/12*((N+1)-tieSum/(N*(N-1))));
  if(sig===0)return {U,z:0,p:1,r:0};
  const z=(U1-mu-Math.sign(U1-mu)*0.5)/sig; // 連続性補正
  const p=2*(1-normCDF(Math.abs(z)));
  return {U,U1,z,p:Math.min(1,p),r:Math.abs(z)/Math.sqrt(N)};
}
function wilcoxonSigned(x,y){
  const dRaw=x.map((v,i)=>v-y[i]).filter(v=>v!==0);
  const n=dRaw.length;
  if(n<1)return {n:0,p:1,W:0,z:0};
  const absd=dRaw.map(Math.abs);
  const {ranks,ties}=ranksAvg(absd);
  let Wp=0,Wm=0;
  for(let i=0;i<n;i++){if(dRaw[i]>0)Wp+=ranks[i];else Wm+=ranks[i];}
  const W=Math.min(Wp,Wm);
  const mu=n*(n+1)/4;
  let tieSum=0;for(const t of ties)tieSum+=t*t*t-t;
  const sig=Math.sqrt(n*(n+1)*(2*n+1)/24-tieSum/48);
  if(sig===0)return {n,W,z:0,p:1};
  const z=(W-mu+0.5)/sig;
  const p=Math.min(1,2*(1-normCDF(Math.abs(z))));
  return {n,W,Wp,Wm,z,p,r:Math.abs(z)/Math.sqrt(n)};
}
function anova1(groups){ // groups: [{label, values}]
  const k=groups.length;
  const all=groups.flatMap(g=>g.values);
  const N=all.length,gm=mean(all);
  let ssb=0,ssw=0;
  for(const g of groups){
    const m=mean(g.values);
    ssb+=g.values.length*(m-gm)*(m-gm);
    for(const v of g.values)ssw+=(v-m)*(v-m);
  }
  const df1=k-1,df2=N-k;
  const F=(ssb/df1)/(ssw/df2);
  const p=fPvalue(F,df1,df2);
  return {F,df1,df2,p,eta2:ssb/(ssb+ssw),N};
}
function kruskalWallis(groups){
  const k=groups.length;
  const all=groups.flatMap(g=>g.values);
  const N=all.length;
  const {ranks,ties}=ranksAvg(all);
  let H=0,pos=0;
  const meanRanks=[];
  for(const g of groups){
    let r=0;for(let i=0;i<g.values.length;i++)r+=ranks[pos+i];
    meanRanks.push(r/g.values.length);
    H+=r*r/g.values.length;
    pos+=g.values.length;
  }
  H=12/(N*(N+1))*H-3*(N+1);
  let tieSum=0;for(const t of ties)tieSum+=t*t*t-t;
  const corr=1-tieSum/(N*N*N-N);
  if(corr>0)H/=corr;
  const df=k-1,p=chi2Pvalue(H,df);
  return {H,df,p,eps2:(H-k+1)/(N-k),meanRanks,N,tieSum};
}
function holm(ps){ // Holm補正
  const idx=ps.map((p,i)=>[p,i]).sort((a,b)=>a[0]-b[0]);
  const m=ps.length,out=new Array(m);
  let prev=0;
  idx.forEach(([p,i],rank)=>{
    const adj=Math.min(1,Math.max(prev,(m-rank)*p));
    out[i]=adj;prev=adj;
  });
  return out;
}
function pairwiseWelch(groups){ // 事後検定: Welch t + Holm
  const pairs=[];
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
    const r=tTest2(groups[i].values,groups[j].values,{welch:true});
    pairs.push({a:groups[i].label,b:groups[j].label,diff:r.diff,p:r.p,t:r.t});
  }
  const adj=holm(pairs.map(p=>p.p));
  pairs.forEach((p,i)=>p.pAdj=adj[i]);
  return pairs;
}
function dunnTest(groups){ // KW事後: Dunn + Holm
  const all=groups.flatMap(g=>g.values);
  const N=all.length;
  const {ranks,ties}=ranksAvg(all);
  let pos=0;const mr=[],ns=[];
  for(const g of groups){
    let r=0;for(let i=0;i<g.values.length;i++)r+=ranks[pos+i];
    mr.push(r/g.values.length);ns.push(g.values.length);pos+=g.values.length;
  }
  let tieSum=0;for(const t of ties)tieSum+=t*t*t-t;
  const base=N*(N+1)/12-tieSum/(12*(N-1));
  const pairs=[];
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
    const se=Math.sqrt(base*(1/ns[i]+1/ns[j]));
    const z=(mr[i]-mr[j])/se;
    pairs.push({a:groups[i].label,b:groups[j].label,z,p:2*(1-normCDF(Math.abs(z)))});
  }
  const adj=holm(pairs.map(p=>p.p));
  pairs.forEach((p,i)=>p.pAdj=adj[i]);
  return pairs;
}

/* ---------------- 検定：分割表 ---------------- */
function chi2Test(table){ // table: 2次元配列（行×列）
  const R=table.length,C=table[0].length;
  const rowSum=table.map(r=>sum(r));
  const colSum=table[0].map((_,j)=>sum(table.map(r=>r[j])));
  const N=sum(rowSum);
  let chi2=0,minExp=Infinity,lowExpCells=0;
  const expected=table.map((row,i)=>row.map((_,j)=>{
    const e=rowSum[i]*colSum[j]/N;
    if(e<minExp)minExp=e;
    if(e<5)lowExpCells++;
    return e;
  }));
  for(let i=0;i<R;i++)for(let j=0;j<C;j++){
    const e=expected[i][j];
    if(e>0)chi2+=Math.pow(table[i][j]-e,2)/e;
  }
  const df=(R-1)*(C-1);
  const p=chi2Pvalue(chi2,df);
  const cramerV=Math.sqrt(chi2/(N*Math.min(R-1,C-1)));
  return {chi2,df,p,cramerV,expected,minExp,lowExpCells,totalCells:R*C,N,rowSum,colSum};
}
function fisherExact2x2(a,b,c,d){ // 両側（確率法）：P(X=x)≦P(X=a) となる x の確率を合算
  const n=a+b+c+d,r1=a+b,c1=a+c;
  const logP=(x)=>{
    const b2=r1-x,c2=c1-x,d2=n-r1-c1+x;
    if(x<0||b2<0||c2<0||d2<0)return -Infinity;
    return lgamma(r1+1)+lgamma(n-r1+1)+lgamma(c1+1)+lgamma(n-c1+1)-lgamma(n+1)
          -lgamma(x+1)-lgamma(b2+1)-lgamma(c2+1)-lgamma(d2+1);
  };
  const pObs=logP(a);
  let p=0;
  const lo=Math.max(0,c1-(n-r1)),hi=Math.min(r1,c1);
  for(let x=lo;x<=hi;x++){
    const px=logP(x);
    if(px<=pObs+1e-7)p+=Math.exp(px);
  }
  return {p:Math.min(1,p)};
}
function orRr2x2(a,b,c,d){ // オッズ比・リスク比（Haldane補正付き）
  const z=(a===0||b===0||c===0||d===0)?0.5:0;
  const A=a+z,B=b+z,C=c+z,D=d+z;
  const or=(A*D)/(B*C);
  const seLnOr=Math.sqrt(1/A+1/B+1/C+1/D);
  const rr=(A/(A+B))/(C/(C+D));
  const seLnRr=Math.sqrt(1/A-1/(A+B)+1/C-1/(C+D));
  const q=1.959963984540054;
  return {
    or,orLo:Math.exp(Math.log(or)-q*seLnOr),orHi:Math.exp(Math.log(or)+q*seLnOr),
    rr,rrLo:Math.exp(Math.log(rr)-q*seLnRr),rrHi:Math.exp(Math.log(rr)+q*seLnRr),
    corrected:z>0
  };
}

/* ---------------- 相関 ---------------- */
function pearson(x,y){
  const n=x.length,mx=mean(x),my=mean(y);
  let sxy=0,sxx=0,syy=0;
  for(let i=0;i<n;i++){sxy+=(x[i]-mx)*(y[i]-my);sxx+=(x[i]-mx)*(x[i]-mx);syy+=(y[i]-my)*(y[i]-my);}
  if(sxx===0||syy===0)return {r:NaN,p:NaN,n};
  const r=sxy/Math.sqrt(sxx*syy);
  const t=r*Math.sqrt((n-2)/(1-r*r));
  const p=tPvalue(t,n-2);
  // Fisher z による95%CI
  const zr=0.5*Math.log((1+r)/(1-r)),sez=1/Math.sqrt(n-3);
  const q=1.959963984540054;
  return {r,p,n,ciLo:Math.tanh(zr-q*sez),ciHi:Math.tanh(zr+q*sez)};
}
function spearman(x,y){
  const rx=ranksAvg(x).ranks,ry=ranksAvg(y).ranks;
  const res=pearson(rx,ry);
  return {rho:res.r,p:res.p,n:x.length,ciLo:res.ciLo,ciHi:res.ciHi};
}

/* ---------------- 回帰 ---------------- */
function linReg(X,y,names){ // X: n×p（切片列含む） names: 係数名
  const n=X.length,p=X[0].length;
  const Xt=matT(X);
  const XtX=matMul(Xt,X);
  const inv=matInv(XtX);
  if(!inv)return {error:"説明変数が互いに強く相関しており（多重共線性）、係数を計算できません。"};
  const Xty=Xt.map(r=>r.reduce((s,v,i)=>s+v*y[i],0));
  const beta=inv.map(r=>r.reduce((s,v,j)=>s+v*Xty[j],0));
  const yhat=X.map(row=>row.reduce((s,v,j)=>s+v*beta[j],0));
  const resid=y.map((v,i)=>v-yhat[i]);
  const my=mean(y);
  const sse=sum(resid.map(r=>r*r));
  const sst=sum(y.map(v=>(v-my)*(v-my)));
  const df=n-p;
  const sigma2=sse/df;
  const se=beta.map((_,j)=>Math.sqrt(sigma2*inv[j][j]));
  const tvals=beta.map((b,j)=>b/se[j]);
  const ps=tvals.map(t=>tPvalue(t,df));
  const tc=tQuantile(0.975,df);
  const r2=1-sse/sst;
  const adjR2=1-(1-r2)*(n-1)/df;
  const F=((sst-sse)/(p-1))/sigma2;
  const modelP=p>1?fPvalue(F,p-1,df):NaN;
  return {beta,se,tvals,ps,ciLo:beta.map((b,j)=>b-tc*se[j]),ciHi:beta.map((b,j)=>b+tc*se[j]),
          r2,adjR2,F,modelP,df,n,names,yhat,resid,rmse:Math.sqrt(sigma2)};
}
function logisticReg(X,y,names){ // IRLS ロジスティック回帰
  const n=X.length,p=X[0].length;
  let beta=new Array(p).fill(0);
  let converged=false,iter=0;
  for(iter=0;iter<60;iter++){
    const eta=X.map(row=>row.reduce((s,v,j)=>s+v*beta[j],0));
    const mu=eta.map(e=>1/(1+Math.exp(-Math.max(-35,Math.min(35,e)))));
    const w=mu.map(m=>Math.max(1e-10,m*(1-m)));
    const grad=new Array(p).fill(0);
    for(let i=0;i<n;i++)for(let j=0;j<p;j++)grad[j]+=X[i][j]*(y[i]-mu[i]);
    const H=Array.from({length:p},()=>new Array(p).fill(0));
    for(let i=0;i<n;i++)for(let j=0;j<p;j++){const wx=w[i]*X[i][j];for(let k2=j;k2<p;k2++)H[j][k2]+=wx*X[i][k2];}
    for(let j=0;j<p;j++)for(let k2=0;k2<j;k2++)H[j][k2]=H[k2][j];
    const delta=solveSym(H,grad);
    if(!delta)return {error:"モデルを推定できません（変数間の共線性、またはデータ不足の可能性）。"};
    let maxd=0;
    for(let j=0;j<p;j++){beta[j]+=delta[j];maxd=Math.max(maxd,Math.abs(delta[j]));}
    if(maxd<1e-8){converged=true;break;}
  }
  const sep=beta.some(b=>Math.abs(b)>15);
  const eta=X.map(row=>row.reduce((s,v,j)=>s+v*beta[j],0));
  const mu=eta.map(e=>1/(1+Math.exp(-Math.max(-35,Math.min(35,e)))));
  const w=mu.map(m=>Math.max(1e-10,m*(1-m)));
  const H=Array.from({length:p},()=>new Array(p).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<p;j++){const wx=w[i]*X[i][j];for(let k2=j;k2<p;k2++)H[j][k2]+=wx*X[i][k2];}
  for(let j=0;j<p;j++)for(let k2=0;k2<j;k2++)H[j][k2]=H[k2][j];
  const cov=matInv(H);
  if(!cov)return {error:"標準誤差を計算できません（共線性の可能性）。"};
  const se=beta.map((_,j)=>Math.sqrt(Math.abs(cov[j][j])));
  const zvals=beta.map((b,j)=>b/se[j]);
  const ps=zvals.map(z=>2*(1-normCDF(Math.abs(z))));
  const q=1.959963984540054;
  // 対数尤度・モデル検定・AUC
  let ll=0;for(let i=0;i<n;i++)ll+=y[i]*Math.log(Math.max(1e-15,mu[i]))+(1-y[i])*Math.log(Math.max(1e-15,1-mu[i]));
  const p1=mean(y);
  const ll0=n*(p1*Math.log(Math.max(1e-15,p1))+(1-p1)*Math.log(Math.max(1e-15,1-p1)));
  const lrChi2=2*(ll-ll0);
  const modelP=p>1?chi2Pvalue(lrChi2,p-1):NaN;
  // AUC（順位法）
  const {ranks}=ranksAvg(mu);
  let rPos=0,nPos=0;
  for(let i=0;i<n;i++){if(y[i]===1){rPos+=ranks[i];nPos++;}}
  const nNeg=n-nPos;
  const auc=nPos>0&&nNeg>0?(rPos-nPos*(nPos+1)/2)/(nPos*nNeg):NaN;
  return {beta,se,zvals,ps,or:beta.map(Math.exp),
          orLo:beta.map((b,j)=>Math.exp(b-q*se[j])),orHi:beta.map((b,j)=>Math.exp(b+q*se[j])),
          converged,separation:sep,ll,lrChi2,modelP,mcfadden:1-ll/ll0,auc,n,nPos,names,iter};
}

/* ---------------- 生存解析 ---------------- */
function kaplanMeier(times,events){ // 単一群のKM推定
  const idx=times.map((t,i)=>i).sort((a,b)=>times[a]-times[b]);
  const steps=[{t:0,s:1}];
  let s=1,i=0;
  const censors=[];
  const n=times.length;
  let atRisk=n;
  const sorted=idx.map(i2=>({t:times[i2],e:events[i2]}));
  while(i<n){
    const t=sorted[i].t;
    let d=0,c=0;
    while(i<n&&sorted[i].t===t){if(sorted[i].e)d++;else c++;i++;}
    if(d>0){
      s*=(atRisk-d)/atRisk;
      steps.push({t,s});
    }
    if(c>0)censors.push({t,s});
    atRisk-=d+c;
  }
  // 中央値：S(t)<=0.5 となる最初のイベント時刻
  let med=null;
  for(const st of steps)if(st.t>0&&st.s<=0.5){med=st.t;break;}
  return {steps,censors,median:med,n,events:sum(events),maxT:Math.max(...times)};
}
function atRiskAt(times,t){let c=0;for(const x of times)if(x>=t)c++;return c;}
function logRank(groups){ // groups: [{label,times,events}] k群対応
  const k=groups.length;
  const allEventTimes=[...new Set(groups.flatMap(g=>g.times.filter((t,i)=>g.events[i]===1)))].sort((a,b)=>a-b);
  const O=new Array(k).fill(0),E=new Array(k).fill(0);
  const V=Array.from({length:k},()=>new Array(k).fill(0));
  for(const t of allEventTimes){
    const nAt=groups.map(g=>atRiskAt(g.times,t));
    const N=sum(nAt);
    if(N<=1)continue;
    const dAt=groups.map(g=>{let d=0;for(let i=0;i<g.times.length;i++)if(g.times[i]===t&&g.events[i]===1)d++;return d;});
    const D=sum(dAt);
    if(D===0)continue;
    for(let g=0;g<k;g++){
      O[g]+=dAt[g];
      E[g]+=D*nAt[g]/N;
      for(let h=0;h<k;h++){
        const delta=g===h?1:0;
        if(N>1)V[g][h]+=D*(nAt[g]/N)*(delta-nAt[h]/N)*(N-D)/(N-1);
      }
    }
  }
  // 先頭k-1次元で χ² = (O-E)' V⁻¹ (O-E)
  const d=O.map((o,g)=>o-E[g]).slice(0,k-1);
  const Vsub=V.slice(0,k-1).map(r=>r.slice(0,k-1));
  const inv=matInv(Vsub);
  let chi2=0;
  if(inv){
    for(let i=0;i<k-1;i++)for(let j=0;j<k-1;j++)chi2+=d[i]*inv[i][j]*d[j];
  }
  const df=k-1;
  return {chi2,df,p:chi2Pvalue(chi2,df),O,E};
}
function coxPH(times,events,X,names){ // Cox比例ハザード（Efron法）
  const n=times.length,p=X[0].length;
  const ord=times.map((_,i)=>i).sort((a,b)=>times[a]-times[b]);
  const T=ord.map(i=>times[i]),EV=ord.map(i=>events[i]),XX=ord.map(i=>X[i]);
  let beta=new Array(p).fill(0);
  let converged=false;
  // 距離のあるイベント時刻グループ
  const eventTimes=[...new Set(T.filter((t,i)=>EV[i]===1))].sort((a,b)=>a-b);
  for(let iter=0;iter<60;iter++){
    const xb=XX.map(row=>row.reduce((s,v,j)=>s+v*beta[j],0));
    const ex=xb.map(e=>Math.exp(Math.max(-300,Math.min(300,e))));
    const U=new Array(p).fill(0);
    const I=Array.from({length:p},()=>new Array(p).fill(0));
    for(const t of eventTimes){
      const Ridx=[],Didx=[];
      for(let i=0;i<n;i++){
        if(T[i]>=t)Ridx.push(i);
        if(T[i]===t&&EV[i]===1)Didx.push(i);
      }
      const dcnt=Didx.length;
      let s0R=0;const s1R=new Array(p).fill(0);const s2R=Array.from({length:p},()=>new Array(p).fill(0));
      for(const i of Ridx){
        s0R+=ex[i];
        for(let j=0;j<p;j++){
          s1R[j]+=ex[i]*XX[i][j];
          for(let k2=j;k2<p;k2++)s2R[j][k2]+=ex[i]*XX[i][j]*XX[i][k2];
        }
      }
      let s0D=0;const s1D=new Array(p).fill(0);const s2D=Array.from({length:p},()=>new Array(p).fill(0));
      const xSumD=new Array(p).fill(0);
      for(const i of Didx){
        s0D+=ex[i];
        for(let j=0;j<p;j++){
          s1D[j]+=ex[i]*XX[i][j];xSumD[j]+=XX[i][j];
          for(let k2=j;k2<p;k2++)s2D[j][k2]+=ex[i]*XX[i][j]*XX[i][k2];
        }
      }
      for(let l=0;l<dcnt;l++){
        const f=l/dcnt;
        const d0=s0R-f*s0D;
        for(let j=0;j<p;j++){
          const d1j=s1R[j]-f*s1D[j];
          U[j]+=xSumD[j]/dcnt-d1j/d0;
          for(let k2=j;k2<p;k2++){
            const d1k=s1R[k2]-f*s1D[k2];
            const d2=(k2>=j?(s2R[j][k2]-f*s2D[j][k2]):0);
            I[j][k2]+=d2/d0-(d1j*d1k)/(d0*d0);
          }
        }
      }
    }
    for(let j=0;j<p;j++)for(let k2=0;k2<j;k2++)I[j][k2]=I[k2][j];
    const delta=solveSym(I,U);
    if(!delta)return {error:"モデルを推定できません（共線性、またはイベント数不足の可能性）。"};
    let maxd=0;
    for(let j=0;j<p;j++){beta[j]+=delta[j];maxd=Math.max(maxd,Math.abs(delta[j]));}
    if(maxd<1e-8){converged=true;break;}
  }
  // 最終情報行列から分散
  const xb=XX.map(row=>row.reduce((s,v,j)=>s+v*beta[j],0));
  const ex=xb.map(e=>Math.exp(Math.max(-300,Math.min(300,e))));
  const I=Array.from({length:p},()=>new Array(p).fill(0));
  for(const t of eventTimes){
    const Ridx=[],Didx=[];
    for(let i=0;i<n;i++){
      if(T[i]>=t)Ridx.push(i);
      if(T[i]===t&&EV[i]===1)Didx.push(i);
    }
    const dcnt=Didx.length;
    let s0R=0;const s1R=new Array(p).fill(0);const s2R=Array.from({length:p},()=>new Array(p).fill(0));
    for(const i of Ridx){
      s0R+=ex[i];
      for(let j=0;j<p;j++){s1R[j]+=ex[i]*XX[i][j];for(let k2=j;k2<p;k2++)s2R[j][k2]+=ex[i]*XX[i][j]*XX[i][k2];}
    }
    let s0D=0;const s1D=new Array(p).fill(0);const s2D=Array.from({length:p},()=>new Array(p).fill(0));
    for(const i of Didx){
      s0D+=ex[i];
      for(let j=0;j<p;j++){s1D[j]+=ex[i]*XX[i][j];for(let k2=j;k2<p;k2++)s2D[j][k2]+=ex[i]*XX[i][j]*XX[i][k2];}
    }
    for(let l=0;l<dcnt;l++){
      const f=l/dcnt;
      const d0=s0R-f*s0D;
      for(let j=0;j<p;j++){
        const d1j=s1R[j]-f*s1D[j];
        for(let k2=j;k2<p;k2++){
          const d1k=s1R[k2]-f*s1D[k2];
          I[j][k2]+=(s2R[j][k2]-f*s2D[j][k2])/d0-(d1j*d1k)/(d0*d0);
        }
      }
    }
  }
  for(let j=0;j<p;j++)for(let k2=0;k2<j;k2++)I[j][k2]=I[k2][j];
  const cov=matInv(I);
  if(!cov)return {error:"標準誤差を計算できません。"};
  const se=beta.map((_,j)=>Math.sqrt(Math.abs(cov[j][j])));
  const zvals=beta.map((b,j)=>b/se[j]);
  const ps=zvals.map(z=>2*(1-normCDF(Math.abs(z))));
  const q=1.959963984540054;
  // Harrell's C
  let conc=0,tied=0,total=0;
  for(let i=0;i<n;i++)for(let j2=0;j2<n;j2++){
    if(i===j2)continue;
    if(EV[i]===1&&(T[i]<T[j2]||(T[i]===T[j2]&&EV[j2]===0))){
      total++;
      if(xb[i]>xb[j2])conc++;
      else if(xb[i]===xb[j2])tied++;
    }
  }
  const cIndex=total>0?(conc+0.5*tied)/total:NaN;
  return {beta,se,zvals,ps,hr:beta.map(Math.exp),
          hrLo:beta.map((b,j)=>Math.exp(b-q*se[j])),hrHi:beta.map((b,j)=>Math.exp(b+q*se[j])),
          converged,cIndex,n,nEvents:sum(EV),names};
}

/* =====================================================================
   PrismLab 拡張統計エンジン
   ===================================================================== */
/* ---- 高速な正規分布関数（多重比較の数値積分用） ---- */
const ERFC_COF=[-1.3026537197817094,6.4196979235649026e-1,1.9476473204185836e-2,-9.561514786808631e-3,
-9.46595344482036e-4,3.66839497852761e-4,4.2523324806907e-5,-2.0278578112534e-5,-1.624290004647e-6,
1.303655835580e-6,1.5626441722e-8,-8.5238095915e-8,6.529054439e-9,5.059343495e-9,-9.91364156e-10,
-2.27365122e-10,9.6467911e-11,2.394038e-12,-6.886027e-12,8.94487e-13,3.13092e-13,-1.12708e-13,3.81e-16,7.106e-15];
function erfcFast(x){
  const z=Math.abs(x),t=2/(2+z),ty=4*t-2;
  let d=0,dd=0;
  for(let j=ERFC_COF.length-1;j>0;j--){const tmp=d;d=ty*d-dd+ERFC_COF[j];dd=tmp;}
  const ans=t*Math.exp(-z*z+0.5*(ERFC_COF[0]+ty*d)-dd);
  return x>=0?ans:2-ans;
}
function ncdf(z){return 0.5*erfcFast(-z/Math.SQRT2);}
function npdf(z){return 0.3989422804014327*Math.exp(-0.5*z*z);}

/* ---- ステューデント化範囲分布（Tukey法） ---- */
function prange(w,k){ // k個の標準正規の範囲が w 未満となる確率
  if(w<=0)return 0;
  const N=140,lo=-8.5,hi=8.5,h=(hi-lo)/N;
  let s=0;
  for(let i=0;i<=N;i++){
    const z=lo+i*h;
    const inner=ncdf(z)-ncdf(z-w);
    const f=k*npdf(z)*Math.pow(Math.max(0,inner),k-1);
    s+=((i===0||i===N)?1:(i%2?4:2))*f;
  }
  return Math.min(1,Math.max(0,s*h/3));
}
function ptukey(q,k,df){ // P(Q < q)
  if(q<=0)return 0;
  if(!isFinite(df)||df>3000)return prange(q,k);
  const c=(df/2)*Math.log(df)-lgamma(df/2)-(df/2-1)*Math.LN2;
  const sd0=1/Math.sqrt(2*df);
  const lo=Math.max(1e-6,1-9*sd0),hi=1+9*sd0;
  const N=120,h=(hi-lo)/N;
  let acc=0;
  for(let i=0;i<=N;i++){
    const s=lo+i*h;
    const lf=c+(df-1)*Math.log(s)-df*s*s/2;
    const f=Math.exp(lf)*prange(q*s,k);
    acc+=((i===0||i===N)?1:(i%2?4:2))*f;
  }
  return Math.min(1,Math.max(0,acc*h/3));
}
function ptukeyP(q,k,df){return 1-ptukey(q,k,df);}
function qtukey(p,k,df){ // 分位点（信頼区間用）
  let lo=0,hi=30;
  for(let i=0;i<60;i++){const m=(lo+hi)/2;if(ptukey(m,k,df)<p)lo=m;else hi=m;}
  return (lo+hi)/2;
}
/* ---- Dunnett（対照群との比較）：1因子構造の厳密積分 ---- */
function pdunnett(d,lam,df,twoSided=true){ // lam[i]=sqrt(n_i/(n_i+n0)) で相関 lam_i*lam_j
  if(d<=0)return 1;
  const inner=(s)=>{
    const N=120,lo=-8.5,hi=8.5,h=(hi-lo)/N;
    let acc=0;
    for(let i=0;i<=N;i++){
      const z=lo+i*h;
      let prod=1;
      for(const L of lam){
        const den=Math.sqrt(Math.max(1e-9,1-L*L));
        prod*= twoSided ? Math.max(0,ncdf((L*z+d*s)/den)-ncdf((L*z-d*s)/den))
                        : Math.max(0,ncdf((L*z+d*s)/den));
        if(prod<=0)break;
      }
      acc+=((i===0||i===N)?1:(i%2?4:2))*npdf(z)*prod;
    }
    return acc*h/3;
  };
  if(!isFinite(df)||df>3000)return Math.min(1,Math.max(0,1-inner(1)));
  const c=(df/2)*Math.log(df)-lgamma(df/2)-(df/2-1)*Math.LN2;
  const sd0=1/Math.sqrt(2*df);
  const lo=Math.max(1e-6,1-9*sd0),hi=1+9*sd0;
  const N=100,h=(hi-lo)/N;
  let acc=0;
  for(let i=0;i<=N;i++){
    const s=lo+i*h;
    const lf=c+(df-1)*Math.log(s)-df*s*s/2;
    acc+=((i===0||i===N)?1:(i%2?4:2))*Math.exp(lf)*inner(s);
  }
  return Math.min(1,Math.max(0,1-acc*h/3));
}
/* ---- 各種p値補正 ---- */
function bonferroni(ps){return ps.map(p=>Math.min(1,p*ps.length));}
function sidakAdj(ps){const m=ps.length;return ps.map(p=>1-Math.pow(1-p,m));}
function bhFDR(ps){ // Benjamini-Hochberg
  const idx=ps.map((p,i)=>[p,i]).sort((a,b)=>b[0]-a[0]);
  const m=ps.length,out=new Array(m);let prev=1;
  idx.forEach(([p,i],r)=>{const rank=m-r;const adj=Math.min(prev,p*m/rank);out[i]=adj;prev=adj;});
  return out;
}
/* ---- 記述統計（Prism仕様のフルセット） ---- */
function describeFull(v,ci=0.95){
  const n=v.length;
  if(n===0)return null;
  const m=mean(v),s=sd(v),se=s/Math.sqrt(n);
  const tc=n>1?tQuantile(1-(1-ci)/2,n-1):NaN;
  let m2=0,m3=0,m4=0;
  for(const x of v){const d=x-m;m2+=d*d;m3+=d*d*d;m4+=d*d*d*d;}
  m2/=n;m3/=n;m4/=n;
  const g1=m2>0?m3/Math.pow(m2,1.5):NaN;
  const g2=m2>0?m4/(m2*m2)-3:NaN;
  const G1=n>2?g1*Math.sqrt(n*(n-1))/(n-2):NaN;
  const G2=n>3?((n-1)/((n-2)*(n-3)))*((n+1)*g2+6):NaN;
  const pos=v.every(x=>x>0);
  const gm=pos?Math.exp(mean(v.map(Math.log))):NaN;
  const gsd=pos&&n>1?Math.exp(sd(v.map(Math.log))):NaN;
  return {n,mean:m,sd:s,se,ciLo:m-tc*se,ciHi:m+tc*se,ciLevel:ci,
    median:median(v),q1:quantile(v,0.25),q3:quantile(v,0.75),
    min:Math.min(...v),max:Math.max(...v),range:Math.max(...v)-Math.min(...v),
    sum:sum(v),cv:s/Math.abs(m)*100,skew:G1,kurt:G2,geoMean:gm,geoSD:gsd,
    p5:quantile(v,0.05),p95:quantile(v,0.95),p10:quantile(v,0.10),p90:quantile(v,0.90)};
}

