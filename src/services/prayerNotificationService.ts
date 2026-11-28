import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Language } from '../types/nour';
import { calculatePrayerSchedule, loadSavedLocation } from './worshipService';
import {
  addNativeAthanActionListener,
  addNativePrayerActionListener,
  clearNativePinnedPrayerBar,
  setNativeAthanFlipMonitor,
  showNativePinnedPrayerBar,
  stopNativeAthanNotification,
} from './nourNativeBridge';

const OS_BOARD_ENABLED_KEY = 'nour_prayer_os_board_v1';
const IN_APP_BOARD_VISIBLE_KEY = 'nour_prayer_inapp_board_v1';
const LAST_NOTIFIED_PRAYER_KEY = 'nour_last_athan_notif_v1';
const PRAYER_SOUND_MODE_KEY = 'nour_prayer_sound_mode_v1';
const CUSTOM_ATHANS_KEY = 'nour_custom_athans_v1';
const FLIP_TO_SILENCE_KEY = 'nour_flip_to_silence_v1';
const BG_KEEP_ALIVE_KEY = 'nour_prayer_bg_keepalive_v1';
const ATHAN_CACHE_NAME = 'nour-athan-cache-v1';
const CUSTOM_ATHAN_DB_NAME = 'nour_custom_athan_db';
const CUSTOM_ATHAN_STORE = 'audio_blobs';
const MAX_CUSTOM_AUDIO_BYTES = 15 * 1024 * 1024;

export const PRAYER_AUDIO_EVENT = 'nour_prayer_audio_state';
export const PRAYER_ATHAN_TRIGGERED_EVENT = 'nour_prayer_athan_triggered';
export const PRAYER_SOUND_CHANGED_EVENT = 'nour_prayer_sound_changed';
export const PRAYER_BG_STATUS_EVENT = 'nour_prayer_bg_status_changed';
export const PRAYER_FLIP_SETTING_CHANGED_EVENT = 'nour_prayer_flip_setting_changed';
export const PRAYER_FLIP_STOPPED_EVENT = 'nour_prayer_flip_stopped';

export type NotificationPermState = 'granted' | 'denied' | 'default' | 'unsupported';
export type BuiltinPrayerSoundMode =
  | 'athan_makkah'
  | 'athan_madinah'
  | 'athan_aqsa'
  | 'athan_egypt'
  | 'athan_fajr'
  | 'chime'
  | 'silent';
export type PrayerSoundMode = BuiltinPrayerSoundMode | `custom_${string}`;

export interface CustomAthanVoice {
  id: `custom_${string}`;
  label: string;
  kind: 'file' | 'url';
  url?: string;
  createdAt: string;
}

export interface PrayerBackgroundSupportInfo {
  isNative: boolean;
  hasTriggers: boolean;
  hasServiceWorker: boolean;
  keepAliveOn: boolean;
  scheduledCount: number;
}

