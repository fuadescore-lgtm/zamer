// smoke test entry (node): writes test.dwg and reads it back as DXF
import { dotnet } from './_framework/dotnet.js';
import fs from 'fs';
const { getAssemblyExports, getConfig } = await dotnet.create();
const X = (await getAssemblyExports(getConfig().mainAssemblyName)).Dwg;
console.log('ACadSharp', X.Version());
for (const VER of [2013, 2004, 2000, 2018]) { try {
X.Begin(VER); X.Layer('СТЕНЫ', 1); X.Line(0,0,0,12000,0,0); X.Line(12000,0,0,12000,8000,0); X.Arc(6000,2000,0,900,90,180); X.Circle(9000,4000,0,600);
X.Text('Кухня',1500,3000,0,250,0); X.Layer('3D',5);
X.Face([0,0,0, 1000,0,0, 1000,0,3000, 0,0,3000], 0);
X.PFace([0,0,0, 1000,0,0, 1000,1000,0, 0,1000,0, 0,0,1000, 1000,0,1000, 1000,1000,1000, 0,1000,1000], [1,2,3,4, 5,6,7,8, 1,2,6,5, 2,3,7,6, 3,4,8,7, 4,1,5,8]);
X.Pline3d([0,0,0, 1000,1000,500, 2000,0,1000]);
X.Layer('DIMS',2); X.DimStyle(250,150,100,150,150,75); X.BlkBegin(0); X.BlkLine(0,-800,12000,-800); X.BlkMtext('12000',6000,-650,250,0); X.BlkEnd();
X.Dim(1,0,0,12000,0,12000,-800,6000,-650,0,12000,0);
const b = X.End(); fs.writeFileSync('test'+VER+'.dwg', Buffer.from(b)); console.log(VER, 'dwg bytes', b.length);
const dxf = X.DwgToDxf(b); fs.writeFileSync('test'+VER+'_back.dxf', Buffer.from(dxf)); console.log('dxf bytes', dxf.length);
const txt = Buffer.from(dxf).toString('utf8') + new TextDecoder('windows-1251').decode(dxf); for (const k of ['LINE','ARC','CIRCLE','TEXT','3DFACE','POLYLINE','DIMENSION','Кухня','СТЕНЫ']) console.log(' ', k, txt.split(k).length - 1);
console.log('  U+ escapes', txt.split('\\U+').length - 1);
} catch (e) { console.log(VER, 'FAILED', e && e.message); process.exitCode = 1; } }
