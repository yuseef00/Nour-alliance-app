package app.vercel.nouralqran.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.annotation.Nullable;
import androidx.core.app.ServiceCompat;

import java.io.InputStream;

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
    public static final String EXTRA_ALBUM = "album";
    public static final String EXTRA_ARTWORK = "artworkPath";
    public static final String EXTRA_CAN_SKIP = "canSkip";
    public static final String EXTRA_POSITION_MS = "positionMs";
    public static final String EXTRA_DURATION_MS = "durationMs";

    private PowerManager.WakeLock wakeLock;
    private MediaSession mediaSession;
    private boolean currentPlaying = false;
    private boolean currentCanSkip = true;
    private String currentTitle = "نور";
    private String currentSubtitle = "التلاوة القرآنية";
    private String currentAlbum = "نور — رفيق القرآن";
    private String currentArtworkPath = "";
    private long currentPositionMs = 0L;
    private long currentDurationMs = 0L;

    private String cachedArtworkKey = null;
    private Bitmap cachedArtworkBitmap = null;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        initMediaSession();
    }

    private void initMediaSession() {
        if (mediaSession != null) return;
        try {
            mediaSession = new MediaSession(this, "NourQuranMediaSession");
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    if (!currentPlaying) {
                        currentPlaying = true;
                        NourNativePlugin.emitMediaAction("toggle", null);
                        updateWakeLock(true);
                        startOrUpdateForeground();
                    }
                }

                @Override
                public void onPause() {
                    if (currentPlaying) {
                        currentPlaying = false;
                        NourNativePlugin.emitMediaAction("toggle", null);
                        updateWakeLock(false);
                        startOrUpdateForeground();
                    }
                }

                @Override
                public void onSkipToNext() {
                    NourNativePlugin.emitMediaAction("next", null);
                }

                @Override
                public void onSkipToPrevious() {
                    NourNativePlugin.emitMediaAction("prev", null);
                }

                @Override
                public void onStop() {
                    NourNativePlugin.emitMediaAction("stop", null);
                    stopSelfCleanly();
                }

                @Override
                public void onSeekTo(long pos) {
                    currentPositionMs = Math.max(0L, pos);
                    NourNativePlugin.emitMediaAction("seek", (double) currentPositionMs);
                    updateMediaSessionState();
                }
            });
            mediaSession.setActive(true);
        } catch (Exception ignored) {
            mediaSession = null;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_TOGGLE.equals(action)) {
            NourNativePlugin.emitMediaAction("toggle", null);
            currentPlaying = !currentPlaying;
            updateWakeLock(currentPlaying);
            startOrUpdateForeground();
            return START_NOT_STICKY;
        }
        if (ACTION_PREV.equals(action)) {
            NourNativePlugin.emitMediaAction("prev", null);
            return START_NOT_STICKY;
        }
        if (ACTION_NEXT.equals(action)) {
            NourNativePlugin.emitMediaAction("next", null);
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            NourNativePlugin.emitMediaAction("stop", null);
            stopSelfCleanly();
            return START_NOT_STICKY;
        }

        currentPlaying = intent.getBooleanExtra(EXTRA_PLAYING, true);
        currentCanSkip = intent.getBooleanExtra(EXTRA_CAN_SKIP, true);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String subtitle = intent.getStringExtra(EXTRA_SUBTITLE);
        String album = intent.getStringExtra(EXTRA_ALBUM);
        String artwork = intent.getStringExtra(EXTRA_ARTWORK);
        if (title != null && !title.isEmpty()) currentTitle = title;
        if (subtitle != null && !subtitle.isEmpty()) currentSubtitle = subtitle;
        if (album != null && !album.isEmpty()) currentAlbum = album;
        if (artwork != null) currentArtworkPath = artwork;
        currentPositionMs = Math.max(0L, intent.getLongExtra(EXTRA_POSITION_MS, currentPositionMs));
        currentDurationMs = Math.max(0L, intent.getLongExtra(EXTRA_DURATION_MS, 0L));

        updateWakeLock(currentPlaying);
        startOrUpdateForeground();
        return START_NOT_STICKY;
    }

    private Bitmap resolveArtworkBitmap() {
        String key = currentArtworkPath != null ? currentArtworkPath : "";
        if (cachedArtworkBitmap != null && key.equals(cachedArtworkKey) && !cachedArtworkBitmap.isRecycled()) {
            return cachedArtworkBitmap;
        }

        Bitmap decoded = null;
        if (!key.isEmpty()) {
            String normalized = key.startsWith("/") ? key.substring(1) : key;
            String assetPath = normalized.startsWith("public/") ? normalized : ("public/" + normalized);
            try (InputStream is = getAssets().open(assetPath)) {
                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
                Bitmap raw = BitmapFactory.decodeStream(is, null, opts);
                if (raw != null) {
                    if (raw.getWidth() > 512 || raw.getHeight() > 512) {
                        float scale = Math.min(512f / raw.getWidth(), 512f / raw.getHeight());
                        int w = Math.max(1, Math.round(raw.getWidth() * scale));
                        int h = Math.max(1, Math.round(raw.getHeight() * scale));
                        decoded = Bitmap.createScaledBitmap(raw, w, h, true);
                        if (decoded != raw) {
                            raw.recycle();
                        }
                    } else {
                        decoded = raw;
                    }
                }
            } catch (Exception ignored) {
                decoded = null;
            }
        }

        if (decoded == null) {
            try {
                decoded = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
            } catch (Exception ignored) {
                decoded = null;
            }
        }

        cachedArtworkKey = key;
        cachedArtworkBitmap = decoded;
        return decoded;
    }

    private void updateMediaSessionState() {
        if (mediaSession == null) return;
        try {
            Bitmap art = resolveArtworkBitmap();
            MediaMetadata.Builder meta = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, currentSubtitle)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, currentAlbum);
            if (currentDurationMs > 0L) {
                meta.putLong(MediaMetadata.METADATA_KEY_DURATION, currentDurationMs);
            }
            if (art != null) {
                meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
                meta.putBitmap(MediaMetadata.METADATA_KEY_ART, art);
                meta.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, art);
            }
            mediaSession.setMetadata(meta.build());

            long actions = PlaybackState.ACTION_PLAY
                | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_STOP;
            if (currentCanSkip) {
                actions |= PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SKIP_TO_NEXT;
            }
            if (currentDurationMs > 0L) {
                actions |= PlaybackState.ACTION_SEEK_TO;
            }

            PlaybackState state = new PlaybackState.Builder()
                .setActions(actions)
                .setState(
                    currentPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                    currentPositionMs,
                    currentPlaying ? 1.0f : 0.0f,
                    SystemClock.elapsedRealtime()
                )
                .build();
            mediaSession.setPlaybackState(state);
            mediaSession.setActive(true);
        } catch (Exception ignored) {
            // Ignore MediaSession metadata errors on restricted vendor ROMs
        }
    }

    private void startOrUpdateForeground() {
        initMediaSession();
        updateMediaSessionState();
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

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        Bitmap art = resolveArtworkBitmap();
        builder
            .setSmallIcon(R.drawable.ic_stat_nour)
            .setColor(0xFF0F6B4F)
            .setContentTitle(currentTitle)
            .setContentText(currentSubtitle)
            .setSubText(currentAlbum)
            .setContentIntent(contentPending)
            .setOngoing(currentPlaying)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT);

        if (art != null) {
            builder.setLargeIcon(art);
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_LOW);
        }

        int compactCount = 0;
        if (currentCanSkip) {
            builder.addAction(
                new Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_media_previous),
                    "السابق",
                    servicePending(ACTION_PREV, 11)
                ).build()
            );
            compactCount++;
        }

        builder.addAction(
            new Notification.Action.Builder(
                Icon.createWithResource(
                    this,
                    currentPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play
                ),
                currentPlaying ? "إيقاف مؤقت" : "تشغيل",
                servicePending(ACTION_TOGGLE, 12)
            ).build()
        );
        compactCount++;

        if (currentCanSkip) {
            builder.addAction(
                new Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_media_next),
                    "التالي",
                    servicePending(ACTION_NEXT, 13)
                ).build()
            );
            compactCount++;
        }

        builder.addAction(
            new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
                "إغلاق",
                servicePending(ACTION_STOP, 14)
            ).build()
        );

        if (mediaSession != null) {
            Notification.MediaStyle style = new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken());
            if (compactCount >= 3) {
                style.setShowActionsInCompactView(0, 1, 2);
            } else {
                style.setShowActionsInCompactView(0, 1);
            }
            builder.setStyle(style);
        }

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
                    "بطاقة القارئ والتلاوات",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("عرض بطاقة القارئ والتحكم بالتلاوة في شريط الإشعارات وشاشة القفل");
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
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception ignored) {
                // Ignore MediaSession release errors
            }
            mediaSession = null;
        }
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
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception ignored) {
                // Ignore
            }
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
