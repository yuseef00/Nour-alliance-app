import { Chapter, Language, TafsirSlug, Verse } from '../types/nour';

const QURAN_API_BASE = 'https://api.quran.com/api/v4';
const CACHE_PREFIX = 'nour_quran_cache_v1_';

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function stripArabicDiacritics(input: string): string {
  return input
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

export async function fetchChapters(lang: Language): Promise<Chapter[]> {
  const cacheKey = `chapters_${lang}`;
  const cached = readCache<Chapter[]>(cacheKey);
  if (cached && cached.length === 114) return cached;

  const res = await fetch(`${QURAN_API_BASE}/chapters?language=${lang}`);
  if (!res.ok) throw new Error('Failed to load Quran chapters');
  const json = await res.json();
  const chapters = (json.chapters || []) as Chapter[];
  writeCache(cacheKey, chapters);
  return chapters;
}

export async function fetchVersesByPage(page: number): Promise<Verse[]> {
  const safePage = Math.max(1, Math.min(604, page));
  const cacheKey = `page_${safePage}`;
  const cached = readCache<Verse[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  const url = `${QURAN_API_BASE}/verses/by_page/${safePage}?fields=text_uthmani,text_uthmani_tajweed,verse_key,page_number,juz_number,hizb_number,rub_el_hizb_number&per_page=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load Mushaf page');
  const json = await res.json();
  const verses = (json.verses || []) as Verse[];
  writeCache(cacheKey, verses);
  return verses;
}

export async function fetchVersesByChapter(chapterId: number, page = 1, perPage = 50): Promise<{ verses: Verse[]; totalPages: number }> {
  const url = `${QURAN_API_BASE}/verses/by_chapter/${chapterId}?fields=text_uthmani,text_uthmani_tajweed,verse_key,page_number,juz_number,hizb_number,rub_el_hizb_number&page=${page}&per_page=${perPage}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load Surah verses');
  const json = await res.json();
  return {
    verses: (json.verses || []) as Verse[],
    totalPages: json.pagination?.total_pages || 1,
  };
}

export async function fetchTafsirByAyah(verseKey: string, slug: TafsirSlug): Promise<{ text: string; resourceName: string }> {
  const resourceId = slug === 'saadi' ? 91 : 16;
  const cacheKey = `tafsir_${resourceId}_${verseKey}`;
  const cached = readCache<{ text: string; resourceName: string }>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${QURAN_API_BASE}/tafsirs/${resourceId}/by_ayah/${encodeURIComponent(verseKey)}`);
  if (!res.ok) throw new Error('Failed to load Tafsir');
  const json = await res.json();
  const rawHtml = String(json.tafsir?.text || '');
  const cleanText = decodeAndStripHtml(rawHtml);
  const result = {
    text: cleanText,
    resourceName: slug === 'saadi' ? 'تفسير السعدي' : 'التفسير الميسر',
  };
  writeCache(cacheKey, result);
  return result;
}

export async function fetchAyahAudioUrl(verseKey: string, recitationId = 7): Promise<string> {
  const res = await fetch(`${QURAN_API_BASE}/recitations/${recitationId}/by_ayah/${encodeURIComponent(verseKey)}`);
  if (!res.ok) throw new Error('Failed to load ayah audio');
  const json = await res.json();
  const relative = json.audio_files?.[0]?.url;
  if (!relative) throw new Error('Audio not available for this verse');
  return relative.startsWith('http') ? relative : `https://verses.quran.com/${relative}`;
}

export async function fetchVersePageNumber(verseKey: string): Promise<number | null> {
  const cacheKey = `vpage_${verseKey}`;
  const cached = readCache<number>(cacheKey);
  if (typeof cached === 'number' && cached >= 1 && cached <= 604) return cached;

  try {
    const res = await fetch(`${QURAN_API_BASE}/verses/by_key/${encodeURIComponent(verseKey)}?fields=page_number`);
    if (!res.ok) return null;
    const json = await res.json();
    const pageNum = Number(json.verse?.page_number);
    if (Number.isFinite(pageNum) && pageNum >= 1 && pageNum <= 604) {
      writeCache(cacheKey, pageNum);
      return pageNum;
    }
    return null;
  } catch {
    return null;
  }
}

export interface SearchHit {
  verse_key: string;
  text: string;
  highlighted?: string;
}

export async function searchQuranGlobal(queryText: string, lang: Language): Promise<SearchHit[]> {
  const trimmed = queryText.trim();
  if (!trimmed) return [];
  const normalized = stripArabicDiacritics(trimmed);
  const url = `${QURAN_API_BASE}/search?q=${encodeURIComponent(normalized)}&size=25&page=1&language=${lang}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Search request failed');
  const json = await res.json();
  const results = json.search?.results || [];
  return results.map((r: { verse_key: string; text: string }) => ({
    verse_key: r.verse_key,
    text: decodeAndStripHtml(r.text || ''),
  }));
}

const DAILY_VERSE_KEYS = [
  '2:286',
  '94:5',
  '13:28',
  '3:139',
  '2:152',
  '65:3',
  '39:53',
  '29:69',
  '16:97',
  '20:114',
  '55:13',
  '24:35',
  '17:82',
  '31:17',
];

export async function fetchVerseOfTheDay(): Promise<{ verseKey: string; text: string; pageNumber: number; surahNumber: number }> {
  const now = new Date();
  const dayIndex = Math.floor(now.getTime() / 86400000) % DAILY_VERSE_KEYS.length;
  const verseKey = DAILY_VERSE_KEYS[dayIndex];
  const cacheKey = `votd_${verseKey}`;
  const cached = readCache<{ verseKey: string; text: string; pageNumber: number; surahNumber: number }>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${QURAN_API_BASE}/verses/by_key/${encodeURIComponent(verseKey)}?fields=text_uthmani,page_number`);
  if (!res.ok) throw new Error('Failed to fetch verse of the day');
  const json = await res.json();
  const verse = json.verse;
  const surahNumber = Number(verseKey.split(':')[0]);
  const data = {
    verseKey,
    text: String(verse?.text_uthmani || ''),
    pageNumber: Number(verse?.page_number || 1),
    surahNumber,
  };
  writeCache(cacheKey, data);
  return data;
}

export interface TajweedSegment {
  text: string;
  ruleClass?: string;
}

/**
 * Safely parses Quran.com API v4 `text_uthmani_tajweed` HTML markup into pure text tokens
 * without injecting raw HTML into the DOM.
 */
export function parseTajweedSegments(markup: string): TajweedSegment[] {
  if (!markup) return [];
  const doc = new DOMParser().parseFromString(`<div>${markup}</div>`, 'text/html');
  const container = doc.body.firstElementChild;
  if (!container) return [{ text: markup }];

  const segments: TajweedSegment[] = [];
  const walk = (node: ChildNode, currentClass?: string) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || '';
      if (value) segments.push({ text: value, ruleClass: currentClass });
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const cls = el.getAttribute('class') || currentClass;
      if (cls === 'end') return; // We render our own clean verse ornament badge
      el.childNodes.forEach((child) => walk(child, cls));
    }
  };
  container.childNodes.forEach((child) => walk(child));
  return segments;
}

export function decodeAndStripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}
