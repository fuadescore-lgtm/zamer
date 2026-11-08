/* Стандартный блок редактирования линий («Эскиз») — эталонная реализация, BIMsketcher 3D 2.9.84.
   Извлечено из web-src/zamer-dxf.html инструментом tools/extract_line_block.py: константы SK*, функции sk*, plan*, drawPlanEd,
   переходники плоскостей skv*, дуги как один объект (skArc*, lnArc*, arc*), сессия «Линии» (ln*).
   Не самостоятельный модуль: опирается на холст приложения (toS/toW, ctx, line, tmpBox, snapPoint с opt.trackSrc,
   openInline/closeInline kind 'sk', popMenu, toast, syncPanel, redraw). Описание и журнал — blocks/STANDARD_LINE_BLOCK.md. */

let SKV=null; /* the standard line block on another plane (facade, a face in 3D): while it runs there, screen ↔ world go through that view */
function planOpen(r){ /* r: a roof to edit (its contour and plan become lines), or null: a new roof */ const L=[];
  if(r){ if(polyArea2(r.pts)<0){ r.pts.reverse(); if(r.edges&&r.edges.length===r.pts.length){ const E=r.edges, n=r.pts.length; r.edges=r.pts.map((_,k)=>E[(n-2-k+n)%n]); } }
    const P=r.pts; if(r.sk&&r.sk.h===skHash(r)) for(const l of r.sk.L) L.push({...l,a:{...l.a},b:{...l.b}}); else for(let k=0;k<P.length;k++) L.push({a:{...P[k]},b:{...P[(k+1)%P.length]},t:'c'}); const pl=r.plan&&r.plan.L?r.plan.L:planFrom(r); for(const l of pl) L.push({...l,a:{...l.a},b:{...l.b}}); }
  planEd=skState({id:r?r.id:null,L,SP:r&&r.sk&&r.sk.h===skHash(r)?JSON.parse(JSON.stringify(r.sk.SP)):[],acq:[],k:r?'s':'pl',t:'c',a:null,live:null,S:[],H:[]}); roofEd=null; roofEdge=null; if(!r){ setTool('select'); selId=null; }
  panelKey=''; syncPanel(); syncModeBtns(); redraw(); toast(r?'Эскиз крыши: правьте линии; ✓ — построить':'План кровли: тип «Контур» — рисуйте (полилиния, прямоугольник, подобрать стены…), затем тип «Конёк» и «Стык»; ✓ — построить',true); }
function planHist(){ const E=planEd; E.H.push(JSON.stringify({L:E.L,SP:E.SP||[],...(isLnSk(E)?{A:lnArcItems()}:{})})); /* «Линии»: true arcs / circles go back with the lines */ if(E.H.length>200) E.H.shift(); }
function skHistPop(E){ const o=JSON.parse(E.H.pop()); if(Array.isArray(o)) E.L=o; else { E.L=o.L; E.SP=o.SP||[]; } if(o.A&&isLnSk(E)){ const Lv=doc.levels[E.cfg.li]; if(Lv){ const was=new Set(lnArcItems().map(i=>i.id)); Lv.items=Lv.items.filter(i=>!was.has(i.id)); Lv.items.push(...o.A); if(E.arc&&!o.A.some(i=>i.id===E.arc)) E.arc=null; persist(); } } }
function planSnap(sx,sy,from,skip,polar,wall){ if(wall==null) wall=planEd.cfg?planEd.cfg.kind!=='cab':planEd.t==='c'; /* contour snaps to walls (this level and below); ridges and joints only to the sketch */ const L=planEd.L, ex=[], mid=[]; /* sketch vertices and line midpoints: snap targets and tracking (dashed guide) sources */
  L.forEach((l,i)=>{ const sa=skip&&skip(i,'a'), sb=skip&&skip(i,'b'); if(!sa) ex.push(l.a); if(!sb) ex.push(l.b); if(!sa&&!sb&&Math.hypot(l.b.x-l.a.x,l.b.y-l.a.y)>1) mid.push({x:(l.a.x+l.b.x)/2,y:(l.a.y+l.b.y)/2}); });
  (planEd.SP||[]).forEach((S,j)=>{ if(skip&&skip('sp'+j)) return; ex.push(S.p[0]); if(!S.cl) ex.push(S.p[S.p.length-1]); });
  if(planEd.cfg&&planEd.cfg.kind==='cab'){ try{ ex.push(...cabSnapPts()); }catch(_){} } /* a cable: devices and their connection points attract */
  if(isLnSk(planEd)) for(const it of lnArcItems()){ if(skip&&skip('arc'+it.id)) continue; if(it.t==='circ') ex.push({...it.c}); else { ex.push({...it.a},{...it.b}); try{ mid.push(arcAt(arcG(it),0.5)); }catch(_){} } } /* ends of arcs, the arc middle and circle centres attract like vertices */
  if(SKV) return SKV.snap(sx,sy,from||(polar&&polar[0])||null,{ex,mid,trackSrc:planEd.acq||[]}); /* a dragged end: Орто to its line's other end */
  let q; try{ q=snapPoint(sx,sy,from||null,{extra:ex,extraMid:mid,onlyExtra:!wall,geoAll:wall,exclude:planEd.cfg&&planEd.cfg.ex?planEd.cfg.ex:planEd.id||(planEd.cfg&&planEd.cfg.id)?new Set([planEd.id||planEd.cfg.id]):undefined,track:true,trackSrc:planEd.acq||[],polar:polar&&polar.length?polar:undefined}); }catch(e){ q=toW(sx,sy); }
  /* a vertex, a midpoint or a tracking alignment wins over sliding onto a line */
  if(liveSnap==='end'||liveSnap==='corner'||liveSnap==='mid'||liveSnap==='center'||(wall&&(liveSnap==='face'||liveSnap==='axis'||liveSnap==='onc'))||(trackGuide&&trackGuide.length)||(polarGuide&&polarGuide.length>1)) return {x:r3(q.x),y:r3(q.y)};
  const sq=toS(q); let best=null, bd=14; L.forEach((l,i)=>{ if(skip&&(skip(i,'a')||skip(i,'b'))) return; const A=l.a,B=l.b, d=segDist(sq.x,sq.y,toS(A),toS(B)); if(d>=bd) return;
    if(from&&axisMode==='ortho'){ const d0={x:q.x-from.x,y:q.y-from.y}, len=Math.hypot(d0.x,d0.y); if(len<1) return; const u={x:d0.x/len,y:d0.y/len}, e={x:B.x-A.x,y:B.y-A.y}, den=u.x*e.y-u.y*e.x; if(Math.abs(den)<1e-9) return; const t=((A.x-from.x)*e.y-(A.y-from.y)*e.x)/den, uu=((A.x-from.x)*u.y-(A.y-from.y)*u.x)/den; if(t<=0||uu<-1e-6||uu>1+1e-6) return; bd=d; best={x:from.x+u.x*t,y:from.y+u.y*t}; }
    else { const v={x:B.x-A.x,y:B.y-A.y}, l2=v.x*v.x+v.y*v.y||1, t=Math.max(0,Math.min(1,((q.x-A.x)*v.x+(q.y-A.y)*v.y)/l2)); bd=d; best={x:A.x+v.x*t,y:A.y+v.y*t}; } });
  if(best){ q=best; liveSnap='on'; } return {x:r3(q.x),y:r3(q.y)}; }
function planLineAt(sx,sy){ let bi=-1, bd=16; planEd.L.forEach((l,i)=>{ const d=segDist(sx,sy,toS(l.a),toS(l.b)); if(d<bd){ bd=d; bi=i; } }); return bi; }
function planHit(sx,sy){ let best=null; const AG=skArcSel(planEd), SL=new Set((planEd.S||[]).filter(o=>o.k!=='sp'&&!(AG&&AG.I.includes(o.i))).map(o=>o.i)); planEd.L.forEach((l,i)=>{ if(!SL.has(i)) return; /* vertex circles exist only on selected lines */ for(const e of ['a','b']){ const q=toS(l[e]), d=Math.hypot(q.x-sx,q.y-sy); if(d<16&&(!best||best.pr>0||d<best.d)) best={k:'e',i,e,d,pr:0}; } });
  if(!best){ const i=planLineAt(sx,sy); if(i>=0) best={k:'l',i,pr:1}; } if(!best){ const j=skSplineAt(sx,sy); if(j>=0) best={k:'sp',i:j,pr:2}; } return best; }
const planKey=o=>o.k+o.i+(o.e||'');
function planPts(S,free){ const L=planEd.L, out=[], add=(o,f)=>{ if(!out.some(x=>x.o===o&&x.f===f)) out.push({o,f}); };
  if(free){ for(const o of S){ if(o.k==='e') add(L[o.i],o.e); else { add(L[o.i],'a'); add(L[o.i],'b'); } } return out; }
  const at=pt=>L.forEach(l=>{ for(const e of ['a','b']) if(Math.hypot(l[e].x-pt.x,l[e].y-pt.y)<5) add(l,e); });
  for(const o of S){ if(o.k==='e') at(L[o.i][o.e]); else { at(L[o.i].a); at(L[o.i].b); } } return out; }
function planMove(q,p){ const E=planEd; if(q.t==='tdr'){ const w=toW(p.x,p.y); if(!q.moved&&Math.hypot(w.x-q.w0.x,w.y-q.w0.y)*view.scale<4) return; q.moved=true; const z=planSnap(p.x,p.y,null,()=>false); skAcq(z); (E.tdR=E.tdR||{})[q.key]={x:z.x,y:z.y}; E.tdN=E.L.length; redraw(); return; }
  if(q.t==='mv'&&q.h&&q.h.k==='l') E._dragL=q.h.i; if(q.t==='arc'){ lnArcMove(q,p); return; } if(q.t==='arcg'){ skArcMove(q,p); return; } E.L=JSON.parse(q.snap); if(q.snapSP!=null) E.SP=JSON.parse(q.snapSP);
  if(q.t==='spp'){ const sp=toS(p), z=planSnap(p.x,p.y,null,(i,e)=>i===('sp'+q.j)); skAcq(z); E.SP[q.j].p[q.k]=z; q.moved=true; redraw(); return; }
  if(q.t==='mv'&&q.h.k==='sp'){ const w=toW(p.x,p.y), dx=Math.round((w.x-q.w0.x)/10)*10, dy=Math.round((w.y-q.w0.y)/10)*10; E.SP[q.h.i].p=E.SP[q.h.i].p.map(v=>skR3({x:v.x+dx,y:v.y+dy})); q.moved=true; redraw(); return; }
  let S=q.t==='mv'?[q.h]:q.S;
  if(q.t==='cp'){ const N=[...new Set(S.map(x=>E.L[x.i]))].map(l=>({...l,a:{...l.a},b:{...l.b}})); E.L.push(...N); S=N.map(l=>({k:'l',i:E.L.indexOf(l)})); }
  const pts=planPts(S,q.t!=='mv'), w=toW(p.x,p.y); /* «Выбор»: the taken vertex / line pulls the lines joined to it (the far ends stay); copy / rotate move only their own lines */ let dx=w.x-q.w0.x, dy=w.y-q.w0.y;
  if(q.t==='rot'){ const C=pts.reduce((m,x)=>({x:m.x+x.o[x.f].x/pts.length,y:m.y+x.o[x.f].y/pts.length}),{x:0,y:0}); let an=Math.atan2(w.y-C.y,w.x-C.x)-Math.atan2(q.w0.y-C.y,q.w0.x-C.x); an=Math.round(an/(Math.PI/12))*(Math.PI/12); const c=Math.cos(an), sn=Math.sin(an);
    for(const x of pts){ const v=x.o[x.f], X=v.x-C.x, Y=v.y-C.y; x.o[x.f]={x:r3(C.x+X*c-Y*sn),y:r3(C.y+X*sn+Y*c)}; } }
  else { if(S.length===1&&S[0].k==='e'){ const l0=E.L[S[0].i], v0=l0[S[0].e], oth=l0[S[0].e==='a'?'b':'a'], mine=new Set(pts.map(x=>E.L.indexOf(x.o)+x.f)), sp=toS({x:v0.x+dx,y:v0.y+dy}), z=planSnap(sp.x,sp.y,null,(i,e)=>mine.has(i+e),[oth],l0.t==='c'); skAcq(z); dx=z.x-v0.x; dy=z.y-v0.y; } /* a dragged end keeps Орто to its line's other end */ else { dx=Math.round(dx/10)*10; dy=Math.round(dy/10)*10; if(axisMode==='ortho'&&q.t==='mv'&&q.h&&q.h.k==='l'&&E.L[q.h.i]){ const l0=JSON.parse(q.snap)[q.h.i], v=skV(l0.a,l0.b), Lv=skL(v); if(Lv>1){ const n={x:-v.y/Lv,y:v.x/Lv}, k=Math.round(((w.x-q.w0.x)*n.x+(w.y-q.w0.y)*n.y)/10)*10; dx=n.x*k; dy=n.y*k; } } /* Орто: a segment moves only square to itself — a vertical one sideways, a horizontal one up and down; its joined lines keep their direction */ 
      if(q.t==='mv'&&q.h&&q.h.k==='l'){ /* a dragged segment lines up with the vertices around it (dashed guide); never with its own or the joined ends it pulls */
        trackGuide=null; polarGuide=null; const l0=JSON.parse(q.snap)[q.h.i], MV=pts.map(x=>({...x.o[x.f]})), isMv=v=>MV.some(m=>Math.abs(m.x-v.x)<0.5&&Math.abs(m.y-v.y)<0.5), V=[]; for(const l of E.L) for(const e of ['a','b']) if(!isMv(l[e])) V.push(l[e]); if(isLnSk(E)) for(const it of lnArcItems()){ if(it.t==='circ') V.push(it.c); else { if(!isMv(it.a)) V.push(it.a); if(!isMv(it.b)) V.push(it.b); } } /* the ends of arcs line up too */
        const s0=toS({x:0,y:0}), s1=toS({x:1000,y:0}), ppm=Math.hypot(s1.x-s0.x,s1.y-s0.y)/1000||view.scale, tol=12/ppm, v=skV(l0.a,l0.b), Lv=skL(v)||1, t={x:v.x/Lv,y:v.y/Lv};
        if(axisMode==='ortho'){ const n={x:-t.y,y:t.x}, k=dx*n.x+dy*n.y; let best=null; for(const P of V){ const kk=(P.x-l0.a.x)*n.x+(P.y-l0.a.y)*n.y; if(Math.abs(kk-k)<tol&&(!best||Math.abs(kk-k)<Math.abs(best.kk-k))) best={kk,P}; }
          if(best){ dx=n.x*best.kk; dy=n.y*best.kk; const A1={x:l0.a.x+dx,y:l0.a.y+dy}, u=(best.P.x-A1.x)*t.x+(best.P.y-A1.y)*t.y, foot={x:A1.x+t.x*u,y:A1.y+t.y*u}, far=Math.abs(u)<Lv/2?{x:A1.x+t.x*Lv,y:A1.y+t.y*Lv}:foot; trackGuide=[[best.P,u<=0?A1:u>=Lv?{x:A1.x+t.x*Lv,y:A1.y+t.y*Lv}:foot]]; /* the guide runs from the vertex to the nearest point of the segment */ liveSnap='align'; } }
        else { const E2=[l0.a,l0.b,{x:(l0.a.x+l0.b.x)/2,y:(l0.a.y+l0.b.y)/2}]; let bx=null, by=null; for(const P of V) for(const A of E2){ const ex=P.x-(A.x+dx), ey=P.y-(A.y+dy); if(Math.abs(ex)<tol&&(!bx||Math.abs(ex)<Math.abs(bx.e))) bx={e:ex,P,A}; if(Math.abs(ey)<tol&&(!by||Math.abs(ey)<Math.abs(by.e))) by={e:ey,P,A}; }
          if(bx) dx+=bx.e; if(by) dy+=by.e; if(bx||by){ trackGuide=[]; if(bx) trackGuide.push([bx.P,{x:bx.A.x+dx,y:bx.A.y+dy}]); if(by) trackGuide.push([by.P,{x:by.A.x+dx,y:by.A.y+dy}]); liveSnap='align'; } } } }
    for(const x of pts){ const v=x.o[x.f]; x.o[x.f]={x:r3(v.x+dx),y:r3(v.y+dy)}; } }
  q.moved=true; redraw(); }