export const PRAYER_SOUND_OPTIONS: Array<{
  id: BuiltinPrayerSoundMode;
  labelAr: string;
  labelEn: string;
  urls: string[];
}> = [
  {
    id: 'athan_makkah',
    labelAr: 'أذان مكة المكرمة',
    labelEn: 'Makkah Athan',
    urls: [
      '/audio/azan_makkah.mp3',
      'https://www.islamcan.com/audio/adhan/azan1.mp3',
      'https://cdn.aladhan.com/audio/adhans/a1.mp3',
    ],
  },
  {
    id: 'athan_madinah',
    labelAr: 'أذان المدينة المنورة',
    labelEn: 'Madinah Athan',
    urls: [
      '/audio/azan_madinah.mp3',
      'https://www.islamcan.com/audio/adhan/azan2.mp3',
      'https://cdn.aladhan.com/audio/adhans/a1.mp3',
    ],
  },
  {
    id: 'athan_aqsa',
    labelAr: 'أذان المسجد الأقصى',
    labelEn: 'Al-Aqsa Athan',
    urls: [
      'https://www.islamcan.com/audio/adhan/azan3.mp3',
      'https://cdn.aladhan.com/audio/adhans/a2.mp3',
      '/audio/azan_makkah.mp3',
    ],
  },
  {
    id: 'athan_egypt',
    labelAr: 'أذان مصري خاشع',
    labelEn: 'Egyptian Athan',
    urls: [
      'https://www.islamcan.com/audio/adhan/azan6.mp3',
      'https://cdn.aladhan.com/audio/adhans/a3.mp3',
      '/audio/azan_makkah.mp3',
    ],
  },
  {
    id: 'athan_fajr',
    labelAr: 'أذان الفجر',
    labelEn: 'Fajr Athan',
    urls: [
      'https://www.islamcan.com/audio/adhan/azan5.mp3',
      'https://cdn.aladhan.com/audio/adhans/a4.mp3',
      '/audio/azan_madinah.mp3',
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
let activeLangRef: Language = 'ar';
let webFlipCleanup: (() => void) | null = null;

function openCustomAthanDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(CUSTOM_ATHAN_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CUSTOM_ATHAN_STORE)) {
        db.createObjectStore(CUSTOM_ATHAN_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function saveCustomAthanBlob(id: string, blob: Blob): Promise<void> {
  const db = await openCustomAthanDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CUSTOM_ATHAN_STORE, 'readwrite');
      tx.objectStore(CUSTOM_ATHAN_STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed saving audio blob'));
    });
  } finally {
    db.close();
  }
}

async function loadCustomAthanBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openCustomAthanDb();
    try {
      return await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(CUSTOM_ATHAN_STORE, 'readonly');
        const req = tx.objectStore(CUSTOM_ATHAN_STORE).get(id);
        req.onsuccess = () => resolve((req.result as Blob | undefined) || null);
        req.onerror = () => reject(req.error || new Error('Failed reading audio blob'));
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function removeCustomAthanBlob(id: string): Promise<void> {
  try {
    const db = await openCustomAthanDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CUSTOM_ATHAN_STORE, 'readwrite');
        tx.objectStore(CUSTOM_ATHAN_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed removing audio blob'));
      });
    } finally {
      db.close();
    }
  } catch {
    // Ignore IndexedDB cleanup errors
  }
}

export function isCustomPrayerSoundMode(mode: string): mode is `custom_${string}` {
  return mode.startsWith('custom_');
}

export function getCustomAthanVoices(): CustomAthanVoice[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ATHANS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CustomAthanVoice =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        item.id.startsWith('custom_') &&
        typeof item.label === 'string' &&
        (item.kind === 'file' || item.kind === 'url')
    );
  } catch {
    return [];
  }
}

