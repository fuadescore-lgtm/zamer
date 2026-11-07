/* Стандартный блок редактирования линий («Эскиз») — эталонная реализация, BIMsketcher 3D 2.9.64.
   Извлечено из web-src/zamer-dxf.html: константы SK*, функции sk*, plan* (редактор эскиза) и drawPlanEd (отрисовка).
   Не самостоятельный модуль: опирается на холст приложения (toS/toW, ctx, line, tmpBox, snapPoint с opt.trackSrc,
   openInline/closeInline kind 'sk', popMenu (вертикальный список ▾), toast, syncPanel, redraw). Описание — blocks/STANDARD_LINE_BLOCK.md.
   Изменения после 2.9.56: 2.9.58 — размер выделенной вершины; 2.9.59 — одна вершина за раз;
   2.9.62 — «Выбор ▾» (Выбор одного / Выбрать несколько), «Переместить» (соседи тянутся), все линии в одной кнопке «▾», списки ▾ — вертикальные всплывающие;
   2.9.64 — живой размер не перехватывает клик в точку; клиент «Линии» (cfg.kind lines). */

function planOpen(r){ /* r: a roof to edit (its contour and plan become lines), or null: a new roof */ const L=[];
  if(r){ if(polyArea2(r.pts)<0){ r.pts.reverse(); if(r.edges&&r.edges.length===r.pts.length){ const E=r.edges, n=r.pts.length; r.edges=r.pts.map((_,k)=>E[(n-2-k+n)%n]); } }
    const P=r.pts; if(r.sk&&r.sk.h===skHash(r)) for(const l of r.sk.L) L.push({...l,a:{...l.a},b:{...l.b}}); else for(let k=0;k<P.length;k++) L.push({a:{...P[k]},b:{...P[(k+1)%P.length]},t:'c'}); const pl=r.plan&&r.plan.L?r.plan.L:planFrom(r); for(const l of pl) L.push({...l,a:{...l.a},b:{...l.b}}); }
  planEd=skState({id:r?r.id:null,L,SP:r&&r.sk&&r.sk.h===skHash(r)?JSON.parse(JSON.stringify(r.sk.SP)):[],acq:[],k:r?'s':'pl',t:'c',a:null,live:null,S:[],H:[]}); roofEd=null; roofEdge=null; if(!r){ setTool('select'); selId=null; }
  panelKey=''; syncPanel(); syncModeBtns(); redraw(); toast(r?'Эскиз крыши: правьте линии; ✓ — построить':'План кровли: тип «Контур» — рисуйте (полилиния, прямоугольник, подобрать стены…), затем тип «Конёк» и «Стык»; ✓ — построить',true); }

function planHist(){ const E=planEd; E.H.push(JSON.stringify({L:E.L,SP:E.SP||[]})); if(E.H.length>200) E.H.shift(); }

function skHistPop(E){ const o=JSON.parse(E.H.pop()); if(Array.isArray(o)) E.L=o; else { E.L=o.L; E.SP=o.SP||[]; } }

function planSnap(sx,sy,from,skip,polar,wall){ if(wall==null) wall=planEd.cfg?true:planEd.t==='c'; /* contour snaps to walls (this level and below); ridges and joints only to the sketch */ const L=planEd.L, ex=[], mid=[]; /* sketch vertices and line midpoints: snap targets and tracking (dashed guide) sources */
  L.forEach((l,i)=>{ const sa=skip&&skip(i,'a'), sb=skip&&skip(i,'b'); if(!sa) ex.push(l.a); if(!sb) ex.push(l.b); if(!sa&&!sb&&Math.hypot(l.b.x-l.a.x,l.b.y-l.a.y)>1) mid.push({x:(l.a.x+l.b.x)/2,y:(l.a.y+l.b.y)/2}); });
  (planEd.SP||[]).forEach((S,j)=>{ if(skip&&skip('sp'+j)) return; ex.push(S.p[0]); if(!S.cl) ex.push(S.p[S.p.length-1]); });
  let q; try{ q=snapPoint(sx,sy,from||null,{extra:ex,extraMid:mid,onlyExtra:!wall,geoAll:wall,exclude:planEd.cfg&&planEd.cfg.ex?planEd.cfg.ex:planEd.id||(planEd.cfg&&planEd.cfg.id)?new Set([planEd.id||planEd.cfg.id]):undefined,track:true,trackSrc:planEd.acq||[],polar:polar&&polar.length?polar:undefined}); }catch(e){ q=toW(sx,sy); }
  /* a vertex, a midpoint or a tracking alignment wins over sliding onto a line */
  if(liveSnap==='end'||liveSnap==='corner'||liveSnap==='mid'||liveSnap==='center'||(wall&&(liveSnap==='face'||liveSnap==='axis'||liveSnap==='onc'))||(trackGuide&&trackGuide.length)||(polarGuide&&polarGuide.length>1)) return {x:r3(q.x),y:r3(q.y)};
  const sq=toS(q); let best=null, bd=14; L.forEach((l,i)=>{ if(skip&&(skip(i,'a')||skip(i,'b'))) return; const A=l.a,B=l.b, d=segDist(sq.x,sq.y,toS(A),toS(B)); if(d>=bd) return;
    if(from&&axisMode==='ortho'){ const d0={x:q.x-from.x,y:q.y-from.y}, len=Math.hypot(d0.x,d0.y); if(len<1) return; const u={x:d0.x/len,y:d0.y/len}, e={x:B.x-A.x,y:B.y-A.y}, den=u.x*e.y-u.y*e.x; if(Math.abs(den)<1e-9) return; const t=((A.x-from.x)*e.y-(A.y-from.y)*e.x)/den, uu=((A.x-from.x)*u.y-(A.y-from.y)*u.x)/den; if(t<=0||uu<-1e-6||uu>1+1e-6) return; bd=d; best={x:from.x+u.x*t,y:from.y+u.y*t}; }
    else { const v={x:B.x-A.x,y:B.y-A.y}, l2=v.x*v.x+v.y*v.y||1, t=Math.max(0,Math.min(1,((q.x-A.x)*v.x+(q.y-A.y)*v.y)/l2)); bd=d; best={x:A.x+v.x*t,y:A.y+v.y*t}; } });
  if(best){ q=best; liveSnap='on'; } return {x:r3(q.x),y:r3(q.y)}; }

function planLineAt(sx,sy){ let bi=-1, bd=16; planEd.L.forEach((l,i)=>{ const d=segDist(sx,sy,toS(l.a),toS(l.b)); if(d<bd){ bd=d; bi=i; } }); return bi; }

function planHit(sx,sy){ let best=null; const SL=new Set((planEd.S||[]).filter(o=>o.k!=='sp').map(o=>o.i)); planEd.L.forEach((l,i)=>{ if(!SL.has(i)) return; /* vertex circles exist only on selected lines */ for(const e of ['a','b']){ const q=toS(l[e]), d=Math.hypot(q.x-sx,q.y-sy); if(d<16&&(!best||best.pr>0||d<best.d)) best={k:'e',i,e,d,pr:0}; } });
  if(!best){ const i=planLineAt(sx,sy); if(i>=0) best={k:'l',i,pr:1}; } if(!best){ const j=skSplineAt(sx,sy); if(j>=0) best={k:'sp',i:j,pr:2}; } return best; }

const planKey=o=>o.k+o.i+(o.e||'');

function planPts(S,free){ const L=planEd.L, out=[], add=(o,f)=>{ if(!out.some(x=>x.o===o&&x.f===f)) out.push({o,f}); };
  if(free){ for(const o of S){ if(o.k==='e') add(L[o.i],o.e); else { add(L[o.i],'a'); add(L[o.i],'b'); } } return out; }
  const at=pt=>L.forEach(l=>{ for(const e of ['a','b']) if(Math.hypot(l[e].x-pt.x,l[e].y-pt.y)<5) add(l,e); });
  for(const o of S){ if(o.k==='e') at(L[o.i][o.e]); else { at(L[o.i].a); at(L[o.i].b); } } return out; }

