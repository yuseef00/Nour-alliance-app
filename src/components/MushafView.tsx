import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Compass,
  Headphones,
  Loader2,
  LocateFixed,
  Minus,
  Moon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  Chapter,
  HighlightColor,
  Language,
  MushafViewMode,
  TafsirSlug,
  ThemeMode,
  Verse,
  VerseBookmark,
} from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import { fetchTafsirByAyah, fetchVersesByPage, parseTajweedSegments } from '../services/quranApi';
import { VerseSheet } from './VerseSheet';

interface MushafViewProps {
  lang: Language;
  theme?: ThemeMode;
  chapters: Chapter[];
  currentPage: number;
  bookmarks: VerseBookmark[];
  activePlayingVerseKey?: string | null;
  initialTafsirMode?: boolean;
  onToggleTheme?: () => void;
  onChangePage: (page: number, firstSurah?: number, firstAyah?: number) => void;
  onTrackReadingAyah?: (page: number, surahNumber: number, ayahNumber: number) => void;
  onSaveBookmark: (verse: Verse, color: HighlightColor, note: string) => void;
  onPlayFromVerse: (verse: Verse) => void;
  onPlaySurahFromMushaf: (surahId: number) => void;
}

const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

function highlightBgClass(color?: HighlightColor): string {
  switch (color) {
    case 'gold':
      return 'bg-[#c9a44c]/20 rounded-md';
    case 'emerald':
      return 'bg-[#0f6b4f]/15 rounded-md';
    case 'sky':
      return 'bg-sky-500/15 rounded-md';
    case 'rose':
      return 'bg-rose-500/15 rounded-md';
    default:
      return '';
  }
}

const MUSHAF_FONT_SIZE_KEY = 'nour_mushaf_font_size_v1';

function getResponsiveMushafFontSize(): number {
  if (typeof window === 'undefined') return 25;
  try {
    const saved = Number(localStorage.getItem(MUSHAF_FONT_SIZE_KEY));
    if (Number.isFinite(saved) && saved >= 16 && saved <= 44) return saved;
  } catch {
    // ignore storage errors
  }
  const w = window.innerWidth;
  if (w < 365) return 20;
  if (w < 430) return 22;
  if (w < 640) return 24;
  if (w < 1024) return 26;
  return 28;
}

