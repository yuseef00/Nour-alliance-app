package app.vercel.nouralqran.twa;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NourNative")
public class NourNativePlugin extends Plugin {
    private static final String PINNED_PRAYER_CHANNEL_ID = "nour_prayer_pinned_bar";
    private static final int PINNED_PRAYER_NOTIFICATION_ID = 999;
    private static volatile NourNativePlugin activeInstance;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.handleOnDestroy();
    }

    public static void emitMediaAction(String action) {
        NourNativePlugin instance = activeInstance;
        if (instance == null) return;
        JSObject payload = new JSObject();
        payload.put("action", action);
        instance.notifyListeners("mediaAction", payload);
    }

    @PluginMethod
    public void showPinnedPrayerNotification(PluginCall call) {
        String title = call.getString("title", "مواقيت الصلاة");
        String body = call.getString("body", "");
        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            call.resolve();
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel existing = nm.getNotificationChannel(PINNED_PRAYER_CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                    PINNED_PRAYER_CHANNEL_ID,
                    "شريط مواقيت الصلاة المثبت",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("عرض الصلاة القادمة ومواقيت اليوم في أعلى شريط الإشعارات");
                channel.setShowBadge(false);
                channel.setSound(null, null);
                channel.enableVibration(false);
                nm.createNotificationChannel(channel);
            }
        }

        Intent openIntent = new Intent(ctx, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            ctx,
            999,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, PINNED_PRAYER_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_nour)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pending)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW);

        nm.notify(PINNED_PRAYER_NOTIFICATION_ID, builder.build());
        call.resolve();
    }

    @PluginMethod
    public void clearPinnedPrayerNotification(PluginCall call) {
        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(PINNED_PRAYER_NOTIFICATION_ID);
        }
        call.resolve();
    }

    @PluginMethod
    public void syncMediaPlayback(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        boolean canSkip = Boolean.TRUE.equals(call.getBoolean("canSkip", true));
        String title = call.getString("title", "نور");
        String subtitle = call.getString("subtitle", "التلاوة القرآنية");

        Context ctx = getContext();
        Intent serviceIntent = new Intent(ctx, NourMediaService.class);
        if (!active) {
            ctx.stopService(serviceIntent);
            call.resolve();
            return;
        }

        serviceIntent.setAction(NourMediaService.ACTION_UPDATE);
        serviceIntent.putExtra(NourMediaService.EXTRA_PLAYING, playing);
        serviceIntent.putExtra(NourMediaService.EXTRA_CAN_SKIP, canSkip);
        serviceIntent.putExtra(NourMediaService.EXTRA_TITLE, title);
        serviceIntent.putExtra(NourMediaService.EXTRA_SUBTITLE, subtitle);

        try {
            if (playing) {
                ContextCompat.startForegroundService(ctx, serviceIntent);
            } else {
                ctx.startService(serviceIntent);
            }
        } catch (Exception ignored) {
            // Ignore foreground start restriction when app is already closed
        }
        call.resolve();
    }
}
