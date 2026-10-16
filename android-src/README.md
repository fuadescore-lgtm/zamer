# BIMsketcher: исходный код Android-проекта

- **Приложение:** BIMsketcher
- **Package name (applicationId):** `com.bimsketcher.app`
- **Версия:** см. файл `VERSION` (versionName) и `android/app/build.gradle` (versionCode)
- **Платформа:** Capacitor 8 (WebView) — Android API 36 (compileSdk / targetSdk), Java 21

## Как устроено

Приложение гибридное: вся программа (план, 3D, крыши, фасады, экспорт DXF/DWG/IFC) — это веб-код в одном файле,
а Android-проект — оболочка Capacitor, которая показывает его в WebView и даёт доступ к файлам, «Поделиться» и компасу.

```
BIMsketcher-android/
  android/                  ← Android-проект: откройте эту папку в Android Studio / Cursor
    app/build.gradle        ← applicationId, versionCode, versionName
    app/src/main/AndroidManifest.xml
    app/src/main/java/com/bimsketcher/app/
        MainActivity.java   ← отступы от системных панелей/клавиатуры, кнопка «Назад»
        CompassPlugin.java  ← компас (север для плана)
    app/src/main/res/       ← значки, строки, стили, splash
    app/src/main/assets/public/index.html   ← копия веб-части (создаётся командой `npx cap sync`)
    gradlew, gradle/wrapper/ ← Gradle wrapper
  www/index.html            ← собранная веб-часть (то, что попадает в приложение)
  web-src/                  ← ИСХОДНИК веб-части
    zamer-dxf.html          ← весь код программы (HTML + CSS + JavaScript)
    dwgjs.js, zamerdwg.wasm.gz ← модуль записи DWG
    build_web.py            ← сборка web-src → www/index.html
  i18n/en.json              ← английский словарь интерфейса
  native/                   ← исходные Java-файлы (шаблоны с `package PKG;`)
  icons/                    ← значки приложения
  node_modules/@capacitor/  ← Android-модули Capacitor (нужны Gradle, уже в архиве)
  package.json, capacitor.config.json, VERSION
```

## Открыть и собрать

Нужно: **Android Studio** (Ladybug или новее) или Cursor + Android SDK, **JDK 21**, Android SDK Platform 36.

1. Распакуйте архив.
2. Откройте папку **`android/`** в Android Studio (File → Open). Дождитесь синхронизации Gradle.
3. Запуск на телефоне: подключите устройство (режим разработчика, отладка по USB) → ▶ Run.
4. Сборка из командной строки (в папке `android/`):
   - отладочный APK: `./gradlew assembleDebug` (Windows: `gradlew.bat assembleDebug`) → `app/build/outputs/apk/debug/`
   - релиз для Google Play: `./gradlew bundleRelease` → `app/build/outputs/bundle/release/` — нужна подпись ключом загрузки (`BIMsketcher-upload-key.jks`, алиас `upload`). Ключа и пароля в архиве нет и не должно быть; подпись: Build → Generate Signed App Bundle.

## Как менять программу

Почти все функции — в `web-src/zamer-dxf.html`.

1. Правите `web-src/zamer-dxf.html` (новые русские строки интерфейса — добавьте перевод в `i18n/en.json`).
2. Собираете веб-часть: `python3 web-src/build_web.py --i18n` → обновится `www/index.html`.
3. Копируете в Android-проект: `npm install` (один раз) и `npx cap sync android` (или вручную скопируйте `www/index.html` в `android/app/src/main/assets/public/index.html`).
4. Собираете в Android Studio.

Быстрая проверка без телефона: откройте `www/index.html` в Chrome (режим телефона в DevTools).

## Версия для Google Play

Перед каждой загрузкой в Play Console увеличьте `versionCode` в `android/app/build.gradle` (он должен быть больше, чем у уже загруженной сборки) и при желании `versionName`.
