import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Language } from '../types/nour';
import { calculatePrayerSchedule, loadSavedLocation } from './worshipService';

const OS_BOARD_ENABLED_KEY = 'nour_prayer_os_board_v1';
const IN_APP_BOARD_VISIBLE_KEY = 'nour_prayer_inapp_board_v1';
const LAST_NOTIFIED_PRAYER_KEY = 'nour_last_athan_notif_v1';
const PRAYER_SOUND_MODE_KEY = 'nour_prayer_sound_mode_v1';
const BG_KEEP_ALIVE_KEY = 'nour_prayer_bg_keepalive_v1';
const ATHAN_CACHE_NAME = 'nour-athan-cache-v1';

export const PRAYER_AUDIO_EVENT = 'nour_prayer_audio_state';
export const PRAYER_ATHAN_TRIGGERED_EVENT = 'nour_prayer_athan_triggered';
export const PRAYER_SOUND_CHANGED_EVENT = 'nour_prayer_sound_changed';
export const PRAYER_BG_STATUS_EVENT = 'nour_prayer_bg_status_changed';

export type NotificationPermState = 'granted' | 'denied' | 'default' | 'unsupported';
export type PrayerSoundMode = 'athan_makkah' | 'athan_madinah' | 'chime' | 'silent';

export interface PrayerBackgroundSupportInfo {
  isNative: boolean;
  hasTriggers: boolean;
  hasServiceWorker: boolean;
  keepAliveOn: boolean;
  scheduledCount: number;
}

export const PRAYER_SOUND_OPTIONS: Array<{
  id: PrayerSoundMode;
  labelAr: string;
  labelEn: string;
  urls: string[];
}> = [
  {
    id: 'athan_makkah',
    labelAr: 'أذان مكة المكرمة',
    labelEn: 'Makkah Athan',
    urls: [
      'https://www.islamcan.com/audio/adhan/azan1.mp3',
      'https://cdn.aladhan.com/audio/adhans/a1.mp3',
    ],
  },
  {
    id: 'athan_madinah',
    labelAr: 'أذان المدينة المنورة',
    labelEn: 'Madinah Athan',
    urls: [
      'https://www.islamcan.com/audio/adhan/azan2.mp3',
      'https://cdn.aladhan.com/audio/adhans/a1.mp3',
    ],
  },
  {
    id: 'chime',
    labelAr: 'نغمة تنبيه هادئة',
    labelEn: 'App Alert Chime',
    urls: [],
  },
  {
    id: 'silent',
    labelAr: 'صامت (بدون صوت)',
    labelEn: 'Silent',
    urls: [],
  },
];

let activeAthanAudio: HTMLAudioElement | null = null;
let activeAthanBlobUrl: string | null = null;
let sharedAudioCtx: AudioContext | null = null;
let prayerAudioPlaying = false;
let audioPlayToken = 0;
let exactNextTimeoutId: number | null = null;
let wakeLockSentinel: { release: () => Promise<void> } | null = null;
let keepAliveIntervalId: number | null = null;
let lastScheduledCount = 0;
let listenersInitialized = false;

function emitAudioState(playing: boolean): void {
  prayerAudioPlaying = playing;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRAYER_AUDIO_EVENT, { detail: { playing } }));
  }
}

function emitBgStatusChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRAYER_BG_STATUS_EVENT));
  }
}

export function isPrayerAudioPlaying(): boolean {
  return prayerAudioPlaying;
}

export function getPrayerSoundMode(): PrayerSoundMode {
  try {
    const val = localStorage.getItem(PRAYER_SOUND_MODE_KEY);
    if (val === 'athan_makkah' || val === 'athan_madinah' || val === 'chime' || val === 'silent') {
      return val;
    }
  } catch {
    // ignore storage errors
  }
  return 'athan_makkah';
}

export function setPrayerSoundMode(mode: PrayerSoundMode): void {
  try {
    localStorage.setItem(PRAYER_SOUND_MODE_KEY, mode);
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRAYER_SOUND_CHANGED_EVENT, { detail: { mode } }));
  }
  if (mode === 'silent') {
    stopPrayerAlertSound();
  } else {
    void precacheAthanAudio(mode);
  }
}

export function isPrayerSoundEnabled(): boolean {
  return getPrayerSoundMode() !== 'silent';
}

