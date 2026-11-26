import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  Heart,
  Loader2,
  Pause,
  Play,
  Radio,
  Search,
  Star,
  X,
} from 'lucide-react';
import { AudioTrack, Chapter, FavoriteRadio, Language, RadioStation, Reciter, Verse } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import {
  fetchAyahAudioUrl,
  fetchChapterAyahAudioUrls,
  fetchQdcReciters,
  fetchVersesByChapter,
  matchReciterToQdcId,
  QdcReciter,
  stripArabicDiacritics,
} from '../services/quranApi';
import {
  buildSurahAudioUrl,
  fetchRadios,
  fetchReciters,
  getOfflineTracksMeta,
  OFFLINE_UPDATED_EVENT,
  OfflineTrackMeta,
  removeOfflineAudio,
  saveAudioOffline,
} from '../services/mp3QuranApi';
import { ReciterAvatar } from './ReciterAvatar';
import { readUserScoped, writeUserScoped } from '../utils/userStorage';

interface ListenViewProps {
  uid: string;
  lang: Language;
  chapters: Chapter[];
  activeTrack: AudioTrack | null;
  isPlaying: boolean;
  favoriteRadios: FavoriteRadio[];
  defaultReciterId: number;
  onPlayTrack: (track: AudioTrack) => void;
  onTogglePlayPause: () => void;
  onToggleFavoriteRadio: (radio: RadioStation) => void;
  onSelectDefaultReciter: (reciterId: number) => void;
  onOpenMushafPage?: (page: number) => void;
}

const FEATURED_KEYWORDS = [
  'العفاسي',
  'الحصري',
  'المنشاوي',
  'عبدالباسط',
  'المعيقلي',
  'السديس',
  'الدوسري',
  'الشريم',
  'Alafasy',
  'Husary',
  'Minshawi',
  'Basit',
  'Sudais',
  'Muaiqly',
];

const QUICK_SURAH_JUMPS = [
  { id: 1, ar: 'الفاتحة', en: 'Al-Fatihah' },
  { id: 2, ar: 'البقرة', en: 'Al-Baqarah' },
  { id: 18, ar: 'الكهف', en: 'Al-Kahf' },
  { id: 36, ar: 'يس', en: 'Ya-Sin' },
  { id: 55, ar: 'الرحمن', en: 'Ar-Rahman' },
  { id: 56, ar: 'الواقعة', en: 'Al-Waqiah' },
  { id: 67, ar: 'الملك', en: 'Al-Mulk' },
];

