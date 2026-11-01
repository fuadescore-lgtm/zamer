package PKG;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/**
 * BIMsketcher Pro subscription via Google Play Billing (no own server).
 *
 * - Google Play is the source of truth: queryPurchasesAsync() returns only subscriptions that
 *   currently grant access (active, trial-by-promo-code, grace period, cancelled-but-paid).
 *   Account hold / paused / expired are not returned; suspended ones are flagged and ignored.
 * - Every PURCHASED subscription is acknowledged (otherwise Google refunds it after 3 days).
 * - The 14-day in-app trial (no card) starts on the first run and is stored on the device.
 *   Clock rollback is detected by remembering the latest time ever seen.
 * - The last successful Play answer is cached for offline use (max 7 days) and protected by an
 *   HMAC whose key lives in Android Keystore, so the cache cannot be edited by hand.
 */
@CapacitorPlugin(name = "Billing")
public class BillingPlugin extends Plugin implements PurchasesUpdatedListener {
    static final String PRODUCT = "bimsketcher_pro";
    static final long DAY = 24L * 3600 * 1000;
    static final long TRIAL_MS = 14 * DAY;
    static final long OFFLINE_MS = 7 * DAY;
    private static final String PREFS = "bs_license";
    private static final String KEY_ALIAS = "bs_license_hmac";

    private BillingClient client;
    private final List<Runnable> waiting = new ArrayList<>();
    private boolean connecting = false;
    private ProductDetails details;
    private PluginCall buyCall;

    // ---------- connection ----------