function lnArcMove(q,p){ const it=lnArcItems().find(i=>i.id===q.id); if(!it) return; const o=JSON.parse(q.o), w=toW(p.x,p.y); if(!q.moved&&Math.hypot(w.x-q.w0.x,w.y-q.w0.y)*view.scale<4) return; q.moved=true; if(q.L0==null&&planEd) q.L0=JSON.stringify(planEd.L);
  /* lines joined to the arc's ends follow them (no gap), as with an arc of the sketch */ const follow=()=>{ const E=planEd; if(!E||it.t==='circ'||!it.a||!it.b) return; const pv=q.lastE||{a:o.a,b:o.b}; for(const l of E.L) for(const e of ['a','b']){ if(Math.hypot(l[e].x-pv.a.x,l[e].y-pv.a.y)<0.5) l[e]={x:it.a.x,y:it.a.y}; else if(Math.hypot(l[e].x-pv.b.x,l[e].y-pv.b.y)<0.5) l[e]={x:it.b.x,y:it.b.y}; } q.lastE={a:{...it.a},b:{...it.b}}; E._agK=null; };
  if(q.k==='body'){ const dx=Math.round((w.x-q.w0.x)/10)*10, dy=Math.round((w.y-q.w0.y)/10)*10, sh=v=>skR3({x:v.x+dx,y:v.y+dy}); if(it.t==='circ') it.c=sh(o.c); else { it.a=sh(o.a); it.b=sh(o.b); } follow(); redraw(); return; }
  const h0=(lnArcH(o).find(h=>h.k===q.k)||{p:q.w0}).p, t=toS({x:h0.x+w.x-q.w0.x,y:h0.y+w.y-q.w0.y}), z=skR3(planSnap(t.x,t.y,null,()=>false)); /* the handle follows the finger by the same shift (the finger may not hit its centre) */
  if(q.k==='c') it.c=z; else if(q.k==='r') it.r=r3(Math.max(1,Math.hypot(z.x-o.c.x,z.y-o.c.y)));
  else { const a=q.k==='a'?z:o.a, b=q.k==='b'?z:o.b, m=q.k==='m'?z:q.m0; if(Math.hypot(b.x-a.x,b.y-a.y)<1) return; const bg=bulge3(a,b,m); if(Math.abs(bg)<1e-6) return; /* three points on a line — no arc */ it.a=a; it.b=b; it.bg=bg; }
  follow(); redraw(); }
function planUp(q){ const E=planEd; E._dragL=null; trackGuide=null; polarGuide=null; if(q.t!=='tdr') liveSnap=null; /* no dashed guide stays behind after a drag */ if(q.t==='tdr'){ if(!q.moved){ if(E.tdR&&E.tdR[q.key]){ delete E.tdR[q.key]; toast('Размер снова до соседней линии'); } else toast('Тяните кружок размера к другой вершине или линии; касание цифры — ввести'); } else toast('Размер привязан к точке. Касание кружка — вернуть авто'); E.acq=[]; redraw(); return; }
  if(q.t==='arcg'){ if(q.moved&&JSON.stringify(E.L)!==q.snap){ const now=E.L, nS=E.S; E.L=JSON.parse(q.snap); planHist(); E.L=now; E.S=nS; E._agK=null; } panelKey=''; syncPanel(); redraw(); return; }
  if(q.t==='arc'){ const it=lnArcItems().find(i=>i.id===q.id); if(!q.moved){ E.arc=q.id; E.S=[]; skSync(); if(it) toast(it.t==='circ'?'Окружность: тяните центр или ромб на окружности; R — коснитесь, чтобы ввести':'Дуга: тяните концы или ромб на дуге; R — коснитесь, чтобы ввести',true); return; }
    if(it){ const cur=JSON.stringify(it), o=JSON.parse(q.o); for(const k of Object.keys(it)) delete it[k]; Object.assign(it,o); { const now=E.L; if(q.L0!=null) E.L=JSON.parse(q.L0); planHist(); E.L=now; } pushUndo(); for(const k of Object.keys(it)) delete it[k]; Object.assign(it,JSON.parse(cur)); persist(); } E.arc=q.id; skSync(); return; }
  if(!q.moved){ if(q.t==='spp') return; if(q.t==='mv'){ const k=planKey(q.h), j=E.S.findIndex(o=>planKey(o)===k), g0=q.h.k==='l'?skArcOf(E,q.h.i):null; if(j>=0&&g0){ E.S=E.S.filter(o=>!(o.k==='l'&&g0.I.includes(o.i))); } /* the whole arc off */ else if(j>=0){ E.S.splice(j,1); if(q.h.k!=='e') E.S=E.S.filter(o=>!(o.k==='e'&&o.i===q.h.i)); } else { if(q.h.k==='e') E.S=E.S.filter(o=>o.k!=='e'); /* one vertex at a time: a new one replaces the old */ else if(E.k==='s') E.S=[]; /* «Выбор»: one segment — another one replaces it */ E.S.push(q.h); { const g=q.h.k==='l'?skArcOf(E,q.h.i):null; if(g){ if(E.k==='s') E.S=g.I.map(i=>({k:'l',i})); else { E.S=E.S.filter(o=>!(o.k==='l'&&g.I.includes(o.i))); E.S.push(...g.I.map(i=>({k:'l',i}))); } } } } E.arc=null; panelKey=''; syncPanel(); redraw(); } return; }
  const now=E.L, nowS=E.SP; E.L=JSON.parse(q.snap); if(q.snapSP!=null) E.SP=JSON.parse(q.snapSP); planHist(); E.L=now; E.SP=nowS; if(q.t==='cp') E.S=[]; E.acq=[]; panelKey=''; syncPanel(); redraw(); }
const SKN={s:'Выбор',sm:'Выбрать несколько',mv:'Переместить',ln:'Линия',pl:'Полилиния',rc:'Прямоугольник',pgi:'Многоугольник вписанный',pgc:'Многоугольник описанный',ci:'Окружность',a3:'Дуга: начало — конец — радиус',ac:'Дуга из центра и концов',at:'Дуга по касательной',af:'Дуга сопряжения',sp:'Сплайн',pw:'Подобрать стены',pli:'Подобрать линии',pe:'Подобрать края',cp:'Копировать',rot:'Повернуть',mi:'Зеркало: выбрать ось',md:'Зеркало: нарисовать ось',of:'Смещение',tc:'Обрезать до угла',t1:'Обрезать один до границы',tm:'Обрезать несколько до границы',sv:'Разделить',sg:'Разделить с зазором',t:'Обрезать между пересечениями',del:'Удалить'};
const SKS={s:'Выбор',sm:'Несколько',mv:'Переместить',ln:'Линия',pl:'Полилиния',rc:'Прямоуг.',pgi:'Вписанный',pgc:'Описанный',ci:'Окружность',a3:'Нач.–кон.–R',ac:'Из центра',at:'Касательная',af:'Сопряжение',sp:'Сплайн',pw:'Стены',pli:'Линии',pe:'Края',cp:'Копировать',rot:'Повернуть',mi:'Выбрать ось',md:'Нарисовать ось',of:'Смещение',tc:'До угла',t1:'Один',tm:'Несколько',sv:'Разделить',sg:'С зазором',t:'Между пересеч.',del:'Удалить'};
const SKFLY={se:['s','sm'],ln:['ln','pl','rc','pgi','pgc','ci','a3','ac','at','af','sp'],pg:['pgi','pgc'],ar:['a3','ac','at','af'],pk:['pw','pli','pe'],mr:['mi','md'],tr:['tc','t1','tm','sv','sg','t']};
const SKPL={s:'Выбор',sm:'Выбрать несколько',ln:'Линия',pl:'Полилиния',rc:'Прямоугольник',pgi:'Многоуг. вписанный',pgc:'Многоуг. описанный',ci:'Окружность',a3:'Дуга: 3 точки',ac:'Дуга из центра',at:'Дуга по касательной',af:'Дуга сопряжения',sp:'Сплайн'};
const SKFN={se:'Выбор',ln:'Линии',pg:'Многоуг.',ar:'Дуга',pk:'Подобрать',mr:'Зеркало',tr:'Обрезать'};
const SKHINT={s:['касание — выделить один отрезок (другой — заменяет, повторно — снять); тяните точку или линию'],sm:['касание — добавить отрезок, повторно — снять; пусто — снять всё'],mv:['точка захвата: конец или середина отрезка','куда поставить (цифра размера — ввод)'],ln:['начало (касание вершины — магнит)','конец'],pl:['первая точка','следующая точка; касание последней точки — конец'],rc:['первый угол','противоположный угол'],pgi:['центр','вершина'],pgc:['центр','середина стороны'],ci:['центр','радиус (или число)'],
  a3:['начало','конец','точка изгиба'],ac:['центр','начало','конец'],at:['конец линии (дуга продолжит её)','конец дуги'],af:['первая линия','вторая линия','радиус: тяните или введите число'],sp:['точки подряд; касание последней — конец'],pw:['коснитесь стены с нужной стороны'],pli:['коснитесь линии чертежа'],pe:['коснитесь края перекрытия, крыши'],
  cp:['базовая точка','куда'],rot:['центр поворота','опорная точка: луч, от которого считается угол','куда повернуть (касание; цифра угла — ввод)'],mi:['коснитесь линии — ось'],md:['первая точка оси','вторая точка оси'],of:['коснитесь линии с нужной стороны'],tc:['первая линия (часть, что остаётся)','вторая линия'],t1:['граница','линия (часть, что остаётся)'],tm:['граница','линии подряд; пусто — новая граница'],sv:['касание на линии — разделить'],sg:['касание на линии — разрыв'],t:['кусок между пересечениями — удалить'],del:['коснитесь линии']};
const SKPT=new Set(['ln','pl','rc','pgi','pgc','ci','a3','ac','at','sp','md','cp','rot','mv']); /* point-input tools: the finger shows the live point */
const SKNEED={mv:2,ln:2,rc:2,pgi:2,pgc:2,ci:2,a3:3,ac:3,at:2,md:2,cp:2,rot:3};
const SKSEL=new Set(['cp','rot','mi','md']); /* need a selection */
function skAllowed(k,t){ t=t||planEd.t; const c=planEd&&planEd.cfg; if(planEd&&planEd.skv&&(k==='pw'||k==='pli'||(k==='pe'&&!planEd.skv.pick))) return false; /* on another plane only its own edges can be picked */ if(c&&c.open&&['rc','pgi','pgc','ci'].includes(k)) return false; if(c&&c.kind==='stair'&&['a3','ac','at','af','sp'].includes(k)) return false; /* a stair path: straight flights only (its steps are built per straight piece) */ if(t==='x') return ['s','sm','mv','ln','del'].includes(k); if(t==='r'||t==='j') return ['s','sm','mv','ln','pl','cp','rot','mi','md','of','tc','t1','tm','sv','sg','t','del'].includes(k); return true; }
const SKI={s:'<path d="M7 3v15l4-4 3 6 2.5-1-3-6H19z"/>',sm:'<path d="M5 3v12l3-3 2.5 5 2-1-2.5-5H14z"/><rect x="14" y="13" width="7" height="7" rx="1"/><path d="M16 16.5h3M17.5 15v3"/>',mv:'<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',ln:'<path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.8"/><circle cx="19" cy="5" r="1.8"/>',pl:'<path d="M3 18l6-9 5 6 7-10"/>',rc:'<rect x="4" y="6" width="16" height="12" rx="1"/>',
  pgi:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="9" stroke-dasharray="2 2"/>',pgc:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="6.6" stroke-dasharray="2 2"/>',ci:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1"/>',
  a3:'<path d="M4 18A9 9 0 0 1 20 18"/><circle cx="12" cy="9" r="1.4"/>',ac:'<path d="M5 17A8 8 0 0 1 19 9"/><path d="M12 17L19 9" stroke-dasharray="2 2"/>',at:'<path d="M3 18h8"/><path d="M11 18a7 7 0 0 0 7-7V5"/>',af:'<path d="M4 20V12a8 8 0 0 1 8-8h8"/><path d="M4 4v4M4 4h4" stroke-dasharray="2 2"/>',sp:'<path d="M3 17l3-6 3-3 3 1 3 4 3 1 3-6"/>',
  pw:'<path d="M3 9h18M3 15h18"/><path d="M3 9h18" stroke-width="3"/>',pli:'<path d="M4 18L20 6" stroke-dasharray="3 3"/>',pe:'<path d="M4 16l6-10h10l-6 10z"/><path d="M4 16h10" stroke-width="3"/>',
  cp:'<rect x="4" y="8" width="11" height="12" rx="2"/><rect x="9" y="4" width="11" height="12" rx="2"/>',rot:'<path d="M19 8a8 8 0 1 0 1 6"/><path d="M19 3v5h-5"/>',mi:'<path d="M12 3v18" stroke-width="2.6"/><path d="M9 7L3 17h6z"/><path d="M15 7l6 10h-6z" stroke-dasharray="2 2"/>',md:'<path d="M12 3v18" stroke-dasharray="3 2"/><path d="M9 7L3 17h6z"/><path d="M15 7l6 10h-6z"/>',
  of:'<path d="M3 15L15 3"/><path d="M9 21L21 9" stroke-dasharray="3 2"/>',tc:'<path d="M4 20V6h14"/>',t1:'<path d="M18 3v18" stroke-width="2.6"/><path d="M3 12h15"/>',tm:'<path d="M18 3v18" stroke-width="2.6"/><path d="M3 7h15M3 12h15M3 17h15"/>',sv:'<path d="M3 12h7M14 12h7"/><path d="M12 6v12" stroke-dasharray="2 2"/>',sg:'<path d="M3 12h6M15 12h6"/><path d="M9 9v6M15 9v6"/>',
  t:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',del:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',or:'<path d="M4 20V4M4 20h16"/><path d="M4 14h6v6" stroke-width="1.4"/>'};
