package PKG;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.Executors;

import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/**
 * BIMsketcher white list (Firebase, no Firebase SDK — plain REST).
 *
 * - Sign-in: Google account via Credential Manager (web client id of the Firebase project) →
 *   Firebase Auth REST (signInWithIdp) → refresh token kept on the device.
 * - Check: Firestore REST GET whitelist/{email lower-case} with the user's Firebase ID token.
 *   Firestore rules let a user read only their own record; nobody writes from the app.
 * - FAIL CLOSED: active = true only when the record says active == true and «until» (if any) is in the future.
 *   Without network the last confirmed «active» is used for at most 7 days (HMAC-signed with an Android Keystore key,
 *   clock rollback guarded). Not configured, not signed in, no record, any error → active = false.
 * - Config (api key, project id, web client id) comes from res/values/whitelist.xml written by the build from the
 *   GOOGLE_SERVICES_JSON secret; without it the plugin answers «Firebase не подключён».
 */
@CapacitorPlugin(name = "Whitelist")
public class WhitelistPlugin extends Plugin {
    static final long DAY = 24L * 3600 * 1000;
    static final long OFFLINE_MS = 7 * DAY;
    static final String PREFS = "bs_wl";
    static final String KEY_ALIAS = "bs_wl_hmac";

    private String apiKey = "", project = "", webClient = "";

    @Override
    public void load() {
        apiKey = res("wl_api_key");
        project = res("wl_project");
        webClient = res("wl_web_client");
    }

    private String res(String name) {
        try {
            int id = getContext().getResources().getIdentifier(name, "string", getContext().getPackageName());
            return id == 0 ? "" : getContext().getString(id).trim();
        } catch (Exception e) { return ""; }
    }

    private boolean configured() { return !apiKey.isEmpty() && !project.isEmpty() && !webClient.isEmpty(); }

    // ---------- JS API ----------

