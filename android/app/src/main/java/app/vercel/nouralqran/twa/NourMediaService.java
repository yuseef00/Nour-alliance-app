package app.vercel.nouralqran.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

public class NourMediaService extends Service {
    public static final String CHANNEL_ID = "nour_media_playback";
    public static final int NOTIFICATION_ID = 998;

    public static final String ACTION_UPDATE = "app.vercel.nouralqran.twa.MEDIA_UPDATE";
    public static final String ACTION_TOGGLE = "app.vercel.nouralqran.twa.MEDIA_TOGGLE";
    public static final String ACTION_PREV = "app.vercel.nouralqran.twa.MEDIA_PREV";
    public static final String ACTION_NEXT = "app.vercel.nouralqran.twa.MEDIA_NEXT";
    public static final String ACTION_STOP = "app.vercel.nouralqran.twa.MEDIA_STOP";

    public static final String EXTRA_PLAYING = "playing";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SUBTITLE = "subtitle";
    public static final String EXTRA_CAN_SKIP = "canSkip";

    private PowerManager.WakeLock wakeLock;
    private boolean currentPlaying = false;
    private boolean currentCanSkip = true;
    private String currentTitle = "نور";
    private String currentSubtitle = "التلاوة القرآنية";

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_TOGGLE.equals(action)) {
            NourNativePlugin.emitMediaAction("toggle");
            currentPlaying = !currentPlaying;
            updateWakeLock(currentPlaying);
            startOrUpdateForeground();
            return START_NOT_STICKY;
        }
        if (ACTION_PREV.equals(action)) {
            NourNativePlugin.emitMediaAction("prev");
            return START_NOT_STICKY;
        }
        if (ACTION_NEXT.equals(action)) {
            NourNativePlugin.emitMediaAction("next");
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            NourNativePlugin.emitMediaAction("stop");
            stopSelfCleanly();
            return START_NOT_STICKY;
        }

        currentPlaying = intent.getBooleanExtra(EXTRA_PLAYING, true);
        currentCanSkip = intent.getBooleanExtra(EXTRA_CAN_SKIP, true);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String subtitle = intent.getStringExtra(EXTRA_SUBTITLE);
        if (title != null && !title.isEmpty()) currentTitle = title;
        if (subtitle != null && !subtitle.isEmpty()) currentSubtitle = subtitle;

        updateWakeLock(currentPlaying);
        startOrUpdateForeground();
        return START_NOT_STICKY;
    }

    private void startOrUpdateForeground() {
        Notification notification = buildNotification();
        int type = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        }
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
        } catch (Exception ignored) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, notification);
            }
        }
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPending = PendingIntent.getActivity(
            this,
            10,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_nour)
            .setContentTitle(currentTitle)
            .setContentText(currentSubtitle)
            .setContentIntent(contentPending)
            .setOngoing(currentPlaying)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setPriority(NotificationCompat.PRIORITY_LOW);

        if (currentCanSkip) {
            builder.addAction(
                android.R.drawable.ic_media_previous,
                "السابق",
                servicePending(ACTION_PREV, 11)
            );
        }

        builder.addAction(
            currentPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            currentPlaying ? "إيقاف مؤقت" : "تشغيل",
            servicePending(ACTION_TOGGLE, 12)
        );

        if (currentCanSkip) {
            builder.addAction(
                android.R.drawable.ic_media_next,
                "التالي",
                servicePending(ACTION_NEXT, 13)
            );
        }

        builder.addAction(
            android.R.drawable.ic_menu_close_clear_cancel,
            "إغلاق",
            servicePending(ACTION_STOP, 14)
        );

        return builder.build();
    }

    private PendingIntent servicePending(String action, int requestCode) {
        Intent i = new Intent(this, NourMediaService.class);
        i.setAction(action);
        return PendingIntent.getService(
            this,
            requestCode,
            i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "تشغيل التلاوات القرآنية",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("التحكم بتلاوة القرآن الكريم في الخلفية وشاشة القفل");
                channel.setShowBadge(false);
                channel.setSound(null, null);
                channel.enableVibration(false);
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void updateWakeLock(boolean acquire) {
        try {
            if (acquire) {
                if (wakeLock == null) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Nour::MediaPlaybackLock");
                        wakeLock.setReferenceCounted(false);
                    }
                }
                if (wakeLock != null && !wakeLock.isHeld()) {
                    wakeLock.acquire(2 * 60 * 60 * 1000L);
                }
            } else if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {
            // Ignore WakeLock restrictions
        }
    }

    private void stopSelfCleanly() {
        updateWakeLock(false);
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {
            // Ignore foreground stop errors
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        updateWakeLock(false);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