const skSvg=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SKI[k]||''}</svg>`;
function skState(E){ E.t=E.t||'c'; E.pts=E.pts||[]; E.pick=E.pick||[]; E.opt=E.opt||{n:6,rad:false,R:300,off:500,gap:100,mul:true,keep:true,cpy:false}; E.last=E.last||{se:'s',ln:'pl',pg:'pgi',ar:'a3',pk:'pw',mr:'mi',tr:'tc'}; return E; }
function skSync(){ try{ sweepSkLive(); }catch(e){ console.warn(e); } try{ syncTop(); }catch(_){} panelKey=''; syncPanel(); redraw(); if(planEd&&planEd.skv) planEd.skv.redraw(); }
function skFlyOpen(g){ const E=planEd; if(!E) return; const ok=x=>skAllowed(x,E.t), L=SKFLY[g].filter(ok), btn=panel.querySelector('[data-act="plF"][data-g="'+g+'"]'); if(!btn||!L.length) return;
  popMenu(btn,`<div class="skpl">${L.map(x=>`<button class="skpi" data-k="${x}" aria-pressed="${E.k===x}">${skSvg(x)}<span>${SKPL[x]||SKN[x]}</span></button>`).join('')}</div>`,b=>{ const k=b.dataset.k; if(!planEd||!k) return; skSetTool(k); planEd.fly=null; skSync(); }); }
function skReset(E){ E.pts=[]; E.pick=[]; E.live=null; E.a=null; E.acq=[]; }
function skFinish(){ const E=planEd; if(!E) return; const S=E.S, A=E.arc; skSetTool('s'); E.S=S||[]; E.arc=A||null; E.live=null; E.mvDone=false; skSync(); } /* a finished line forgets its tracking points (no stray «+» left behind) */
function skSetTool(k){ const E=planEd; if(!E||!skAllowed(k)) return; const was=E.k; E.k=k; skReset(E); E.lastMv=null; E.lastI=null; E.mvDone=false; E.mvV=null; if(was!==k) E.acq=[]; if(!SKSEL.has(k)&&k!=='del'&&k!=='s'&&k!=='sm'&&k!=='mv'&&k!=='of') E.S=[];
  for(const g in SKFLY) if(SKFLY[g].includes(k)) E.last[g]=k; if(SKSEL.has(k)&&!(E.S||[]).length&&!(isLnSk(E)&&E.arc)) toast('Сначала выберите линии: «Выбор», затем «'+SKS[k]+'»'); if(was!==k) E.fly=null; }
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
    case 'md': return A?{X:p=>skMir(A,q,p),copy:o.keep,mir:true}:{};
    case 'cp': return A?{X:p=>({x:p.x+q.x-A.x,y:p.y+q.y-A.y}),copy:true}:{};
    case 'mv': return A?{X:p=>({x:p.x+q.x-A.x,y:p.y+q.y-A.y}),mv:true}:{};
    case 'rot': { const C=A; if(!C||P.length<2) return {}; const R=P[1], an=skRotAng(C,R,q); return {X:p=>skRotP(C,an,p),copy:o.cpy,ang:an,C,R}; } /* centre → a point of the reference ray → where it turns to */
  } return {S:[]}; }
function skAdd(S,t){ const E=planEd, ly=isLnSk(E)?{ly:E.cfg.ly}:{}; let n=0; for(const [A,B] of S){ if(skL(skV(A,B))<1) continue; E.L.push({a:skR3(A),b:skR3(B),t:t||E.t,...ly}); n++; } return n; }
function skApplyX(G){ const E=planEd, I=skSelLines(), J=skSelSp(), AR=isLnSk(E)?lnArcSel():null; if((!I.length&&!J.length&&!AR)||!G.X) return; planHist(); E.SP=E.SP||[];
  if(AR){ /* a true arc / circle of «Линии» moves, turns and mirrors with the rest (a mirror runs the arc the other way) */ const Lv=doc.levels[E.cfg.li], T=G.copy?JSON.parse(JSON.stringify(AR)):AR; if(G.copy){ T.id=uid(); Lv.items.push(T); E.cfg.extra.add(T.id); }
    if(T.t==='circ') T.c=skR3(G.X(T.c)); else { T.a=skR3(G.X(T.a)); T.b=skR3(G.X(T.b)); if(G.mir) T.bg=-T.bg; } E.arc=T.id; pushUndo(); persist(); }
  if(G.copy){ const N=I.map(i=>{ const l=E.L[i]; return {...l,a:skR3(G.X(l.a)),b:skR3(G.X(l.b))}; }), M=J.map(j=>({...E.SP[j],p:E.SP[j].p.map(q=>skR3(G.X(q)))})); const s0=E.L.length, t0=E.SP.length; E.L.push(...N); E.SP.push(...M); E.S=N.map((_,k)=>({k:'l',i:s0+k})).concat(M.map((_,k)=>({k:'sp',i:t0+k}))); }
  else { const old=[]; if(G.mv){ for(const i of I) old.push({...E.L[i].a},{...E.L[i].b}); for(const j of J){ const P=E.SP[j].p; if(!E.SP[j].cl&&P.length) old.push({...P[0]},{...P[P.length-1]}); } }
    for(const i of I){ const l=E.L[i]; l.a=skR3(G.X(l.a)); l.b=skR3(G.X(l.b)); } for(const j of J) E.SP[j].p=E.SP[j].p.map(q=>skR3(G.X(q)));
    /* «Переместить» tears the taken segments out: lines that met them stay where they are (dragging in «Выбор» pulls them instead) */ } }
function skFrom(){ const E=planEd, k=E.k, n=E.pts.length; if(!n) return null; if(k==='rc'||k==='pgi'||k==='pgc'||k==='ci'||(k==='a3'&&n===2)||(k==='ac'&&n===2)||k==='rot') return null; return E.pts[n-1]; }
function skSnap(sx,sy){ return planSnap(sx,sy,skFrom()); }
function skPoint(q){ const E=planEd, k=E.k;
  if(SKSEL.has(k)&&!skSelLines().length&&!skSelSp().length&&!(isLnSk(E)&&E.arc)){ toast('Сначала выберите линии: «Выбор»'); return; }
  if(k==='af'){ if(E.pick.length<2) return; const [p1,p2]=E.pick, l1=E.L[p1.i], l2=E.L[p2.i]; if(!l1||!l2){ E.pick=[]; skSync(); return; } const G0=skFilletGeo(l1,p1.w,l2,p2.w,0); if(G0.err){ toast('Не соответствует: '+G0.err); return; } skFillet(skFilletR(G0,q)); return; }
  if(k==='at'&&!E.pts.length&&!skTanAt(q)){ toast('Начните дугу с конца линии — она продолжит её по касательной'); return; }
  if(k==='pl'){ const n=E.pts.length; if(n&&skL(skV(E.pts[n-1],q))<50){ skReset(E); skSync(); return; }
    if(n){ planHist(); skAdd([[E.pts[n-1],q]]); E.lastI=E.L.length-1; if(E.opt.rad&&n>=2&&!(E.cfg&&E.cfg.kind==='stair')){ skFilletLast(); E.lastI=null; } if(n>=2&&skL(skV(E.pts[0],q))<1){ skReset(E); skSync(); return; } } E.pts.push(q); E.a=q; skSync(); return; }
  if(k==='sp'){ const n=E.pts.length; if(n&&skL(skV(E.pts[n-1],q))<50){ skSplineDone(false); return; } if(n>=3&&skL(skV(E.pts[0],q))<1){ skSplineDone(true); return; } E.pts.push(q); skSync(); return; }
  E.pts.push(q); if(E.pts.length<(SKNEED[k]||2)){ skSync(); return; }
  const P=E.pts.slice(0,-1), G=skGen(k,P,q);
  if(isLnSk(E)&&E.t==='x'&&k==='ln'){ pushUndo(); const id=uid(); doc.levels[E.cfg.li].items.push({id,t:'aux',a:skR3(P[0]),b:skR3(q)}); E.cfg.extra.add(id); persist(); skReset(E); skSync(); return; }
  if(isLnSk(E)&&G.S&&G.S.length&&(k==='ci'||k==='a3'||k==='ac'||k==='at')){ lnTrue(k,P,q,G); skReset(E); skSync(); return; }
  if(G.X){ skApplyX(G); if(k==='cp'&&E.opt.mul){ E.pts=[P[0]]; skSync(); return; } skReset(E); skFinish(); return; } /* move / copy / rotate / mirror done — the command ends */
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
  planHist(); skEndTo(l1,G.P,G.u1,G.T1); skEndTo(l2,G.P,G.u2,G.T2); skAdd(skChain(G.arc),l1.t); skReset(E); E.S=[]; skFinish(); toast('Сопряжение R '+fmtU(R)); }
function skTapLine(sx,sy){ const E=planEd, k=E.k, w=toW(sx,sy), i=planLineAt(sx,sy), l=i>=0?E.L[i]:null;
  const need=()=>{ toast('Коснитесь линии эскиза'); };
  if(k==='af'){ if(!l) return need(); if(E.pick.length&&E.pick[0].i===i) return; E.pick.push({i,w}); if(E.pick.length===2){ const G=skFilletGeo(E.L[E.pick[0].i],E.pick[0].w,l,w,0); if(G.err){ toast('Не соответствует: '+G.err); E.pick=[]; } } skSync(); return; }
  if(k==='tc'){ if(!l) return need(); if(E.pick.length&&E.pick[0].i===i) return; E.pick.push({i,w}); if(E.pick.length<2){ skSync(); return; }
    const [p1,p2]=E.pick, l1=E.L[p1.i], l2=E.L[p2.i], d1=skU(skV(l1.a,l1.b)), d2=skU(skV(l2.a,l2.b)), P=skX(l1.a,d1,l2.a,d2); E.pick=[]; if(!P){ toast('Не соответствует: линии параллельны'); skSync(); return; }
    planHist(); skTrimTo(l1,P,p1.w); skTrimTo(l2,P,p2.w); E.S=[]; skFinish(); return; }
  if(k==='t1'||k==='tm'){ if(!E.pick.length){ if(!l) return need(); E.pick=[{i,w}]; skSync(); return; } if(!l){ if(k==='tm'){ E.pick=[]; skSync(); } else need(); return; } if(i===E.pick[0].i) return;
    const b=E.L[E.pick[0].i], P=skX(b.a,skU(skV(b.a,b.b)),l.a,skU(skV(l.a,l.b))); if(!P){ toast('Не соответствует: линия параллельна границе'); return; } planHist(); skTrimTo(l,P,w); if(k==='t1'){ E.pick=[]; E.S=[]; skFinish(); return; } skSync(); return; } /* «по одной» ends; «подряд» goes on by design */
  if(k==='sv'||k==='sg'){ if(!l) return need(); const v=skV(l.a,l.b), L2=v.x*v.x+v.y*v.y||1, len=Math.sqrt(L2), t=((w.x-l.a.x)*v.x+(w.y-l.a.y)*v.y)/L2, g=k==='sg'?Math.max(1,E.opt.gap)/len/2:0;
    if(t-g<=0.001||t+g>=0.999){ toast('Слишком близко к концу линии'); return; } planHist(); const at=s=>skR3(skAddP(l.a,v,s)); E.L.splice(i,1,{...l,b:at(t-g)},{...l,a:at(t+g)}); E.S=[]; skFinish(); return; }
  if(k==='of'){ if(!l) return need(); const u=skU(skV(l.a,l.b)), n={x:-u.y,y:u.x}, s=((w.x-l.a.x)*n.x+(w.y-l.a.y)*n.y)>=0?1:-1, d=E.opt.off*s; if(!(E.opt.off>0)){ toast('Задайте расстояние смещения'); return; }
    planHist(); E.L.push({...l,a:skR3(skAddP(l.a,n,d)),b:skR3(skAddP(l.b,n,d))}); E.S=[{k:'l',i:E.L.length-1}]; skFinish(); return; }
  if(k==='mi'){ if(!skSelLines().length&&!(isLnSk(E)&&E.arc)){ toast('Сначала выберите линии: «Выбор»'); return; } let ax=l&&!skSelLines().includes(i)?[l.a,l.b]:null;
    if(!ax){ const g=skGeoPick(sx,sy,s=>true); if(g) ax=[g.a,g.b]; } if(!ax){ toast('Коснитесь линии — оси зеркала'); return; } skApplyX({X:p=>skMir(ax[0],ax[1],p),copy:E.opt.keep,mir:true}); skFinish(); return; }
  if(k==='del'){ if(!l&&isLnSk(E)){ const it=lnArcHit(sx,sy); if(it){ const L=doc.levels[E.cfg.li]; planHist(); pushUndo(); L.items.splice(L.items.indexOf(it),1); E.arc=null; persist(); skSync(); return; } /* id stays in cfg.extra: undo may bring it back and ✕ must still drop it */ }
    if(!l){ const j=skSplineAt(sx,sy); if(j<0) return need(); planHist(); E.SP.splice(j,1); E.S=[]; skSync(); return; } planHist(); E.L.splice(i,1); E.S=[]; E.lastI=null; skSync(); return; }
  if((k==='pw'||k==='pli'||k==='pe')&&SKV){ const g=SKV.pick?SKV.pick(sx,sy):null; if(!g){ toast('Коснитесь края в плоскости эскиза (грань проёма, угол объекта)'); return; } planHist(); skAdd([[g.a,g.b]]); skSync(); return; } /* on a face: edges of the model in the sketch plane */
  if(k==='pw'||k==='pli'||k==='pe'){ const f=k==='pw'?s=>s.it&&isWall(s.it)&&s.k==='face':k==='pli'?s=>s.it&&s.it.t==='line'&&!isWall(s.it):s=>s.it&&s.k==='face'&&!isWall(s.it); const g=skGeoPick(sx,sy,f);
    if(!g){ toast(k==='pw'?'Коснитесь стены с нужной стороны':k==='pli'?'Коснитесь линии чертежа':'Коснитесь края перекрытия или крыши'); return; } planHist(); skAdd([[g.a,g.b]]); skSync(); return; } }
function skTrimTo(l,P,w){ const d=skU(skV(l.a,l.b)), s=e=>(e.x-P.x)*d.x+(e.y-P.y)*d.y, sw=s(w), sa=s(l.a), sb=s(l.b), opp=e=>(s(e)>0)!==(sw>0)&&Math.abs(s(e))>1e-6;
  /* the end on the far side of the corner, else the nearer one, moves to the corner */ if(opp(l.a)&&!opp(l.b)) l.a=skR3(P); else if(opp(l.b)&&!opp(l.a)) l.b=skR3(P); else if(Math.abs(sa)<Math.abs(sb)) l.a=skR3(P); else l.b=skR3(P); }
function skGeoPick(sx,sy,f){ let G; try{ G=snapGeoAll(planEd.id?new Set([planEd.id]):undefined); }catch(e){ return null; } let best=null, bd=18; for(const s of G.segs){ if(!s.a||!s.b||!f(s)) continue; const d=segDist(sx,sy,toS(s.a),toS(s.b)); if(d<bd){ bd=d; best=s; } } return best; }
function skTyped(v){ /* a number typed while drawing: length, radius or angle */ const E=planEd, k=E.k, n=E.pts.length; if(!(isFinite(v)&&v>0)){ toast('Не соответствует: нужно число больше 0'); return; }
  if(k==='af'&&E.pick.length===2){ skFillet(v); return; }
  if((k==='ln'||k==='pl')&&n){ const A=E.pts[n-1], tgt=E.ld&&skL(skV(A,E.ld))>1?E.ld:null, prev=E.L.length?E.L[E.L.length-1]:null; let d=tgt?skU(skV(A,tgt)):prev?skU(skV(prev.a,prev.b)):{x:1,y:0};
    if(E.cfg&&E.cfg.kind==='prof'&&E.opt.ah!=null){ const a=E.opt.ah*Math.PI/180, sx=(tgt?Math.sign(tgt.x-A.x):0)||1; d={x:Math.cos(a)*sx,y:Math.sin(a)}; } /* profile: the angle from the horizontal */
    skPoint(skR3(skAddP(A,d,v))); return; }
  if(k==='ci'&&n===1){ skPoint(skR3({x:E.pts[0].x+v,y:E.pts[0].y})); return; }
  if((k==='mv'||k==='cp')&&n===1){ const A=E.pts[0], tgt=E.ld&&skL(skV(A,E.ld))>1?E.ld:null; if(!tgt){ toast('Покажите направление пальцем или курсором, затем число'); return; } skPoint(skR3(skAddP(A,skU(skV(A,tgt)),v))); return; }
  if(k==='rot'){ const C=E.pts[0]||skCentroid(); if(!C){ toast('Сначала выберите линии'); return; } let sg=1; if(E.pts.length>=2&&E.ld){ const a=skRotAng(C,E.pts[1],E.ld); if(a<0) sg=-1; } const an=sg*v*Math.PI/180; skApplyX({X:p=>skRotP(C,an,p),copy:E.opt.cpy}); skReset(E); skFinish(); return; } /* the typed angle turns the way the finger shows */
  toast('Сначала поставьте первую точку'); }
function skMvAgain(v){ const E=planEd, M=E&&E.lastMv; if(!M) return; if(!(v>0)){ toast('Не соответствует: нужно число больше 0'); return; } const L0=skL(skV(M.A,M.B)); if(L0<1) return; const d=skU(skV(M.A,M.B)), dv=v-L0; if(Math.abs(dv)<0.5) return; skApplyX({X:p=>({x:p.x+d.x*dv,y:p.y+d.y*dv}),mv:true}); M.B=skR3(skAddP(M.A,d,v)); skSync(); toast('Перемещено на '+fmtU(v)); }
function skTypedR(v){ const E=planEd, k=E.k; if(!(v>0)){ toast('Не соответствует: радиус больше 0'); return; } if(E.pts.length!==1) return; const c=E.pts[0], d=E.ld&&skL(skV(c,E.ld))>1?skU(skV(c,E.ld)):{x:1,y:0}; skPoint(skR3(skAddP(c,d,v))); }
function skOpt(t){ const E=planEd, o=E.opt, id=t.id, v=t.type==='checkbox'?t.checked:parseNum(String(t.value).replace('−','-'));
  if(id==='skRad'){ o.rad=v; } else if(id==='skMul'){ o.mul=v; } else if(id==='skKeep'){ o.keep=v; } else if(id==='skCpy'){ o.cpy=v; }
  else if(id==='skR'){ if(v>0) o.R=v; else toast('Не соответствует: радиус больше 0'); } else if(id==='skN'){ if(v>=3&&v<=64) o.n=Math.round(v); else toast('Не соответствует: сторон 3…64'); }
  else if(id==='skOff'){ if(v>0) o.off=v; else toast('Не соответствует: расстояние больше 0'); } else if(id==='skGap'){ if(v>0) o.gap=v; else toast('Не соответствует: зазор больше 0'); }
  else if(id==='skAH'){ const raw=String(t.value).trim(); if(raw===''){ delete o.ah; } else if(isFinite(v)&&v>=-90&&v<=90) o.ah=v; else toast('Не соответствует: угол от горизонта −90…90°'); }
  else if(id==='skLen'||id==='skFR'||id==='skAng'||id==='skCR'){ skTyped(v); return; }
  else if(id==='skZ'){ if(isFinite(v)&&Math.abs(v)<=100000&&E.cfg) E.cfg.z=v; else toast('Не соответствует: низ ±100000 мм'); }
  else if(id==='skSR'||id==='skSW'||id==='skSH'||id==='skSZ'){ const T=E.cfg&&E.cfg.tgt; if(!T) return; const S=T.sec||(T.sec={k:'circ',r:50}); if(id==='skSZ'){ if(isFinite(v)&&Math.abs(v)<=100000) T.z0=r1(v); else toast('Не соответствует: низ ±100000 мм'); } else if(!(v>=1&&v<=100000)) toast('Не соответствует: размер сечения 1…100000 мм'); else if(id==='skSR') S.r=r1(S.k==='circ'?v/2:v); else if(id==='skSW') S.w=r1(v); else S.h=r1(v); sweepSkTouch(); return; }
  else if(/^skP[ODTBLR]$/.test(id)&&EV.psk){ const K=EV.psk; pskVals(K); const k={skPO:'off',skPD:'dep',skPT:'th',skPB:'bo',skPL:'ovL',skPR:'ovR'}[id]; if(k==='bo'&&!isFinite(v)){ K.v.bo=null; return; } /* empty «Низ» — as drawn */ if(!isFinite(v)){ toast('Введите число в мм'); return; }
    if(k==='dep'&&!(v>=100)){ toast('Не соответствует: глубина не меньше 100 мм'); return; } if(k==='th'&&!(v>=50&&v<=1000)){ toast('Не соответствует: толщина крыши 50…1000 мм'); return; } if((k==='ovL'||k==='ovR')&&!(v>=0&&v<=5000)){ toast('Не соответствует: свес 0…5000 мм'); return; } K.v[k]=r1(v); return; }
  else if(id==='skExD'){ if(PDS&&PDS.k==='ext'&&isFinite(v)&&v>=1&&v<=100000){ PDS.depth=r1(v); extDef().depth=PDS.depth; } else toast('Не соответствует: глубина 1…100000 мм'); }
  skSync(); }
function planUndo(){ const E=planEd; if(!E) return false; if(E.pts&&E.pts.length){ E.pts.pop(); E.a=E.pts.length?E.pts[E.pts.length-1]:null; E.live=null; } else if(E.pick&&E.pick.length){ E.pick.pop(); } else if(E.H.length){ skHistPop(E); E.S=[]; E.lastI=null; } else { toast('Нечего отменять'); } skSync(); return true; }
function planDown(p){ const E=planEd, m=E.k;
  if(E.fly){ const pm=document.getElementById('popMenu'); E.fly=null; if(pm&&!pm.hidden){ pm.hidden=true; skSync(); if(m!=='s'&&m!=='sm') return {plN:true}; } } /* with «Выбор» the tap that closes the list also selects the line under it; a drawing tool only closes it */
  /* a size on the screen: tap — type the exact value; a size that rides with the cursor never takes a click aimed at the point itself */ const lvS=E.live?toS(E.live):null, lh=(E.lh||[]).find(h=>{ const d=Math.hypot(h.x-p.x,h.y-p.y); return d<24&&!(h.lv&&lvS&&Math.hypot(lvS.x-p.x,lvS.y-p.y)<=d); }); if(lh){ openInline({kind:'sk',id:null,w:toW(lh.x,lh.y),val:lh.val,fn:lh.fn}); return {plN:true}; }
  if(m==='mv'&&E.mvDone){ const hit=skSelLines().some(i=>{ const l=E.L[i]; if(!l) return false; const a=toS(l.a), b=toS(l.b); return segDist(p.x,p.y,a,b)<16; }); E.mvDone=false; if(!hit){ E.S=[]; E.lastMv=null; skSetTool('s'); return {plN:true}; } } /* after a move: a tap beside the moved segment ends «Переместить» */
  if(m==='mv'&&!skSelLines().length&&!skSelSp().length) return null; /* nothing taken yet: the tap picks the segment, no point yet */
  if(SKPT.has(m)||(m==='af'&&E.pick.length===2)){ E.live=skSnap(p.x,p.y); E.ld=E.live; skAcq(E.live); redraw(); return {plL:true}; }
  if(m!=='s'&&m!=='sm') return null; const snapSP=JSON.stringify(E.SP||[]);
  /* control points of a selected spline */ for(const j of skSelSp()){ const P=E.SP[j].p; for(let k=0;k<P.length;k++){ const q=toS(P[k]); if(Math.hypot(q.x-p.x,q.y-p.y)<16) return {plD:{t:'spp',j,k,w0:toW(p.x,p.y),snap:JSON.stringify(E.L),snapSP}}; } }
  if((m==='s'||m==='sm')&&E.tdH) for(const h of E.tdH){ if(Math.hypot(h.x-p.x,h.y-p.y)<16) return {plD:{t:'tdr',i:h.i,key:h.key,w0:toW(p.x,p.y)}}; } /* the round end of a temporary size: drag — another anchor, tap — automatic */
  { const g=skArcSel(E); if(g){ for(const hh of skArcH(g)){ const q=toS(hh.p); if(Math.hypot(q.x-p.x,q.y-p.y)<16) return {plD:{t:'arcg',g,k:hh.k,w0:toW(p.x,p.y),snap:JSON.stringify(E.L),snapSP}}; }
    /* the body of the selected arc: the whole arc moves (its neighbours' ends follow), as an arc in «Линии» does */ if(!g.closed&&g.I.some(i=>{ const l=E.L[i], a=toS(l.a), b=toS(l.b); return segDist(p.x,p.y,a,b)<14; })) return {plD:{t:'arcg',g,k:'body',w0:toW(p.x,p.y),snap:JSON.stringify(E.L),snapSP}}; } }
  if(isLnSk(E)){ const A=lnArcSel(); if(A) for(const hh of lnArcH(A)){ const q=toS(hh.p); if(Math.hypot(q.x-p.x,q.y-p.y)<16) return {plD:{t:'arc',id:A.id,k:hh.k,o:JSON.stringify(A),m0:A.t!=='circ'?arcAt(arcG(A),0.5):null,w0:toW(p.x,p.y)}}; } }
  const h=planHit(p.x,p.y); if(!h){ if(isLnSk(E)){ const it=lnArcHit(p.x,p.y); if(it) return {plD:{t:'arc',id:it.id,k:'body',o:JSON.stringify(it),w0:toW(p.x,p.y)}}; } return null; } return {plD:{t:'mv',h,w0:toW(p.x,p.y),snap:JSON.stringify(E.L),snapSP}}; }
function planLiveMove(p){ const E=planEd; if(!E) return; if(E.k==='mv'&&(E.mvDone||!skSelLines().length&&!skSelSp().length)){ if(E.live){ E.live=null; redraw(); } return; } if(SKPT.has(E.k)||(E.k==='af'&&E.pick.length===2)){ E.live=skSnap(p.x,p.y); E.ld=E.live; skAcq(E.live); redraw(); } }
function planTap(sx,sy,pt){ const E=planEd, m=E.k; E.live=null;
  if(m==='s'||m==='sm'){ E.S=[]; E.arc=null; skSync(); return; }
  /* Переместить with nothing selected: the touched segment is taken */
  if(m==='mv'&&!skSelLines().length&&!skSelSp().length){ const sp=pt?toS(pt):{x:sx,y:sy}, i=planLineAt(sp.x,sp.y); if(i>=0){ E.S=[{k:'l',i}]; toast('Переместить: базовая точка — конец или середина отрезка'); } else toast('Коснитесь отрезка — или выберите несколько: «Выбор ▾»'); skSync(); return; }
  if(pt||SKPT.has(m)||(m==='af'&&E.pick.length===2)){ skPoint(pt||skSnap(sx,sy)); return; }
  if(m==='t'){ /* trim: the piece between the neighbouring crossings goes */ const i=planLineAt(sx,sy); if(i<0){ toast('Коснитесь куска линии, который надо убрать'); return; } const l=E.L[i], w=toW(sx,sy), v={x:l.b.x-l.a.x,y:l.b.y-l.a.y}, l2=v.x*v.x+v.y*v.y||1, tw=((w.x-l.a.x)*v.x+(w.y-l.a.y)*v.y)/l2, T=[0,1];
    E.L.forEach((o,j)=>{ if(j===i) return; const A=o.a,B=o.b, e={x:B.x-A.x,y:B.y-A.y}, den=v.x*e.y-v.y*e.x; if(Math.abs(den)<1e-9) return; const t=((A.x-l.a.x)*e.y-(A.y-l.a.y)*e.x)/den, u=((A.x-l.a.x)*v.y-(A.y-l.a.y)*v.x)/den; if(t>1e-4&&t<1-1e-4&&u>=-1e-4&&u<=1+1e-4) T.push(t); });
    T.sort((x,y)=>x-y); let t0=0,t1=1; for(let k=0;k+1<T.length;k++) if(tw>=T[k]&&tw<=T[k+1]){ t0=T[k]; t1=T[k+1]; } const at=t=>({x:r3(l.a.x+v.x*t),y:r3(l.a.y+v.y*t)}); planHist();
    const keep=[]; if(t0>1e-4) keep.push({...l,b:at(t0)}); if(t1<1-1e-4) keep.push({...l,a:at(t1)}); E.L.splice(i,1,...keep); E.S=[]; skFinish(); return; }
  skTapLine(sx,sy); }
function planDel(){ const E=planEd, S=E.S||[]; if(isLnSk(E)&&E.arc&&!S.length){ const it=lnArcSel(), L=doc.levels[E.cfg.li]; if(it&&L){ planHist(); pushUndo(); L.items.splice(L.items.indexOf(it),1); persist(); } E.arc=null; skSync(); toast(it&&it.t==='circ'?'Окружность удалена':'Дуга удалена'); return; } if(!S.length){ skSetTool('del'); skSync(); toast('Удалить: коснитесь линии'); return; } planHist(); const del=new Set(S.filter(o=>o.k!=='sp').map(o=>o.i)), dS=new Set(skSelSp()); E.L=E.L.filter((_,i)=>!del.has(i)); E.SP=(E.SP||[]).filter((_,j)=>!dS.has(j)); E.S=[]; E.lastI=null; skSync(); }
function planPanel(){ const E=skState(planEd), S=E.S||[], k=E.k, t=E.t, ok=x=>skAllowed(x,t);
  const B=(key,lbl,on,act)=>`<button class="skb" data-act="${act||'plK'}" data-k="${key}" aria-pressed="${!!on}" title="${SKN[key]||lbl}">${skSvg(key)}<span>${lbl}</span></button>`;
  const F=g=>{ const L=SKFLY[g].filter(ok); if(!L.length) return ''; const cur=L.includes(E.last[g])?E.last[g]:L[0]; return `<button class="skb skf" data-act="plF" data-g="${g}" data-k="${cur}" aria-pressed="${L.includes(k)}" aria-expanded="${E.fly===g}" title="${SKN[cur]} · список — уголок ◢ или долгое нажатие">${skSvg(cur)}<span>${g==='se'||g==='ln'?SKS[cur]:SKFN[g]}</span><i></i></button>`; };
  const grp=(cap,h)=>h?`<div class="skg"><b>${cap}</b><div>${h}</div></div>`:'', sep='<span class="sksep"></span>';
  const draw=F('ln')+F('pk');
  const mod=B('cp',SKS.cp,k==='cp')+B('rot',SKS.rot,k==='rot')+F('mr')+B('of',SKS.of,k==='of')+F('tr')+`<button class="skb skdel" data-act="plDel" data-k="del" aria-pressed="${k==='del'}" title="Удалить выбранное; без выбора — касание линии">${skSvg('del')}<span>Удалить</span></button>`;
  const ti=(x,n,c,d)=>`<button data-act="plT" data-t="${x}" aria-pressed="${t===x}"><i style="border-top:3px ${d?'dashed':'solid'} ${c}"></i>${n}</button>`;
  const steps=SKHINT[k]||[''], st=['af','tc','t1','tm'].includes(k)?E.pick.length:E.pts.length, hint=k==='mv'&&E.mvDone?'перенесено · касание выделенного — ещё раз, мимо — выход':k==='mv'&&!skSelLines().length&&!skSelSp().length?'коснитесь отрезка, который переносим':steps[Math.min(st,steps.length-1)];
  const num=(id,l,v,ph)=>`<label class="skin">${l}<input id="${id}" inputmode="decimal" value="${v==null?'':v}" placeholder="${ph||''}" autocomplete="off"></label>`, chk=(id,l,v)=>`<label class="skin"><input type="checkbox" id="${id}"${v?' checked':''}>${l}</label>`, o=E.opt;
  let inp=''; if(k==='ln'||k==='pl') inp=num('skLen','Длина','','мм')+(E.cfg&&E.cfg.kind==='prof'?num('skAH','∠ от гор.',o.ah,'—'):'')+(k==='pl'&&!(E.cfg&&E.cfg.kind==='stair')?chk('skRad','Радиус',o.rad)+(o.rad?num('skR','R',o.R):''):''); else if(k==='rc') inp=chk('skRad','Радиус углов',o.rad)+(o.rad?num('skR','R',o.R):''); else if(k==='pgi'||k==='pgc') inp=num('skN','Стороны',o.n); else if(k==='ci') inp=num('skCR','Радиус','','мм'); else if(k==='af') inp=num('skFR','Радиус','','мм');
  else if(k==='cp') inp=chk('skMul','Несколько копий',o.mul); else if(k==='mv') inp=num('skLen','Длина','','мм'); else if(k==='rot') inp=num('skAng','Угол, °','','')+chk('skCpy','Копия',o.cpy); else if(k==='mi'||k==='md') inp=chk('skKeep','Оставить исходное',o.keep); else if(k==='of') inp=num('skOff','Расстояние',o.off); else if(k==='sg') inp=num('skGap','Зазор',o.gap);
  const busy=E.pts.length||E.pick.length;
  const C=E.cfg, head=C&&C.kind==='lines'?`<div class="skt" role="group" aria-label="Тип линии">${ti('l','Линия','#9aa5b1')}${ti('x','Конструкц.','#5c7cfa',1)}</div>`:C?`<span class="skh"><b>${C.title}</b></span>${C.kind==='rail'?`<div class="skt" role="group" aria-label="Низ ограждения"><button data-act="plRB" data-b="lv" aria-pressed="${C.base!=='slab'}">На уровне</button><button data-act="plRB" data-b="slab" aria-pressed="${C.base==='slab'}">На перекрытии</button></div>${C.base!=='slab'?num('skZ','Низ',r1(C.z||0)):''}`:''}`:`<div class="skt" role="group" aria-label="Тип линии">${ti('c','Контур','#9aa5b1')}${ti('r','Конёк','#d63fd6')}${ti('j','Стык','#2fae5a',1)}</div>`;
  const opts=`<div class="skrow">${head}<span class="skok"><button class="ibn okb" data-act="plDone" title="${E.cfg?'Готово':'Построить крышу'}" aria-label="${E.cfg?'Готово':'Построить крышу'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button><button class="ibn cxb" data-act="plQuit" title="Выйти без изменений" aria-label="Выйти без изменений"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></div><div class="skrow skwr">${C&&C.kind==='lines'?`<div class="skt" role="group" aria-label="Слой линий">${[['misc','Прочее'],['open','Проёмы']].map(([k2,n2])=>`<button data-act="plLy" data-ly="${k2}" aria-pressed="${C.ly===k2}">${n2}</button>`).join('')}</div>`:''}<span class="skh"><b>${SKN[k]||''}</b>${hint?': '+hint:''}${S.length?(skArcSel(E)?' · выбрана дуга: тяните концы или ◇, R — коснитесь':' · выбрано: '+S.length):''}</span>${inp}${busy?`<button class="btn" data-act="plCancel">${k==='sp'?'Закончить сплайн':'Закончить'}</button>`:''}</div>${C&&C.kind==='ext'?extSkRow():C&&C.kind==='sweep'?sweepSkRow():C&&C.kind==='sec'?secSkRow():C&&C.kind==='prof'?pskRow():''}`;
  const fly=''; /* the lists open as a vertical pop-up over the drawing (skFlyOpen) */
  const dock=`<div class="skdock">${grp('ВЫБОР',F('se')+B('mv',SKS.mv,k==='mv'))}${sep}${grp('РИСОВАТЬ',draw)}${sep}${grp('ИЗМЕНИТЬ',mod)}${sep}${grp('РЕЖИМ',`${isLnSk(E)?`<button class="skb" data-act="lnSt" title="Стиль линии: цвет, тип, толщина"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/></svg><span>Стиль</span></button>`:''}<button class="skb" data-act="plOr" aria-pressed="${axisMode==='ortho'}" title="Орто: 0° / 45° / 90° и пунктир от вершин">${skSvg('or')}<span>Орто</span></button>`)}
    </div>`;
  return `<div class="skw">${opts}${fly}${dock}</div>`; }
