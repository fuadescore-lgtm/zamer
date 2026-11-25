// DWG engine loader: ACadSharp (MIT) compiled to .NET WebAssembly, embedded in the page as gzip+base64.
// Exposes the same z-API the export code has always used, plus dwgToDxf() for import.
let zdnRt=null;
function zdnBoot(){ if(!zdnRt) zdnRt=zdnStart().catch(e=>{ zdnRt=null; throw e; }); return zdnRt; }
async function zdnStart(){
  const M=JSON.parse(document.getElementById('zdnet').textContent);
  const gun=async b64=>new Uint8Array(await new Response(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const files={}; await Promise.all(Object.keys(M).map(async k=>{ files[k]=await gun(M[k]); }));
  // the runtime resolves its files against its own URL; give it a fixed virtual base (every file is served from memory below)
  // module scripts come from blob: URLs; where a page policy blocks those, fall back to data: URLs
  let useBlob=true; try{ await import(URL.createObjectURL(new Blob(['export const ok=1'],{type:'text/javascript'}))); }catch(e){ useBlob=false; }
  const jsUrl=k=>{ const t=new TextDecoder().decode(files[k]).split('import.meta.url').join('(globalThis.__zdnBase||import.meta.url)');
    if(useBlob) return URL.createObjectURL(new Blob([t],{type:'text/javascript'}));
    let b=''; const u=new TextEncoder().encode(t); for(let i=0;i<u.length;i+=32768) b+=String.fromCharCode.apply(null,u.subarray(i,i+32768)); return 'data:text/javascript;base64,'+btoa(b); };
  const js={'dotnet.runtime.js':jsUrl('dotnet.runtime.js'),'dotnet.native.js':jsUrl('dotnet.native.js')};
  globalThis.__zdnBase='https://zdnet.invalid/_framework/dotnet.js';
  const {dotnet}=await import(jsUrl('dotnet.js'));
  const boot=JSON.parse(new TextDecoder().decode(files['blazor.boot.json']));
  const rt=await dotnet.withResourceLoader((type,name,def)=>{
      const n=String(name).split("/").pop();
      if(js[n]) return js[n];
      if(files[n]) return Promise.resolve(new Response(files[n],{headers:{'content-type':n.endsWith('.wasm')?'application/wasm':'application/json'}}));
      return def; })
    .withConfig(Object.assign(boot,{disableIntegrityCheck:true})).create();
  const X=(await rt.getAssemblyExports(rt.getConfig().mainAssemblyName)).Dwg;
  return X;
}
async function zdnLoad(){
  const X=await zdnBoot();
  const flat=(...v)=>[].concat(...v);
  const q=(a,b,c,d)=>flat(a,b,c,d||c);
  return {
    engine:'ACadSharp '+X.Version(),
    begin:(ver)=>{ X.Begin(ver||0); },
    layer:(name,color)=>X.Layer(String(name),color|0),
    line:(a,b,z)=>X.Line(a.x,a.y,z||0,b.x,b.y,z||0),
    face:(a,b,c,d)=>X.Face(q(a,b,c,d),0),
    facef:(a,b,c,d,fl)=>X.Face(q(a,b,c,d),fl|0),
    pface:(V,F)=>X.PFace(Array.from(V),Array.from(F,v=>v|0)),
    pline3d:(Pt)=>Pt.length<2?-1:X.Pline3d(flat(...Pt.map(p=>[p[0],p[1],p[2]]))),
    arc:(c,r,a1,a2,z)=>X.Arc(c.x,c.y,z||0,r,a1,a2),
    circle:(c,r,z)=>X.Circle(c.x,c.y,z||0,r),
    text:(s,p,h,rot,z)=>X.Text(String(s),p.x,p.y,z||0,h,rot||0),
    dimstyle:(txt,tsz,exo,exe,dle,gap)=>X.DimStyle(txt,tsz,exo,exe,dle,gap),
    blkBegin:(z)=>X.BlkBegin(z||0),
    blkLine:(a,b)=>X.BlkLine(a.x,a.y,b.x,b.y),
    blkMtext:(s,p,h,rot)=>X.BlkMtext(String(s),p.x,p.y,h,rot||0),
    blkEnd:()=>X.BlkEnd(),
    dim:(aligned,p1,p2,dp,tp,rot,meas,z)=>X.Dim(aligned?1:0,p1.x,p1.y,p2.x,p2.y,dp.x,dp.y,tp.x,tp.y,rot||0,meas,z||0),
    end:()=>{ const b=X.End(); if(!b||!b.length) throw new Error('dwg end'); return b; },
    dwgToDxf:(bytes)=>X.DwgToDxf(bytes)
  };
}
