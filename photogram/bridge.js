// Мост PHOTOGRAM → копия движка BIMsketcher (редактор плана и 3D внутри PHOTOGRAM).
// Вставляется при сборке PHOTOGRAM перед «let appView='recent';» в копию app3d/www/index.html;
// в исходники и APK BIMsketcher не входит.
// PHOTOGRAM → новый чертёж: наружный контур по замерам, толщина стен внутрь (side:1 при обходе против часовой), проёмы на стенах
window.__photoToPlan=spec=>{ try{
  const old=spec.key?Object.values(store.docs).find(x=>x.photoKey===spec.key):null;
  if(old&&!spec.force){ openDoc(old.id); fitView(); window.__closePhoto(); toast('План «'+old.name+'»',true); return {ok:true,id:old.id,reused:true}; }
  const d=newDoc(spec.name); if(spec.key) d.photoKey=spec.key; store.docs[d.id]=d; openDoc(d.id); if(old) delete store.docs[old.id];
  const ids=[], P=spec.pts;
  for(let i=0;i<4;i++){ const a=P[i], b=P[(i+1)%4];
    const w={id:uid(),t:'line',a:{x:a[0],y:a[1]},b:{x:b[0],y:b[1]},L:'walls',w:spec.thick,side:1}; if(spec.ht&&!spec.roof) w.ht=spec.ht; doc.items.push(w); ids.push(w.id); }
  for(const h of spec.holes){ const o={id:uid(),t:h.t,wall:ids[h.side],pos:h.pos,width:h.width,height:h.height,sill:h.sill,hinge:0,swing:-1}; if(h.dk==='gar'){ o.dk='gar'; o.gk='sect'; } doc.items.push(o); }
  doc.settings.wallW=spec.thick; let nRoof=0, nChim=0;
  // с крышей высота стен — высота этажа: тогда наружные стены сами доходят до низа крыши (фронтоны закрыты)
  if(spec.roof&&spec.ht&&Math.abs(lvHeight(doc.curLv)-spec.ht)>1){ try{ setLvHeight(doc.curLv,spec.ht); }catch(e){ console.warn(e); } }
  // крыша по стенам: двускатная, уклон и направление конька — из фото фронтонов
  if(spec.roof){ try{ const rs=doc.settings; rs.roof=Object.assign({},roofDef(),{type:'gable',ang:spec.roof.ang,ov:spec.roof.ov,th:spec.roof.th});
    const r=roofAt({x:(P[0][0]+P[2][0])/2,y:(P[0][1]+P[2][1])/2});
    if(r){ const n=r.pts.length; r.edges=r.pts.map((A,i)=>{ const B=r.pts[(i+1)%n], along=Math.abs(B.x-A.x)>=Math.abs(B.y-A.y); return {s:spec.roof.along==='x'?along:!along,a:spec.roof.ang}; });
      doc.items.push(r); nRoof=1;
      for(const id of ids){ const W=doc.items.find(i=>i.id===id); if(W){ W.ra=true; W.rr=[r.id]; } }   // стены до низа крыши (фронтоны закрыты)
      persist(); } }catch(e){ console.warn('photo roof',e); } }
  // дымоход: положение и сечение по двум снимкам, высота над кровлей — от верха трубы
  if(spec.chim){ try{ const c=spec.chim, o={id:uid(),t:'chim',p:{x:c.x,y:c.y},w:c.w,l:c.l,th:(typeof chimDef==='function'&&chimDef().th)||120,rot:0};
    doc.items.push(o); const rt=chimRoofTop(o); if(rt!=null) o.hr=Math.max(200,Math.round(c.top-(spec.fo||0)-rt)); nChim=1; }catch(e){ console.warn('photo chim',e); } }
  persist(); panelKey=''; syncPanel(); redraw(); fitView(); window.__closePhoto();
  if(spec.view3d) setTimeout(()=>{ const b3=document.getElementById('btn3d'); if(b3&&!b3.classList.contains('on')) b3.click(); },250);
  toast('Модель из PHOTOGRAM: стен 4, проёмов '+spec.holes.length+(nRoof?', крыша':'')+(nChim?', дымоход':'')+(spec.skipped?', не перенесено '+spec.skipped:'')+(spec.warn&&spec.warn.length?'. Внимание: '+spec.warn.join('; '):''),true);
  return {ok:true,id:d.id}; }catch(e){ console.warn(e); return {ok:false,msg:String(e&&e.message||e)}; } };
window.__closePhoto=()=>{};
// редактор плана внутри PHOTOGRAM: принимает модель от PHOTOGRAM (postMessage)
window.addEventListener('message',e=>{ const d=e.data; if(!d||d.photoHost!==1||window.parent===window||e.source!==window.parent) return;
  if(d.type==='plan'){ const res=window.__photoToPlan(d.spec); try{ e.source.postMessage({bsk:1,type:'planResult',id:d.id,res},'*'); }catch(_){} } });