function saveCustomAthanVoices(list: CustomAthanVoice[]): void {
  try {
    localStorage.setItem(CUSTOM_ATHANS_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

export function getAllPrayerSoundOptions(): Array<{
  id: PrayerSoundMode;
  labelAr: string;
  labelEn: string;
  isCustom?: boolean;
}> {
  const custom = getCustomAthanVoices().map((voice) => ({
    id: voice.id as PrayerSoundMode,
    labelAr: voice.label,
    labelEn: voice.label,
    isCustom: true,
  }));
  const builtins = PRAYER_SOUND_OPTIONS.map((opt) => ({
    id: opt.id as PrayerSoundMode,
    labelAr: opt.labelAr,
    labelEn: opt.labelEn,
    isCustom: false,
  }));
  const silentIdx = builtins.findIndex((o) => o.id === 'silent');
  if (silentIdx >= 0) {
    return [...builtins.slice(0, silentIdx), ...custom, ...builtins.slice(silentIdx)];
  }
  return [...builtins, ...custom];
}

export async function addCustomAthanFile(file: File, customLabel?: string): Promise<CustomAthanVoice> {
  const isAudioMime = file.type.startsWith('audio/');
  const hasAudioExt = /\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(file.name);
  if (!isAudioMime && !hasAudioExt) {
    throw new Error('INVALID_AUDIO_FILE');
  }
  if (file.size > MAX_CUSTOM_AUDIO_BYTES) {
    throw new Error('AUDIO_TOO_LARGE');
  }

  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` as `custom_${string}`;
  const cleanName = file.name.replace(/\.[^/.]+$/, '').trim();
  const label = (customLabel || cleanName || 'أذان مخصص').slice(0, 48);

  await saveCustomAthanBlob(id, file);
  const voice: CustomAthanVoice = {
    id,
    label,
    kind: 'file',
    createdAt: new Date().toISOString(),
  };
  const next = [...getCustomAthanVoices(), voice];
  saveCustomAthanVoices(next);
  setPrayerSoundMode(id);
  return voice;
}

export function addCustomAthanUrl(url: string, label: string): CustomAthanVoice {
  const trimmedUrl = url.trim();
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    throw new Error('INVALID_URL');
  }
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` as `custom_${string}`;
  const cleanLabel = (label.trim() || 'أذان مخصص').slice(0, 48);
  const voice: CustomAthanVoice = {
    id,
    label: cleanLabel,
    kind: 'url',
    url: trimmedUrl,
    createdAt: new Date().toISOString(),
  };
  const next = [...getCustomAthanVoices(), voice];
  saveCustomAthanVoices(next);
  setPrayerSoundMode(id);
  return voice;
}

export async function deleteCustomAthanVoice(id: `custom_${string}`): Promise<void> {
  const current = getCustomAthanVoices();
  const target = current.find((v) => v.id === id);
  const next = current.filter((v) => v.id !== id);
  saveCustomAthanVoices(next);
  if (target?.kind === 'file') {
    await removeCustomAthanBlob(id);
  }
  if (getPrayerSoundMode() === id) {
    setPrayerSoundMode('athan_makkah');
  } else if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRAYER_SOUND_CHANGED_EVENT, { detail: { mode: getPrayerSoundMode() } }));
  }
}

export function isFlipToSilenceEnabled(): boolean {
  try {
    const val = localStorage.getItem(FLIP_TO_SILENCE_KEY);
    return val === null ? true : val === '1';
  } catch {
    return true;
  }
}

export function setFlipToSilenceEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FLIP_TO_SILENCE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage errors
  }
  if (Capacitor.isNativePlatform()) {
    void setNativeAthanFlipMonitor(prayerAudioPlaying, enabled);
  } else if (!enabled) {
    stopWebFlipMonitor();
  } else if (prayerAudioPlaying) {
    startWebFlipMonitor();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRAYER_FLIP_SETTING_CHANGED_EVENT, { detail: { enabled } }));
  }
}

function stopWebFlipMonitor(): void {
  if (webFlipCleanup) {
    webFlipCleanup();
    webFlipCleanup = null;
  }
}

function startWebFlipMonitor(): void {
  if (typeof window === 'undefined' || Capacitor.isNativePlatform()) return;
  if (!isFlipToSilenceEnabled()) return;
  stopWebFlipMonitor();

  const startedAt = Date.now();
  let sawUprightOrFaceUp = false;
  let orientFaceDownCount = 0;
  let motionFaceDownCount = 0;

  const triggerFlipStop = () => {
    stopWebFlipMonitor();
    stopPrayerAlertSound('flip');
  };

  const onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    const absBeta = Math.abs(e.beta);
    const absGamma = Math.abs(e.gamma);
    if (absBeta < 100) {
      sawUprightOrFaceUp = true;
      orientFaceDownCount = 0;
      return;
    }
    if (Date.now() - startedAt < 300) return;
    if (sawUprightOrFaceUp && absBeta > 140 && absGamma < 50) {
      orientFaceDownCount++;
      if (orientFaceDownCount >= 2) {
        triggerFlipStop();
      }
    } else {
      orientFaceDownCount = 0;
    }
  };

  const onMotion = (e: DeviceMotionEvent) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc || acc.z === null || acc.x === null || acc.y === null) return;
    if (acc.z > -1.5) {
      sawUprightOrFaceUp = true;
      motionFaceDownCount = 0;
      return;
    }
    if (Date.now() - startedAt < 300) return;
    if (sawUprightOrFaceUp && acc.z < -6.8 && Math.abs(acc.x) < 6.0 && Math.abs(acc.y) < 6.0) {
      motionFaceDownCount++;
      if (motionFaceDownCount >= 2) {
        triggerFlipStop();
      }
    } else {
      motionFaceDownCount = 0;
    }
  };

  window.addEventListener('deviceorientation', onOrientation);
  window.addEventListener('devicemotion', onMotion);

  webFlipCleanup = () => {
    window.removeEventListener('deviceorientation', onOrientation);
    window.removeEventListener('devicemotion', onMotion);
  };
}

