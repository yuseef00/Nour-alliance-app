/* Nour Quran Companion — Service Worker Prayer Times & Background Alert Engine */

const NOUR_SW_DB_NAME = 'nour_prayer_sw_db';
const NOUR_SW_STORE = 'state';
const SCHEDULE_KEY = 'prayer_schedule_v1';
const NOTIFIED_STAMPS_KEY = 'notified_stamps_v1';

function openPrayerSwDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(NOUR_SW_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOUR_SW_STORE)) {
        db.createObjectStore(NOUR_SW_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readSwState(key) {
  try {
    const db = await openPrayerSwDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(NOUR_SW_STORE, 'readonly');
      const store = tx.objectStore(NOUR_SW_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function writeSwState(key, value) {
  try {
    const db = await openPrayerSwDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(NOUR_SW_STORE, 'readwrite');
      const store = tx.objectStore(NOUR_SW_STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore storage errors inside SW
  }
}

function buildPrayerNotifTitle(item, lang) {
  if (lang === 'ar') {
    return `🕌 حان الآن موعد أذان ${item.label} (${item.timeStr})`;
  }
  return `🕌 Time for ${item.label} Prayer (${item.timeStr})`;
}

function buildPrayerNotifBody(item, payload) {
  const isAr = payload.lang === 'ar';
  const lines = [];
  if (payload.cityLabel) {
    lines.push(`📍 ${payload.cityLabel}`);
  }
  if (item.summaryRows && item.summaryRows.length > 0) {
    lines.push(...item.summaryRows);
  } else {
    lines.push(
      isAr
        ? 'حيّ على الصلاة · اضغط لسماع الأذان وفتح مواقيت الصلاة'
        : 'Hayya ala-salah · Tap to play Athan and open Prayer Times'
    );
  }
  return lines.join('\n');
}

async function scheduleTimestampTriggers(payload) {
  if (!payload || !Array.isArray(payload.items)) return;
  if (!('Notification' in self) || !('showTrigger' in Notification.prototype)) return;
  if (typeof self.TimestampTrigger !== 'function') return;

  try {
    const existing = await self.registration.getNotifications({ includeTriggered: true });
    for (const notif of existing) {
      if (notif.tag && notif.tag.startsWith('nour-prayer-trigger-')) {
        notif.close();
      }
    }
  } catch {
    // Ignore cleanup errors
  }

  const now = Date.now();
  const isAr = payload.lang === 'ar';
  const maxHorizon = now + 24 * 60 * 60 * 1000;

  for (const item of payload.items) {
    if (item.timestamp <= now + 5000 || item.timestamp > maxHorizon) continue;
    try {
      await self.registration.showNotification(buildPrayerNotifTitle(item, payload.lang), {
        body: buildPrayerNotifBody(item, payload),
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `nour-prayer-trigger-${item.stamp}`,
        showTrigger: new self.TimestampTrigger(item.timestamp),
        silent: !payload.soundEnabled,
        requireInteraction: true,
        renotify: true,
        vibrate: [320, 140, 320, 140, 500],
        dir: isAr ? 'rtl' : 'ltr',
        lang: isAr ? 'ar' : 'en',
        data: {
          url: `/prayer-times?playAthan=1&prayer=${encodeURIComponent(item.key)}`,
          prayerKey: item.key,
          stamp: item.stamp,
        },
        actions: [
          { action: 'play-athan', title: isAr ? '🔊 تشغيل الأذان' : '🔊 Play Athan' },
          { action: 'stop-athan', title: isAr ? '⏹ إيقاف' : '⏹ Stop' },
        ],
      });
    } catch {
      // Trigger scheduling may not be permitted in current browser profile
    }
  }
}

async function checkBackgroundPrayersNow() {
  const payload = await readSwState(SCHEDULE_KEY);
  if (!payload || !payload.enabled || !Array.isArray(payload.items)) return;

  const now = Date.now();
  const isAr = payload.lang === 'ar';
  const notified = (await readSwState(NOTIFIED_STAMPS_KEY)) || {};
  let changed = false;

  for (const item of payload.items) {
    const diffMs = now - item.timestamp;
    if (diffMs >= 0 && diffMs < 120000 && !notified[item.stamp]) {
      notified[item.stamp] = now;
      changed = true;
      await self.registration.showNotification(buildPrayerNotifTitle(item, payload.lang), {
        body: buildPrayerNotifBody(item, payload),
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `nour-prayer-athan-${item.stamp}`,
        silent: !payload.soundEnabled,
        requireInteraction: true,
        renotify: true,
        vibrate: [320, 140, 320, 140, 500],
        dir: isAr ? 'rtl' : 'ltr',
        lang: isAr ? 'ar' : 'en',
        data: {
          url: `/prayer-times?playAthan=1&prayer=${encodeURIComponent(item.key)}`,
          prayerKey: item.key,
          stamp: item.stamp,
        },
        actions: [
          { action: 'play-athan', title: isAr ? '🔊 تشغيل الأذان' : '🔊 Play Athan' },
          { action: 'stop-athan', title: isAr ? '⏹ إيقاف' : '⏹ Stop' },
        ],
      });
    }
  }

  if (changed) {
    // Keep only recent 30 stamps
    const entries = Object.entries(notified)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 30);
    await writeSwState(NOTIFIED_STAMPS_KEY, Object.fromEntries(entries));
  }

  // Refresh neat pinned prayer board if enabled
  if (payload.boardPinned) {
    const nextItem = payload.items.find((it) => it.timestamp > now);
    if (nextItem) {
      const remMs = nextItem.timestamp - now;
      const remMin = Math.max(1, Math.round(remMs / 60000));
      const h = Math.floor(remMin / 60);
      const m = remMin % 60;
      const remStr = isAr
        ? h > 0
          ? `${h} س ${m} د`
          : `${m} دقيقة`
        : h > 0
        ? `${h}h ${m}m`
        : `${m}m`;

      const boardTitle = isAr
        ? `🕌 القادمة: ${nextItem.label} (${nextItem.timeStr}) · بعد ${remStr}`
        : `🕌 Next: ${nextItem.label} (${nextItem.timeStr}) · in ${remStr}`;

      const boardBody = [
        payload.cityLabel ? `📍 ${payload.cityLabel}` : '',
        ...(nextItem.summaryRows || []),
      ]
        .filter(Boolean)
        .join('\n');

      await self.registration.showNotification(boardTitle, {
        body: boardBody,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'nour-prayer-board',
        silent: true,
        renotify: false,
        requireInteraction: true,
        dir: isAr ? 'rtl' : 'ltr',
        lang: isAr ? 'ar' : 'en',
        data: {
          url: '/prayer-times',
        },
      });
    }
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SYNC_PRAYER_SCHEDULE') {
    event.waitUntil(
      (async () => {
        await writeSwState(SCHEDULE_KEY, data.payload);
        if (data.payload && data.payload.enabled) {
          await scheduleTimestampTriggers(data.payload);
        } else if ('getNotifications' in self.registration) {
          try {
            const existing = await self.registration.getNotifications({ includeTriggered: true });
            for (const notif of existing) {
              if (
                notif.tag &&
                (notif.tag.startsWith('nour-prayer-trigger-') || notif.tag === 'nour-prayer-board')
              ) {
                notif.close();
              }
            }
          } catch {
            // Ignore cleanup warnings
          }
        }
      })()
    );
  } else if (data.type === 'CHECK_PRAYERS_NOW') {
    event.waitUntil(checkBackgroundPrayersNow());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'nour-prayer-sync') {
    event.waitUntil(checkBackgroundPrayersNow());
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(checkBackgroundPrayersNow());
});

self.addEventListener('notificationclick', (event) => {
  const notif = event.notification;
  const action = event.action;
  const data = (notif && notif.data) || {};

  if (notif && notif.tag !== 'nour-prayer-board') {
    notif.close();
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      if (action === 'stop-athan') {
        for (const client of allClients) {
          client.postMessage({ type: 'NOUR_STOP_ATHAN' });
        }
        return;
      }

      const targetPath = data.url || '/prayer-times';
      if (allClients.length > 0) {
        const client = allClients[0];
        if ('focus' in client) {
          await client.focus();
        }
        client.postMessage({
          type: 'NOUR_OPEN_PRAYER_FROM_NOTIF',
          prayerKey: data.prayerKey || null,
          playAthan: Boolean(data.prayerKey),
        });
        return;
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetPath);
      }
    })()
  );
});
