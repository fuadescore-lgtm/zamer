package PKG;

import android.os.Bundle;
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
    }
}