function planMove(q,p){ const E=planEd; E.L=JSON.parse(q.snap); if(q.snapSP!=null) E.SP=JSON.parse(q.snapSP);
  if(q.t==='spp'){ const sp=toS(p), z=planSnap(p.x,p.y,null,(i,e)=>i===('sp'+q.j)); skAcq(z); E.SP[q.j].p[q.k]=z; q.moved=true; redraw(); return; }
  if(q.t==='mv'&&q.h.k==='sp'){ const w=toW(p.x,p.y), dx=Math.round((w.x-q.w0.x)/10)*10, dy=Math.round((w.y-q.w0.y)/10)*10; E.SP[q.h.i].p=E.SP[q.h.i].p.map(v=>skR3({x:v.x+dx,y:v.y+dy})); q.moved=true; redraw(); return; }
  let S=q.t==='mv'?[q.h]:q.S;
  if(q.t==='cp'){ const N=[...new Set(S.map(x=>E.L[x.i]))].map(l=>({...l,a:{...l.a},b:{...l.b}})); E.L.push(...N); S=N.map(l=>({k:'l',i:E.L.indexOf(l)})); }
  const pts=planPts(S,true), w=toW(p.x,p.y); /* points attract but are never glued: only the taken point / line moves */ let dx=w.x-q.w0.x, dy=w.y-q.w0.y;
  if(q.t==='rot'){ const C=pts.reduce((m,x)=>({x:m.x+x.o[x.f].x/pts.length,y:m.y+x.o[x.f].y/pts.length}),{x:0,y:0}); let an=Math.atan2(w.y-C.y,w.x-C.x)-Math.atan2(q.w0.y-C.y,q.w0.x-C.x); an=Math.round(an/(Math.PI/12))*(Math.PI/12); const c=Math.cos(an), sn=Math.sin(an);
    for(const x of pts){ const v=x.o[x.f], X=v.x-C.x, Y=v.y-C.y; x.o[x.f]={x:r3(C.x+X*c-Y*sn),y:r3(C.y+X*sn+Y*c)}; } }
  else { if(S.length===1&&S[0].k==='e'){ const l0=E.L[S[0].i], v0=l0[S[0].e], oth=l0[S[0].e==='a'?'b':'a'], mine=new Set(pts.map(x=>E.L.indexOf(x.o)+x.f)), sp=toS({x:v0.x+dx,y:v0.y+dy}), z=planSnap(sp.x,sp.y,null,(i,e)=>mine.has(i+e),[oth],l0.t==='c'); skAcq(z); dx=z.x-v0.x; dy=z.y-v0.y; } /* a dragged end keeps Орто to its line's other end */ else { dx=Math.round(dx/10)*10; dy=Math.round(dy/10)*10; }
    for(const x of pts){ const v=x.o[x.f]; x.o[x.f]={x:r3(v.x+dx),y:r3(v.y+dy)}; } }
  q.moved=true; redraw(); }

function planUp(q){ const E=planEd; if(!q.moved){ if(q.t==='spp') return; if(q.t==='mv'){ const k=planKey(q.h), j=E.S.findIndex(o=>planKey(o)===k); if(j>=0){ E.S.splice(j,1); if(q.h.k!=='e') E.S=E.S.filter(o=>!(o.k==='e'&&o.i===q.h.i)); } else { if(q.h.k==='e') E.S=E.S.filter(o=>o.k!=='e'); /* one vertex at a time: a new one replaces the old */ else if(E.k==='s') E.S=[]; /* «Выбор»: one segment — another one replaces it */ E.S.push(q.h); } panelKey=''; syncPanel(); redraw(); } return; }
  const now=E.L, nowS=E.SP; E.L=JSON.parse(q.snap); if(q.snapSP!=null) E.SP=JSON.parse(q.snapSP); planHist(); E.L=now; E.SP=nowS; if(q.t==='cp') E.S=[]; panelKey=''; syncPanel(); redraw(); }

const SKN={s:'Выбор',sm:'Выбрать несколько',mv:'Переместить',ln:'Линия',pl:'Полилиния',rc:'Прямоугольник',pgi:'Многоугольник вписанный',pgc:'Многоугольник описанный',ci:'Окружность',a3:'Дуга: начало — конец — радиус',ac:'Дуга из центра и концов',at:'Дуга по касательной',af:'Дуга сопряжения',sp:'Сплайн',pw:'Подобрать стены',pli:'Подобрать линии',pe:'Подобрать края',cp:'Копировать',rot:'Повернуть',mi:'Зеркало: выбрать ось',md:'Зеркало: нарисовать ось',of:'Смещение',tc:'Обрезать до угла',t1:'Обрезать один до границы',tm:'Обрезать несколько до границы',sv:'Разделить',sg:'Разделить с зазором',t:'Обрезать между пересечениями',del:'Удалить'};

const SKS={s:'Выбор',sm:'Несколько',mv:'Переместить',ln:'Линия',pl:'Полилиния',rc:'Прямоуг.',pgi:'Вписанный',pgc:'Описанный',ci:'Окружность',a3:'Нач.–кон.–R',ac:'Из центра',at:'Касательная',af:'Сопряжение',sp:'Сплайн',pw:'Стены',pli:'Линии',pe:'Края',cp:'Копировать',rot:'Повернуть',mi:'Выбрать ось',md:'Нарисовать ось',of:'Смещение',tc:'До угла',t1:'Один',tm:'Несколько',sv:'Разделить',sg:'С зазором',t:'Между пересеч.',del:'Удалить'};

const SKFLY={se:['s','sm'],ln:['ln','pl','rc','pgi','pgc','ci','a3','ac','at','af','sp'],pg:['pgi','pgc'],ar:['a3','ac','at','af'],pk:['pw','pli','pe'],mr:['mi','md'],tr:['tc','t1','tm','sv','sg','t']};

const SKPL={s:'Выбор',sm:'Выбрать несколько',ln:'Линия',pl:'Полилиния',rc:'Прямоугольник',pgi:'Многоуг. вписанный',pgc:'Многоуг. описанный',ci:'Окружность',a3:'Дуга: 3 точки',ac:'Дуга из центра',at:'Дуга по касательной',af:'Дуга сопряжения',sp:'Сплайн'};

const SKFN={se:'Выбор',ln:'Линии',pg:'Многоуг.',ar:'Дуга',pk:'Подобрать',mr:'Зеркало',tr:'Обрезать'};

const SKHINT={s:['касание — выделить один отрезок (другой — заменяет, повторно — снять); тяните точку или линию'],sm:['касание — добавить отрезок, повторно — снять; пусто — снять всё'],mv:['базовая точка — конец или середина отрезка','куда (цифра размера — ввод)'],ln:['начало (касание вершины — магнит)','конец'],pl:['первая точка','следующая точка; касание последней точки — конец'],rc:['первый угол','противоположный угол'],pgi:['центр','вершина'],pgc:['центр','середина стороны'],ci:['центр','радиус (или число)'],
  a3:['начало','конец','точка изгиба'],ac:['центр','начало','конец'],at:['конец линии (дуга продолжит её)','конец дуги'],af:['первая линия','вторая линия','радиус: тяните или введите число'],sp:['точки подряд; касание последней — конец'],pw:['коснитесь стены с нужной стороны'],pli:['коснитесь линии чертежа'],pe:['коснитесь края перекрытия, крыши'],
  cp:['базовая точка','куда'],rot:['начальный луч (центр — середина выбранного)','конечный луч (или угол)'],mi:['коснитесь линии — ось'],md:['первая точка оси','вторая точка оси'],of:['коснитесь линии с нужной стороны'],tc:['первая линия (часть, что остаётся)','вторая линия'],t1:['граница','линия (часть, что остаётся)'],tm:['граница','линии подряд; пусто — новая граница'],sv:['касание на линии — разделить'],sg:['касание на линии — разрыв'],t:['кусок между пересечениями — удалить'],del:['коснитесь линии']};

const SKPT=new Set(['ln','pl','rc','pgi','pgc','ci','a3','ac','at','sp','md','cp','rot','mv']); /* point-input tools: the finger shows the live point */

const SKNEED={mv:2,ln:2,rc:2,pgi:2,pgc:2,ci:2,a3:3,ac:3,at:2,md:2,cp:2,rot:2};

const SKSEL=new Set(['cp','rot','mi','md']); /* need a selection */

function skAllowed(k,t){ t=t||planEd.t; const c=planEd&&planEd.cfg; if(c&&c.open&&['rc','pgi','pgc','ci'].includes(k)) return false; if(t==='x') return ['s','sm','mv','ln','del'].includes(k); if(t==='r'||t==='j') return ['s','sm','mv','ln','pl','cp','rot','mi','md','of','tc','t1','tm','sv','sg','t','del'].includes(k); return true; }

const SKI={s:'<path d="M7 3v15l4-4 3 6 2.5-1-3-6H19z"/>',sm:'<path d="M5 3v12l3-3 2.5 5 2-1-2.5-5H14z"/><rect x="14" y="13" width="7" height="7" rx="1"/><path d="M16 16.5h3M17.5 15v3"/>',mv:'<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',ln:'<path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.8"/><circle cx="19" cy="5" r="1.8"/>',pl:'<path d="M3 18l6-9 5 6 7-10"/>',rc:'<rect x="4" y="6" width="16" height="12" rx="1"/>',
  pgi:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="9" stroke-dasharray="2 2"/>',pgc:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="6.6" stroke-dasharray="2 2"/>',ci:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1"/>',
  a3:'<path d="M4 18A9 9 0 0 1 20 18"/><circle cx="12" cy="9" r="1.4"/>',ac:'<path d="M5 17A8 8 0 0 1 19 9"/><path d="M12 17L19 9" stroke-dasharray="2 2"/>',at:'<path d="M3 18h8"/><path d="M11 18a7 7 0 0 0 7-7V5"/>',af:'<path d="M4 20V12a8 8 0 0 1 8-8h8"/><path d="M4 4v4M4 4h4" stroke-dasharray="2 2"/>',sp:'<path d="M3 17l3-6 3-3 3 1 3 4 3 1 3-6"/>',
  pw:'<path d="M3 9h18M3 15h18"/><path d="M3 9h18" stroke-width="3"/>',pli:'<path d="M4 18L20 6" stroke-dasharray="3 3"/>',pe:'<path d="M4 16l6-10h10l-6 10z"/><path d="M4 16h10" stroke-width="3"/>',
  cp:'<rect x="4" y="8" width="11" height="12" rx="2"/><rect x="9" y="4" width="11" height="12" rx="2"/>',rot:'<path d="M19 8a8 8 0 1 0 1 6"/><path d="M19 3v5h-5"/>',mi:'<path d="M12 3v18" stroke-width="2.6"/><path d="M9 7L3 17h6z"/><path d="M15 7l6 10h-6z" stroke-dasharray="2 2"/>',md:'<path d="M12 3v18" stroke-dasharray="3 2"/><path d="M9 7L3 17h6z"/><path d="M15 7l6 10h-6z"/>',
  of:'<path d="M3 15L15 3"/><path d="M9 21L21 9" stroke-dasharray="3 2"/>',tc:'<path d="M4 20V6h14"/>',t1:'<path d="M18 3v18" stroke-width="2.6"/><path d="M3 12h15"/>',tm:'<path d="M18 3v18" stroke-width="2.6"/><path d="M3 7h15M3 12h15M3 17h15"/>',sv:'<path d="M3 12h7M14 12h7"/><path d="M12 6v12" stroke-dasharray="2 2"/>',sg:'<path d="M3 12h6M15 12h6"/><path d="M9 9v6M15 9v6"/>',
  t:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',del:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',or:'<path d="M4 20V4M4 20h16"/><path d="M4 14h6v6" stroke-width="1.4"/>'};

