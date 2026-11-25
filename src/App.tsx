/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Compass, Headphones, Home, Moon, Sun, User as UserIcon } from 'lucide-react';
import {
  AppAppearance,
  AppTab,
  AudioTrack,
  AuthStage,
  Chapter,
  FavoriteRadio,
  HighlightColor,
  Language,
  MemorizationItem,
  RadioStation,
  ThemeMode,
  UserProfile,
  Verse,
  VerseBookmark,
} from './types/nour';
import { t } from './i18n/translations';
import {
  DEFAULT_APP_APPEARANCE,
  deleteCurrentAccount,
  fetchFavoriteRadios,
  fetchMemorizationItems,
  fetchUserBookmarks,
  loadOrCreateUserProfile,
  logoutAccount,
  recordSiteVisit,
  removeVerseBookmark,
  subscribeToAppAppearance,
  subscribeToAuth,
  syncUserProfilePatch,
  toggleFavoriteRadioRemote,
  upsertMemorizationItem,
  upsertVerseBookmark,
} from './services/firebase';
import { fetchAyahAudioUrl, fetchChapters, fetchVersePageNumber } from './services/quranApi';
import { buildSurahAudioUrl, fetchReciters, resolveAudioPlaybackUrl } from './services/mp3QuranApi';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthFlow } from './components/AuthFlow';
import { HomeView } from './components/HomeView';
import { MushafView } from './components/MushafView';
import { ListenView } from './components/ListenView';
import { WorshipView } from './components/WorshipView';
import { ProfileView } from './components/ProfileView';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { AdminDashboard } from './components/AdminDashboard';

const GUEST_STORAGE_KEY = 'nour_guest_state_v1';
const SPLASH_EMBLEM = '/src/assets/images/nour_splash_emblem_1795615768708.jpg';

function isAdminPath(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const h = window.location.hash.replace(/\/+$/, '').toLowerCase();
  return p.endsWith('/admin') || h === '#/admin' || h === '#admin';
}

function AppBackdrop({ appearance }: { appearance: AppAppearance }) {
  if (appearance.backgroundType === 'none' || !appearance.backgroundUrl) return null;
  const isDefaultMosque = appearance.backgroundType === 'default_mosque';
  return (
    <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
      <img
        src={appearance.backgroundUrl}
        alt=""
        referrerPolicy="no-referrer"
        style={{
          opacity: appearance.backgroundOpacity,
          filter: appearance.backgroundBlur ? `blur(${appearance.backgroundBlur}px)` : undefined,
        }}
        className={`w-full h-full ${
          isDefaultMosque
            ? 'object-contain object-bottom mx-auto mix-blend-multiply dark:mix-blend-screen'
            : 'object-cover object-center'
        }`}
      />
    </div>
  );
}

function createDefaultProfile(lang: Language, theme: ThemeMode): UserProfile {
  const today = new Date().toISOString().slice(0, 10);
  return {
    uid: 'guest',
    displayName: lang === 'ar' ? 'ضيف نور' : 'Nour Guest',
    language: lang,
    theme,
    defaultReciterId: 1,
    streakDays: 1,
    lastReadPage: 1,
    lastReadSurah: 1,
    lastReadAyah: 1,
    lastReadDate: today,
    khatmaTargetDays: 30,
    khatmaCurrentPage: 1,
    khatmaStartDate: today,
    weeklyPages: [2, 4, 3, 5, 4, 6, 1],
    isGuest: true,
    emailVerified: false,
  };
}