export function isBackgroundKeepAliveEnabled(): boolean {
  try {
    return localStorage.getItem(BG_KEEP_ALIVE_KEY) === '1';
  } catch {
    return false;
  }
}

async function releaseKeepAliveResources(): Promise<void> {
  if (keepAliveIntervalId !== null && typeof window !== 'undefined') {
    window.clearInterval(keepAliveIntervalId);
    keepAliveIntervalId = null;
  }
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // Ignore release failures
    }
    wakeLockSentinel = null;
  }
}

export async function setBackgroundKeepAliveEnabled(
  enabled: boolean,
  lang: Language
): Promise<boolean> {
  try {
    localStorage.setItem(BG_KEEP_ALIVE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage errors
  }

  if (!enabled) {
    await releaseKeepAliveResources();
    emitBgStatusChanged();
    return false;
  }

  unlockPrayerAudio();

  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock && document.visibilityState === 'visible') {
      wakeLockSentinel = await nav.wakeLock.request('screen');
    }
  } catch {
    // WakeLock may be unavailable in some browsers; exact timer still keeps AudioContext ready
  }

  if (keepAliveIntervalId === null && typeof window !== 'undefined') {
    keepAliveIntervalId = window.setInterval(() => {
      try {
        const ctx = getOrCreateAudioContext();
        if (ctx && ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
      } catch {
        // Ignore resume errors in background
      }
      void checkAndNotifyExactPrayerTime(lang);
    }, 15000);
  }

  emitBgStatusChanged();
  return true;
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

export function unlockPrayerAudio(): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {
    // ignore AudioContext unlock restriction
  }
}

async function precacheAthanAudio(mode: PrayerSoundMode): Promise<void> {
  const opt = PRAYER_SOUND_OPTIONS.find((o) => o.id === mode);
  const url = opt?.urls[0];
  if (!url || typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cache = await caches.open(ATHAN_CACHE_NAME);
    const existing = await cache.match(url);
    if (existing) return;
    const res = await fetch(url);
    if (res.ok) {
      await cache.put(url, res);
    }
  } catch {
    // Direct <audio> streaming remains available even without CORS cache
  }
}

async function resolveAthanUrl(url: string): Promise<string> {
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(ATHAN_CACHE_NAME);
      const match = await cache.match(url);
      if (match) {
        const blob = await match.blob();
        return URL.createObjectURL(blob);
      }
    } catch {
      // fallback to remote stream
    }
  }
  return url;
}

export function playCrystalPrayerChime(): boolean {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const notes = [
      { freq: 587.33, start: 0, dur: 0.55 },
      { freq: 698.46, start: 0.22, dur: 0.55 },
      { freq: 880.0, start: 0.44, dur: 0.65 },
      { freq: 1174.66, start: 0.72, dur: 1.05 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.start);
      gain.gain.setValueAtTime(0.0001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.22, now + n.start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.04);
    }
    return true;
  } catch {
    return false;
  }
}

export function stopPrayerAlertSound(): void {
  audioPlayToken++;
  if (activeAthanAudio) {
    try {
      activeAthanAudio.pause();
      activeAthanAudio.currentTime = 0;
    } catch {
      // ignore pause errors
    }
  }
  if (activeAthanBlobUrl) {
    URL.revokeObjectURL(activeAthanBlobUrl);
    activeAthanBlobUrl = null;
  }
  emitAudioState(false);
}