function lnArcItems(){ const c=planEd&&planEd.cfg, L=c&&doc.levels[c.li]; return L?L.items.filter(i=>(i.t==='line'&&i.bg&&!isWall(i)&&!(i.w>0))||i.t==='circ'):[]; }
function lnArcSel(){ const E=planEd; return E&&E.arc?lnArcItems().find(i=>i.id===E.arc)||null:null; }
function lnArcHit(sx,sy){ let best=null, bd=14; const w=toW(sx,sy); for(const it of lnArcItems()){ let q; if(it.t==='circ'){ const d=Math.hypot(w.x-it.c.x,w.y-it.c.y)||1; q={x:it.c.x+(w.x-it.c.x)/d*it.r,y:it.c.y+(w.y-it.c.y)/d*it.r}; } else { const G=arcG(it); q=arcAt(G,arcProj(G,w).t); } const s2=toS(q), d=Math.hypot(s2.x-sx,s2.y-sy); if(d<bd){ bd=d; best=it; } } return best; }
function lnArcH(it){ if(it.t==='circ') return [{k:'c',p:it.c},{k:'r',p:{x:it.c.x+it.r,y:it.c.y}}]; return [{k:'a',p:it.a},{k:'b',p:it.b},{k:'m',p:arcAt(arcG(it),0.5)}]; }
function lnArcR(it,v){ if(!(v>0)){ toast('Не соответствует: радиус больше 0'); return; } planHist(); pushUndo(); if(it.t==='circ') it.r=r3(v); else { const ch=Math.hypot(it.b.x-it.a.x,it.b.y-it.a.y); if(v<ch/2-0.5){ undoS.pop(); planEd.H.pop(); toast('Не соответствует: радиус не меньше половины расстояния между концами ('+fmtU(ch/2)+')',true); return; } const G=arcG(it); let sw=2*Math.asin(Math.min(1,ch/(2*v))); if(Math.abs(G.sw)>Math.PI) sw=2*Math.PI-sw; it.bg=Math.tan((it.bg<0?-1:1)*sw/4); } persist(); skSync(); }
function lnArcDraw(E){ const it=lnArcSel(); if(!it){ E.arc=null; return; } ctx.save(); ctx.strokeStyle='#4c9aff'; ctx.lineWidth=10; ctx.globalAlpha=.45; ctx.beginPath();
  const P=it.t==='circ'?Array.from({length:73},(_,k)=>({x:it.c.x+Math.cos(k*Math.PI/36)*it.r,y:it.c.y+Math.sin(k*Math.PI/36)*it.r})):arcPts(arcG(it),0,0,1,64); P.map(toS).forEach((q,k)=>k?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.stroke(); ctx.restore();
  for(const h of lnArcH(it)){ const q=toS(h.p); ctx.save(); ctx.fillStyle='#fff'; ctx.strokeStyle='#2563eb'; ctx.lineWidth=2.5; ctx.beginPath(); if(h.k==='m'||h.k==='r'){ ctx.moveTo(q.x,q.y-7); ctx.lineTo(q.x+7,q.y); ctx.lineTo(q.x,q.y+7); ctx.lineTo(q.x-7,q.y); ctx.closePath(); } else ctx.arc(q.x,q.y,6,0,7); ctx.fill(); ctx.stroke(); ctx.restore(); }
  const r=it.t==='circ'?it.r:arcG(it).r, M=it.t==='circ'?{x:it.c.x,y:it.c.y-it.r}:arcAt(arcG(it),0.5), C=it.t==='circ'?it.c:arcG(it).c, m=toS(M), c=toS(C), d=Math.hypot(m.x-c.x,m.y-c.y)||1, at={x:m.x+(m.x-c.x)/d*26,y:m.y+(m.y-c.y)/d*26};
  tmpBox('R '+fmtU(r),at.x,at.y,0,true); E.lh.push({x:at.x,y:at.y,val:r3(r),fn:v=>lnArcR(it,v)}); }
function skArcGroups(E){ const key=JSON.stringify(E.L.map(l=>[l.a.x,l.a.y,l.b.x,l.b.y,l.t])); if(E._agK===key) return E._ag; const G=[]; E._agK=key; E._ag=G;
  const K=p=>Math.round(p.x)+','+Math.round(p.y), V=new Map(); E.L.forEach((l,i)=>{ if(l.t==='r'||l.t==='j') return; for(const e of ['a','b']){ const k=K(l[e]); if(!V.has(k)) V.set(k,[]); V.get(k).push(i); } });
  const used=new Set(), other=(i,k)=>{ const l=E.L[i]; return K(l.a)===k?'b':'a'; };
  const walk=(i0)=>{ /* the maximal chain through vertices met by exactly two lines of the same type */ const t=E.L[i0].t; let I=[i0], P=[E.L[i0].a,E.L[i0].b]; used.add(i0); let closed=false;
    for(const dir of [1,-1]){ for(let g=0;g<10000;g++){ const end=dir>0?P[P.length-1]:P[0], k=K(end), A=(V.get(k)||[]).filter(j=>!used.has(j)&&E.L[j].t===t), all=(V.get(k)||[]).filter(j=>E.L[j].t===t); if(all.length!==2) break; if(!A.length){ if(dir>0&&I.length>2&&K(P[0])===k) closed=true; break; } const j=A[0]; used.add(j); const q=E.L[j][other(j,k)]; if(dir>0){ I.push(j); P.push(q); } else { I.unshift(j); P.unshift(q); } } if(closed) break; }
    return {I,P,closed,t}; };
  const turn=(A,B,C)=>{ let x=Math.atan2(C.y-B.y,C.x-B.x)-Math.atan2(B.y-A.y,B.x-A.x); while(x>Math.PI) x-=2*Math.PI; while(x<-Math.PI) x+=2*Math.PI; return x; }, MAXT=35*Math.PI/180, MINT=0.3*Math.PI/180;
  const onC=(P,C)=>P.every(q=>Math.abs(Math.hypot(q.x-C.x,q.y-C.y)-C.r)<=Math.max(2,C.r*0.0005));
  E.L.forEach((l,i0)=>{ if(used.has(i0)||l.t==='r'||l.t==='j') return; let {I,P,closed,t}=walk(i0);
    if(closed){ const n=I.length, T=P.slice(0,n).map((q,k)=>turn(P[(k-1+n)%n],q,P[(k+1)%n])), C=arcCirc(P[0],P[Math.floor(n/3)],P[Math.floor(2*n/3)]); if(n>=6&&C&&T.every(x=>Math.abs(x)>MINT&&Math.abs(x)<MAXT&&Math.sign(x)===Math.sign(T[0]))&&onC(P,C)){ G.push({I,P:P.slice(0,n),closed:true,C,r:C.r,t}); return; }
      /* a loop with corners: start the walk at a corner so an arc is not cut in two */ let s0=T.findIndex(x=>Math.abs(x)>=MAXT||Math.abs(x)<=MINT); if(s0<0) s0=0; I=I.slice(s0).concat(I.slice(0,s0)); const Q=P.slice(0,n); P=Q.slice(s0).concat(Q.slice(0,s0)); P.push(P[0]); }
    /* an arc is a run of equal chords (arcs are always cut into equal pieces): a tangent straight line of another length never joins it */
    const len=k=>Math.hypot(P[k+1].x-P[k].x,P[k+1].y-P[k].y);
    let i=0; while(i<I.length){ let j=i; const t0=i+1<P.length-1?turn(P[i],P[i+1],P[i+2]):0, L0=len(i); while(j+1<I.length){ const x=turn(P[j],P[j+1],P[j+2]); if(Math.abs(x)<MINT||Math.abs(x)>MAXT||Math.sign(x)!==Math.sign(t0)) break; if(Math.abs(len(j+1)-L0)>Math.max(1,L0*0.01)) break; j++; }
      if(j-i+1>=3){ const Q=P.slice(i,j+2), C=arcCirc(Q[0],Q[Math.floor(Q.length/2)],Q[Q.length-1]); if(C&&C.r<1e6&&onC(Q,C)){ let sw=0; for(let k=1;k<Q.length-1;k++) sw+=turn(Q[k-1],Q[k],Q[k+1]); const n=Q.length-1; sw=sw*n/(n-1); G.push({I:I.slice(i,j+1),P:Q,closed:false,C,r:C.r,sw,t}); i=j+1; continue; } }
      i++; } });
  return G; }
function skArcOf(E,i){ return skArcGroups(E).find(g=>g.I.includes(i))||null; }
function skArcSel(E){ if(!E||(E.k!=='s'&&E.k!=='sm')) return null; const S=(E.S||[]).filter(o=>o.k==='l'); if(S.length<3||S.length!==(E.S||[]).length) return null; const g=skArcOf(E,S[0].i); if(!g||g.I.length!==S.length||!S.every(o=>g.I.includes(o.i))) return null; return g; }
function skArcMid(g){ if(g.closed) return null; const a0=Math.atan2(g.P[0].y-g.C.y,g.P[0].x-g.C.x)+g.sw/2; return {x:g.C.x+g.r*Math.cos(a0),y:g.C.y+g.r*Math.sin(a0)}; }
function skArcH(g){ if(g.closed) return [{k:'c',p:{x:g.C.x,y:g.C.y}},{k:'r',p:{x:g.C.x+g.r,y:g.C.y}}]; return [{k:'a',p:g.P[0]},{k:'b',p:g.P[g.P.length-1]},{k:'m',p:skArcMid(g)}]; }
function skArcPut(E,g,Q,ends){ const l0=E.L[g.I[0]], keep={t:l0.t,...(l0.ly?{ly:l0.ly}:{})}, at=Math.min(...g.I), drop=new Set(g.I);
  if(ends) for(const [o,n] of ends){ if(Math.hypot(o.x-n.x,o.y-n.y)<0.5) continue; E.L.forEach((l,i)=>{ if(drop.has(i)) return; for(const e of ['a','b']) if(Math.hypot(l[e].x-o.x,l[e].y-o.y)<1) l[e]=skR3(n); }); }
  const N=[]; for(let k=0;k+1<Q.length;k++) if(Math.hypot(Q[k+1].x-Q[k].x,Q[k+1].y-Q[k].y)>0.5) N.push({a:skR3(Q[k]),b:skR3(Q[k+1]),...keep});
  const before=E.L.filter((_,i)=>i<at&&!drop.has(i)), after=E.L.filter((_,i)=>i>=at&&!drop.has(i)); E.L=[...before,...N,...after]; E.S=N.map((_,k)=>({k:'l',i:before.length+k})); E._agK=null; }
function skCircQ(C,r){ const Q=[]; for(let k=0;k<=36;k++){ const a=k*Math.PI/18; Q.push({x:C.x+r*Math.cos(a),y:C.y+r*Math.sin(a)}); } return Q; }
function skArcSetR(v){ const E=planEd, g=skArcSel(E); if(!g) return; if(!(v>0)){ toast('Не соответствует: радиус больше 0'); return; }
  if(g.closed){ planHist(); skArcPut(E,g,skCircQ(g.C,v)); skSync(); return; }
  const A=g.P[0], B=g.P[g.P.length-1], ch=Math.hypot(B.x-A.x,B.y-A.y); if(v<ch/2-0.5){ toast('Не соответствует: радиус не меньше половины расстояния между концами ('+fmtU(ch/2)+')',true); return; }
  let sw=2*Math.asin(Math.min(1,ch/(2*v))); if(Math.abs(g.sw)>Math.PI) sw=2*Math.PI-sw; sw*=Math.sign(g.sw)||1; /* same side, same short / long arc */
  const h=(ch/2)/Math.tan(sw/2), u={x:(B.x-A.x)/ch,y:(B.y-A.y)/ch}, n={x:-u.y,y:u.x}, C={x:(A.x+B.x)/2+n.x*h,y:(A.y+B.y)/2+n.y*h}, R=Math.hypot(A.x-C.x,A.y-C.y), a0=Math.atan2(A.y-C.y,A.x-C.x), M={x:C.x+R*Math.cos(a0+sw/2),y:C.y+R*Math.sin(a0+sw/2)};
  planHist(); skArcPut(E,g,arcSegs(A,M,B)); skSync(); }
function skArcDraw(E){ const g=skArcSel(E); if(!g) return; for(const h of skArcH(g)){ const q=toS(h.p); ctx.save(); ctx.fillStyle='#fff'; ctx.strokeStyle='#2563eb'; ctx.lineWidth=2.5; ctx.beginPath(); if(h.k==='m'||h.k==='r'){ ctx.moveTo(q.x,q.y-7); ctx.lineTo(q.x+7,q.y); ctx.lineTo(q.x,q.y+7); ctx.lineTo(q.x-7,q.y); ctx.closePath(); } else ctx.arc(q.x,q.y,7,0,7); ctx.fill(); ctx.stroke(); ctx.restore(); }
  const M=g.closed?{x:g.C.x,y:g.C.y+g.r}:skArcMid(g), m=toS(M), c=toS(g.C), d=Math.hypot(m.x-c.x,m.y-c.y)||1, at={x:m.x+(m.x-c.x)/d*26,y:m.y+(m.y-c.y)/d*26}, L=g.closed?2*Math.PI*g.r:g.r*Math.abs(g.sw);
  tmpBox(fmtU(L)+' · R '+fmtU(g.r),at.x,at.y,0,true); E.lh.push({x:at.x,y:at.y,val:r3(g.r),fn:v=>skArcSetR(v)}); }
function skArcMove(q,p){ const E=planEd; E.L=JSON.parse(q.snap); E._agK=null; const g=q.g, w=toW(p.x,p.y); if(!q.moved&&Math.hypot(w.x-q.w0.x,w.y-q.w0.y)*view.scale<4) return; q.moved=true;
  const h0=(skArcH(g).find(h=>h.k===q.k)||{p:q.w0}).p, t=toS({x:h0.x+w.x-q.w0.x,y:h0.y+w.y-q.w0.y}), z=skR3(planSnap(t.x,t.y,null,(i)=>g.I.includes(i)));
  if(g.closed){ if(q.k==='c') skArcPut(E,g,skCircQ(z,g.r)); else skArcPut(E,g,skCircQ(g.C,Math.max(1,Math.hypot(z.x-g.C.x,z.y-g.C.y)))); redraw(); return; }
  if(q.k==='body'){ const d={x:Math.round((w.x-q.w0.x)/10)*10,y:Math.round((w.y-q.w0.y)/10)*10}, A0=g.P[0], B0=g.P[g.P.length-1], P2=g.P.map(o=>({x:o.x+d.x,y:o.y+d.y})); skArcPut(E,g,P2,[[A0,P2[0]],[B0,P2[P2.length-1]]]); redraw(); return; }
  const A0=g.P[0], B0=g.P[g.P.length-1], M0=skArcMid(g), A=q.k==='a'?z:A0, B=q.k==='b'?z:B0, M=q.k==='m'?z:M0; if(Math.hypot(B.x-A.x,B.y-A.y)<1||!arcCirc(A,M,B)) { E.S=g.I.map(i=>({k:'l',i})); E._agK=null; redraw(); return; } /* straight or zero arc: keep the original arc and its selection */
  skArcPut(E,g,arcSegs(A,M,B),[[A0,A],[B0,B]]); redraw(); }
function skTdList(i){ const E=planEd, l=E&&E.L[i]; if(!l) return []; const d=skV(l.a,l.b), Ls=skL(d); if(Ls<1) return []; const t={x:d.x/Ls,y:d.y/Ls}, n={x:-t.y,y:t.x};
  if(E.tdN!==E.L.length){ E.tdR={}; E.tdN=E.L.length; } /* the lines changed in number — anchors start over */
  const out=[], near=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y)<1;
  for(const e of ['a','b']){ const key=i+e, P=l[e], man=E.tdR&&E.tdR[key]; let R=man||null;
    if(!R){ for(let j=0;j<E.L.length&&!R;j++){ if(j===i) continue; const m=E.L[j]; for(const f of ['a','b']) if(near(m[f],P)){ const F=m[f==='a'?'b':'a']; if(Math.abs((F.x-P.x)*n.x+(F.y-P.y)*n.y)>=1){ R=F; break; } } } }
    if(!R) continue; const dd=(R.x-l.a.x)*n.x+(R.y-l.a.y)*n.y; if(Math.abs(dd)<1) continue; out.push({key,e,R:{x:R.x,y:R.y},d:dd,n,t,man:!!man}); }
  return out; }
