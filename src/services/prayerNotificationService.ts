import { Language } from '../types/nour';
import { calculatePrayerSchedule, loadSavedLocation } from './worshipService';

const OS_BOARD_ENABLED_KEY = 'nour_prayer_os_board_v1';
const IN_APP_BOARD_VISIBLE_KEY = 'nour_prayer_inapp_board_v1';
const LAST_NOTIFIED_PRAYER_KEY = 'nour_last_athan_notif_v1';
const PRAYER_SOUND_MODE_KEY = 'nour_prayer_sound_mode_v1';
const ATHAN_CACHE_NAME = 'nour-athan-cache-v1';

export const PRAYER_AUDIO_EVENT = 'nour_prayer_audio_state';
export const PRAYER_ATHAN_TRIGGERED_EVENT = 'nour_prayer_athan_triggered';
export const PRAYER_SOUND_CHANGED_EVENT = 'nour_prayer_sound_changed';

export type NotificationPermState = 'granted' | 'denied' | 'default' | 'unsupported';
export type PrayerSoundMode = 'athan_makkah' | 'athan_madinah' | 'chime' | 'silent';

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

function emitAudioState(playing: boolean): void {
  prayerAudioPlaying = playing;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRAYER_AUDIO_EVENT, { detail: { playing } }));
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
    // Serene harmonic Hijaz-inspired notification chime (D5 - F5 - A5 - D6)
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

type ExtendedNotificationOptions = NotificationOptions & {
  renotify?: boolean;
  vibrate?: number[];
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

  const [soundPlayed, osNotified] = await Promise.all([
    playPrayerAlertSound(effectiveMode),
    perm === 'granted'
      ? dispatchSystemNotification(
          lang === 'ar'
            ? `🔔 تجربة تنبيه أذان ${nextLabel}`
            : `🔔 Prayer Alert Test · ${nextLabel}`,
          {
            body:
              lang === 'ar'
                ? `تم تفعيل صوت إشعارات الصلاة بنجاح (${cityLabel})`
                : `Prayer notification sound is active (${cityLabel})`,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: `nour-prayer-test-${Date.now()}`,
            silent: false,
            renotify: true,
            vibrate: [240, 110, 240, 110, 320],
            dir: lang === 'ar' ? 'rtl' : 'ltr',
            lang: lang === 'ar' ? 'ar' : 'en',
          }
        )
      : Promise.resolve(false),
  ]);

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
  for (const item of candidates) {
    const diffMs = now.getTime() - item.time.getTime();
    if (diffMs >= 0 && diffMs < 60000) {
      const stamp = `${todayKey}_${item.key}`;
      if (localStorage.getItem(LAST_NOTIFIED_PRAYER_KEY) === stamp) return;
      localStorage.setItem(LAST_NOTIFIED_PRAYER_KEY, stamp);

      const label = getPrayerLabel(item.key, lang);
      const cityLabel = lang === 'ar' ? loc.labelAr : loc.labelEn;

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
          lang === 'ar' ? `🕌 حان الآن موعد أذان ${label}` : `🕌 Time for ${label} Prayer`,
          {
            body: lang === 'ar' ? `📍 حسب توقيت ${cityLabel}` : `📍 Local time in ${cityLabel}`,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: `nour-prayer-athan-${stamp}`,
            silent: !soundEnabled,
            renotify: true,
            requireInteraction: true,
            vibrate: [300, 140, 300, 140, 500],
            dir: lang === 'ar' ? 'rtl' : 'ltr',
            lang: lang === 'ar' ? 'ar' : 'en',
          }
        );
      }
      break;
    }
  }
}

export async function enableOsPrayerBoard(lang: Language): Promise<{
  ok: boolean;
  permission: NotificationPermState;
}> {
  unlockPrayerAudio();
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
    return { ok: true, permission: 'granted' };
  }
  setOsPrayerBoardEnabled(false);
  return { ok: false, permission: perm };
}