export async function playPrayerAlertSound(modeOverride?: PrayerSoundMode): Promise<boolean> {
  const mode = modeOverride ?? getPrayerSoundMode();
  if (mode === 'silent') {
    stopPrayerAlertSound();
    return false;
  }

  unlockPrayerAudio();

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([220, 110, 220]);
    } catch {
      // ignore vibration restriction
    }
  }

  if (mode === 'chime') {
    stopPrayerAlertSound();
    const ok = playCrystalPrayerChime();
    if (ok) {
      const token = audioPlayToken;
      emitAudioState(true);
      window.setTimeout(() => {
        if (token === audioPlayToken) emitAudioState(false);
      }, 1900);
    }
    return ok;
  }

  const opt = PRAYER_SOUND_OPTIONS.find((o) => o.id === mode);
  const urls = opt?.urls || [];
  if (urls.length === 0) {
    return playCrystalPrayerChime();
  }

  stopPrayerAlertSound();
  const token = ++audioPlayToken;

  if (!activeAthanAudio) {
    activeAthanAudio = new Audio();
  }
  const audio = activeAthanAudio;

  for (const candidateUrl of urls) {
    if (token !== audioPlayToken) return false;
    try {
      const playableUrl = await resolveAthanUrl(candidateUrl);
      if (token !== audioPlayToken) {
        if (playableUrl.startsWith('blob:')) URL.revokeObjectURL(playableUrl);
        return false;
      }
      if (activeAthanBlobUrl && activeAthanBlobUrl !== playableUrl) {
        URL.revokeObjectURL(activeAthanBlobUrl);
        activeAthanBlobUrl = null;
      }
      if (playableUrl.startsWith('blob:')) {
        activeAthanBlobUrl = playableUrl;
      }

      audio.src = playableUrl;
      audio.currentTime = 0;
      audio.volume = 0.9;
      audio.onended = () => {
        if (token === audioPlayToken) emitAudioState(false);
      };
      audio.onerror = () => {
        if (token === audioPlayToken) emitAudioState(false);
      };
      await audio.play();
      if (token === audioPlayToken) {
        emitAudioState(true);
        void precacheAthanAudio(mode);
        return true;
      }
      audio.pause();
      return false;
    } catch {
      // Try next fallback URL, then synthesized chime
    }
  }

  if (token === audioPlayToken) {
    const chimeOk = playCrystalPrayerChime();
    if (chimeOk) {
      emitAudioState(true);
      window.setTimeout(() => {
        if (token === audioPlayToken) emitAudioState(false);
      }, 1900);
    }
    return chimeOk;
  }
  return false;
}

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
  if (!enabled && Capacitor.isNativePlatform()) {
    void cancelNativePrayerAlarms();
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

function buildFormattedPrayerLines(
  schedule: ReturnType<typeof calculatePrayerSchedule>,
  highlightKey: string,
  lang: Language
): string[] {
  const fmt = (d: Date) =>
    d.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const cell = (key: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', time: Date) => {
    const marker = highlightKey === key ? (lang === 'ar' ? '◀ ' : '▶ ') : '';
    return `${marker}${getPrayerLabel(key, lang)} ${fmt(time)}`;
  };

  return [
    `${cell('fajr', schedule.fajr)}   •   ${cell('dhuhr', schedule.dhuhr)}`,
    `${cell('asr', schedule.asr)}   •   ${cell('maghrib', schedule.maghrib)}`,
    `${cell('isha', schedule.isha)}`,
  ];
}

type ExtendedNotificationAction = {
  action: string;
  title: string;
};

type ExtendedNotificationOptions = NotificationOptions & {
  renotify?: boolean;
  vibrate?: number[];
  actions?: ExtendedNotificationAction[];
};

async function dispatchSystemNotification(
  title: string,
  options: ExtendedNotificationOptions
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
    const cleanOptions = { ...options };
    delete cleanOptions.actions;
    new Notification(title, cleanOptions);
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

  const activeNowLabel = schedule.activePrayerNowName
    ? getPrayerLabel(schedule.activePrayerNowName, lang)
    : null;
  const nextLabel = getPrayerLabel(schedule.nextPrayerName, lang);
  const nextTimeStr = fmt(schedule.nextPrayerTime);
  const remaining = formatShortCountdown(
    schedule.nextPrayerTime,
    now.getTime(),
    lang,
    Boolean(schedule.activePrayerNowName)
  );
  const cityLabel = lang === 'ar' ? loc.labelAr : loc.labelEn;
  const summaryRows = buildFormattedPrayerLines(
    schedule,
    schedule.activePrayerNowName || schedule.nextPrayerName,
    lang
  );

  const title = activeNowLabel
    ? lang === 'ar'
      ? `🕌 حان الآن موعد صلاة ${activeNowLabel}`
      : `🕌 Now: ${activeNowLabel} Prayer`
    : lang === 'ar'
    ? `🕌 القادمة: ${nextLabel} (${nextTimeStr}) · بعد ${remaining}`
    : `🕌 Next: ${nextLabel} (${nextTimeStr}) · in ${remaining}`;

  const body = [`📍 ${cityLabel}`, ...summaryRows].join('\n');

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
    data: { url: '/prayer-times' },
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

async function getActiveChannelIdForMode(mode: PrayerSoundMode): Promise<string> {
  switch (mode) {
    case 'athan_makkah':
      return 'nour_athan_makkah';
    case 'athan_madinah':
      return 'nour_athan_madinah';
    case 'chime':
      return 'nour_prayer_chime';
    case 'silent':
      return 'nour_prayer_silent';
  }
}

async function ensureNativeChannels(lang: Language): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Promise.all([
      LocalNotifications.createChannel({
        id: 'nour_athan_makkah',
        name: lang === 'ar' ? 'أذان مكة المكرمة' : 'Makkah Athan',
        description: lang === 'ar' ? 'تنبيه مواقيت الصلاة بأذان مكة المكرمة' : 'Prayer alerts with Makkah Athan',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'azan_makkah.wav',
      }),
      LocalNotifications.createChannel({
        id: 'nour_athan_madinah',
        name: lang === 'ar' ? 'أذان المدينة المنورة' : 'Madinah Athan',
        description: lang === 'ar' ? 'تنبيه مواقيت الصلاة بأذان المدينة المنورة' : 'Prayer alerts with Madinah Athan',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'azan_madinah.wav',
      }),
      LocalNotifications.createChannel({
        id: 'nour_prayer_chime',
        name: lang === 'ar' ? 'نغمة تنبيه الصلاة' : 'Prayer Chime',
        description: lang === 'ar' ? 'تنبيه هادئ عند دخول وقت الصلاة' : 'Chime alert at prayer time',
        importance: 4,
        visibility: 1,
        vibration: true,
      }),
      LocalNotifications.createChannel({
        id: 'nour_prayer_silent',
        name: lang === 'ar' ? 'تنبيه صامت للصلاة' : 'Silent Prayer Alert',
        description: lang === 'ar' ? 'إشعار صامت عند دخول وقت الصلاة' : 'Silent prayer time notification',
        importance: 3,
        visibility: 1,
        vibration: false,
      }),
    ]);
  } catch {
    // Ignore channel setup warnings on iOS / older OS
  }
}

