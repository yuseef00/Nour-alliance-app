/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, HeartHandshake, Menu, Moon, ShieldCheck, Sun, X } from 'lucide-react';
import {
  AppAppearance,
  AppTab,
  AudioTrack,
  AuthStage,
  Chapter,
  FavoriteRadio,
  HighlightColor,
  Language,
  LastListenedInfo,
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
  reloadCurrentUser,
  removeVerseBookmark,
  resendVerificationEmail,
  subscribeToAppAppearance,
  subscribeToAuth,
  syncUserProfilePatch,
  toggleFavoriteRadioRemote,
  upsertMemorizationItem,
  upsertVerseBookmark,
} from './services/firebase';
import {
  fetchAyahAudioUrl,
  fetchChapters,
  fetchQdcReciters,
  fetchVerseByKey,
  fetchVersePageNumber,
  matchReciterToQdcId,
} from './services/quranApi';
import { buildSurahAudioUrl, fetchReciters, resolveAudioPlaybackUrl } from './services/mp3QuranApi';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthFlow } from './components/AuthFlow';
import { HomeView } from './components/HomeView';
import { MushafView } from './components/MushafView';
import { ListenView } from './components/ListenView';
import { LibraryView } from './components/LibraryView';
import { WorshipView } from './components/WorshipView';
import { ProfileView } from './components/ProfileView';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { AdminDashboard } from './components/AdminDashboard';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PrayerNotificationBoard } from './components/PrayerNotificationBoard';
import { PrivacyPolicyView } from './components/PrivacyPolicyView';
import {
  checkAndNotifyExactPrayerTime,
  getNotificationPermissionState,
  isInAppPrayerBoardVisible,
  isOsPrayerBoardEnabled,
  pushPrayerBoardNotification,
  setInAppPrayerBoardVisible,
} from './services/prayerNotificationService';
import {
  applyRouteDocumentMeta,
  getTabDefaultPath,
  isAdminRoutePath,
  matchPublicRoute,
  normalizePathname,
} from './utils/seoRoutes';
import {
  getUserScopedKey,
  migrateLegacyGuestStorageOnce,
  normalizeAccountId,
  readUserScoped,
  writeUserScoped,
} from './utils/userStorage';

const ACTIVE_UID_KEY = 'nour_active_uid_v1';
const SPLASH_EMBLEM = '/src/assets/images/nour_logo.png';

if (typeof window !== 'undefined') {
  migrateLegacyGuestStorageOnce();
}

interface AccountDataBundle {
  profile: UserProfile;
  bookmarks: VerseBookmark[];
  memorization: MemorizationItem[];
  favoriteRadios: FavoriteRadio[];
}

function AppBackdrop({ appearance }: { appearance: AppAppearance }) {
  if (appearance.backgroundType === 'none' || !appearance.backgroundUrl) return null;
  const isDefaultMosque = appearance.backgroundType === 'default_mosque';
  const safeOpacity = Math.min(0.14, Math.max(0.04, appearance.backgroundOpacity ?? 0.12));
  const safeBlur = Math.max(2, appearance.backgroundBlur ?? 2);
  return (
    <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
      <img
        src={appearance.backgroundUrl}
        alt=""
        referrerPolicy="no-referrer"
        style={{
          opacity: safeOpacity,
          filter: `blur(${safeBlur}px)`,
        }}
        className={`w-full h-full ${
          isDefaultMosque
            ? 'object-contain object-bottom mx-auto mix-blend-multiply dark:mix-blend-screen'
            : 'object-cover object-center'
        }`}
      />
      <div className="absolute inset-0 bg-[#f7f3ea]/35 dark:bg-[#0b1411]/45" />
    </div>
  );
}

function createDefaultProfile(lang: Language, theme: ThemeMode, uid = 'guest', isGuest = true): UserProfile {
  const today = new Date().toISOString().slice(0, 10);
  return {
    uid,
    displayName: lang === 'ar' ? 'ضيف نور' : 'Nour Guest',
    language: lang,
    theme,
    defaultReciterId: 7,
    streakDays: 0,
    lastReadPage: 1,
    lastReadSurah: 1,
    lastReadAyah: 1,
    lastReadDate: today,
    khatmaTargetDays: 30,
    khatmaCurrentPage: 1,
    khatmaStartDate: today,
    weeklyPages: [0, 0, 0, 0, 0, 0, 0],
    isGuest,
    emailVerified: false,
  };
}

function createCleanAccountDefaults(
  lang: Language,
  theme: ThemeMode
): Omit<UserProfile, 'uid' | 'displayName' | 'email' | 'isGuest' | 'emailVerified'> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    language: lang,
    theme,
    defaultReciterId: 7,
    streakDays: 0,
    lastReadPage: 1,
    lastReadSurah: 1,
    lastReadAyah: 1,
    lastReadDate: today,
    khatmaTargetDays: 30,
    khatmaCurrentPage: 1,
    khatmaStartDate: today,
    weeklyPages: [0, 0, 0, 0, 0, 0, 0],
  };
}

function createEmptyAccountBundle(lang: Language, theme: ThemeMode, uid = 'guest', isGuest = true): AccountDataBundle {
  return {
    profile: createDefaultProfile(lang, theme, uid, isGuest),
    bookmarks: [],
    memorization: [],
    favoriteRadios: [],
  };
}

function loadAccountBundleFromLocal(uid: string, lang: Language, theme: ThemeMode, isGuest: boolean): AccountDataBundle {
  const norm = normalizeAccountId(uid);
  const cached = readUserScoped<AccountDataBundle | null>(norm, 'state_v2', null);
  if (cached && cached.profile && normalizeAccountId(cached.profile.uid) === norm) {
    return {
      profile: cached.profile,
      bookmarks: Array.isArray(cached.bookmarks) ? cached.bookmarks : [],
      memorization: Array.isArray(cached.memorization) ? cached.memorization : [],
      favoriteRadios: Array.isArray(cached.favoriteRadios) ? cached.favoriteRadios : [],
    };
  }
  return createEmptyAccountBundle(lang, theme, norm, isGuest);
}

