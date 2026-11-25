import { Language, Moshaf, RadioStation, Reciter, SurahAudioMeta } from '../types/nour';

const MP3QURAN_BASE = 'https://www.mp3quran.net/api/v3';
const CACHE_NAME = 'nour-offline-audio-v1';

export async function fetchReciters(lang: Language): Promise<Reciter[]> {
  const apiLang = lang === 'ar' ? 'ar' : 'eng';
  const cacheKey = `nour_reciters_${apiLang}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { ts: number; data: Reciter[] };
      if (Date.now() - parsed.ts < 86400000 && parsed.data.length > 0) {
        return parsed.data;
      }
    }
  } catch {
    // ignore cache error
  }

  const res = await fetch(`${MP3QURAN_BASE}/reciters?language=${apiLang}`);
  if (!res.ok) throw new Error('Failed to load reciters');
  const json = await res.json();
  const reciters = (json.reciters || []) as Reciter[];
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: reciters }));
  } catch {
    // ignore quota error
  }
  return reciters;
}

export async function fetchRadios(lang: Language): Promise<RadioStation[]> {
  const apiLang = lang === 'ar' ? 'ar' : 'eng';
  const res = await fetch(`${MP3QURAN_BASE}/radios?language=${apiLang}`);
  if (!res.ok) throw new Error('Failed to load Quran radio stations');
  const json = await res.json();
  return (json.radios || []) as RadioStation[];
}

export async function fetchSuwar(lang: Language): Promise<SurahAudioMeta[]> {
  const apiLang = lang === 'ar' ? 'ar' : 'eng';
  const res = await fetch(`${MP3QURAN_BASE}/suwar?language=${apiLang}`);
  if (!res.ok) throw new Error('Failed to load surah audio metadata');
  const json = await res.json();
  return (json.suwar || []) as SurahAudioMeta[];
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
}

const OFFLINE_META_KEY = 'nour_offline_audio_meta_v1';

export function getOfflineTracksMeta(): OfflineTrackMeta[] {
  try {
    const raw = localStorage.getItem(OFFLINE_META_KEY);
    return raw ? (JSON.parse(raw) as OfflineTrackMeta[]) : [];
  } catch {
    return [];
  }
}

export async function saveAudioOffline(meta: OfflineTrackMeta): Promise<void> {
  if ('caches' in window) {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(meta.url);
    if (!response.ok) throw new Error('Could not download audio file');
    await cache.put(meta.url, response);
  }
  const existing = getOfflineTracksMeta().filter((item) => item.url !== meta.url);
  localStorage.setItem(OFFLINE_META_KEY, JSON.stringify([meta, ...existing]));
}

export async function removeOfflineAudio(url: string): Promise<void> {
  if ('caches' in window) {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(url);
  }
  const updated = getOfflineTracksMeta().filter((item) => item.url !== url);
  localStorage.setItem(OFFLINE_META_KEY, JSON.stringify(updated));
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