export const MushafView: React.FC<MushafViewProps> = ({
  lang,
  theme = 'light',
  chapters,
  currentPage,
  bookmarks,
  activePlayingVerseKey,
  initialTafsirMode = false,
  onToggleTheme,
  onChangePage,
  onTrackReadingAyah,
  onSaveBookmark,
  onPlayFromVerse,
  onPlaySurahFromMushaf,
}) => {
  const copy = t(lang);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryPageTick, setRetryPageTick] = useState(0);
  const [viewMode, setViewMode] = useState<MushafViewMode>('page');
  const [tajweed, setTajweed] = useState(true);
  const [fontSize, setFontSize] = useState<number>(() => getResponsiveMushafFontSize());
  const [lineSpacing, setLineSpacing] = useState<2.15 | 2.38 | 2.7>(2.38);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [jumpTab, setJumpTab] = useState<'surah' | 'juz' | 'page'>('surah');
  const [surahFilter, setSurahFilter] = useState('');
  const [selectedVerse, setSelectedVerse] = useState<Verse | null>(null);
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [warmPaper, setWarmPaper] = useState(true);
  const [pageBookmarkFeedback, setPageBookmarkFeedback] = useState(false);
  const [trackedVerseKey, setTrackedVerseKey] = useState<string>('');
  const [autoScrollTrack, setAutoScrollTrack] = useState(true);
  const verseNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const userScrolledPageRef = useRef(false);

  const updateFontSize = (next: number) => {
    const clamped = Math.min(44, Math.max(16, next));
    setFontSize(clamped);
    try {
      localStorage.setItem(MUSHAF_FONT_SIZE_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
  };

  // Dedicated Tafsir Study Panel state (opened when visiting /tafsir or toggling Tafsir)
  const [tafsirOpen, setTafsirOpen] = useState(initialTafsirMode);
  const [tafsirSlug, setTafsirSlug] = useState<TafsirSlug>('muyassar');
  const [tafsirVerseKey, setTafsirVerseKey] = useState<string>('');
  const [tafsirContent, setTafsirContent] = useState<{ text: string; resourceName: string } | null>(null);
  const [loadingTafsir, setLoadingTafsir] = useState(false);
  const [tafsirError, setTafsirError] = useState(false);
  const [tafsirRetryTick, setTafsirRetryTick] = useState(0);

  // Remember initial reading page of this session for quick "Return to Saved Position"
  const [anchorSavedPage] = useState<number>(currentPage);

  useEffect(() => {
    if (initialTafsirMode) {
      setTafsirOpen(true);
    }
  }, [initialTafsirMode]);

  useEffect(() => {
    setPageInput(String(currentPage));
    userScrolledPageRef.current = false;
    verseNodesRef.current.clear();
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchVersesByPage(currentPage)
      .then((data) => {
        if (!cancelled) {
          setVerses(data);
          if (data[0]) {
            const firstVerse = data[0];
            const surahNum = Number(firstVerse.verse_key.split(':')[0]);
            const activeOnThisPage =
              activePlayingVerseKey && data.some((v) => v.verse_key === activePlayingVerseKey)
                ? activePlayingVerseKey
                : firstVerse.verse_key;
            setTrackedVerseKey(activeOnThisPage);
            setTafsirVerseKey((prev) =>
              data.some((v) => v.verse_key === prev) ? prev : firstVerse.verse_key
            );
            const activeObj = data.find((v) => v.verse_key === activeOnThisPage) || firstVerse;
            onChangePage(
              currentPage,
              Number(activeObj.verse_key.split(':')[0]) || surahNum,
              activeObj.verse_number
            );
          }
          if (currentPage < 604 && navigator.onLine) {
            void fetchVersesByPage(currentPage + 1).catch(() => {});
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setError(
              lang === 'ar'
                ? 'هذه الصفحة غير محفوظة محلياً بعد. يمكنك تحميل المصحف كاملاً من «المكتبة» عند عودة الاتصال.'
                : 'This page is not cached offline yet. Download the full Mushaf from Library when online.'
            );
          } else {
            setError(
              lang === 'ar'
                ? 'تعذر تحميل صفحة المصحف حالياً. تحقق من الاتصال وأعد المحاولة.'
                : err instanceof Error
                ? err.message
                : 'Failed to load page'
            );
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPage, retryPageTick]);

  // Fetch Tafsir whenever Dedicated Tafsir Panel is open
  useEffect(() => {
    if (!tafsirOpen || !tafsirVerseKey) return;
    let cancelled = false;
    setLoadingTafsir(true);
    setTafsirError(false);
    fetchTafsirByAyah(tafsirVerseKey, tafsirSlug)
      .then((res) => {
        if (!cancelled) {
          setTafsirContent({
            text: res.text,
            resourceName:
              res.resourceName || (tafsirSlug === 'saadi' ? copy.tafsirSaadi : copy.tafsirMuyassar),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTafsirError(true);
          setTafsirContent(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTafsir(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tafsirOpen, tafsirVerseKey, tafsirSlug, tafsirRetryTick, copy.tafsirSaadi, copy.tafsirMuyassar]);

  // Keep tracker & scroll synced during active verse-by-verse playback
  useEffect(() => {
    if (!activePlayingVerseKey) return;
    setTrackedVerseKey(activePlayingVerseKey);
    setTafsirVerseKey(activePlayingVerseKey);
    const node = verseNodesRef.current.get(activePlayingVerseKey);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activePlayingVerseKey, verses]);

  // Automatic scroll-following reading tracker (only activates after user scrolls so reading always begins at the first verse)
  useEffect(() => {
    if (!autoScrollTrack || loading || verses.length === 0) return;

    const markScrolled = () => {
      userScrolledPageRef.current = true;
    };
    window.addEventListener('scroll', markScrolled, { passive: true });
    window.addEventListener('wheel', markScrolled, { passive: true });
    window.addEventListener('touchmove', markScrolled, { passive: true });

    if (typeof IntersectionObserver === 'undefined') {
      return () => {
        window.removeEventListener('scroll', markScrolled);
        window.removeEventListener('wheel', markScrolled);
        window.removeEventListener('touchmove', markScrolled);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!userScrolledPageRef.current || activePlayingVerseKey) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const topKey = visible[0]?.target.getAttribute('data-verse-key');
        if (!topKey) return;
        const verse = verses.find((v) => v.verse_key === topKey);
        if (!verse) return;
        setTrackedVerseKey(verse.verse_key);
        setTafsirVerseKey(verse.verse_key);
        const surahNum = Number(verse.verse_key.split(':')[0]);
        onTrackReadingAyah?.(currentPage, surahNum, verse.verse_number);
      },
      {
        rootMargin: '-18% 0px -56% 0px',
        threshold: 0.1,
      }
    );

    verseNodesRef.current.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', markScrolled);
      window.removeEventListener('wheel', markScrolled);
      window.removeEventListener('touchmove', markScrolled);
    };
  }, [autoScrollTrack, loading, verses, viewMode, currentPage, activePlayingVerseKey, onTrackReadingAyah]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (jumpOpen || selectedVerse) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        const next = lang === 'ar' ? currentPage + 1 : currentPage - 1;
        if (next >= 1 && next <= 604) onChangePage(next);
      } else if (e.key === 'ArrowRight') {
        const next = lang === 'ar' ? currentPage - 1 : currentPage + 1;
        if (next >= 1 && next <= 604) onChangePage(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPage, jumpOpen, selectedVerse, lang, onChangePage]);

  const bookmarkMap = useMemo(() => {
    const map = new Map<string, VerseBookmark>();
    bookmarks.forEach((b) => map.set(b.verseKey, b));
    return map;
  }, [bookmarks]);

  const chapterMap = useMemo(() => {
    const map = new Map<number, Chapter>();
    chapters.forEach((c) => map.set(c.id, c));
    return map;
  }, [chapters]);

  const primarySurahId = verses[0] ? Number(verses[0].verse_key.split(':')[0]) : 1;
  const primaryChapter = chapterMap.get(primarySurahId);
  const currentJuz = verses[0]?.juz_number || 1;
  const currentHizb = verses[0]?.hizb_number || 1;
  const mushafProgressPct = Math.min(100, Math.max(1, Math.round((currentPage / 604) * 100)));
  const isFirstVerseBookmarked = Boolean(verses[0] && bookmarkMap.has(verses[0].verse_key));

  const filteredChapters = useMemo(() => {
    const q = surahFilter.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter(
      (c) =>
        c.name_arabic.includes(q) ||
        c.name_simple.toLowerCase().includes(q) ||
        String(c.id) === q
    );
  }, [chapters, surahFilter]);

  const renderVerseContent = (v: Verse) => {
    if (tajweed && v.text_uthmani_tajweed) {
      const segments = parseTajweedSegments(v.text_uthmani_tajweed);
      return segments.map((seg, i) => (
        <span key={i} className={seg.ruleClass ? `taj-${seg.ruleClass}` : undefined}>
          {seg.text}
        </span>
      ));
    }
    return v.text_uthmani;
  };

  const handleBookmarkCurrentPage = () => {
    if (!verses[0]) return;
    onSaveBookmark(
      verses[0],
      'gold',
      lang === 'ar' ? `علامة صفحة ${currentPage}` : `Page ${currentPage} bookmark`
    );
    setPageBookmarkFeedback(true);
    window.setTimeout(() => setPageBookmarkFeedback(false), 1800);
  };

  const trackedVerseIndex = Math.max(
    0,
    verses.findIndex((v) => v.verse_key === (activePlayingVerseKey || trackedVerseKey))
  );
  const activeTrackedVerse = verses[trackedVerseIndex] || verses[0] || null;
  const activeTrackedSurah = activeTrackedVerse
    ? chapterMap.get(Number(activeTrackedVerse.verse_key.split(':')[0]))
    : primaryChapter;
  const activeTafsirVerse = verses.find((v) => v.verse_key === tafsirVerseKey) || activeTrackedVerse;

  const setVerseRef = (verseKey: string) => (el: HTMLElement | null) => {
    if (el) {
      verseNodesRef.current.set(verseKey, el);
    } else {
      verseNodesRef.current.delete(verseKey);
    }
  };

  const handleSelectTrackedVerse = (verse: Verse, shouldScroll = true) => {
    setTrackedVerseKey(verse.verse_key);
    setTafsirVerseKey(verse.verse_key);
    const surahNum = Number(verse.verse_key.split(':')[0]);
    onTrackReadingAyah?.(currentPage, surahNum, verse.verse_number);
    if (shouldScroll) {
      verseNodesRef.current.get(verse.verse_key)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleStepTrackedVerse = (delta: -1 | 1) => {
    if (verses.length === 0) return;
    const nextIdx = trackedVerseIndex + delta;
    if (nextIdx >= 0 && nextIdx < verses.length) {
      handleSelectTrackedVerse(verses[nextIdx], true);
      return;
    }
    if (delta === -1 && currentPage > 1) {
      onChangePage(currentPage - 1);
    } else if (delta === 1 && currentPage < 604) {
      onChangePage(currentPage + 1);
    }
  };

  const handleRestartFromFirstVerse = () => {
    if (!verses[0]) return;
    userScrolledPageRef.current = false;
    handleSelectTrackedVerse(verses[0], true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h1 className="text-lg sm:text-xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
          {tafsirOpen
            ? lang === 'ar'
              ? 'التفسير والقرآن الكريم'
              : 'Quran & Tafsir'
            : lang === 'ar'
            ? 'القرآن الكريم — مصحف المدينة'
            : 'The Holy Quran — Madina Mushaf'}
        </h1>

        {anchorSavedPage !== currentPage && (
          <button
            type="button"
            onClick={() => onChangePage(anchorSavedPage)}
            className="min-h-[38px] px-3.5 rounded-full bg-[#c9a44c]/20 border border-[#c9a44c] text-[#7c5c16] dark:text-[#e5c16a] text-xs font-bold flex items-center gap-1.5 hover:bg-[#c9a44c]/30 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>
              {lang === 'ar'
                ? `متابعة القراءة (ص ${formatNumber(anchorSavedPage, lang)})`
                : `Resume (p. ${anchorSavedPage})`}
            </span>
          </button>
        )}
      </div>

      {/* Pure Sacred Madina Mushaf Leaf */}
      <article
        className={`rounded-2xl sm:rounded-[28px] crystal-card border-2 border-[#c9a44c]/55 p-1.5 sm:p-3.5 shadow-xl ${
          tajweed ? 'tajweed-enabled' : ''
        } ${warmPaper ? 'bg-[#fcf5e5]/95 dark:bg-[#13201b]/95' : ''}`}
      >
        <div className="rounded-xl sm:rounded-[22px] border border-[#c9a44c]/35 px-2.5 py-3.5 sm:px-9 sm:py-7 space-y-4 sm:space-y-5 relative">
          {/* Traditional Top Madina Running Header Inside the Mushaf Leaf */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#c9a44c]/30 text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
            <button
              type="button"
              onClick={() => setJumpOpen(true)}
              className="hover:underline flex items-center gap-1.5 text-start min-h-[36px]"
            >
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span>
                {primaryChapter
                  ? lang === 'ar'
                    ? `سورة ${primaryChapter.name_arabic}`
                    : primaryChapter.name_simple
                  : copy.jumpTo}
              </span>
            </button>

            <span className="font-quran text-base sm:text-lg text-[#7c5c16] dark:text-[#e0bd66] tabular-nums">
              {copy.juz} {formatNumber(currentJuz, lang)}
              <span aria-hidden="true" className="mx-1.5 opacity-50">·</span>
              {lang === 'ar' ? 'الحزب' : 'Hizb'} {formatNumber(currentHizb, lang)}
            </span>

            <div className="flex items-center gap-2">
              <span className="tabular-nums text-[#5c6862] dark:text-[#98a69f]">
                {copy.page} {formatNumber(currentPage, lang)}
              </span>
              <button
                type="button"
                onClick={handleBookmarkCurrentPage}
                aria-label={lang === 'ar' ? 'حفظ علامة لهذه الصفحة' : 'Bookmark this page'}
                className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                  isFirstVerseBookmarked || pageBookmarkFeedback
                    ? 'bg-[#c9a44c]/25 border-[#c9a44c] text-[#7c5c16] dark:text-[#e5c16a]'
                    : 'border-[#c9a44c]/35 text-[#0f6b4f] dark:text-[#c9a44c] hover:bg-[#c9a44c]/15'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${isFirstVerseBookmarked || pageBookmarkFeedback ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>

          {/* Calm Verse-by-Verse Reading Tracker Strip (Always Starts at First Verse) */}
          {!loading && !error && verses.length > 0 && activeTrackedVerse && (
            <div className="rounded-2xl bg-[#f7f3ea]/90 dark:bg-[#0b1411]/85 border border-[#0f6b4f]/15 dark:border-[#c9a44c]/25 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 text-[#0f6b4f] dark:text-[#c9a44c] flex items-center justify-center shrink-0">
                  <LocateFixed className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#0f6b4f] dark:text-[#c9a44c] truncate">
                    {activePlayingVerseKey
                      ? lang === 'ar'
                        ? 'تتبع صوتي نشط'
                        : 'Audio Verse Tracking'
                      : lang === 'ar'
                      ? 'مؤشر تتبع الآية'
                      : 'Verse Reading Tracker'}
                  </p>
                  <p className="text-xs font-semibold text-[#17211d] dark:text-[#ede7da] tabular-nums truncate">
                    {activeTrackedSurah
                      ? lang === 'ar'
                        ? `سورة ${activeTrackedSurah.name_arabic}`
                        : activeTrackedSurah.name_simple
                      : ''}
                    {' · '}
                    {copy.ayah} {formatNumber(activeTrackedVerse.verse_number, lang)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleStepTrackedVerse(-1)}
                  disabled={currentPage <= 1 && trackedVerseIndex <= 0}
                  aria-label={lang === 'ar' ? 'الآية السابقة' : 'Previous verse'}
                  className="w-9 h-9 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10 disabled:opacity-35"
                >
                  {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleStepTrackedVerse(1)}
                  disabled={currentPage >= 604 && trackedVerseIndex >= verses.length - 1}
                  aria-label={lang === 'ar' ? 'الآية التالية' : 'Next verse'}
                  className="w-9 h-9 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10 disabled:opacity-35"
                >
                  {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={handleRestartFromFirstVerse}
                  className="min-h-[36px] px-3 rounded-full border border-[#c9a44c]/55 bg-[#c9a44c]/12 text-[#7c5c16] dark:text-[#e5c16a] text-[11px] font-bold flex items-center gap-1.5 hover:bg-[#c9a44c]/25 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'من أول الآية' : 'First Verse'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const startVerse = verses[0] || activeTrackedVerse;
                    if (startVerse) {
                      handleSelectTrackedVerse(startVerse, true);
                      onPlayFromVerse(startVerse);
                    }
                  }}
                  className="min-h-[36px] px-3.5 rounded-full bg-[#0f6b4f] text-white text-[11px] font-bold flex items-center gap-1.5 hover:bg-[#0a4e39] whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{lang === 'ar' ? 'تتبع صوتي من الأول' : 'Play From First'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAutoScrollTrack((prev) => !prev)}
                  aria-pressed={autoScrollTrack}
                  className={`min-h-[36px] px-3 rounded-full border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    autoScrollTrack
                      ? 'border-[#0f6b4f] bg-[#0f6b4f]/12 text-[#0f6b4f] dark:text-[#c9a44c]'
                      : 'border-[#0f6b4f]/20 text-[#5c6862] dark:text-[#98a69f]'
                  }`}
                >
                  {lang === 'ar' ? 'تتبع تلقائي' : 'Auto Track'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-28 flex flex-col items-center justify-center gap-3 text-sm text-[#5c6862] dark:text-[#98a69f]">
              <div className="w-12 h-12 rounded-full border-4 border-[#0f6b4f]/15 border-t-[#0f6b4f] dark:border-[#c9a44c]/20 dark:border-t-[#c9a44c] animate-spin" />
              <span>{lang === 'ar' ? 'جارٍ فتح صفحة المصحف...' : 'Opening Mushaf page...'}</span>
            </div>
          ) : error ? (
            <div className="py-20 text-center space-y-3" role="alert">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => setRetryPageTick((n) => n + 1)}
                className="min-h-[42px] px-5 py-2.5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#0a4e39]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
              </button>
            </div>
          ) : viewMode === 'page' ? (
            <div className="max-w-3xl mx-auto py-1 space-y-5 sm:space-y-6" dir="rtl">
              <div
                className="font-quran text-justify tracking-normal"
                style={{ fontSize: `${fontSize}px`, lineHeight: lineSpacing, overflowWrap: 'anywhere' }}
              >
                {verses.map((v, idx) => {
                  const surahId = Number(v.verse_key.split(':')[0]);
                  const ch = chapterMap.get(surahId);
                  const isFirstVerseOfSurah = v.verse_number === 1;
                  const bm = bookmarkMap.get(v.verse_key);
                  const isPlaying = activePlayingVerseKey === v.verse_key;
                  const isTracked = !isPlaying && activeTrackedVerse?.verse_key === v.verse_key;
                  return (
                    <React.Fragment key={v.verse_key}>
                      {isFirstVerseOfSurah && (
                        <div className={`my-5 ${idx === 0 ? 'mt-0' : ''}`}>
                          <div className="rounded-2xl surah-ornate-banner border border-[#c9a44c]/65 py-3 px-5 flex flex-wrap items-center justify-between gap-3">
                            <span className="font-quran text-xl sm:text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                              سورة {ch?.name_arabic || surahId}
                            </span>
                            <div className="flex items-center gap-2.5">
                              {ch && (
                                <span className="font-ui text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                                  {ch.revelation_place === 'makkah' ? 'مكية' : 'مدنية'} ·{' '}
                                  {ch.verses_count.toLocaleString('ar-EG')} آية
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectTrackedVerse(v, true);
                                  onPlayFromVerse(v);
                                }}
                                aria-label={lang === 'ar' ? 'تشغيل متتبع من أول آية' : 'Play tracked from Ayah 1'}
                                title={lang === 'ar' ? 'تلاوة متتبعة من أول آية' : 'Tracked recitation from Ayah 1'}
                                className="h-9 px-3 rounded-full bg-[#c9a44c] text-[#17211d] font-ui text-[11px] font-bold flex items-center gap-1 hover:brightness-105 transition-all"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>{lang === 'ar' ? 'من آية ١' : 'Ayah 1'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onPlaySurahFromMushaf(surahId)}
                                aria-label={lang === 'ar' ? 'استماع للسورة كاملة' : 'Listen full Surah'}
                                className="w-9 h-9 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center hover:bg-[#0a4e39] transition-colors"
                              >
                                <Headphones className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {ch?.bismillah_pre && (
                            <p className="font-quran text-center text-xl sm:text-2xl my-3 text-[#17211d] dark:text-[#ede7da]">
                              بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                            </p>
                          )}
                        </div>
                      )}
                      <span
                        ref={setVerseRef(v.verse_key)}
                        data-verse-key={v.verse_key}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          handleSelectTrackedVerse(v, false);
                          setSelectedVerse(v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSelectTrackedVerse(v, false);
                            setSelectedVerse(v);
                          }
                        }}
                        className={`cursor-pointer px-1 transition-colors hover:bg-[#c9a44c]/20 ${highlightBgClass(
                          bm?.highlightColor
                        )} ${
                          isPlaying
                            ? 'ring-2 ring-[#0f6b4f] rounded-md bg-[#0f6b4f]/16'
                            : isTracked
                            ? 'bg-[#c9a44c]/20 ring-1 ring-[#c9a44c]/80 rounded-md underline decoration-[#0f6b4f]/65 decoration-2 underline-offset-8'
                            : ''
                        }`}
                      >
                        {renderVerseContent(v)}
                        <span
                          className={`inline-flex items-center justify-center mx-1.5 text-[0.65em] font-ui font-bold rounded-full px-2 py-0.5 align-middle border ${
                            isPlaying || isTracked
                              ? 'bg-[#0f6b4f] text-white border-[#0f6b4f]'
                              : 'text-[#0f6b4f] dark:text-[#c9a44c] border-[#c9a44c]/65'
                          }`}
                        >
                          {v.verse_number.toLocaleString('ar-EG')}
                        </span>
                      </span>{' '}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3" dir="rtl">
              {verses.map((v) => {
                const surahId = Number(v.verse_key.split(':')[0]);
                const ch = chapterMap.get(surahId);
                const bm = bookmarkMap.get(v.verse_key);
                const isPlaying = activePlayingVerseKey === v.verse_key;
                const isTracked = !isPlaying && activeTrackedVerse?.verse_key === v.verse_key;
                return (
                  <div
                    key={v.verse_key}
                    ref={setVerseRef(v.verse_key)}
                    data-verse-key={v.verse_key}
                    onClick={() => {
                      handleSelectTrackedVerse(v, false);
                      setSelectedVerse(v);
                    }}
                    className={`cursor-pointer rounded-2xl border p-4 sm:p-5 transition-colors hover:border-[#0f6b4f]/40 ${highlightBgClass(
                      bm?.highlightColor
                    )} ${
                      isPlaying
                        ? 'ring-2 ring-[#0f6b4f] border-[#0f6b4f] bg-[#0f6b4f]/10'
                        : isTracked
                        ? 'ring-1 ring-[#c9a44c] border-[#c9a44c] bg-[#c9a44c]/12'
                        : 'border-[#0f6b4f]/12 dark:border-[#c9a44c]/15'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-[#5c6862] dark:text-[#98a69f] mb-2">
                      <span className="flex items-center gap-2">
                        {(isPlaying || isTracked) && (
                          <span className="w-2 h-2 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c]" />
                        )}
                        <span>
                          {ch?.name_arabic} · {copy.ayah} {v.verse_number.toLocaleString('ar-EG')}
                        </span>
                      </span>
                      {bm?.note && <span className="text-[#0f6b4f] dark:text-[#c9a44c] font-semibold">★ ملاحظة</span>}
                    </div>
                    <p
                      className="font-quran"
                      style={{ fontSize: `${fontSize}px`, lineHeight: lineSpacing - 0.1 }}
                    >
                      {renderVerseContent(v)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Mushaf Progress + Page Turn Navigation */}
          <div className="pt-4 border-t border-[#c9a44c]/25 space-y-3">
            <div className="h-1.5 rounded-full bg-[#0f6b4f]/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-l from-[#0f6b4f] to-[#c9a44c] transition-all duration-300"
                style={{ width: `${mushafProgressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onChangePage(currentPage - 1)}
                className="min-h-[44px] px-4 sm:px-5 rounded-full border border-[#0f6b4f]/20 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 hover:bg-[#0f6b4f]/8 transition-colors"
              >
                {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                <span>{lang === 'ar' ? 'السابقة' : 'Previous'}</span>
              </button>

              <span className="text-xs font-bold text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                {formatNumber(currentPage, lang)} / {formatNumber(604, lang)}
              </span>

              <button
                type="button"
                disabled={currentPage >= 604}
                onClick={() => onChangePage(currentPage + 1)}
                className="min-h-[44px] px-4 sm:px-5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 hover:bg-[#0a4e39] transition-colors"
              >
                <span>{lang === 'ar' ? 'التالية' : 'Next'}</span>
                {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </article>

      {/* Mushaf Action Bar */}
      <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setJumpOpen(true)}
            className="min-h-[42px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-2 hover:bg-[#0a4e39]"
          >
            <Compass className="w-4 h-4" />
            <span>{copy.jumpTo}</span>
          </button>

          <button
            type="button"
            onClick={() => setTafsirOpen((v) => !v)}
            aria-expanded={tafsirOpen}
            className={`min-h-[42px] px-4 rounded-full border text-xs font-semibold flex items-center gap-2 transition-colors ${
              tafsirOpen
                ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white'
                : 'border-[#0f6b4f]/25 hover:border-[#0f6b4f] text-[#0f6b4f] dark:text-[#c9a44c]'
            }`}
          >
            <img src="/assets/aistudio/quran_01fb2fd7.png" alt="" className="w-5 h-5 object-contain shrink-0" />
            <span>{copy.tafsir}</span>
          </button>

          <button
            type="button"
            onClick={() => onPlaySurahFromMushaf(primarySurahId)}
            className="min-h-[42px] px-4 rounded-full border border-[#c9a44c]/55 bg-[#c9a44c]/12 text-[#17211d] dark:text-[#ede7da] text-xs font-semibold flex items-center gap-2 hover:bg-[#c9a44c]/25"
          >
            <Headphones className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
            <span>{lang === 'ar' ? 'استماع للسورة' : 'Listen Surah'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setControlsOpen((o) => !o)}
          aria-expanded={controlsOpen}
          className={`min-h-[42px] px-4 rounded-full border text-xs font-semibold flex items-center gap-2 transition-colors ${
            controlsOpen
              ? 'bg-[#0f6b4f]/12 border-[#0f6b4f] text-[#0f6b4f] dark:text-[#c9a44c]'
              : 'border-[#0f6b4f]/20 hover:border-[#0f6b4f]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تخصيص الخط والعرض' : 'Display & Font'}</span>
        </button>
      </div>

      {/* Dedicated Inline Tafsir Study Card */}
      {tafsirOpen && (
        <section
          aria-label={copy.tafsir}
          className="rounded-3xl crystal-card border border-[#0f6b4f]/20 dark:border-[#c9a44c]/30 p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-[#fdfaf3] border border-[#c9a44c]/50 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
                <img src="/assets/aistudio/quran_01fb2fd7.png" alt="" className="w-full h-full object-contain" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                  {tafsirSlug === 'saadi' ? copy.tafsirSaadi : copy.tafsirMuyassar}
                </h2>
                <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                  {lang === 'ar'
                    ? 'اختر الآية ونوع التفسير لقراءة المعنى بوضوح'
                    : 'Select any verse from this page and switch between Tafsir sources'}
                </p>
              </div>
            </div>

            <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15">
              <button
                type="button"
                onClick={() => setTafsirSlug('muyassar')}
                className={`min-h-[38px] px-4 rounded-full text-xs font-bold transition-colors ${
                  tafsirSlug === 'muyassar' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {copy.tafsirMuyassar}
              </button>
              <button
                type="button"
                onClick={() => setTafsirSlug('saadi')}
                className={`min-h-[38px] px-4 rounded-full text-xs font-bold transition-colors ${
                  tafsirSlug === 'saadi' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {copy.tafsirSaadi}
              </button>
            </div>
          </div>

          {verses.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="tafsir-verse-select" className="text-xs font-bold text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'الآية:' : 'Verse:'}
              </label>
              <select
                id="tafsir-verse-select"
                value={tafsirVerseKey || verses[0]?.verse_key || ''}
                onChange={(e) => setTafsirVerseKey(e.target.value)}
                className="min-h-[40px] px-3.5 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs font-semibold max-w-full"
              >
                {verses.map((v) => {
                  const sId = Number(v.verse_key.split(':')[0]);
                  const ch = chapterMap.get(sId);
                  return (
                    <option key={v.verse_key} value={v.verse_key}>
                      {ch?.name_arabic || sId} — {copy.ayah} {formatNumber(v.verse_number, lang)}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {activeTafsirVerse && (
            <p className="font-quran text-xl leading-[2.05] px-4 py-3 rounded-2xl bg-[#f7f3ea]/85 dark:bg-[#0b1411]/85 border border-[#c9a44c]/30" dir="rtl">
              {activeTafsirVerse.text_uthmani}{' '}
              <span className="text-sm font-ui font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                ({formatNumber(activeTafsirVerse.verse_number, lang)})
              </span>
            </p>
          )}

          <div className="rounded-2xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15 p-4 sm:p-5 space-y-2 min-h-[110px]">
            <p className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
              {tafsirContent?.resourceName || (tafsirSlug === 'saadi' ? copy.tafsirSaadi : copy.tafsirMuyassar)}
            </p>
            {loadingTafsir ? (
              <div className="flex items-center gap-2.5 text-xs text-[#5c6862] dark:text-[#98a69f] py-3">
                <Loader2 className="w-4 h-4 animate-spin text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'جارٍ تحميل التفسير...' : 'Loading Tafsir...'}</span>
              </div>
            ) : tafsirError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-2" role="alert">
                <span className="text-xs text-red-600 dark:text-red-400">
                  {lang === 'ar' ? 'تعذر تحميل التفسير حالياً.' : 'Unable to load Tafsir right now.'}
                </span>
                <button
                  type="button"
                  onClick={() => setTafsirRetryTick((n) => n + 1)}
                  className="min-h-[38px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold hover:bg-[#0a4e39]"
                >
                  {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            ) : (
              <p className="text-sm sm:text-base leading-[1.95] text-[#17211d] dark:text-[#ede7da]">
                {tafsirContent?.text || (lang === 'ar' ? 'اختر آية لعرض تفسيرها.' : 'Select a verse to read Tafsir.')}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Display & Comfortable Reading Settings */}
      {controlsOpen && (
        <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411]">
              <button
                type="button"
                onClick={() => setViewMode('page')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                  viewMode === 'page' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {copy.mushafPageMode}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('verse')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                  viewMode === 'verse' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {copy.mushafVerseMode}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTajweed(!tajweed)}
                className={`min-h-[40px] px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${
                  tajweed
                    ? 'border-[#c9a44c] bg-[#c9a44c]/15 text-[#8a681c] dark:text-[#d8b55f]'
                    : 'border-[#0f6b4f]/20 text-[#5c6862]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{copy.tajweedColors}</span>
              </button>

              <button
                type="button"
                onClick={() => setWarmPaper(!warmPaper)}
                className={`min-h-[40px] px-3.5 rounded-full border text-xs font-semibold ${
                  warmPaper
                    ? 'border-[#c9a44c]/60 bg-[#f7ebd2]/65 dark:bg-[#c9a44c]/15 text-[#785712] dark:text-[#d8b55f]'
                    : 'border-[#0f6b4f]/20 text-[#5c6862]'
                }`}
              >
                {lang === 'ar' ? 'قراءة مريحة' : 'Warm Paper'}
              </button>

              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="min-h-[40px] px-3.5 rounded-full border border-[#0f6b4f]/20 text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0f6b4f]/8"
                >
                  {theme === 'light' ? (
                    <Moon className="w-3.5 h-3.5 text-[#0f6b4f]" />
                  ) : (
                    <Sun className="w-3.5 h-3.5 text-[#c9a44c]" />
                  )}
                  <span>{theme === 'light' ? copy.darkMode : copy.lightMode}</span>
                </button>
              )}

              {/* Font size stepper */}
              <div className="flex items-center gap-1 border border-[#0f6b4f]/20 dark:border-[#c9a44c]/20 rounded-full px-1.5 py-1 bg-[#f7f3ea] dark:bg-[#0b1411]">
                <button
                  type="button"
                  aria-label={lang === 'ar' ? 'تصغير الخط' : 'Decrease font'}
                  onClick={() => updateFontSize(fontSize - 2)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#0f6b4f]/10"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold w-7 text-center tabular-nums">{fontSize}</span>
                <button
                  type="button"
                  aria-label={lang === 'ar' ? 'تكبير الخط' : 'Increase font'}
                  onClick={() => updateFontSize(fontSize + 2)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#0f6b4f]/10"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Line spacing control */}
              <div className="flex items-center gap-1 border border-[#0f6b4f]/20 dark:border-[#c9a44c]/20 rounded-full p-1 bg-[#f7f3ea] dark:bg-[#0b1411]">
                <span className="text-[11px] font-semibold text-[#5c6862] dark:text-[#98a69f] px-2">
                  {lang === 'ar' ? 'التباعد' : 'Spacing'}
                </span>
                {(
                  [
                    { val: 2.15, labelAr: 'مضغوط', labelEn: 'Tight' },
                    { val: 2.38, labelAr: 'متوسط', labelEn: 'Normal' },
                    { val: 2.7, labelAr: 'مريح', labelEn: 'Wide' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setLineSpacing(opt.val)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      lineSpacing === opt.val
                        ? 'bg-[#0f6b4f] text-white'
                        : 'text-[#5c6862] dark:text-[#98a69f]'
                    }`}
                  >
                    {lang === 'ar' ? opt.labelAr : opt.labelEn}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {tajweed && (
            <div className="pt-2 border-t border-[#0f6b4f]/10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[#5c6862] dark:text-[#98a69f]">
              <span>
                <span className="font-bold text-[#0f6b4f] dark:text-[#34d399]">●</span>{' '}
                {lang === 'ar' ? 'إخفاء وغنة' : 'Ikhafa / Ghunnah'}
              </span>
              <span>
                <span className="font-bold text-[#0284c7] dark:text-[#38bdf8]">●</span>{' '}
                {lang === 'ar' ? 'قلقلة' : 'Qalqalah'}
              </span>
              <span>
                <span className="font-bold text-[#b8860b] dark:text-[#e5b84b]">●</span>{' '}
                {lang === 'ar' ? 'مد طبيعي وجائز' : 'Madd'}
              </span>
              <span>
                <span className="font-bold text-[#b91c1c] dark:text-[#f87171]">●</span>{' '}
                {lang === 'ar' ? 'مد واجب ولازم' : 'Heavy Madd'}
              </span>
              <span>
                <span className="font-bold text-[#7e22ce] dark:text-[#c084fc]">●</span>{' '}
                {lang === 'ar' ? 'إقلاب' : 'Iqlab'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Quick Jump Modal */}
      {jumpOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={copy.jumpTo}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg max-h-[82vh] flex flex-col rounded-3xl crystal-card border border-[#0f6b4f]/20 dark:border-[#c9a44c]/25 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
                </span>
                <span>{copy.jumpTo}</span>
              </h3>
              <button
                type="button"
                onClick={() => setJumpOpen(false)}
                className="min-h-[36px] px-4 py-1.5 rounded-full text-xs font-semibold bg-[#f7f3ea] dark:bg-[#0b1411]"
              >
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411]">
              {(['surah', 'juz', 'page'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setJumpTab(tab)}
                  className={`min-h-[38px] rounded-full text-xs font-semibold transition-colors ${
                    jumpTab === tab ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                  }`}
                >
                  {tab === 'surah' ? copy.surahsTab : tab === 'juz' ? copy.juzsTab : copy.pagesTab}
                </button>
              ))}
            </div>

            {jumpTab === 'surah' && (
              <>
                <input
                  type="text"
                  value={surahFilter}
                  onChange={(e) => setSurahFilter(e.target.value)}
                  placeholder={lang === 'ar' ? 'ابحث باسم السورة أو رقمها...' : 'Filter by surah name or number...'}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs"
                />
                <div className="overflow-y-auto divide-y divide-[#0f6b4f]/10 max-h-[50vh]">
                  {filteredChapters.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChangePage(c.pages[0], c.id, 1);
                        setJumpOpen(false);
                      }}
                      className="w-full py-3 px-2 flex items-center justify-between text-start hover:bg-[#0f6b4f]/8 rounded-lg"
                    >
                      <div>
                        <p className="font-bold text-sm">
                          {c.id}. {lang === 'ar' ? c.name_arabic : c.name_simple}
                        </p>
                        <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                          {c.verses_count} {copy.ayah} · {copy.page} {c.pages[0]}
                        </p>
                      </div>
                      <span className="font-quran text-lg text-[#0f6b4f] dark:text-[#c9a44c]">{c.name_arabic}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {jumpTab === 'juz' && (
              <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-[50vh]">
                {JUZ_START_PAGES.map((startPage, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onChangePage(startPage);
                      setJumpOpen(false);
                    }}
                    className="p-3 rounded-xl border border-[#0f6b4f]/15 bg-[#f7f3ea] dark:bg-[#0b1411] hover:border-[#0f6b4f] text-center"
                  >
                    <p className="font-bold text-xs">
                      {copy.juz} {formatNumber(i + 1, lang)}
                    </p>
                    <p className="text-[11px] text-[#5c6862] tabular-nums">
                      {copy.page} {formatNumber(startPage, lang)}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {jumpTab === 'page' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const num = Math.max(1, Math.min(604, Number(pageInput) || 1));
                  onChangePage(num);
                  setJumpOpen(false);
                }}
                className="space-y-4 py-4"
              >
                <input
                  type="number"
                  min={1}
                  max={604}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-sm tabular-nums"
                />
                <button
                  type="submit"
                  className="w-full min-h-[44px] rounded-xl bg-[#0f6b4f] text-white text-sm font-semibold"
                >
                  {lang === 'ar' ? 'انتقال إلى الصفحة' : 'Go to Page'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <VerseSheet
        verse={selectedVerse}
        surahName={
          selectedVerse
            ? chapterMap.get(Number(selectedVerse.verse_key.split(':')[0]))?.name_arabic || ''
            : ''
        }
        lang={lang}
        existingBookmark={selectedVerse ? bookmarkMap.get(selectedVerse.verse_key) : undefined}
        onClose={() => setSelectedVerse(null)}
        onSaveBookmark={(color, note) => {
          if (selectedVerse) {
            onSaveBookmark(selectedVerse, color, note);
            setSelectedVerse(null);
          }
        }}
        onPlayVerse={(v) => {
          onPlayFromVerse(v);
          setSelectedVerse(null);
        }}
      />
    </div>
  );
};