async function cancelNativePrayerAlarms(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const prayerIds = pending.notifications
      .filter((n) => n.id >= 1000 && n.id < 1200)
      .map((n) => ({ id: n.id }));
    if (prayerIds.length > 0) {
      await LocalNotifications.cancel({ notifications: prayerIds });
    }
  } catch {
    // Ignore cancel warnings
  }
}

async function scheduleNativeCapacitorPrayers(lang: Language): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display !== 'granted') return 0;

    if (Capacitor.getPlatform() === 'android') {
      const exact = await LocalNotifications.checkExactNotificationSetting().catch(() => null);
      if (exact && exact.exact_alarm !== 'granted') {
        await LocalNotifications.changeExactNotificationSetting().catch(() => null);
      }
    }

    await ensureNativeChannels(lang);
    await cancelNativePrayerAlarms();

    const loc = loadSavedLocation();
    const cityLabel = lang === 'ar' ? loc.labelAr : loc.labelEn;
    const mode = getPrayerSoundMode();
    const channelId = await getActiveChannelIdForMode(mode);
    const fmt = (d: Date) =>
      d.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

    const notifications: Array<{
      id: number;
      title: string;
      body: string;
      schedule: { at: Date; allowWhileIdle: boolean };
      channelId: string;
      sound?: string;
      extra: { prayerKey: string };
    }> = [];

    const nowMs = Date.now();
    let idCounter = 1000;
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const refDate = new Date(nowMs + dayOffset * 86400000);
      const daySchedule = calculatePrayerSchedule(loc.lat, loc.lng, loc.method, refDate);
      const rows = [
        { key: 'fajr' as const, time: daySchedule.fajr },
        { key: 'dhuhr' as const, time: daySchedule.dhuhr },
        { key: 'asr' as const, time: daySchedule.asr },
        { key: 'maghrib' as const, time: daySchedule.maghrib },
        { key: 'isha' as const, time: daySchedule.isha },
      ];
      for (const row of rows) {
        if (row.time.getTime() <= nowMs + 4000) continue;
        const label = getPrayerLabel(row.key, lang);
        const timeStr = fmt(row.time);
        const summaryLines = buildFormattedPrayerLines(daySchedule, row.key, lang);
        notifications.push({
          id: idCounter++,
          title:
            lang === 'ar'
              ? `🕌 حان الآن موعد أذان ${label} (${timeStr})`
              : `🕌 Time for ${label} Prayer (${timeStr})`,
          body: [`📍 ${cityLabel}`, ...summaryLines].join('\n'),
          schedule: {
            at: row.time,
            allowWhileIdle: true,
          },
          channelId,
          sound:
            mode === 'athan_makkah'
              ? 'azan_makkah.wav'
              : mode === 'athan_madinah'
              ? 'azan_madinah.wav'
              : undefined,
          extra: { prayerKey: row.key },
        });
      }
    }

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }
    return notifications.length;
  } catch {
    return 0;
  }
}

