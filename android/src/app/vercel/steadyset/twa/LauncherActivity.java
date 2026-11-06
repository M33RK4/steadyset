package app.vercel.steadyset.twa;

import android.Manifest;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.animation.Interpolator;
import android.view.animation.PathInterpolator;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * The Android app: the live site in a full-screen WebView, so every deploy reaches it without a new
 * APK. What a web page can't do itself lives here: the loading screen, the colour of the phone's
 * system bars, notifications, saving files and sharing. The site reaches these through the
 * `SteadysetApp` object below (see src/lib/pwa/native.ts).
 */
public class LauncherActivity extends Activity {
    private static final String HOME = "https://steadyset.vercel.app/";
    private static final String HOST = "steadyset.vercel.app";
    private static final int SPLASH_COLOR = 0xFF14243A;
    private static final int SPLASH_GLOW = 0xFF21406B;
    /** Long enough for the logo's animation to finish, even if the app is ready sooner. */
    private static final long MIN_SPLASH_MS = 1000;
    /** If the site never says it's ready, the loading screen still gets out of the way. */
    private static final long GIVE_UP_MS = 9000;
    private static final int REQ_NOTIFICATIONS = 1;
    private static final int REQ_SAVE = 2;
    /** The back button closes an open dialog before it goes back a page. */
    private static final String CLOSE_DIALOG = "(function(){if(!document.querySelector('[role=dialog]:not([data-leaving])'))return false;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true})()";

    /** Read by AlertReceiver: while the app is open, the site makes its own sound. */
    static boolean inForeground;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable giveUp = this::leaveSplash;
    private FrameLayout root;
    private WebView web;
    private View splash;
    private View mark;
    private View offline;
    private ObjectAnimator glowLoop;
    private long splashStart;
    private boolean leaving;
    private int barColor = SPLASH_COLOR;
    private int wantedBarColor = SPLASH_COLOR;
    private ValueAnimator barFade;
    private String pendingSave;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        root = new FrameLayout(this);
        root.setBackgroundColor(SPLASH_COLOR);

        // made first, while the screen is still plain: the first WebView of a launch takes a moment
        // to start, and the logo's animation shouldn't stutter through that
        web = new WebView(this);
        web.setBackgroundColor(SPLASH_COLOR);
        setUpWebView();
        root.addView(web, match());

        if (saved == null) {
            splash = buildSplash();
            root.addView(splash, match());
        }
        setContentView(root);
        paintBars(SPLASH_COLOR);

        String restored = saved != null ? saved.getString("url") : null;
        web.loadUrl(restored != null ? restored : urlFrom(getIntent()));

