package ai.codespectra.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.MotionEvent;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

/**
 * CodeSpectra shell: a Capacitor bridge around the live site (server.url per
 * build flavour). Native additions live in {@link CodeSpectraNativePlugin}
 * (lockdown, Play Integrity, sharing files, system bar theme) and
 * {@link DownloadHelper} (certificate / PDF downloads → share sheet).
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CodeSpectraNativePlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        WebView webView = bridge.getWebView();
        webView.setDownloadListener(new DownloadHelper(this, webView));
        openLinkFromIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openLinkFromIntent(intent);
    }

    /**
     * App Links (https://<our host>/...) and notification taps (FCM data
     * "link" = a site path, set by frontend lib/push-notifications.ts) open
     * that page in the WebView. Anything else is ignored.
     */
    private void openLinkFromIntent(Intent intent) {
        if (intent == null || bridge == null) return;
        String target = DeepLinks.resolve(serverUrl(), intent.getDataString(), intent.getStringExtra("link"));
        if (target == null) return;
        WebView webView = bridge.getWebView();
        webView.post(() -> webView.loadUrl(target));
    }

    String serverUrl() {
        String url = bridge != null ? bridge.getServerUrl() : null;
        return url != null && !url.isEmpty() ? url : BuildConfig.SERVER_URL;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
            "general",
            getString(R.string.notification_channel_general),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(getString(R.string.notification_channel_general_desc));
        nm.createNotificationChannel(channel);
    }

    // ── Lockdown signals forwarded to the plugin ─────────────────────────

    private CodeSpectraNativePlugin nativePlugin() {
        if (bridge == null) return null;
        PluginHandle handle = bridge.getPlugin("CodeSpectraNative");
        return handle != null ? (CodeSpectraNativePlugin) handle.getInstance() : null;
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        CodeSpectraNativePlugin p = nativePlugin();
        if (p != null) p.onWindowFocus(hasFocus);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        int obscured = MotionEvent.FLAG_WINDOW_IS_OBSCURED;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) obscured |= MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED;
        if ((ev.getFlags() & obscured) != 0) {
            CodeSpectraNativePlugin p = nativePlugin();
            if (p != null) p.onObscuredTouch();
        }
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public void onMultiWindowModeChanged(boolean isInMultiWindowMode, Configuration newConfig) {
        super.onMultiWindowModeChanged(isInMultiWindowMode, newConfig);
        CodeSpectraNativePlugin p = nativePlugin();
        if (p != null) p.onMultiWindow(isInMultiWindowMode);
    }
}
