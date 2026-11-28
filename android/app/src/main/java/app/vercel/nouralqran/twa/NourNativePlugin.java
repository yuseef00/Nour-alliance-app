package app.vercel.nouralqran.twa;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;

@CapacitorPlugin(name = "NourNative")
public class NourNativePlugin extends Plugin implements SensorEventListener {
    private static final String PINNED_PRAYER_CHANNEL_ID = "nour_prayer_pinned_bar";
    private static final int PINNED_PRAYER_NOTIFICATION_ID = 999;
    private static final int SCHEDULED_ATHAN_ID_MIN = 1000;
    private static final int SCHEDULED_ATHAN_ID_MAX = 1199;

    private static volatile NourNativePlugin activeInstance;

    private SensorManager sensorManager;
    private Sensor accelerometer;
    private boolean flipMonitorActive = false;
    private boolean flipMonitorEnabled = true;
    private long monitorStartedAtMs = 0L;
    private boolean sawNotFaceDown = false;
    private int faceDownSamples = 0;

    private Bitmap cachedLogoBitmap = null;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
        Context ctx = getContext();
        if (ctx != null) {
            sensorManager = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
            if (sensorManager != null) {
                accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            }
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (flipMonitorEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Context ctx = getContext();
            if (ctx != null) {
                NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    try {
                        android.service.notification.StatusBarNotification[] active = nm.getActiveNotifications();
                        if (active != null) {
                            for (android.service.notification.StatusBarNotification sbn : active) {
                                int id = sbn.getId();
                                if (id >= SCHEDULED_ATHAN_ID_MIN && id <= SCHEDULED_ATHAN_ID_MAX) {
                                    startFlipSensorInternal();
                                    break;
                                }
                            }
                        }
                    } catch (Exception ignored) {
                        // Ignore active notifications check restriction
                    }
                }
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopFlipSensorInternal();
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.handleOnDestroy();
    }

    private static void dispatchEvent(String eventName, JSObject payload) {
        NourNativePlugin instance = activeInstance;
        if (instance == null) return;
        android.app.Activity activity = instance.getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> instance.notifyListeners(eventName, payload));
        } else {
            instance.notifyListeners(eventName, payload);
        }
    }

    public static void emitMediaAction(String action, Double seekMs) {
        JSObject payload = new JSObject();
        payload.put("action", action);
        if (seekMs != null) {
            payload.put("seekMs", seekMs);
        }
        dispatchEvent("mediaAction", payload);
    }

    public static void emitAthanAction(String action) {
        JSObject payload = new JSObject();
        payload.put("action", action);
        dispatchEvent("athanAction", payload);
    }

    public static void emitPrayerAction(String action) {
        JSObject payload = new JSObject();
        payload.put("action", action);
        dispatchEvent("prayerAction", payload);
    }

    private static void cancelAthanNotificationsOnly(Context context) {
        if (context != null) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                for (int id = SCHEDULED_ATHAN_ID_MIN; id <= SCHEDULED_ATHAN_ID_MAX; id++) {
                    nm.cancel(id);
                }
            }
        }
        NourNativePlugin instance = activeInstance;
        if (instance != null) {
            instance.stopFlipSensorInternal();
        }
    }

    public static void stopRingingAthanStatic(Context context, String reasonAction) {
        cancelAthanNotificationsOnly(context);
        emitAthanAction(reasonAction != null ? reasonAction : "stop");
    }

    private Bitmap getNourLogoBitmap(Context ctx) {
        if (cachedLogoBitmap != null && !cachedLogoBitmap.isRecycled()) {
            return cachedLogoBitmap;
        }
        Bitmap bmp = null;
        try (InputStream is = ctx.getAssets().open("public/pwa-192x192.png")) {
            bmp = BitmapFactory.decodeStream(is);
        } catch (Exception ignored) {
            bmp = null;
        }
        if (bmp == null) {
            try {
                bmp = BitmapFactory.decodeResource(ctx.getResources(), R.mipmap.ic_launcher);
            } catch (Exception ignored) {
                bmp = null;
            }
        }
        cachedLogoBitmap = bmp;
        return bmp;
    }

    @PluginMethod
    public void showPinnedPrayerNotification(PluginCall call) {
        String title = call.getString("title", "مواقيت الصلاة");
        String body = call.getString("body", "");
        String subText = call.getString("subText", "");
        String summaryText = call.getString("summaryText", "تطبيق نور");
        String refreshLabel = call.getString("refreshLabel", "تحديث");
        String stopAthanLabel = call.getString("stopAthanLabel", "إيقاف الأذان");
        boolean showStopAthan = Boolean.TRUE.equals(call.getBoolean("showStopAthan", false));

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
                channel.setDescription("عرض الصلاة القادمة ومواقيت اليوم مع شعار نور في شريط الإشعارات");
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

        Intent refreshIntent = new Intent(ctx, NourActionReceiver.class);
        refreshIntent.setAction(NourActionReceiver.ACTION_REFRESH_PRAYER_BAR);
        PendingIntent refreshPending = PendingIntent.getBroadcast(
            ctx,
            997,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(ctx, NourActionReceiver.class);
        stopIntent.setAction(NourActionReceiver.ACTION_STOP_ATHAN);
        PendingIntent stopPending = PendingIntent.getBroadcast(
            ctx,
            996,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.BigTextStyle bigStyle = new NotificationCompat.BigTextStyle()
            .setBigContentTitle(title)
            .bigText(body)
            .setSummaryText(summaryText);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, PINNED_PRAYER_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_nour)
            .setColor(0xFF0F6B4F)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(bigStyle)
            .setContentIntent(pending)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_popup_sync, refreshLabel, refreshPending);

        if (subText != null && !subText.isEmpty()) {
            builder.setSubText(subText);
        }

        Bitmap logo = getNourLogoBitmap(ctx);
        if (logo != null) {
            builder.setLargeIcon(logo);
        }

        if (showStopAthan) {
            builder.addAction(android.R.drawable.ic_lock_silent_mode, stopAthanLabel, stopPending);
        }

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
    public void stopNativeAthanNotification(PluginCall call) {
        cancelAthanNotificationsOnly(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setAthanFlipMonitor(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        flipMonitorEnabled = enabled;

        if (active && enabled) {
            startFlipSensorInternal();
        } else {
            stopFlipSensorInternal();
        }
        call.resolve();
    }

    private void startFlipSensorInternal() {
        if (sensorManager == null || accelerometer == null || !flipMonitorEnabled) return;
        monitorStartedAtMs = System.currentTimeMillis();
        sawNotFaceDown = false;
        faceDownSamples = 0;
        if (flipMonitorActive) return;
        try {
            flipMonitorActive = sensorManager.registerListener(
                this,
                accelerometer,
                SensorManager.SENSOR_DELAY_GAME
            );
        } catch (Exception ignored) {
            flipMonitorActive = false;
        }
    }

    private void stopFlipSensorInternal() {
        if (sensorManager != null && flipMonitorActive) {
            try {
                sensorManager.unregisterListener(this);
            } catch (Exception ignored) {
                // Ignore sensor unregister errors
            }
        }
        flipMonitorActive = false;
        sawNotFaceDown = false;
        faceDownSamples = 0;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!flipMonitorActive || !flipMonitorEnabled || event == null || event.values == null || event.values.length < 3) {
            return;
        }

        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];

        // Observe initial non-face-down orientation immediately so fast flips are never missed
        if (z > -1.5f) {
            sawNotFaceDown = true;
            faceDownSamples = 0;
            return;
        }

        if (System.currentTimeMillis() - monitorStartedAtMs < 300L) {
            return;
        }

        if (sawNotFaceDown && z < -6.8f && Math.abs(x) < 6.0f && Math.abs(y) < 6.0f) {
            faceDownSamples++;
            if (faceDownSamples >= 2) {
                stopRingingAthanStatic(getContext(), "stop_flip");
            }
        } else {
            faceDownSamples = 0;
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // No action required
    }

    @PluginMethod
    public void syncMediaPlayback(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        boolean canSkip = Boolean.TRUE.equals(call.getBoolean("canSkip", true));
        String title = call.getString("title", "نور");
        String subtitle = call.getString("subtitle", "التلاوة القرآنية");
        String album = call.getString("album", "نور — رفيق القرآن");
        String artworkPath = call.getString("artworkPath", "");
        Number posObj = call.getDouble("positionMs", 0.0);
        Number durObj = call.getDouble("durationMs", 0.0);
        long positionMs = posObj != null ? Math.max(0L, posObj.longValue()) : 0L;
        long durationMs = durObj != null ? Math.max(0L, durObj.longValue()) : 0L;

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
        serviceIntent.putExtra(NourMediaService.EXTRA_ALBUM, album);
        serviceIntent.putExtra(NourMediaService.EXTRA_ARTWORK, artworkPath);
        serviceIntent.putExtra(NourMediaService.EXTRA_POSITION_MS, positionMs);
        serviceIntent.putExtra(NourMediaService.EXTRA_DURATION_MS, durationMs);

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
