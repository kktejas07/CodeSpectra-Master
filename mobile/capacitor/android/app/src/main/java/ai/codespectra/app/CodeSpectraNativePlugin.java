package ai.codespectra.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManager;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.IntegrityTokenRequest;

import java.io.File;
import java.util.Locale;
import java.util.concurrent.Executor;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/**
 * Native features the web app calls through frontend/lib/native-bridge.ts
 * (Capacitor.nativePromise("CodeSpectraNative", method, options)).
 *
 * Lockdown (proctored tests):
 *   startLockdown → FLAG_SECURE (no screenshots / recording / recents
 *   thumbnail), hide other apps' overlays (API 31+), screen pinning via
 *   startLockTask (the user confirms; full kiosk needs a device-owner MDM),
 *   back disabled, and "lockdownEvent" notifications for:
 *     app_background{duration_ms}  focus_lost{duration_ms}  overlay_detected
 *     multi_window  external_display{screens}  screenshot  screen_recording
 *     lock_task_exit  lock_task_declined  back_blocked
 *   stopLockdown (on submit) undoes all of it.
 * Nothing here judges the candidate: the web side forwards the events to
 * the integrity API as signals for a human reviewer.
 */
@CapacitorPlugin(name = "CodeSpectraNative")
public class CodeSpectraNativePlugin extends Plugin {

    static final String EVENT = "lockdownEvent";
    private static final long FOCUS_GRACE_MS = 3_000;
    private static final long OBSCURED_THROTTLE_MS = 10_000;
    private static final long LOCK_POLL_MS = 2_000;
    private static final long PIN_DECLINED_AFTER_MS = 10_000;
    private static final Pattern NONCE = Pattern.compile("^[A-Za-z0-9_-]{16,500}={0,2}$");
    private static final Pattern LOCALE = Pattern.compile("^(en|hi|te)$");
    private static final int MAX_SHARE_BYTES = 25 * 1024 * 1024;

    private final Handler main = new Handler(Looper.getMainLooper());

    private boolean lockdown = false;
    private boolean wasPinned = false;
    private boolean declinedReported = false;
    private long lockStartedAt = 0;
    private long pausedAt = 0;
    private long focusLostAt = 0;
    private long lastObscuredAt = 0;
    private String locale = null;

    private Runnable lockPoll;
    private OnBackPressedCallback backCallback;
    private DisplayManager.DisplayListener displayListener;
    private Object screenCaptureCallback; // Activity.ScreenCaptureCallback (API 34+)
    private Consumer<Integer> recordingCallback; // API 35+

    // ── Lockdown ──────────────────────────────────────────────────────────