        if (splash != null) {
            splashStart = SystemClock.uptimeMillis();
            ui.postDelayed(giveUp, GIVE_UP_MS);
        }
    }

    private void setUpWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // the rest timer's chime plays without a tap
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " SteadysetApp/" + BuildConfigVersion.NAME);
        web.addJavascriptInterface(new Bridge(), "SteadysetApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                // anything else isn't the app: it opens where it belongs, and never in this WebView
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException e) {
                    /* nothing on the phone can open it */
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                recreate(); // Android reclaimed the page's memory: start it again rather than crash
                return true;
            }
        });
    }

    private static String urlFrom(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        return data != null && HOST.equals(data.getHost()) ? data.toString() : HOME;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getData() != null) web.loadUrl(urlFrom(intent));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putString("url", web.getUrl());
    }

    @Override
    protected void onResume() {
        super.onResume();
        inForeground = true;
        web.onResume();
    }

    @Override
    protected void onPause() {
        inForeground = false;
        web.onPause(); // the page sees that it's hidden; its timers keep running for the rest timer
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript(CLOSE_DIALOG, closed -> {
            if ("true".equals(closed)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true);
        });
    }

    // ---------------------------------------------------------------- the loading screen

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private static FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private ImageView part(int drawable, FrameLayout parent) {
        ImageView v = new ImageView(this);
        v.setImageResource(drawable);
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        v.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(190), dp(190));
        lp.gravity = Gravity.CENTER;
        parent.addView(v, lp);
        return v;
    }

    /**
     * The logo assembles itself: the ring's two arcs swing into place around the dumbbell. The arcs
     * and the dumbbell are separate layers that only rotate, scale and fade, and none of it waits
     * for the network, so it's smooth from the moment the app opens.
     */
    private View buildSplash() {
        FrameLayout s = new FrameLayout(this);
        s.setBackgroundColor(SPLASH_COLOR);
        s.setOnClickListener(v -> { /* nothing underneath can be touched yet */ });

        DisplayMetrics dm = getResources().getDisplayMetrics();
        GradientDrawable haloShape = new GradientDrawable();
        haloShape.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        haloShape.setColors(new int[] {SPLASH_GLOW, SPLASH_COLOR});
        haloShape.setGradientCenter(0.5f, 0.5f);
        haloShape.setGradientRadius(Math.max(dm.widthPixels, dm.heightPixels) * 0.55f);
        View halo = new View(this);
        halo.setBackground(haloShape);
        halo.setAlpha(0f);
        s.addView(halo, match());

        FrameLayout m = new FrameLayout(this);
        m.setClipChildren(false);
        m.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        FrameLayout.LayoutParams mp = new FrameLayout.LayoutParams(dp(236), dp(236));
        mp.gravity = Gravity.CENTER;
        s.addView(m, mp);
        mark = m;

        GradientDrawable glowShape = new GradientDrawable();
        glowShape.setShape(GradientDrawable.OVAL);
        glowShape.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        glowShape.setColors(new int[] {0x4D9CC9F0, 0x009CC9F0});
        glowShape.setGradientCenter(0.5f, 0.5f);
        glowShape.setGradientRadius(dp(118));
        View glow = new View(this);
        glow.setBackground(glowShape);
        glow.setAlpha(0f);
        m.addView(glow, match());

        ImageView arcBlue = part(R.drawable.logo_arc_blue, m);
        ImageView arcGreen = part(R.drawable.logo_arc_green, m);
        ImageView bell = part(R.drawable.logo_dumbbell, m);

        Interpolator settle = new PathInterpolator(0.16f, 1f, 0.3f, 1f);
        Interpolator overshoot = new PathInterpolator(0.2f, 1.3f, 0.35f, 1f);
        s.post(() -> {
            halo.animate().alpha(1f).setDuration(500).setInterpolator(settle).start();
            swingIn(arcBlue, -150f, 0.78f, 820, 0, settle);
            swingIn(arcGreen, 140f, 0.78f, 820, 50, settle);
            swingIn(bell, -38f, 0.55f, 720, 100, overshoot);
            glowLoop = ObjectAnimator.ofPropertyValuesHolder(glow,
                    PropertyValuesHolder.ofFloat(View.ALPHA, 0.35f, 1f),
                    PropertyValuesHolder.ofFloat(View.SCALE_X, 0.92f, 1.06f),
                    PropertyValuesHolder.ofFloat(View.SCALE_Y, 0.92f, 1.06f));
            glowLoop.setDuration(1500);
            glowLoop.setStartDelay(350);
            glowLoop.setRepeatCount(ValueAnimator.INFINITE);
            glowLoop.setRepeatMode(ValueAnimator.REVERSE);
            glowLoop.start();
        });
        arcBlue.setAlpha(0f);
        arcGreen.setAlpha(0f);
        bell.setAlpha(0f);
        return s;
    }

    private void swingIn(View v, float rotation, float scale, long ms, long delay, Interpolator interpolator) {
        v.setRotation(rotation);
        v.setScaleX(scale);
        v.setScaleY(scale);
        v.animate().rotation(0f).scaleX(1f).scaleY(1f).setDuration(ms).setStartDelay(delay).setInterpolator(interpolator).start();
        // faded separately: an overshooting curve would push it past fully visible
        ObjectAnimator fade = ObjectAnimator.ofFloat(v, View.ALPHA, 0f, 1f);
        fade.setDuration(Math.min(ms, 320));
        fade.setStartDelay(delay);
        fade.start();
    }

    /** The app is ready: the logo swells and fades, opening up onto the app in the theme's colours. */
    private void leaveSplash() {
        if (splash == null || leaving) return;
        long wait = MIN_SPLASH_MS - (SystemClock.uptimeMillis() - splashStart);
        if (wait > 0) {
            ui.postDelayed(this::leaveSplash, wait);
            return;
        }
        leaving = true;
        ui.removeCallbacks(giveUp);
        fadeBarsTo(wantedBarColor);
        mark.animate().scaleX(1.14f).scaleY(1.14f).alpha(0f).setDuration(360).setStartDelay(0).setInterpolator(new PathInterpolator(0.4f, 0f, 0.7f, 1f)).start();
        splash.animate().alpha(0f).setDuration(420).setStartDelay(0).setInterpolator(new PathInterpolator(0.4f, 0f, 0.2f, 1f)).withEndAction(() -> {
            if (glowLoop != null) glowLoop.cancel();
            root.removeView(splash);
            splash = null;
            mark = null;
        }).start();
    }

    private void showOffline() {
        if (offline == null) {
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setGravity(Gravity.CENTER);
            box.setBackgroundColor(SPLASH_COLOR);
            box.setPadding(dp(32), 0, dp(32), 0);
            box.setOnClickListener(v -> { });
            TextView text = new TextView(this);
            text.setText(R.string.offline_message);
            text.setTextColor(Color.WHITE);
            text.setTextSize(17);
            text.setGravity(Gravity.CENTER);
            box.addView(text);
            Button retry = new Button(this);
            retry.setText(R.string.offline_retry);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(20);
            box.addView(retry, lp);
            retry.setOnClickListener(v -> {
                root.removeView(offline);
                offline = null;
                web.loadUrl(HOME);
            });
            offline = box;
            root.addView(offline, splash != null ? root.indexOfChild(splash) : -1, match());
        }
        leaveSplash();
    }

    // ---------------------------------------------------------------- the phone's system bars

    /** The bars take the page's background, so nothing separates the app from the phone's buttons. */
    private void paintBars(int color) {
        barColor = color;
        root.setBackgroundColor(color);
        Window w = getWindow();
        boolean light = Color.luminance(color) > 0.5f;
        w.setStatusBarColor(color);
        // before Android 8 the buttons are always white, so a pale bar would hide them
        w.setNavigationBarColor(light && Build.VERSION.SDK_INT < 26 ? Color.BLACK : color);
        if (Build.VERSION.SDK_INT >= 28) w.setNavigationBarDividerColor(color);
        if (Build.VERSION.SDK_INT >= 29) {
            w.setStatusBarContrastEnforced(false);
            w.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            int both = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (c != null) c.setSystemBarsAppearance(light ? both : 0, both);
        } else {
            View d = w.getDecorView();
            int both = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
            int flags = d.getSystemUiVisibility();
            d.setSystemUiVisibility(light ? flags | both : flags & ~both);
        }
    }

    private void fadeBarsTo(int color) {
        if (barFade != null) barFade.cancel();
        web.setBackgroundColor(color);
        if (color == barColor) return;
        barFade = ValueAnimator.ofArgb(barColor, color);
        barFade.setDuration(320);
        barFade.addUpdateListener(a -> paintBars((int) a.getAnimatedValue()));
        barFade.start();
    }

    // ---------------------------------------------------------------- notifications, files, sharing

    private String notificationState() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.areNotificationsEnabled()) return "granted";
        boolean canAsk = Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
        return canAsk ? "default" : "denied";
    }

    private void sendPermissionResult(String state) {
        web.evaluateJavascript("window.__steadysetPermission&&window.__steadysetPermission('" + state + "')", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ_NOTIFICATIONS) return;
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        sendPermissionResult(granted ? "granted" : "denied");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_SAVE) return;
        String text = pendingSave;
        pendingSave = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || text == null) return;
        try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
            if (out == null) throw new java.io.IOException("no stream");
            out.write(text.getBytes(StandardCharsets.UTF_8));
            Toast.makeText(this, R.string.file_saved, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, R.string.file_not_saved, Toast.LENGTH_LONG).show();
        }
    }

    /** What the site can ask of the app. These calls arrive off the main thread. */
    private final class Bridge {
        @JavascriptInterface
        public void ready() {
            ui.post(LauncherActivity.this::leaveSplash);
        }

        @JavascriptInterface
        public void setBars(String color) {
            final int c;
            try {
                c = Color.parseColor(color);
            } catch (IllegalArgumentException e) {
                return;
            }
            ui.post(() -> {
                wantedBarColor = c;
                if (splash == null || leaving) fadeBarsTo(c);
            });
        }

        @JavascriptInterface
        public String notificationPermission() {
            return notificationState();
        }

        @JavascriptInterface
        public void requestNotifications() {
            ui.post(() -> {
                String state = notificationState();
                if ("default".equals(state)) requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
                else sendPermissionResult(state);
            });
        }

        @JavascriptInterface
        public void postNotification(String title, String body, String tag) {
            Alerts.show(LauncherActivity.this, title, body, tag);
        }

        /** Rings at that time even if Android has closed the app in the meantime. */
        @JavascriptInterface
        public void scheduleAlert(double atMillis, String title, String body, String tag) {
            AlarmManager am = getSystemService(AlarmManager.class);
            if (am == null) return;
            PendingIntent pi = Alerts.alertIntent(LauncherActivity.this, title, body, tag);
            long at = (long) atMillis;
            try {
                if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } catch (SecurityException e) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        }

        @JavascriptInterface
        public void cancelAlert() {
            AlarmManager am = getSystemService(AlarmManager.class);
            if (am != null) am.cancel(Alerts.alertIntent(LauncherActivity.this, "", "", ""));
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String text) {
            ui.post(() -> {
                pendingSave = text;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(i, REQ_SAVE);
            });
        }

        @JavascriptInterface
        public void share(String text) {
            ui.post(() -> {
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(send, null));
            });
        }
    }
}
