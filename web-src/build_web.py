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
# fonts inside the app: no request to Google Fonts (privacy, works offline)
UR = {'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
      'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
      'cyrillic': 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
      'cyrillic-ext': 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F'}
FAM = [('barlow-condensed', 'Barlow Condensed'), ('ibm-plex-mono', 'IBM Plex Mono'), ('barlow', 'Barlow')]
css = []
for fn in sorted(os.listdir(P('fonts'))):
    if not fn.endswith('-normal.woff2'): continue
    base = fn[:-len('-normal.woff2')]
    pre, fam = next(x for x in FAM if base.startswith(x[0] + '-'))
    sub, w = base[len(pre) + 1:].rsplit('-', 1)
    data = base64.b64encode(open(P('fonts', fn), 'rb').read()).decode()
    css.append("@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}" % (fam, w, data, UR[sub]))
src = src.replace('<!--BS-FONTS-->', '<style id="bsfonts">' + ''.join(css) + '</style>', 1)
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