function NourRoot() {
  const [lang, setLang] = useState<Language>(() =>
    localStorage.getItem('nour_lang') === 'en' ? 'en' : 'ar'
  );
  const [theme, setTheme] = useState<ThemeMode>(() =>
    localStorage.getItem('nour_theme') === 'dark' ? 'dark' : 'light'
  );
  const [stage, setStage] = useState<AuthStage>('app');
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? isAdminRoutePath(window.location.pathname, window.location.hash)
      : false
  );
  const [isPrivacyPolicyRoute, setIsPrivacyPolicyRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return normalizePathname(window.location.pathname) === '/privacy-policy';
  });
  const [isNotFoundRoute, setIsNotFoundRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (isAdminRoutePath(window.location.pathname, window.location.hash)) return false;
    if (normalizePathname(window.location.pathname) === '/privacy-policy') return false;
    return !matchPublicRoute(window.location.pathname);
  });
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    if (typeof window === 'undefined') return 'home';
    const matched = matchPublicRoute(window.location.pathname);
    return matched ? matched.tab : 'home';
  });
  const [isTafsirRoute, setIsTafsirRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return normalizePathname(window.location.pathname) === '/tafsir';
  });
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [openReciterId, setOpenReciterId] = useState<number | null>(null);
  const [appearance, setAppearance] = useState<AppAppearance>(DEFAULT_APP_APPEARANCE);
  const [showPrayerBoard, setShowPrayerBoard] = useState<boolean>(() => isInAppPrayerBoardVisible());

  const initialUid =
    typeof window !== 'undefined' ? normalizeAccountId(localStorage.getItem(ACTIVE_UID_KEY)) : 'guest';

  const [accountBundle, setAccountBundle] = useState<AccountDataBundle>(() =>
    loadAccountBundleFromLocal(initialUid, lang, theme, initialUid === 'guest')
  );
  const { profile, bookmarks, memorization, favoriteRadios } = accountBundle;

  const [lastListened, setLastListened] = useState<LastListenedInfo | null>(() =>
    readUserScoped<LastListenedInfo | null>(initialUid, 'last_listened', null)
  );
  const [favoriteReciterIds, setFavoriteReciterIds] = useState<number[]>(() =>
    readUserScoped<number[]>(initialUid, 'fav_reciters', [])
  );

  const [chapters, setChapters] = useState<Chapter[]>([]);

  // Audio Engine State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<AudioTrack | null>(null);
  const [audioQueue, setAudioQueue] = useState<AudioTrack[]>([]);
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

  useEffect(() => {
    setFavoriteReciterIds(readUserScoped<number[]>(profile.uid, 'fav_reciters', []));
  }, [profile.uid]);

  const handleToggleFavoriteReciter = useCallback(
    (reciterId: number) => {
      setFavoriteReciterIds((prev) => {
        const next = prev.includes(reciterId) ? prev.filter((id) => id !== reciterId) : [reciterId, ...prev];
        writeUserScoped(profile.uid, 'fav_reciters', next);
        return next;
      });
    },
    [profile.uid]
  );

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

  // Atomic per-UID local cache persistence (guarantees Account A never leaks into Account B or Guest)
  useEffect(() => {
    writeUserScoped(accountBundle.profile.uid, 'state_v2', accountBundle);
  }, [accountBundle]);

  // Sync route state & SEO meta tags on URL navigation (public routes, /admin, privacy policy, and 404)
  useEffect(() => {
    const syncRoute = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const normPath = normalizePathname(path);
      const isPrivacy = normPath === '/privacy-policy';
      const admin = isAdminRoutePath(path, hash);
      const matched = admin || isPrivacy ? null : matchPublicRoute(path);
      const notFound = !admin && !isPrivacy && !matched;
      setIsAdminRoute(admin);
      setIsPrivacyPolicyRoute(isPrivacy);
      setIsNotFoundRoute(notFound);
      setIsTafsirRoute(normPath === '/tafsir');
      if (matched) {
        setActiveTab(matched.tab);
        if (matched.path === '/adhkar') {
          window.setTimeout(() => {
            document.getElementById('adhkar-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 180);
        }
      }
      applyRouteDocumentMeta(path, admin, notFound);
    };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  useEffect(() => {
    applyRouteDocumentMeta(window.location.pathname, isAdminRoute, isNotFoundRoute);
  }, [activeTab, isAdminRoute, isNotFoundRoute]);

  const navigateToTab = useCallback((tab: AppTab, targetPath?: string) => {
    const nextPath = targetPath || getTabDefaultPath(tab);
    setIsAdminRoute(false);
    setIsPrivacyPolicyRoute(false);
    setIsNotFoundRoute(false);
    setMoreDrawerOpen(false);
    setIsTafsirRoute(nextPath === '/tafsir');
    setActiveTab(tab);
    setStage('app');
    if (typeof window !== 'undefined') {
      const curNorm = normalizePathname(window.location.pathname);
      if (tab !== 'profile' && curNorm !== nextPath) {
        window.history.pushState(null, '', nextPath);
      }
      applyRouteDocumentMeta(nextPath, false, false);
      if (nextPath === '/adhkar') {
        window.setTimeout(() => {
          document.getElementById('adhkar-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 180);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, []);

  // Subscribe to global appearance config (wallpaper) & record anonymous visit
  useEffect(() => {
    const unsub = subscribeToAppAppearance(setAppearance);
    if (!isAdminRoutePath(window.location.pathname, window.location.hash)) {
      void recordSiteVisit(lang);
    }
    return unsub;
  }, []);

  // Load Quran chapters for the active language
  useEffect(() => {
    fetchChapters(lang).then(setChapters).catch(() => {});
  }, [lang]);

  // Subscribe to Firebase Authentication (never auto-logout; strict per-UID account isolation)
  useEffect(() => {
    const unsub = subscribeToAuth(async (user) => {
      if (!user) return;
      try {
        localStorage.setItem(ACTIVE_UID_KEY, user.uid);
        localStorage.setItem('nour_onboarded', '1');
      } catch {
        // ignore storage restrictions
      }

      // Immediately isolate local bundle & lastListened strictly to this user.uid
      const localCached = loadAccountBundleFromLocal(user.uid, lang, theme, false);
      setAccountBundle(localCached);
      setLastListened(readUserScoped<LastListenedInfo | null>(user.uid, 'last_listened', null));

      try {
        const cleanDefaults = createCleanAccountDefaults(lang, theme);
        const loaded = await loadOrCreateUserProfile(user, cleanDefaults);
        let bms = localCached.bookmarks;
        let mems = localCached.memorization;
        let favs = localCached.favoriteRadios;

        if (user.emailVerified) {
          const [remoteBms, remoteMems, remoteFavs] = await Promise.all([
            fetchUserBookmarks(user.uid),
            fetchMemorizationItems(user.uid),
            fetchFavoriteRadios(user.uid),
          ]);
          bms = remoteBms;
          mems = remoteMems;
          favs = remoteFavs;
        }

        setAccountBundle({
          profile: loaded,
          bookmarks: bms,
          memorization: mems,
          favoriteRadios: favs,
        });
        setLang(loaded.language);
        setTheme(loaded.theme);
        setStage('app');
      } catch (err) {
        console.error(err);
        setAccountBundle((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            uid: user.uid,
            displayName:
              prev.profile.uid === user.uid && prev.profile.displayName
                ? prev.profile.displayName
                : user.displayName || (lang === 'ar' ? 'قارئ نور' : 'Nour Reader'),
            email: user.email || prev.profile.email,
            emailVerified: user.emailVerified,
            isGuest: false,
          },
        }));
        setStage('app');
      }
    });
    return unsub;
  }, []);

  // Periodic background sync for persistent OS prayer times notification board
  useEffect(() => {
    if (stage !== 'app') return;
    const syncOsPrayerBoard = () => {
      if (isOsPrayerBoardEnabled() && getNotificationPermissionState() === 'granted') {
        void pushPrayerBoardNotification(lang);
        void checkAndNotifyExactPrayerTime(lang);
      }
    };
    syncOsPrayerBoard();
    const id = window.setInterval(syncOsPrayerBoard, 60000);
    return () => window.clearInterval(id);
  }, [stage, lang]);

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
    setAccountBundle((prev) => ({ ...prev, profile: { ...prev.profile, language: next } }));
    if (!profile.isGuest) {
      syncUserProfilePatch(profile.uid, { language: next }).catch(() => {});
    }
  }, [lang, profile.isGuest, profile.uid]);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setAccountBundle((prev) => ({ ...prev, profile: { ...prev.profile, theme: next } }));
    if (!profile.isGuest) {
      syncUserProfilePatch(profile.uid, { theme: next }).catch(() => {});
    }
  }, [theme, profile.isGuest, profile.uid]);

  const handleGuestContinue = () => {
    try {
      localStorage.removeItem(ACTIVE_UID_KEY);
      localStorage.setItem('nour_onboarded', '1');
    } catch {
      // ignore
    }
    setAccountBundle(loadAccountBundleFromLocal('guest', lang, theme, true));
    setLastListened(readUserScoped<LastListenedInfo | null>('guest', 'last_listened', null));
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

  const resolveActiveAyahReciter = async (): Promise<{ qdcId: number; name: string }> => {
    const fallbackName = lang === 'ar' ? 'مشاري راشد العفاسي' : 'Mishary Alafasy';
    try {
      const [reciters, qdcList] = await Promise.all([
        fetchReciters(lang).catch(() => []),
        fetchQdcReciters().catch(() => []),
      ]);
      const selected = reciters.find((r) => r.id === profile.defaultReciterId);
      if (selected) {
        const matchedQdc = matchReciterToQdcId(selected.name, qdcList);
        if (matchedQdc) {
          const matchedEntry = qdcList.find((q) => q.id === matchedQdc);
          return {
            qdcId: matchedQdc,
            name:
              lang === 'ar'
                ? matchedEntry?.translated_name?.name || selected.name
                : matchedEntry?.reciter_name || selected.name,
          };
        }
      }
    } catch {
      // Fallback to default QDC reciter 7
    }
    return { qdcId: 7, name: fallbackName };
  };

  const playAdjacentAyah = async (
    verseKey: string,
    delta: 1 | -1,
    overrideReciter?: { qdcId: number; name: string }
  ) => {
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
      const recInfo = overrideReciter || (await resolveActiveAyahReciter());
      const [url, nextPage, verseObj] = await Promise.all([
        fetchAyahAudioUrl(nextKey, recInfo.qdcId).catch(() => fetchAyahAudioUrl(nextKey, 7)),
        fetchVersePageNumber(nextKey),
        fetchVerseByKey(nextKey).catch(() => null),
      ]);
      const resolvedPage = nextPage ?? verseObj?.page_number ?? lastReadPageRef.current;
      if (resolvedPage && resolvedPage !== lastReadPageRef.current) {
        handleChangePage(resolvedPage, surahId, ayahNum);
      } else {
        handleTrackReadingAyah(resolvedPage || 1, surahId, ayahNum);
      }
      const nextCh = chapters.find((c) => c.id === surahId);
      await handlePlayTrack({
        id: `ayah_${nextKey}_${recInfo.qdcId}`,
        type: 'ayah',
        title: `${nextCh?.name_arabic || surahId} · ${lang === 'ar' ? 'آية' : 'Ayah'} ${ayahNum}`,
        subtitle: recInfo.name,
        url,
        surahNumber: surahId,
        ayahNumber: ayahNum,
        reciterId: recInfo.qdcId,
        reciterName: recInfo.name,
        verseKey: nextKey,
        verseText: verseObj?.text_uthmani,
        pageNumber: nextPage ?? verseObj?.page_number ?? undefined,
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

    if (track.type === 'ayah' || track.type === 'surah') {
      const info: LastListenedInfo = {
        trackId: track.id,
        type: track.type,
        title: track.title,
        subtitle: track.subtitle,
        url: track.url,
        reciterId: track.reciterId,
        reciterName: track.reciterName || track.subtitle,
        surahNumber: track.surahNumber,
        ayahNumber: track.ayahNumber,
        verseKey: track.verseKey,
        verseText: track.verseText,
        pageNumber: track.pageNumber,
        moshafServer: track.moshafServer,
        listenedAt: new Date().toISOString(),
      };
      setLastListened(info);
      writeUserScoped(profile.uid, 'last_listened', info);
      if (track.reciterId && track.surahNumber) {
        writeUserScoped(profile.uid, `reciter_last_${track.reciterId}`, track.surahNumber);
      }
    }

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
    audio.currentTime = 0;
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
        setAudioError(lang === 'ar' ? 'تعذر تشغيل هذا المقطع الصوتي حاليًا' : 'Audio stream unavailable');
      }
    };
    audio.onended = () => {
      if (token !== playTokenRef.current || audio.loop) return;
      const qIdx = audioQueue.findIndex((item) => item.url === track.url);
      if (qIdx >= 0 && qIdx + 1 < audioQueue.length) {
        void handlePlayTrack(audioQueue[qIdx + 1]);
        return;
      }
      if (track.type === 'ayah' && track.verseKey) {
        const recOverride =
          track.reciterId && track.reciterName
            ? { qdcId: track.reciterId, name: track.reciterName }
            : undefined;
        void playAdjacentAyah(track.verseKey, 1, recOverride);
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
      const recInfo = await resolveActiveAyahReciter();
      const url = await fetchAyahAudioUrl(verse.verse_key, recInfo.qdcId).catch(() =>
        fetchAyahAudioUrl(verse.verse_key, 7)
      );
      const surahId = Number(verse.verse_key.split(':')[0]);
      handleTrackReadingAyah(verse.page_number || lastReadPageRef.current, surahId, verse.verse_number);
      const ch = chapters.find((c) => c.id === surahId);
      await handlePlayTrack({
        id: `ayah_${verse.verse_key}_${recInfo.qdcId}`,
        type: 'ayah',
        title: `${ch?.name_arabic || surahId} · ${lang === 'ar' ? 'آية' : 'Ayah'} ${verse.verse_number}`,
        subtitle: recInfo.name,
        url,
        surahNumber: surahId,
        ayahNumber: verse.verse_number,
        reciterId: recInfo.qdcId,
        reciterName: recInfo.name,
        verseKey: verse.verse_key,
        verseText: verse.text_uthmani,
        pageNumber: verse.page_number,
      });
    } catch {
      setAudioError(lang === 'ar' ? 'تعذر تحميل صوت الآية' : 'Unable to load verse audio');
    }
  };

  const handleResumeLastListened = (info: LastListenedInfo) => {
    void handlePlayTrack({
      id: info.trackId,
      type: info.type,
      title: info.title,
      subtitle: info.subtitle,
      url: info.url,
      reciterId: info.reciterId,
      reciterName: info.reciterName,
      surahNumber: info.surahNumber,
      ayahNumber: info.ayahNumber,
      verseKey: info.verseKey,
      verseText: info.verseText,
      pageNumber: info.pageNumber,
      moshafServer: info.moshafServer,
    });
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
        reciterName: rec.name,
        moshafServer: moshaf.server,
      });
    } catch {
      setAudioError(lang === 'ar' ? 'تعذر تشغيل السورة حالياً' : 'Unable to start Surah playback');
    }
  };

  const handleTrackReadingAyah = useCallback((page: number, surahNum: number, ayahNum: number) => {
    const today = new Date().toISOString().slice(0, 10);
    setAccountBundle((prev) => {
      const prevProfile = prev.profile;
      if (
        prevProfile.lastReadPage === page &&
        prevProfile.lastReadSurah === surahNum &&
        prevProfile.lastReadAyah === ayahNum &&
        prevProfile.lastReadDate === today
      ) {
        return prev;
      }
      const next: UserProfile = {
        ...prevProfile,
        lastReadPage: page,
        lastReadSurah: surahNum,
        lastReadAyah: ayahNum,
        lastReadDate: today,
      };
      if (!prevProfile.isGuest) {
        syncUserProfilePatch(prevProfile.uid, {
          lastReadPage: next.lastReadPage,
          lastReadSurah: next.lastReadSurah,
          lastReadAyah: next.lastReadAyah,
          lastReadDate: today,
        }).catch(() => {});
      }
      return { ...prev, profile: next };
    });
  }, []);

  const handleChangePage = (page: number, firstSurah?: number, firstAyah?: number) => {
    const today = new Date().toISOString().slice(0, 10);
    setAccountBundle((prev) => {
      const prevProfile = prev.profile;
      const dayIdx = new Date().getDay();
      const updatedWeekly = [...prevProfile.weeklyPages];
      if (page !== prevProfile.lastReadPage) {
        updatedWeekly[dayIdx] = (updatedWeekly[dayIdx] || 0) + 1;
      }
      const nextStreak =
        prevProfile.lastReadDate === today ? Math.max(1, prevProfile.streakDays) : prevProfile.streakDays + 1;
      const next: UserProfile = {
        ...prevProfile,
        lastReadPage: page,
        lastReadSurah: firstSurah ?? prevProfile.lastReadSurah,
        lastReadAyah: firstAyah ?? prevProfile.lastReadAyah,
        lastReadDate: today,
        streakDays: nextStreak,
        weeklyPages: updatedWeekly,
      };
      if (!prevProfile.isGuest) {
        syncUserProfilePatch(prevProfile.uid, {
          lastReadPage: next.lastReadPage,
          lastReadSurah: next.lastReadSurah,
          lastReadAyah: next.lastReadAyah,
          lastReadDate: today,
          streakDays: next.streakDays,
          weeklyPages: next.weeklyPages,
        }).catch(() => {});
      }
      return { ...prev, profile: next };
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
    setAccountBundle((prev) => {
      const rest = prev.bookmarks.filter((item) => item.verseKey !== verse.verse_key);
      return { ...prev, bookmarks: [bm, ...rest] };
    });
    if (!profile.isGuest) {
      upsertVerseBookmark(profile.uid, bm).catch(() => {});
    }
  };

  const handleRemoveBookmark = (verseKey: string) => {
    setAccountBundle((prev) => ({
      ...prev,
      bookmarks: prev.bookmarks.filter((b) => b.verseKey !== verseKey),
    }));
    if (!profile.isGuest) {
      removeVerseBookmark(profile.uid, verseKey).catch(() => {});
    }
  };

  const handleUpdateKhatma = (targetDays: number, logPages = 0) => {
    setAccountBundle((prev) => {
      const nextPage = Math.max(1, Math.min(604, prev.profile.khatmaCurrentPage + logPages));
      const next: UserProfile = {
        ...prev.profile,
        khatmaTargetDays: targetDays,
        khatmaCurrentPage: nextPage,
      };
      if (!prev.profile.isGuest) {
        syncUserProfilePatch(prev.profile.uid, {
          khatmaTargetDays: targetDays,
          khatmaCurrentPage: nextPage,
        }).catch(() => {});
      }
      return { ...prev, profile: next };
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
    setAccountBundle((prev) => ({
      ...prev,
      memorization: [item, ...prev.memorization.filter((m) => m.id !== item.id)],
    }));
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
    setAccountBundle((prev) => ({
      ...prev,
      memorization: prev.memorization.map((m) => (m.id === item.id ? updated : m)),
    }));
    if (!profile.isGuest) {
      upsertMemorizationItem(profile.uid, updated).catch(() => {});
    }
  };

  const handleToggleFavoriteRadio = (radio: RadioStation) => {
    const exists = favoriteRadios.some((f) => f.radioId === radio.id);
    if (exists) {
      setAccountBundle((prev) => ({
        ...prev,
        favoriteRadios: prev.favoriteRadios.filter((f) => f.radioId !== radio.id),
      }));
    } else {
      const entry: FavoriteRadio = {
        id: `radio_${radio.id}`,
        uid: profile.uid,
        radioId: radio.id,
        name: radio.name,
        url: radio.url,
        createdAt: new Date().toISOString(),
      };
      setAccountBundle((prev) => ({
        ...prev,
        favoriteRadios: [entry, ...prev.favoriteRadios],
      }));
    }
    if (!profile.isGuest) {
      toggleFavoriteRadioRemote(profile.uid, radio, exists).catch(() => {});
    }
  };

  const handleRefreshVerification = async (): Promise<boolean> => {
    const refreshed = await reloadCurrentUser();
    if (!refreshed || !refreshed.emailVerified) return false;
    const cleanDefaults = createCleanAccountDefaults(lang, theme);
    const loaded = await loadOrCreateUserProfile(refreshed, cleanDefaults);
    const [bms, mems, favs] = await Promise.all([
      fetchUserBookmarks(refreshed.uid),
      fetchMemorizationItems(refreshed.uid),
      fetchFavoriteRadios(refreshed.uid),
    ]);
    setAccountBundle({
      profile: loaded,
      bookmarks: bms,
      memorization: mems,
      favoriteRadios: favs,
    });
    return true;
  };

  const handleLogout = async () => {
    playTokenRef.current++;
    void safePauseAudio();
    setIsPlaying(false);
    setActiveTrack(null);
    try {
      localStorage.removeItem(ACTIVE_UID_KEY);
    } catch {
      // ignore storage errors
    }
    if (!profile.isGuest) {
      await logoutAccount().catch(() => {});
    }
    setAccountBundle(loadAccountBundleFromLocal('guest', lang, theme, true));
    setLastListened(readUserScoped<LastListenedInfo | null>('guest', 'last_listened', null));
    setStage('auth');
  };

  const handleDeleteAccount = async () => {
    const deletedUid = profile.uid;
    playTokenRef.current++;
    void safePauseAudio();
    setIsPlaying(false);
    setActiveTrack(null);
    try {
      localStorage.removeItem(ACTIVE_UID_KEY);
      if (deletedUid && deletedUid !== 'guest') {
        const scopedKeys = [
          'state_v2',
          'last_listened',
          'search_history',
          'fav_reciters',
          'adhkar_counts',
          'tasbih_state',
          'notif_enabled',
        ] as const;
        for (const k of scopedKeys) {
          localStorage.removeItem(getUserScopedKey(deletedUid, k));
        }
      }
    } catch {
      // ignore storage errors
    }
    await deleteCurrentAccount();
    setAccountBundle(loadAccountBundleFromLocal('guest', lang, theme, true));
    setLastListened(readUserScoped<LastListenedInfo | null>('guest', 'last_listened', null));
    setStage('auth');
  };

  const togglePrayerBoard = () => {
    setShowPrayerBoard((prev) => {
      const next = !prev;
      setInAppPrayerBoardVisible(next);
      return next;
    });
  };

  if (isAdminRoute) {
    return (
      <AdminDashboard
        lang={lang}
        currentAppearance={appearance}
        onExitAdmin={() => {
          window.history.pushState(null, '', '/');
          setIsAdminRoute(false);
          setIsNotFoundRoute(false);
          setActiveTab('home');
          applyRouteDocumentMeta('/', false, false);
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
  const desktopNavItems: { id: AppTab; label: string; iconSrc: string; href?: string }[] = [
    { id: 'home', label: copy.navHome, iconSrc: '/src/assets/images/icons/home.png', href: '/' },
    { id: 'quran', label: copy.navQuran, iconSrc: '/src/assets/images/icons/book.png', href: '/quran' },
    { id: 'listen', label: copy.navListen, iconSrc: '/src/assets/images/icons/music-headphone.png', href: '/recitations' },
    { id: 'library', label: copy.navLibrary, iconSrc: '/assets/aistudio/music_02d469b8.png', href: '/library' },
    { id: 'worship', label: copy.navWorship, iconSrc: '/src/assets/images/icons/man.png', href: '/prayer-times' },
    { id: 'profile', label: copy.navProfile, iconSrc: '/src/assets/images/icons/profile.png' },
  ];

  // Clean 5-tab mobile bottom bar: الرئيسية | المصحف | استماع | عبادات | حسابي
  const mobileNavItems: { id: AppTab; label: string; iconSrc: string; href?: string }[] = [
    { id: 'home', label: lang === 'ar' ? 'الرئيسية' : copy.navHome, iconSrc: '/src/assets/images/icons/home.png', href: '/' },
    { id: 'quran', label: lang === 'ar' ? 'المصحف' : copy.navQuran, iconSrc: '/src/assets/images/icons/book.png', href: '/quran' },
    { id: 'listen', label: lang === 'ar' ? 'استماع' : copy.navListen, iconSrc: '/src/assets/images/icons/music-headphone.png', href: '/recitations' },
    { id: 'worship', label: lang === 'ar' ? 'عبادات' : copy.navWorship, iconSrc: '/src/assets/images/icons/man.png', href: '/prayer-times' },
    { id: 'profile', label: lang === 'ar' ? 'حسابي' : copy.navProfile, iconSrc: '/src/assets/images/icons/profile.png' },
  ];

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, tab: AppTab, href?: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigateToTab(tab, href);
  };

  return (
    <div className="relative min-h-screen bg-[#f7f3ea] dark:bg-[#0b1411] text-[#17211d] dark:text-[#ede7da] geometric-pattern flex flex-col lg:flex-row">
      <AppBackdrop appearance={appearance} />
      {/* Desktop Side Rail */}
      <aside className="hidden lg:flex lg:w-64 xl:w-72 lg:flex-col lg:fixed lg:inset-y-0 lg:start-0 crystal-nav border-e border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 justify-between z-30">
        <div className="space-y-6">
          <a
            href="/"
            onClick={(e) => handleLinkClick(e, 'home', '/')}
            className="flex items-center gap-3 px-2 rounded-2xl focus:outline-none"
          >
            <div className="w-12 h-12 rounded-full overflow-hidden border border-[#c9a44c]/65 bg-[#fdfaf3] p-1 shadow-sm shrink-0 flex items-center justify-center">
              <img
                src={SPLASH_EMBLEM}
                alt="شعار نور للقرآن الكريم"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="font-quran text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c] block leading-none">
                {copy.appName}
              </span>
              <span className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'رفيق القرآن' : 'Quran Companion'}
              </span>
            </div>
          </a>

          <nav aria-label={lang === 'ar' ? 'التنقل الرئيسي' : 'Main Navigation'} className="space-y-1.5">
            {desktopNavItems.map((item) => {
              const active = !isNotFoundRoute && !isPrivacyPolicyRoute && activeTab === item.id;
              const sharedClass = `w-full min-h-[50px] px-3 rounded-full flex items-center gap-3 text-sm font-semibold transition-all ${
                active
                  ? 'bg-[#0f6b4f] text-white shadow-sm'
                  : 'text-[#5c6862] dark:text-[#98a69f] hover:bg-[#0f6b4f]/10 hover:text-[#17211d] dark:hover:text-[#ede7da]'
              }`;
              const inner = (
                <>
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 p-1.5 bg-[#fdfaf3] border transition-all ${
                      active ? 'border-[#c9a44c] ring-2 ring-[#c9a44c]/50' : 'border-[#0f6b4f]/15'
                    }`}
                  >
                    <img
                      src={item.iconSrc}
                      alt={item.label}
                      className="w-full h-full object-contain"
                    />
                  </span>
                  <span>{item.label}</span>
                </>
              );

              if (item.href) {
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={(e) => handleLinkClick(e, item.id, item.href)}
                    className={sharedClass}
                    aria-current={active ? 'page' : undefined}
                  >
                    {inner}
                  </a>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToTab(item.id)}
                  className={sharedClass}
                >
                  {inner}
                </button>
              );
            })}

            <a
              href="/tafsir"
              onClick={(e) => handleLinkClick(e, 'quran', '/tafsir')}
              className={`w-full min-h-[46px] px-3 rounded-full flex items-center gap-3 text-xs font-semibold transition-all ${
                isTafsirRoute
                  ? 'bg-[#c9a44c]/22 text-[#0f6b4f] dark:text-[#c9a44c]'
                  : 'text-[#5c6862] dark:text-[#98a69f] hover:bg-[#0f6b4f]/10 hover:text-[#17211d] dark:hover:text-[#ede7da]'
              }`}
            >
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 p-1.5 bg-[#fdfaf3] border transition-all ${
                  isTafsirRoute ? 'border-[#c9a44c] ring-2 ring-[#c9a44c]/50' : 'border-[#0f6b4f]/15'
                }`}
              >
                <img
                  src="/assets/aistudio/quran_01fb2fd7.png"
                  alt={lang === 'ar' ? 'التفسير' : 'Tafsir'}
                  className="w-full h-full object-contain"
                />
              </span>
              <span>{lang === 'ar' ? 'التفسير' : 'Tafsir'}</span>
            </a>
          </nav>
        </div>

        <div className="space-y-2.5">
          <PWAInstallButton lang={lang} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex-1 min-h-[44px] rounded-full border border-[#0f6b4f]/20 text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
            >
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <button
              type="button"
              onClick={togglePrayerBoard}
              aria-label={lang === 'ar' ? 'لوحة إشعارات الصلاة' : 'Prayer Notification Board'}
              className={`w-11 h-11 rounded-full border flex items-center justify-center transition-colors relative ${
                showPrayerBoard
                  ? 'border-[#0f6b4f] bg-[#0f6b4f]/12 text-[#0f6b4f] dark:text-[#c9a44c]'
                  : 'border-[#0f6b4f]/20 hover:bg-[#0f6b4f]/8'
              }`}
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={copy.themeLabel}
              className="w-11 h-11 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/8 transition-colors"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-[#c9a44c]" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile & Tablet Compact Header */}
      <header className="lg:hidden sticky top-0 z-30 h-14 px-3 sm:px-6 crystal-nav border-b border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 flex items-center justify-between gap-2">
        <a
          href="/"
          onClick={(e) => handleLinkClick(e, 'home', '/')}
          className="flex items-center gap-2 min-w-0"
        >
          <div className="w-9 h-9 rounded-full overflow-hidden border border-[#c9a44c]/60 bg-[#fdfaf3] p-0.5 shrink-0 flex items-center justify-center shadow-sm">
            <img
              src={SPLASH_EMBLEM}
              alt="شعار نور للقرآن الكريم"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-quran text-xl font-bold text-[#0f6b4f] dark:text-[#c9a44c] truncate">{copy.appName}</span>
        </a>
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href="/library"
            onClick={(e) => handleLinkClick(e, 'library', '/library')}
            aria-label={copy.navLibrary}
            className={`w-10 h-10 rounded-full border flex items-center justify-center p-2 transition-colors ${
              activeTab === 'library'
                ? 'border-[#0f6b4f] bg-[#0f6b4f]/15 ring-2 ring-[#c9a44c]/60'
                : 'border-[#0f6b4f]/20'
            }`}
          >
            <img src="/assets/aistudio/music_02d469b8.png" alt={copy.navLibrary} className="w-full h-full object-contain" />
          </a>
          <button
            type="button"
            onClick={togglePrayerBoard}
            aria-label={lang === 'ar' ? 'لوحة إشعارات الصلاة' : 'Prayer Notification Board'}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
              showPrayerBoard
                ? 'border-[#0f6b4f] bg-[#0f6b4f]/12 text-[#0f6b4f] dark:text-[#c9a44c]'
                : 'border-[#0f6b4f]/20'
            }`}
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={copy.themeLabel}
            className="w-10 h-10 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-[#c9a44c]" />}
          </button>
          <button
            type="button"
            onClick={() => setMoreDrawerOpen(true)}
            aria-label={lang === 'ar' ? 'المزيد من الأقسام' : 'More menu'}
            className="min-h-[40px] px-3 rounded-full border border-[#0f6b4f]/20 flex items-center gap-1 text-xs font-semibold"
          >
            <Menu className="w-4 h-4" />
            <span className="hidden xs:inline">{lang === 'ar' ? 'المزيد' : 'More'}</span>
          </button>
        </div>
      </header>

      {/* Mobile "المزيد" Drawer */}
      {moreDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-4"
          onClick={() => setMoreDrawerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl crystal-card border border-[#0f6b4f]/20 p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                {lang === 'ar' ? 'المزيد في نور' : 'More in Nour'}
              </h2>
              <button
                type="button"
                onClick={() => setMoreDrawerOpen(false)}
                aria-label={lang === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
                className="w-10 h-10 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav aria-label={lang === 'ar' ? 'أقسام إضافية' : 'More links'} className="grid grid-cols-2 gap-2.5">
              <a
                href="/library"
                onClick={(e) => handleLinkClick(e, 'library', '/library')}
                className="min-h-[52px] rounded-2xl border border-[#0f6b4f]/15 bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-bold"
              >
                <img src="/assets/aistudio/music_02d469b8.png" alt="" className="w-6 h-6 object-contain shrink-0" />
                <span>{copy.navLibrary}</span>
              </a>
              <a
                href="/tafsir"
                onClick={(e) => handleLinkClick(e, 'quran', '/tafsir')}
                className="min-h-[52px] rounded-2xl border border-[#0f6b4f]/15 bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-bold"
              >
                <img src="/assets/aistudio/quran_01fb2fd7.png" alt="" className="w-6 h-6 object-contain shrink-0" />
                <span>{lang === 'ar' ? 'التفسير' : 'Tafsir'}</span>
              </a>
              <a
                href="/adhkar"
                onClick={(e) => handleLinkClick(e, 'worship', '/adhkar')}
                className="min-h-[52px] rounded-2xl border border-[#0f6b4f]/15 bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-bold"
              >
                <HeartHandshake className="w-5 h-5 text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'الأذكار' : 'Adhkar'}</span>
              </a>
              <a
                href="/privacy-policy"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  setMoreDrawerOpen(false);
                  setIsPrivacyPolicyRoute(true);
                  setIsNotFoundRoute(false);
                  setIsAdminRoute(false);
                  window.history.pushState(null, '', '/privacy-policy');
                  applyRouteDocumentMeta('/privacy-policy', false, false);
                }}
                className="min-h-[52px] rounded-2xl border border-[#0f6b4f]/15 bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-bold"
              >
                <ShieldCheck className="w-5 h-5 text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}</span>
              </a>
            </nav>

            <div className="flex items-center gap-2 pt-1 border-t border-[#0f6b4f]/10">
              <div className="flex-1">
                <PWAInstallButton lang={lang} />
              </div>
              <button
                type="button"
                onClick={() => {
                  toggleLanguage();
                  setMoreDrawerOpen(false);
                }}
                className="min-h-[44px] px-4 rounded-full border border-[#0f6b4f]/20 text-xs font-semibold"
              >
                {lang === 'ar' ? 'English' : 'العربية'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content with generous clearance above sticky audio player & bottom bar */}
      <main className={`relative z-10 flex-1 lg:ps-64 xl:ps-72 ${activeTrack ? 'pb-44 sm:pb-40 lg:pb-32' : 'pb-24 lg:pb-12'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-4">
          <PrayerNotificationBoard
            lang={lang}
            visible={showPrayerBoard && !isNotFoundRoute && !isPrivacyPolicyRoute && activeTab !== 'quran'}
            onHide={() => {
              setShowPrayerBoard(false);
              setInAppPrayerBoardVisible(false);
            }}
            onOpenWorship={() => navigateToTab('worship', '/prayer-times')}
          />
          {!profile.isGuest && profile.emailVerified === false && activeTab !== 'quran' && (
            <div className="rounded-2xl crystal-card border border-[#c9a44c]/55 bg-[#c9a44c]/12 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold">{copy.emailNotVerified}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRefreshVerification()}
                  className="px-3.5 py-1.5 rounded-full bg-[#0f6b4f] text-white font-semibold"
                >
                  {lang === 'ar' ? 'تحديث التفعيل' : 'Check Verified'}
                </button>
                <button
                  type="button"
                  onClick={() => void resendVerificationEmail()}
                  className="px-3.5 py-1.5 rounded-full border border-[#0f6b4f]/25 font-semibold"
                >
                  {copy.resendVerification}
                </button>
              </div>
            </div>
          )}
          {isPrivacyPolicyRoute ? (
            <PrivacyPolicyView
              lang={lang}
              onNavigateHome={() => navigateToTab('home', '/')}
            />
          ) : isNotFoundRoute ? (
            <section className="crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/25 p-8 sm:p-12 text-center space-y-5 max-w-2xl mx-auto my-8">
              <div className="w-20 h-20 mx-auto rounded-full bg-[#fdfaf3] border border-[#c9a44c]/60 p-3 flex items-center justify-center shadow-sm">
                <img
                  src={SPLASH_EMBLEM}
                  alt="شعار نور للقرآن الكريم"
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-4xl font-extrabold text-[#c9a44c]">404</p>
              <h1 className="text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                {lang === 'ar' ? 'الصفحة غير موجودة' : 'Page Not Found'}
              </h1>
              <p className="text-sm text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar'
                  ? 'عذراً، المسار الذي طلبته غير متوفر في تطبيق نور للقرآن الكريم.'
                  : 'Sorry, the page you requested does not exist in Nour Quran Companion.'}
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <a
                  href="/"
                  onClick={(e) => handleLinkClick(e, 'home', '/')}
                  className="px-6 py-2.5 rounded-full bg-[#0f6b4f] text-white text-sm font-semibold hover:bg-[#0a4e39] transition-colors"
                >
                  {lang === 'ar' ? 'العودة إلى الصفحة الرئيسية' : 'Back to Home'}
                </a>
                <a
                  href="/quran"
                  onClick={(e) => handleLinkClick(e, 'quran', '/quran')}
                  className="px-5 py-2.5 rounded-full border border-[#0f6b4f]/25 text-sm font-semibold hover:bg-[#0f6b4f]/10 transition-colors"
                >
                  {lang === 'ar' ? 'القرآن الكريم' : 'Quran'}
                </a>
              </div>
            </section>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeTab === 'home' && (
                  <HomeView
                    lang={lang}
                    profile={profile}
                    chapters={chapters}
                    memorizationItems={memorization}
                    lastListened={lastListened}
                    onOpenMushafPage={(p) => {
                      handleChangePage(p);
                      navigateToTab('quran', '/quran');
                    }}
                    onNavigateTab={navigateToTab}
                    onUpdateKhatma={handleUpdateKhatma}
                    onAddMemorization={handleAddMemorization}
                    onReviewMemorization={handleReviewMemorization}
                    onResumeLastListened={handleResumeLastListened}
                  />
                )}

                {activeTab === 'quran' && (
                  <MushafView
                    lang={lang}
                    theme={theme}
                    chapters={chapters}
                    currentPage={profile.lastReadPage}
                    bookmarks={bookmarks}
                    activePlayingVerseKey={activeTrack?.verseKey}
                    initialTafsirMode={isTafsirRoute}
                    onToggleTheme={toggleTheme}
                    onChangePage={handleChangePage}
                    onTrackReadingAyah={handleTrackReadingAyah}
                    onSaveBookmark={handleSaveBookmark}
                    onPlayFromVerse={handlePlayFromVerse}
                    onPlaySurahFromMushaf={handlePlaySurahFromMushaf}
                  />
                )}

                {activeTab === 'listen' && (
                  <ListenView
                    uid={profile.uid}
                    lang={lang}
                    chapters={chapters}
                    activeTrack={activeTrack}
                    isPlaying={isPlaying}
                    favoriteRadios={favoriteRadios}
                    favoriteReciterIds={favoriteReciterIds}
                    defaultReciterId={profile.defaultReciterId}
                    lastListened={lastListened}
                    audioError={audioError}
                    initialOpenReciterId={openReciterId}
                    onPlayTrack={handlePlayTrack}
                    onTogglePlayPause={handleTogglePlayPause}
                    onToggleFavoriteRadio={handleToggleFavoriteRadio}
                    onToggleFavoriteReciter={handleToggleFavoriteReciter}
                    onSelectDefaultReciter={(reciterId) => {
                      setAccountBundle((prev) => ({
                        ...prev,
                        profile: { ...prev.profile, defaultReciterId: reciterId },
                      }));
                      if (!profile.isGuest) {
                        syncUserProfilePatch(profile.uid, { defaultReciterId: reciterId }).catch(() => {});
                      }
                    }}
                    onOpenMushafPage={(page) => {
                      handleChangePage(page);
                      navigateToTab('quran', '/quran');
                    }}
                    onResumeLastListened={handleResumeLastListened}
                    onSetPlaybackQueue={setAudioQueue}
                    onRetryAudio={() => activeTrack && void handlePlayTrack(activeTrack)}
                    onClearInitialReciter={() => setOpenReciterId(null)}
                  />
                )}

                {activeTab === 'library' && (
                  <LibraryView
                    lang={lang}
                    chapters={chapters}
                    activeTrack={activeTrack}
                    isPlaying={isPlaying}
                    lastListened={lastListened}
                    bookmarks={bookmarks}
                    memorizationItems={memorization}
                    favoriteRadios={favoriteRadios}
                    favoriteReciterIds={favoriteReciterIds}
                    onPlayTrack={handlePlayTrack}
                    onTogglePlayPause={handleTogglePlayPause}
                    onOpenMushafPage={(page) => {
                      handleChangePage(page);
                      navigateToTab('quran', '/quran');
                    }}
                    onNavigateTab={navigateToTab}
                    onRemoveBookmark={handleRemoveBookmark}
                    onToggleFavoriteRadio={handleToggleFavoriteRadio}
                    onToggleFavoriteReciter={handleToggleFavoriteReciter}
                    onOpenReciter={(recId) => {
                      setOpenReciterId(recId);
                      navigateToTab('listen', '/recitations');
                    }}
                  />
                )}

                {activeTab === 'worship' && (
                  <WorshipView
                    uid={profile.uid}
                    lang={lang}
                    onOpenLibraryQibla={() => {
                      navigateToTab('library', '/library');
                      window.setTimeout(() => {
                        document.getElementById('qibla-compass-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 220);
                    }}
                  />
                )}

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
                      navigateToTab('quran', '/quran');
                    }}
                    onRemoveBookmark={handleRemoveBookmark}
                    onRefreshVerification={handleRefreshVerification}
                    onPlayTrack={handlePlayTrack}
                    onOpenLibrary={() => navigateToTab('library', '/library')}
                    onLogout={handleLogout}
                    onDeleteAccount={handleDeleteAccount}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Semantic Public Navigation Footer */}
          <footer className="crystal-card rounded-2xl border border-[#0f6b4f]/12 dark:border-[#c9a44c]/20 px-5 py-4 mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5c6862] dark:text-[#98a69f]">
            <p className="font-semibold text-[#0f6b4f] dark:text-[#c9a44c]">
              {lang === 'ar'
                ? 'نور — رفيق القرآن الكريم ومصحف المدينة والتفسير والتلاوات والأذكار ومواقيت الصلاة'
                : 'Nour — Quran Companion, Madina Mushaf, Tafsir, Recitations, Adhkar & Prayer Times'}
            </p>
            <nav aria-label={lang === 'ar' ? 'روابط سريعة' : 'Quick Links'} className="flex flex-wrap items-center gap-3">
              <a href="/" onClick={(e) => handleLinkClick(e, 'home', '/')} className="hover:text-[#0f6b4f] dark:hover:text-[#c9a44c]">
                {lang === 'ar' ? 'الرئيسية' : 'Home'}
              </a>
              <a href="/quran" onClick={(e) => handleLinkClick(e, 'quran', '/quran')} className="hover:text-[#0f6b4f] dark:hover:text-[#c9a44c]">
                {lang === 'ar' ? 'القرآن الكريم' : 'Quran'}
              </a>
              <a href="/tafsir" onClick={(e) => handleLinkClick(e, 'quran', '/tafsir')} className="hover:text-[#0f6b4f] dark:hover:text-[#c9a44c]">
                {lang === 'ar' ? 'التفسير' : 'Tafsir'}
              </a>
              <a href="/recitations" onClick={(e) => handleLinkClick(e, 'listen', '/recitations')} className="hover:text-[#0f6b4f] dark:hover:text-[#c9a44c]">
                {lang === 'ar' ? 'التلاوات' : 'Recitations'}
              </a>
              <a href="/library" onClick={(e) => handleLinkClick(e, 'library', '/library')} className="hover:text-[#0f6b4f] dark:hover:text-[#c9a44c]">
                {copy.navLibrary}
              </a>
              <a href="/adhkar" onClick={(e) => handleLinkClick(e, 'worship', '/adhkar')} className="hover:text-[#0f6b4f] dark:hover:text-[#c9a44c]">
                {lang === 'ar' ? 'الأذكار' : 'Adhkar'}
              </a>
              <a href="/prayer-times" onClick={(e) => handleLinkClick(e, 'worship', '/prayer-times')} className="hover:text-[#0f6b4f] dark:hover:text-[#c9a44c]">
                {lang === 'ar' ? 'مواقيت الصلاة' : 'Prayer Times'}
              </a>
              <a
                href="/privacy-policy"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  setIsPrivacyPolicyRoute(true);
                  setIsNotFoundRoute(false);
                  setIsAdminRoute(false);
                  if (typeof window !== 'undefined') {
                    window.history.pushState(null, '', '/privacy-policy');
                    applyRouteDocumentMeta('/privacy-policy', false, false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="hover:text-[#0f6b4f] dark:hover:text-[#c9a44c]"
              >
                {lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}
              </a>
            </nav>
          </footer>
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
            queue={audioQueue}
            onSelectQueueTrack={(trackItem) => void handlePlayTrack(trackItem)}
            onRetryAudio={() => activeTrack && void handlePlayTrack(activeTrack)}
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
                const qIdx = audioQueue.findIndex((item) => item.url === activeTrack.url);
                if (qIdx > 0) {
                  void handlePlayTrack(audioQueue[qIdx - 1]);
                  return;
                }
                const prev = getNextSurahTrack(activeTrack, -1);
                if (prev) void handlePlayTrack(prev);
              }
            }}
            onSkipNext={() => {
              if (activeTrack.type === 'ayah' && activeTrack.verseKey) {
                void playAdjacentAyah(activeTrack.verseKey, 1);
              } else {
                const qIdx = audioQueue.findIndex((item) => item.url === activeTrack.url);
                if (qIdx >= 0 && qIdx + 1 < audioQueue.length) {
                  void handlePlayTrack(audioQueue[qIdx + 1]);
                  return;
                }
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

      {/* Mobile & Tablet 5-Tab Fixed Bottom Navigation */}
      <nav aria-label={lang === 'ar' ? 'التنقل السفلي' : 'Mobile Navigation'} className="lg:hidden fixed bottom-0 inset-x-0 z-40 min-h-16 pb-safe crystal-nav border-t border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 grid grid-cols-5 items-center py-1 px-1">
        {mobileNavItems.map((item) => {
          const active = !isNotFoundRoute && !isPrivacyPolicyRoute && activeTab === item.id;
          const sharedClass = `relative min-h-[54px] flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold transition-colors ${
            active ? 'text-[#0f6b4f] dark:text-[#c9a44c]' : 'text-[#5c6862] dark:text-[#98a69f]'
          }`;
          const inner = (
            <>
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 inset-x-4 h-1 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c]"
                />
              )}
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center p-1 bg-[#fdfaf3] border transition-all ${
                  active ? 'border-[#0f6b4f] ring-2 ring-[#c9a44c]/60 scale-105' : 'border-[#0f6b4f]/15 opacity-90'
                }`}
              >
                <img src={item.iconSrc} alt={item.label} className="w-full h-full object-contain" />
              </span>
              <span className="truncate max-w-full">{item.label}</span>
            </>
          );

          if (item.href) {
            return (
              <a
                key={item.id}
                href={item.href}
                onClick={(e) => handleLinkClick(e, item.id, item.href)}
                className={sharedClass}
                aria-current={active ? 'page' : undefined}
              >
                {inner}
              </a>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateToTab(item.id)}
              className={sharedClass}
              aria-current={active ? 'page' : undefined}
            >
              {inner}
            </button>
          );
        })}
      </nav>

      <OfflineIndicator lang={lang} hasAudioBar={!!activeTrack} />
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