    @PluginMethod
    public void startLockdown(PluginCall call) {
        String loc = call.getString("locale");
        locale = loc != null && LOCALE.matcher(loc).matches() ? loc : null;
        boolean pin = Boolean.TRUE.equals(call.getBoolean("pin", true));
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (!lockdown) {
                lockdown = true;
                wasPinned = false;
                declinedReported = false;
                lockStartedAt = now();
                pausedAt = 0;
                focusLostAt = 0;
                Window w = activity.getWindow();
                w.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) w.setHideOverlayWindows(true);
                if (pin) {
                    try {
                        activity.startLockTask();
                    } catch (Exception e) {
                        emit("lock_task_declined", null);
                        declinedReported = true;
                    }
                }
                registerBackBlocker(activity);
                registerCaptureCallbacks(activity);
                registerDisplayListener();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInMultiWindowMode()) emit("multi_window", null);
                int screens = displayCount();
                if (screens > 1) emit("external_display", screensData(screens));
                startLockPoll(activity, pin);
            }
            call.resolve(status());
        });
    }

    @PluginMethod
    public void stopLockdown(PluginCall call) {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            endLockdown(activity);
            call.resolve(status());
        });
    }

    @PluginMethod
    public void lockdownStatus(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(status()));
    }

    private void endLockdown(Activity activity) {
        if (!lockdown) return;
        lockdown = false;
        Window w = activity.getWindow();
        w.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) w.setHideOverlayWindows(false);
        if (lockPoll != null) main.removeCallbacks(lockPoll);
        lockPoll = null;
        try {
            if (lockTaskState(activity) != ActivityManager.LOCK_TASK_MODE_NONE) activity.stopLockTask();
        } catch (Exception ignored) {
            // not pinned by us
        }
        if (backCallback != null) backCallback.remove();
        backCallback = null;
        unregisterCaptureCallbacks(activity);
        if (displayListener != null) {
            DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
            if (dm != null) dm.unregisterDisplayListener(displayListener);
        }
        displayListener = null;
    }

    private JSObject status() {
        JSObject r = new JSObject();
        r.put("active", lockdown);
        r.put("pinned", lockdown && lockTaskState(getActivity()) != ActivityManager.LOCK_TASK_MODE_NONE);
        r.put("secure", lockdown);
        return r;
    }

    private int lockTaskState(Activity activity) {
        ActivityManager am = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
        return am == null ? ActivityManager.LOCK_TASK_MODE_NONE : am.getLockTaskModeState();
    }

    private void startLockPoll(Activity activity, boolean pinRequested) {
        lockPoll = new Runnable() {
            @Override
            public void run() {
                if (!lockdown) return;
                boolean pinned = lockTaskState(activity) != ActivityManager.LOCK_TASK_MODE_NONE;
                if (pinned) wasPinned = true;
                else if (wasPinned) {
                    wasPinned = false;
                    emit("lock_task_exit", null);
                } else if (pinRequested && !declinedReported && now() - lockStartedAt > PIN_DECLINED_AFTER_MS) {
                    declinedReported = true;
                    emit("lock_task_declined", null);
                }
                main.postDelayed(this, LOCK_POLL_MS);
            }
        };
        main.postDelayed(lockPoll, LOCK_POLL_MS);
    }

    private void registerBackBlocker(Activity activity) {
        if (!(activity instanceof AppCompatActivity)) return;
        backCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                Toast.makeText(localized(), R.string.lockdown_blocked_back, Toast.LENGTH_SHORT).show();
                emit("back_blocked", null);
            }
        };
        ((AppCompatActivity) activity).getOnBackPressedDispatcher().addCallback(backCallback);
    }

    private void registerCaptureCallbacks(Activity activity) {
        if (Build.VERSION.SDK_INT < 34) return;
        Executor exec = activity.getMainExecutor();
        {
            try {
                Activity.ScreenCaptureCallback cb = () -> emit("screenshot", null);
                activity.registerScreenCaptureCallback(exec, cb);
                screenCaptureCallback = cb;
            } catch (Exception ignored) {
                // permission missing on this build
            }
        }
        if (Build.VERSION.SDK_INT >= 35) {
            try {
                WindowManager wm = activity.getWindowManager();
                recordingCallback = state -> {
                    if (state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE) emit("screen_recording", null);
                };
                int initial = wm.addScreenRecordingCallback(exec, recordingCallback);
                if (initial == WindowManager.SCREEN_RECORDING_STATE_VISIBLE) emit("screen_recording", null);
            } catch (Exception ignored) {
                recordingCallback = null;
            }
        }
    }

    private void unregisterCaptureCallbacks(Activity activity) {
        if (Build.VERSION.SDK_INT >= 34 && screenCaptureCallback != null) {
            try {
                activity.unregisterScreenCaptureCallback((Activity.ScreenCaptureCallback) screenCaptureCallback);
            } catch (Exception ignored) {
                // already gone
            }
        }
        screenCaptureCallback = null;
        if (Build.VERSION.SDK_INT >= 35 && recordingCallback != null) {
            try {
                activity.getWindowManager().removeScreenRecordingCallback(recordingCallback);
            } catch (Exception ignored) {
                // already gone
            }
        }
        recordingCallback = null;
    }

    private void registerDisplayListener() {
        DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        if (dm == null) return;
        displayListener = new DisplayManager.DisplayListener() {
            @Override
            public void onDisplayAdded(int displayId) {
                int n = displayCount();
                if (lockdown && n > 1) emit("external_display", screensData(n));
            }

            @Override
            public void onDisplayRemoved(int displayId) {}

            @Override
            public void onDisplayChanged(int displayId) {}
        };
        dm.registerDisplayListener(displayListener, main);
    }

    private int displayCount() {
        DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        if (dm == null) return 1;
        // Presentation displays = casting / HDMI / wireless display.
        Display[] all = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        return 1 + (all == null ? 0 : all.length);
    }

    private static JSObject screensData(int n) {
        JSObject d = new JSObject();
        d.put("screens", n);
        return d;
    }

    // Activity lifecycle (Capacitor calls these on the plugin).
    @Override
    protected void handleOnPause() {
        if (lockdown) {
            pausedAt = now();
            focusLostAt = 0; // the pause covers it; don't report twice
        }
    }

    @Override
    protected void handleOnResume() {
        if (lockdown && pausedAt > 0) {
            JSObject d = new JSObject();
            d.put("duration_ms", now() - pausedAt);
            emit("app_background", d);
        }
        pausedAt = 0;
    }

    @Override
    protected void handleOnDestroy() {
        Activity a = getActivity();
        if (a != null) endLockdown(a);
    }

    /** From MainActivity: system dialogs, notification shade, overlays take focus. */
    void onWindowFocus(boolean hasFocus) {
        if (!lockdown || now() - lockStartedAt < FOCUS_GRACE_MS) return;
        if (!hasFocus) {
            if (pausedAt == 0) focusLostAt = now();
        } else if (focusLostAt > 0 && pausedAt == 0) {
            JSObject d = new JSObject();
            d.put("duration_ms", now() - focusLostAt);
            focusLostAt = 0;
            emit("focus_lost", d);
        }
    }

    /** From MainActivity: a touch passed through another app's overlay window. */
    void onObscuredTouch() {
        if (!lockdown) return;
        long t = now();
        if (t - lastObscuredAt < OBSCURED_THROTTLE_MS) return;
        lastObscuredAt = t;
        emit("overlay_detected", null);
    }

    void onMultiWindow(boolean inMultiWindow) {
        if (lockdown && inMultiWindow) emit("multi_window", null);
    }

    private void emit(String type, JSObject extra) {
        JSObject d = extra != null ? extra : new JSObject();
        d.put("type", type);
        d.put("at", now());
        notifyListeners(EVENT, d);
    }

    private static long now() {
        return System.currentTimeMillis();
    }

    // ── Play Integrity (classic request, server-issued nonce) ─────────────

    @PluginMethod
    public void requestIntegrityToken(PluginCall call) {
        String nonce = call.getString("nonce");
        if (nonce == null || !NONCE.matcher(nonce).matches()) {
            call.reject("Invalid nonce", "invalid_nonce");
            return;
        }
        try {
            IntegrityManager manager = IntegrityManagerFactory.create(getContext().getApplicationContext());
            IntegrityTokenRequest.Builder req = IntegrityTokenRequest.builder().setNonce(nonce);
            if (BuildConfig.PLAY_CLOUD_PROJECT_NUMBER > 0) req.setCloudProjectNumber(BuildConfig.PLAY_CLOUD_PROJECT_NUMBER);
            manager.requestIntegrityToken(req.build())
                .addOnSuccessListener(r -> {
                    JSObject out = new JSObject();
                    out.put("token", r.token());
                    call.resolve(out);
                })
                .addOnFailureListener(e -> call.reject("Play Integrity unavailable", "integrity_unavailable"));
        } catch (Exception e) {
            call.reject("Play Integrity unavailable", "integrity_unavailable");
        }
    }

    // ── Files: save / share a generated file (certificates, PDFs) ─────────

    @PluginMethod
    public void shareFile(PluginCall call) {
        String b64 = call.getString("base64");
        String name = DownloadHelper.safeFileName(call.getString("filename"), call.getString("mimeType"));
        String mime = call.getString("mimeType", "application/octet-stream");
        if (b64 == null || b64.length() > (MAX_SHARE_BYTES / 3) * 4 + 4) {
            call.reject("File too large", "file_too_large");
            return;
        }
        int comma = b64.indexOf(',');
        if (b64.startsWith("data:") && comma > 0) b64 = b64.substring(comma + 1);
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            File f = DownloadHelper.writeToCache(getContext(), name, bytes);
            Activity a = getActivity();
            a.runOnUiThread(() -> {
                DownloadHelper.share(a, f, mime);
                call.resolve();
            });
        } catch (Exception e) {
            call.reject("Could not share file", "share_failed");
        }
    }

    // ── Biometric enrolment consent + prompt strings in the web UI language ─

    @PluginMethod
    public void confirmBiometricEnroll(PluginCall call) {
        String loc = call.getString("locale");
        locale = loc != null && LOCALE.matcher(loc).matches() ? loc : null;
        Activity a = getActivity();
        a.runOnUiThread(() -> {
            Context c = localized();
            final boolean[] done = { false };
            new AlertDialog.Builder(a)
                .setTitle(c.getString(R.string.biometric_enroll_title))
                .setMessage(c.getString(R.string.biometric_enroll_body))
                .setPositiveButton(c.getString(R.string.biometric_enroll_yes), (d, w) -> answer(call, done, true))
                .setNegativeButton(c.getString(R.string.biometric_enroll_no), (d, w) -> answer(call, done, false))
                .setOnDismissListener(d -> answer(call, done, false))
                .show();
        });
    }

    private static void answer(PluginCall call, boolean[] done, boolean accepted) {
        if (done[0]) return;
        done[0] = true;
        JSObject r = new JSObject();
        r.put("accepted", accepted);
        call.resolve(r);
    }

    @PluginMethod
    public void biometricPromptStrings(PluginCall call) {
        String loc = call.getString("locale");
        locale = loc != null && LOCALE.matcher(loc).matches() ? loc : null;
        Context c = localized();
        JSObject r = new JSObject();
        r.put("title", c.getString(R.string.biometric_prompt_title));
        r.put("reason", c.getString(R.string.biometric_prompt_reason));
        r.put("cancel", c.getString(R.string.biometric_prompt_cancel));
        call.resolve(r);
    }

    private Context localized() {
        Context base = getContext();
        if (locale == null) return base;
        Configuration conf = new Configuration(base.getResources().getConfiguration());
        conf.setLocale(Locale.forLanguageTag(locale));
        return base.createConfigurationContext(conf);
    }

    // ── System bars follow the web app's theme ────────────────────────────

    @PluginMethod
    public void setSystemBarTheme(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", true));
        String color = call.getString("color");
        Activity a = getActivity();
        a.runOnUiThread(() -> {
            Window w = a.getWindow();
            if (color != null && color.matches("^#[0-9a-fA-F]{6}$")) {
                w.getDecorView().setBackgroundColor(Color.parseColor(color));
            }
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(!dark);
            c.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }

    // ── App info (for support / device trust) ─────────────────────────────

    @PluginMethod
    public void appInfo(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("versionName", pi.versionName);
            r.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode);
        } catch (Exception ignored) {
            // leave out
        }
        r.put("packageName", getContext().getPackageName());
        r.put("flavor", BuildConfig.FLAVOR);
        r.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(r);
    }
}
