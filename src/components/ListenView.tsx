import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  Headphones,
  Heart,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Star,
  X,
} from 'lucide-react';
import {
  AudioTrack,
  Chapter,
  FavoriteRadio,
  Language,
  LastListenedInfo,
  Moshaf,
  RadioStation,
  Reciter,
  Verse,
} from '../types/nour';
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
  categorizeRadio,
  extractRadioReciterHint,
  fetchRadios,
  fetchReciters,
  getOfflineTracksMeta,
  OFFLINE_UPDATED_EVENT,
  OfflineTrackMeta,
  RadioCategory,
  removeOfflineAudio,
  saveAudioOffline,
} from '../services/mp3QuranApi';
import { applyReciterDocumentMeta, applyRouteDocumentMeta } from '../utils/seoRoutes';
import { readUserScoped, writeUserScoped } from '../utils/userStorage';
import { ReciterAvatar } from './ReciterAvatar';

interface ListenViewProps {
  uid: string;
  lang: Language;
  chapters: Chapter[];
  activeTrack: AudioTrack | null;
  isPlaying: boolean;
  favoriteRadios: FavoriteRadio[];
  favoriteReciterIds?: number[];
  defaultReciterId: number;
  lastListened?: LastListenedInfo | null;
  audioError?: string | null;
  initialOpenReciterId?: number | null;
  onPlayTrack: (track: AudioTrack) => void;
  onTogglePlayPause: () => void;
  onToggleFavoriteRadio: (radio: RadioStation) => void;
  onToggleFavoriteReciter?: (reciterId: number) => void;
  onSelectDefaultReciter: (reciterId: number) => void;
  onOpenMushafPage?: (page: number) => void;
  onResumeLastListened?: (info: LastListenedInfo) => void;
  onSetPlaybackQueue?: (tracks: AudioTrack[]) => void;
  onRetryAudio?: () => void;
  onClearInitialReciter?: () => void;
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

const PRIORITY_RIWAYAT_AR = ['حفص عن عاصم', 'ورش عن نافع', 'قالون عن نافع', 'الدوري'];

const QUICK_SURAH_JUMPS = [
  { id: 1, ar: 'الفاتحة', en: 'Al-Fatihah' },
  { id: 2, ar: 'البقرة', en: 'Al-Baqarah' },
  { id: 18, ar: 'الكهف', en: 'Al-Kahf' },
  { id: 36, ar: 'يس', en: 'Ya-Sin' },
  { id: 55, ar: 'الرحمن', en: 'Ar-Rahman' },
  { id: 56, ar: 'الواقعة', en: 'Al-Waqiah' },
  { id: 67, ar: 'الملك', en: 'Al-Mulk' },
];

const BATCH_SIZE = 24;

function normalizeSearch(value: string): string {
  return stripArabicDiacritics(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function getRecitationTypeLabel(moshaf: Moshaf, lang: Language): string {
  const n = moshaf.name || '';
  if (/مجود|تجويد|mujawwad/i.test(n) || moshaf.moshaf_type === 2) {
    return lang === 'ar' ? 'مجود' : 'Mujawwad';
  }
  if (/معلم|تحفيظ|teacher|muallim/i.test(n)) {
    return lang === 'ar' ? 'مصحف معلم' : 'Teacher';
  }
  return lang === 'ar' ? 'مرتل' : 'Murattal';
}

function extractRiwayaName(moshafName: string): string {
  return moshafName.split('-')[0].trim();
}

export const ListenView: React.FC<ListenViewProps> = ({
  uid,
  lang,
  chapters,
  activeTrack,
  isPlaying,
  favoriteRadios,
  favoriteReciterIds: favoriteReciterIdsProp,
  defaultReciterId,
  lastListened = null,
  audioError = null,
  initialOpenReciterId = null,
  onPlayTrack,
  onTogglePlayPause,
  onToggleFavoriteRadio,
  onToggleFavoriteReciter,
  onSelectDefaultReciter,
  onOpenMushafPage,
  onResumeLastListened,
  onSetPlaybackQueue,
  onRetryAudio,
  onClearInitialReciter,
}) => {
  const copy = t(lang);
  const [subTab, setSubTab] = useState<'reciters' | 'radios'>('reciters');
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [radios, setRadios] = useState<RadioStation[]>([]);
  const [qdcReciters, setQdcReciters] = useState<QdcReciter[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [surahQuery, setSurahQuery] = useState('');
  const [riwayaFilter, setRiwayaFilter] = useState('all');
  const [letterFilter, setLetterFilter] = useState('all');
  const [radioCategory, setRadioCategory] = useState<RadioCategory>('all');
  const [favRecitersOnly, setFavRecitersOnly] = useState(false);
  const [favRadiosOnly, setFavRadiosOnly] = useState(false);
  const [offlineSurahsOnly, setOfflineSurahsOnly] = useState(false);
  const [visibleRecitersCount, setVisibleRecitersCount] = useState(BATCH_SIZE);

  // Synced favorite reciters (props preferred, local fallback if standalone)
  const [localFavReciters, setLocalFavReciters] = useState<number[]>(() =>
    readUserScoped<number[]>(uid, 'fav_reciters', [])
  );
  const favoriteReciterIds = favoriteReciterIdsProp ?? localFavReciters;

  // Unified Single Reciter Profile state
  const [enteredProfile, setEnteredProfile] = useState(false);
  const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
  const [selectedMoshafIdx, setSelectedMoshafIdx] = useState(0);
  const [profileSection, setProfileSection] = useState<'surahs' | 'ayahs'>('surahs');
  const [playAllMenuOpen, setPlayAllMenuOpen] = useState(false);

  // Verses inside Reciter Profile
  const [ayahSurahId, setAyahSurahId] = useState<number>(1);
  const [ayahSearch, setAyahSearch] = useState('');
  const [profileVerses, setProfileVerses] = useState<Verse[]>([]);
  const [ayahAudioMap, setAyahAudioMap] = useState<Record<string, string>>({});
  const [loadingAyahs, setLoadingAyahs] = useState(false);

  const [offlineList, setOfflineList] = useState<OfflineTrackMeta[]>(() => getOfflineTracksMeta());
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [downloadErrorMap, setDownloadErrorMap] = useState<Record<string, string>>({});

  // Debounce main search input by 250ms for smooth fast filtering
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearchQuery(searchInput);
      setVisibleRecitersCount(BATCH_SIZE);
    }, 250);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setVisibleRecitersCount(BATCH_SIZE);
  }, [riwayaFilter, letterFilter, favRecitersOnly, subTab]);

