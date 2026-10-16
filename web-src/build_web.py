# Сборка веб-части BIMsketcher: web-src/zamer-dxf.html → www/index.html (Android, Capacitor)
#   python3 web-src/build_web.py            — собрать
#   python3 web-src/build_web.py --i18n     — сначала вставить словарь i18n/en.json в zamer-dxf.html
import base64, json, os, sys
R = os.path.dirname(os.path.abspath(__file__))
P = lambda *a: os.path.normpath(os.path.join(R, *a))
SRC = P('zamer-dxf.html')
if '--i18n' in sys.argv:
    s = open(SRC, encoding='utf-8').read(); d = json.load(open(P('..', 'i18n', 'en.json'), encoding='utf-8'))
    i = s.index('<script id="i18n-en">'); j = s.index('</script>\n', i) + 10
    s = s[:i] + '<script id="i18n-en">window.__I18N_EN=' + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';</script>\n' + s[j:]
    open(SRC, 'w', encoding='utf-8').write(s); print('i18n:', len(d), 'строк')
src = open(SRC, encoding='utf-8').read()
b64 = base64.b64encode(open(P('zamerdwg.wasm.gz'), 'rb').read()).decode()
js = open(P('dwgjs.js'), encoding='utf-8').read().replace("if(typeof module!=='undefined') module.exports={zdLoad};", "")
i = src.index('<script>\n(function(){')
out = src[:i] + '<script type="application/octet-stream" id="zdwasm">' + b64 + '</script>\n<script>\n' + js + '\n</script>\n' + src[i:]
# BIMsketcher = программа в режиме 3D
out = out.replace('<title>EasyCAD</title>', '<title>BIMsketcher</title>', 1)
k = out.index('<script type="application/octet-stream" id="zdwasm">')
out = out[:k] + '<script>window.__IS3D__=true;</script>\n' + out[k:]
head = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#c0532f"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}[hidden]{display:none!important}</style></head><body>'
www = P('..', 'www') if os.path.isdir(P('..', 'www')) else P('..', 'app3d', 'www')
open(os.path.join(www, 'index.html'), 'w', encoding='utf-8').write(head + out + '</body></html>')
print('готово:', os.path.join(www, 'index.html'))
