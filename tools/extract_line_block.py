#!/usr/bin/env python3
"""Re-extract the standard line block (blocks/line-edit-block.js) from web-src/zamer-dxf.html.
Takes every top-level function / const whose name is in NAMES or matches the block prefixes, with its indented continuation lines."""
import re, sys
SRC='web-src/zamer-dxf.html'; OUT='blocks/line-edit-block.js'
ver=sys.argv[1] if len(sys.argv)>1 else '?'
NAMES={'planOpen','planHist','skHistPop','planSnap','planLineAt','planHit','planKey','planPts','planMove','planUp','planUndo','planDown','planLiveMove','planTap','planDel','planPanel','drawPlanEd','SKTITLE','skOpenBsk','skQuit','skBskDone',
  # 2.9.67+: the block on another plane
  'skvEv','skvPlane','skvRun','skvDrawOn',
  # 2.9.72–2.9.73: arcs as one object
  'skArcGroups','skArcOf','skArcSel','skArcMid','skArcH','skArcPut','skCircQ','skArcSetR','skArcDraw','skArcMove','arcCirc','arcSegs','arcPack','arcUnpack','chainL',
  'lnArcItems','lnArcSel','lnArcHit','lnArcH','lnArcR','lnArcDraw','lnArcMove','lnOpen','lnOpenSel','lnCommit','lnReload','lnRevert','lnTrue','lnItems','lnSig','isLnSk'}
pre=re.compile(r'^(?:function\s+|const\s+|let\s+)([A-Za-z_$][\w$]*)')
lines=open(SRC,encoding='utf-8').read().split('\n'); out=[]; i=0
while i<len(lines):
  m=pre.match(lines[i]); nm=m.group(1) if m else None
  if nm and (nm in NAMES or nm.startswith('SK') or (nm.startswith('sk') and nm[2:3].isupper())):
    blk=[lines[i]]; i+=1
    while i<len(lines) and lines[i][:1] in (' ','\t') : blk.append(lines[i]); i+=1
    out.append('\n'.join(blk)); continue
  i+=1
head=f"""/* Стандартный блок редактирования линий («Эскиз») — эталонная реализация, BIMsketcher 3D {ver}.
   Извлечено из web-src/zamer-dxf.html инструментом tools/extract_line_block.py: константы SK*, функции sk*, plan*, drawPlanEd,
   переходники плоскостей skv*, дуги как один объект (skArc*, lnArc*, arc*), сессия «Линии» (ln*).
   Не самостоятельный модуль: опирается на холст приложения (toS/toW, ctx, line, tmpBox, snapPoint с opt.trackSrc,
   openInline/closeInline kind 'sk', popMenu, toast, syncPanel, redraw). Описание и журнал — blocks/STANDARD_LINE_BLOCK.md. */
"""
open(OUT,'w',encoding='utf-8').write(head+'\n'+'\n'.join(out)+'\n'); print(len(out),'pieces')