const skSvg=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SKI[k]||''}</svg>`;

function skState(E){ E.t=E.t||'c'; E.pts=E.pts||[]; E.pick=E.pick||[]; E.opt=E.opt||{n:6,rad:false,R:300,off:500,gap:100,mul:true,keep:true,cpy:false}; E.last=E.last||{se:'s',ln:'pl',pg:'pgi',ar:'a3',pk:'pw',mr:'mi',tr:'tc'}; return E; }

function skSync(){ panelKey=''; syncPanel(); redraw(); }

function skFlyOpen(g){ const E=planEd; if(!E) return; const ok=x=>skAllowed(x,E.t), L=SKFLY[g].filter(ok), btn=panel.querySelector('[data-act="plF"][data-g="'+g+'"]'); if(!btn||!L.length) return;
  popMenu(btn,`<div class="skpl">${L.map(x=>`<button class="skpi" data-k="${x}" aria-pressed="${E.k===x}">${skSvg(x)}<span>${SKPL[x]||SKN[x]}</span></button>`).join('')}</div>`,b=>{ const k=b.dataset.k; if(!planEd||!k) return; skSetTool(k); planEd.fly=null; skSync(); }); }

function skReset(E){ E.pts=[]; E.pick=[]; E.live=null; E.a=null; }

function skSetTool(k){ const E=planEd; if(!E||!skAllowed(k)) return; const was=E.k; E.k=k; skReset(E); E.lastMv=null; E.lastI=null; if(was!==k) E.acq=[]; if(!SKSEL.has(k)&&k!=='del'&&k!=='s'&&k!=='sm'&&k!=='mv'&&k!=='of') E.S=[];
  for(const g in SKFLY) if(SKFLY[g].includes(k)) E.last[g]=k; if(SKSEL.has(k)&&!(E.S||[]).length) toast('Сначала выберите линии: «Выбор», затем «'+SKS[k]+'»'); if(was!==k) E.fly=null; }

const skV=(a,b)=>({x:b.x-a.x,y:b.y-a.y}), skL=v=>Math.hypot(v.x,v.y), skU=v=>{ const l=skL(v)||1; return {x:v.x/l,y:v.y/l}; }, skAddP=(a,v,k)=>({x:a.x+v.x*(k==null?1:k),y:a.y+v.y*(k==null?1:k)}), skR3=p=>({x:r3(p.x),y:r3(p.y)});

function skX(A,d1,B,d2){ const den=d1.x*d2.y-d1.y*d2.x; if(Math.abs(den)<1e-9) return null; const t=((B.x-A.x)*d2.y-(B.y-A.y)*d2.x)/den; return {x:A.x+d1.x*t,y:A.y+d1.y*t}; }

function skArc(C,R,a0,sw){ const n=Math.max(2,Math.ceil(Math.abs(sw)/(Math.PI/18))), P=[]; for(let k=0;k<=n;k++){ const a=a0+sw*k/n; P.push({x:C.x+R*Math.cos(a),y:C.y+R*Math.sin(a)}); } return P; }

const skChain=(P,closed)=>{ const S=[]; for(let k=0;k+1<P.length;k++) S.push([P[k],P[k+1]]); if(closed&&P.length>2) S.push([P[P.length-1],P[0]]); return S; };

const skNorm=a=>{ while(a>Math.PI) a-=2*Math.PI; while(a<=-Math.PI) a+=2*Math.PI; return a; };

function skCirc3(A,B,C){ const d=2*(A.x*(B.y-C.y)+B.x*(C.y-A.y)+C.x*(A.y-B.y)); if(Math.abs(d)<1e-6) return null; const a2=A.x*A.x+A.y*A.y, b2=B.x*B.x+B.y*B.y, c2=C.x*C.x+C.y*C.y;
  const O={x:(a2*(B.y-C.y)+b2*(C.y-A.y)+c2*(A.y-B.y))/d,y:(a2*(C.x-B.x)+b2*(A.x-C.x)+c2*(B.x-A.x))/d}; return {O,R:skL(skV(O,A))}; }

function skSpline(P,closed){ if(P.length<3) return P.slice(); const n=P.length, g=k=>closed?P[(k+n)%n]:P[Math.max(0,Math.min(n-1,k))], out=[], m=closed?n:n-1;
  for(let k=0;k<m;k++){ const p0=g(k-1),p1=g(k),p2=g(k+1),p3=g(k+2); for(let s=0;s<8;s++){ const t=s/8,t2=t*t,t3=t2*t; out.push({x:0.5*(2*p1.x+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),y:0.5*(2*p1.y+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)}); } }
  if(!closed) out.push(P[n-1]); return out; }

function skPoly(c,q,n,circ){ const R0=skL(skV(c,q)); if(R0<1) return []; const a=Math.atan2(q.y-c.y,q.x-c.x), R=circ?R0/Math.cos(Math.PI/n):R0, a0=circ?a+Math.PI/n:a, P=[]; for(let k=0;k<n;k++){ const b=a0+2*Math.PI*k/n; P.push({x:c.x+R*Math.cos(b),y:c.y+R*Math.sin(b)}); } return P; }

function skRect(A,B,R){ const x0=Math.min(A.x,B.x),x1=Math.max(A.x,B.x),y0=Math.min(A.y,B.y),y1=Math.max(A.y,B.y); if(x1-x0<1||y1-y0<1) return [];
  if(!(R>0)||R*2>=Math.min(x1-x0,y1-y0)) return [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  return [].concat(skArc({x:x1-R,y:y0+R},R,-Math.PI/2,Math.PI/2),skArc({x:x1-R,y:y1-R},R,0,Math.PI/2),skArc({x:x0+R,y:y1-R},R,Math.PI/2,Math.PI/2),skArc({x:x0+R,y:y0+R},R,Math.PI,Math.PI/2)); }

function skTanArc(A,d,B){ const c=skV(A,B), n={x:-d.y,y:d.x}, h=c.x*n.x+c.y*n.y; if(Math.abs(h)<1) return [A,B]; const R=(c.x*c.x+c.y*c.y)/(2*h), O=skAddP(A,n,R), a0=Math.atan2(A.y-O.y,A.x-O.x), a1=Math.atan2(B.y-O.y,B.x-O.x);
  let sw=skNorm(a1-a0); const dir=R>0?1:-1; if(sw*dir<0) sw+=dir*2*Math.PI; return skArc(O,Math.abs(R),a0,sw); }

function skFilletGeo(l1,w1,l2,w2,R){ const d1=skU(skV(l1.a,l1.b)), d2=skU(skV(l2.a,l2.b)), P=skX(l1.a,d1,l2.a,d2); if(!P) return {err:'линии параллельны'};
  const side=(l,w,d)=>{ const s=(w.x-P.x)*d.x+(w.y-P.y)*d.y; return s>=0?d:{x:-d.x,y:-d.y}; }, u1=side(l1,w1,d1), u2=side(l2,w2,d2), th=Math.acos(Math.max(-1,Math.min(1,u1.x*u2.x+u1.y*u2.y)));
  if(th<0.02||th>Math.PI-0.02) return {err:'линии почти на одной прямой'}; const h=th/2, td=R/Math.tan(h), T1=skAddP(P,u1,td), T2=skAddP(P,u2,td), bis=skU({x:u1.x+u2.x,y:u1.y+u2.y}), O=skAddP(P,bis,R/Math.sin(h));
  const far=(l,u)=>Math.max((l.a.x-P.x)*u.x+(l.a.y-P.y)*u.y,(l.b.x-P.x)*u.x+(l.b.y-P.y)*u.y); if(td>far(l1,u1)+1||td>far(l2,u2)+1) return {err:'радиус больше линий'};
  const a0=Math.atan2(T1.y-O.y,T1.x-O.x), sw=skNorm(Math.atan2(T2.y-O.y,T2.x-O.x)-a0); return {P,u1,u2,T1,T2,O,R,bis,h,arc:skArc(O,R,a0,sw)}; }

function skFilletR(G,q){ const d=(q.x-G.P.x)*G.bis.x+(q.y-G.P.y)*G.bis.y; return Math.max(10,d/(1/Math.sin(G.h)-1)); }

function skSelLines(){ const E=planEd; return [...new Set((E.S||[]).filter(o=>o.k!=='sp').map(o=>o.i))].filter(i=>E.L[i]); }

function skCentroid(){ const E=planEd, I=skSelLines(); let x=0,y=0,n=0; for(const i of I){ const l=E.L[i]; x+=l.a.x+l.b.x; y+=l.a.y+l.b.y; n+=2; } for(const j of skSelSp()) for(const q of E.SP[j].p){ x+=q.x; y+=q.y; n++; } return n?{x:x/n,y:y/n}:null; }

const skMir=(A,B,p)=>{ const u=skU(skV(A,B)), v=skV(A,p), s=v.x*u.x+v.y*u.y; return {x:A.x+2*s*u.x-v.x,y:A.y+2*s*u.y-v.y}; };

const skRotP=(C,an,p)=>{ const c=Math.cos(an), s=Math.sin(an), X=p.x-C.x, Y=p.y-C.y; return {x:C.x+X*c-Y*s,y:C.y+X*s+Y*c}; };

function skRotAng(C,A,q){ let an=Math.atan2(q.y-C.y,q.x-C.x)-Math.atan2(A.y-C.y,A.x-C.x); if(axisMode==='ortho') an=Math.round(an/(Math.PI/12))*(Math.PI/12); return an; }

function skGen(k,P,q){ const E=planEd, o=E.opt, A=P[0];
  switch(k){
    case 'ln': return {S:A?[[A,q]]:[]};
    case 'pl': return {S:A?[[P[P.length-1],q]]:[]};
    case 'rc': return {S:A?skChain(skRect(A,q,o.rad?o.R:0),true):[]};
    case 'pgi': case 'pgc': return {S:A?skChain(skPoly(A,q,Math.max(3,o.n|0),k==='pgc'),true):[]};
    case 'ci': { if(!A) return {S:[]}; const R=skL(skV(A,q)); return {S:R>1?skChain(skArc(A,R,0,2*Math.PI).slice(0,-1),true):[]}; }
    case 'a3': return {S:!A?[]:P.length<2?[[A,q]]:skChain(skArc3(A,P[1],q))};
    case 'ac': { if(!A) return {S:[]}; if(P.length<2) return {S:[[A,q]]}; const R=skL(skV(A,P[1])), a0=Math.atan2(P[1].y-A.y,P[1].x-A.x); return {S:skChain(skArc(A,R,a0,skNorm(Math.atan2(q.y-A.y,q.x-A.x)-a0)))}; }
    case 'at': { if(!A) return {S:[]}; const d=skTanAt(A); return {S:d?skChain(skTanArc(A,d,q)):[[A,q]]}; }
    case 'sp': return {S:A?skChain(skSpline(P.concat([q]),false)):[]};
    case 'md': return A?{X:p=>skMir(A,q,p),copy:o.keep}:{};
    case 'cp': return A?{X:p=>({x:p.x+q.x-A.x,y:p.y+q.y-A.y}),copy:true}:{};
    case 'mv': return A?{X:p=>({x:p.x+q.x-A.x,y:p.y+q.y-A.y}),mv:true}:{};
    case 'rot': { const C=skCentroid(); if(!A||!C) return {}; const an=skRotAng(C,A,q); return {X:p=>skRotP(C,an,p),copy:o.cpy,ang:an,C}; }
  } return {S:[]}; }

function skAdd(S,t){ const E=planEd, ly=isLnSk(E)?{ly:E.cfg.ly}:{}; let n=0; for(const [A,B] of S){ if(skL(skV(A,B))<1) continue; E.L.push({a:skR3(A),b:skR3(B),t:t||E.t,...ly}); n++; } return n; }

function skApplyX(G){ const E=planEd, I=skSelLines(), J=skSelSp(); if((!I.length&&!J.length)||!G.X) return; planHist(); E.SP=E.SP||[];
  if(G.copy){ const N=I.map(i=>{ const l=E.L[i]; return {...l,a:skR3(G.X(l.a)),b:skR3(G.X(l.b))}; }), M=J.map(j=>({...E.SP[j],p:E.SP[j].p.map(q=>skR3(G.X(q)))})); const s0=E.L.length, t0=E.SP.length; E.L.push(...N); E.SP.push(...M); E.S=N.map((_,k)=>({k:'l',i:s0+k})).concat(M.map((_,k)=>({k:'sp',i:t0+k}))); }
  else { const old=[]; if(G.mv){ for(const i of I) old.push({...E.L[i].a},{...E.L[i].b}); for(const j of J){ const P=E.SP[j].p; if(!E.SP[j].cl&&P.length) old.push({...P[0]},{...P[P.length-1]}); } }
    for(const i of I){ const l=E.L[i]; l.a=skR3(G.X(l.a)); l.b=skR3(G.X(l.b)); } for(const j of J) E.SP[j].p=E.SP[j].p.map(q=>skR3(G.X(q)));
    /* Переместить: the ends of the other segments that met the moved ones follow — the outline does not break */
    if(G.mv&&old.length){ const at=v=>old.some(p=>Math.hypot(p.x-v.x,p.y-v.y)<1), sI=new Set(I), sJ=new Set(J);
      E.L.forEach((l,i)=>{ if(sI.has(i)) return; for(const e of ['a','b']) if(at(l[e])) l[e]=skR3(G.X(l[e])); });
      (E.SP||[]).forEach((S,j)=>{ if(sJ.has(j)||S.cl||!S.p.length) return; const n=S.p.length-1; if(at(S.p[0])) S.p[0]=skR3(G.X(S.p[0])); if(n>0&&at(S.p[n])) S.p[n]=skR3(G.X(S.p[n])); }); } } }

function skFrom(){ const E=planEd, k=E.k, n=E.pts.length; if(!n) return null; if(k==='rc'||k==='pgi'||k==='pgc'||k==='ci'||(k==='a3'&&n===2)||(k==='ac'&&n===2)||k==='rot') return null; return E.pts[n-1]; }

function skSnap(sx,sy){ return planSnap(sx,sy,skFrom()); }

function skPoint(q){ const E=planEd, k=E.k;
  if(SKSEL.has(k)&&!skSelLines().length){ toast('Сначала выберите линии: «Выбор»'); return; }
  if(k==='af'){ if(E.pick.length<2) return; const [p1,p2]=E.pick, l1=E.L[p1.i], l2=E.L[p2.i]; if(!l1||!l2){ E.pick=[]; skSync(); return; } const G0=skFilletGeo(l1,p1.w,l2,p2.w,0); if(G0.err){ toast('Не соответствует: '+G0.err); return; } skFillet(skFilletR(G0,q)); return; }
  if(k==='at'&&!E.pts.length&&!skTanAt(q)){ toast('Начните дугу с конца линии — она продолжит её по касательной'); return; }
  if(k==='pl'){ const n=E.pts.length; if(n&&skL(skV(E.pts[n-1],q))<50){ skReset(E); skSync(); return; }
    if(n){ planHist(); skAdd([[E.pts[n-1],q]]); E.lastI=E.L.length-1; if(E.opt.rad&&n>=2){ skFilletLast(); E.lastI=null; } if(n>=2&&skL(skV(E.pts[0],q))<1){ skReset(E); skSync(); return; } } E.pts.push(q); E.a=q; skSync(); return; }
  if(k==='sp'){ const n=E.pts.length; if(n&&skL(skV(E.pts[n-1],q))<50){ skSplineDone(false); return; } if(n>=3&&skL(skV(E.pts[0],q))<1){ skSplineDone(true); return; } E.pts.push(q); skSync(); return; }
  E.pts.push(q); if(E.pts.length<(SKNEED[k]||2)){ skSync(); return; }
  const P=E.pts.slice(0,-1), G=skGen(k,P,q);
  if(isLnSk(E)&&E.t==='x'&&k==='ln'){ pushUndo(); const id=uid(); doc.levels[E.cfg.li].items.push({id,t:'aux',a:skR3(P[0]),b:skR3(q)}); E.cfg.extra.add(id); persist(); skReset(E); skSync(); return; }
  if(isLnSk(E)&&G.S&&G.S.length&&(k==='ci'||k==='a3'||k==='ac'||k==='at')){ lnTrue(k,P,q,G); skReset(E); skSync(); return; }
  if(G.X){ skApplyX(G); if(k==='mv') E.lastMv={A:{...P[0]},B:{...q}}; /* the distance stays on screen: tap — type the exact one */ if(k==='cp'&&E.opt.mul){ E.pts=[P[0]]; skSync(); return; } }
  else { planHist(); if(!skAdd(G.S)){ E.H.pop(); toast('Слишком мало — линия не добавлена'); } else if(k==='ln') E.lastI=E.L.length-1; }
  skReset(E); skSync(); }

function skSplineDone(closed){ const E=planEd; if(E.pts.length>=2){ planHist(); (E.SP=E.SP||[]).push({p:E.pts.map(skR3),t:E.t,cl:!!closed,...(isLnSk(E)?{ly:E.cfg.ly}:{})}); } skReset(E); skSync(); }

const skSpCurve=S=>{ const P=skSpline(S.p,!!S.cl); return S.cl?P.concat([P[0]]):P; };

function skAllL(E){ const L=E.L.slice(); for(const S of E.SP||[]) for(const [a,b] of skChain(skSpline(S.p,!!S.cl),!!S.cl)) if(skL(skV(a,b))>0.5) L.push({a:skR3(a),b:skR3(b),t:S.t}); return L; }

function skSplineAt(sx,sy){ let bj=-1, bd=14; (planEd.SP||[]).forEach((S,j)=>{ const P=skSpCurve(S); for(let k=0;k+1<P.length;k++){ const d=segDist(sx,sy,toS(P[k]),toS(P[k+1])); if(d<bd){ bd=d; bj=j; } } }); return bj; }

const skSelSp=()=>[...new Set((planEd.S||[]).filter(o=>o.k==='sp').map(o=>o.i))].filter(j=>planEd.SP&&planEd.SP[j]);

const skHash=it=>JSON.stringify([it.pts||null,it.holes||null,it.cl||null]);

function skAcq(q){ const E=planEd; if(!E) return; const on=q&&(liveSnap==='end'||liveSnap==='mid'||liveSnap==='corner');
  if(!on){ if(E.hv){ clearTimeout(E.hv.t); E.hv=null; } return; } if(E.hv&&near(E.hv.p,q)) return; if(E.hv) clearTimeout(E.hv.t);
  const p={x:q.x,y:q.y}; if((E.acq||[]).some(a=>near(a,p))) { E.hv=null; return; }
  E.hv={p,t:setTimeout(()=>{ if(planEd!==E) return; E.acq=(E.acq||[]).filter(a=>!near(a,p)); E.acq.push(p); if(E.acq.length>2) E.acq.shift(); E.hv=null; redraw(); },300)}; }

function skSetLen(i,e,v){ const E=planEd, l=E.L[i]; if(!l) return; if(!(v>0)){ toast('Не соответствует: длина больше 0'); return; } const f=e==='a'?l.b:l.a, old=l[e], u=skU(skV(f,old)); planHist(); l[e]=skR3(skAddP(f,u,v));
  if(E.pts.length&&near(E.pts[E.pts.length-1],old)){ E.pts[E.pts.length-1]=l[e]; E.a=l[e]; } skSync(); toast('Длина '+fmtU(v)); }

function skFilletLast(){ const E=planEd, n=E.L.length; if(n<2) return; const l1=E.L[n-2], l2=E.L[n-1], G=skFilletGeo(l1,l1.a,l2,l2.b,E.opt.R); if(G.err) return; skEndTo(l1,G.P,G.u1,G.T1); skEndTo(l2,G.P,G.u2,G.T2); skAdd(skChain(G.arc),l1.t); }

function skFillet(R){ const E=planEd, [p1,p2]=E.pick, l1=E.L[p1.i], l2=E.L[p2.i]; const G=skFilletGeo(l1,p1.w,l2,p2.w,R); if(G.err){ toast('Не соответствует: '+G.err); return; }
  planHist(); skEndTo(l1,G.P,G.u1,G.T1); skEndTo(l2,G.P,G.u2,G.T2); skAdd(skChain(G.arc),l1.t); skReset(E); skSync(); toast('Сопряжение R '+fmtU(R)); }

function skTapLine(sx,sy){ const E=planEd, k=E.k, w=toW(sx,sy), i=planLineAt(sx,sy), l=i>=0?E.L[i]:null;
  const need=()=>{ toast('Коснитесь линии эскиза'); };
  if(k==='af'){ if(!l) return need(); if(E.pick.length&&E.pick[0].i===i) return; E.pick.push({i,w}); if(E.pick.length===2){ const G=skFilletGeo(E.L[E.pick[0].i],E.pick[0].w,l,w,0); if(G.err){ toast('Не соответствует: '+G.err); E.pick=[]; } } skSync(); return; }
  if(k==='tc'){ if(!l) return need(); if(E.pick.length&&E.pick[0].i===i) return; E.pick.push({i,w}); if(E.pick.length<2){ skSync(); return; }
    const [p1,p2]=E.pick, l1=E.L[p1.i], l2=E.L[p2.i], d1=skU(skV(l1.a,l1.b)), d2=skU(skV(l2.a,l2.b)), P=skX(l1.a,d1,l2.a,d2); E.pick=[]; if(!P){ toast('Не соответствует: линии параллельны'); skSync(); return; }
    planHist(); skTrimTo(l1,P,p1.w); skTrimTo(l2,P,p2.w); skSync(); return; }
  if(k==='t1'||k==='tm'){ if(!E.pick.length){ if(!l) return need(); E.pick=[{i,w}]; skSync(); return; } if(!l){ if(k==='tm'){ E.pick=[]; skSync(); } else need(); return; } if(i===E.pick[0].i) return;
    const b=E.L[E.pick[0].i], P=skX(b.a,skU(skV(b.a,b.b)),l.a,skU(skV(l.a,l.b))); if(!P){ toast('Не соответствует: линия параллельна границе'); return; } planHist(); skTrimTo(l,P,w); if(k==='t1') E.pick=[]; skSync(); return; }
  if(k==='sv'||k==='sg'){ if(!l) return need(); const v=skV(l.a,l.b), L2=v.x*v.x+v.y*v.y||1, len=Math.sqrt(L2), t=((w.x-l.a.x)*v.x+(w.y-l.a.y)*v.y)/L2, g=k==='sg'?Math.max(1,E.opt.gap)/len/2:0;
    if(t-g<=0.001||t+g>=0.999){ toast('Слишком близко к концу линии'); return; } planHist(); const at=s=>skR3(skAddP(l.a,v,s)); E.L.splice(i,1,{...l,b:at(t-g)},{...l,a:at(t+g)}); E.S=[]; skSync(); return; }
  if(k==='of'){ if(!l) return need(); const u=skU(skV(l.a,l.b)), n={x:-u.y,y:u.x}, s=((w.x-l.a.x)*n.x+(w.y-l.a.y)*n.y)>=0?1:-1, d=E.opt.off*s; if(!(E.opt.off>0)){ toast('Задайте расстояние смещения'); return; }
    planHist(); E.L.push({...l,a:skR3(skAddP(l.a,n,d)),b:skR3(skAddP(l.b,n,d))}); skSync(); return; }
  if(k==='mi'){ if(!skSelLines().length){ toast('Сначала выберите линии: «Выбор»'); return; } let ax=l&&!skSelLines().includes(i)?[l.a,l.b]:null;
    if(!ax){ const g=skGeoPick(sx,sy,s=>true); if(g) ax=[g.a,g.b]; } if(!ax){ toast('Коснитесь линии — оси зеркала'); return; } skApplyX({X:p=>skMir(ax[0],ax[1],p),copy:E.opt.keep}); skSync(); return; }
  if(k==='del'){ if(!l){ const j=skSplineAt(sx,sy); if(j<0) return need(); planHist(); E.SP.splice(j,1); E.S=[]; skSync(); return; } planHist(); E.L.splice(i,1); E.S=[]; E.lastI=null; skSync(); return; }
  if(k==='pw'||k==='pli'||k==='pe'){ const f=k==='pw'?s=>s.it&&isWall(s.it)&&s.k==='face':k==='pli'?s=>s.it&&s.it.t==='line'&&!isWall(s.it):s=>s.it&&s.k==='face'&&!isWall(s.it); const g=skGeoPick(sx,sy,f);
    if(!g){ toast(k==='pw'?'Коснитесь стены с нужной стороны':k==='pli'?'Коснитесь линии чертежа':'Коснитесь края перекрытия или крыши'); return; } planHist(); skAdd([[g.a,g.b]]); skSync(); return; } }

function skTrimTo(l,P,w){ const d=skU(skV(l.a,l.b)), s=e=>(e.x-P.x)*d.x+(e.y-P.y)*d.y, sw=s(w), sa=s(l.a), sb=s(l.b), opp=e=>(s(e)>0)!==(sw>0)&&Math.abs(s(e))>1e-6;
  /* the end on the far side of the corner, else the nearer one, moves to the corner */ if(opp(l.a)&&!opp(l.b)) l.a=skR3(P); else if(opp(l.b)&&!opp(l.a)) l.b=skR3(P); else if(Math.abs(sa)<Math.abs(sb)) l.a=skR3(P); else l.b=skR3(P); }

function skGeoPick(sx,sy,f){ let G; try{ G=snapGeoAll(planEd.id?new Set([planEd.id]):undefined); }catch(e){ return null; } let best=null, bd=18; for(const s of G.segs){ if(!s.a||!s.b||!f(s)) continue; const d=segDist(sx,sy,toS(s.a),toS(s.b)); if(d<bd){ bd=d; best=s; } } return best; }

function skTyped(v){ /* a number typed while drawing: length, radius or angle */ const E=planEd, k=E.k, n=E.pts.length; if(!(isFinite(v)&&v>0)){ toast('Не соответствует: нужно число больше 0'); return; }
  if(k==='af'&&E.pick.length===2){ skFillet(v); return; }
  if((k==='ln'||k==='pl')&&n){ const A=E.pts[n-1], tgt=E.ld&&skL(skV(A,E.ld))>1?E.ld:null, prev=E.L.length?E.L[E.L.length-1]:null, d=tgt?skU(skV(A,tgt)):prev?skU(skV(prev.a,prev.b)):{x:1,y:0}; skPoint(skR3(skAddP(A,d,v))); return; }
  if(k==='ci'&&n===1){ skPoint(skR3({x:E.pts[0].x+v,y:E.pts[0].y})); return; }
  if((k==='mv'||k==='cp')&&n===1){ const A=E.pts[0], tgt=E.ld&&skL(skV(A,E.ld))>1?E.ld:null; if(!tgt){ toast('Покажите направление пальцем или курсором, затем число'); return; } skPoint(skR3(skAddP(A,skU(skV(A,tgt)),v))); return; }
  if(k==='rot'){ const C=skCentroid(); if(!C){ toast('Сначала выберите линии'); return; } const an=v*Math.PI/180; skApplyX({X:p=>skRotP(C,an,p),copy:E.opt.cpy}); skReset(E); skSync(); return; }
  toast('Сначала поставьте первую точку'); }

function skMvAgain(v){ const E=planEd, M=E&&E.lastMv; if(!M) return; if(!(v>0)){ toast('Не соответствует: нужно число больше 0'); return; } const L0=skL(skV(M.A,M.B)); if(L0<1) return; const d=skU(skV(M.A,M.B)), dv=v-L0; if(Math.abs(dv)<0.5) return; skApplyX({X:p=>({x:p.x+d.x*dv,y:p.y+d.y*dv}),mv:true}); M.B=skR3(skAddP(M.A,d,v)); skSync(); toast('Перемещено на '+fmtU(v)); }

function skTypedR(v){ const E=planEd, k=E.k; if(!(v>0)){ toast('Не соответствует: радиус больше 0'); return; } if(E.pts.length!==1) return; const c=E.pts[0], d=E.ld&&skL(skV(c,E.ld))>1?skU(skV(c,E.ld)):{x:1,y:0}; skPoint(skR3(skAddP(c,d,v))); }

function skOpt(t){ const E=planEd, o=E.opt, id=t.id, v=t.type==='checkbox'?t.checked:parseNum(String(t.value).replace('−','-'));
  if(id==='skRad'){ o.rad=v; } else if(id==='skMul'){ o.mul=v; } else if(id==='skKeep'){ o.keep=v; } else if(id==='skCpy'){ o.cpy=v; }
  else if(id==='skR'){ if(v>0) o.R=v; else toast('Не соответствует: радиус больше 0'); } else if(id==='skN'){ if(v>=3&&v<=64) o.n=Math.round(v); else toast('Не соответствует: сторон 3…64'); }
  else if(id==='skOff'){ if(v>0) o.off=v; else toast('Не соответствует: расстояние больше 0'); } else if(id==='skGap'){ if(v>0) o.gap=v; else toast('Не соответствует: зазор больше 0'); }
  else if(id==='skLen'||id==='skFR'||id==='skAng'||id==='skCR'){ skTyped(v); return; }
  else if(id==='skZ'){ if(isFinite(v)&&Math.abs(v)<=100000&&E.cfg) E.cfg.z=v; else toast('Не соответствует: низ ±100000 мм'); }
  skSync(); }

function planUndo(){ const E=planEd; if(!E) return false; if(E.pts&&E.pts.length){ E.pts.pop(); E.a=E.pts.length?E.pts[E.pts.length-1]:null; E.live=null; } else if(E.pick&&E.pick.length){ E.pick.pop(); } else if(E.H.length){ skHistPop(E); E.S=[]; E.lastI=null; } else { toast('Нечего отменять'); } skSync(); return true; }

function planDown(p){ const E=planEd, m=E.k;
  if(E.fly){ const pm=document.getElementById('popMenu'); E.fly=null; if(pm&&!pm.hidden){ pm.hidden=true; skSync(); return {plN:true}; } }
  /* a size on the screen: tap — type the exact value; a size that rides with the cursor never takes a click aimed at the point itself */ const lvS=E.live?toS(E.live):null, lh=(E.lh||[]).find(h=>{ const d=Math.hypot(h.x-p.x,h.y-p.y); return d<24&&!(h.lv&&lvS&&Math.hypot(lvS.x-p.x,lvS.y-p.y)<=d); }); if(lh){ openInline({kind:'sk',id:null,w:toW(lh.x,lh.y),val:lh.val,fn:lh.fn}); return {plN:true}; }
  if(SKPT.has(m)||(m==='af'&&E.pick.length===2)){ E.live=skSnap(p.x,p.y); E.ld=E.live; skAcq(E.live); redraw(); return {plL:true}; }
  if(m!=='s'&&m!=='sm') return null; const snapSP=JSON.stringify(E.SP||[]);
  /* control points of a selected spline */ for(const j of skSelSp()){ const P=E.SP[j].p; for(let k=0;k<P.length;k++){ const q=toS(P[k]); if(Math.hypot(q.x-p.x,q.y-p.y)<16) return {plD:{t:'spp',j,k,w0:toW(p.x,p.y),snap:JSON.stringify(E.L),snapSP}}; } }
  const h=planHit(p.x,p.y); if(!h) return null; return {plD:{t:'mv',h,w0:toW(p.x,p.y),snap:JSON.stringify(E.L),snapSP}}; }

function planLiveMove(p){ const E=planEd; if(!E) return; if(SKPT.has(E.k)||(E.k==='af'&&E.pick.length===2)){ E.live=skSnap(p.x,p.y); E.ld=E.live; skAcq(E.live); redraw(); } }

function planTap(sx,sy,pt){ const E=planEd, m=E.k; E.live=null;
  if(m==='s'||m==='sm'){ E.S=[]; skSync(); return; }
  /* Переместить with nothing selected: the touched segment is taken */
  if(m==='mv'&&!skSelLines().length&&!skSelSp().length){ const sp=pt?toS(pt):{x:sx,y:sy}, i=planLineAt(sp.x,sp.y); if(i>=0){ E.S=[{k:'l',i}]; toast('Переместить: базовая точка — конец или середина отрезка'); } else toast('Коснитесь отрезка — или выберите несколько: «Выбор ▾»'); skSync(); return; }
  if(pt||SKPT.has(m)||(m==='af'&&E.pick.length===2)){ skPoint(pt||skSnap(sx,sy)); return; }
  if(m==='t'){ /* trim: the piece between the neighbouring crossings goes */ const i=planLineAt(sx,sy); if(i<0){ toast('Коснитесь куска линии, который надо убрать'); return; } const l=E.L[i], w=toW(sx,sy), v={x:l.b.x-l.a.x,y:l.b.y-l.a.y}, l2=v.x*v.x+v.y*v.y||1, tw=((w.x-l.a.x)*v.x+(w.y-l.a.y)*v.y)/l2, T=[0,1];
    E.L.forEach((o,j)=>{ if(j===i) return; const A=o.a,B=o.b, e={x:B.x-A.x,y:B.y-A.y}, den=v.x*e.y-v.y*e.x; if(Math.abs(den)<1e-9) return; const t=((A.x-l.a.x)*e.y-(A.y-l.a.y)*e.x)/den, u=((A.x-l.a.x)*v.y-(A.y-l.a.y)*v.x)/den; if(t>1e-4&&t<1-1e-4&&u>=-1e-4&&u<=1+1e-4) T.push(t); });
    T.sort((x,y)=>x-y); let t0=0,t1=1; for(let k=0;k+1<T.length;k++) if(tw>=T[k]&&tw<=T[k+1]){ t0=T[k]; t1=T[k+1]; } const at=t=>({x:r3(l.a.x+v.x*t),y:r3(l.a.y+v.y*t)}); planHist();
    const keep=[]; if(t0>1e-4) keep.push({...l,b:at(t0)}); if(t1<1-1e-4) keep.push({...l,a:at(t1)}); E.L.splice(i,1,...keep); E.S=[]; skSync(); return; }
  skTapLine(sx,sy); }

function planDel(){ const E=planEd, S=E.S||[]; if(!S.length){ skSetTool('del'); skSync(); toast('Удалить: коснитесь линии'); return; } planHist(); const del=new Set(S.filter(o=>o.k!=='sp').map(o=>o.i)), dS=new Set(skSelSp()); E.L=E.L.filter((_,i)=>!del.has(i)); E.SP=(E.SP||[]).filter((_,j)=>!dS.has(j)); E.S=[]; E.lastI=null; skSync(); }

function planPanel(){ const E=skState(planEd), S=E.S||[], k=E.k, t=E.t, ok=x=>skAllowed(x,t);
  const B=(key,lbl,on,act)=>`<button class="skb" data-act="${act||'plK'}" data-k="${key}" aria-pressed="${!!on}" title="${SKN[key]||lbl}">${skSvg(key)}<span>${lbl}</span></button>`;
  const F=g=>{ const L=SKFLY[g].filter(ok); if(!L.length) return ''; const cur=L.includes(E.last[g])?E.last[g]:L[0]; return `<button class="skb skf" data-act="plF" data-g="${g}" data-k="${cur}" aria-pressed="${L.includes(k)}" aria-expanded="${E.fly===g}" title="${SKN[cur]} — ещё раз: список">${skSvg(cur)}<span>${g==='se'||g==='ln'?SKS[cur]:SKFN[g]}</span><i></i></button>`; };
  const grp=(cap,h)=>h?`<div class="skg"><b>${cap}</b><div>${h}</div></div>`:'', sep='<span class="sksep"></span>';
  const draw=F('ln')+F('pk');
  const mod=B('cp',SKS.cp,k==='cp')+B('rot',SKS.rot,k==='rot')+F('mr')+B('of',SKS.of,k==='of')+F('tr')+`<button class="skb skdel" data-act="plDel" data-k="del" aria-pressed="${k==='del'}" title="Удалить выбранное; без выбора — касание линии">${skSvg('del')}<span>Удалить</span></button>`;
  const ti=(x,n,c,d)=>`<button data-act="plT" data-t="${x}" aria-pressed="${t===x}"><i style="border-top:3px ${d?'dashed':'solid'} ${c}"></i>${n}</button>`;
  const steps=SKHINT[k]||[''], st=['af','tc','t1','tm'].includes(k)?E.pick.length:E.pts.length, hint=steps[Math.min(st,steps.length-1)];
  const num=(id,l,v,ph)=>`<label class="skin">${l}<input id="${id}" inputmode="decimal" value="${v==null?'':v}" placeholder="${ph||''}" autocomplete="off"></label>`, chk=(id,l,v)=>`<label class="skin"><input type="checkbox" id="${id}"${v?' checked':''}>${l}</label>`, o=E.opt;
  let inp=''; if(k==='ln'||k==='pl') inp=num('skLen','Длина','','мм')+(k==='pl'?chk('skRad','Радиус',o.rad)+(o.rad?num('skR','R',o.R):''):''); else if(k==='rc') inp=chk('skRad','Радиус углов',o.rad)+(o.rad?num('skR','R',o.R):''); else if(k==='pgi'||k==='pgc') inp=num('skN','Стороны',o.n); else if(k==='ci') inp=num('skCR','Радиус','','мм'); else if(k==='af') inp=num('skFR','Радиус','','мм');
  else if(k==='cp') inp=chk('skMul','Несколько копий',o.mul); else if(k==='mv') inp=num('skLen','Длина','','мм'); else if(k==='rot') inp=num('skAng','Угол, °','','')+chk('skCpy','Копия',o.cpy); else if(k==='mi'||k==='md') inp=chk('skKeep','Оставить исходное',o.keep); else if(k==='of') inp=num('skOff','Расстояние',o.off); else if(k==='sg') inp=num('skGap','Зазор',o.gap);
  const busy=E.pts.length||E.pick.length;
  const C=E.cfg, head=C&&C.kind==='lines'?`<div class="skt" role="group" aria-label="Тип линии">${ti('l','Линия','#9aa5b1')}${ti('x','Конструкц.','#5c7cfa',1)}</div>`:C?`<span class="skh"><b>${C.title}</b></span>${C.kind==='rail'?`<div class="skt" role="group" aria-label="Низ ограждения"><button data-act="plRB" data-b="lv" aria-pressed="${C.base!=='slab'}">На уровне</button><button data-act="plRB" data-b="slab" aria-pressed="${C.base==='slab'}">На перекрытии</button></div>${C.base!=='slab'?num('skZ','Низ',r1(C.z||0)):''}`:''}`:`<div class="skt" role="group" aria-label="Тип линии">${ti('c','Контур','#9aa5b1')}${ti('r','Конёк','#d63fd6')}${ti('j','Стык','#2fae5a',1)}</div>`;
  const opts=`<div class="skrow">${head}<span class="skok"><button class="ibn okb" data-act="plDone" title="${E.cfg?'Готово':'Построить крышу'}" aria-label="${E.cfg?'Готово':'Построить крышу'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button><button class="ibn cxb" data-act="plQuit" title="Выйти без изменений" aria-label="Выйти без изменений"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></div><div class="skrow skwr">${C&&C.kind==='lines'?`<div class="skt" role="group" aria-label="Слой линий">${[['misc','Прочее'],['open','Проёмы']].map(([k2,n2])=>`<button data-act="plLy" data-ly="${k2}" aria-pressed="${C.ly===k2}">${n2}</button>`).join('')}</div>`:''}<span class="skh"><b>${SKN[k]||''}</b>${hint?': '+hint:''}${S.length?' · выбрано: '+S.length:''}</span>${inp}${busy?`<button class="btn" data-act="plCancel">${k==='sp'?'Закончить сплайн':'Закончить'}</button>`:''}</div>`;
  const fly=''; /* the lists open as a vertical pop-up over the drawing (skFlyOpen) */
  const dock=`<div class="skdock">${grp('ВЫБОР',F('se')+B('mv',SKS.mv,k==='mv'))}${sep}${grp('РИСОВАТЬ',draw)}${sep}${grp('ИЗМЕНИТЬ',mod)}${sep}${grp('РЕЖИМ',`<button class="skb" data-act="plOr" aria-pressed="${axisMode==='ortho'}" title="Орто: 0° / 45° / 90° и пунктир от вершин">${skSvg('or')}<span>Орто</span></button>`)}
    </div>`;
  return `<div class="skw">${opts}${fly}${dock}</div>`; }

