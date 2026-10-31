# Сборка PHOTOGRAM — отдельное приложение (не входит в BIMsketcher).
#   python3 tools/build_photogram.py           → photogram/www/index.html + engine.html (для APK, Capacitor)
#   python3 tools/build_photogram.py --preview → PHOTOGRAM-<версия>.html в корне: один файл для просмотра в Claude
# Редактор плана и 3D = копия движка app3d/www/index.html + мост photogram/bridge.js (вставляется перед «let appView='recent';»).
import base64, os, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(R, *a)
ver = open(P('photogram', 'VERSION')).read().strip()
src = open(P('photogram', 'src', 'photogram.html'), encoding='utf-8').read().replace('__PG_VER__', ver)
eng = open(P('app3d', 'www', 'index.html'), encoding='utf-8').read()
bridge = open(P('photogram', 'bridge.js'), encoding='utf-8').read()
anchor = "let appView='recent';"
assert eng.count(anchor) == 1, 'в движке не найдено место для моста'
eng = eng.replace(anchor, bridge + anchor)
eng = eng.replace('<title>BIMsketcher</title>', '<title>PHOTOGRAM · план</title>', 1)
i = src.index('<body>') + len('<body>')
if '--preview' in sys.argv:
    tag = '<script type="text/plain" id="bskInline">' + base64.b64encode(eng.encode('utf-8')).decode() + '</script>\n'
    dst = P(f'PHOTOGRAM-{ver}.html'); open(dst, 'w', encoding='utf-8').write(src[:i] + tag + src[i:])
    print(dst, round(os.path.getsize(dst) / 1e6, 1), 'МБ')
else:
    W = P('photogram', 'www'); os.makedirs(W, exist_ok=True)
    open(os.path.join(W, 'index.html'), 'w', encoding='utf-8').write(src[:i] + "<script>window.__PG_ENGINE='engine.html';</script>\n" + src[i:])
    open(os.path.join(W, 'engine.html'), 'w', encoding='utf-8').write(eng)
    print('PHOTOGRAM', ver, '→', W)