function schedulePreciseNextPrayerTimeout(lang: Language): void {
  if (typeof window === 'undefined') return;
  if (exactNextTimeoutId !== null) {
    window.clearTimeout(exactNextTimeoutId);
    exactNextTimeoutId = null;
  }

  const soundEnabled = isPrayerSoundEnabled();
  const osEnabled = isOsPrayerBoardEnabled();
  if (!soundEnabled && !osEnabled) return;

  const loc = loadSavedLocation();
  const now = new Date();
  const schedule = calculatePrayerSchedule(loc.lat, loc.lng, loc.method, now);
  const delayMs = schedule.nextPrayerTime.getTime() - now.getTime();
  if (delayMs > 0 && delayMs <= 18 * 60 * 60 * 1000) {
    exactNextTimeoutId = window.setTimeout(() => {
      void checkAndNotifyExactPrayerTime(lang);
      schedulePreciseNextPrayerTimeout(lang);
    }, delayMs + 250);
  }
}

export function getPrayerBackgroundSupportInfo(): PrayerBackgroundSupportInfo {
  const isNative = Capacitor.isNativePlatform();
  const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasTriggers =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'showTrigger' in Notification.prototype;

  return {
    isNative,
    hasTriggers,
    hasServiceWorker,
    keepAliveOn: isBackgroundKeepAliveEnabled(),
    scheduledCount: lastScheduledCount,
  };
}

export async function syncPrayerNotificationsSchedule(lang: Language): Promise<number> {
  schedulePreciseNextPrayerTimeout(lang);

  const enabled = isPrayerSoundEnabled() || isOsPrayerBoardEnabled();
  if (!enabled) {
    lastScheduledCount = 0;
    if (Capacitor.isNativePlatform()) {
      await cancelNativePrayerAlarms();
    } else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1000)),
        ]);
        const target = navigator.serviceWorker.controller || reg?.active;
        target?.postMessage({ type: 'SYNC_PRAYER_SCHEDULE', payload: { enabled: false, items: [] } });
      } catch {
        // ignore SW cleanup errors
      }
    }
    emitBgStatusChanged();
    return 0;
  }

  if (Capacitor.isNativePlatform()) {
    const count = await scheduleNativeCapacitorPrayers(lang);
    lastScheduledCount = count;
    emitBgStatusChanged();
    return count;
  }

  const loc = loadSavedLocation();
  const cityLabel = lang === 'ar' ? loc.labelAr : loc.labelEn;
  const fmt = (d: Date) =>
    d.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const nowMs = Date.now();
  const items: Array<{
    stamp: string;
    key: string;
    label: string;
    timeStr: string;
    timestamp: number;
    summaryRows: string[];
  }> = [];

  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    const refDate = new Date(nowMs + dayOffset * 86400000);
    const dayKey = refDate.toISOString().slice(0, 10);
    const daySchedule = calculatePrayerSchedule(loc.lat, loc.lng, loc.method, refDate);
    const rows = [
      { key: 'fajr' as const, time: daySchedule.fajr },
      { key: 'dhuhr' as const, time: daySchedule.dhuhr },
      { key: 'asr' as const, time: daySchedule.asr },
      { key: 'maghrib' as const, time: daySchedule.maghrib },
      { key: 'isha' as const, time: daySchedule.isha },
    ];
    for (const r of rows) {
      if (r.time.getTime() <= nowMs - 60000) continue;
      items.push({
        stamp: `${dayKey}_${r.key}`,
        key: r.key,
        label: getPrayerLabel(r.key, lang),
        timeStr: fmt(r.time),
        timestamp: r.time.getTime(),
        summaryRows: buildFormattedPrayerLines(daySchedule, r.key, lang),
      });
    }
  }

  lastScheduledCount = items.length;

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
      ]);
      const payload = {
        enabled: true,
        boardPinned: isOsPrayerBoardEnabled() && getNotificationPermissionState() === 'granted',
        soundEnabled: isPrayerSoundEnabled(),
        lang,
        cityLabel,
        items,
      };
      const target = navigator.serviceWorker.controller || reg?.active;
      if (target) {
        target.postMessage({ type: 'SYNC_PRAYER_SCHEDULE', payload });
      }
      const regWithSync = reg as
        | (ServiceWorkerRegistration & {
            periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
          })
        | null;
      if (regWithSync?.periodicSync) {
        await regWithSync.periodicSync.register('nour-prayer-sync', {
          minInterval: 15 * 60 * 1000,
        }).catch(() => {});
      }
    } catch {
      // Service Worker sync unavailable
    }
  }

  emitBgStatusChanged();
  return items.length;
}

