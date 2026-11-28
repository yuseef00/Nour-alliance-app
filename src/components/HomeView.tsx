import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Eye,
  EyeOff,
  Flame,
  Headphones,
  Loader2,
  MapPin,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import { AppTab, Chapter, Language, LastListenedInfo, MemorizationItem, UserProfile, Verse } from '../types/nour';
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
import { formatFullCountdown } from '../services/prayerNotificationService';
import { readUserScoped, writeUserScoped } from '../utils/userStorage';
import { ReciterAvatar } from './ReciterAvatar';
import { shareNourApp } from '../utils/shareApp';

interface HomeViewProps {
  lang: Language;
  profile: UserProfile;
  chapters: Chapter[];
  memorizationItems: MemorizationItem[];
  lastListened: LastListenedInfo | null;
  onOpenMushafPage: (page: number) => void;
  onNavigateTab: (tab: AppTab, targetPath?: string) => void;
  onUpdateKhatma: (targetDays: number, logPages?: number) => void;
  onAddMemorization: (surahNumber: number, startAyah: number, endAyah: number) => void;
  onReviewMemorization: (item: MemorizationItem, rating: 'hard' | 'good' | 'easy') => void;
  onResumeLastListened: (info: LastListenedInfo) => void;
}

const WELCOME_DISMISSED_KEY = 'nour_welcome_dismissed_v1';

