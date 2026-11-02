# Сборка PHOTOGRAM — отдельное приложение (не входит в BIMsketcher).
#   python3 tools/build_photogram.py           → photogram/www/index.html + engine.html (для APK, Capacitor)
#   python3 tools/build_photogram.py --preview → PHOTOGRAM-<версия>.html в корне: один файл для просмотра в Claude
# Сборка 3D по фото: photogram/src/recon/*.js → <script type="text/plain" id="reconSrc"> (основной поток и фоновый Worker).
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
recon = ''.join(open(P('photogram', 'src', 'recon', f), encoding='utf-8').read() + '\n' for f in ['la.js', 'sift.js', 'geom.js', 'sfm.js', 'model.js'])
assert '</script' not in recon
src = src.replace('<body>', '<body>\n<script type="text/plain" id="reconSrc">\n' + recon + '</script>', 1)
# автопоиск окон: линейная алгебра + перспектива — в отдельной области видимости, наружу только PV
ai = open(P('photogram', 'src', 'recon', 'la.js'), encoding='utf-8').read() + '\n' + open(P('photogram', 'src', 'ai', 'persp.js'), encoding='utf-8').read()
assert '</script' not in ai
src = src.replace('<body>', '<body>\n<script>(function(){\n' + ai + '\nwindow.PV = PV;\n})();</script>', 1)
# карта объекта: Leaflet 1.9.4 (BSD-2, photogram/src/vendor/leaflet) — внутри страницы, без загрузки из сети
lf = P('photogram', 'src', 'vendor', 'leaflet')
lcss = open(os.path.join(lf, 'leaflet.css'), encoding='utf-8').read(); ljs = open(os.path.join(lf, 'leaflet.js'), encoding='utf-8').read()
assert '</script' not in ljs and '</style' not in lcss
src = src.replace('<body>', '<body>\n<style>' + lcss + '</style>\n<script>' + ljs + '</script>', 1)
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
