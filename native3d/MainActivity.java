package PKG;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

// BIMsketcher: Android 15+ рисует приложение под системными панелями (edge-to-edge).
// Отодвигаем WebView от строки состояния, панели навигации, выреза камеры и клавиатуры.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CompassPlugin.class);
        super.onCreate(savedInstanceState);
        final View wv = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(wv, (v, insets) -> {
            Insets b = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.LayoutParams p = v.getLayoutParams();
            if (p instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) p;
                lp.leftMargin = b.left; lp.topMargin = b.top; lp.rightMargin = b.right; lp.bottomMargin = Math.max(b.bottom, ime.bottom);
                v.setLayoutParams(lp);
            }
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(wv);
        // «Назад»: сначала спрашиваем страницу (закрыть клавиатуру, меню, выделение, 3D/фасад);
        // если закрывать нечего — обычное поведение (свернуть приложение)
        final OnBackPressedCallback back = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                ((WebView) wv).evaluateJavascript("(window.__bsBack&&window.__bsBack())?1:0", v -> {
                    if (!"1".equals(v)) {
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, back);
        // файл проекта .bimsk: «Открыть в BIMsketcher» / «Поделиться → BIMsketcher»
        if (savedInstanceState == null) handleProjectIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleProjectIntent(intent);
    }

    private void handleProjectIntent(Intent it) {
        if (it == null) return;
        final String a = it.getAction();
        Uri u = null;
        try {
            if (Intent.ACTION_VIEW.equals(a)) u = it.getData();
            else if (Intent.ACTION_SEND.equals(a)) u = (Uri) it.getParcelableExtra(Intent.EXTRA_STREAM);
        } catch (Exception e) { u = null; }
        if (u == null) return;
        final String sch = u.getScheme();
        if (sch == null || !(sch.equals("content") || sch.equals("file"))) return;
        final Uri uri = u;
        new Thread(() -> {
            String name = "project.bimsk", text = null, err = null;
            try {
                try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (c != null && c.moveToFirst()) { String n = c.getString(0); if (n != null) name = n; }
                } catch (Exception ignored) { String lp = uri.getLastPathSegment(); if (lp != null) name = lp; }
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new Exception("нет доступа к файлу");
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[65536]; int n; long tot = 0;
                    while ((n = in.read(buf)) > 0) { tot += n; if (tot > 80L * 1024 * 1024) throw new Exception("файл больше 80 МБ"); bo.write(buf, 0, n); }
                    text = new String(bo.toByteArray(), StandardCharsets.UTF_8);
                }
            } catch (Exception e) { err = e.getMessage() == null ? e.toString() : e.getMessage(); }
            final String js = text != null
                ? "(window.__bsOpenText?(window.__bsOpenText(" + JSONObject.quote(text) + "," + JSONObject.quote(name) + "),1):0)"
                : "(window.toast?(toast(" + JSONObject.quote("Не удалось открыть файл: " + err) + ",true),1):0)";
            runOnUiThread(() -> deliverJs(js, 0));
        }).start();
        setIntent(new Intent(Intent.ACTION_MAIN));
    }

    // страница может ещё загружаться — повторяем, пока не ответит 1
    private void deliverJs(final String js, final int tries) {
        final WebView wv = (WebView) getBridge().getWebView();
        wv.evaluateJavascript(js, v -> {
            if (!"1".equals(v) && tries < 60) wv.postDelayed(() -> deliverJs(js, tries + 1), 500);
        });
    }
}
