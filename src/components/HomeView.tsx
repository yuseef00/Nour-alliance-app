import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Eye,
  EyeOff,
  Flame,
  Loader2,
  MapPin,
  Plus,
  Repeat,
  Search,
} from 'lucide-react';
import { AppTab, Chapter, Language, MemorizationItem, UserProfile, Verse } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import {
  fetchVerseOfTheDay,
  fetchVersesByChapter,
  searchQuranGlobal,
  SearchHit,
} from '../services/quranApi';
import {
  calculatePrayerSchedule,
  detectHighAccuracyGps,
  loadSavedLocation,
  LOCATION_UPDATED_EVENT,
  reverseGeocodeCoords,
  SavedLocation,
  saveUserLocation,
} from '../services/worshipService';

interface HomeViewProps {
  lang: Language;
  profile: UserProfile;
  chapters: Chapter[];
  memorizationItems: MemorizationItem[];
  onOpenMushafPage: (page: number) => void;
  onNavigateTab: (tab: AppTab) => void;
  onUpdateKhatma: (targetDays: number, logPages?: number) => void;
  onAddMemorization: (surahNumber: number, startAyah: number, endAyah: number) => void;
  onReviewMemorization: (item: MemorizationItem, rating: 'hard' | 'good' | 'easy') => void;
}