function NourRoot() {
  const [lang, setLang] = useState<Language>(() =>
    localStorage.getItem('nour_lang') === 'en' ? 'en' : 'ar'
  );
  const [theme, setTheme] = useState<ThemeMode>(() =>
    localStorage.getItem('nour_theme') === 'dark' ? 'dark' : 'light'
  );
  const [stage, setStage] = useState<AuthStage>('splash');
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => isAdminPath());
  const [appearance, setAppearance] = useState<AppAppearance>(DEFAULT_APP_APPEARANCE);

  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      if (raw) return JSON.parse(raw).profile as UserProfile;
    } catch {
      // ignore
    }
    return createDefaultProfile(lang, theme);
  });

  const [bookmarks, setBookmarks] = useState<VerseBookmark[]>(() => {
    try {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      return raw ? (JSON.parse(raw).bookmarks as VerseBookmark[]) || [] : [];
    } catch {
      return [];
    }
  });

  const [memorization, setMemorization] = useState<MemorizationItem[]>(() => {
    try {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      return raw ? (JSON.parse(raw).memorization as MemorizationItem[]) || [] : [];
    } catch {
      return [];
    }
  });

  const [favoriteRadios, setFavoriteRadios] = useState<FavoriteRadio[]>(() => {
    try {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      return raw ? (JSON.parse(raw).favoriteRadios as FavoriteRadio[]) || [] : [];
    } catch {
      return [];
    }
  });

  const [chapters, setChapters] = useState<Chapter[]>([]);

  // Audio Engine State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [repeat, setRepeat] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const lastReadPageRef = useRef(profile.lastReadPage);

  useEffect(() => {
    lastReadPageRef.current = profile.lastReadPage;
  }, [profile.lastReadPage]);

  // Sync HTML dir, lang, and .dark class
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('nour_lang', lang);
  }, [lang]);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('nour_theme', theme);
  }, [theme]);

  // Persist local cache for offline & guest mode
  useEffect(() => {
    try {
      localStorage.setItem(
        GUEST_STORAGE_KEY,
        JSON.stringify({ profile, bookmarks, memorization, favoriteRadios })
      );
    } catch {
      // ignore
    }
  }, [profile, bookmarks, memorization, favoriteRadios]);

  // Sync admin route on URL navigation (pathname ending in /admin or #/admin)
  useEffect(() => {
    const syncRoute = () => setIsAdminRoute(isAdminPath());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // Subscribe to global appearance config (wallpaper) & record anonymous visit
  useEffect(() => {
    const unsub = subscribeToAppAppearance(setAppearance);
    if (!isAdminPath()) {
      void recordSiteVisit(lang);
    }
    return unsub;
  }, []);

  // Load Quran chapters for the active language
  useEffect(() => {
    fetchChapters(lang).then(setChapters).catch(() => {});
  }, [lang]);

  // Subscribe to Firebase Authentication
  useEffect(() => {
    const unsub = subscribeToAuth(async (user) => {
      if (!user) return;
      try {
        const loaded = await loadOrCreateUserProfile(user, {
          language: lang,
          theme,
          defaultReciterId: profile.defaultReciterId,
          streakDays: profile.streakDays,
          lastReadPage: profile.lastReadPage,
          lastReadSurah: profile.lastReadSurah,
          lastReadAyah: profile.lastReadAyah,
          lastReadDate: profile.lastReadDate,
          khatmaTargetDays: profile.khatmaTargetDays,
          khatmaCurrentPage: profile.khatmaCurrentPage,
          khatmaStartDate: profile.khatmaStartDate,
          weeklyPages: profile.weeklyPages,
        });
        setProfile(loaded);
        setLang(loaded.language);
        setTheme(loaded.theme);
        if (user.emailVerified) {
          const [bms, mems, favs] = await Promise.all([
            fetchUserBookmarks(user.uid),
            fetchMemorizationItems(user.uid),
            fetchFavoriteRadios(user.uid),
          ]);
          setBookmarks(bms);
          setMemorization(mems);
          setFavoriteRadios(favs);
        }
        setStage('app');
      } catch (err) {
        console.error(err);
        setStage('app');
      }
    });
    return unsub;
  }, []);

  // Sleep Timer Effect
  useEffect(() => {
    if (!sleepMinutes) return;
    const timer = window.setTimeout(() => {
      playTokenRef.current++;
      void safePauseAudio();
      setIsPlaying(false);
      setSleepMinutes(null);
    }, sleepMinutes * 60000);
    return () => window.clearTimeout(timer);
  }, [sleepMinutes]);

  const toggleLanguage = useCallback(() => {
    const next: Language = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    setProfile((p) => ({ ...p, language: next }));
    if (!profile.isGuest) {
      syncUserProfilePatch(profile.uid, { language: next }).catch(() => {});
    }
  }, [lang, profile.isGuest, profile.uid]);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setProfile((p) => ({ ...p, theme: next }));
    if (!profile.isGuest) {
      syncUserProfilePatch(profile.uid, { theme: next }).catch(() => {});
    }
  }, [theme, profile.isGuest, profile.uid]);

  const handleGuestContinue = () => {
    localStorage.setItem('nour_onboarded', '1');
    setProfile((p) => ({ ...p, isGuest: true, uid: 'guest' }));
    setStage('app');
  };

  const safePauseAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playPromiseRef.current) {
      try {
        await playPromiseRef.current;
      } catch {
        // Pending play already rejected
      } finally {
        playPromiseRef.current = null;
      }
    }
    audio.pause();
  };

  const getNextSurahTrack = (track: AudioTrack, delta: 1 | -1): AudioTrack | null => {
    if (track.type !== 'surah' || !track.surahNumber || !track.moshafServer) return null;
    const nextSurah = track.surahNumber + delta;
    if (nextSurah < 1 || nextSurah > 114) return null;
    const ch = chapters.find((c) => c.id === nextSurah);
    const title = ch
      ? lang === 'ar'
        ? `سورة ${ch.name_arabic}`
        : `Surah ${ch.name_simple}`
      : `Surah ${nextSurah}`;
    return {
      ...track,
      id: `${track.reciterId || 'rec'}_${nextSurah}`,
      title,
      surahNumber: nextSurah,
      url: buildSurahAudioUrl({ id: 0, name: '', server: track.moshafServer, surah_total: 114, moshaf_type: 11, surah_list: '' }, nextSurah),
    };
  };

  const playAdjacentAyah = async (verseKey: string, delta: 1 | -1) => {
    const [sStr, aStr] = verseKey.split(':');
    let surahId = Number(sStr);
    let ayahNum = Number(aStr) + delta;
    const ch = chapters.find((c) => c.id === surahId);
    if (ayahNum < 1) {
      if (surahId <= 1) return;
      surahId -= 1;
      const prevCh = chapters.find((c) => c.id === surahId);
      ayahNum = prevCh?.verses_count || 1;
    } else if (ch && ayahNum > ch.verses_count) {
      if (surahId >= 114) return;
      surahId += 1;
      ayahNum = 1;
    }
    const nextKey = `${surahId}:${ayahNum}`;
    try {
      const [url, nextPage] = await Promise.all([
        fetchAyahAudioUrl(nextKey, 7),
        fetchVersePageNumber(nextKey),
      ]);
      if (nextPage && nextPage !== lastReadPageRef.current) {
        handleChangePage(nextPage, surahId, ayahNum);
      }
      const nextCh = chapters.find((c) => c.id === surahId);
      await handlePlayTrack({
        id: `ayah_${nextKey}`,
        type: 'ayah',
        title: `${nextCh?.name_arabic || surahId} · ${lang === 'ar' ? 'آية' : 'Ayah'} ${ayahNum}`,
        subtitle: lang === 'ar' ? 'مشاري العفاسي' : 'Mishary Alafasy',
        url,
        verseKey: nextKey,
        pageNumber: nextPage ?? undefined,
      });
    } catch {
      setIsPlaying(false);
    }
  };

  const handlePlayTrack = async (track: AudioTrack) => {
    const token = ++playTokenRef.current;
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    await safePauseAudio();
    if (token !== playTokenRef.current) return;

    setAudioError(null);
    setIsBuffering(true);
    setCurrentTime(0);
    setDuration(0);
    setActiveTrack(track);

    let resolvedUrl = track.url;
    try {
      resolvedUrl = await resolveAudioPlaybackUrl(track.url);
    } catch {
      resolvedUrl = track.url;
    }
    if (token !== playTokenRef.current) {
      if (resolvedUrl.startsWith('blob:')) URL.revokeObjectURL(resolvedUrl);
      return;
    }

    if (objectUrlRef.current && objectUrlRef.current !== resolvedUrl) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (resolvedUrl.startsWith('blob:')) {
      objectUrlRef.current = resolvedUrl;
    }

    audio.src = resolvedUrl;
    audio.playbackRate = track.type === 'radio' ? 1 : speed;
    audio.loop = repeat && track.type !== 'radio';
    audio.volume = volume;
    audio.muted = isMuted;

    audio.ontimeupdate = () => {
      if (token === playTokenRef.current) {
        setCurrentTime(audio.currentTime || 0);
      }
    };
    audio.onloadedmetadata = () => {
      if (token === playTokenRef.current) {
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      }
    };
    audio.onwaiting = () => {
      if (token === playTokenRef.current) setIsBuffering(true);
    };
    audio.oncanplay = () => {
      if (token === playTokenRef.current) setIsBuffering(false);
    };
    audio.onplaying = () => {
      if (token === playTokenRef.current) {
        setIsBuffering(false);
        setAudioError(null);
      }
    };
    audio.onerror = () => {
      if (token === playTokenRef.current) {
        setIsBuffering(false);
        setIsPlaying(false);
        setAudioError(lang === 'ar' ? 'تعذر تشغيل هذا المقطع الصوتي حالياً' : 'Audio stream unavailable');
      }
    };
    audio.onended = () => {
      if (token !== playTokenRef.current || audio.loop) return;
      if (track.type === 'ayah' && track.verseKey) {
        void playAdjacentAyah(track.verseKey, 1);
      } else if (track.type === 'surah') {
        const nextSurah = getNextSurahTrack(track, 1);
        if (nextSurah) void handlePlayTrack(nextSurah);
        else setIsPlaying(false);
      } else {
        setIsPlaying(false);
      }
    };

    try {
      const p = audio.play();
      playPromiseRef.current = p;
      await p;
      if (token === playTokenRef.current) {
        setIsPlaying(true);
        setIsBuffering(false);
      } else {
        audio.pause();
      }
    } catch {
      if (token === playTokenRef.current) {
        setIsPlaying(false);
        setIsBuffering(false);
      }
    } finally {
      if (token === playTokenRef.current) {
        playPromiseRef.current = null;
      }
    }
  };

  const handleTogglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = ++playTokenRef.current;
    if (isPlaying) {
      await safePauseAudio();
      if (token === playTokenRef.current) {
        setIsPlaying(false);
      }
    } else {
      setAudioError(null);
      try {
        const p = audio.play();
        playPromiseRef.current = p;
        await p;
        if (token === playTokenRef.current) {
          setIsPlaying(true);
        } else {
          audio.pause();
        }
      } catch {
        if (token === playTokenRef.current) {
          setIsPlaying(false);
        }
      } finally {
        if (token === playTokenRef.current) {
          playPromiseRef.current = null;
        }
      }
    }
  };

  const handleSeekAudio = (time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time)) return;
    const clamped = Math.max(0, duration > 0 ? Math.min(duration, time) : time);
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  };

  // Sync volume and mute to active audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Media Session API for lock-screen, notification, and hardware media keys across devices
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!activeTrack) {
      ms.metadata = null;
      ms.playbackState = 'none';
      return;
    }
    try {
      ms.metadata = new MediaMetadata({
        title: activeTrack.title,
        artist: activeTrack.subtitle,
        album: lang === 'ar' ? 'نور — رفيق القرآن' : 'Nour — Quran Companion',
        artwork: [{ src: SPLASH_EMBLEM, sizes: '512x512', type: 'image/jpeg' }],
      });
    } catch {
      // Ignore MediaMetadata failures in restricted iframes
    }
    ms.playbackState = isPlaying ? 'playing' : 'paused';

    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Unsupported action in current browser
      }
    };

    setHandler('play', () => void handleTogglePlayPause());
    setHandler('pause', () => void handleTogglePlayPause());
    setHandler(
      'previoustrack',
      activeTrack.type === 'radio'
        ? null
        : () => {
            if (activeTrack.type === 'ayah' && activeTrack.verseKey) {
              void playAdjacentAyah(activeTrack.verseKey, -1);
            } else {
              const prev = getNextSurahTrack(activeTrack, -1);
              if (prev) void handlePlayTrack(prev);
            }
          }
    );
    setHandler(
      'nexttrack',
      activeTrack.type === 'radio'
        ? null
        : () => {
            if (activeTrack.type === 'ayah' && activeTrack.verseKey) {
              void playAdjacentAyah(activeTrack.verseKey, 1);
            } else {
              const next = getNextSurahTrack(activeTrack, 1);
              if (next) void handlePlayTrack(next);
            }
          }
    );
    setHandler(
      'seekto',
      activeTrack.type === 'radio'
        ? null
        : (details) => {
            if (typeof details.seekTime === 'number') handleSeekAudio(details.seekTime);
          }
    );

    return () => {
      setHandler('play', null);
      setHandler('pause', null);
      setHandler('previoustrack', null);
      setHandler('nexttrack', null);
      setHandler('seekto', null);
    };
  });

  // Desktop keyboard shortcuts when audio player is open
  useEffect(() => {
    if (stage !== 'app' || !activeTrack) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        void handleTogglePlayPause();
      } else if (e.key === 'm' || e.key === 'M') {
        setIsMuted((prev) => !prev);
      } else if (e.code === 'ArrowRight' && activeTrack.type !== 'radio') {
        e.preventDefault();
        const delta = lang === 'ar' ? -10 : 10;
        handleSeekAudio((audioRef.current?.currentTime || 0) + delta);
      } else if (e.code === 'ArrowLeft' && activeTrack.type !== 'radio') {
        e.preventDefault();
        const delta = lang === 'ar' ? 10 : -10;
        handleSeekAudio((audioRef.current?.currentTime || 0) + delta);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handlePlayFromVerse = async (verse: Verse) => {
    try {
      const url = await fetchAyahAudioUrl(verse.verse_key, 7);
      const surahId = Number(verse.verse_key.split(':')[0]);
      const ch = chapters.find((c) => c.id === surahId);
      await handlePlayTrack({
        id: `ayah_${verse.verse_key}`,
        type: 'ayah',
        title: `${ch?.name_arabic || surahId} · ${lang === 'ar' ? 'آية' : 'Ayah'} ${verse.verse_number}`,
        subtitle: lang === 'ar' ? 'مشاري العفاسي' : 'Mishary Alafasy',
        url,
        verseKey: verse.verse_key,
        pageNumber: verse.page_number,
      });
    } catch {
      setAudioError(lang === 'ar' ? 'تعذر تحميل صوت الآية' : 'Unable to load verse audio');
    }
  };

  const handlePlaySurahFromMushaf = async (surahId: number) => {
    try {
      const reciters = await fetchReciters(lang);
      const rec = reciters.find((r) => r.id === profile.defaultReciterId) || reciters[0];
      const moshaf = rec?.moshaf[0];
      if (!rec || !moshaf) return;
      const ch = chapters.find((c) => c.id === surahId);
      await handlePlayTrack({
        id: `${rec.id}_${surahId}`,
        type: 'surah',
        title: ch ? (lang === 'ar' ? `سورة ${ch.name_arabic}` : `Surah ${ch.name_simple}`) : `Surah ${surahId}`,
        subtitle: rec.name,
        url: buildSurahAudioUrl(moshaf, surahId),
        surahNumber: surahId,
        reciterId: rec.id,
        moshafServer: moshaf.server,
      });
    } catch {
      setAudioError(lang === 'ar' ? 'تعذر تشغيل السورة حالياً' : 'Unable to start Surah playback');
    }
  };

  const handleChangePage = (page: number, firstSurah?: number, firstAyah?: number) => {
    const today = new Date().toISOString().slice(0, 10);
    setProfile((prev) => {
      const dayIdx = new Date().getDay();
      const updatedWeekly = [...prev.weeklyPages];
      if (page !== prev.lastReadPage) {
        updatedWeekly[dayIdx] = (updatedWeekly[dayIdx] || 0) + 1;
      }
      const nextStreak =
        prev.lastReadDate === today ? Math.max(1, prev.streakDays) : prev.streakDays + 1;
      const next: UserProfile = {
        ...prev,
        lastReadPage: page,
        lastReadSurah: firstSurah ?? prev.lastReadSurah,
        lastReadAyah: firstAyah ?? prev.lastReadAyah,
        lastReadDate: today,
        streakDays: nextStreak,
        weeklyPages: updatedWeekly,
      };
      if (!prev.isGuest) {
        syncUserProfilePatch(prev.uid, {
          lastReadPage: next.lastReadPage,
          lastReadSurah: next.lastReadSurah,
          lastReadAyah: next.lastReadAyah,
          lastReadDate: today,
          streakDays: next.streakDays,
          weeklyPages: next.weeklyPages,
        }).catch(() => {});
      }
      return next;
    });
  };

  const handleSaveBookmark = (verse: Verse, highlightColor: HighlightColor, note: string) => {
    const surahNumber = Number(verse.verse_key.split(':')[0]);
    const nowIso = new Date().toISOString();
    const bm: VerseBookmark = {
      id: verse.verse_key.replace(':', '_'),
      uid: profile.uid,
      verseKey: verse.verse_key,
      surahNumber,
      ayahNumber: verse.verse_number,
      pageNumber: verse.page_number,
      highlightColor,
      note,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setBookmarks((prev) => {
      const rest = prev.filter((item) => item.verseKey !== verse.verse_key);
      return [bm, ...rest];
    });
    if (!profile.isGuest) {
      upsertVerseBookmark(profile.uid, bm).catch(() => {});
    }
  };

  const handleRemoveBookmark = (verseKey: string) => {
    setBookmarks((prev) => prev.filter((b) => b.verseKey !== verseKey));
    if (!profile.isGuest) {
      removeVerseBookmark(profile.uid, verseKey).catch(() => {});
    }
  };

  const handleUpdateKhatma = (targetDays: number, logPages = 0) => {
    setProfile((prev) => {
      const nextPage = Math.min(604, prev.khatmaCurrentPage + logPages);
      const next = {
        ...prev,
        khatmaTargetDays: targetDays,
        khatmaCurrentPage: nextPage,
      };
      if (!prev.isGuest) {
        syncUserProfilePatch(prev.uid, {
          khatmaTargetDays: targetDays,
          khatmaCurrentPage: nextPage,
        }).catch(() => {});
      }
      return next;
    });
  };

  const handleAddMemorization = (surahNumber: number, startAyah: number, endAyah: number) => {
    const now = new Date().toISOString();
    const item: MemorizationItem = {
      id: `mem_${surahNumber}_${startAyah}_${endAyah}`,
      uid: profile.uid,
      surahNumber,
      startAyah,
      endAyah,
      repetitions: 0,
      easeFactor: 2.5,
      intervalDays: 1,
      nextReviewDate: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
    };
    setMemorization((prev) => [item, ...prev.filter((m) => m.id !== item.id)]);
    if (!profile.isGuest) {
      upsertMemorizationItem(profile.uid, item).catch(() => {});
    }
  };

  const handleReviewMemorization = (item: MemorizationItem, rating: 'hard' | 'good' | 'easy') => {
    const quality = rating === 'easy' ? 5 : rating === 'good' ? 4 : 2;
    const nextReps = quality < 3 ? 0 : item.repetitions + 1;
    const nextInterval =
      nextReps <= 1 ? 1 : nextReps === 2 ? 6 : Math.round(item.intervalDays * item.easeFactor);
    const nextEase = Math.max(1.3, Number((item.easeFactor + (0.1 - (5 - quality) * 0.08)).toFixed(2)));
    const nextDate = new Date(Date.now() + nextInterval * 86400000).toISOString().slice(0, 10);

    const updated: MemorizationItem = {
      ...item,
      repetitions: nextReps,
      intervalDays: nextInterval,
      easeFactor: nextEase,
      nextReviewDate: nextDate,
      updatedAt: new Date().toISOString(),
    };
    setMemorization((prev) => prev.map((m) => (m.id === item.id ? updated : m)));
    if (!profile.isGuest) {
      upsertMemorizationItem(profile.uid, updated).catch(() => {});
    }
  };

  const handleToggleFavoriteRadio = (radio: RadioStation) => {
    const exists = favoriteRadios.some((f) => f.radioId === radio.id);
    if (exists) {
      setFavoriteRadios((prev) => prev.filter((f) => f.radioId !== radio.id));
    } else {
      const entry: FavoriteRadio = {
        id: `radio_${radio.id}`,
        uid: profile.uid,
        radioId: radio.id,
        name: radio.name,
        url: radio.url,
        createdAt: new Date().toISOString(),
      };
      setFavoriteRadios((prev) => [entry, ...prev]);
    }
    if (!profile.isGuest) {
      toggleFavoriteRadioRemote(profile.uid, radio, exists).catch(() => {});
    }
  };

  const handleLogout = async () => {
    if (!profile.isGuest) {
      await logoutAccount().catch(() => {});
    }
    setProfile(createDefaultProfile(lang, theme));
    setStage('auth');
  };

  const handleDeleteAccount = async () => {
    await deleteCurrentAccount();
    setProfile(createDefaultProfile(lang, theme));
    setStage('auth');
  };

  if (isAdminRoute) {
    return (
      <AdminDashboard
        lang={lang}
        currentAppearance={appearance}
        onExitAdmin={() => {
          window.history.pushState(null, '', '/');
          setIsAdminRoute(false);
        }}
      />
    );
  }

  if (stage !== 'app') {
    return (
      <div className="relative min-h-screen bg-[#f7f3ea] dark:bg-[#0b1411] geometric-pattern">
        {stage !== 'splash' && <AppBackdrop appearance={appearance} />}
        <div className="relative z-10">
          <AuthFlow
            stage={stage}
            lang={lang}
            theme={theme}
            onToggleLang={toggleLanguage}
            onToggleTheme={toggleTheme}
            onChangeStage={setStage}
            onGuestContinue={handleGuestContinue}
          />
        </div>
      </div>
    );
  }

  const copy = t(lang);
  const navItems: { id: AppTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: copy.navHome, icon: Home },
    { id: 'quran', label: copy.navQuran, icon: BookOpen },
    { id: 'listen', label: copy.navListen, icon: Headphones },
    { id: 'worship', label: copy.navWorship, icon: Compass },
    { id: 'profile', label: copy.navProfile, icon: UserIcon },
  ];

  return (
    <div className="relative min-h-screen bg-[#f7f3ea] dark:bg-[#0b1411] text-[#17211d] dark:text-[#ede7da] geometric-pattern flex flex-col lg:flex-row">
      <AppBackdrop appearance={appearance} />
      {/* Desktop Side Rail */}
      <aside className="hidden lg:flex lg:w-64 xl:w-72 lg:flex-col lg:fixed lg:inset-y-0 lg:start-0 crystal-nav border-e border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 justify-between z-30">
        <div className="space-y-8">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#c9a44c]/50 bg-[#0f6b4f]">
              <img src={SPLASH_EMBLEM} alt="نور" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-quran text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c] block leading-none">
                {copy.appName}
              </span>
              <span className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'رفيق القرآن' : 'Quran Companion'}
              </span>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[46px] px-4 rounded-2xl flex items-center gap-3 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-[#0f6b4f] text-white shadow-sm'
                      : 'text-[#5c6862] dark:text-[#98a69f] hover:bg-[#0f6b4f]/10 hover:text-[#17211d] dark:hover:text-[#ede7da]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex-1 min-h-[42px] rounded-xl border border-[#0f6b4f]/20 text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={copy.themeLabel}
            className="w-11 h-11 rounded-xl border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/8 transition-colors"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-[#c9a44c]" />}
          </button>
        </div>
      </aside>

      {/* Mobile & Tablet Compact Header */}
      <header className="lg:hidden sticky top-0 z-30 h-14 px-4 sm:px-6 crystal-nav border-b border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-[#c9a44c]/40 bg-[#0f6b4f]">
            <img src={SPLASH_EMBLEM} alt="نور" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          </div>
          <span className="font-quran text-xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">{copy.appName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLanguage}
            className="min-h-[40px] px-3 rounded-xl border border-[#0f6b4f]/20 text-xs font-semibold"
          >
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={copy.themeLabel}
            className="w-10 h-10 rounded-xl border border-[#0f6b4f]/20 flex items-center justify-center"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-[#c9a44c]" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className={`relative z-10 flex-1 lg:ps-64 xl:ps-72 ${activeTrack ? 'pb-40 lg:pb-28' : 'pb-24 lg:pb-12'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
          {activeTab === 'home' && (
            <HomeView
              lang={lang}
              profile={profile}
              chapters={chapters}
              memorizationItems={memorization}
              onOpenMushafPage={(p) => {
                handleChangePage(p);
                setActiveTab('quran');
              }}
              onNavigateTab={setActiveTab}
              onUpdateKhatma={handleUpdateKhatma}
              onAddMemorization={handleAddMemorization}
              onReviewMemorization={handleReviewMemorization}
            />
          )}

          {activeTab === 'quran' && (
            <MushafView
              lang={lang}
              chapters={chapters}
              currentPage={profile.lastReadPage}
              bookmarks={bookmarks}
              activePlayingVerseKey={activeTrack?.verseKey}
              onChangePage={handleChangePage}
              onSaveBookmark={handleSaveBookmark}
              onPlayFromVerse={handlePlayFromVerse}
              onPlaySurahFromMushaf={handlePlaySurahFromMushaf}
            />
          )}

          {activeTab === 'listen' && (
            <ListenView
              lang={lang}
              chapters={chapters}
              activeTrack={activeTrack}
              isPlaying={isPlaying}
              favoriteRadios={favoriteRadios}
              defaultReciterId={profile.defaultReciterId}
              onPlayTrack={handlePlayTrack}
              onTogglePlayPause={handleTogglePlayPause}
              onToggleFavoriteRadio={handleToggleFavoriteRadio}
              onSelectDefaultReciter={(reciterId) => {
                setProfile((p) => ({ ...p, defaultReciterId: reciterId }));
                if (!profile.isGuest) {
                  syncUserProfilePatch(profile.uid, { defaultReciterId: reciterId }).catch(() => {});
                }
              }}
            />
          )}

          {activeTab === 'worship' && <WorshipView lang={lang} />}

          {activeTab === 'profile' && (
            <ProfileView
              lang={lang}
              theme={theme}
              profile={profile}
              chapters={chapters}
              bookmarks={bookmarks}
              onToggleLang={toggleLanguage}
              onToggleTheme={toggleTheme}
              onOpenBookmarkPage={(page) => {
                handleChangePage(page);
                setActiveTab('quran');
              }}
              onRemoveBookmark={handleRemoveBookmark}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
            />
          )}
        </div>
      </main>

      {/* Persistent Audio Player */}
      {activeTrack && (
        <div className="fixed bottom-18 lg:bottom-4 start-3 end-3 lg:start-72 xl:start-80 lg:end-8 z-40">
          <AudioPlayerBar
            lang={lang}
            track={activeTrack}
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            audioError={audioError}
            currentTime={currentTime}
            duration={duration}
            speed={speed}
            repeat={repeat}
            sleepMinutes={sleepMinutes}
            volume={volume}
            isMuted={isMuted}
            canSkipPrev={
              activeTrack.type === 'ayah' ||
              (activeTrack.type === 'surah' && Boolean(activeTrack.moshafServer) && (activeTrack.surahNumber || 1) > 1)
            }
            canSkipNext={
              activeTrack.type === 'ayah' ||
              (activeTrack.type === 'surah' && Boolean(activeTrack.moshafServer) && (activeTrack.surahNumber || 114) < 114)
            }
            onTogglePlay={handleTogglePlayPause}
            onSeek={handleSeekAudio}
            onSkipPrev={() => {
              if (activeTrack.type === 'ayah' && activeTrack.verseKey) {
                void playAdjacentAyah(activeTrack.verseKey, -1);
              } else {
                const prev = getNextSurahTrack(activeTrack, -1);
                if (prev) void handlePlayTrack(prev);
              }
            }}
            onSkipNext={() => {
              if (activeTrack.type === 'ayah' && activeTrack.verseKey) {
                void playAdjacentAyah(activeTrack.verseKey, 1);
              } else {
                const next = getNextSurahTrack(activeTrack, 1);
                if (next) void handlePlayTrack(next);
              }
            }}
            onCycleSpeed={() => {
              const speeds = [0.75, 1, 1.25, 1.5, 2];
              const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
              setSpeed(next);
              if (audioRef.current) audioRef.current.playbackRate = next;
            }}
            onToggleRepeat={() => {
              const next = !repeat;
              setRepeat(next);
              if (audioRef.current) audioRef.current.loop = next;
            }}
            onCycleSleep={() => {
              const options = [null, 15, 30, 60];
              const next = options[(options.indexOf(sleepMinutes) + 1) % options.length];
              setSleepMinutes(next);
            }}
            onToggleMute={() => setIsMuted((prev) => !prev)}
            onVolumeChange={(vol) => {
              setVolume(vol);
              if (vol > 0 && isMuted) setIsMuted(false);
            }}
            onClose={() => {
              playTokenRef.current++;
              void safePauseAudio();
              setIsPlaying(false);
              setIsBuffering(false);
              setAudioError(null);
              setActiveTrack(null);
            }}
          />
        </div>
      )}

      {/* Mobile & Tablet Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 min-h-16 pb-safe crystal-nav border-t border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 grid grid-cols-5 items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[52px] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                active ? 'text-[#0f6b4f] dark:text-[#c9a44c]' : 'text-[#5c6862] dark:text-[#98a69f]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <NourRoot />
    </ErrorBoundary>
  );
}