function emitAudioState(playing: boolean): void {
  prayerAudioPlaying = playing;
  const flipEnabled = isFlipToSilenceEnabled();
  if (Capacitor.isNativePlatform()) {
    void setNativeAthanFlipMonitor(playing, flipEnabled);
    if (isOsPrayerBoardEnabled()) {
      void pushPrayerBoardNotification(activeLangRef);
    }
  } else if (playing && flipEnabled) {
    startWebFlipMonitor();
  } else {
    stopWebFlipMonitor();
  }
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
    if (
      val === 'athan_makkah' ||
      val === 'athan_madinah' ||
      val === 'athan_aqsa' ||
      val === 'athan_egypt' ||
      val === 'athan_fajr' ||
      val === 'chime' ||
      val === 'silent'
    ) {
      return val;
    }
    if (val && isCustomPrayerSoundMode(val)) {
      const exists = getCustomAthanVoices().some((v) => v.id === val);
      if (exists) return val;
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
  activeLangRef = lang;
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
  if (typeof window === 'undefined' || !('caches' in window)) return;
  let url: string | undefined;
  if (isCustomPrayerSoundMode(mode)) {
    const voice = getCustomAthanVoices().find((v) => v.id === mode);
    if (voice?.kind === 'url') url = voice.url;
  } else {
    url = PRAYER_SOUND_OPTIONS.find((o) => o.id === mode)?.urls[0];
  }
  if (!url) return;
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

export function stopPrayerAlertSound(
  reason: 'manual' | 'flip' | 'internal' = 'manual',
  fromNative = false
): void {
  audioPlayToken++;
  if (activeAthanAudio) {
    activeAthanAudio.onended = null;
    activeAthanAudio.onerror = null;
    try {
      activeAthanAudio.pause();
      activeAthanAudio.currentTime = 0;
      activeAthanAudio.removeAttribute('src');
      activeAthanAudio.load();
    } catch {
      // ignore pause errors
    }
  }
  if (activeAthanBlobUrl) {
    URL.revokeObjectURL(activeAthanBlobUrl);
    activeAthanBlobUrl = null;
  }
  if (!fromNative && reason !== 'internal' && Capacitor.isNativePlatform()) {
    void stopNativeAthanNotification();
  }
  emitAudioState(false);
  if (reason === 'flip' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRAYER_FLIP_STOPPED_EVENT));
  }
}

async function getCandidateUrlsForMode(mode: PrayerSoundMode): Promise<string[]> {
  if (isCustomPrayerSoundMode(mode)) {
    const voice = getCustomAthanVoices().find((v) => v.id === mode);
    if (!voice) return ['/audio/azan_makkah.mp3'];
    if (voice.kind === 'file') {
      const blob = await loadCustomAthanBlob(voice.id);
      if (blob) {
        return [URL.createObjectURL(blob), '/audio/azan_makkah.mp3'];
      }
      return ['/audio/azan_makkah.mp3'];
    }
    return voice.url ? [voice.url, '/audio/azan_makkah.mp3'] : ['/audio/azan_makkah.mp3'];
  }
  const opt = PRAYER_SOUND_OPTIONS.find((o) => o.id === mode);
  return opt?.urls || [];
}