function formatCountdown(targetDate: Date, nowMs: number): string {
  const diff = Math.max(0, Math.floor((targetDate.getTime() - nowMs) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export const HomeView: React.FC<HomeViewProps> = ({
  lang,
  profile,
  chapters,
  memorizationItems,
  onOpenMushafPage,
  onNavigateTab,
  onUpdateKhatma,
  onAddMemorization,
  onReviewMemorization,
}) => {
  const copy = t(lang);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [votd, setVotd] = useState<{
    verseKey: string;
    text: string;
    pageNumber: number;
    surahNumber: number;
  } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('nour_search_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Memorization interactive panel state
  const [memOpen, setMemOpen] = useState(false);
  const [memSurah, setMemSurah] = useState(112);
  const [memStart, setMemStart] = useState(1);
  const [memEnd, setMemEnd] = useState(4);
  const [memVerses, setMemVerses] = useState<Verse[]>([]);
  const [hideVerses, setHideVerses] = useState(false);
  const [repeatCount, setRepeatCount] = useState(0);
  const [activeReview, setActiveReview] = useState<MemorizationItem | null>(null);

  const [savedLocation, setSavedLocation] = useState<SavedLocation>(() => loadSavedLocation());
  const [locatingHome, setLocatingHome] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onLocUpdated = () => setSavedLocation(loadSavedLocation());
    window.addEventListener(LOCATION_UPDATED_EVENT, onLocUpdated);
    return () => window.removeEventListener(LOCATION_UPDATED_EVENT, onLocUpdated);
  }, []);

  useEffect(() => {
    fetchVerseOfTheDay()
      .then(setVotd)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!memOpen) return;
    fetchVersesByChapter(memSurah, 1, 50)
      .then((res) => {
        const subset = res.verses.filter(
          (v) => v.verse_number >= memStart && v.verse_number <= memEnd
        );
        setMemVerses(subset);
      })
      .catch(() => {});
  }, [memOpen, memSurah, memStart, memEnd]);

  const handleQuickDetectLocation = async () => {
    if (locatingHome) return;
    setLocatingHome(true);
    try {
      const fix = await detectHighAccuracyGps();
      const geo = await reverseGeocodeCoords(fix.lat, fix.lng, lang);
      const next: SavedLocation = {
        labelAr: geo.labelAr,
        labelEn: geo.labelEn,
        lat: fix.lat,
        lng: fix.lng,
        method: geo.method,
        source: 'gps',
        accuracyMeters: fix.accuracy,
        updatedAt: new Date().toISOString(),
      };
      saveUserLocation(next);
      setSavedLocation(next);
    } catch {
      onNavigateTab('worship');
    } finally {
      setLocatingHome(false);
    }
  };

  const prayerInfo = useMemo(() => {
    return calculatePrayerSchedule(
      savedLocation.lat,
      savedLocation.lng,
      savedLocation.method,
      new Date(nowMs)
    );
  }, [savedLocation, Math.floor(nowMs / 60000)]);

  const hijriToday = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-islamic' : 'en-US-u-ca-islamic', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date(nowMs));
    } catch {
      return '';
    }
  }, [lang, Math.floor(nowMs / 86400000)]);

  const currentChapter = chapters.find((c) => c.id === profile.lastReadSurah);
  const dailyPortion = Math.max(1, Math.ceil(604 / Math.max(1, profile.khatmaTargetDays)));
  const remainingPages = Math.max(0, 604 - profile.khatmaCurrentPage);
  const daysRemaining = Math.ceil(remainingPages / dailyPortion);
  const khatmaPct = Math.min(100, Math.round((profile.khatmaCurrentPage / 604) * 100));

  const runSearch = async (queryVal: string) => {
    const q = queryVal.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const hits = await searchQuranGlobal(q, lang);
      setSearchResults(hits);
      const nextHist = [q, ...searchHistory.filter((h) => h !== q)].slice(0, 6);
      setSearchHistory(nextHist);
      localStorage.setItem('nour_search_history', JSON.stringify(nextHist));
    } finally {
      setSearching(false);
    }
  };

  const hour = new Date(nowMs).getHours();
  const greeting = hour < 15 ? copy.greetingMorning : copy.greetingEvening;
  const prayerLabelMap: Record<string, string> = {
    fajr: lang === 'ar' ? 'الفجر' : 'Fajr',
    sunrise: lang === 'ar' ? 'الشروق' : 'Sunrise',
    dhuhr: lang === 'ar' ? 'الظهر' : 'Dhuhr',
    asr: lang === 'ar' ? 'العصر' : 'Asr',
    maghrib: lang === 'ar' ? 'المغرب' : 'Maghrib',
    isha: lang === 'ar' ? 'العشاء' : 'Isha',
  };

  return (
    <div className="space-y-6">
      {/* Global Search Bar */}
      <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-3 sm:p-4 space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(searchText);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#5c6862] absolute top-1/2 -translate-y-1/2 start-3.5" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={copy.searchPlaceholder}
              className="w-full min-h-[44px] ps-10 pe-4 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15 text-sm focus:outline-none focus:border-[#0f6b4f]"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="min-h-[44px] px-5 rounded-xl bg-[#0f6b4f] text-white text-xs font-semibold hover:bg-[#0a4e39]"
          >
            {searching ? '...' : lang === 'ar' ? 'بحث' : 'Search'}
          </button>
        </form>

        {searchHistory.length > 0 && searchResults.length === 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#5c6862] dark:text-[#98a69f]">
            <span>{copy.recentSearches}:</span>
            {searchHistory.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setSearchText(h);
                  runSearch(h);
                }}
                className="underline hover:text-[#0f6b4f] dark:hover:text-[#c9a44c]"
              >
                {h}
              </button>
            ))}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="max-h-72 overflow-y-auto divide-y divide-[#0f6b4f]/10 border-t border-[#0f6b4f]/10 pt-2">
            {searchResults.map((hit) => {
              const surahId = Number(hit.verse_key.split(':')[0]);
              const ch = chapters.find((c) => c.id === surahId);
              return (
                <button
                  key={hit.verse_key}
                  type="button"
                  onClick={() => {
                    if (ch) onOpenMushafPage(ch.pages[0]);
                  }}
                  className="w-full py-3 px-2 text-start hover:bg-[#0f6b4f]/8 rounded-xl flex items-start justify-between gap-3"
                >
                  <p className="font-quran text-lg leading-relaxed">{hit.text}</p>
                  <span className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] shrink-0 tabular-nums">
                    {ch?.name_arabic || surahId} · {hit.verse_key}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Primary Hero Split: Continue Reading + Next Prayer & Verse of the Day */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 rounded-3xl hero-emerald-surface text-[#f7f3ea] border border-[#c9a44c]/40 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#c9a44c] font-semibold">
                <span>{greeting}</span>
                {hijriToday && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#f7f3ea]/80">{hijriToday}</span>
                  </>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-balance leading-snug">
                {currentChapter
                  ? lang === 'ar'
                    ? `سورة ${currentChapter.name_arabic}`
                    : `Surah ${currentChapter.name_simple}`
                  : copy.continueReading}
              </h2>
              <p className="text-xs sm:text-sm text-[#f7f3ea]/80 tabular-nums">
                {copy.page} {formatNumber(profile.lastReadPage, lang)} · {copy.ayah}{' '}
                {formatNumber(profile.lastReadAyah, lang)} ·{' '}
                {lang === 'ar'
                  ? `الجزء ${formatNumber(Math.min(30, Math.ceil(profile.lastReadPage / 20)), lang)}`
                  : `Juz ${Math.min(30, Math.ceil(profile.lastReadPage / 20))}`}
              </p>
            </div>

            {/* Radial Khatma Progress Ring */}
            <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke="rgba(247,243,234,0.16)"
                  strokeWidth="5"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke="#c9a44c"
                  strokeWidth="5"
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 * (1 - khatmaPct / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-xs font-bold text-[#f7f3ea] tabular-nums">
                {khatmaPct}%
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/12">
            <button
              type="button"
              onClick={() => onOpenMushafPage(profile.lastReadPage)}
              className="min-h-[46px] px-6 rounded-full bg-[#c9a44c] text-[#17211d] text-sm font-bold flex items-center gap-2 hover:brightness-105 active:scale-[0.98] transition-all shadow-md"
            >
              <BookOpen className="w-4 h-4" />
              <span>{copy.continueReading}</span>
              {lang === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2 text-xs text-[#f7f3ea]/95 tabular-nums">
              <span className="w-8 h-8 rounded-full bg-white/12 flex items-center justify-center">
                <Flame className="w-4 h-4 text-[#c9a44c]" />
              </span>
              <span className="font-semibold">
                {formatNumber(profile.streakDays, lang)} {copy.streakDays}
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] shrink-0">
                  {copy.nextPrayer}
                </p>
                <span aria-hidden="true" className="text-[#5c6862]">·</span>
                <button
                  type="button"
                  onClick={() => void handleQuickDetectLocation()}
                  title={lang === 'ar' ? 'تحديد موقعي بدقة GPS' : 'Detect high-accuracy GPS'}
                  className="text-[11px] text-[#5c6862] dark:text-[#98a69f] hover:text-[#0f6b4f] dark:hover:text-[#c9a44c] flex items-center gap-1 truncate"
                >
                  {locatingHome ? (
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  ) : (
                    <MapPin className="w-3 h-3 text-[#0f6b4f] dark:text-[#c9a44c] shrink-0" />
                  )}
                  <span className="truncate">
                    {lang === 'ar' ? savedLocation.labelAr : savedLocation.labelEn}
                  </span>
                </button>
              </div>
              <span className="font-mono text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums shrink-0">
                -{formatCountdown(prayerInfo.nextPrayerTime, nowMs)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-bold">{prayerLabelMap[prayerInfo.nextPrayerName]}</h3>
              <span className="font-mono text-2xl font-bold tabular-nums">
                {prayerInfo.nextPrayerTime.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 pt-1 text-center">
              {(
                [
                  { k: 'fajr', t: prayerInfo.fajr },
                  { k: 'dhuhr', t: prayerInfo.dhuhr },
                  { k: 'asr', t: prayerInfo.asr },
                  { k: 'maghrib', t: prayerInfo.maghrib },
                  { k: 'isha', t: prayerInfo.isha },
                ] as const
              ).map((pr) => {
                const isNext = prayerInfo.nextPrayerName === pr.k;
                return (
                  <div
                    key={pr.k}
                    className={`rounded-xl py-1.5 px-1 transition-colors ${
                      isNext
                        ? 'bg-[#0f6b4f] text-white'
                        : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/70 text-[#5c6862] dark:text-[#98a69f]'
                    }`}
                  >
                    <p className="text-[10px] font-bold truncate">{prayerLabelMap[pr.k]}</p>
                    <p className="font-mono text-[10px] tabular-nums mt-0.5">
                      {pr.t.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3.5 border-t border-[#0f6b4f]/10 dark:border-[#c9a44c]/15 space-y-1.5">
            <p className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c]">{copy.verseOfTheDay}</p>
            {votd ? (
              <button
                type="button"
                onClick={() => onOpenMushafPage(votd.pageNumber)}
                className="text-start space-y-1 group w-full"
              >
                <p className="font-quran text-xl leading-relaxed group-hover:text-[#0f6b4f] dark:group-hover:text-[#c9a44c] transition-colors">
                  {votd.text}
                </p>
                <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                  {votd.verseKey} · {copy.page} {formatNumber(votd.pageNumber, lang)}
                </p>
              </button>
            ) : (
              <p className="text-xs text-[#5c6862]">{lang === 'ar' ? 'جاري تحميل آية اليوم...' : 'Loading...'}</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Navigation Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onNavigateTab('quran')}
          className="min-h-[68px] rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 px-4 py-3 flex items-center gap-3 text-start hover:border-[#0f6b4f] hover:-translate-y-0.5 transition-all"
        >
          <span className="w-11 h-11 rounded-full bg-[#fdfaf3] border border-[#c9a44c]/45 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
            <img src="/src/assets/images/icons/book.png" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-xs font-bold">{copy.navQuran}</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab('listen')}
          className="min-h-[68px] rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 px-4 py-3 flex items-center gap-3 text-start hover:border-[#0f6b4f] hover:-translate-y-0.5 transition-all"
        >
          <span className="w-11 h-11 rounded-full bg-[#fdfaf3] border border-[#c9a44c]/45 p-2 flex items-center justify-center shrink-0 shadow-xs">
            <img src="/src/assets/images/icons/music-headphone.png" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-xs font-bold">{copy.navListen}</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab('worship')}
          className="min-h-[68px] rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 px-4 py-3 flex items-center gap-3 text-start hover:border-[#0f6b4f] hover:-translate-y-0.5 transition-all"
        >
          <span className="w-11 h-11 rounded-full bg-[#fdfaf3] border border-[#c9a44c]/45 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
            <img src="/src/assets/images/icons/man.png" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-xs font-bold">{copy.navWorship}</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab('profile')}
          className="min-h-[68px] rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 px-4 py-3 flex items-center gap-3 text-start hover:border-[#0f6b4f] hover:-translate-y-0.5 transition-all"
        >
          <span className="w-11 h-11 rounded-full bg-[#fdfaf3] border border-[#c9a44c]/45 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
            <img src="/src/assets/images/icons/profile.png" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-xs font-bold">{copy.navProfile}</span>
        </button>
      </div>

      {/* Selected Surahs Quick-Open Strip */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
            {lang === 'ar' ? 'سور يُستحب الإكثار من قراءتها' : 'Featured Daily Surahs'}
          </h3>
          <button
            type="button"
            onClick={() => onNavigateTab('quran')}
            className="text-xs font-semibold text-[#5c6862] dark:text-[#98a69f] hover:text-[#0f6b4f]"
          >
            {lang === 'ar' ? 'كل السور ←' : 'All Surahs →'}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { id: 18, page: 293, noteAr: 'نور بين الجمعتين', noteEn: 'Friday light' },
            { id: 36, page: 440, noteAr: 'سورة يس', noteEn: 'Surah Yasin' },
            { id: 55, page: 531, noteAr: 'فبأي آلاء ربكما تكذبان', noteEn: 'Surah Ar-Rahman' },
            { id: 67, page: 562, noteAr: 'تُقرأ قبل النوم', noteEn: 'Evening protection' },
          ].map((item) => {
            const ch = chapters.find((c) => c.id === item.id);
            const targetPage = ch?.pages[0] || item.page;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenMushafPage(targetPage)}
                className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 text-start hover:border-[#c9a44c] hover:-translate-y-0.5 transition-all space-y-1"
              >
                <p className="font-quran text-xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                  {ch ? (lang === 'ar' ? `سورة ${ch.name_arabic}` : ch.name_simple) : `Surah ${item.id}`}
                </p>
                <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                  {lang === 'ar' ? item.noteAr : item.noteEn} · {copy.page} {formatNumber(targetPage, lang)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Weekly Reading Activity & Mushaf Completion Strip */}
      <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 flex flex-wrap items-center justify-between gap-5">
        <div className="space-y-1.5 min-w-[200px]">
          <p className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c]">
            {copy.weeklyActivity}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {formatNumber(profile.weeklyPages.reduce((s, n) => s + n, 0), lang)}
            </span>
            <span className="text-xs text-[#5c6862] dark:text-[#98a69f]">
              {copy.page} · {lang === 'ar' ? `الجزء ${formatNumber(Math.min(30, Math.ceil(profile.lastReadPage / 20)), lang)} من ٣٠` : `Juz ${Math.min(30, Math.ceil(profile.lastReadPage / 20))} of 30`}
            </span>
          </div>
        </div>

        <div className="flex items-end gap-2.5 h-16 flex-1 max-w-md justify-end">
          {profile.weeklyPages.map((val, idx) => {
            const maxW = Math.max(8, ...profile.weeklyPages);
            const hPct = Math.max(12, Math.round((val / maxW) * 100));
            const dayShort = (lang === 'ar' ? ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'])[idx];
            return (
              <div key={idx} className="flex flex-col items-center gap-1 h-full justify-end flex-1 max-w-[32px]">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] transition-all"
                    style={{ height: `${hPct}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-[#5c6862] dark:text-[#98a69f]">{dayShort}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Khatma Planner & Memorization Mode */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Khatma Planner */}
        <div className="lg:col-span-6 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              </span>
              <span>{copy.khatmaPlan}</span>
            </h3>
            <span className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
              {khatmaPct}%
            </span>
          </div>

          <div className="h-2.5 rounded-full bg-[#0f6b4f]/15 overflow-hidden">
            <div className="h-full bg-[#0f6b4f] dark:bg-[#c9a44c] transition-all" style={{ width: `${khatmaPct}%` }} />
          </div>

          <div className="grid grid-cols-3 gap-3 text-center py-2">
            <div>
              <p className="text-lg font-bold tabular-nums">{formatNumber(dailyPortion, lang)}</p>
              <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">{copy.pagesPerDay}</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">{formatNumber(profile.khatmaCurrentPage, lang)}</p>
              <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">{copy.page}</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">{formatNumber(daysRemaining, lang)}</p>
              <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">{copy.daysRemaining}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#0f6b4f]/10">
            <div className="flex items-center gap-1.5">
              {[15, 30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onUpdateKhatma(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    profile.khatmaTargetDays === d
                      ? 'bg-[#0f6b4f] text-white'
                      : 'bg-[#f7f3ea] dark:bg-[#0b1411] text-[#5c6862]'
                  }`}
                >
                  {formatNumber(d, lang)} {lang === 'ar' ? 'يوم' : 'd'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onUpdateKhatma(profile.khatmaTargetDays, dailyPortion)}
              className="min-h-[42px] px-4 rounded-xl bg-[#c9a44c] text-[#17211d] text-xs font-bold hover:opacity-90"
            >
              {copy.logTodayPages} (+{formatNumber(dailyPortion, lang)})
            </button>
          </div>
        </div>

        {/* Memorization Mode */}
        <div className="lg:col-span-6 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold">{copy.memorization}</h3>
            <button
              type="button"
              onClick={() => setMemOpen(!memOpen)}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{memOpen ? (lang === 'ar' ? 'إخفاء المحرر' : 'Close') : copy.addMemorization}</span>
            </button>
          </div>

          {memOpen ? (
            <div className="space-y-3 p-4 rounded-2xl bg-[#f7f3ea] dark:bg-[#0b1411]">
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={memSurah}
                  onChange={(e) => setMemSurah(Number(e.target.value))}
                  className="col-span-3 sm:col-span-1 min-h-[40px] px-2.5 rounded-xl bg-[#fdfaf3] dark:bg-[#121f1a] border border-[#0f6b4f]/20 text-xs"
                >
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}. {lang === 'ar' ? c.name_arabic : c.name_simple}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={memStart}
                  onChange={(e) => setMemStart(Math.max(1, Number(e.target.value)))}
                  placeholder="From"
                  className="min-h-[40px] px-3 rounded-xl bg-[#fdfaf3] dark:bg-[#121f1a] border border-[#0f6b4f]/20 text-xs tabular-nums"
                />
                <input
                  type="number"
                  min={memStart}
                  value={memEnd}
                  onChange={(e) => setMemEnd(Math.max(memStart, Number(e.target.value)))}
                  placeholder="To"
                  className="min-h-[40px] px-3 rounded-xl bg-[#fdfaf3] dark:bg-[#121f1a] border border-[#0f6b4f]/20 text-xs tabular-nums"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setHideVerses(!hideVerses)}
                  className="min-h-[38px] px-3 rounded-xl border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-1.5"
                >
                  {hideVerses ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{hideVerses ? copy.showVerses : copy.hideVerses}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRepeatCount((c) => c + 1)}
                  className="min-h-[38px] px-3 rounded-xl border border-[#c9a44c]/40 text-xs font-semibold flex items-center gap-1.5 tabular-nums"
                >
                  <Repeat className="w-3.5 h-3.5 text-[#c9a44c]" />
                  <span>
                    {copy.repeat}: {formatNumber(repeatCount, lang)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddMemorization(memSurah, memStart, memEnd);
                    setMemOpen(false);
                  }}
                  className="min-h-[38px] px-4 rounded-xl bg-[#0f6b4f] text-white text-xs font-semibold"
                >
                  {lang === 'ar' ? 'حفظ في الجدول' : 'Save Schedule'}
                </button>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto pt-1" dir="rtl">
                {memVerses.map((v) => (
                  <p
                    key={v.verse_key}
                    onClick={() => setHideVerses(false)}
                    className={`font-quran text-lg leading-loose px-2 py-1 rounded-lg transition-all cursor-pointer ${
                      hideVerses ? 'blur-sm select-none bg-[#0f6b4f]/10' : ''
                    }`}
                  >
                    {v.text_uthmani} ({v.verse_number})
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {copy.reviewDue}: {formatNumber(memorizationItems.length, lang)}
              </p>
              {memorizationItems.length === 0 ? (
                <p className="text-xs text-[#5c6862] dark:text-[#98a69f] py-6 text-center">
                  {lang === 'ar'
                    ? 'أضف نطاق آيات لبدء خطة الحفظ بالتكرار المتباعد.'
                    : 'Add a verse range to start spaced-repetition memorization.'}
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {memorizationItems.map((item) => {
                    const ch = chapters.find((c) => c.id === item.surahNumber);
                    const isReviewing = activeReview?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-[#0f6b4f]/15 bg-[#f7f3ea] dark:bg-[#0b1411] p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold">
                            {ch ? (lang === 'ar' ? ch.name_arabic : ch.name_simple) : item.surahNumber} ·{' '}
                            {item.startAyah}-{item.endAyah}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveReview(isReviewing ? null : item)}
                            className="text-[#0f6b4f] dark:text-[#c9a44c] font-semibold"
                          >
                            {item.nextReviewDate}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          {(['hard', 'good', 'easy'] as const).map((rating) => (
                            <button
                              key={rating}
                              type="button"
                              onClick={() => onReviewMemorization(item, rating)}
                              className="flex-1 py-1.5 rounded-lg border border-[#0f6b4f]/20 text-[11px] font-semibold hover:bg-[#0f6b4f] hover:text-white transition-colors"
                            >
                              {copy[rating]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
