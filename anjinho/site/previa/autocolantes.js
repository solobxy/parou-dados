// autocolantes da anjinho: desenhaAutocolantes(raiz) desenha os [data-f][data-e] que ainda não foram desenhados
function desenhaAutocolantes(raiz){
// autocolantes: laços, corações, borboletas, coelhinhos

const NS='http://www.w3.org/2000/svg',T='#1D1719',R='#F6B8C8',R2='#E88AA3',W='#FFFFFF';
const FORMAS={
 laco:{d:'M50 46 C 32 20, 8 22, 8 40 C 8 58, 30 60, 50 50 C 70 60, 92 58, 92 40 C 92 22, 68 20, 50 46 Z',cx:50,cy:44,x:'M46 52 L 34 88 M54 52 L 68 86',pt:[[50,48,5]]},
 coracao:{d:'M50 86 C 18 64, 6 44, 14 28 C 22 12, 44 14, 50 30 C 56 14, 78 12, 86 28 C 94 44, 82 64, 50 86 Z',cx:50,cy:46,x:'',pt:[]},
 borboleta:{d:'M50 50 C 40 20, 10 10, 10 34 C 10 50, 30 52, 48 52 C 26 56, 18 80, 32 86 C 44 90, 50 70, 50 56 C 50 70, 56 90, 68 86 C 82 80, 74 56, 52 52 C 70 52, 90 50, 90 34 C 90 10, 60 20, 50 50 Z',cx:50,cy:52,x:'M50 34 L 50 74 M50 34 C 47 24, 43 18, 38 14 M50 34 C 53 24, 57 18, 62 14',pt:[]},
 coelho:{d:'M38 50 C 30 34, 26 8, 34 6 C 42 4, 44 30, 46 46 C 48 46, 52 46, 54 46 C 56 30, 58 4, 66 6 C 74 8, 70 34, 62 50 C 76 56, 80 72, 72 84 C 64 94, 36 94, 28 84 C 20 72, 24 56, 38 50 Z',cx:50,cy:60,x:'M46 77 L 50 80 L 54 77',pt:[[40,69,2.8],[60,69,2.8]]}
};
const PIX={
 laco:['...........','.RR.....RR.','RPPR...RPPR','RPPPRTRPPPR','RPPPRTRPPPR','RPPR.T.RPPR','.RR.TTT.RR.','....T.T....','...T...T...','..T.....T..'],
 coracao:['.TTT.TTT.','TPPPTPPPT','TPWPPPPPT','TPPPPPPPT','.TPPPPPT.','..TPPPT..','...TPT...','....T....'],
 borboleta:['..T.....T..','...T...T...','RRR..T..RRR','RPPR.T.RPPR','RPPPRTRPPPR','.RPPRTRPPR.','..RPRTRPR..','.RPPRTRPPR.','.RRR.T.RRR.'],
 coelho:['.TTT...TTT.','.TPT...TPT.','.TPT...TPT.','.TWT...TWT.','.TWTTTTTWT.','TWWWWWWWWWT','TWWTWWWTWWT','TWPWWWWWPWT','TWWWWTWWWWT','.TWWWWWWWT.','..TTTTTTT..']
};
let seed=11;const rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280};
const el=(n,a)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);return e};
const tmp=el('svg',{width:0,height:0});tmp.style.position='absolute';document.body.appendChild(tmp);
function P(d,n){const p=el('path',{d});tmp.appendChild(p);const L=p.getTotalLength();const r=Array.from({length:n},(_,i)=>p.getPointAtLength(L*i/n));p.remove();return r}

function extras(s,F,cor,w){if(F.x)s.append(el('path',{d:F.x,fill:'none',stroke:cor,'stroke-width':w,'stroke-linecap':'round','stroke-linejoin':'round'}));F.pt.forEach(([x,y,r])=>s.append(el('circle',{cx:x,cy:y,r,fill:cor})))}
function clip(s,F){const id='k'+(window._uid=(window._uid||0)+1);const df=el('defs');const cp=el('clipPath',{id});cp.append(el('path',{d:F.d}));df.append(cp);s.append(df);return el('g',{'clip-path':`url(#${id})`})}
const EST={
 autocolante:(s,F,f)=>{s.append(el('path',{d:F.d,fill:f==='coracao'?R:W,stroke:T,'stroke-width':4,'stroke-linejoin':'round'}));extras(s,F,T,4);if(f==='laco')s.append(el('circle',{cx:50,cy:48,r:6,fill:R,stroke:T,'stroke-width':3}))},
 vetor:(s,F)=>{s.append(el('path',{d:F.d,fill:'none',stroke:R2,'stroke-width':2}));extras(s,F,R2,2);P(F.d,10).forEach(q=>s.append(el('rect',{x:q.x-2.4,y:q.y-2.4,width:4.8,height:4.8,fill:T})))},
 rabisco:(s,F)=>{let d='';const b=P(F.d,60);for(let k=0;k<3;k++)b.forEach((q,i)=>{const j=()=>(rnd()-.5)*(k?9:6);d+=(i||k?'L':'M')+(q.x+j()).toFixed(1)+' '+(q.y+j()).toFixed(1)});
  s.append(el('path',{d,fill:'none',stroke:R2,'stroke-width':1.6,'stroke-linejoin':'round'}));extras(s,F,T,2.6)},
 pontos:(s,F)=>{[1,.7,.42].forEach((k,ri)=>P(F.d,[34,24,14][ri]).forEach(q=>s.append(el('circle',{cx:F.cx+(q.x-F.cx)*k,cy:F.cy+(q.y-F.cy)*k,r:[2.8,2.2,1.6][ri],fill:R2}))));extras(s,F,T,2.6)},
 meiotom:(s,F)=>{const g=clip(s,F);for(let y=4;y<96;y+=4)for(let x=2;x<98;x+=4){const r=2.1*(1-(y-4)/96)+.3;g.append(el('circle',{cx:x+((y/4)%2?2:0),cy:y,r,fill:T}))}s.append(g);extras(s,F,T,3)},
 riscas:(s,F)=>{const g=clip(s,F);for(let y=0;y<100;y+=7)g.append(el('rect',{x:0,y,width:100,height:4,fill:R2}));s.append(g);extras(s,F,R2,3.4)},
 papel:(s,F)=>{s.append(el('path',{d:F.d,fill:R,transform:`rotate(-3 ${F.cx} ${F.cy})`}),el('path',{d:F.d,fill:'none',stroke:T,'stroke-width':2.2,transform:`translate(2.5 2) rotate(2 ${F.cx} ${F.cy})`}));extras(s,F,T,3)},
 pixel:(s,F,f)=>{const m=PIX[f],h=m.length,w=m[0].length,c=92/Math.max(w,h),ox=(100-w*c)/2,oy=(100-h*c)/2,cor={R:R2,P:R,T,W};
  m.forEach((row,y)=>[...row].forEach((ch,x)=>{if(ch!=='.')s.append(el('rect',{x:(ox+x*c).toFixed(2),y:(oy+y*c).toFixed(2),width:(c+.3).toFixed(2),height:(c+.3).toFixed(2),fill:cor[ch],'shape-rendering':'crispEdges'}))}))}
};
raiz.querySelectorAll('[data-f]:not([data-feito])').forEach(d=>{const f=d.dataset.f,e=d.dataset.e,s=el('svg',{viewBox:'0 0 100 100','aria-hidden':'true',focusable:'false'});EST[e](s,FORMAS[f],f);d.append(s);d.dataset.feito=1});
tmp.remove();
}