export async function playPrayerAlertSound(modeOverride?: PrayerSoundMode): Promise<boolean> {
  const mode = modeOverride ?? getPrayerSoundMode();
  if (mode === 'silent') {
    stopPrayerAlertSound('internal');
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
    stopPrayerAlertSound('internal');
    const token = audioPlayToken;
    const ok = playCrystalPrayerChime();
    if (ok) {
      emitAudioState(true);
      window.setTimeout(() => {
        if (token === audioPlayToken) emitAudioState(false);
      }, 1900);
    }
    return ok;
  }

  const urls = await getCandidateUrlsForMode(mode);
  if (urls.length === 0) {
    return playCrystalPrayerChime();
  }

  stopPrayerAlertSound('internal');
  const token = ++audioPlayToken;

  if (!activeAthanAudio) {
    activeAthanAudio = new Audio();
  }
  const audio = activeAthanAudio;

  for (const candidateUrl of urls) {
    if (token !== audioPlayToken) {
      if (candidateUrl.startsWith('blob:')) URL.revokeObjectURL(candidateUrl);
      return false;
    }
    try {
      const playableUrl = candidateUrl.startsWith('blob:')
        ? candidateUrl
        : await resolveAthanUrl(candidateUrl);
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
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore InvalidStateError before metadata loads on some WebViews
      }
      audio.volume = 0.92;
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
      if (candidateUrl.startsWith('blob:')) {
        URL.revokeObjectURL(candidateUrl);
      }
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
    const marker = highlightKey === key ? '✦ ' : '';
    return `${marker}${getPrayerLabel(key, lang)}  ${fmt(time)}`;
  };

  return [
    `${cell('fajr', schedule.fajr)}   |   ${cell('dhuhr', schedule.dhuhr)}`,
    `${cell('asr', schedule.asr)}   |   ${cell('maghrib', schedule.maghrib)}`,
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
  activeLangRef = lang;
  const isNative = Capacitor.isNativePlatform();
  if (isNative) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return false;
    } catch {
      return false;
    }
  } else if (getNotificationPermissionState() !== 'granted') {
    return false;
  }

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
    ? `🕌 ${nextLabel} (${nextTimeStr}) · متبقي ${remaining}`
    : `🕌 Next: ${nextLabel} (${nextTimeStr}) · in ${remaining}`;

  if (isNative) {
    const flipHint = isFlipToSilenceEnabled()
      ? lang === 'ar'
        ? 'قلب الهاتف يوقف الأذان'
        : 'Flip phone stops Athan'
      : lang === 'ar'
      ? 'مواقيت اليوم'
      : 'Today schedule';
    return showNativePinnedPrayerBar({
      title,
      body: summaryRows.join('\n'),
      subText: `📍 ${cityLabel}`,
      summaryText: `نور · ${flipHint}`,
      refreshLabel: lang === 'ar' ? 'تحديث' : 'Refresh',
      stopAthanLabel: lang === 'ar' ? 'إيقاف الأذان' : 'Stop Athan',
      showStopAthan: prayerAudioPlaying,
    });
  }

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
  if (Capacitor.isNativePlatform()) {
    await clearNativePinnedPrayerBar();
    return;
  }
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
    case 'athan_madinah':
    case 'athan_fajr':
      return 'nour_athan_madinah';
    case 'chime':
      return 'nour_prayer_chime';
    case 'silent':
      return 'nour_prayer_silent';
    case 'athan_makkah':
    case 'athan_aqsa':
    case 'athan_egypt':
    default:
      return 'nour_athan_makkah';
  }
}

