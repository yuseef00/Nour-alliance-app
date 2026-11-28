import { Language } from '../types/nour';

export async function shareNourApp(lang: Language): Promise<'shared' | 'copied' | 'cancelled'> {
  const title = lang === 'ar' ? 'نور — رفيق القرآن الكريم' : 'Nour — Quran Companion';
  const text =
    lang === 'ar'
      ? 'تطبيق نور للقرآن الكريم: مصحف المدينة، التفسير الميسر والسعدي، التلاوات، مواقيت الصلاة، والأذكار.'
      : 'Nour Quran Companion: Madina Mushaf, Tafsir, Recitations, Global Prayer Times, Qibla & Adhkar.';
  const url = 'https://nouralqran.vercel.app';

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
      return 'copied';
    }
  } catch {
    // fallback failed
  }

  return 'cancelled';
}
