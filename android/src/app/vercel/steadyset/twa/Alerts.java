package app.vercel.steadyset.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Notifications: the rest timer finishing and workout reminders. */
final class Alerts {
    private static final String CHANNEL = "alerts";

    private Alerts() {}

    static void show(Context context, String title, String body, String tag) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        Intent open = new Intent(context, LauncherActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, context.getString(R.string.notification_channel), NotificationManager.IMPORTANCE_HIGH);
            channel.enableVibration(true);
            nm.createNotificationChannel(channel);
            b = new Notification.Builder(context, CHANNEL);
        } else {
            b = new Notification.Builder(context).setDefaults(Notification.DEFAULT_ALL).setPriority(Notification.PRIORITY_HIGH);
        }
        b.setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFF21406B)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(tap)
                .setAutoCancel(true)
                // the alarm and the page can both report the same rest finishing: it only sounds once
                .setOnlyAlertOnce(true);
        try {
            nm.notify(tag.hashCode(), b.build());
        } catch (SecurityException e) {
            /* notifications aren't allowed */
        }
    }

    /** Only one alert is ever waiting, so scheduling a new one replaces the last. */
    static PendingIntent alertIntent(Context context, String title, String body, String tag) {
        Intent i = new Intent(context, AlertReceiver.class).putExtra("title", title).putExtra("body", body).putExtra("tag", tag);
        return PendingIntent.getBroadcast(context, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