    private void withClient(Runnable ok, PluginCall call) {
        if (client == null) {
            client = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().enablePrepaidPlans().build())
                .enableAutoServiceReconnection()
                .build();
        }
        if (client.isReady()) { ok.run(); return; }
        synchronized (waiting) {
            waiting.add(ok);
            if (connecting) return;
            connecting = true;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                List<Runnable> run;
                synchronized (waiting) { connecting = false; run = new ArrayList<>(waiting); waiting.clear(); }
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) { for (Runnable x : run) x.run(); }
                else {
                    // Billing unavailable (no Play Store, offline, blocked): answer from the cache
                    for (Runnable x : run) x.run();
                }
            }
            @Override
            public void onBillingServiceDisconnected() {
                synchronized (waiting) { connecting = false; }
            }
        });
    }

    // ---------- status ----------

    @PluginMethod
    public void status(PluginCall call) {
        withClient(() -> {
            if (!client.isReady()) { call.resolve(answer(null, false)); return; }
            client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (r, purchases) -> {
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.resolve(answer(null, false)); return; }
                    call.resolve(answer(purchases, true));
                });
        }, call);
    }

    /** Builds the answer for JS from Play purchases (or from the offline cache when Play is not reachable). */
    private JSObject answer(List<Purchase> purchases, boolean fromPlay) {
        long now = effNow();
        long t0 = trialStart(now);
        JSObject o = new JSObject();
        boolean pro = false, pending = false, suspended = false, autoRenew = false;
        if (fromPlay && purchases != null) {
            for (Purchase p : purchases) {
                if (!p.getProducts().contains(PRODUCT)) continue;
                int st = p.getPurchaseState();
                if (st == Purchase.PurchaseState.PENDING) { pending = true; continue; }
                if (st != Purchase.PurchaseState.PURCHASED) continue;
                if (p.isSuspended()) { suspended = true; continue; }
                pro = true;
                autoRenew = autoRenew || p.isAutoRenewing();
                if (!p.isAcknowledged()) acknowledge(p);
            }
            saveCache(pro, now);
            o.put("checked", now);
        } else {
            long[] c = readCache();
            if (c != null && now - c[1] >= 0 && now - c[1] < OFFLINE_MS) {
                pro = c[0] == 1;
                o.put("checked", c[1]);
            }
            o.put("offline", true);
        }
        o.put("pro", pro);
        o.put("pending", pending);
        o.put("suspended", suspended);
        o.put("autoRenew", autoRenew);
        o.put("now", now);
        o.put("trialStart", t0);
        o.put("trialLeft", Math.max(0, t0 + TRIAL_MS - now));
        return o;
    }

    private void acknowledge(Purchase p) {
        AcknowledgePurchaseParams ap = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build();
        client.acknowledgePurchase(ap, r -> { /* retried on the next status() if it failed */ });
    }

    // ---------- products and purchase ----------

    @PluginMethod
    public void products(PluginCall call) {
        withClient(() -> {
            if (!client.isReady()) { call.reject("Google Play недоступен"); return; }
            QueryProductDetailsParams q = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(PRODUCT).setProductType(BillingClient.ProductType.SUBS).build()))
                .build();
            client.queryProductDetailsAsync(q, (r, res) -> {
                List<ProductDetails> list = res == null ? null : res.getProductDetailsList();
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || list == null || list.isEmpty()) {
                    call.reject("Подписка не найдена в Google Play (" + r.getResponseCode() + ")"); return;
                }
                details = list.get(0);
                JSArray plans = new JSArray();
                List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                if (offers != null) for (ProductDetails.SubscriptionOfferDetails d : offers) {
                    // Base plans only (offers come from promo codes / Play Console promotions)
                    if (d.getOfferId() != null) continue;
                    List<ProductDetails.PricingPhase> ph = d.getPricingPhases().getPricingPhaseList();
                    if (ph.isEmpty()) continue;
                    ProductDetails.PricingPhase last = ph.get(ph.size() - 1);
                    JSObject j = new JSObject();
                    j.put("plan", d.getBasePlanId());
                    j.put("price", last.getFormattedPrice());
                    j.put("micros", last.getPriceAmountMicros());
                    j.put("currency", last.getPriceCurrencyCode());
                    j.put("period", last.getBillingPeriod());
                    plans.put(j);
                }
                JSObject o = new JSObject();
                o.put("plans", plans);
                call.resolve(o);
            });
        }, call);
    }

    @PluginMethod
    public void buy(PluginCall call) {
        final String plan = call.getString("plan", "monthly");
        final Activity act = getActivity();
        withClient(() -> {
            if (!client.isReady() || details == null) { call.reject("Google Play недоступен — откройте экран подписки ещё раз"); return; }
            String token = null;
            List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
            if (offers != null) for (ProductDetails.SubscriptionOfferDetails d : offers)
                if (plan.equals(d.getBasePlanId()) && d.getOfferId() == null) token = d.getOfferToken();
            if (token == null) { call.reject("План не найден: " + plan); return; }
            BillingFlowParams fp = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details).setOfferToken(token).build()))
                .build();
            buyCall = call;
            final BillingFlowParams params = fp;
            act.runOnUiThread(() -> {
                BillingResult r = client.launchBillingFlow(act, params);
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK && buyCall != null) {
                    PluginCall c = buyCall; buyCall = null;
                    c.reject("Не удалось открыть оплату (" + r.getResponseCode() + ")");
                }
            });
        }, call);
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        PluginCall c = buyCall; buyCall = null;
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK || code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            // Re-read everything from Play so the answer is the same as on start-up
            client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (r2, all) -> {
                    JSObject o = answer(r2.getResponseCode() == BillingClient.BillingResponseCode.OK ? all : purchases, true);
                    if (c != null) c.resolve(o);
                    notifyListeners("change", o);
                });
            return;
        }
        if (c == null) return;
        JSObject o = new JSObject();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) { o.put("canceled", true); c.resolve(o); }
        else c.reject("Оплата не прошла (" + code + ")");
    }

    // ---------- Play Store pages ----------

    @PluginMethod
    public void manage(PluginCall call) {
        open("https://play.google.com/store/account/subscriptions?sku=" + PRODUCT + "&package=" + getContext().getPackageName());
        call.resolve();
    }

    @PluginMethod
    public void redeem(PluginCall call) {
        open("https://play.google.com/redeem");
        call.resolve();
    }

    private void open(String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
    }

    // ---------- trial, clock and protected cache ----------

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Current time that never goes backwards (protects the trial and the offline cache from clock rollback). */
    private long effNow() {
        SharedPreferences sp = prefs();
        long now = System.currentTimeMillis(), max = sp.getLong("maxNow", 0);
        if (now > max) { sp.edit().putLong("maxNow", now).apply(); return now; }
        return max;
    }

    private long trialStart(long now) {
        SharedPreferences sp = prefs();
        long t0 = sp.getLong("t0", 0);
        if (t0 <= 0 || t0 > now) { t0 = now; sp.edit().putLong("t0", t0).apply(); }
        return t0;
    }

    private void saveCache(boolean pro, long at) {
        String v = (pro ? "1" : "0") + ":" + at;
        String sig = sign(v);
        if (sig == null) return;
        prefs().edit().putString("cache", v).putString("cacheSig", sig).apply();
    }

    /** Returns {pro(0/1), checkedAt} or null when missing or tampered with. */
    private long[] readCache() {
        SharedPreferences sp = prefs();
        String v = sp.getString("cache", null), sig = sp.getString("cacheSig", null);
        if (v == null || sig == null) return null;
        String want = sign(v);
        if (want == null || !want.equals(sig)) return null;
        try { String[] a = v.split(":"); return new long[]{Long.parseLong(a[0]), Long.parseLong(a[1])}; }
        catch (Exception e) { return null; }
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
