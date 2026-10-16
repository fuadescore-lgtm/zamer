// Загрузчик WASM-модуля LibreDWG (сборка «Замер»): делает настоящий DWG R2000 в памяти.
// Минимальная прослойка WASI: файлов нет, вывод в консоль, время и случайные числа из браузера.
async function zdLoad(wasmBytes){
  let mem=null;
  const dv=()=>new DataView(mem.buffer);
  const EBADF=8;
  const wasi={
    environ_get:()=>0,
    environ_sizes_get:(c,s)=>{dv().setUint32(c,0,true);dv().setUint32(s,0,true);return 0;},
    clock_time_get:(id,prec,ptr)=>{dv().setBigUint64(ptr,BigInt(Date.now())*1000000n,true);return 0;},
    fd_close:()=>0,
    fd_seek:(fd,off,wh,ptr)=>{dv().setBigUint64(ptr,0n,true);return 0;},
    fd_prestat_get:()=>EBADF,
    fd_prestat_dir_name:()=>EBADF,
    fd_write:(fd,iovs,n,nw)=>{let t=0;const d=dv();for(let i=0;i<n;i++)t+=d.getUint32(iovs+i*8+4,true);d.setUint32(nw,t,true);return 0;},
    proc_exit:(c)=>{throw new Error('dwg exit '+c);},
    random_get:(p,l)=>{const a=new Uint8Array(mem.buffer,p,l);(globalThis.crypto||require('crypto').webcrypto).getRandomValues(a);return 0;}
  };
  const {instance}=await WebAssembly.instantiate(wasmBytes,{wasi_snapshot_preview1:wasi});
  const X=instance.exports; mem=X.memory; X._initialize();
  const enc=new TextEncoder();
  const str=s=>{const b=enc.encode(String(s)+'\0');const p=X.zd_malloc(b.length);new Uint8Array(mem.buffer,p,b.length).set(b);return p;};
  return {
    begin:()=>{const r=X.zd_begin(); if(r) throw new Error('zd_begin '+r);},
    layer:(name,color)=>{const p=str(name);const r=X.zd_layer(p,color|0);X.zd_mfree(p);return r;},
    line:(a,b,z)=>X.zd_line(a.x,a.y,z||0,b.x,b.y,z||0),
    face:(a,b,c,d)=>X.zd_face(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2],(d||c)[0],(d||c)[1],(d||c)[2]),
    facef:(a,b,c,d,fl)=>X.zd_facef?X.zd_facef(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2],(d||c)[0],(d||c)[1],(d||c)[2],fl|0):X.zd_face(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2],(d||c)[0],(d||c)[1],(d||c)[2]),
    arc:(c,r,a1,a2,z)=>X.zd_arc(c.x,c.y,z||0,r,a1,a2),
    circle:(c,r,z)=>X.zd_circle(c.x,c.y,z||0,r),
    text:(s,p,h,rot,z)=>{const q=str(s);const r=X.zd_text(q,p.x,p.y,z||0,h,rot||0);X.zd_mfree(q);return r;},
    dimstyle:(txt,tsz,exo,exe,dle,gap)=>X.zd_dimstyle(txt,tsz,exo,exe,dle,gap),
    blkBegin:(z)=>X.zd_blk_begin(z||0),
    blkLine:(a,b)=>X.zd_blk_line(a.x,a.y,b.x,b.y),
    blkMtext:(s,p,h,rot)=>{const q=str(s);const r=X.zd_blk_mtext(q,p.x,p.y,h,rot||0);X.zd_mfree(q);return r;},
    blkEnd:()=>X.zd_blk_end(),
    dim:(aligned,p1,p2,dp,tp,rot,meas,z)=>X.zd_dim(aligned?1:0,p1.x,p1.y,p2.x,p2.y,dp.x,dp.y,tp.x,tp.y,rot||0,meas,z||0),
    end:()=>{const n=X.zd_end(); if(n<=0) throw new Error('zd_end '+n); return new Uint8Array(mem.buffer,X.zd_buf(),n).slice();}
  };
}
if(typeof module!=='undefined') module.exports={zdLoad};
