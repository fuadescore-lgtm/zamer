const acorn=require('/opt/npm-tools/node_modules/acorn'); const fs=require('fs');
const src=fs.readFileSync('/home/claude/zamer-dxf.html','utf8'); const i0=src.indexOf('<script>\n(function(){')+9, i1=src.lastIndexOf('</script>');
const js=src.slice(i0,i1), html=src.slice(0,i0)+src.slice(i1);
const RUN=/[А-Яа-яЁё]+(?:[  ,.\-–—:;!?«»()%/+°×·…'"]*[А-Яа-яЁё]+)*/g;
const runs=new Map(); const add=(t,where)=>{ for(const m of t.matchAll(RUN)){ const k=m[0]; runs.set(k,(runs.get(k)||0)+1); } };
const toks=[]; acorn.parse(js,{ecmaVersion:'latest',sourceType:'script',onToken:t=>{ if(t.type.label==='string'||t.type.label==='template') toks.push(t.value); }});
for(const v of toks) add(v);
// html outside script: strip <style> and comments
add(html.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<!--[\s\S]*?-->/g,''));
const arr=[...runs.keys()].sort((a,b)=>b.length-a.length);
fs.writeFileSync('runs.json',JSON.stringify(arr,null,0)); console.log(arr.length, arr.reduce((s,a)=>s+a.length,0));