async function ensureNativeChannels(lang: Language): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Promise.all([
      LocalNotifications.createChannel({
        id: 'nour_athan_makkah',
        name: lang === 'ar' ? 'أذان مكة والمختارات' : 'Makkah & Classic Athan',
        description: lang === 'ar' ? 'تنبيه مواقيت الصلاة بصوت الأذان' : 'Prayer alerts with Athan',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'azan_makkah.mp3',
      }),
      LocalNotifications.createChannel({
        id: 'nour_athan_madinah',
        name: lang === 'ar' ? 'أذان المدينة المنورة والفجر' : 'Madinah & Fajr Athan',
        description: lang === 'ar' ? 'تنبيه مواقيت الصلاة بأذان المدينة والفجر' : 'Prayer alerts with Madinah Athan',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'azan_madinah.mp3',
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
        const nativeSound =
          mode === 'silent' || mode === 'chime'
            ? undefined
            : mode === 'athan_madinah' || mode === 'athan_fajr'
            ? 'azan_madinah.mp3'
            : 'azan_makkah.mp3';

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
          sound: nativeSound,
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
  activeLangRef = lang;
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
    if (isOsPrayerBoardEnabled()) {
      void pushPrayerBoardNotification(lang);
    }
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
  activeLangRef = lang;
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
        stopPrayerAlertSound('manual');
      } else if (data.type === 'NOUR_OPEN_PRAYER_FROM_NOTIF') {
        onOpenWorship?.();
        if (data.playAthan && isPrayerSoundEnabled()) {
          if (data.prayerKey) {
            window.dispatchEvent(
              new CustomEvent(PRAYER_ATHAN_TRIGGERED_EVENT, {
                detail: { prayerKey: data.prayerKey, label: getPrayerLabel(data.prayerKey, activeLangRef) },
              })
            );
          }
          void playPrayerAlertSound();
        }
      }
    });
  }

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
            detail: { prayerKey, label: getPrayerLabel(prayerKey, activeLangRef) },
          })
        );
        void playPrayerAlertSound();
      }
    }
  } catch {
    // Ignore URL parse error
  }

  if (Capacitor.isNativePlatform()) {
    void LocalNotifications.addListener('localNotificationReceived', (notification) => {
      if (notification.id >= 1000 && notification.id < 1200 && isFlipToSilenceEnabled()) {
        void setNativeAthanFlipMonitor(true, true);
      }
    }).catch(() => {});

    void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      onOpenWorship?.();
      const prayerKey = (action.notification.extra as { prayerKey?: string } | undefined)?.prayerKey;
      if (prayerKey) {
        window.dispatchEvent(
          new CustomEvent(PRAYER_ATHAN_TRIGGERED_EVENT, {
            detail: { prayerKey, label: getPrayerLabel(prayerKey, activeLangRef) },
          })
        );
      }
    }).catch(() => {});

    addNativeAthanActionListener((action) => {
      stopPrayerAlertSound(action === 'stop_flip' ? 'flip' : 'manual', true);
    });

    addNativePrayerActionListener((action) => {
      if (action === 'refresh' && isOsPrayerBoardEnabled()) {
        void pushPrayerBoardNotification(activeLangRef);
      }
    });
  }
}

export async function testPrayerNotificationSound(lang: Language): Promise<{
  soundPlayed: boolean;
  osNotified: boolean;
}> {
  activeLangRef = lang;
  unlockPrayerAudio();
  const mode = getPrayerSoundMode();
  const effectiveMode: PrayerSoundMode = mode === 'silent' ? 'athan_makkah' : mode;
  if (mode === 'silent') {
    setPrayerSoundMode('athan_makkah');
  }

  let perm = getNotificationPermissionState();
  if (!Capacitor.isNativePlatform() && perm === 'default' && typeof Notification !== 'undefined') {
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
    Capacitor.isNativePlatform()
      ? pushPrayerBoardNotification(lang)
      : perm === 'granted'
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
  activeLangRef = lang;
  const soundEnabled = isPrayerSoundEnabled();
  const isNative = Capacitor.isNativePlatform();
  const osGranted = isOsPrayerBoardEnabled() && (isNative || getNotificationPermissionState() === 'granted');
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

      if (osGranted && !isNative) {
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
  activeLangRef = lang;
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
        await pushPrayerBoardNotification(lang);
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
