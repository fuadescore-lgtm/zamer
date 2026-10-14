# вставить i18n/en.json в zamer-dxf.html (тег <script id="i18n-en">)
import json
s=open('/home/claude/zamer-dxf.html').read(); d=json.load(open('/home/claude/i18n/en.json'))
i=s.index('<script id="i18n-en">'); j=s.index('</script>\n',i)+10
s=s[:i]+'<script id="i18n-en">window.__I18N_EN='+json.dumps(d,ensure_ascii=False,separators=(',',':'))+';</script>\n'+s[j:]
open('/home/claude/zamer-dxf.html','w').write(s); print('dict',len(d))