function normalizeSearch(value: string): string {
  return stripArabicDiacritics(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export const ListenView: React.FC<ListenViewProps> = ({
  uid,
  lang,
  chapters,
  activeTrack,
  isPlaying,
  favoriteRadios,
  defaultReciterId,
  onPlayTrack,
  onTogglePlayPause,
  onToggleFavoriteRadio,
  onSelectDefaultReciter,
  onOpenMushafPage,
}) => {
  const copy = t(lang);
  const [subTab, setSubTab] = useState<'reciters' | 'radios'>('reciters');
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [radios, setRadios] = useState<RadioStation[]>([]);
  const [qdcReciters, setQdcReciters] = useState<QdcReciter[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [surahQuery, setSurahQuery] = useState('');
  const [riwayaFilter, setRiwayaFilter] = useState('all');
  const [letterFilter, setLetterFilter] = useState('all');
  const [favRecitersOnly, setFavRecitersOnly] = useState(false);
  const [favRadiosOnly, setFavRadiosOnly] = useState(false);
  const [offlineSurahsOnly, setOfflineSurahsOnly] = useState(false);

  const [favoriteReciterIds, setFavoriteReciterIds] = useState<number[]>(() =>
    readUserScoped<number[]>(uid, 'fav_reciters', [])
  );

  // Unified Single Reciter Profile state
  const [enteredProfile, setEnteredProfile] = useState(false);
  const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
  const [selectedMoshafIdx, setSelectedMoshafIdx] = useState(0);
  const [profileSection, setProfileSection] = useState<'surahs' | 'ayahs'>('surahs');

  // Verses inside Reciter Profile ("الآيات التي قرأها القارئ")
  const [ayahSurahId, setAyahSurahId] = useState<number>(1);
  const [ayahSearch, setAyahSearch] = useState('');
  const [profileVerses, setProfileVerses] = useState<Verse[]>([]);
  const [ayahAudioMap, setAyahAudioMap] = useState<Record<string, string>>({});
  const [loadingAyahs, setLoadingAyahs] = useState(false);

  const [offlineList, setOfflineList] = useState<OfflineTrackMeta[]>(() => getOfflineTracksMeta());
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  // Reload per-account favorite reciters when active uid switches
  useEffect(() => {
    setFavoriteReciterIds(readUserScoped<number[]>(uid, 'fav_reciters', []));
  }, [uid]);

  useEffect(() => {
    writeUserScoped(uid, 'fav_reciters', favoriteReciterIds);
  }, [uid, favoriteReciterIds]);

  useEffect(() => {
    const syncOffline = () => setOfflineList(getOfflineTracksMeta());
    window.addEventListener(OFFLINE_UPDATED_EVENT, syncOffline);
    return () => window.removeEventListener(OFFLINE_UPDATED_EVENT, syncOffline);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchReciters(lang), fetchRadios(lang), fetchQdcReciters()])
      .then(([recData, radData, qdcData]) => {
        if (cancelled) return;
        setReciters(recData);
        setRadios(radData);
        setQdcReciters(qdcData);
        const def = recData.find((r) => r.id === defaultReciterId) || recData[0] || null;
        setSelectedReciter(def);
        setSelectedMoshafIdx(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang, defaultReciterId]);

  const matchedQdcId = useMemo(() => {
    if (!selectedReciter) return null;
    return matchReciterToQdcId(selectedReciter.name, qdcReciters);
  }, [selectedReciter, qdcReciters]);

  // Load Surah Ayahs & Audio URLs when user views the Ayahs tab inside Reciter Profile
  useEffect(() => {
    if (!enteredProfile || profileSection !== 'ayahs' || !selectedReciter) return;
    let cancelled = false;
    setLoadingAyahs(true);
    const recitationId = matchedQdcId || 7;

    Promise.all([
      fetchVersesByChapter(ayahSurahId, 1, 100),
      fetchChapterAyahAudioUrls(recitationId, ayahSurahId).catch(() => ({})),
    ])
      .then(([verseRes, audioMap]) => {
        if (cancelled) return;
        setProfileVerses(verseRes.verses || []);
        setAyahAudioMap(audioMap);
      })
      .finally(() => {
        if (!cancelled) setLoadingAyahs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enteredProfile, profileSection, selectedReciter, ayahSurahId, matchedQdcId]);

  const favReciterSet = useMemo(() => new Set(favoriteReciterIds), [favoriteReciterIds]);
  const favIds = useMemo(() => new Set(favoriteRadios.map((f) => f.radioId)), [favoriteRadios]);
  const offlineUrls = useMemo(() => new Set(offlineList.map((o) => o.url)), [offlineList]);

  const toggleFavoriteReciter = (id: number) => {
    setFavoriteReciterIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [id, ...prev]
    );
  };

  const openReciterProfile = (rec: Reciter) => {
    setSelectedReciter(rec);
    setSelectedMoshafIdx(0);
    setEnteredProfile(true);
    onSelectDefaultReciter(rec.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const featuredReciters = useMemo(() => {
    const picks: Reciter[] = [];
    for (const kw of FEATURED_KEYWORDS) {
      const found = reciters.find((r) => r.name.includes(kw) && !picks.some((p) => p.id === r.id));
      if (found) picks.push(found);
      if (picks.length >= 10) break;
    }
    return picks;
  }, [reciters]);

  const riwayaOptions = useMemo(() => {
    const set = new Set<string>();
    reciters.forEach((r) =>
      r.moshaf.forEach((m) => {
        const clean = m.name.split('-')[0].trim();
        if (clean) set.add(clean);
      })
    );
    return Array.from(set).slice(0, 14);
  }, [reciters]);

  const letterOptions = useMemo(() => {
    const set = new Set<string>();
    reciters.forEach((r) => {
      const ch = normalizeSearch(r.letter || r.name.charAt(0)).charAt(0).toUpperCase();
      if (ch) set.add(ch);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, lang));
  }, [reciters, lang]);

  const filteredReciters = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    const list = reciters.filter((r) => {
      if (favRecitersOnly && !favReciterSet.has(r.id)) return false;
      if (riwayaFilter !== 'all' && !r.moshaf.some((m) => m.name.includes(riwayaFilter))) return false;
      if (letterFilter !== 'all') {
        const rLetter = normalizeSearch(r.letter || r.name.charAt(0)).charAt(0).toUpperCase();
        if (rLetter !== letterFilter) return false;
      }
      if (!q) return true;
      const recNorm = normalizeSearch(r.name);
      const moshafMatches = r.moshaf.some((m) => normalizeSearch(m.name).includes(q));
      return recNorm.includes(q) || moshafMatches;
    });

    return [...list].sort((a, b) => {
      const aFav = favReciterSet.has(a.id) ? 0 : 1;
      const bFav = favReciterSet.has(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      if (q) {
        const aStarts = normalizeSearch(a.name).startsWith(q) ? 0 : 1;
        const bStarts = normalizeSearch(b.name).startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
      }
      return 0;
    });
  }, [reciters, searchQuery, riwayaFilter, letterFilter, favRecitersOnly, favReciterSet]);

  const filteredRadios = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    const list = radios.filter((r) => {
      if (favRadiosOnly && !favIds.has(r.id)) return false;
      if (!q) return true;
      return normalizeSearch(r.name).includes(q);
    });
    return [...list].sort((a, b) => {
      const aFav = favIds.has(a.id) ? 0 : 1;
      const bFav = favIds.has(b.id) ? 0 : 1;
      return aFav - bFav;
    });
  }, [radios, searchQuery, favRadiosOnly, favIds]);

  const selectedMoshaf = selectedReciter?.moshaf[selectedMoshafIdx] || selectedReciter?.moshaf[0] || null;

  const availableSurahIds = useMemo(() => {
    if (!selectedMoshaf?.surah_list) return chapters.map((c) => c.id);
    return selectedMoshaf.surah_list
      .split(',')
      .map((s) => Number(s.trim()))
      .filter(Boolean);
  }, [selectedMoshaf, chapters]);

  const filteredSurahIds = useMemo(() => {
    const q = normalizeSearch(surahQuery);
    return availableSurahIds.filter((surahId) => {
      if (offlineSurahsOnly && selectedMoshaf) {
        const url = buildSurahAudioUrl(selectedMoshaf, surahId);
        if (!offlineUrls.has(url)) return false;
      }
      if (!q) return true;
      if (String(surahId) === q || String(surahId).padStart(3, '0') === q) return true;
      const ch = chapters.find((c) => c.id === surahId);
      if (!ch) return false;
      const arNorm = normalizeSearch(ch.name_arabic);
      const enNorm = normalizeSearch(ch.name_simple);
      const cleanQ = q.replace(/^سوره\s+/, '').replace(/^سورة\s+/, '').replace(/^surah\s+/, '');
      return arNorm.includes(cleanQ) || `سوره ${arNorm}`.includes(q) || enNorm.includes(cleanQ);
    });
  }, [availableSurahIds, surahQuery, offlineSurahsOnly, selectedMoshaf, offlineUrls, chapters]);

  const filteredProfileVerses = useMemo(() => {
    const q = normalizeSearch(ayahSearch);
    if (!q) return profileVerses;
    return profileVerses.filter((v) => {
      if (String(v.verse_number) === q) return true;
      return normalizeSearch(v.text_uthmani).includes(q);
    });
  }, [profileVerses, ayahSearch]);

  const handleDownloadSurah = async (url: string, title: string, surahId: number) => {
    if (!selectedReciter) return;
    setDownloadingUrl(url);
    try {
      const ch = chapters.find((c) => c.id === surahId);
      await saveAudioOffline({
        url,
        title,
        subtitle: selectedReciter.name,
        savedAt: new Date().toISOString(),
        kind: 'surah',
        surahNumber: surahId,
        pageNumber: ch?.pages[0],
        reciterId: selectedReciter.id,
        reciterName: selectedReciter.name,
      });
    } catch {
      // ignore fetch error
    } finally {
      setDownloadingUrl(null);
    }
  };

  const handlePlayVerseInProfile = async (verse: Verse) => {
    if (!selectedReciter) return;
    const recitationId = matchedQdcId || 7;
    const url = ayahAudioMap[verse.verse_key] || (await fetchAyahAudioUrl(verse.verse_key, recitationId));
    if (activeTrack?.url === url) {
      onTogglePlayPause();
      return;
    }
    const surahId = Number(verse.verse_key.split(':')[0]);
    const ch = chapters.find((c) => c.id === surahId);
    const reciterLabel = matchedQdcId
      ? selectedReciter.name
      : `${selectedReciter.name} · ${lang === 'ar' ? 'تلاوة آية' : 'Verse Audio'}`;

    onPlayTrack({
      id: `ayah_${recitationId}_${verse.verse_key}`,
      type: 'ayah',
      title: `${ch ? (lang === 'ar' ? `سورة ${ch.name_arabic}` : ch.name_simple) : surahId} · ${copy.ayah} ${formatNumber(verse.verse_number, lang)}`,
      subtitle: reciterLabel,
      url,
      surahNumber: surahId,
      ayahNumber: verse.verse_number,
      verseKey: verse.verse_key,
      verseText: verse.text_uthmani,
      pageNumber: verse.page_number,
      reciterId: selectedReciter.id,
      reciterName: selectedReciter.name,
    });
  };

  const handleDownloadVerseInProfile = async (verse: Verse) => {
    if (!selectedReciter) return;
    const recitationId = matchedQdcId || 7;
    const url = ayahAudioMap[verse.verse_key] || (await fetchAyahAudioUrl(verse.verse_key, recitationId));
    setDownloadingUrl(url);
    try {
      const surahId = Number(verse.verse_key.split(':')[0]);
      const ch = chapters.find((c) => c.id === surahId);
      await saveAudioOffline({
        url,
        title: `${ch ? (lang === 'ar' ? `سورة ${ch.name_arabic}` : ch.name_simple) : surahId} · ${copy.ayah} ${formatNumber(verse.verse_number, lang)}`,
        subtitle: selectedReciter.name,
        savedAt: new Date().toISOString(),
        kind: 'ayah',
        surahNumber: surahId,
        ayahNumber: verse.verse_number,
        verseKey: verse.verse_key,
        verseText: verse.text_uthmani,
        pageNumber: verse.page_number,
        reciterId: selectedReciter.id,
        reciterName: selectedReciter.name,
      });
    } catch {
      // ignore download failure
    } finally {
      setDownloadingUrl(null);
    }
  };

  // Unified Single Reciter Profile View when user clicks/enters a reciter
  if (enteredProfile && selectedReciter && selectedMoshaf) {
    const isFav = favReciterSet.has(selectedReciter.id);
    const activeChapter = chapters.find((c) => c.id === ayahSurahId);
    return (
      <div className="space-y-5">
        {/* Back Strip + Unified Reciter Profile Header */}
        <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/25 p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setEnteredProfile(false)}
              className="min-h-[40px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-bold flex items-center gap-2 hover:bg-[#0f6b4f]/10 transition-colors"
            >
              {lang === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{lang === 'ar' ? 'جميع القراء' : 'All Reciters'}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleFavoriteReciter(selectedReciter.id)}
              className={`min-h-[40px] px-4 rounded-full border text-xs font-bold flex items-center gap-2 transition-colors ${
                isFav
                  ? 'bg-[#c9a44c]/20 border-[#c9a44c] text-[#7c5c16] dark:text-[#e6c46e]'
                  : 'border-[#0f6b4f]/20 hover:border-[#c9a44c]'
              }`}
            >
              <Star className={`w-4 h-4 ${isFav ? 'fill-[#c9a44c] text-[#c9a44c]' : ''}`} />
              <span>{isFav ? (lang === 'ar' ? 'في المفضلة' : 'Favorited') : lang === 'ar' ? 'إضافة للمفضلة' : 'Favorite'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-[#0f6b4f]/10">
            <div className="flex items-center gap-4 min-w-0">
              <ReciterAvatar name={selectedReciter.name} reciterId={selectedReciter.id} size="xl" active />
              <div className="min-w-0 space-y-1">
                <h1 className="text-xl sm:text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c] truncate">
                  {selectedReciter.name}
                </h1>
                <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                  {selectedMoshaf.name} · {formatNumber(availableSurahIds.length, lang)} {copy.surah}
                </p>
                {selectedReciter.moshaf.length > 1 && (
                  <select
                    value={selectedMoshafIdx}
                    onChange={(e) => setSelectedMoshafIdx(Number(e.target.value))}
                    className="mt-1 min-h-[36px] px-3 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs font-semibold"
                  >
                    {selectedReciter.moshaf.map((m, idx) => (
                      <option key={m.id} value={idx}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Unified Two-Tab Toggle Inside Single Reciter Profile */}
            <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15">
              <button
                type="button"
                onClick={() => setProfileSection('surahs')}
                className={`min-h-[40px] px-4 rounded-full text-xs font-bold transition-colors ${
                  profileSection === 'surahs' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {lang === 'ar' ? `السور الكاملة (${formatNumber(availableSurahIds.length, lang)})` : `Full Surahs (${availableSurahIds.length})`}
              </button>
              <button
                type="button"
                onClick={() => setProfileSection('ayahs')}
                className={`min-h-[40px] px-4 rounded-full text-xs font-bold transition-colors ${
                  profileSection === 'ayahs' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {lang === 'ar' ? 'الآيات المقروءة (آية بآية)' : 'Recited Verses (Ayahs)'}
              </button>
            </div>
          </div>
        </div>

        {/* Section A: Full Surahs inside Unified Reciter Profile */}
        {profileSection === 'surahs' ? (
          <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-[#5c6862] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={surahQuery}
                  onChange={(e) => setSurahQuery(e.target.value)}
                  placeholder={lang === 'ar' ? 'ابحث في سور القارئ بالاسم أو الرقم...' : 'Filter surahs...'}
                  className="w-full min-h-[42px] ps-9 pe-8 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
                />
                {surahQuery && (
                  <button
                    type="button"
                    onClick={() => setSurahQuery('')}
                    aria-label="Clear search"
                    className="w-6 h-6 rounded-full flex items-center justify-center absolute top-1/2 -translate-y-1/2 end-2 text-[#5c6862]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOfflineSurahsOnly((v) => !v)}
                className={`min-h-[42px] px-4 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${
                  offlineSurahsOnly
                    ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white'
                    : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border-[#0f6b4f]/20'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'المحفوظة فقط' : 'Saved Only'}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {QUICK_SURAH_JUMPS.map((item) => {
                const label = lang === 'ar' ? item.ar : item.en;
                const active = surahQuery === label;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSurahQuery((p) => (p === label ? '' : label))}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white'
                        : 'bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 border-[#0f6b4f]/15'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSurahIds.map((surahId) => {
                const ch = chapters.find((c) => c.id === surahId);
                const url = buildSurahAudioUrl(selectedMoshaf, surahId);
                const isThisTrack = activeTrack?.url === url;
                const isSaved = offlineUrls.has(url);
                const title = ch
                  ? lang === 'ar'
                    ? `سورة ${ch.name_arabic}`
                    : `Surah ${ch.name_simple}`
                  : `Surah ${surahId}`;

                return (
                  <div
                    key={surahId}
                    className={`rounded-2xl border p-3 flex items-center justify-between gap-2 transition-colors ${
                      isThisTrack
                        ? 'border-[#0f6b4f] bg-[#0f6b4f]/12'
                        : 'border-[#0f6b4f]/12 bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 hover:border-[#0f6b4f]/35'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isThisTrack) onTogglePlayPause();
                        else
                          onPlayTrack({
                            id: `${selectedReciter.id}_${surahId}`,
                            type: 'surah',
                            title,
                            subtitle: selectedReciter.name,
                            url,
                            surahNumber: surahId,
                            reciterId: selectedReciter.id,
                            reciterName: selectedReciter.name,
                            pageNumber: ch?.pages[0],
                            moshafServer: selectedMoshaf.server,
                          });
                      }}
                      className="flex items-center gap-3 text-start flex-1 min-w-0 min-h-[44px]"
                    >
                      <span className="w-10 h-10 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center shrink-0">
                        {isThisTrack && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-xs truncate">{title}</p>
                        <p className="text-[10px] text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                          {String(surahId).padStart(3, '0')}
                          {ch ? ` · ${formatNumber(ch.verses_count, lang)} ${copy.ayah}` : ''}
                        </p>
                      </div>
                    </button>

                    {isSaved ? (
                      <button
                        type="button"
                        title={copy.downloaded}
                        onClick={() => void removeOfflineAudio(url)}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-[#0f6b4f]/15 text-[#0f6b4f] dark:text-[#c9a44c]"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title={copy.downloadOffline}
                        disabled={downloadingUrl === url}
                        onClick={() => void handleDownloadSurah(url, title, surahId)}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-[#5c6862] hover:bg-[#0f6b4f]/10 hover:text-[#0f6b4f]"
                      >
                        {downloadingUrl === url ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Section B: Ayahs Recited by This Reciter inside Single Reciter Profile */
          <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <select
                  value={ayahSurahId}
                  onChange={(e) => setAyahSurahId(Number(e.target.value))}
                  className="min-h-[42px] px-4 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs font-bold"
                >
                  {availableSurahIds.map((id) => {
                    const ch = chapters.find((c) => c.id === id);
                    return (
                      <option key={id} value={id}>
                        {formatNumber(id, lang)}. {ch ? (lang === 'ar' ? ch.name_arabic : ch.name_simple) : id}
                      </option>
                    );
                  })}
                </select>

                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-[#5c6862] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                  <input
                    type="text"
                    value={ayahSearch}
                    onChange={(e) => setAyahSearch(e.target.value)}
                    placeholder={
                      lang === 'ar' ? 'ابحث عن رقم الآية أو كلماتها...' : 'Search verse number or words...'
                    }
                    className="w-full min-h-[42px] ps-9 pe-4 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
                  />
                </div>
              </div>

              <span className="text-[11px] font-semibold text-[#5c6862] dark:text-[#98a69f]">
                {matchedQdcId
                  ? lang === 'ar'
                    ? `تلاوة آية بآية بصوت ${selectedReciter.name}`
                    : `Verse-by-verse audio by ${selectedReciter.name}`
                  : lang === 'ar'
                  ? `آيات ${activeChapter ? `سورة ${activeChapter.name_arabic}` : ''} · تحميل فوري للمكتبة`
                  : 'Instant verse playback & library save'}
              </span>
            </div>

            {loadingAyahs ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-xs text-[#5c6862] dark:text-[#98a69f]">
                <Loader2 className="w-8 h-8 animate-spin text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'جاري تحميل آيات السورة...' : 'Loading verses...'}</span>
              </div>
            ) : (
              <div className="space-y-3" dir="rtl">
                {filteredProfileVerses.map((v) => {
                  const vUrl = ayahAudioMap[v.verse_key];
                  const isThisVerse =
                    activeTrack?.verseKey === v.verse_key &&
                    (!vUrl || activeTrack?.url === vUrl);
                  const isSaved = Boolean(vUrl && offlineUrls.has(vUrl));

                  return (
                    <div
                      key={v.verse_key}
                      className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                        isThisVerse
                          ? 'border-[#0f6b4f] bg-[#0f6b4f]/10'
                          : 'border-[#0f6b4f]/12 bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75'
                      }`}
                    >
                      <p className="font-quran text-xl sm:text-2xl leading-[2.1]">{v.text_uthmani}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#0f6b4f]/10">
                        <span className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
                          {activeChapter?.name_arabic || v.verse_key} · {copy.ayah}{' '}
                          {formatNumber(v.verse_number, lang)}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handlePlayVerseInProfile(v)}
                            className="min-h-[38px] px-3.5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0a4e39]"
                          >
                            {isThisVerse && isPlaying ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            <span>{lang === 'ar' ? 'استماع' : 'Play'}</span>
                          </button>

                          {isSaved && vUrl ? (
                            <button
                              type="button"
                              onClick={() => void removeOfflineAudio(vUrl)}
                              className="min-h-[38px] px-3.5 rounded-full bg-[#0f6b4f]/14 text-[#0f6b4f] dark:text-[#c9a44c] text-xs font-semibold flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{lang === 'ar' ? 'في المكتبة' : 'In Library'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={Boolean(vUrl && downloadingUrl === vUrl)}
                              onClick={() => void handleDownloadVerseInProfile(v)}
                              className="min-h-[38px] px-3.5 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0f6b4f]/10"
                            >
                              {vUrl && downloadingUrl === vUrl ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5 text-[#0f6b4f] dark:text-[#c9a44c]" />
                              )}
                              <span>{lang === 'ar' ? 'حفظ للمكتبة' : 'Save'}</span>
                            </button>
                          )}

                          {onOpenMushafPage && (
                            <button
                              type="button"
                              onClick={() => onOpenMushafPage(v.page_number)}
                              title={lang === 'ar' ? 'فتح في المصحف' : 'Open in Mushaf'}
                              className="w-9 h-9 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10 text-[#0f6b4f] dark:text-[#c9a44c]"
                            >
                              <BookOpen className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Controls */}
      <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex p-1 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/10">
            <button
              type="button"
              onClick={() => setSubTab('reciters')}
              className={`min-h-[40px] px-4 rounded-full text-xs font-semibold transition-colors ${
                subTab === 'reciters' ? 'bg-[#0f6b4f] text-white shadow-xs' : 'text-[#5c6862] dark:text-[#98a69f]'
              }`}
            >
              {copy.reciters} ({formatNumber(reciters.length, lang)})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('radios')}
              className={`min-h-[40px] px-4 rounded-full text-xs font-semibold transition-colors ${
                subTab === 'radios' ? 'bg-[#0f6b4f] text-white shadow-xs' : 'text-[#5c6862] dark:text-[#98a69f]'
              }`}
            >
              {copy.radios} ({formatNumber(radios.length, lang)})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-2xl">
            <div className="relative flex-1 min-w-[210px]">
              <Search className="w-4 h-4 text-[#5c6862] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  subTab === 'reciters'
                    ? lang === 'ar'
                      ? 'ابحث عن القارئ أو الرواية (بدون همزة أو تشكيل)...'
                      : 'Search reciter or riwaya...'
                    : lang === 'ar'
                    ? 'ابحث عن اسم الإذاعة...'
                    : 'Search radio station...'
                }
                className="w-full min-h-[42px] ps-10 pe-9 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="w-7 h-7 rounded-full flex items-center justify-center absolute top-1/2 -translate-y-1/2 end-1.5 text-[#5c6862] hover:bg-[#0f6b4f]/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {subTab === 'reciters' ? (
              <>
                <button
                  type="button"
                  onClick={() => setFavRecitersOnly((v) => !v)}
                  className={`min-h-[42px] px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    favRecitersOnly
                      ? 'bg-[#c9a44c] border-[#c9a44c] text-[#17211d]'
                      : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border-[#0f6b4f]/20 hover:border-[#c9a44c]'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${favRecitersOnly ? 'fill-current' : 'text-[#c9a44c]'}`} />
                  <span>
                    {lang === 'ar' ? 'المفضلون' : 'Favorites'} ({formatNumber(favoriteReciterIds.length, lang)})
                  </span>
                </button>
                <select
                  value={riwayaFilter}
                  onChange={(e) => setRiwayaFilter(e.target.value)}
                  className="min-h-[42px] px-4 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs font-semibold"
                >
                  <option value="all">{copy.allRiwayat}</option>
                  {riwayaOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setFavRadiosOnly((v) => !v)}
                className={`min-h-[42px] px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  favRadiosOnly
                    ? 'bg-[#c9a44c] border-[#c9a44c] text-[#17211d]'
                    : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border-[#0f6b4f]/20 hover:border-[#c9a44c]'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${favRadiosOnly ? 'fill-current' : 'text-[#c9a44c]'}`} />
                <span>
                  {lang === 'ar' ? 'المفضلة فقط' : 'Favorites Only'} ({formatNumber(favoriteRadios.length, lang)})
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Alphabet Quick Filter Strip for Reciters */}
        {!loading && subTab === 'reciters' && letterOptions.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
            <button
              type="button"
              onClick={() => setLetterFilter('all')}
              className={`min-w-[36px] h-8 px-3 rounded-full text-[11px] font-bold shrink-0 transition-colors ${
                letterFilter === 'all'
                  ? 'bg-[#0f6b4f] text-white'
                  : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/15 text-[#5c6862] dark:text-[#98a69f]'
              }`}
            >
              {lang === 'ar' ? 'الكل' : 'All'}
            </button>
            {letterOptions.map((ltr) => (
              <button
                key={ltr}
                type="button"
                onClick={() => setLetterFilter((prev) => (prev === ltr ? 'all' : ltr))}
                className={`w-8 h-8 rounded-full text-xs font-bold shrink-0 transition-colors ${
                  letterFilter === ltr
                    ? 'bg-[#0f6b4f] text-white'
                    : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/15 text-[#5c6862] dark:text-[#98a69f] hover:border-[#c9a44c]'
                }`}
              >
                {ltr}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Featured Reciters Quick Strip with Portraits */}
      {!loading && subTab === 'reciters' && featuredReciters.length > 0 && (
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
          {featuredReciters.map((rec) => {
            const active = selectedReciter?.id === rec.id;
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => openReciterProfile(rec)}
                className={`min-h-[46px] ps-2 pe-4 py-1 rounded-full border text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-2.5 transition-all ${
                  active
                    ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white shadow-sm'
                    : 'crystal-card border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 hover:border-[#c9a44c]'
                }`}
              >
                <ReciterAvatar name={rec.name} reciterId={rec.id} size="sm" active={active} />
                <span>{rec.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-sm text-[#5c6862] dark:text-[#98a69f]">
          <div className="w-12 h-12 rounded-full border-4 border-[#0f6b4f]/15 border-t-[#0f6b4f] dark:border-[#c9a44c]/20 dark:border-t-[#c9a44c] animate-spin" />
          <span>{lang === 'ar' ? 'جاري تحميل المكتبة الصوتية...' : 'Loading audio library...'}</span>
        </div>
      ) : subTab === 'reciters' ? (
        <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between px-1 pb-2 border-b border-[#0f6b4f]/10 text-xs font-semibold text-[#5c6862] dark:text-[#98a69f]">
            <span>
              {lang === 'ar'
                ? `اختر قارئاً للدخول إلى ملفه (السور + الآيات المقروءة) · ${formatNumber(filteredReciters.length, lang)} قارئ`
                : `Select a reciter to open their unified profile · ${filteredReciters.length} reciters`}
            </span>
            {(searchQuery || riwayaFilter !== 'all' || letterFilter !== 'all' || favRecitersOnly) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setRiwayaFilter('all');
                  setLetterFilter('all');
                  setFavRecitersOnly(false);
                }}
                className="text-[#0f6b4f] dark:text-[#c9a44c] hover:underline"
              >
                {lang === 'ar' ? 'إعادة ضبط البحث' : 'Reset filters'}
              </button>
            )}
          </div>

          {filteredReciters.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'لا يوجد قارئ مطابق لبحثك الحالي.' : 'No matching reciters found.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredReciters.slice(0, 260).map((reciter) => {
                const active = selectedReciter?.id === reciter.id;
                const isFav = favReciterSet.has(reciter.id);
                return (
                  <div
                    key={reciter.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 transition-all ${
                      active
                        ? 'border-[#0f6b4f] bg-[#0f6b4f]/10'
                        : 'border-[#0f6b4f]/12 bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 hover:border-[#c9a44c]/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openReciterProfile(reciter)}
                      className="flex-1 min-w-0 min-h-[48px] text-start flex items-center gap-3"
                    >
                      <ReciterAvatar name={reciter.name} reciterId={reciter.id} size="md" active={active} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{reciter.name}</p>
                        <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f] truncate">
                          {reciter.moshaf[0]?.name || 'حفص عن عاصم'} ·{' '}
                          {formatNumber(reciter.moshaf[0]?.surah_total || 114, lang)} {copy.surah}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFavoriteReciter(reciter.id)}
                      aria-label={lang === 'ar' ? 'إضافة للمفضلة' : 'Favorite reciter'}
                      className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#0f6b4f]/10 shrink-0"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          isFav ? 'fill-[#c9a44c] text-[#c9a44c]' : 'text-[#5c6862]/60'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredRadios.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 rounded-2xl crystal-card border border-[#0f6b4f]/15 p-10 text-center space-y-2">
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'لا توجد إذاعات مطابقة لبحثك.' : 'No matching radio stations found.'}
              </p>
            </div>
          ) : (
            filteredRadios.map((radio) => {
              const isFav = favIds.has(radio.id);
              const isThis = activeTrack?.url === radio.url;
              return (
                <div
                  key={radio.id}
                  className={`rounded-2xl crystal-card border p-4 flex items-center justify-between gap-3 ${
                    isThis ? 'border-[#0f6b4f] bg-[#0f6b4f]/10' : 'border-[#0f6b4f]/15 dark:border-[#c9a44c]/20'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isThis) onTogglePlayPause();
                      else
                        onPlayTrack({
                          id: `radio_${radio.id}`,
                          type: 'radio',
                          title: radio.name,
                          subtitle: copy.radios,
                          url: radio.url,
                        });
                    }}
                    className="flex items-center gap-3 text-start flex-1 min-w-0 min-h-[44px]"
                  >
                    <span className="w-10 h-10 rounded-full bg-[#0f6b4f]/14 text-[#0f6b4f] dark:text-[#c9a44c] flex items-center justify-center shrink-0">
                      {isThis && isPlaying ? <Pause className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="text-xs font-bold truncate">{radio.name}</span>
                      {isThis && isPlaying && (
                        <span className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
                          <span className="w-0.5 h-2 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] eq-bar" />
                          <span className="w-0.5 h-3 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] eq-bar" style={{ animationDelay: '160ms' }} />
                          <span className="w-0.5 h-2 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] eq-bar" style={{ animationDelay: '320ms' }} />
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={copy.favorites}
                    onClick={() => onToggleFavoriteRadio(radio)}
                    className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#0f6b4f]/10 shrink-0"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isFav ? 'fill-[#c9a44c] text-[#c9a44c]' : 'text-[#5c6862]'
                      }`}
                    />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