function skTdSet(i,o,v){ const E=planEd; if(!(v>0)){ toast('Не соответствует: нужно число больше 0'); return; } const l=E.L[i]; if(!l) return; const dl=o.d-Math.sign(o.d)*v; if(Math.abs(dl)<0.05) return;
  planHist(); const pts=planPts([{k:'l',i}],false); for(const x of pts){ const q=x.o[x.f]; x.o[x.f]={x:r3(q.x+o.n.x*dl),y:r3(q.y+o.n.y*dl)}; } E._agK=null; skSync(); }
function skTdDraw(i){ const E=planEd, l=E.L[i], T=skTdList(i); E.tdH=[]; if(!T.length) return; const mid={x:(l.a.x+l.b.x)/2,y:(l.a.y+l.b.y)/2};
  const sa=toS(l.a), sb=toS(l.b), sl=Math.hypot(sb.x-sa.x,sb.y-sa.y)||1, ts={x:(sb.x-sa.x)/sl,y:(sb.y-sa.y)/sl};
  for(const o of T){ const foot={x:o.R.x-o.n.x*o.d,y:o.R.y-o.n.y*o.d}, side=((foot.x-mid.x)*o.t.x+(foot.y-mid.y)*o.t.y)>=0?1:-1, Rs=toS(o.R), Fs=toS(foot), sh={x:ts.x*30*side,y:ts.y*30*side} /* 30 px outside the segment's end, on the screen of any plane */;
    const A={x:Fs.x+sh.x,y:Fs.y+sh.y}, B={x:Rs.x+sh.x,y:Rs.y+sh.y};
    ctx.save(); ctx.strokeStyle='#2f6fe4'; ctx.globalAlpha=.55; ctx.lineWidth=1; line(Fs,A); line(Rs,B); ctx.globalAlpha=1; ctx.setLineDash([6,4]); ctx.lineWidth=1.3; line(A,B); ctx.setLineDash([]);
    ctx.fillStyle=o.man?'#f2c200':'#2f6fe4'; ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(B.x,B.y,6.5,0,7); ctx.fill(); ctx.stroke(); ctx.restore(); /* the round end of the size (blue; yellow — anchored by hand) */
    const m=skLabAt(A,B,0), val=Math.abs(o.d); tmpBox(fmtU(val),m.x,m.y,m.r,true); E.lh.push({x:m.x,y:m.y,val,fn:v=>skTdSet(i,o,v)}); E.tdH.push({i,key:o.key,x:B.x,y:B.y}); } }
