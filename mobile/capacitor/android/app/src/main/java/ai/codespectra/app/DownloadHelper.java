package ai.codespectra.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * WebViews don't download files on their own. Certificates, reports and
 * other PDFs the site serves (Content-Disposition: attachment, or <a download>)
 * are fetched here with the WebView's own cookies — only from the site's
 * host — saved to the app cache and handed to the system share sheet
 * ("Save to Files", Drive, WhatsApp…). blob: URLs (files built in the page)
 * are read by the page and passed to CodeSpectraNative.shareFile.
 */
final class DownloadHelper implements DownloadListener {
    private static final int MAX_BYTES = 25 * 1024 * 1024;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private final Activity activity;
    private final WebView webView;

    DownloadHelper(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @Override
    public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        String name = safeFileName(URLUtil.guessFileName(url, contentDisposition, mimeType), mimeType);
        if (url.startsWith("blob:")) {
            shareBlob(url, name, mimeType);
            return;
        }
        if (!sameHost(url)) {
            // Not ours: let the browser handle it (no cookies leave the app).
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            return;
        }
        if (contentLength > MAX_BYTES) {
            toast(R.string.download_failed);
            return;
        }
        toast(R.string.download_started);
        String cookies = CookieManager.getInstance().getCookie(url);
        IO.execute(() -> {
            HttpURLConnection conn = null;
            try {
                // Follow up to 3 redirects by hand (e.g. to a short-lived storage
                // URL); cookies go only to the site's own host.
                String next = url;
                for (int hop = 0; ; hop++) {
                    conn = (HttpURLConnection) new URL(next).openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(15_000);
                    conn.setReadTimeout(60_000);
                    if (cookies != null && sameHost(next)) conn.setRequestProperty("Cookie", cookies);
                    if (userAgent != null) conn.setRequestProperty("User-Agent", userAgent);
                    int code = conn.getResponseCode();
                    if (code == 200) break;
                    String loc = conn.getHeaderField("Location");
                    conn.disconnect();
                    conn = null;
                    if (code < 300 || code > 399 || loc == null || hop >= 3) throw new IllegalStateException("HTTP " + code);
                    next = new URL(new URL(next), loc).toString();
                    if (!next.startsWith("https://")) throw new IllegalStateException("insecure redirect");
                }
                byte[] bytes = readCapped(conn.getInputStream());
                String type = mimeType != null && !mimeType.isEmpty() ? mimeType : conn.getContentType();
                File f = writeToCache(activity, name, bytes);
                activity.runOnUiThread(() -> share(activity, f, type));
            } catch (Exception e) {
                activity.runOnUiThread(() -> toast(R.string.download_failed));
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private boolean sameHost(String url) {
        try {
            String server = ((MainActivity) activity).serverUrl();
            Uri a = Uri.parse(url);
            Uri b = Uri.parse(server);
            return "https".equals(a.getScheme()) && a.getHost() != null && a.getHost().equalsIgnoreCase(b.getHost());
        } catch (Exception e) {
            return false;
        }
    }

    /** Read the blob inside the page (same origin) and pass it to shareFile. */
    private void shareBlob(String url, String name, String mimeType) {
        String js = "(function(){var u=" + JSONObject.quote(url) + ",n=" + JSONObject.quote(name)
            + ",m=" + JSONObject.quote(mimeType == null ? "" : mimeType) + ";"
            + "fetch(u).then(function(r){return r.blob()}).then(function(b){"
            + "if(b.size>" + MAX_BYTES + ")throw 0;var f=new FileReader();f.onload=function(){"
            + "window.Capacitor.nativePromise('CodeSpectraNative','shareFile',{base64:String(f.result),filename:n,mimeType:m||b.type})};"
            + "f.readAsDataURL(b)}).catch(function(){})})()";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private static byte[] readCapped(InputStream in) throws Exception {
        try (InputStream is = in; java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buf = new byte[16 * 1024];
            int total = 0;
            int n;
            while ((n = is.read(buf)) != -1) {
                total += n;
                if (total > MAX_BYTES) throw new IllegalStateException("too large");
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    static File writeToCache(Context ctx, String name, byte[] bytes) throws Exception {
        File dir = new File(ctx.getCacheDir(), "downloads");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no cache dir");
        // Old shared files are not kept around.
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 24 * 3600_000L) f.delete();
        File f = new File(dir, name);
        try (OutputStream out = new FileOutputStream(f)) {
            out.write(bytes);
        }
        return f;
    }

    static void share(Activity a, File f, String mimeType) {
        Uri uri = FileProvider.getUriForFile(a, a.getPackageName() + ".fileprovider", f);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeType != null && !mimeType.isEmpty() ? mimeType.split(";")[0] : "application/octet-stream");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        a.startActivity(Intent.createChooser(send, a.getString(R.string.download_share_title)));
    }

    static String safeFileName(String name, String mimeType) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_").replaceAll("^\\.+", "");
        if (n.length() > 100) n = n.substring(n.length() - 100);
        if (n.isEmpty() || n.endsWith(".bin")) {
            String ext = mimeType != null && mimeType.contains("pdf") ? ".pdf" : mimeType != null && mimeType.contains("png") ? ".png" : "";
            n = (n.isEmpty() ? "codespectra-download" : n.substring(0, n.length() - 4)) + ext;
        }
        return n;
    }

    private void toast(int res) {
        Toast.makeText(activity, res, Toast.LENGTH_SHORT).show();
    }
}