export const HomeView: React.FC<HomeViewProps> = ({
  lang,
  profile,
  chapters,
  memorizationItems,
  lastListened,
  onOpenMushafPage,
  onNavigateTab,
  onUpdateKhatma,
  onAddMemorization,
  onReviewMemorization,
  onResumeLastListened,
}) => {
  const copy = t(lang);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WELCOME_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [votd, setVotd] = useState<{
    verseKey: string;
    text: string;
    pageNumber: number;
    surahNumber: number;
  } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() =>
    readUserScoped<string[]>(profile.uid, 'search_history', [])
  );

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
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    setSearchHistory(readUserScoped<string[]>(profile.uid, 'search_history', []));
    setSearchText('');
    setSearchResults([]);
  }, [profile.uid]);

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

  const dismissWelcome = () => {
    setWelcomeDismissed(true);
    try {
      localStorage.setItem(WELCOME_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
  };

  const handleQuickDetectLocation = async () => {
    if (locatingHome) return;
    setLocatingHome(true);
    setLocationError(null);
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
      setLocationError(
        lang === 'ar'
          ? 'تعذر تحديد الموقع عبر GPS. تأكد من السماح بالوصول أو اضبط المدينة.'
          : 'Unable to detect GPS location. Check permission or select a city.'
      );
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
  }, [savedLocation, Math.floor(nowMs / 1000)]);

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
  const khatmaWirdEnd = Math.min(604, profile.khatmaCurrentPage + dailyPortion - 1);

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
      writeUserScoped(profile.uid, 'search_history', nextHist);
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

  const handleLinkNav = (e: React.MouseEvent<HTMLAnchorElement>, tab: AppTab, path?: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onNavigateTab(tab, path);
  };

  const showNewUserWelcome =
    !welcomeDismissed &&
    profile.lastReadPage <= 1 &&
    profile.streakDays === 0 &&
    !lastListened;

  const isPrayerDue = Boolean(prayerInfo.activePrayerNowName);
  const activePrayerCountdown = isPrayerDue
    ? lang === 'ar'
      ? `حان وقت صلاة ${prayerLabelMap[prayerInfo.activePrayerNowName!]}`
      : `${prayerLabelMap[prayerInfo.activePrayerNowName!]} time now`
    : formatFullCountdown(prayerInfo.nextPrayerTime, nowMs, lang, false);

  return (
    <div className="space-y-6">
      {/* 1. Calm Greeting Header & Single H1 */}
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c]">
            <span>
              {greeting}، {profile.displayName}
            </span>
            {hijriToday && (
              <>
                <span aria-hidden="true" className="text-[#5c6862]">
                  ·
                </span>
                <span className="text-[#5c6862] dark:text-[#98a69f] font-normal">{hijriToday}</span>
              </>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#17211d] dark:text-[#ede7da]">
            {lang === 'ar' ? 'نور — رفيق القرآن الكريم' : 'Nour — Quran Companion'}
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#5c6862] dark:text-[#98a69f]">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full crystal-card border border-[#0f6b4f]/15 tabular-nums font-semibold">
            <Flame className="w-3.5 h-3.5 text-[#c9a44c]" />
            <span>
              {formatNumber(profile.streakDays, lang)} {copy.streakDays}
            </span>
          </span>
        </div>
      </header>

      {/* 2. Dismissible Welcome Card for New Users */}
      {showNewUserWelcome && (
        <section className="rounded-3xl crystal-card border border-[#c9a44c]/45 p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-xl">
            <p className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#c9a44c]" />
              <span>{lang === 'ar' ? 'مرحبًا بك في نور' : 'Welcome to Nour'}</span>
            </p>
            <p className="text-sm sm:text-base font-semibold leading-relaxed">
              {lang === 'ar'
                ? 'اقرأ القرآن، استمع للتلاوات، وتابع عبادتك في مكان واحد'
                : 'Read the Quran, listen to recitations, and follow your worship in one serene place.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                dismissWelcome();
                onOpenMushafPage(1);
              }}
              className="min-h-[44px] px-5 rounded-full bg-[#0f6b4f] text-white text-xs sm:text-sm font-bold whitespace-nowrap hover:bg-[#0a4e39] transition-colors"
            >
              {lang === 'ar' ? 'ابدأ الآن' : 'Get Started'}
            </button>
            <button
              type="button"
              onClick={dismissWelcome}
              aria-label={lang === 'ar' ? 'إغلاق رسالة الترحيب' : 'Dismiss welcome card'}
              className="w-11 h-11 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center text-[#5c6862] hover:bg-[#0f6b4f]/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* 3. Primary Fold: Continue Reading Card (Primary CTA: ابدأ القراءة / Secondary CTA: متابعة القراءة) + Prayer Times */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 rounded-3xl hero-emerald-surface text-[#f7f3ea] border border-[#c9a44c]/40 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold text-[#c9a44c]">
                {copy.continueReading}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-balance leading-snug">
                {currentChapter
                  ? lang === 'ar'
                    ? `سورة ${currentChapter.name_arabic}`
                    : `Surah ${currentChapter.name_simple}`
                  : lang === 'ar'
                  ? 'سورة الفاتحة'
                  : 'Surah Al-Fatihah'}
              </h2>
              <p className="text-xs sm:text-sm text-[#f7f3ea]/85 tabular-nums">
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
                {formatNumber(khatmaPct, lang)}%
              </span>
            </div>
          </div>

          {/* One Clear Primary CTA + One Secondary CTA */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/15">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenMushafPage(profile.lastReadPage)}
                className="min-h-[48px] px-6 rounded-full bg-[#c9a44c] text-[#17211d] text-sm font-bold flex items-center gap-2 hover:brightness-105 active:scale-[0.98] transition-all shadow-md whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4" />
                <span>{lang === 'ar' ? 'ابدأ القراءة' : 'Start Reading'}</span>
                {lang === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => onOpenMushafPage(Math.max(1, profile.khatmaCurrentPage))}
                className="min-h-[48px] px-5 rounded-full bg-white/14 hover:bg-white/22 text-[#f7f3ea] border border-[#c9a44c]/45 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Calendar className="w-4 h-4 text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'متابعة القراءة' : 'Continue Reading'}</span>
              </button>
            </div>

            <span className="text-xs text-[#f7f3ea]/80 tabular-nums">
              {lang === 'ar'
                ? `الورد: ص ${formatNumber(profile.khatmaCurrentPage, lang)}–${formatNumber(khatmaWirdEnd, lang)}`
                : `Wird: p. ${profile.khatmaCurrentPage}–${khatmaWirdEnd}`}
            </span>
          </div>
        </div>

        {/* Prayer Times Card with Safe Positive Countdown + Verse of the Day */}
        <div className="lg:col-span-5 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] shrink-0">
                  {copy.nextPrayer}
                </p>
                <span aria-hidden="true" className="text-[#5c6862]">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => void handleQuickDetectLocation()}
                  disabled={locatingHome}
                  title={lang === 'ar' ? 'تحديد موقعي بدقة GPS' : 'Detect high-accuracy GPS'}
                  className="min-h-[36px] text-xs text-[#5c6862] dark:text-[#98a69f] hover:text-[#0f6b4f] dark:hover:text-[#c9a44c] flex items-center gap-1 truncate"
                >
                  {locatingHome ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-[#0f6b4f]" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5 text-[#0f6b4f] dark:text-[#c9a44c] shrink-0" />
                  )}
                  <span className="truncate">
                    {locatingHome
                      ? lang === 'ar'
                        ? 'جارٍ تحديد الموقع...'
                        : 'Detecting location...'
                      : lang === 'ar'
                      ? savedLocation.labelAr
                      : savedLocation.labelEn}
                  </span>
                </button>
              </div>
              <span
                className={`text-xs font-bold tabular-nums shrink-0 ${
                  isPrayerDue
                    ? 'text-emerald-700 dark:text-[#c9a44c]'
                    : 'font-mono text-[#0f6b4f] dark:text-[#c9a44c]'
                }`}
              >
                {activePrayerCountdown}
              </span>
            </div>

            {locationError && (
              <div
                role="alert"
                className="rounded-xl bg-amber-500/12 border border-amber-500/30 px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{locationError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleQuickDetectLocation()}
                  className="font-bold text-[#0f6b4f] dark:text-[#c9a44c] underline shrink-0 whitespace-nowrap"
                >
                  {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            )}

            <div className="flex items-baseline justify-between">
              <button
                type="button"
                onClick={() => onNavigateTab('worship', '/prayer-times')}
                className="text-start hover:text-[#0f6b4f] dark:hover:text-[#c9a44c] transition-colors"
              >
                <h2 className="text-2xl font-bold">{prayerLabelMap[prayerInfo.nextPrayerName]}</h2>
              </button>
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
                    className={`rounded-xl py-2 px-1 transition-colors ${
                      isNext
                        ? 'bg-[#0f6b4f] text-white'
                        : 'bg-[#f7f3ea]/85 dark:bg-[#0b1411]/80 text-[#5c6862] dark:text-[#98a69f]'
                    }`}
                  >
                    <p className="text-[11px] font-bold truncate">{prayerLabelMap[pr.k]}</p>
                    <p className="font-mono text-[11px] tabular-nums mt-0.5">
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
            <p className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c]">{copy.verseOfTheDay}</p>
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
              <div className="flex items-center gap-2.5 text-xs text-[#5c6862] dark:text-[#98a69f]">
                <Loader2 className="w-4 h-4 animate-spin text-[#0f6b4f] dark:text-[#c9a44c] shrink-0" />
                <span>{lang === 'ar' ? 'جارٍ تحميل آية اليوم...' : 'Loading verse of the day...'}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Focused 4 Core Shortcuts (القرآن - التفسير - التلاوات - الأذكار) */}
      <nav aria-label={lang === 'ar' ? 'الاختصارات الرئيسية' : 'Core Shortcuts'} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <a
          href="/quran"
          onClick={(e) => handleLinkNav(e, 'quran', '/quran')}
          className="min-h-[68px] rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 px-4 py-3 flex items-center gap-3 text-start hover:border-[#0f6b4f] hover:-translate-y-0.5 transition-all"
        >
          <span className="w-11 h-11 rounded-full bg-[#fdfaf3] border border-[#c9a44c]/45 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
            <img src="/src/assets/images/icons/book.png" alt="القرآن" className="w-full h-full object-contain" />
          </span>
          <div>
            <span className="text-sm font-bold block">{lang === 'ar' ? 'القرآن' : 'Quran'}</span>
            <span className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar' ? 'مصحف المدينة' : 'Madina Mushaf'}
            </span>
          </div>
        </a>

        <a
          href="/tafsir"
          onClick={(e) => handleLinkNav(e, 'quran', '/tafsir')}
          className="min-h-[68px] rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 px-4 py-3 flex items-center gap-3 text-start hover:border-[#0f6b4f] hover:-translate-y-0.5 transition-all"
        >
          <span className="w-11 h-11 rounded-full bg-[#fdfaf3] border border-[#c9a44c]/45 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
            <img src="/assets/aistudio/quran_01fb2fd7.png" alt="التفسير" className="w-full h-full object-contain" />
          </span>
          <div>
            <span className="text-sm font-bold block">{lang === 'ar' ? 'التفسير' : 'Tafsir'}</span>
            <span className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar' ? 'الميسر والسعدي' : 'Muyassar & Saadi'}
            </span>
          </div>
        </a>

        <a
          href="/recitations"
          onClick={(e) => handleLinkNav(e, 'listen', '/recitations')}
          className="min-h-[68px] rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 px-4 py-3 flex items-center gap-3 text-start hover:border-[#0f6b4f] hover:-translate-y-0.5 transition-all"
        >
          <span className="w-11 h-11 rounded-full bg-[#fdfaf3] border border-[#c9a44c]/45 p-2 flex items-center justify-center shrink-0 shadow-xs">
            <img
              src="/src/assets/images/icons/music-headphone.png"
              alt="التلاوات"
              className="w-full h-full object-contain"
            />
          </span>
          <div>
            <span className="text-sm font-bold block">{lang === 'ar' ? 'التلاوات' : 'Recitations'}</span>
            <span className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar' ? 'القراء والإذاعات' : 'Reciters & Radio'}
            </span>
          </div>
        </a>

        <a
          href="/adhkar"
          onClick={(e) => handleLinkNav(e, 'worship', '/adhkar')}
          className="min-h-[68px] rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 px-4 py-3 flex items-center gap-3 text-start hover:border-[#0f6b4f] hover:-translate-y-0.5 transition-all"
        >
          <span className="w-11 h-11 rounded-full bg-[#fdfaf3] border border-[#c9a44c]/45 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
            <img src="/src/assets/images/icons/man.png" alt="الأذكار" className="w-full h-full object-contain" />
          </span>
          <div>
            <span className="text-sm font-bold block">{lang === 'ar' ? 'الأذكار' : 'Adhkar'}</span>
            <span className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar' ? 'الصباح والمساء والمسبحة' : 'Morning, Evening & Tasbih'}
            </span>
          </div>
        </a>
      </nav>

      {/* 5. Khatma Plan & Memorization Plan */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Khatma Planner */}
        <div className="lg:col-span-6 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              </span>
              <span>{copy.khatmaPlan}</span>
            </h2>
            <span className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
              {formatNumber(khatmaPct, lang)}%
            </span>
          </div>

          <div className="h-2.5 rounded-full bg-[#0f6b4f]/15 overflow-hidden">
            <div className="h-full rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] transition-all" style={{ width: `${khatmaPct}%` }} />
          </div>

          <div className="rounded-2xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/12 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                {lang === 'ar' ? 'وردك اليومي المقترح' : "Today's Khatma Wird"}
              </p>
              <p className="text-sm font-bold tabular-nums">
                {lang === 'ar'
                  ? `من صفحة ${formatNumber(profile.khatmaCurrentPage, lang)} إلى صفحة ${formatNumber(khatmaWirdEnd, lang)}`
                  : `Pages ${profile.khatmaCurrentPage} – ${khatmaWirdEnd}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenMushafPage(Math.max(1, profile.khatmaCurrentPage))}
              className="min-h-[44px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-bold flex items-center gap-1.5 hover:bg-[#0a4e39] transition-colors whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'اقرأ الورد الآن' : 'Read Wird'}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center py-1">
            <div>
              <p className="text-lg font-bold tabular-nums">{formatNumber(dailyPortion, lang)}</p>
              <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">{copy.pagesPerDay}</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateKhatma(profile.khatmaTargetDays, -1)}
                  disabled={profile.khatmaCurrentPage <= 1}
                  aria-label={lang === 'ar' ? 'إنقاص صفحة' : 'Previous page'}
                  className="w-9 h-9 rounded-full border border-[#0f6b4f]/20 text-sm font-bold disabled:opacity-35 hover:bg-[#0f6b4f]/10"
                >
                  -
                </button>
                <p className="text-lg font-bold tabular-nums">{formatNumber(profile.khatmaCurrentPage, lang)}</p>
                <button
                  type="button"
                  onClick={() => onUpdateKhatma(profile.khatmaTargetDays, 1)}
                  disabled={profile.khatmaCurrentPage >= 604}
                  aria-label={lang === 'ar' ? 'زيادة صفحة' : 'Next page'}
                  className="w-9 h-9 rounded-full border border-[#0f6b4f]/20 text-sm font-bold disabled:opacity-35 hover:bg-[#0f6b4f]/10"
                >
                  +
                </button>
              </div>
              <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">{copy.page}</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">{formatNumber(daysRemaining, lang)}</p>
              <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">{copy.daysRemaining}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#0f6b4f]/10">
            <div className="flex flex-wrap items-center gap-1.5">
              {[15, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onUpdateKhatma(d)}
                  className={`min-h-[36px] px-3 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                    profile.khatmaTargetDays === d
                      ? 'bg-[#0f6b4f] text-white'
                      : 'bg-[#f7f3ea] dark:bg-[#0b1411] text-[#5c6862] dark:text-[#98a69f] hover:bg-[#0f6b4f]/10'
                  }`}
                >
                  {formatNumber(d, lang)} {lang === 'ar' ? 'يوم' : 'd'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onUpdateKhatma(profile.khatmaTargetDays, dailyPortion)}
              className="min-h-[44px] px-5 rounded-full bg-[#c9a44c] text-[#17211d] text-xs font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              {copy.logTodayPages} (+{formatNumber(dailyPortion, lang)})
            </button>
          </div>
        </div>

        {/* Memorization Mode */}
        <div className="lg:col-span-6 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">{copy.memorization}</h2>
            <button
              type="button"
              onClick={() => setMemOpen(!memOpen)}
              className="min-h-[42px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0a4e39] transition-colors whitespace-nowrap"
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
                  aria-label={lang === 'ar' ? 'اختر السورة للحفظ' : 'Select surah for memorization'}
                  className="col-span-3 sm:col-span-1 min-h-[44px] px-2.5 rounded-xl bg-[#fdfaf3] dark:bg-[#121f1a] border border-[#0f6b4f]/20 text-xs"
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
                  aria-label={lang === 'ar' ? 'من آية' : 'From Ayah'}
                  className="min-h-[44px] px-3 rounded-xl bg-[#fdfaf3] dark:bg-[#121f1a] border border-[#0f6b4f]/20 text-xs tabular-nums"
                />
                <input
                  type="number"
                  min={memStart}
                  value={memEnd}
                  onChange={(e) => setMemEnd(Math.max(memStart, Number(e.target.value)))}
                  aria-label={lang === 'ar' ? 'إلى آية' : 'To Ayah'}
                  className="min-h-[44px] px-3 rounded-xl bg-[#fdfaf3] dark:bg-[#121f1a] border border-[#0f6b4f]/20 text-xs tabular-nums"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setHideVerses(!hideVerses)}
                  className="min-h-[40px] px-3 rounded-xl border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-1.5"
                >
                  {hideVerses ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{hideVerses ? copy.showVerses : copy.hideVerses}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRepeatCount((c) => c + 1)}
                  className="min-h-[40px] px-3 rounded-xl border border-[#c9a44c]/40 text-xs font-semibold flex items-center gap-1.5 tabular-nums"
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
                  className="min-h-[40px] px-4 rounded-xl bg-[#0f6b4f] text-white text-xs font-semibold"
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
                <p className="text-xs text-[#5c6862] dark:text-[#98a69f] py-6 text-center leading-relaxed">
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
                              className="min-h-[36px] flex-1 py-1.5 rounded-lg border border-[#0f6b4f]/20 text-xs font-semibold hover:bg-[#0f6b4f] hover:text-white transition-colors"
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
      </section>

      {/* 6. Suggested Surahs */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
            {lang === 'ar' ? 'السور المقترحة' : 'Suggested Surahs'}
          </h2>
          <a
            href="/quran"
            onClick={(e) => handleLinkNav(e, 'quran', '/quran')}
            className="text-xs font-semibold text-[#5c6862] dark:text-[#98a69f] hover:text-[#0f6b4f]"
          >
            {lang === 'ar' ? 'كل السور ←' : 'All Surahs →'}
          </a>
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
                className="min-h-[82px] rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 text-start hover:border-[#c9a44c] hover:-translate-y-0.5 transition-all space-y-1"
              >
                <p className="font-quran text-xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                  {ch ? (lang === 'ar' ? `سورة ${ch.name_arabic}` : ch.name_simple) : `Surah ${item.id}`}
                </p>
                <p className="text-xs text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                  {lang === 'ar' ? item.noteAr : item.noteEn} · {copy.page} {formatNumber(targetPage, lang)}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 7. Bottom Tools: Last Listened, Global Quran Search, Weekly Activity & Library */}
      <section className="space-y-4">
        {lastListened && (
          <div className="rounded-3xl crystal-card border border-[#c9a44c]/35 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <ReciterAvatar
                name={lastListened.reciterName || lastListened.subtitle}
                reciterId={lastListened.reciterId}
                size="lg"
                active
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5 shrink-0" />
                  <span>{lang === 'ar' ? 'آخر ما استمعت إليه' : 'Last Listened'}</span>
                </p>
                <h3 className="text-sm font-bold truncate">{lastListened.title}</h3>
                <p className="text-xs text-[#5c6862] dark:text-[#98a69f] truncate">
                  {lastListened.reciterName || lastListened.subtitle}
                </p>
                {lastListened.verseText && (
                  <p className="font-quran text-base text-[#17211d] dark:text-[#ede7da] truncate pt-0.5" dir="rtl">
                    {lastListened.verseText}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onResumeLastListened(lastListened)}
                className="min-h-[44px] px-5 rounded-full bg-[#0f6b4f] text-white text-xs font-bold flex items-center gap-2 hover:bg-[#0a4e39] transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{lang === 'ar' ? 'متابعة الاستماع' : 'Resume'}</span>
              </button>
              <a
                href="/library"
                onClick={(e) => handleLinkNav(e, 'library', '/library')}
                className="min-h-[44px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center hover:bg-[#0f6b4f]/10 transition-colors whitespace-nowrap"
              >
                {copy.navLibrary}
              </a>
            </div>
          </div>
        )}

        {/* Global Search Bar */}
        <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 space-y-3">
          <h2 className="text-sm font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
            {lang === 'ar' ? 'البحث في آيات القرآن الكريم' : 'Search the Holy Quran'}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(searchText);
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
                className="w-full min-h-[46px] ps-10 pe-4 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15 text-sm focus:outline-none focus:border-[#0f6b4f]"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="min-h-[46px] px-5 rounded-xl bg-[#0f6b4f] text-white text-xs font-semibold hover:bg-[#0a4e39] whitespace-nowrap"
            >
              {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : lang === 'ar' ? 'بحث' : 'Search'}
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
                    void runSearch(h);
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

        {/* Weekly Activity + Library & PWA Install */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-8 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 flex flex-wrap items-center justify-between gap-5">
            <div className="space-y-1.5 min-w-[180px]">
              <h2 className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c]">{copy.weeklyActivity}</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">
                  {formatNumber(profile.weeklyPages.reduce((s, n) => s + n, 0), lang)}
                </span>
                <span className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                  {copy.page} ·{' '}
                  {lang === 'ar'
                    ? `الجزء ${formatNumber(Math.min(30, Math.ceil(profile.lastReadPage / 20)), lang)} من ٣٠`
                    : `Juz ${Math.min(30, Math.ceil(profile.lastReadPage / 20))} of 30`}
                </span>
              </div>
            </div>

            <div className="flex items-end gap-2 sm:gap-3 h-20 flex-1 max-w-md justify-end">
              {profile.weeklyPages.map((val, idx) => {
                const maxW = Math.max(8, ...profile.weeklyPages);
                const hPct = Math.max(15, Math.round((val / maxW) * 100));
                const dayShort = (lang === 'ar' ? ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'])[idx];
                return (
                  <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end flex-1 max-w-[36px]">
                    <div className="w-5 sm:w-6 flex-1 rounded-full bg-[#0f6b4f]/10 dark:bg-[#c9a44c]/12 p-0.5 flex items-end overflow-hidden">
                      <div
                        className="w-full rounded-full bg-gradient-to-t from-[#0f6b4f] to-[#1a8a67] dark:from-[#c9a44c] dark:to-[#e0bd66] transition-all duration-300"
                        style={{ height: `${hPct}%` }}
                      />
                    </div>
                    <span className="w-6 h-6 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15 flex items-center justify-center text-[10px] font-bold text-[#5c6862] dark:text-[#98a69f]">
                      {dayShort}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-4 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <a
                href="/library"
                onClick={(e) => handleLinkNav(e, 'library', '/library')}
                className="flex items-center gap-2.5 text-sm font-bold text-[#0f6b4f] dark:text-[#c9a44c] hover:underline"
              >
                <img src="/assets/aistudio/music_02d469b8.png" alt="المكتبة" className="w-7 h-7 object-contain shrink-0" />
                <span>{lang === 'ar' ? 'المكتبة والقبلة والتنزيلات' : 'Library, Qibla & Offline'}</span>
              </a>
            </div>
            <button
              type="button"
              onClick={() => void shareNourApp(lang)}
              className="w-full min-h-[44px] px-4 rounded-full border border-[#0f6b4f]/25 bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 text-[#0f6b4f] dark:text-[#c9a44c] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#0f6b4f]/10 transition-colors"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>{lang === 'ar' ? 'مشاركة تطبيق نور' : 'Share Nour App'}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