function drawPlanEd(){ const E=planEd; if(!E) return; skState(E); E.lh=[]; const S=E.S||[], selL=new Set(S.filter(o=>o.k!=='sp').map(o=>o.i)), selSp=new Set(skSelSp()), on=(i,e)=>S.some(o=>o.k==='e'&&o.i===i&&o.e===e), col=t=>t==='r'?'#d63fd6':t==='j'?'#2fae5a':'#9aa5b1', PK=new Set(E.pick.map(p=>p.i)); ctx.save();
  E.L.forEach((l,i)=>{ const a=toS(l.a), b=toS(l.b); if(selL.has(i)||PK.has(i)){ ctx.save(); ctx.strokeStyle=PK.has(i)?'#f59f00':'#4c9aff'; ctx.lineWidth=10; ctx.globalAlpha=.45; line(a,b); ctx.restore(); } ctx.strokeStyle=col(l.t); ctx.lineWidth=l.t==='c'?2:3; ctx.setLineDash(l.t==='j'?[8,6]:[]); line(a,b); ctx.setLineDash([]); });
  /* splines: one smooth curve; control points only when selected */ (E.SP||[]).forEach((Sp,j)=>{ const P=skSpCurve(Sp).map(toS), sel=selSp.has(j); if(sel){ ctx.save(); ctx.strokeStyle='#4c9aff'; ctx.lineWidth=10; ctx.globalAlpha=.45; ctx.beginPath(); P.forEach((q,k)=>k?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.stroke(); ctx.restore(); }
    ctx.strokeStyle=col(Sp.t); ctx.lineWidth=Sp.t==='c'?2:3; ctx.setLineDash(Sp.t==='j'?[8,6]:[]); ctx.beginPath(); P.forEach((q,k)=>k?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.stroke(); ctx.setLineDash([]);
    if(sel){ ctx.save(); ctx.strokeStyle='#4c9aff'; ctx.lineWidth=1; ctx.setLineDash([3,4]); ctx.beginPath(); Sp.p.forEach((v,k)=>{ const q=toS(v); k?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.stroke(); ctx.restore(); for(const v of Sp.p){ const q=toS(v); ctx.beginPath(); ctx.arc(q.x,q.y,6,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#4c9aff'; ctx.lineWidth=2; ctx.stroke(); } } });
  /* sizes you can tap and type: the selected segment / vertex (the other end stays), the segment just drawn */
  { const lab=(i,e,txt)=>{ const l=E.L[i]; if(!l) return; const a=toS(l.a), b=toS(l.b), u=skU({x:b.x-a.x,y:b.y-a.y}), m={x:(a.x+b.x)/2-u.y*22,y:(a.y+b.y)/2+u.x*22}, L=skL(skV(l.a,l.b)); tmpBox(fmtU(L),m.x,m.y,0,true); E.lh.push({x:m.x,y:m.y,val:L,fn:v=>skSetLen(i,e,v)}); };
    const SL=S.filter(o=>o.k!=='sp'), SE=SL.filter(o=>o.k==='e'); /* one selected vertex wins even when its lines are selected too */ const selM=E.k==='s'||E.k==='sm'; /* sizes of the selection — only while selecting (a move / copy shows its own size) */ if(selM&&SE.length===1&&!E.live) lab(SE[0].i,SE[0].e); else if(selM&&SL.length===1&&!E.live){ const o=SL[0]; lab(o.i,o.k==='e'?o.e:'b'); } else if(E.lastI!=null&&E.L[E.lastI]&&!E.live&&(E.k==='ln'||E.k==='pl')) lab(E.lastI,'b'); }
    if(E.k==='mv'&&E.lastMv&&!E.pts.length){ const M=E.lastMv, a=toS(M.A), b=toS(M.B), m={x:(a.x+b.x)/2,y:(a.y+b.y)/2-16}, L=skL(skV(M.A,M.B)); ctx.save(); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=1; ctx.setLineDash([4,4]); line(a,b); ctx.restore(); tmpBox(fmtU(L),m.x,m.y,0,true); E.lh.push({x:m.x,y:m.y,val:L,fn:v=>skMvAgain(v)}); }
  /* vertex circles only on the selected lines; the rest stay clean */
  for(const i of selL){ const l=E.L[i]; if(!l) continue; for(const e of ['a','b']){ const q=toS(l[e]), se=on(i,e); ctx.beginPath(); ctx.arc(q.x,q.y,se?8:6,0,Math.PI*2); ctx.fillStyle=se?'#4c9aff':'#fff'; ctx.fill(); ctx.strokeStyle='#4c9aff'; ctx.lineWidth=2; ctx.stroke(); } }
  const q=E.live, k=E.k, P=E.pts;
  if(q&&(SKPT.has(k)||(k==='af'&&E.pick.length===2))){ let G=null;
    if(k==='af'){ const [p1,p2]=E.pick, l1=E.L[p1.i], l2=E.L[p2.i]; if(l1&&l2){ const B0=skFilletGeo(l1,p1.w,l2,p2.w,0); if(!B0.err){ const R=skFilletR(B0,q), G2=skFilletGeo(l1,p1.w,l2,p2.w,R); if(!G2.err){ G={S:skChain(G2.arc)}; const m=toS(G2.arc[Math.floor(G2.arc.length/2)]); tmpBox('R '+fmtU(R),m.x,m.y-18,0,false); } } } }
    else G=skGen(k,P,q);
    if(G){ ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=2.5; ctx.setLineDash([10,6]); if(G.S) for(const [A,B] of G.S) line(toS(A),toS(B)); if(G.X) for(const i of skSelLines()){ const l=E.L[i]; line(toS(G.X(l.a)),toS(G.X(l.b))); } ctx.setLineDash([]); }
    const A=P.length?P[P.length-1]:null;
    if(A&&(k==='ln'||k==='pl'||((k==='mv'||k==='cp')&&P.length===1))){ const a=toS(A), b=toS(q), m={x:(a.x+b.x)/2,y:(a.y+b.y)/2-16}, L=skL(skV(A,q)); tmpBox(fmtU(L),m.x,m.y,0,false); E.lh.push({x:m.x,y:m.y,val:L,fn:v=>skTyped(v),lv:true}); }
    if(P.length&&k==='rc'){ const b=toS(q); tmpBox(fmtU(Math.abs(q.x-P[0].x))+' × '+fmtU(Math.abs(q.y-P[0].y)),b.x+44,b.y-18,0,false); }
    if(P.length===1&&(k==='ci'||k==='pgi'||k==='pgc')){ const a=toS(P[0]), b=toS(q), m={x:(a.x+b.x)/2,y:(a.y+b.y)/2-16}, R=skL(skV(P[0],q)); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=1; line(a,b); tmpBox('R '+fmtU(R),m.x,m.y,0,false); E.lh.push({x:m.x,y:m.y,val:R,fn:v=>skTypedR(v),lv:true}); }
    if(k==='rot'&&G&&G.C){ const c=toS(G.C), b=toS(q); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=1; line(c,b); if(P[0]) line(c,toS(P[0])); tmpBox((G.ang*180/Math.PI).toFixed(1)+'°',b.x+30,b.y-18,0,false); }
    if((k==='cp'||k==='mv')&&P[0]){ ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=1; line(toS(P[0]),toS(q)); } }
  for(const p of P){ const s=toS(p); ctx.beginPath(); ctx.arc(s.x,s.y,6,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=2; ctx.stroke(); }
  if(k==='rot'){ const C=skCentroid(); if(C){ const c=toS(C); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(c.x-7,c.y); ctx.lineTo(c.x+7,c.y); ctx.moveTo(c.x,c.y-7); ctx.lineTo(c.x,c.y+7); ctx.stroke(); } }
  for(const a of E.acq||[]){ const s=toS(a); ctx.strokeStyle='#0ea5b7'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(s.x-7,s.y); ctx.lineTo(s.x+7,s.y); ctx.moveTo(s.x,s.y-7); ctx.lineTo(s.x,s.y+7); ctx.stroke(); }
  for(const b of E.bad||[]){ const s=toS(b); ctx.strokeStyle='#e03131'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(s.x,s.y,11,0,Math.PI*2); ctx.stroke(); }
  if(q){ const b=toS(q), mag=liveSnap==='end'||liveSnap==='corner'||liveSnap==='mid'; ctx.beginPath(); ctx.arc(b.x,b.y,mag?12:5,0,Math.PI*2); ctx.fillStyle=mag?'rgba(47,111,228,.15)':'#2f6fe4'; ctx.fill(); if(mag){ ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=2; ctx.stroke(); } }
  ctx.restore(); }

const SKTITLE={slab:'Граница перекрытия',roof:'Граница крыши',rail:'Траектория ограждения',nslab:'Перекрытие: контур',nroof:'Крыша по эскизу: контур'};

function skOpenBsk(c,segs,tool){ c.title=SKTITLE[c.kind]||'Эскиз'; c.open=c.kind==='rail'; bsk=null; roofSk=null; roofSkLive=null;
  let L=segs.map(([A,B])=>({a:{x:r3(A.x),y:r3(A.y)},b:{x:r3(B.x),y:r3(B.y)},t:'c'})), SP=[]; const slab=c.kind==='nslab', it0=c.id?doc.items.find(i=>i.id===c.id):null;
  if(it0&&it0.sk&&it0.sk.h===skHash(it0)){ L=JSON.parse(JSON.stringify(it0.sk.L)); SP=JSON.parse(JSON.stringify(it0.sk.SP||[])); }
  setTool('select'); selId=null; moveSel.clear(); roofEd=null; roofEdge=null; selJoint=null; c.slab=slab;
  planEd=skState({id:null,L,SP,acq:[],k:tool||'pl',t:'c',a:null,live:null,S:[],H:[],cfg:c,bad:[]}); panelKey=''; syncPanel(); syncModeBtns(); syncTop(); redraw();
  toast(c.title+({slab:': внешний контур — граница, внутренние — отверстия',roof:': один замкнутый контур',rail:': одна цепь линий (можно незамкнутая)',nslab:': замкнутый контур, липнет к стенам',nroof:': замкнутый контур, липнет к стенам'}[c.kind]||'')+'. ✓ — готово, ✕ — отмена',true,true); }

function skQuit(){ const E=planEd; if(!E) return; const c=E.cfg; if(isLnSk(E)){ lnRevert(); planEd=null; setTool('select'); toast('Изменения линий отменены'); return; } planEd=null; if(c&&c.id){ selId=c.id; if(c.det) roofEd=c.id; } panelKey=''; syncPanel(); syncModeBtns(); syncTop(); redraw(); if(c) toast('Эскиз отменён'); }

function skBskDone(){ if(isLnSk(planEd)){ lnCommit(); planEd=null; setTool('select'); toast('Линии сохранены'); return; } const E=planEd, c=E.cfg, segs=skAllL(E).map(l=>[{...l.a},{...l.b}]), n00=doc.items.length;
  /* the sketch (with its splines) is kept on the object while its outline is unchanged */ const keepSk=()=>{ if(!(E.SP||[]).length) return; const it=c.id?doc.items.find(i=>i.id===c.id):(doc.items.length>n00?doc.items[doc.items.length-1]:null); if(!it||!it.pts) return; it.sk={L:JSON.parse(JSON.stringify(E.L)),SP:JSON.parse(JSON.stringify(E.SP)),h:skHash(it)}; persist(); };
  if(c.kind==='nslab'||c.kind==='nroof'){ const R=bskLoops(segs); if(R.err){ E.bad=R.bad||[]; skSync(); toast('Не соответствует: '+R.err,true,true); return; } if(R.loops.length!==1){ E.bad=R.loops.slice(1).map(P=>P[0]); skSync(); toast('Не соответствует: нужен один замкнутый контур',true,true); return; }
    const n0=doc.items.length, keep=planEd; planEd=null; tool='roof'; slabMode=c.slab; roofSk={pts:R.loops[0].map(q=>({x:r3(q.x),y:r3(q.y)}))}; finishRoofSketch();
    if(doc.items.length===n0){ /* not built: stay in the sketch */ planEd=keep; tool='select'; slabMode=false; roofSk=null; skSync(); } else { keepSk(); slabMode=false; if(tool!=='select') setTool('select'); panelKey=''; syncPanel(); syncModeBtns(); redraw(); } return; }
  bsk={det:c.det,kind:c.kind,id:c.id,li:c.li,segs,tool:'line',ch:null,tmp:[],live:null,n:6,U:[],tr:null,bad:[],base:c.base,z:c.z}; const keep=planEd; planEd=null;
  try{ bskFinish(); }catch(e){ console.error(e); }
  if(bsk){ /* refused: back to the sketch with the bad points marked */ keep.bad=bsk.bad||[]; bsk=null; planEd=keep; skSync(); return; }
  keepSk(); panelKey=''; syncPanel(); syncModeBtns(); syncTop(); redraw(); }
