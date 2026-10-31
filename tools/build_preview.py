# Один HTML-файл BIMsketcher для просмотра в Claude (справа в окне чата) и в браузере:
# app3d/www/index.html + встроенный photo.html (фотообмер). В APK фотообмер грузится отдельным файлом.
#   python3 tools/build_preview.py  → BIMsketcher-<версия>.html в корне репозитория (в git не добавляется)
import base64, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = os.path.join(R, 'app3d', 'www')
ver = open(os.path.join(R, 'app3d', 'VERSION')).read().strip()
idx = open(os.path.join(W, 'index.html'), encoding='utf-8').read()
photo = open(os.path.join(W, 'photo.html'), 'rb').read()
tag = '<script type="text/plain" id="photoInline">' + base64.b64encode(photo).decode() + '</script>\n'
i = idx.index('<body>') + len('<body>')
out = idx[:i] + tag + idx[i:]
dst = os.path.join(R, f'BIMsketcher-{ver}.html')
open(dst, 'w', encoding='utf-8').write(out)
print(dst, round(len(out.encode()) / 1e6, 1), 'МБ')
