import { Language, Moshaf, RadioStation, Reciter, SurahAudioMeta } from '../types/nour';

const MP3QURAN_BASE = 'https://www.mp3quran.net/api/v3';
const CACHE_NAME = 'nour-offline-audio-v1';

function readTimedCache<T>(key: string, maxAgeMs: number, allowStale = false): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    if (allowStale || Date.now() - parsed.ts < maxAgeMs) {
      return parsed.data;
    }
    return null;
  } catch {
    return null;
  }
}

function writeTimedCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore quota error
  }
}

export async function fetchReciters(lang: Language): Promise<Reciter[]> {
  const apiLang = lang === 'ar' ? 'ar' : 'eng';
  const cacheKey = `nour_reciters_${apiLang}`;
  const fresh = readTimedCache<Reciter[]>(cacheKey, 86400000);
  if (fresh && fresh.length > 0) return fresh;

  try {
    const res = await fetch(`${MP3QURAN_BASE}/reciters?language=${apiLang}`);
    if (!res.ok) throw new Error('Failed to load reciters');
    const json = await res.json();
    const reciters = (json.reciters || []) as Reciter[];
    writeTimedCache(cacheKey, reciters);
    return reciters;
  } catch (err) {
    const stale = readTimedCache<Reciter[]>(cacheKey, 86400000, true);
    if (stale && stale.length > 0) return stale;
    throw err;
  }
}

export async function fetchRadios(lang: Language): Promise<RadioStation[]> {
  const apiLang = lang === 'ar' ? 'ar' : 'eng';
  const cacheKey = `nour_radios_${apiLang}`;
  const fresh = readTimedCache<RadioStation[]>(cacheKey, 86400000);
  if (fresh && fresh.length > 0) return fresh;

  try {
    const res = await fetch(`${MP3QURAN_BASE}/radios?language=${apiLang}`);
    if (!res.ok) throw new Error('Failed to load Quran radio stations');
    const json = await res.json();
    const radios = (json.radios || []) as RadioStation[];
    writeTimedCache(cacheKey, radios);
    return radios;
  } catch (err) {
    const stale = readTimedCache<RadioStation[]>(cacheKey, 86400000, true);
    if (stale && stale.length > 0) return stale;
    throw err;
  }
}

export async function fetchSuwar(lang: Language): Promise<SurahAudioMeta[]> {
  const apiLang = lang === 'ar' ? 'ar' : 'eng';
  const cacheKey = `nour_suwar_${apiLang}`;
  const fresh = readTimedCache<SurahAudioMeta[]>(cacheKey, 86400000 * 7);
  if (fresh && fresh.length > 0) return fresh;

  try {
    const res = await fetch(`${MP3QURAN_BASE}/suwar?language=${apiLang}`);
    if (!res.ok) throw new Error('Failed to load surah audio metadata');
    const json = await res.json();
    const suwar = (json.suwar || []) as SurahAudioMeta[];
    writeTimedCache(cacheKey, suwar);
    return suwar;
  } catch (err) {
    const stale = readTimedCache<SurahAudioMeta[]>(cacheKey, 86400000, true);
    if (stale && stale.length > 0) return stale;
    throw err;
  }
}

export function buildSurahAudioUrl(moshaf: Moshaf, surahNumber: number): string {
  const base = moshaf.server.endsWith('/') ? moshaf.server : `${moshaf.server}/`;
  const padded = String(surahNumber).padStart(3, '0');
  return `${base}${padded}.mp3`;
}

export interface OfflineTrackMeta {
  url: string;
  title: string;
  subtitle: string;
  savedAt: string;
  kind?: 'surah' | 'ayah';
  surahNumber?: number;
  ayahNumber?: number;
  verseKey?: string;
  verseText?: string;
  pageNumber?: number;
  reciterId?: number;
  reciterName?: string;
  sizeBytes?: number;
}

const OFFLINE_META_KEY = 'nour_offline_audio_meta_v1';
export const OFFLINE_UPDATED_EVENT = 'nour_offline_updated';

function emitOfflineUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_UPDATED_EVENT));
  }
}

export function getOfflineTracksMeta(): OfflineTrackMeta[] {
  try {
    const raw = localStorage.getItem(OFFLINE_META_KEY);
    return raw ? (JSON.parse(raw) as OfflineTrackMeta[]) : [];
  } catch {
    return [];
  }
}

export function getOfflineAudioTotalBytes(): number {
  return getOfflineTracksMeta().reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
}

export async function saveAudioOffline(meta: OfflineTrackMeta): Promise<void> {
  let measuredBytes = meta.sizeBytes || 0;
  if ('caches' in window) {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(meta.url);
    if (!response.ok) throw new Error('Could not download audio file');
    try {
      const cloned = response.clone();
      const buf = await cloned.arrayBuffer();
      measuredBytes = buf.byteLength;
    } catch {
      // ignore byte length read error on opaque responses
    }
    await cache.put(meta.url, response);
  }
  const enriched: OfflineTrackMeta = {
    ...meta,
    kind: meta.kind || (meta.verseKey ? 'ayah' : 'surah'),
    sizeBytes: measuredBytes || undefined,
  };
  const existing = getOfflineTracksMeta().filter((item) => item.url !== meta.url);
  localStorage.setItem(OFFLINE_META_KEY, JSON.stringify([enriched, ...existing]));
  emitOfflineUpdated();
}

export async function removeOfflineAudio(url: string): Promise<void> {
  if ('caches' in window) {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(url);
  }
  const updated = getOfflineTracksMeta().filter((item) => item.url !== url);
  localStorage.setItem(OFFLINE_META_KEY, JSON.stringify(updated));
  emitOfflineUpdated();
}

export async function clearAllOfflineAudio(): Promise<void> {
  if ('caches' in window) {
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      // ignore
    }
  }
  localStorage.setItem(OFFLINE_META_KEY, JSON.stringify([]));
  emitOfflineUpdated();
}

export async function resolveAudioPlaybackUrl(url: string): Promise<string> {
  if ('caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(url);
      if (match) {
        const blob = await match.blob();
        return URL.createObjectURL(blob);
      }
    } catch {
      // fallback to streaming URL
    }
  }
  return url;
}