  useEffect(() => {
    if (!favoriteReciterIdsProp) {
      setLocalFavReciters(readUserScoped<number[]>(uid, 'fav_reciters', []));
    }
  }, [uid, favoriteReciterIdsProp]);

  useEffect(() => {
    if (!favoriteReciterIdsProp) {
      writeUserScoped(uid, 'fav_reciters', localFavReciters);
    }
  }, [uid, localFavReciters, favoriteReciterIdsProp]);

  useEffect(() => {
    const syncOffline = () => setOfflineList(getOfflineTracksMeta());
    window.addEventListener(OFFLINE_UPDATED_EVENT, syncOffline);
    return () => window.removeEventListener(OFFLINE_UPDATED_EVENT, syncOffline);
  }, []);

  const loadAudioCatalog = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    return Promise.all([fetchReciters(lang), fetchRadios(lang), fetchQdcReciters().catch(() => [])])
      .then(([recData, radData, qdcData]) => {
        setReciters(recData);
        setRadios(radData);
        setQdcReciters(qdcData);
        const def = recData.find((r) => r.id === defaultReciterId) || recData[0] || null;
        setSelectedReciter((prev) => prev || def);
      })
      .catch(() => {
        setLoadError(
          lang === 'ar'
            ? 'تعذر تحميل قائمة القراء والإذاعات حاليًا. تحقق من الاتصال وأعد المحاولة.'
            : 'Unable to load reciters and live radios. Check connection and try again.'
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [lang, defaultReciterId]);

  useEffect(() => {
    void loadAudioCatalog();
  }, [loadAudioCatalog]);

  // Allow opening a specific reciter directly (e.g. from Library Favorites)
  useEffect(() => {
    if (!initialOpenReciterId || reciters.length === 0) return;
    const match = reciters.find((r) => r.id === initialOpenReciterId);
    if (match) {
      setSelectedReciter(match);
      setSelectedMoshafIdx(0);
      setEnteredProfile(true);
      onClearInitialReciter?.();
    }
  }, [initialOpenReciterId, reciters, onClearInitialReciter]);

  // Dynamic Document Metadata on Reciter Profile
  const selectedMoshaf = selectedReciter?.moshaf[selectedMoshafIdx] || selectedReciter?.moshaf[0] || null;
  useEffect(() => {
    if (enteredProfile && selectedReciter && selectedMoshaf) {
      applyReciterDocumentMeta(selectedReciter.name, selectedMoshaf.name, lang);
      return () => applyRouteDocumentMeta('/recitations', false, false);
    }
  }, [enteredProfile, selectedReciter, selectedMoshaf, lang]);

  const matchedQdcId = useMemo(() => {
    if (!selectedReciter) return null;
    return matchReciterToQdcId(selectedReciter.name, qdcReciters);
  }, [selectedReciter, qdcReciters]);

  // Load Surah Ayahs & Audio URLs when viewing Ayahs inside Reciter Profile
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
    if (onToggleFavoriteReciter) {
      onToggleFavoriteReciter(id);
    } else {
      setLocalFavReciters((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [id, ...prev]));
    }
  };

  const openReciterProfile = (rec: Reciter) => {
    setSelectedReciter(rec);
    setSelectedMoshafIdx(0);
    setEnteredProfile(true);
    setPlayAllMenuOpen(false);
    onSelectDefaultReciter(rec.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const buildTrackFromReciter = (rec: Reciter, moshaf: Moshaf, surahId: number): AudioTrack => {
    const ch = chapters.find((c) => c.id === surahId);
    const title = ch
      ? lang === 'ar'
        ? `سورة ${ch.name_arabic}`
        : `Surah ${ch.name_simple}`
      : `Surah ${surahId}`;
    return {
      id: `${rec.id}_${surahId}`,
      type: 'surah',
      title,
      subtitle: `${rec.name} · ${extractRiwayaName(moshaf.name)}`,
      url: buildSurahAudioUrl(moshaf, surahId),
      surahNumber: surahId,
      reciterId: rec.id,
      reciterName: rec.name,
      pageNumber: ch?.pages[0],
      moshafServer: moshaf.server,
    };
  };

  const handlePlaySurahWithQueue = (rec: Reciter, moshaf: Moshaf, startSurahId: number, surahList?: number[]) => {
    const ids =
      surahList && surahList.length > 0
        ? surahList
        : moshaf.surah_list
            ?.split(',')
            .map((s) => Number(s.trim()))
            .filter(Boolean) || chapters.map((c) => c.id);

    const ordered = ids.includes(startSurahId)
      ? [startSurahId, ...ids.filter((id) => id > startSurahId)]
      : [startSurahId, ...ids];

    const queueTracks = ordered.slice(0, 114).map((sid) => buildTrackFromReciter(rec, moshaf, sid));
    onSetPlaybackQueue?.(queueTracks);
    const first = queueTracks[0] || buildTrackFromReciter(rec, moshaf, startSurahId);
    if (activeTrack?.url === first.url) {
      onTogglePlayPause();
    } else {
      onPlayTrack(first);
    }
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
    const found = new Set<string>();
    reciters.forEach((r) =>
      r.moshaf.forEach((m) => {
        const clean = extractRiwayaName(m.name);
        if (clean) found.add(clean);
      })
    );
    const prioritized = PRIORITY_RIWAYAT_AR.filter((p) =>
      Array.from(found).some((f) => f.includes(p.split(' ')[0]))
    );
    const others = Array.from(found).filter((f) => !prioritized.includes(f));
    return [...prioritized, ...others].slice(0, 16);
  }, [reciters]);

  const letterOptions = useMemo(() => {
    const set = new Set<string>();
    reciters.forEach((r) => {
      const ch = normalizeSearch(r.letter || r.name.charAt(0)).charAt(0).toUpperCase();
      if (ch) set.add(ch);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, lang));
  }, [reciters, lang]);

  // Detect if search query matches any Surah (so user can find Surah directly from search)
  const matchingSurahs = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    if (!q) return [];
    const cleanQ = q.replace(/^سوره\s+/, '').replace(/^سورة\s+/, '').replace(/^surah\s+/, '');
    return chapters
      .filter((ch) => {
        if (String(ch.id) === cleanQ) return true;
        return (
          normalizeSearch(ch.name_arabic).includes(cleanQ) ||
          normalizeSearch(ch.name_simple).includes(cleanQ)
        );
      })
      .slice(0, 4);
  }, [searchQuery, chapters]);

