import { Language } from '../types/nour';
import { calculatePrayerSchedule, loadSavedLocation } from './worshipService';

const OS_BOARD_ENABLED_KEY = 'nour_prayer_os_board_v1';
const IN_APP_BOARD_VISIBLE_KEY = 'nour_prayer_inapp_board_v1';
const LAST_NOTIFIED_PRAYER_KEY = 'nour_last_athan_notif_v1';

export type NotificationPermState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermissionState(): NotificationPermState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function isOsPrayerBoardEnabled(): boolean {
  try {
    return localStorage.getItem(OS_BOARD_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOsPrayerBoardEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(OS_BOARD_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

export function isInAppPrayerBoardVisible(): boolean {
  try {
    const val = localStorage.getItem(IN_APP_BOARD_VISIBLE_KEY);
    return val === null ? true : val === '1';
  } catch {
    return true;
  }
}

export function setInAppPrayerBoardVisible(visible: boolean): void {
  try {
    localStorage.setItem(IN_APP_BOARD_VISIBLE_KEY, visible ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

export function formatShortCountdown(target: Date, nowMs: number, lang: Language, isDueNow = false): string {
  const rawSec = Math.floor((target.getTime() - nowMs) / 1000);
  if (isDueNow || rawSec <= 0) {
    return lang === 'ar' ? 'حان وقت الصلاة' : 'Prayer time now';
  }
  const h = Math.floor(rawSec / 3600);
  const m = Math.floor((rawSec % 3600) / 60);
  const s = rawSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (lang === 'ar') {
    return h > 0 ? `${h} س ${m} د` : `${pad(m)}:${pad(s)}`;
  }
  return h > 0 ? `${h}h ${m}m` : `${pad(m)}:${pad(s)}`;
}

export function formatFullCountdown(target: Date, nowMs: number, lang: Language, isDueNow = false): string {
  const rawSec = Math.floor((target.getTime() - nowMs) / 1000);
  if (isDueNow || rawSec <= 0) {
    return lang === 'ar' ? 'حان وقت الصلاة' : 'Prayer time now';
  }
  const h = Math.floor(rawSec / 3600);
  const m = Math.floor((rawSec % 3600) / 60);
  const s = rawSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const PRAYER_NAMES_AR: Record<string, string> = {
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

const PRAYER_NAMES_EN: Record<string, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

export function getPrayerLabel(key: string, lang: Language): string {
  return lang === 'ar' ? PRAYER_NAMES_AR[key] || key : PRAYER_NAMES_EN[key] || key;
}

async function dispatchSystemNotification(
  title: string,
  options: NotificationOptions & { renotify?: boolean }
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // Fall back to direct Notification constructor
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

export async function pushPrayerBoardNotification(lang: Language): Promise<boolean> {
  if (getNotificationPermissionState() !== 'granted') return false;
  const loc = loadSavedLocation();
  const now = new Date();
  const schedule = calculatePrayerSchedule(loc.lat, loc.lng, loc.method, now);

  const fmt = (d: Date) =>
    d.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const nextLabel = getPrayerLabel(schedule.nextPrayerName, lang);
  const nextTimeStr = fmt(schedule.nextPrayerTime);
  const remaining = formatShortCountdown(schedule.nextPrayerTime, now.getTime(), lang);
  const cityLabel = lang === 'ar' ? loc.labelAr : loc.labelEn;

  const title =
    lang === 'ar'
      ? `🕌 ${nextLabel} ${nextTimeStr} · بعد ${remaining}`
      : `🕌 Next: ${nextLabel} ${nextTimeStr} · in ${remaining}`;

  const body =
    lang === 'ar'
      ? `الفجر ${fmt(schedule.fajr)} | الظهر ${fmt(schedule.dhuhr)} | العصر ${fmt(schedule.asr)} | المغرب ${fmt(schedule.maghrib)} | العشاء ${fmt(schedule.isha)}\n📍 ${cityLabel}`
      : `Fajr ${fmt(schedule.fajr)} | Dhuhr ${fmt(schedule.dhuhr)} | Asr ${fmt(schedule.asr)} | Maghrib ${fmt(schedule.maghrib)} | Isha ${fmt(schedule.isha)}\n📍 ${cityLabel}`;

  return dispatchSystemNotification(title, {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'nour-prayer-board',
    silent: true,
    renotify: false,
    requireInteraction: true,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    lang: lang === 'ar' ? 'ar' : 'en',
  });
}

export async function clearPrayerBoardNotification(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const notifs = await reg.getNotifications({ tag: 'nour-prayer-board' });
        notifs.forEach((n) => n.close());
      }
    }
  } catch {
    // ignore cleanup failures
  }
}

export async function checkAndNotifyExactPrayerTime(lang: Language): Promise<void> {
  if (!isOsPrayerBoardEnabled() || getNotificationPermissionState() !== 'granted') return;
  const loc = loadSavedLocation();
  const now = new Date();
  const schedule = calculatePrayerSchedule(loc.lat, loc.lng, loc.method, now);

  const candidates = [
    { key: 'fajr', time: schedule.fajr },
    { key: 'dhuhr', time: schedule.dhuhr },
    { key: 'asr', time: schedule.asr },
    { key: 'maghrib', time: schedule.maghrib },
    { key: 'isha', time: schedule.isha },
  ];

  const todayKey = now.toISOString().slice(0, 10);
  for (const item of candidates) {
    const diffMs = now.getTime() - item.time.getTime();
    if (diffMs >= 0 && diffMs < 60000) {
      const stamp = `${todayKey}_${item.key}`;
      if (localStorage.getItem(LAST_NOTIFIED_PRAYER_KEY) === stamp) return;
      localStorage.setItem(LAST_NOTIFIED_PRAYER_KEY, stamp);

      const label = getPrayerLabel(item.key, lang);
      const cityLabel = lang === 'ar' ? loc.labelAr : loc.labelEn;
      await dispatchSystemNotification(
        lang === 'ar' ? `حان الآن موعد أذان ${label}` : `Time for ${label} Prayer`,
        {
          body: lang === 'ar' ? `📍 حسب توقيت ${cityLabel}` : `📍 Local time in ${cityLabel}`,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'nour-prayer-athan',
          renotify: true,
          dir: lang === 'ar' ? 'rtl' : 'ltr',
          lang: lang === 'ar' ? 'ar' : 'en',
        }
      );
      break;
    }
  }
}

export async function enableOsPrayerBoard(lang: Language): Promise<{
  ok: boolean;
  permission: NotificationPermState;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, permission: 'unsupported' };
  }
  let perm = Notification.permission;
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = Notification.permission;
    }
  }
  if (perm === 'granted') {
    setOsPrayerBoardEnabled(true);
    await pushPrayerBoardNotification(lang);
    return { ok: true, permission: 'granted' };
  }
  setOsPrayerBoardEnabled(false);
  return { ok: false, permission: perm };
}
