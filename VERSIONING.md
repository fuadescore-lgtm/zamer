# EasyCAD — правило версий (просьба пользователя)
- APK начинается с 4.0.1 (выпуск 10.10.2026: оси).
- Каждый следующий выпуск APK: +1 к последней цифре: 4.0.2, 4.0.3, 4.0.4 …
- Менять в двух местах: /home/claude/zamer-apk/VERSION и const APP_VER в /home/claude/zamer-dxf.html.

## EasyCAD 3D
Отдельное приложение (папка app3d, appId com.easycad.cad3d, имя «EasyCAD 3D»).
Версия в app3d/VERSION: 1.0.1, затем 1.0.2, 1.0.3… — при каждой новой сборке APK 3D.
Выпуски: теги v3d-<версия>. Сборка 2D (4.0.x) от изменений app3d не запускается.

## Имя файла APK
Номер версии всегда в имени файла, ровно так: EasyCAD4.0.3.apk (2D), EasyCAD-3D1.0.3.apk (3D).

## Правила работы (просьба пользователя, 31.10.2026)
- Всё, что сделано, сначала проверяется самим Claude (сценарий в Chrome с эмуляцией телефона, сборка APK, содержимое APK),
  и только потом считается готовым.
- После каждого изменения пользователю отправляется HTML-файл для просмотра в Claude (справа в окне чата):
  PHOTOGRAM — `python3 tools/build_photogram.py --preview` → `PHOTOGRAM-<версия>.html`;
  BIMsketcher — сам файл `app3d/www/index.html`.

## PHOTOGRAM — отдельное приложение (просьба пользователя, 31.10.2026)
PHOTOGRAM ни в коем случае не связан с BIMsketcher: свой APK (appId com.photogram.app, значок, выпуски photogram-<версия>,
файл PHOTOGRAM-<версия>.apk), папка photogram/, сборка .github/workflows/photogram.yml. В BIMsketcher нет ни пункта меню,
ни кода PHOTOGRAM. Для плана и 3D внутри PHOTOGRAM при сборке берётся копия движка app3d/www/index.html
и к ней добавляется мост photogram/bridge.js (только в эту копию). Версия: photogram/VERSION — 1.0.0, 1.0.1, 1.0.2…
Исходник страницы: photogram/src/photogram.html. Сборка: python3 tools/build_photogram.py.