  const filteredReciters = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    const list = reciters.filter((r) => {
      if (favRecitersOnly && !favReciterSet.has(r.id)) return false;
      if (riwayaFilter !== 'all') {
        const keyWord = riwayaFilter.split(' ')[0];
        if (!r.moshaf.some((m) => m.name.includes(riwayaFilter) || m.name.includes(keyWord))) return false;
      }
      if (letterFilter !== 'all') {
        const rLetter = normalizeSearch(r.letter || r.name.charAt(0)).charAt(0).toUpperCase();
        if (rLetter !== letterFilter) return false;
      }
      if (!q) return true;
      const recNorm = normalizeSearch(r.name);
      const moshafMatches = r.moshaf.some(
        (m) =>
          normalizeSearch(m.name).includes(q) ||
          normalizeSearch(getRecitationTypeLabel(m, lang)).includes(q)
      );
      if (recNorm.includes(q) || moshafMatches) return true;
      // Match reciter if they recite the searched surah
      if (matchingSurahs.length > 0) {
        return matchingSurahs.some((s) =>
          r.moshaf.some((m) => !m.surah_list || m.surah_list.split(',').includes(String(s.id)))
        );
      }
      return false;
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
  }, [reciters, searchQuery, riwayaFilter, letterFilter, favRecitersOnly, favReciterSet, lang, matchingSurahs]);

