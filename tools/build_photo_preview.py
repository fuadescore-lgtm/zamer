# PHOTOGRAM (фотообмер) одним HTML-файлом для просмотра в Claude (справа в окне чата) и в браузере:
# app3d/www/photo.html + встроенный редактор плана BIMsketcher (app3d/www/index.html).
#   python3 tools/build_photo_preview.py → PHOTOGRAM-<версия BIMsketcher>.html в корне (в git не добавляется)
import base64, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = os.path.join(R, 'app3d', 'www')
ver = open(os.path.join(R, 'app3d', 'VERSION')).read().strip()
photo = open(os.path.join(W, 'photo.html'), encoding='utf-8').read()
eng = open(os.path.join(W, 'index.html'), 'rb').read()
tag = '<script type="text/plain" id="bskInline">' + base64.b64encode(eng).decode() + '</script>\n'
i = photo.index('<body>') + len('<body>')
out = photo[:i] + tag + photo[i:]
dst = os.path.join(R, f'PHOTOGRAM-{ver}.html')
open(dst, 'w', encoding='utf-8').write(out)
print(dst, round(len(out.encode()) / 1e6, 1), 'МБ')