export function initPrayerNotificationListeners(
  lang: Language,
  onOpenWorship?: () => void
): void {
  if (typeof window === 'undefined' || listenersInitialized) return;
  listenersInitialized = true;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data as {
        type?: string;
        prayerKey?: string | null;
        playAthan?: boolean;
      } | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'NOUR_STOP_ATHAN') {
        stopPrayerAlertSound();
      } else if (data.type === 'NOUR_OPEN_PRAYER_FROM_NOTIF') {
        onOpenWorship?.();
        if (data.playAthan && isPrayerSoundEnabled()) {
          if (data.prayerKey) {
            window.dispatchEvent(
              new CustomEvent(PRAYER_ATHAN_TRIGGERED_EVENT, {
                detail: { prayerKey: data.prayerKey, label: getPrayerLabel(data.prayerKey, lang) },
              })
            );
          }
          void playPrayerAlertSound();
        }
      }
    });
  }

  // Handle opening directly via notification URL (?playAthan=1&prayer=asr)
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('playAthan') === '1') {
      const prayerKey = params.get('prayer') || 'fajr';
      params.delete('playAthan');
      params.delete('prayer');
      const rest = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
      onOpenWorship?.();
      if (isPrayerSoundEnabled()) {
        window.dispatchEvent(
          new CustomEvent(PRAYER_ATHAN_TRIGGERED_EVENT, {
            detail: { prayerKey, label: getPrayerLabel(prayerKey, lang) },
          })
        );
        void playPrayerAlertSound();
      }
    }
  } catch {
    // Ignore URL parse error
  }

  if (Capacitor.isNativePlatform()) {
    void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      onOpenWorship?.();
      const prayerKey = (action.notification.extra as { prayerKey?: string } | undefined)?.prayerKey;
      if (prayerKey) {
        window.dispatchEvent(
          new CustomEvent(PRAYER_ATHAN_TRIGGERED_EVENT, {
            detail: { prayerKey, label: getPrayerLabel(prayerKey, lang) },
          })
        );
      }
    }).catch(() => {});
  }
}

export async function testPrayerNotificationSound(lang: Language): Promise<{
  soundPlayed: boolean;
  osNotified: boolean;
}> {
  unlockPrayerAudio();
  const mode = getPrayerSoundMode();
  const effectiveMode: PrayerSoundMode = mode === 'silent' ? 'athan_makkah' : mode;
  if (mode === 'silent') {
    setPrayerSoundMode('athan_makkah');
  }

  let perm = getNotificationPermissionState();
  if (perm === 'default' && typeof Notification !== 'undefined') {
    try {
      perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setOsPrayerBoardEnabled(true);
      }
    } catch {
      perm = getNotificationPermissionState();
    }
  }

  const loc = loadSavedLocation();
  const schedule = calculatePrayerSchedule(loc.lat, loc.lng, loc.method, new Date());
  const nextLabel = getPrayerLabel(schedule.nextPrayerName, lang);
  const cityLabel = lang === 'ar' ? loc.labelAr : loc.labelEn;
  const summaryLines = buildFormattedPrayerLines(schedule, schedule.nextPrayerName, lang);

  const [soundPlayed, osNotified] = await Promise.all([
    playPrayerAlertSound(effectiveMode),
    perm === 'granted'
      ? dispatchSystemNotification(
          lang === 'ar'
            ? `🔔 تجربة إشعار الصلاة · القادمة: ${nextLabel}`
            : `🔔 Prayer Alert Test · Next: ${nextLabel}`,
          {
            body: [`📍 ${cityLabel}`, ...summaryLines].join('\n'),
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: `nour-prayer-test-${Date.now()}`,
            silent: false,
            renotify: true,
            vibrate: [240, 110, 240, 110, 320],
            dir: lang === 'ar' ? 'rtl' : 'ltr',
            lang: lang === 'ar' ? 'ar' : 'en',
            actions: [
              { action: 'play-athan', title: lang === 'ar' ? '🔊 تشغيل الأذان' : '🔊 Play Athan' },
              { action: 'stop-athan', title: lang === 'ar' ? '⏹ إيقاف' : '⏹ Stop' },
            ],
            data: {
              url: `/prayer-times?playAthan=1&prayer=${schedule.nextPrayerName}`,
              prayerKey: schedule.nextPrayerName,
            },
          }
        )
      : Promise.resolve(false),
  ]);

  void syncPrayerNotificationsSchedule(lang);
  return { soundPlayed, osNotified };
}