  const filteredRadios = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    const list = radios.filter((r) => {
      if (favRadiosOnly && !favIds.has(r.id)) return false;
      if (radioCategory !== 'all' && categorizeRadio(r) !== radioCategory) return false;
      if (!q) return true;
      return normalizeSearch(r.name).includes(q);
    });
    return [...list].sort((a, b) => {
      const aFav = favIds.has(a.id) ? 0 : 1;
      const bFav = favIds.has(b.id) ? 0 : 1;
      return aFav - bFav;
    });
  }, [radios, searchQuery, favRadiosOnly, favIds, radioCategory]);

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
    setDownloadErrorMap((prev) => {
      const next = { ...prev };
      delete next[url];
      return next;
    });
    setProgressMap((prev) => ({ ...prev, [url]: 5 }));
    try {
      const ch = chapters.find((c) => c.id === surahId);
      await saveAudioOffline(
        {
          url,
          title,
          subtitle: selectedReciter.name,
          savedAt: new Date().toISOString(),
          kind: 'surah',
          surahNumber: surahId,
          pageNumber: ch?.pages[0],
          reciterId: selectedReciter.id,
          reciterName: selectedReciter.name,
        },
        (pct) => setProgressMap((prev) => ({ ...prev, [url]: pct }))
      );
    } catch {
      setDownloadErrorMap((prev) => ({
        ...prev,
        [url]: lang === 'ar' ? 'فشل التنزيل — أعد المحاولة' : 'Download failed — Retry',
      }));
    } finally {
      setProgressMap((prev) => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
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
    setProgressMap((prev) => ({ ...prev, [url]: 5 }));
    try {
      const surahId = Number(verse.verse_key.split(':')[0]);
      const ch = chapters.find((c) => c.id === surahId);
      await saveAudioOffline(
        {
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
        },
        (pct) => setProgressMap((prev) => ({ ...prev, [url]: pct }))
      );
    } catch {
      setDownloadErrorMap((prev) => ({
        ...prev,
        [url]: lang === 'ar' ? 'فشل التنزيل — أعد المحاولة' : 'Download failed — Retry',
      }));
    } finally {
      setProgressMap((prev) => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
    }
  };

  // Unified Single Reciter Profile View
  if (enteredProfile && selectedReciter && selectedMoshaf) {
    const isFav = favReciterSet.has(selectedReciter.id);
    const activeChapter = chapters.find((c) => c.id === ayahSurahId);
    const savedOfflineSurahs = availableSurahIds.filter((sid) =>
      offlineUrls.has(buildSurahAudioUrl(selectedMoshaf, sid))
    );
    const reciterLastSurah =
      lastListened?.reciterId === selectedReciter.id && lastListened.surahNumber
        ? lastListened.surahNumber
        : readUserScoped<number>(uid, `reciter_last_${selectedReciter.id}`, 0);

    return (
      <div className="space-y-5">
        <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/25 p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setEnteredProfile(false)}
              className="min-h-[44px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-bold flex items-center gap-2 hover:bg-[#0f6b4f]/10 transition-colors whitespace-nowrap"
            >
              {lang === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{lang === 'ar' ? 'جميع القراء' : 'All Reciters'}</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {reciterLastSurah > 0 && (
                <button
                  type="button"
                  onClick={() => handlePlaySurahWithQueue(selectedReciter, selectedMoshaf, reciterLastSurah, availableSurahIds)}
                  className="min-h-[44px] px-4 rounded-full bg-[#c9a44c] text-[#17211d] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{lang === 'ar' ? 'متابعة آخر استماع' : 'Resume Last Position'}</span>
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPlayAllMenuOpen((v) => !v)}
                  className="min-h-[44px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-bold flex items-center gap-1.5 hover:bg-[#0a4e39] whitespace-nowrap"
                >
                  <ListMusic className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'تشغيل جميع السور' : 'Play All Surahs'}</span>
                </button>
                {playAllMenuOpen && (
                  <div className="absolute end-0 top-12 z-30 w-56 rounded-2xl crystal-card border border-[#0f6b4f]/20 shadow-xl p-1.5 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPlayAllMenuOpen(false);
                        handlePlaySurahWithQueue(selectedReciter, selectedMoshaf, availableSurahIds[0] || 1, availableSurahIds);
                      }}
                      className="w-full min-h-[40px] px-3 rounded-xl text-start text-xs font-semibold hover:bg-[#0f6b4f]/10"
                    >
                      {lang === 'ar' ? 'من البداية' : 'From Beginning'}
                    </button>
                    {reciterLastSurah > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPlayAllMenuOpen(false);
                          handlePlaySurahWithQueue(selectedReciter, selectedMoshaf, reciterLastSurah, availableSurahIds);
                        }}
                        className="w-full min-h-[40px] px-3 rounded-xl text-start text-xs font-semibold hover:bg-[#0f6b4f]/10"
                      >
                        {lang === 'ar' ? 'متابعة من آخر موضع' : 'From Last Position'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={savedOfflineSurahs.length === 0}
                      onClick={() => {
                        setPlayAllMenuOpen(false);
                        if (savedOfflineSurahs.length > 0) {
                          handlePlaySurahWithQueue(selectedReciter, selectedMoshaf, savedOfflineSurahs[0], savedOfflineSurahs);
                        }
                      }}
                      className="w-full min-h-[40px] px-3 rounded-xl text-start text-xs font-semibold hover:bg-[#0f6b4f]/10 disabled:opacity-40"
                    >
                      {lang === 'ar'
                        ? `السور المحفوظة فقط (${formatNumber(savedOfflineSurahs.length, lang)})`
                        : `Saved Surahs Only (${savedOfflineSurahs.length})`}
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => toggleFavoriteReciter(selectedReciter.id)}
                className={`min-h-[44px] px-4 rounded-full border text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap ${
                  isFav
                    ? 'bg-[#c9a44c]/20 border-[#c9a44c] text-[#7c5c16] dark:text-[#e6c46e]'
                    : 'border-[#0f6b4f]/20 hover:border-[#c9a44c]'
                }`}
              >
                <Star className={`w-4 h-4 ${isFav ? 'fill-[#c9a44c] text-[#c9a44c]' : ''}`} />
                <span>{isFav ? (lang === 'ar' ? 'في المفضلة' : 'Favorited') : lang === 'ar' ? 'المفضلة' : 'Favorite'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#0f6b4f]/10">
            <div className="flex items-center gap-4 min-w-0">
              <ReciterAvatar name={selectedReciter.name} reciterId={selectedReciter.id} size="xl" active />
              <div className="min-w-0 space-y-1">
                <h1 className="text-xl sm:text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c] truncate">
                  {selectedReciter.name}
                </h1>
                <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                  {selectedMoshaf.name} · {getRecitationTypeLabel(selectedMoshaf, lang)} · {formatNumber(availableSurahIds.length, lang)} {copy.surah}
                </p>
                {selectedReciter.moshaf.length > 1 && (
                  <select
                    value={selectedMoshafIdx}
                    onChange={(e) => setSelectedMoshafIdx(Number(e.target.value))}
                    aria-label={lang === 'ar' ? 'اختر الرواية' : 'Select Riwaya'}
                    className="mt-1 min-h-[40px] px-3 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs font-semibold"
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

            <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15">
              <button
                type="button"
                onClick={() => setProfileSection('surahs')}
                className={`min-h-[40px] px-4 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                  profileSection === 'surahs' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {lang === 'ar' ? `السور الكاملة (${formatNumber(availableSurahIds.length, lang)})` : `Full Surahs (${availableSurahIds.length})`}
              </button>
              <button
                type="button"
                onClick={() => setProfileSection('ayahs')}
                className={`min-h-[40px] px-4 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                  profileSection === 'ayahs' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {lang === 'ar' ? 'الآيات المقروءة' : 'Recited Verses'}
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
                  className="w-full min-h-[44px] ps-9 pe-8 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
                />
                {surahQuery && (
                  <button
                    type="button"
                    onClick={() => setSurahQuery('')}
                    aria-label={lang === 'ar' ? 'مسح البحث' : 'Clear search'}
                    className="w-8 h-8 rounded-full flex items-center justify-center absolute top-1/2 -translate-y-1/2 end-1.5 text-[#5c6862]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOfflineSurahsOnly((v) => !v)}
                className={`min-h-[44px] px-4 rounded-full border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
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
                    className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap shrink-0 ${
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
                const dlPct = progressMap[url];
                const dlErr = downloadErrorMap[url];
                const title = ch
                  ? lang === 'ar'
                    ? `سورة ${ch.name_arabic}`
                    : `Surah ${ch.name_simple}`
                  : `Surah ${surahId}`;

                return (
                  <div
                    key={surahId}
                    className={`rounded-2xl border p-3 space-y-1.5 transition-colors ${
                      isThisTrack
                        ? 'border-[#0f6b4f] bg-[#0f6b4f]/12'
                        : 'border-[#0f6b4f]/12 bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 hover:border-[#0f6b4f]/35'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handlePlaySurahWithQueue(selectedReciter, selectedMoshaf, surahId, availableSurahIds)}
                        className="flex items-center gap-3 text-start flex-1 min-w-0 min-h-[44px]"
                      >
                        <span className="w-10 h-10 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center shrink-0">
                          {isThisTrack && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{title}</p>
                          <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                            {String(surahId).padStart(3, '0')}
                            {ch ? ` · ${formatNumber(ch.verses_count, lang)} ${copy.ayah}` : ''}
                          </p>
                        </div>
                      </button>

                      {isSaved ? (
                        <button
                          type="button"
                          title={copy.downloaded}
                          aria-label={lang === 'ar' ? `حذف تنزيل ${title}` : `Remove ${title}`}
                          onClick={() => void removeOfflineAudio(url)}
                          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#0f6b4f]/15 text-[#0f6b4f] dark:text-[#c9a44c] shrink-0"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title={copy.downloadOffline}
                          aria-label={lang === 'ar' ? `تنزيل ${title}` : `Download ${title}`}
                          disabled={typeof dlPct === 'number'}
                          onClick={() => void handleDownloadSurah(url, title, surahId)}
                          className="min-w-[44px] h-11 px-2 rounded-full flex items-center justify-center gap-1 text-[#5c6862] hover:bg-[#0f6b4f]/10 hover:text-[#0f6b4f] shrink-0"
                        >
                          {typeof dlPct === 'number' ? (
                            <span className="text-[11px] font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
                              {dlPct}%
                            </span>
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>

                    {typeof dlPct === 'number' && (
                      <div className="space-y-1 pt-1">
                        <div className="h-1.5 rounded-full bg-[#0f6b4f]/15 overflow-hidden">
                          <div className="h-full bg-[#0f6b4f] dark:bg-[#c9a44c] transition-all" style={{ width: `${dlPct}%` }} />
                        </div>
                        <p className="text-[11px] text-[#0f6b4f] dark:text-[#c9a44c] font-semibold tabular-nums">
                          {lang === 'ar' ? `جارٍ التنزيل: ${formatNumber(dlPct, lang)}%` : `Downloading: ${dlPct}%`}
                        </p>
                      </div>
                    )}

                    {dlErr && (
                      <button
                        type="button"
                        onClick={() => void handleDownloadSurah(url, title, surahId)}
                        className="text-[11px] font-semibold text-red-600 dark:text-red-400 underline"
                      >
                        {dlErr}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Section B: Ayahs Recited by This Reciter */
          <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <select
                  value={ayahSurahId}
                  onChange={(e) => setAyahSurahId(Number(e.target.value))}
                  aria-label={lang === 'ar' ? 'اختر السورة للآيات' : 'Select surah for verses'}
                  className="min-h-[44px] px-4 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs font-bold"
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
                    className="w-full min-h-[44px] ps-9 pe-4 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
                  />
                </div>
              </div>

              <span className="text-xs font-semibold text-[#5c6862] dark:text-[#98a69f]">
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
                <span>{lang === 'ar' ? 'جارٍ تحميل آيات السورة...' : 'Loading verses...'}</span>
              </div>
            ) : (
              <div className="space-y-3" dir="rtl">
                {filteredProfileVerses.map((v) => {
                  const vUrl = ayahAudioMap[v.verse_key];
                  const isThisVerse =
                    activeTrack?.verseKey === v.verse_key &&
                    (!vUrl || activeTrack?.url === vUrl);
                  const isSaved = Boolean(vUrl && offlineUrls.has(vUrl));
                  const dlPct = vUrl ? progressMap[vUrl] : undefined;

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
                            className="min-h-[40px] px-3.5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0a4e39]"
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
                              className="min-h-[40px] px-3.5 rounded-full bg-[#0f6b4f]/14 text-[#0f6b4f] dark:text-[#c9a44c] text-xs font-semibold flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{lang === 'ar' ? 'في المكتبة' : 'In Library'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={typeof dlPct === 'number'}
                              onClick={() => void handleDownloadVerseInProfile(v)}
                              className="min-h-[40px] px-3.5 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0f6b4f]/10"
                            >
                              {typeof dlPct === 'number' ? (
                                <span>{dlPct}%</span>
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
                              aria-label={lang === 'ar' ? 'فتح في المصحف' : 'Open in Mushaf'}
                              className="w-10 h-10 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10 text-[#0f6b4f] dark:text-[#c9a44c]"
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
      {/* Page Title & Continue Listening Hero */}
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
            {lang === 'ar' ? 'الاستماع إلى القرآن الكريم' : 'Listen to the Holy Quran'}
          </h1>
          <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
            {lang === 'ar'
              ? 'اختر قارئك، ابحث بالاسم أو السورة أو الرواية، أو استمع للإذاعات المباشرة'
              : 'Browse reciters by name, surah, or riwaya, or tune into live Quran radio'}
          </p>
        </div>
      </header>

      {lastListened && onResumeLastListened && (
        <section className="rounded-3xl crystal-card border border-[#c9a44c]/40 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <ReciterAvatar
              name={lastListened.reciterName || lastListened.subtitle}
              reciterId={lastListened.reciterId}
              size="lg"
              active
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'تابع الاستماع' : 'Continue Listening'}</span>
              </p>
              <h2 className="text-base font-bold truncate">{lastListened.title}</h2>
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f] truncate">
                {lastListened.reciterName || lastListened.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onResumeLastListened(lastListened)}
              className="min-h-[44px] px-5 rounded-full bg-[#0f6b4f] text-white text-xs font-bold flex items-center gap-2 hover:bg-[#0a4e39] whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{lang === 'ar' ? 'استئناف' : 'Resume'}</span>
            </button>
          </div>
        </section>
      )}

      {audioError && onRetryAudio && (
        <div
          role="alert"
          className="rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span className="flex items-center gap-2 text-red-700 dark:text-red-300 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{audioError}</span>
          </span>
          <button
            type="button"
            onClick={onRetryAudio}
            className="min-h-[38px] px-4 rounded-full bg-[#0f6b4f] text-white font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
          </button>
        </div>
      )}

      {/* Main Search + Tabs + Filters */}
      <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex p-1 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/10">
            <button
              type="button"
              onClick={() => setSubTab('reciters')}
              className={`min-h-[42px] px-4 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                subTab === 'reciters' ? 'bg-[#0f6b4f] text-white shadow-xs' : 'text-[#5c6862] dark:text-[#98a69f]'
              }`}
            >
              {copy.reciters}
              {!loading && reciters.length > 0 ? ` (${formatNumber(reciters.length, lang)})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('radios')}
              className={`min-h-[42px] px-4 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                subTab === 'radios' ? 'bg-[#0f6b4f] text-white shadow-xs' : 'text-[#5c6862] dark:text-[#98a69f]'
              }`}
            >
              {lang === 'ar' ? 'الإذاعات المباشرة' : copy.radios}
              {!loading && radios.length > 0 ? ` (${formatNumber(radios.length, lang)})` : ''}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-2xl">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#5c6862] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={
                  subTab === 'reciters'
                    ? lang === 'ar'
                      ? 'ابحث عن قارئ أو سورة أو رواية...'
                      : 'Search reciter, surah, or riwaya...'
                    : lang === 'ar'
                    ? 'ابحث عن اسم الإذاعة...'
                    : 'Search radio station...'
                }
                className="w-full min-h-[44px] ps-10 pe-9 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSearchQuery('');
                  }}
                  aria-label={lang === 'ar' ? 'مسح البحث' : 'Clear search'}
                  className="w-8 h-8 rounded-full flex items-center justify-center absolute top-1/2 -translate-y-1/2 end-1.5 text-[#5c6862] hover:bg-[#0f6b4f]/10"
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
                  className={`min-h-[44px] px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
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
                  aria-label={lang === 'ar' ? 'تصفية حسب الرواية' : 'Filter by Riwaya'}
                  className="min-h-[44px] px-4 rounded-full bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs font-semibold"
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
                className={`min-h-[44px] px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
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

        {/* Direct Surah Play Matches when user searches by Surah name */}
        {subTab === 'reciters' && matchingSurahs.length > 0 && (selectedReciter || reciters[0]) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#0f6b4f]/10">
            <span className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
              {lang === 'ar' ? 'تشغيل سريع للسورة:' : 'Quick Play Surah:'}
            </span>
            {matchingSurahs.map((ch) => {
              const targetRec = selectedReciter || reciters[0];
              const targetMoshaf = targetRec.moshaf[0];
              if (!targetMoshaf) return null;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => handlePlaySurahWithQueue(targetRec, targetMoshaf, ch.id)}
                  className="min-h-[38px] px-3.5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0a4e39] whitespace-nowrap"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>
                    {lang === 'ar' ? `سورة ${ch.name_arabic}` : ch.name_simple} ({targetRec.name.split(' ').slice(0, 2).join(' ')})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Alphabet Quick Filter Strip for Reciters */}
        {!loading && subTab === 'reciters' && letterOptions.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1">
            <button
              type="button"
              onClick={() => setLetterFilter('all')}
              className={`min-h-[38px] px-3.5 rounded-full text-xs font-bold shrink-0 transition-all whitespace-nowrap ${
                letterFilter === 'all'
                  ? 'bg-[#0f6b4f] text-white ring-2 ring-[#c9a44c]/70 shadow-xs'
                  : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/15 text-[#5c6862] dark:text-[#98a69f]'
              }`}
            >
              {lang === 'ar' ? 'كل القراء' : 'All Reciters'}
            </button>
            {letterOptions.map((ltr) => {
              const active = letterFilter === ltr;
              return (
                <button
                  key={ltr}
                  type="button"
                  onClick={() => setLetterFilter((prev) => (prev === ltr ? 'all' : ltr))}
                  className={`min-w-[38px] h-9 px-2 rounded-full text-xs font-bold shrink-0 transition-all ${
                    active
                      ? 'bg-[#0f6b4f] text-white ring-2 ring-[#c9a44c]/70 shadow-xs'
                      : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/15 text-[#5c6862] dark:text-[#98a69f] hover:border-[#c9a44c]'
                  }`}
                >
                  {ltr}
                </button>
              );
            })}
          </div>
        )}

        {/* Radio Category Filter Chips */}
        {!loading && subTab === 'radios' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1">
            {(
              [
                { id: 'all', label: lang === 'ar' ? 'الكل' : 'All' },
                { id: 'quran', label: lang === 'ar' ? 'إذاعات القرآن' : 'Quran Radios' },
                { id: 'haramain', label: lang === 'ar' ? 'إذاعات الحرم' : 'Haramain' },
                { id: 'murattal', label: lang === 'ar' ? 'تلاوات مرتلة' : 'Murattal' },
                { id: 'mujawwad', label: lang === 'ar' ? 'تلاوات مجودة' : 'Mujawwad' },
                { id: 'riwayat', label: lang === 'ar' ? 'روايات القرآن' : 'Riwayat' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setRadioCategory(cat.id)}
                className={`min-h-[38px] px-3.5 rounded-full text-xs font-bold shrink-0 whitespace-nowrap transition-all ${
                  radioCategory === cat.id
                    ? 'bg-[#0f6b4f] text-white ring-2 ring-[#c9a44c]/70'
                    : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/15 text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Featured Reciters Quick Strip with Portraits */}
      {!loading && !loadError && subTab === 'reciters' && featuredReciters.length > 0 && (
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
        <div className="space-y-4">
          <p className="text-xs font-semibold text-center text-[#5c6862] dark:text-[#98a69f]">
            {subTab === 'reciters'
              ? lang === 'ar'
                ? 'جارٍ تحميل القراء...'
                : 'Loading reciters...'
              : lang === 'ar'
              ? 'جارٍ تحميل الإذاعات...'
              : 'Loading radios...'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-20 rounded-2xl crystal-card border border-[#0f6b4f]/12 p-3 flex items-center gap-3 animate-pulse"
              >
                <div className="w-12 h-12 rounded-full bg-[#0f6b4f]/15 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-[#0f6b4f]/15 rounded w-2/3" />
                  <div className="h-2.5 bg-[#0f6b4f]/10 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : loadError ? (
        <div className="rounded-3xl crystal-card border border-red-500/30 p-8 text-center space-y-3">
          <AlertCircle className="w-9 h-9 text-red-500 mx-auto" />
          <h2 className="text-base font-bold">
            {subTab === 'reciters'
              ? lang === 'ar'
                ? 'تعذر تحميل قائمة القراء'
                : 'Unable to load reciters list'
              : lang === 'ar'
              ? 'تعذر تحميل الإذاعات'
              : 'Unable to load live radios'}
          </h2>
          <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadAudioCatalog()}
            className="min-h-[44px] px-6 rounded-full bg-[#0f6b4f] text-white text-xs font-bold inline-flex items-center gap-2 hover:bg-[#0a4e39]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
          </button>
        </div>
      ) : subTab === 'reciters' ? (
        <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 border-b border-[#0f6b4f]/10 text-xs font-semibold text-[#5c6862] dark:text-[#98a69f]">
            <span>
              {lang === 'ar'
                ? `عدد القراء المطابق: ${formatNumber(filteredReciters.length, lang)} قارئ`
                : `${filteredReciters.length} reciters available`}
            </span>
            {(searchQuery || riwayaFilter !== 'all' || letterFilter !== 'all' || favRecitersOnly) && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                  setRiwayaFilter('all');
                  setLetterFilter('all');
                  setFavRecitersOnly(false);
                }}
                className="text-[#0f6b4f] dark:text-[#c9a44c] hover:underline"
              >
                {lang === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
              </button>
            )}
          </div>

          {filteredReciters.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm font-semibold text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'لا يوجد قارئ مطابق لبحثك الحالي.' : 'No matching reciters found.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredReciters.slice(0, visibleRecitersCount).map((reciter) => {
                  const primaryMoshaf = reciter.moshaf[0];
                  const active = selectedReciter?.id === reciter.id;
                  const isFav = favReciterSet.has(reciter.id);
                  const isThisPlayingReciter = activeTrack?.reciterId === reciter.id && isPlaying;
                  return (
                    <div
                      key={reciter.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-2 transition-all ${
                        active
                          ? 'border-[#0f6b4f] bg-[#0f6b4f]/10'
                          : 'border-[#0f6b4f]/12 bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 hover:border-[#c9a44c]/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openReciterProfile(reciter)}
                        className="flex-1 min-w-0 min-h-[52px] text-start flex items-center gap-3"
                      >
                        <ReciterAvatar name={reciter.name} reciterId={reciter.id} size="md" active={active} />
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{reciter.name}</p>
                          <p className="text-xs text-[#5c6862] dark:text-[#98a69f] truncate">
                            {primaryMoshaf ? extractRiwayaName(primaryMoshaf.name) : ''} ·{' '}
                            {primaryMoshaf ? getRecitationTypeLabel(primaryMoshaf, lang) : ''} ·{' '}
                            {formatNumber(primaryMoshaf?.surah_total || 114, lang)} {copy.surah}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {primaryMoshaf && (
                          <button
                            type="button"
                            onClick={() => {
                              const startSurah = matchingSurahs[0]?.id || 1;
                              handlePlaySurahWithQueue(reciter, primaryMoshaf, startSurah);
                            }}
                            aria-label={lang === 'ar' ? `تشغيل تلاوة ${reciter.name}` : `Play ${reciter.name}`}
                            className="w-11 h-11 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center hover:bg-[#0a4e39]"
                          >
                            {isThisPlayingReciter ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4 fill-current" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleFavoriteReciter(reciter.id)}
                          aria-label={lang === 'ar' ? `تفضيل ${reciter.name}` : `Favorite ${reciter.name}`}
                          className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-[#0f6b4f]/10"
                        >
                          <Star
                            className={`w-4 h-4 ${isFav ? 'fill-[#c9a44c] text-[#c9a44c]' : 'text-[#5c6862]'}`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredReciters.length > visibleRecitersCount && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleRecitersCount((c) => c + BATCH_SIZE)}
                    className="min-h-[44px] px-6 rounded-full border border-[#0f6b4f]/25 text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] hover:bg-[#0f6b4f]/10"
                  >
                    {lang === 'ar'
                      ? `عرض المزيد (${formatNumber(filteredReciters.length - visibleRecitersCount, lang)})`
                      : `Show More (${filteredReciters.length - visibleRecitersCount})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Live Radios Tab */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredRadios.length === 0 ? (
            <div className="col-span-full rounded-3xl crystal-card border border-[#0f6b4f]/15 p-12 text-center space-y-2">
              <p className="text-sm font-semibold text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'لا توجد إذاعات مطابقة للبحث' : 'No matching radio stations found'}
              </p>
            </div>
          ) : (
            filteredRadios.map((radio) => {
              const isThis = activeTrack?.url === radio.url;
              const isFav = favIds.has(radio.id);
              const reciterHint = extractRadioReciterHint(radio.name);
              const hasThisError = isThis && Boolean(audioError);

              return (
                <div
                  key={radio.id}
                  className={`rounded-2xl crystal-card border p-4 flex items-center justify-between gap-2.5 transition-all ${
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
                          subtitle: reciterHint || (lang === 'ar' ? 'إذاعة القرآن المباشرة' : copy.radios),
                          url: radio.url,
                        });
                    }}
                    className="flex items-center gap-3 text-start flex-1 min-w-0 min-h-[52px]"
                  >
                    <span className="w-11 h-11 rounded-full bg-[#0f6b4f]/14 text-[#0f6b4f] dark:text-[#c9a44c] flex items-center justify-center shrink-0">
                      {isThis && isPlaying ? <Pause className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-bold truncate">{radio.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                        <span
                          className={`font-semibold ${
                            hasThisError
                              ? 'text-red-600 dark:text-red-400'
                              : isThis && isPlaying
                              ? 'text-emerald-700 dark:text-[#c9a44c]'
                              : ''
                          }`}
                        >
                          {hasThisError
                            ? lang === 'ar'
                              ? 'غير متاح حاليًا'
                              : 'Unavailable'
                            : isThis && isPlaying
                            ? lang === 'ar'
                              ? 'مباشر الآن'
                              : 'Live now'
                            : lang === 'ar'
                            ? 'متاح للبث'
                            : 'Ready'}
                        </span>
                        {reciterHint && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{reciterHint}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {hasThisError && onRetryAudio && (
                      <button
                        type="button"
                        onClick={onRetryAudio}
                        aria-label={lang === 'ar' ? 'إعادة الاتصال بالإذاعة' : 'Reconnect station'}
                        className="w-10 h-10 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={lang === 'ar' ? `تفضيل ${radio.name}` : `Favorite ${radio.name}`}
                      onClick={() => onToggleFavoriteRadio(radio)}
                      className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-[#0f6b4f]/10 shrink-0"
                    >
                      <Heart
                        className={`w-4 h-4 ${isFav ? 'fill-[#c9a44c] text-[#c9a44c]' : 'text-[#5c6862]'}`}
                      />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