    @PluginMethod
    public void check(PluginCall call) {
        if (!configured()) { call.resolve(no("Firebase не подключён", false)); return; }
        Executors.newSingleThreadExecutor().execute(() -> call.resolve(doCheck()));
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!configured()) { call.resolve(no("Firebase не подключён", false)); return; }
        GetSignInWithGoogleOption opt = new GetSignInWithGoogleOption.Builder(webClient).build();
        GetCredentialRequest req = new GetCredentialRequest.Builder().addCredentialOption(opt).build();
        CredentialManager cm = CredentialManager.create(getContext());
        cm.getCredentialAsync(getActivity(), req, new CancellationSignal(), Executors.newSingleThreadExecutor(),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse r) {
                    try {
                        Credential c = r.getCredential();
                        if (!(c instanceof CustomCredential) || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType()))
                            throw new Exception("неожиданный тип входа");
                        String gid = GoogleIdTokenCredential.createFrom(((CustomCredential) c).getData()).getIdToken();
                        JSONObject body = new JSONObject();
                        body.put("postBody", "id_token=" + URLEncoder.encode(gid, "UTF-8") + "&providerId=google.com");
                        body.put("requestUri", "http://localhost");
                        body.put("returnSecureToken", true);
                        body.put("returnIdpCredential", true);
                        JSONObject a = post("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=" + apiKey, "application/json", body.toString());
                        String rt = a.optString("refreshToken", ""), email = a.optString("email", "").toLowerCase(Locale.ROOT);
                        if (rt.isEmpty() || email.isEmpty()) throw new Exception("Firebase не вернул вход");
                        prefs().edit().putString("rt", rt).putString("email", email).remove("cache").remove("cacheSig").apply();
                        call.resolve(doCheck());
                    } catch (Exception e) { call.resolve(no("ошибка входа: " + msg(e), true)); }
                }
                @Override
                public void onError(GetCredentialException e) {
                    call.resolve(no(e instanceof GetCredentialCancellationException ? "вход отменён" : "ошибка входа: " + msg(e), hasAccount()));
                }
            });
    }

    /** «Удалить аккаунт»: deletes the Firebase Auth user of this app (Google e-mail, uid) and everything kept on the device. */
    @PluginMethod
    public void deleteAccount(PluginCall call) {
        String rt = prefs().getString("rt", null);
        if (rt == null || !configured()) { prefs().edit().clear().apply(); JSObject o = no("вход не выполнен", false); o.put("deleted", false); call.resolve(o); return; }
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                JSONObject t = post("https://securetoken.googleapis.com/v1/token?key=" + apiKey, "application/x-www-form-urlencoded",
                    "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(rt, "UTF-8"));
                JSONObject b = new JSONObject(); b.put("idToken", t.optString("id_token", ""));
                post("https://identitytoolkit.googleapis.com/v1/accounts:delete?key=" + apiKey, "application/json", b.toString());
                prefs().edit().clear().apply();
                JSObject o = no("аккаунт удалён", false); o.put("deleted", true); call.resolve(o);
            } catch (Exception e) {
                JSObject o = no("не удалось удалить аккаунт: " + msg(e), true); o.put("deleted", false); call.resolve(o);
            }
        });
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        prefs().edit().remove("rt").remove("email").remove("cache").remove("cacheSig").apply();
        call.resolve(no("вход не выполнен", false));
    }

    // ---------- check ----------

    private JSObject doCheck() {
        SharedPreferences sp = prefs();
        String rt = sp.getString("rt", null), email = sp.getString("email", "");
        if (rt == null) return no("вход не выполнен", false);
        long now = effNow();
        try {
            // fresh Firebase ID token from the refresh token
            JSONObject t = post("https://securetoken.googleapis.com/v1/token?key=" + apiKey, "application/x-www-form-urlencoded",
                "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(rt, "UTF-8"));
            String idt = t.optString("id_token", "");
            if (idt.isEmpty()) throw new IllegalStateException("нет токена Firebase");
            String nrt = t.optString("refresh_token", "");
            if (!nrt.isEmpty() && !nrt.equals(rt)) sp.edit().putString("rt", nrt).apply();
            // the record
            String url = "https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents/whitelist/"
                + URLEncoder.encode(email, "UTF-8").replace("+", "%20");
            HttpURLConnection h = open(url);
            h.setRequestProperty("Authorization", "Bearer " + idt);
            int code = h.getResponseCode();
            String txt = read(code < 400 ? h.getInputStream() : h.getErrorStream());
            if (code == 404) { clearCache(); return no("записи нет", true); }
            if (code == 403) { clearCache(); return no("нет права читать запись — проверьте правила Firestore", true); }
            if (code != 200) throw new IllegalStateException("Firestore " + code);
            JSONObject f = new JSONObject(txt).optJSONObject("fields");
            boolean act = f != null && f.optJSONObject("active") != null && f.getJSONObject("active").optBoolean("booleanValue", false);
            long until = 0;
            if (f != null && f.optJSONObject("until") != null) {
                until = parseTs(f.getJSONObject("until").optString("timestampValue", ""));
                if (until <= 0) act = false; // unreadable date — no access
            }
            if (act && until > 0 && until <= now) act = false;
            if (!act) { clearCache(); return no(until > 0 && until <= now ? "срок записи истёк" : "запись не активна", true); }
            saveCache(now, until);
            JSObject o = new JSObject();
            o.put("active", true); o.put("checked", now); o.put("until", until); o.put("email", email); o.put("signedIn", true);
            return o;
        } catch (IOException e) {
            // no network: the last confirmed record, at most 7 days old
            long[] c = readCache();
            if (c != null && now - c[0] >= 0 && now - c[0] < OFFLINE_MS && (c[1] == 0 || c[1] > now)) {
                JSObject o = new JSObject();
                o.put("active", true); o.put("checked", c[0]); o.put("until", c[1]); o.put("email", email); o.put("signedIn", true); o.put("offline", true);
                return o;
            }
            return no("нет связи, подтверждённой записи в кэше нет", true);
        } catch (Exception e) {
            return no(msg(e), true);
        }
    }

    private JSObject no(String err, boolean signedIn) {
        JSObject o = new JSObject();
        o.put("active", false); o.put("err", err); o.put("signedIn", signedIn); o.put("conf", configured());
        String em = prefs().getString("email", "");
        if (signedIn && !em.isEmpty()) o.put("email", em);
        return o;
    }

    private boolean hasAccount() { return prefs().getString("rt", null) != null; }

    private static String msg(Exception e) { return e.getMessage() == null ? e.toString() : e.getMessage(); }

    private static long parseTs(String s) {
        try {
            if (s.length() < 19) return 0;
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            return f.parse(s.substring(0, 19)).getTime(); // Firestore gives UTC («Z»)
        } catch (Exception e) { return 0; }
    }

    // ---------- HTTP (API key restricted to this Android app: package + certificate headers) ----------

    private HttpURLConnection open(String url) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15000); h.setReadTimeout(15000);
        h.setRequestProperty("X-Android-Package", getContext().getPackageName());
        String cert = certSha1();
        if (cert != null) h.setRequestProperty("X-Android-Cert", cert);
        return h;
    }

    private JSONObject post(String url, String type, String body) throws Exception {
        HttpURLConnection h = open(url);
        h.setRequestMethod("POST"); h.setDoOutput(true);
        h.setRequestProperty("Content-Type", type);
        try (OutputStream os = h.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
        int code = h.getResponseCode();
        String txt = read(code < 400 ? h.getInputStream() : h.getErrorStream());
        if (code != 200) {
            String m = "";
            try { m = new JSONObject(txt).getJSONObject("error").optString("message", ""); } catch (Exception ignored) { }
            throw new IllegalStateException("Firebase " + code + (m.isEmpty() ? "" : ": " + m));
        }
        return new JSONObject(txt);
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream i = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
            while ((n = i.read(buf)) > 0) b.write(buf, 0, n);
            return new String(b.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    @SuppressWarnings("deprecation")
    private String certSha1() {
        try {
            PackageManager pm = getContext().getPackageManager();
            Signature[] sg;
            if (Build.VERSION.SDK_INT >= 28) {
                PackageInfo pi = pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                sg = pi.signingInfo.hasMultipleSigners() ? pi.signingInfo.getApkContentsSigners() : pi.signingInfo.getSigningCertificateHistory();
            } else {
                sg = pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNATURES).signatures;
            }
            if (sg == null || sg.length == 0) return null;
            byte[] d = MessageDigest.getInstance("SHA-1").digest(sg[sg.length - 1].toByteArray());
            StringBuilder s = new StringBuilder();
            for (byte x : d) s.append(String.format(Locale.ROOT, "%02X", x));
            return s.toString();
        } catch (Exception e) { return null; }
    }

    // ---------- signed cache and clock ----------

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private long effNow() {
        SharedPreferences sp = prefs();
        long now = System.currentTimeMillis(), max = sp.getLong("maxNow", 0);
        if (now > max) { sp.edit().putLong("maxNow", now).apply(); return now; }
        return max;
    }

    private void saveCache(long at, long until) {
        String v = at + ":" + until + ":" + prefs().getString("email", "");
        String sig = sign(v);
        if (sig == null) return;
        prefs().edit().putString("cache", v).putString("cacheSig", sig).apply();
    }

    private void clearCache() { prefs().edit().remove("cache").remove("cacheSig").apply(); }

    /** {checkedAt, until} or null when missing, tampered with or for another account. */
    private long[] readCache() {
        SharedPreferences sp = prefs();
        String v = sp.getString("cache", null), sig = sp.getString("cacheSig", null);
        if (v == null || sig == null) return null;
        String want = sign(v);
        if (want == null || !want.equals(sig)) return null;
        try {
            String[] a = v.split(":", 3);
            if (a.length < 3 || !a[2].equals(sp.getString("email", ""))) return null;
            return new long[]{Long.parseLong(a[0]), Long.parseLong(a[1])};
        } catch (Exception e) { return null; }
    }

    private String sign(String v) {
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            SecretKey key;
            if (ks.containsAlias(KEY_ALIAS)) key = (SecretKey) ks.getKey(KEY_ALIAS, null);
            else {
                KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore");
                kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN).build());
                key = kg.generateKey();
            }
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return Base64.encodeToString(mac.doFinal(v.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        } catch (Exception e) { return null; }
    }
}