function skLabAt(a,b,off){ let an=Math.atan2(b.y-a.y,b.x-a.x); if(an>=Math.PI/2-1e-6) an-=Math.PI; else if(an<-Math.PI/2-1e-6) an+=Math.PI; const n={x:Math.sin(an),y:-Math.cos(an)}, o=off==null?16:off; return {x:(a.x+b.x)/2+n.x*o,y:(a.y+b.y)/2+n.y*o,r:Math.hypot(b.x-a.x,b.y-a.y)<2?0:an}; }
function drawPlanEd(){ const E=planEd; if(!E) return; skState(E); E.lh=[]; const S=E.S||[], selL=new Set(S.filter(o=>o.k!=='sp').map(o=>o.i)), selSp=new Set(skSelSp()), on=(i,e)=>S.some(o=>o.k==='e'&&o.i===i&&o.e===e), col=t=>t==='r'?'#d63fd6':t==='j'?'#2fae5a':'#9aa5b1', PK=new Set(E.pick.map(p=>p.i)); ctx.save();
  const lnS=isLnSk(E), LVi=lnS?(doc.levels[E.cfg.li]||{items:[]}).items:null, DASH={dash:[10,6],dot:[2,5],dashdot:[10,4,2,4]}, stOf=l=>{ const it=lnS&&l.id?LVi.find(x=>x.id===l.id):l; return it||{}; };
  E.L.forEach((l,i)=>{ const a=toS(l.a), b=toS(l.b), st=stOf(l); if(selL.has(i)||PK.has(i)){ ctx.save(); ctx.strokeStyle=PK.has(i)?'#f59f00':'#4c9aff'; ctx.lineWidth=10; ctx.globalAlpha=.45; line(a,b); ctx.restore(); } ctx.strokeStyle=lnS&&st.lc?st.lc:col(l.t); ctx.lineWidth=l.t==='c'?2:3; ctx.setLineDash(l.t==='j'?[8,6]:lnS&&DASH[st.lt]?DASH[st.lt]:[]); line(a,b); ctx.setLineDash([]); });
  if(lnS) for(const it of lnArcItems()){ ctx.save(); ctx.strokeStyle=it.lc||col('l'); ctx.lineWidth=3; ctx.setLineDash(DASH[it.lt]||[]); ctx.beginPath(); if(it.t==='circ'){ const c=toS(it.c), e=toS({x:it.c.x+it.r,y:it.c.y}); ctx.arc(c.x,c.y,Math.hypot(e.x-c.x,e.y-c.y),0,7); } else { arcPts(arcG(it),0,0,1).map(toS).forEach((q,k)=>k?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); } ctx.stroke(); ctx.restore(); } /* arcs and circles of «Линии» — as thick as its lines */
  if(lnS&&E.arc) lnArcDraw(E);
  if(SKV&&trackGuide&&E._dragL!=null){ ctx.save(); ctx.strokeStyle=C.tape||'#e0a400'; ctx.lineWidth=1.5; ctx.setLineDash([4,4]); for(const [g0,g1] of trackGuide) line(toS(g0),toS(g1)); ctx.restore(); } /* on a facade / face the dragged segment's guide is drawn here (the plan draws its own) */
  const AG=skArcSel(E), AGI=new Set(AG?AG.I:[]); if(AG) skArcDraw(E);
  /* splines: one smooth curve; control points only when selected */ (E.SP||[]).forEach((Sp,j)=>{ const P=skSpCurve(Sp).map(toS), sel=selSp.has(j); if(sel){ ctx.save(); ctx.strokeStyle='#4c9aff'; ctx.lineWidth=10; ctx.globalAlpha=.45; ctx.beginPath(); P.forEach((q,k)=>k?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.stroke(); ctx.restore(); }
    ctx.strokeStyle=col(Sp.t); ctx.lineWidth=Sp.t==='c'?2:3; ctx.setLineDash(Sp.t==='j'?[8,6]:[]); ctx.beginPath(); P.forEach((q,k)=>k?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.stroke(); ctx.setLineDash([]);
    if(sel){ ctx.save(); ctx.strokeStyle='#4c9aff'; ctx.lineWidth=1; ctx.setLineDash([3,4]); ctx.beginPath(); Sp.p.forEach((v,k)=>{ const q=toS(v); k?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.stroke(); ctx.restore(); for(const v of Sp.p){ const q=toS(v); ctx.beginPath(); ctx.arc(q.x,q.y,6,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#4c9aff'; ctx.lineWidth=2; ctx.stroke(); } } });
  /* sizes you can tap and type: the selected segment / vertex (the other end stays), the segment just drawn */
  { const lab=(i,e,txt)=>{ const l=E.L[i]; if(!l) return; const a=toS(l.a), b=toS(l.b), m=skLabAt(a,b,-28), L=skL(skV(l.a,l.b)); /* far enough that a drag from the middle of the line takes the line, not the size */ tmpBox(fmtU(L),m.x,m.y,m.r,true); E.lh.push({x:m.x,y:m.y,val:L,fn:v=>skSetLen(i,e,v)}); };
    E.tdH=[]; if(E._dragL!=null&&E.L[E._dragL]&&!(S.length===1&&S[0].k==='l'&&S[0].i===E._dragL)) skTdDraw(E._dragL); /* the segment being dragged shows its sizes too */ const SL=S.filter(o=>o.k!=='sp'), SE=SL.filter(o=>o.k==='e'); /* one selected vertex wins even when its lines are selected too */ const selM=E.k==='s'||E.k==='sm'; /* sizes of the selection — only while selecting (a move / copy shows its own size) */ if(selM&&SE.length===1&&!E.live) lab(SE[0].i,SE[0].e); else if(selM&&SL.length===1&&!E.live){ const o=SL[0]; lab(o.i,o.k==='e'?o.e:'b'); if(o.k==='l'&&!skArcOf(E,o.i)) skTdDraw(o.i); } else if(E.lastI!=null&&E.L[E.lastI]&&!E.live&&(E.k==='ln'||E.k==='pl')) lab(E.lastI,'b'); }
    if(E.k==='mv'&&E.lastMv&&!E.pts.length){ const M=E.lastMv, a=toS(M.A), b=toS(M.B), m=skLabAt(a,b), L=skL(skV(M.A,M.B)); ctx.save(); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=1; ctx.setLineDash([4,4]); line(a,b); ctx.restore(); tmpBox(fmtU(L),m.x,m.y,m.r,true); E.lh.push({x:m.x,y:m.y,val:L,fn:v=>skMvAgain(v)}); }
  /* vertex circles only on the selected lines; the rest stay clean */
  for(const i of selL){ const l=E.L[i]; if(!l||AGI.has(i)) continue; for(const e of ['a','b']){ const q=toS(l[e]), se=on(i,e); ctx.beginPath(); ctx.arc(q.x,q.y,se?8:6,0,Math.PI*2); ctx.fillStyle=se?'#4c9aff':'#fff'; ctx.fill(); ctx.strokeStyle='#4c9aff'; ctx.lineWidth=2; ctx.stroke(); } }
  const q=E.live, k=E.k, P=E.pts;
  if(q&&(SKPT.has(k)||(k==='af'&&E.pick.length===2))){ let G=null;
    if(k==='af'){ const [p1,p2]=E.pick, l1=E.L[p1.i], l2=E.L[p2.i]; if(l1&&l2){ const B0=skFilletGeo(l1,p1.w,l2,p2.w,0); if(!B0.err){ const R=skFilletR(B0,q), G2=skFilletGeo(l1,p1.w,l2,p2.w,R); if(!G2.err){ G={S:skChain(G2.arc)}; const m=toS(G2.arc[Math.floor(G2.arc.length/2)]); tmpBox('R '+fmtU(R),m.x,m.y-18,0,false); } } } }
    else G=skGen(k,P,q);
    if(G){ ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=2.5; ctx.setLineDash([10,6]); if(G.S) for(const [A,B] of G.S) line(toS(A),toS(B)); if(G.X) for(const i of skSelLines()){ const l=E.L[i]; line(toS(G.X(l.a)),toS(G.X(l.b))); } ctx.setLineDash([]); }
    const A=P.length?P[P.length-1]:null;
    if(A&&(k==='ln'||k==='pl'||((k==='mv'||k==='cp')&&P.length===1))){ const a=toS(A), b=toS(q), m=skLabAt(a,b), L=skL(skV(A,q)); tmpBox(fmtU(L),m.x,m.y,m.r,false); E.lh.push({x:m.x,y:m.y,val:L,fn:v=>skTyped(v),lv:true}); }
    if(P.length&&k==='rc'){ const b=toS(q); tmpBox(fmtU(Math.abs(q.x-P[0].x))+' × '+fmtU(Math.abs(q.y-P[0].y)),b.x+44,b.y-18,0,false); }
    if(P.length===1&&(k==='ci'||k==='pgi'||k==='pgc')){ const a=toS(P[0]), b=toS(q), m=skLabAt(a,b), R=skL(skV(P[0],q)); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=1; line(a,b); tmpBox('R '+fmtU(R),m.x,m.y,m.r,false); E.lh.push({x:m.x,y:m.y,val:R,fn:v=>skTypedR(v),lv:true}); }
    if(k==='rot'&&P.length){ const c=toS(P[0]), b=toS(q); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=1; line(c,b); if(P[1]) line(c,toS(P[1])); if(G&&G.C){ const deg=G.ang*180/Math.PI, m={x:b.x+30,y:b.y-18}; tmpBox(deg.toFixed(1)+'°',m.x,m.y,0,false); E.lh.push({x:m.x,y:m.y,val:r1(Math.abs(deg)),fn:v=>skTyped(v),lv:true}); } }
    if((k==='cp'||k==='mv')&&P[0]){ ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=1; line(toS(P[0]),toS(q)); } }
  for(const p of P){ const s=toS(p); ctx.beginPath(); ctx.arc(s.x,s.y,6,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=2; ctx.stroke(); }
  if(k==='rot'&&E.pts.length){ const C=E.pts[0]; if(C){ const c=toS(C); ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(c.x-7,c.y); ctx.lineTo(c.x+7,c.y); ctx.moveTo(c.x,c.y-7); ctx.lineTo(c.x,c.y+7); ctx.stroke(); } }
  for(const a of E.acq||[]){ const s=toS(a); ctx.strokeStyle='#0ea5b7'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(s.x-7,s.y); ctx.lineTo(s.x+7,s.y); ctx.moveTo(s.x,s.y-7); ctx.lineTo(s.x,s.y+7); ctx.stroke(); }
  for(const b of E.bad||[]){ const s=toS(b); ctx.strokeStyle='#e03131'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(s.x,s.y,11,0,Math.PI*2); ctx.stroke(); }
  if(q){ const b=toS(q), mag=liveSnap==='end'||liveSnap==='corner'||liveSnap==='mid'; ctx.beginPath(); ctx.arc(b.x,b.y,mag?12:5,0,Math.PI*2); ctx.fillStyle=mag?'rgba(47,111,228,.15)':'#2f6fe4'; ctx.fill(); if(mag){ ctx.strokeStyle='#2f6fe4'; ctx.lineWidth=2; ctx.stroke(); } }
  ctx.restore(); }
const SKTITLE={ext:'Эскиз → выдавливание',stair:'Траектория лестницы',cab:'Трасса кабеля',slab:'Граница перекрытия',roof:'Граница крыши',rail:'Траектория ограждения',nslab:'Перекрытие: контур',nroof:'Крыша по эскизу: контур'};
const isLnSk=E=>!!(E&&E.cfg&&E.cfg.kind==='lines');
function lnItems(li){ return doc.levels[li].items.filter(it=>it.t==='line'&&!isWall(it)&&!it.bg&&!(it.w>0)); }
function lnSig(E){ return JSON.stringify([E.L.map(l=>[l.id||'',r3(l.a.x),r3(l.a.y),r3(l.b.x),r3(l.b.y),l.ly||'']),(E.SP||[]).map(S=>[S.p,!!S.cl,S.ly||''])]); }
function lnOpen(){ if(isLnSk(planEd)){ syncToolBtns(); return; } setTool('select'); selId=null; moveSel.clear(); roofEd=null; roofEdge=null; selJoint=null;
  const li=doc.curLv, its=lnItems(li), c={kind:'lines',li,title:'Линии',open:false,ly:lineLayer==='open'?'open':'misc',ex:new Set(its.map(i=>i.id)),orig:JSON.stringify(its),extra:new Set(),snap:'',origA:JSON.stringify(doc.levels[li].items.filter(i=>(i.t==='line'&&i.bg&&!isWall(i)&&!(i.w>0))||i.t==='circ'))};
  const L=its.map(it=>({a:{...it.a},b:{...it.b},t:'l',id:it.id,ly:it.L}));
  planEd=skState({id:null,L,SP:[],acq:[],k:'pl',t:'l',a:null,live:null,S:[],H:[],cfg:c,bad:[]}); planEd.last.ln='pl'; c.snap=lnSig(planEd); btnTool='draw';
  panelKey=''; syncPanel(); syncModeBtns(); syncTop(); syncToolBtns(); redraw(); toast('Линии: инструменты как в эскизах, всё сразу на чертеже. ✓ — к выбору, ✕ — отменить изменения линий',true); }
function lnOpenSel(h){ lnOpen(); const E=planEd; if(!isLnSk(E)) return; skSetTool('s'); if(h.t==='circ'||h.bg) E.arc=h.id; else { const i=E.L.findIndex(l=>l.id===h.id); if(i>=0){ const g=skArcOf(E,i); E.S=(g?g.I:[i]).map(k=>({k:'l',i:k})); } } toastOff(); skSync(); }
function lnCommit(){ const E=planEd, c=E&&E.cfg; if(!isLnSk(E)) return; const sig=lnSig(E); if(sig===c.snap) return; const Lv=doc.levels[c.li]; if(!Lv) return; pushUndo();
  const seen=new Set(); for(const l of E.L){ if(l.id&&seen.has(l.id)) delete l.id; if(l.id) seen.add(l.id); }
  for(const id of [...c.ex]) if(!seen.has(id)){ const k=Lv.items.findIndex(i=>i.id===id); if(k>=0) Lv.items.splice(k,1); c.ex.delete(id); }
  const mk=(a,b,ly)=>{ const id=uid(); Lv.items.push({id,t:'line',a:skR3(a),b:skR3(b),L:ly||c.ly||'misc',w:0,side:0}); c.ex.add(id); return id; };
  for(const l of E.L){ const it=l.id?Lv.items.find(i=>i.id===l.id):null; if(it){ it.a=skR3(l.a); it.b=skR3(l.b); if(l.ly) it.L=l.ly; } else l.id=mk(l.a,l.b,l.ly); }
  for(const S of E.SP||[]) for(const [a,b] of skChain(skSpline(S.p,!!S.cl),!!S.cl)) if(skL(skV(a,b))>0.5) mk(a,b,S.ly); /* a spline: written as short lines, kept editable in the sketch */
  c.snap=lnSig(E); persist(); }
function lnRevert(){ const c=planEd&&planEd.cfg; if(!c||c.kind!=='lines') return; const Lv=doc.levels[c.li]; if(!Lv) return; const O=JSON.parse(c.orig), oid=new Set(O.map(i=>i.id)), drop=new Set([...c.ex,...c.extra]);
  const OA=JSON.parse(c.origA||'[]'), arcNow=JSON.stringify(Lv.items.filter(i=>(i.t==='line'&&i.bg&&!isWall(i)&&!(i.w>0))||i.t==='circ').filter(i=>!c.extra.has(i.id))), arcCh=arcNow!==JSON.stringify(OA);
  if(!arcCh&&![...drop].some(id=>!oid.has(id))&&c.snap===lnSig({L:O.map(it=>({a:it.a,b:it.b,id:it.id,ly:it.L})),SP:[]})) return; pushUndo();
  const aid=new Set(OA.map(i=>i.id)); Lv.items=Lv.items.filter(i=>!drop.has(i.id)&&!aid.has(i.id)); for(const it of O) Lv.items.push(it); for(const it of OA) Lv.items.push(it); persist(); }
function lnReload(){ const E=planEd, c=E&&E.cfg; if(!isLnSk(E)) return; const its=lnItems(c.li); c.ex=new Set(its.map(i=>i.id)); E.L=its.map(it=>({a:{...it.a},b:{...it.b},t:'l',id:it.id,ly:it.L})); E.SP=[]; E.S=[]; E.H=[]; skReset(E); c.snap=lnSig(E); }
function lnTrue(k,P,q,G){ const E=planEd, c=E.cfg, Lv=doc.levels[c.li]; planHist(); pushUndo(); const id=uid();
  if(k==='ci'){ const r=skL(skV(P[0],q)); if(!(r>1)) return; Lv.items.push({id,t:'circ',c:skR3(P[0]),r:r3(r),L:c.ly||'misc'}); }
  else { const pts=[G.S[0][0],...G.S.map(x=>x[1])], A=pts[0], B=pts[pts.length-1], M=pts[Math.floor(pts.length/2)];
    const ax=M.x-A.x, ay=M.y-A.y, bx=B.x-A.x, by=B.y-A.y, D=2*(ax*by-ay*bx); if(Math.abs(D)<1e-6){ Lv.items.push({id,t:'line',a:skR3(A),b:skR3(B),L:c.ly||'misc',w:0,side:0}); }
    else { const C={x:A.x+(by*(ax*ax+ay*ay)-ay*(bx*bx+by*by))/D,y:A.y+(ax*(bx*bx+by*by)-bx*(ax*ax+ay*ay))/D}, an=p=>Math.atan2(p.y-C.y,p.x-C.x), nrm=x=>{ while(x>Math.PI) x-=2*Math.PI; while(x<=-Math.PI) x+=2*Math.PI; return x; };
      let sw=0; for(let i=1;i<pts.length;i++) sw+=nrm(an(pts[i])-an(pts[i-1])); Lv.items.push({id,t:'line',a:skR3(A),b:skR3(B),bg:Math.tan(sw/4),L:c.ly||'misc',w:0,side:0}); } }
  c.extra.add(id); persist(); }
function skOpenBsk(c,segs,tool){ c.title=SKTITLE[c.kind]||'Эскиз'; c.open=c.kind==='rail'||c.kind==='cab'||c.kind==='stair'; bsk=null; roofSk=null; roofSkLive=null;
  let L=segs.map(([A,B])=>({a:{x:r3(A.x),y:r3(A.y)},b:{x:r3(B.x),y:r3(B.y)},t:'c'})), SP=[]; const slab=c.kind==='nslab', it0=c.id?doc.items.find(i=>i.id===c.id):null;
  if(it0&&it0.sk&&it0.sk.h===skHash(it0)){ L=JSON.parse(JSON.stringify(it0.sk.L)); SP=JSON.parse(JSON.stringify(it0.sk.SP||[])); }
  setTool('select'); selId=null; moveSel.clear(); roofEd=null; roofEdge=null; selJoint=null; c.slab=slab;
  planEd=skState({id:null,L,SP,acq:[],k:tool||'pl',t:'c',a:null,live:null,S:[],H:[],cfg:c,bad:[]}); panelKey=''; syncPanel(); syncModeBtns(); syncTop(); redraw();
  toast(c.title+({slab:': внешний контур — граница, внутренние — отверстия',roof:': один замкнутый контур',rail:': одна цепь линий (можно незамкнутая)',stair:': одна незамкнутая линия — ось марша, ступени по ней',cab:': одна незамкнутая линия от массива или устройства до другого устройства (◆ выводы панелей, ■ устройства — магнит)',nslab:': замкнутый контур, липнет к стенам',nroof:': замкнутый контур, липнет к стенам'}[c.kind]||'')+'. ✓ — готово, ✕ — отмена',true,true); }
function skQuit(){ const E=planEd; if(!E) return; const c=E.cfg; if(c&&c.kind==='ext'){ extSkQuit(); return; } if(c&&c.kind==='sweep'){ sweepSkQuit(); return; } if(c&&c.kind==='sec'){ secSkClose(false); return; } if(c&&c.kind==='prof'){ planEd=null; toastOff(); EV.psk=null; pskUI(); elevBuild(); elevDraw(); elevHint(); panelKey=''; syncPanel(); toast('Крыша по профилю отменена'); return; } if(isLnSk(E)){ lnRevert(); planEd=null; setTool('select'); toast('Изменения линий отменены'); return; } planEd=null; if(c&&c.id){ selId=c.id; if(c.det) roofEd=c.id; } panelKey=''; syncPanel(); syncModeBtns(); syncTop(); redraw(); if(c) toast('Эскиз отменён'); }
function skBskDone(){ if(planEd&&planEd.cfg&&planEd.cfg.kind==='ext'){ extSkDone(); return; } if(planEd&&planEd.cfg&&planEd.cfg.kind==='sweep'){ sweepSkDone(); return; } if(planEd&&planEd.cfg&&planEd.cfg.kind==='sec'){ secSkDone(); return; }
  if(planEd&&planEd.cfg&&planEd.cfg.kind==='prof'){ const E=planEd, er=pskFromBlock(E); if(er){ toast('Не соответствует: '+er,true,true); return; } planEd=null; toastOff(); pskDone(); if(EV.psk&&EV.psk.step==='od'){ pskMake(EV.psk.v); if(EV.psk){ EV.psk.step=null; planEd=E; pskUI(); } /* the values were refused: back to the sketch with its values row, not the old panel */ } else if(EV.psk&&!EV.psk.step&&!EV.psk.done0){ /* refused by the builder: back to the sketch */ planEd=E; pskUI(); } panelKey=''; syncPanel(); elevDraw(); return; }
  if(isLnSk(planEd)){ lnCommit(); planEd=null; setTool('select'); toast('Линии сохранены'); return; } const E=planEd, c=E.cfg, segs=skAllL(E).map(l=>[{...l.a},{...l.b}]), n00=doc.items.length;
  /* the sketch (with its splines) is kept on the object while its outline is unchanged */ const keepSk=()=>{ if(!(E.SP||[]).length||c.kind==='cab') return; const it=c.id?doc.items.find(i=>i.id===c.id):(doc.items.length>n00?doc.items[doc.items.length-1]:null); if(!it||!it.pts) return; it.sk={L:JSON.parse(JSON.stringify(E.L)),SP:JSON.parse(JSON.stringify(E.SP)),h:skHash(it)}; persist(); };
  if(c.kind==='stair'){ const R=bskChain(segs); if(R.err){ E.bad=R.bad||[]; skSync(); toast('Не соответствует: '+R.err,true,true); return; } if(R.cl){ toast('Не соответствует: траектория лестницы — незамкнутая линия',true,true); return; } if(!R.pts||R.pts.length<2){ toast('Нарисуйте траекторию',true,true); return; }
    toastOff(); planEd=null; stairKind='path'; stairDraw={pts:R.pts.map(q=>({x:r3(q.x),y:r3(q.y)}))}; finishStair(); syncModeBtns(); return; } /* the stair is built exactly as before (finishStair) */
  if(c.kind==='nslab'||c.kind==='nroof'){ const R=bskLoops(segs); if(R.err){ E.bad=R.bad||[]; skSync(); toast('Не соответствует: '+R.err,true,true); return; } if(R.loops.length!==1){ E.bad=R.loops.slice(1).map(P=>P[0]); skSync(); toast('Не соответствует: нужен один замкнутый контур',true,true); return; }
    const n0=doc.items.length, keep=planEd; planEd=null; tool='roof'; slabMode=c.slab; roofSk={pts:R.loops[0].map(q=>({x:r3(q.x),y:r3(q.y)}))}; finishRoofSketch();
    if(doc.items.length===n0){ /* not built: stay in the sketch */ planEd=keep; tool='select'; slabMode=false; roofSk=null; skSync(); } else { keepSk(); slabMode=false; if(tool!=='select') setTool('select'); panelKey=''; syncPanel(); syncModeBtns(); redraw(); } return; }
  bsk={det:c.det,kind:c.kind,id:c.id,li:c.li,segs,tool:'line',ch:null,tmp:[],live:null,n:6,U:[],tr:null,bad:[],base:c.base,z:c.z}; const keep=planEd; planEd=null;
  try{ bskFinish(); }catch(e){ console.error(e); }
  if(bsk){ /* refused: back to the sketch with the bad points marked */ keep.bad=bsk.bad||[]; bsk=null; planEd=keep; skSync(); return; }
  keepSk(); panelKey=''; syncPanel(); syncModeBtns(); syncTop(); redraw(); }
function skvEv(){ return { ev:true, vk:'ev',
  toS:p=>evS(p.x,p.y), toW:(x,y)=>{ const w=evW(x,y); return {x:w.u,y:w.z}; },
  /* what attracts on the facade: walls and columns (corners, middles of sides), as the profile did */
  pts(){ const out=[]; for(const h of EV.items||[]){ if(h.kind==='wall'||(h.kind==='obj'&&isCol(h.it))){ const um=(h.u0+h.u1)/2, zm=(h.z0+h.z1)/2; out.push({x:h.u0,y:h.z0},{x:h.u1,y:h.z0},{x:h.u0,y:h.z1},{x:h.u1,y:h.z1}); out.push({x:um,y:h.z0,m:1},{x:um,y:h.z1,m:1},{x:h.u0,y:zm,m:1},{x:h.u1,y:zm,m:1}); } } return out; },
  snap(sx,sy,from,o){ const s=EV.view.s, w=this.toW(sx,sy); liveSnap=null; trackGuide=null; polarGuide=null; let best=null, bd=14;
    const P=[...(o.ex||[]).map(q=>({...q,k:'end'})),...(o.mid||[]).map(q=>({...q,k:'mid'})),...this.pts().map(q=>({x:q.x,y:q.y,k:q.m?'mid':'end'}))];
    for(const q of P){ const t=this.toS(q), d=Math.hypot(t.x-sx,t.y-sy); if(d<bd){ bd=d; best=q; } } if(best){ liveSnap=best.k; return {x:r3(best.x),y:r3(best.y)}; }
    let x=w.x, y=w.y, lx=false, ly=false, dir=null;
    /* Орто: within 7° of 0 / 45 / 90° from the previous point (or the other end of a dragged line) the line locks there; otherwise it goes free (a sloped eave stays sloped) */
    if(from&&axisMode==='ortho'){ const dx=x-from.x, dy=y-from.y, L=Math.hypot(dx,dy); if(L>1){ const a0=Math.atan2(dy,dx), a=Math.round(a0/(Math.PI/4))*(Math.PI/4); if(Math.abs(a0-a)<7*Math.PI/180){ const c=Math.cos(a), sn=Math.sin(a), t=dx*c+dy*sn; x=from.x+c*t; y=from.y+sn*t; if(Math.abs(sn)<1e-6){ y=from.y; ly=true; } else if(Math.abs(c)<1e-6){ x=from.x; lx=true; } else { lx=ly=true; dir={c,sn}; } polarGuide=[[from,{x,y}]]; } } }
    /* dashed alignment from the pointed points (and the previous point): on the free axis; on a 45° lock — where the 45° line meets the pointed point's line */ const G=[], src=[...(o.trackSrc||[]),...(from?[from]:[])], tol=10/s;
    if(dir){ let bq=null, bd2=tol; for(const q of src){ if(q===from) continue; for(const k of ['x','y']){ const cc=k==='x'?dir.c:dir.sn; if(Math.abs(cc)<1e-6) continue; const t=((k==='x'?q.x:q.y)-(k==='x'?from.x:from.y))/cc, X=from.x+dir.c*t, Y=from.y+dir.sn*t, d=Math.hypot(X-x,Y-y); if(d<bd2){ bd2=d; bq={q,X,Y}; } } } if(bq){ x=bq.X; y=bq.Y; G.push([bq.q,{x,y}]); trackGuide=G; liveSnap='align'; } return {x:r3(x),y:r3(y)}; }
    let bx=null,dbx=tol,by=null,dby=tol; for(const q of src){ if(!lx){ const d=Math.abs(q.x-x); if(d<dbx){ dbx=d; bx=q; } } if(!ly){ const d=Math.abs(q.y-y); if(d<dby){ dby=d; by=q; } } }
    if(bx){ x=bx.x; G.push([bx,{x,y}]); } if(by){ y=by.y; G.push([by,{x,y}]); }
    if(!by&&!ly) for(const L of doc.levels){ if(!L.gp&&Math.abs(y-L.elev)<tol){ y=L.elev; break; } } /* level lines */
    if(G.length){ trackGuide=G; liveSnap='align'; } if(!bx&&!lx) x=Math.round(x/10)*10; if(!by&&!ly) y=Math.round(y/10)*10; return {x:r3(x),y:r3(y)}; },
  box:()=>({el:EV.el,co:EV.co}),
  redraw(){ if(EV&&EV.el&&!EV.el.hidden) elevDraw(); } }; }
function skvRun(fn){ const A=planEd&&planEd.skv; if(!A||SKV) return fn(); const sv=view; SKV=A; if(A.ev) view={cx:EV.view.cu,cy:EV.view.cz,scale:EV.view.s}; else if(A.scale) view={cx:0,cy:0,scale:A.scale()}; try{ return fn(); } finally{ SKV=null; view=sv; } }
function skvPlane(vk,S){ const VA=pdVA(vk), W=S.WP, O=W.P0;
  const to3=p=>V3a(O,V3a(V3m(W.e1,p.x),V3m(W.e2,p.y))), to2=P=>{ const d=V3s(P,O); return {x:r3(V3d(d,W.e1)),y:r3(V3d(d,W.e2))}; };
  return { vk, VA, S, to3, to2,
    toS(p){ return VA.proj(to3(p))||{x:-1e6,y:-1e6}; },
    toW(x,y){ const G=pdUn(VA,W,x,y); return G?to2(G):{x:0,y:0}; },
    /* screen pixels per mm on the face (for pick tolerances) */ scale(){ const a=VA.proj(O), b=VA.proj(V3a(O,V3m(W.e1,1000))), c=VA.proj(V3a(O,V3m(W.e2,1000))); if(!a||!b||!c) return 0.1; return Math.max(1e-4,(Math.hypot(b.x-a.x,b.y-a.y)+Math.hypot(c.x-a.x,c.y-a.y))/2000); },
    /* the sketch's own ends and middles first; then the 3D ortho and magnets as defined (pdSnap: along the face axes X / Y / Z, model vertices, dashed alignment) */
    snap(sx,sy,from,o){ liveSnap=null; trackGuide=null; polarGuide=null; let best=null, bd=14;
      for(const q of [...(o.ex||[]).map(q=>({...q,k:'end'})),...(o.mid||[]).map(q=>({...q,k:'mid'}))]){ const t=this.toS(q), d=Math.hypot(t.x-sx,t.y-sy); if(d<bd){ bd=d; best=q; } } if(best){ liveSnap=best.k; return {x:r3(best.x),y:r3(best.y)}; }
      const T=pdT(S).concat((o.trackSrc||[]).map(to3)), sn=pdSnap(VA,W,sx,sy,from?to3(from):null,T,pdTV(S)); if(!sn) return this.toW(sx,sy);
      const p=to2(sn.G); if(sn.vt) liveSnap='end'; else if(sn.sn.length){ liveSnap='align'; trackGuide=sn.sn.map(z=>[to2(z.T),p]); } if(sn.lk&&from) polarGuide=[[from,p]]; return p; },
    pick(sx,sy){ const E=extEdgeAt(VA,W,sx,sy); return E?{a:to2(E[0]),b:to2(E[1])}:null; },
    box(){ return vk==='v3'?{el:v3.el,co:v3.el.querySelector('canvas.v3g')}:{el:EV.el,co:EV.co}; },
    redraw(){ VA.draw(); } }; }
function skvDrawOn(x){ const sv=ctx; ctx=x; try{ skvRun(()=>{ drawPlanEd(); if(trackGuide&&planEd.live){ x.save(); x.strokeStyle='#38c6d9'; x.lineWidth=1.2; x.setLineDash([5,4]); for(const [A,B] of trackGuide){ const a=toS(A),b=toS(B); line(a,b); } x.restore(); x.setLineDash([]); } if(polarGuide&&planEd.live){ x.save(); x.strokeStyle='#e0a400'; x.lineWidth=1.2; x.setLineDash([6,5]); for(const [A,B] of polarGuide) line(toS(A),toS(B)); x.restore(); x.setLineDash([]); } }); }catch(e){ console.warn(e); } finally{ ctx=sv; } }
function arcCirc(a,b,c){ const d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y)); if(Math.abs(d)<1e-9) return null; const a2=a.x*a.x+a.y*a.y, b2=b.x*b.x+b.y*b.y, c2=c.x*c.x+c.y*c.y, x=(a2*(b.y-c.y)+b2*(c.y-a.y)+c2*(a.y-b.y))/d, y=(a2*(c.x-b.x)+b2*(a.x-c.x)+c2*(b.x-a.x))/d; return {x,y,r:Math.hypot(a.x-x,a.y-y)}; }
function arcPack(P){ const n=P.length; if(n<3) return P.map(q=>({x:q.x,y:q.y})); const out=[{x:P[0].x,y:P[0].y}], len=k=>Math.hypot(P[k+1].x-P[k].x,P[k+1].y-P[k].y);
  const turn=k=>{ const a1=Math.atan2(P[k].y-P[k-1].y,P[k].x-P[k-1].x), a2=Math.atan2(P[k+1].y-P[k].y,P[k+1].x-P[k].x); let t=a2-a1; while(t>Math.PI) t-=2*Math.PI; while(t<-Math.PI) t+=2*Math.PI; return t; };
  let i=0; while(i<n-1){ let j=i; const L0=len(i);
    while(j+1<n-1){ const t=turn(j+1); if(Math.abs(t)<2e-3||Math.abs(t)>0.2) break; if(Math.abs(len(j+1)-L0)>Math.max(0.6,L0*0.02)) break; if(j>i&&Math.abs(t-turn(i+1))>0.01) break; j++; } /* equal pieces turning by the same small angle (≤ 11°) */
    if(j>=i+2){ /* at least 3 pieces, as the block's own arc rule: two pieces with a bend stay a kink */ const A=P[i], B=P[j+1], C=arcCirc(A,P[Math.floor((i+j+1)/2)],B); let ok=!!C&&C.r<1e6; if(ok) for(let k=i;k<=j+1;k++) if(Math.abs(Math.hypot(P[k].x-C.x,P[k].y-C.y)-C.r)>1){ ok=false; break; }
      if(ok){ let sw=0; for(let k=i+1;k<=j;k++) sw+=turn(k); sw=sw*(j-i+1)/(j-i); const am=Math.atan2(A.y-C.y,A.x-C.x)+sw/2; out.push({x:r3(C.x+C.r*Math.cos(am)),y:r3(C.y+C.r*Math.sin(am)),a:1},{x:B.x,y:B.y}); i=j+1; continue; } }
    out.push({x:P[i+1].x,y:P[i+1].y}); i++; }
  return out; }
function arcSegs(A,M,B){ const C=arcCirc(A,M,B); if(!C) return [A,B]; const an=q=>Math.atan2(q.y-C.y,q.x-C.x), N=x=>{ x%=2*Math.PI; return x<0?x+2*Math.PI:x; }, a0=an(A), dm=N(an(M)-a0), d1=N(an(B)-a0), sw=dm<d1?d1:d1-2*Math.PI, n=Math.max(3,Math.ceil(Math.abs(sw)/(Math.PI/18)-1e-9)), P=[];
  for(let k=0;k<=n;k++){ const a=a0+sw*k/n; P.push({x:r3(C.x+C.r*Math.cos(a)),y:r3(C.y+C.r*Math.sin(a))}); } P[0]={x:A.x,y:A.y}; P[n]={x:B.x,y:B.y}; return P; }
function arcUnpack(pts){ const out=[{x:pts[0].x,y:pts[0].y}]; for(let i=1;i<pts.length;i++){ const q=pts[i]; if(q.a&&pts[i+1]){ out.push(...arcSegs(pts[i-1],q,pts[i+1]).slice(1)); i++; } else out.push({x:q.x,y:q.y}); } return out; }
const chainL=(P,cl)=>{ const L=[]; for(let i=0;i+1<P.length;i++) if(Math.hypot(P[i+1].x-P[i].x,P[i+1].y-P[i].y)>0.5) L.push({a:{x:r3(P[i].x),y:r3(P[i].y)},b:{x:r3(P[i+1].x),y:r3(P[i+1].y)},t:'c'}); if(cl&&P.length>2){ const a=P[P.length-1], b=P[0]; if(Math.hypot(b.x-a.x,b.y-a.y)>0.5) L.push({a:{x:r3(a.x),y:r3(a.y)},b:{x:r3(b.x),y:r3(b.y)},t:'c'}); } return L; };
