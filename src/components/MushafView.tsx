import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Compass, Headphones, Minus, Plus, Sparkles } from 'lucide-react';
import { Chapter, HighlightColor, Language, MushafViewMode, Verse, VerseBookmark } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import { fetchVersesByPage, parseTajweedSegments } from '../services/quranApi';
import { VerseSheet } from './VerseSheet';

interface MushafViewProps {
  lang: Language;
  chapters: Chapter[];
  currentPage: number;
  bookmarks: VerseBookmark[];
  activePlayingVerseKey?: string | null;
  onChangePage: (page: number, firstSurah?: number, firstAyah?: number) => void;
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

export const MushafView: React.FC<MushafViewProps> = ({
  lang,
  chapters,
  currentPage,
  bookmarks,
  activePlayingVerseKey,
  onChangePage,
  onSaveBookmark,
  onPlayFromVerse,
  onPlaySurahFromMushaf,
}) => {
  const copy = t(lang);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<MushafViewMode>('page');
  const [tajweed, setTajweed] = useState(true);
  const [fontSize, setFontSize] = useState(26);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpTab, setJumpTab] = useState<'surah' | 'juz' | 'page'>('surah');
  const [surahFilter, setSurahFilter] = useState('');
  const [selectedVerse, setSelectedVerse] = useState<Verse | null>(null);
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [warmPaper, setWarmPaper] = useState(true);
  const activeVerseRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setPageInput(String(currentPage));
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchVersesByPage(currentPage)
      .then((data) => {
        if (!cancelled) {
          setVerses(data);
          if (data[0]) {
            const surahNum = Number(data[0].verse_key.split(':')[0]);
            onChangePage(currentPage, surahNum, data[0].verse_number);
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
                ? 'هذه الصفحة غير محفوظة محلياً بعد. يمكنك تحميل المصحف كاملاً من «حسابي ← الوصول دون إنترنت» عند عودة الاتصال.'
                : 'This page is not cached offline yet. Download the full Mushaf from Profile -> Offline Reading when online.'
            );
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load page');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  useEffect(() => {
    if (activePlayingVerseKey && activeVerseRef.current) {
      activeVerseRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activePlayingVerseKey]);

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

  return (
    <div className="space-y-4">
      {/* Mushaf Toolbar */}
      <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setJumpOpen(true)}
            className="min-h-[42px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-2 hover:bg-[#0a4e39] transition-colors"
          >
            <Compass className="w-4 h-4" />
            <span>
              {primaryChapter ? (lang === 'ar' ? primaryChapter.name_arabic : primaryChapter.name_simple) : copy.jumpTo}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onPlaySurahFromMushaf(primarySurahId)}
            className="min-h-[42px] px-4 rounded-full border border-[#c9a44c]/55 bg-[#c9a44c]/12 text-[#17211d] dark:text-[#ede7da] text-xs font-semibold flex items-center gap-2 hover:bg-[#c9a44c]/25 transition-colors"
          >
            <Headphones className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
            <span>{lang === 'ar' ? 'استماع للسورة' : 'Listen Surah'}</span>
          </button>

          <div className="text-xs text-[#5c6862] dark:text-[#98a69f] tabular-nums px-1">
            <span>
              {copy.page} {formatNumber(currentPage, lang)} / {formatNumber(604, lang)}
            </span>
            <span aria-hidden="true" className="mx-1.5">·</span>
            <span>
              {copy.juz} {formatNumber(currentJuz, lang)}
            </span>
            <span aria-hidden="true" className="mx-1.5 hidden sm:inline">·</span>
            <span className="hidden sm:inline">
              {lang === 'ar' ? 'الحزب' : 'Hizb'} {formatNumber(currentHizb, lang)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          <button
            type="button"
            onClick={() => setTajweed(!tajweed)}
            className={`min-h-[38px] px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
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
            title={lang === 'ar' ? 'ورق المصحف الدافئ' : 'Warm Mushaf Paper'}
            className={`min-h-[38px] px-3.5 rounded-full border text-xs font-semibold transition-colors ${
              warmPaper
                ? 'border-[#c9a44c]/60 bg-[#f7ebd2]/65 dark:bg-[#c9a44c]/15 text-[#785712] dark:text-[#d8b55f]'
                : 'border-[#0f6b4f]/20 text-[#5c6862]'
            }`}
          >
            {lang === 'ar' ? 'ورق دافئ' : 'Warm'}
          </button>

          <div className="flex items-center gap-1 border border-[#0f6b4f]/20 dark:border-[#c9a44c]/20 rounded-full px-1.5 py-1 bg-[#f7f3ea] dark:bg-[#0b1411]">
            <button
              type="button"
              aria-label="Decrease font"
              onClick={() => setFontSize((s) => Math.max(18, s - 2))}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#0f6b4f]/10"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-semibold w-7 text-center tabular-nums">{fontSize}</span>
            <button
              type="button"
              aria-label="Increase font"
              onClick={() => setFontSize((s) => Math.min(40, s + 2))}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#0f6b4f]/10"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tajweed Legend */}
      {tajweed && (
        <div className="px-4 py-2 rounded-2xl crystal-card border border-[#0f6b4f]/12 dark:border-[#c9a44c]/18 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[#5c6862] dark:text-[#98a69f]">
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

      {/* Mushaf Page Canvas with Madina Double-Border Frame */}
      <div
        className={`rounded-3xl crystal-card border-2 border-[#c9a44c]/45 p-2 sm:p-3 ${
          tajweed ? 'tajweed-enabled' : ''
        } ${warmPaper ? 'bg-[#fcf5e5]/90 dark:bg-[#14221c]/90' : ''}`}
      >
        <div className="rounded-2xl border border-[#c9a44c]/25 p-4 sm:p-8 space-y-5">
          {/* 604-Page Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[#5c6862] dark:text-[#98a69f] tabular-nums">
              <span>
                {lang === 'ar' ? 'تقدم القراءة في المصحف' : 'Mushaf Progress'} · {mushafProgressPct}%
              </span>
              <span>
                {copy.page} {formatNumber(currentPage, lang)} / {formatNumber(604, lang)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#0f6b4f]/12 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] transition-all duration-300"
                style={{ width: `${mushafProgressPct}%` }}
              />
            </div>
          </div>
          {loading ? (
            <div className="py-24 text-center text-sm text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar' ? 'جاري تحميل صفحة المصحف...' : 'Loading Mushaf page...'}
            </div>
          ) : error ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => onChangePage(currentPage)}
                className="px-4 py-2 rounded-xl bg-[#0f6b4f] text-white text-xs font-semibold"
              >
                {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
              </button>
            </div>
          ) : viewMode === 'page' ? (
            <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
              <div
                className="font-quran leading-[2.3] text-justify tracking-normal"
                style={{ fontSize: `${fontSize}px` }}
              >
                {verses.map((v, idx) => {
                  const surahId = Number(v.verse_key.split(':')[0]);
                  const ch = chapterMap.get(surahId);
                  const isFirstVerseOfSurah = v.verse_number === 1;
                  const bm = bookmarkMap.get(v.verse_key);
                  const isPlaying = activePlayingVerseKey === v.verse_key;
                  return (
                    <React.Fragment key={v.verse_key}>
                      {isFirstVerseOfSurah && (
                        <div className={`my-5 ${idx === 0 ? 'mt-0' : ''}`}>
                          <div className="rounded-2xl surah-ornate-banner border border-[#c9a44c]/65 py-3 px-5 flex flex-wrap items-center justify-between gap-3">
                            <span className="font-quran text-xl sm:text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                              سورة {ch?.name_arabic || surahId}
                            </span>
                            <div className="flex items-center gap-3">
                              {ch && (
                                <span className="font-ui text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                                  {ch.revelation_place === 'makkah' ? 'مكية' : 'مدنية'} ·{' '}
                                  {ch.verses_count.toLocaleString('ar-EG')} آية
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => onPlaySurahFromMushaf(surahId)}
                                aria-label={lang === 'ar' ? 'استماع للسورة' : 'Listen Surah'}
                                className="w-8 h-8 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center hover:bg-[#0a4e39] transition-colors"
                              >
                                <Headphones className="w-3.5 h-3.5" />
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
                        ref={isPlaying ? (el) => { activeVerseRef.current = el; } : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedVerse(v)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedVerse(v)}
                        className={`cursor-pointer px-1 transition-colors hover:bg-[#c9a44c]/20 ${highlightBgClass(
                          bm?.highlightColor
                        )} ${isPlaying ? 'ring-2 ring-[#0f6b4f] rounded-md bg-[#0f6b4f]/15' : ''}`}
                      >
                        {renderVerseContent(v)}
                        <span className="inline-flex items-center justify-center mx-1.5 text-[0.68em] font-ui font-bold text-[#0f6b4f] dark:text-[#c9a44c] border border-[#c9a44c]/60 rounded-full px-2 py-0.5 align-middle">
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
                return (
                  <div
                    key={v.verse_key}
                    ref={isPlaying ? (el) => { activeVerseRef.current = el; } : undefined}
                    onClick={() => setSelectedVerse(v)}
                    className={`cursor-pointer rounded-2xl border border-[#0f6b4f]/12 dark:border-[#c9a44c]/15 p-4 sm:p-5 transition-colors hover:border-[#0f6b4f]/40 ${highlightBgClass(
                      bm?.highlightColor
                    )} ${isPlaying ? 'ring-2 ring-[#0f6b4f] bg-[#0f6b4f]/8' : ''}`}
                  >
                    <div className="flex items-center justify-between text-xs text-[#5c6862] dark:text-[#98a69f] mb-2">
                      <span>
                        {ch?.name_arabic} · {copy.ayah} {v.verse_number.toLocaleString('ar-EG')}
                      </span>
                      {bm?.note && <span className="text-[#0f6b4f] dark:text-[#c9a44c] font-semibold">★ ملاحظة</span>}
                    </div>
                    <p className="font-quran leading-[2.1]" style={{ fontSize: `${fontSize}px` }}>
                      {renderVerseContent(v)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Page Turn Controls */}
          <div className="mt-6 pt-4 border-t border-[#0f6b4f]/10 dark:border-[#c9a44c]/15 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onChangePage(currentPage - 1)}
              className="min-h-[44px] px-5 rounded-full border border-[#0f6b4f]/20 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 hover:bg-[#0f6b4f]/8 transition-colors"
            >
              {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              <span>{lang === 'ar' ? 'الصفحة السابقة' : 'Previous Page'}</span>
            </button>

            <span className="text-xs font-semibold text-[#5c6862] dark:text-[#98a69f] tabular-nums">
              {formatNumber(currentPage, lang)} / {formatNumber(604, lang)}
            </span>

            <button
              type="button"
              disabled={currentPage >= 604}
              onClick={() => onChangePage(currentPage + 1)}
              className="min-h-[44px] px-5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 hover:bg-[#0a4e39] transition-colors"
            >
              <span>{lang === 'ar' ? 'الصفحة التالية' : 'Next Page'}</span>
              {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Jump Modal */}
      {jumpOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
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
                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#f7f3ea] dark:bg-[#0b1411]"
              >
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411]">
              {(['surah', 'juz', 'page'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setJumpTab(tab)}
                  className={`min-h-[38px] rounded-lg text-xs font-semibold ${
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