export async function checkAndNotifyExactPrayerTime(lang: Language): Promise<void> {
  const soundEnabled = isPrayerSoundEnabled();
  const osGranted = isOsPrayerBoardEnabled() && getNotificationPermissionState() === 'granted';
  if (!soundEnabled && !osGranted) return;

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
  const fmt = (d: Date) =>
    d.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  for (const item of candidates) {
    const diffMs = now.getTime() - item.time.getTime();
    if (diffMs >= 0 && diffMs < 60000) {
      const stamp = `${todayKey}_${item.key}`;
      if (localStorage.getItem(LAST_NOTIFIED_PRAYER_KEY) === stamp) return;
      localStorage.setItem(LAST_NOTIFIED_PRAYER_KEY, stamp);

      const label = getPrayerLabel(item.key, lang);
      const cityLabel = lang === 'ar' ? loc.labelAr : loc.labelEn;
      const summaryLines = buildFormattedPrayerLines(schedule, item.key, lang);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(PRAYER_ATHAN_TRIGGERED_EVENT, {
            detail: { prayerKey: item.key, label },
          })
        );
      }

      if (soundEnabled) {
        void playPrayerAlertSound();
      }

      if (osGranted) {
        await dispatchSystemNotification(
          lang === 'ar'
            ? `🕌 حان الآن موعد أذان ${label} (${fmt(item.time)})`
            : `🕌 Time for ${label} Prayer (${fmt(item.time)})`,
          {
            body: [`📍 ${cityLabel}`, ...summaryLines].join('\n'),
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: `nour-prayer-athan-${stamp}`,
            silent: !soundEnabled,
            renotify: true,
            requireInteraction: true,
            vibrate: [300, 140, 300, 140, 500],
            dir: lang === 'ar' ? 'rtl' : 'ltr',
            lang: lang === 'ar' ? 'ar' : 'en',
            actions: [
              { action: 'play-athan', title: lang === 'ar' ? '🔊 تشغيل الأذان' : '🔊 Play Athan' },
              { action: 'stop-athan', title: lang === 'ar' ? '⏹ إيقاف' : '⏹ Stop' },
            ],
            data: {
              url: `/prayer-times?playAthan=1&prayer=${item.key}`,
              prayerKey: item.key,
            },
          }
        );
      }

      void syncPrayerNotificationsSchedule(lang);
      break;
    }
  }
}

export async function enableOsPrayerBoard(lang: Language): Promise<{
  ok: boolean;
  permission: NotificationPermState;
}> {
  unlockPrayerAudio();

  if (Capacitor.isNativePlatform()) {
    try {
      let perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        perm = await LocalNotifications.requestPermissions();
      }
      if (perm.display === 'granted') {
        setOsPrayerBoardEnabled(true);
        if (getPrayerSoundMode() === 'silent') {
          setPrayerSoundMode('athan_makkah');
        }
        await syncPrayerNotificationsSchedule(lang);
        return { ok: true, permission: 'granted' };
      }
      setOsPrayerBoardEnabled(false);
      return { ok: false, permission: perm.display === 'denied' ? 'denied' : 'default' };
    } catch {
      return { ok: false, permission: 'unsupported' };
    }
  }

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
    if (getPrayerSoundMode() === 'silent') {
      setPrayerSoundMode('athan_makkah');
    } else {
      void precacheAthanAudio(getPrayerSoundMode());
    }
    await pushPrayerBoardNotification(lang);
    await syncPrayerNotificationsSchedule(lang);
    return { ok: true, permission: 'granted' };
  }
  setOsPrayerBoardEnabled(false);
  return { ok: false, permission: perm };
}
