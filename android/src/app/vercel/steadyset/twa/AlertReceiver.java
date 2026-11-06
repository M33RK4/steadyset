package app.vercel.steadyset.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The rest timer's alarm going off. While the app is open, the site chimes by itself instead. */
public class AlertReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (LauncherActivity.inForeground) return;
        String title = intent.getStringExtra("title");
        if (title == null || title.isEmpty()) return;
        Alerts.show(context, title, intent.getStringExtra("body"), intent.getStringExtra("tag"));
    }
}
