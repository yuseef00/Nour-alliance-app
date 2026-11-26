import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Compass,
  Download,
  HardDrive,
  Headphones,
  Loader2,
  MapPin,
  Navigation,
  Pause,
  Play,
  Search,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { AppTab, AudioTrack, Chapter, Language, LastListenedInfo } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import {
  clearCachedMushafPages,
  downloadMushafRangeOffline,
  fetchVerseByKey,
  getCachedMushafPagesCount,
  stripArabicDiacritics,
} from '../services/quranApi';
import {
  clearAllOfflineAudio,
  getOfflineAudioTotalBytes,
  getOfflineTracksMeta,
  OFFLINE_UPDATED_EVENT,
  OfflineTrackMeta,
  removeOfflineAudio,
} from '../services/mp3QuranApi';
import {
  calculatePrayerSchedule,
  CITY_PRESETS,
  detectHighAccuracyGps,
  loadSavedLocation,
  LOCATION_UPDATED_EVENT,
  reverseGeocodeCoords,
  SavedLocation,
  saveUserLocation,
} from '../services/worshipService';
import { ReciterAvatar } from './ReciterAvatar';

interface LibraryViewProps {
  lang: Language;
  chapters: Chapter[];
  activeTrack: AudioTrack | null;
  isPlaying: boolean;
  lastListened: LastListenedInfo | null;
  onPlayTrack: (track: AudioTrack) => void;
  onTogglePlayPause: () => void;
  onOpenMushafPage: (page: number) => void;
  onNavigateTab: (tab: AppTab, targetPath?: string) => void;
}

function formatBytes(bytes: number, lang: Language): string {
  if (!bytes || bytes <= 0) return lang === 'ar' ? 'محفوظ' : 'Saved';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  lang,
  chapters,
  activeTrack,
  isPlaying,
  lastListened,
  onPlayTrack,
  onTogglePlayPause,
  onOpenMushafPage,
  onNavigateTab,
}) => {
  const copy = t(lang);

  // Offline Mushaf & Audio state
  const [cachedPagesCount, setCachedPagesCount] = useState(0);
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrackMeta[]>(() => getOfflineTracksMeta());
  const [totalBytes, setTotalBytes] = useState(() => getOfflineAudioTotalBytes());
  const [downloadingPack, setDownloadingPack] = useState<'full' | 'juz30' | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 });
  const [audioFilter, setAudioFilter] = useState<'all' | 'surah' | 'ayah'>('all');
  const [audioSearch, setAudioSearch] = useState('');
  const [resolvedLastVerseText, setResolvedLastVerseText] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  // Qibla Compass State (Moved & Upgraded inside Library)
  const [location, setLocation] = useState<SavedLocation>(() => loadSavedLocation());
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [compassActive, setCompassActive] = useState(false);

  const refreshOfflineState = async () => {
    const pages = await getCachedMushafPagesCount();
    setCachedPagesCount(pages);
    setOfflineTracks(getOfflineTracksMeta());
    setTotalBytes(getOfflineAudioTotalBytes());
  };

  useEffect(() => {
    void refreshOfflineState();
    const onOfflineChange = () => {
      setOfflineTracks(getOfflineTracksMeta());
      setTotalBytes(getOfflineAudioTotalBytes());
    };
    window.addEventListener(OFFLINE_UPDATED_EVENT, onOfflineChange);
    return () => {
      window.removeEventListener(OFFLINE_UPDATED_EVENT, onOfflineChange);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!lastListened?.verseKey) {
      setResolvedLastVerseText('');
      return;
    }
    if (lastListened.verseText) {
      setResolvedLastVerseText(lastListened.verseText);
      return;
    }
    let cancelled = false;
    fetchVerseByKey(lastListened.verseKey)
      .then((v) => {
        if (!cancelled && v?.text_uthmani) {
          setResolvedLastVerseText(v.text_uthmani);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lastListened?.verseKey, lastListened?.verseText]);

  useEffect(() => {
    const onLocUpdated = () => setLocation(loadSavedLocation());
    window.addEventListener(LOCATION_UPDATED_EVENT, onLocUpdated);
    return () => window.removeEventListener(LOCATION_UPDATED_EVENT, onLocUpdated);
  }, []);

  useEffect(() => {
    const onOrientation = (e: DeviceOrientationEvent) => {
      const iosHeading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof iosHeading === 'number' && Number.isFinite(iosHeading)) {
        setHeading(iosHeading);
        setCompassActive(true);
      } else if (typeof e.alpha === 'number') {
        setHeading((360 - e.alpha + 360) % 360);
        setCompassActive(true);
      }
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, []);

  const enableCompass = async () => {
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof DOE?.requestPermission === 'function') {
      try {
        const perm = await DOE.requestPermission();
        if (perm === 'granted') setCompassActive(true);
      } catch {
        // ignore permission failure
      }
    } else {
      setCompassActive(true);
    }
  };

  const handleRequestGps = async () => {
    setLocating(true);
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
      setLocation(next);
    } catch {
      setLocationError(
        lang === 'ar'
          ? 'تعذر قراءة الموقع عبر GPS حالياً. اختر المدينة من القائمة.'
          : 'Unable to acquire GPS signal. Select a city below.'
      );
    } finally {
      setLocating(false);
    }
  };

  const qiblaSchedule = useMemo(
    () => calculatePrayerSchedule(location.lat, location.lng, location.method, new Date()),
    [location]
  );
  const qiblaRelative = (qiblaSchedule.qiblaBearing - heading + 360) % 360;

  const handleDownloadPack = async (pack: 'full' | 'juz30') => {
    if (downloadingPack) return;
    const start = pack === 'juz30' ? 582 : 1;
    const end = 604;
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloadingPack(pack);
    setDownloadProgress({ done: 0, total: end - start + 1 });

    try {
      await downloadMushafRangeOffline(
        start,
        end,
        (done, tot) => setDownloadProgress({ done, total: tot }),
        controller.signal
      );
      await refreshOfflineState();
    } finally {
      setDownloadingPack(null);
      abortRef.current = null;
    }
  };

  const surahCount = useMemo(
    () => offlineTracks.filter((tItem) => (tItem.kind || (tItem.verseKey ? 'ayah' : 'surah')) === 'surah').length,
    [offlineTracks]
  );
  const ayahCount = useMemo(
    () => offlineTracks.filter((tItem) => (tItem.kind || (tItem.verseKey ? 'ayah' : 'surah')) === 'ayah').length,
    [offlineTracks]
  );

  const filteredAudio = useMemo(() => {
    const q = stripArabicDiacritics(audioSearch).toLowerCase().trim();
    return offlineTracks.filter((item) => {
      const kind = item.kind || (item.verseKey ? 'ayah' : 'surah');
      if (audioFilter !== 'all' && kind !== audioFilter) return false;
      if (!q) return true;
      const hay = stripArabicDiacritics(
        `${item.title} ${item.subtitle} ${item.verseText || ''} ${item.verseKey || ''}`
      ).toLowerCase();
      return hay.includes(q);
    });
  }, [offlineTracks, audioFilter, audioSearch]);

  const mushafPct = Math.min(100, Math.round((cachedPagesCount / 604) * 100));

  const playOfflineItem = (tr: OfflineTrackMeta) => {
    const kind = tr.kind || (tr.verseKey ? 'ayah' : 'surah');
    if (activeTrack?.url === tr.url) {
      onTogglePlayPause();
      return;
    }
    onPlayTrack({
      id: `offline_${tr.url}`,
      type: kind,
      title: tr.title,
      subtitle: tr.subtitle,
      url: tr.url,
      surahNumber: tr.surahNumber,
      ayahNumber: tr.ayahNumber,
      verseKey: tr.verseKey,
      verseText: tr.verseText,
      pageNumber: tr.pageNumber,
      reciterId: tr.reciterId,
      reciterName: tr.reciterName || tr.subtitle,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
            {lang === 'ar' ? 'المكتبة والتنزيلات' : 'Library & Offline Vault'}
          </h1>
          <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
            {lang === 'ar'
              ? 'جميع تنزيلات المصحف والسور والآيات، آخر آية مستمع لها، وبوصلة القبلة الدقيقة'
              : 'Downloaded Mushaf pages, Surahs, Ayahs, last listened verse & Qibla compass'}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold tabular-nums">
          <span className="px-3.5 py-2 rounded-full crystal-card border border-[#0f6b4f]/15 text-[#0f6b4f] dark:text-[#c9a44c]">
            {formatNumber(cachedPagesCount, lang)} / {formatNumber(604, lang)} {copy.page}
          </span>
          <span className="px-3.5 py-2 rounded-full crystal-card border border-[#c9a44c]/30 text-[#17211d] dark:text-[#ede7da]">
            {formatNumber(offlineTracks.length, lang)} {lang === 'ar' ? 'مقطع صوتي' : 'tracks'}
          </span>
        </div>
      </div>

      {/* Top Row: Last Listened Verse + Upgraded Qibla Compass */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Last Listened Card */}
        <section className="lg:col-span-7 rounded-3xl hero-emerald-surface text-[#f7f3ea] border border-[#c9a44c]/45 p-6 sm:p-7 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-bold text-[#c9a44c] flex items-center gap-2">
                <Headphones className="w-4 h-4" />
                <span>
                  {lastListened?.type === 'ayah'
                    ? lang === 'ar'
                      ? 'آخر آية مستمع لها'
                      : 'Last Listened Verse'
                    : lang === 'ar'
                    ? 'آخر تلاوة مستمع لها'
                    : 'Last Listened Recitation'}
                </span>
              </p>
              <h2 className="text-xl sm:text-2xl font-bold">
                {lastListened ? lastListened.title : lang === 'ar' ? 'ابدأ الاستماع للقرآن الكريم' : 'Start Listening'}
              </h2>
            </div>

            {lastListened && (
              <ReciterAvatar
                name={lastListened.reciterName || lastListened.subtitle}
                reciterId={lastListened.reciterId}
                size="lg"
                active
              />
            )}
          </div>

          {lastListened ? (
            <>
              <div className="rounded-2xl bg-black/18 border border-white/12 p-4 space-y-2">
                {resolvedLastVerseText ? (
                  <p className="font-quran text-xl sm:text-2xl leading-[2.1] text-[#fdfaf3]" dir="rtl">
                    {resolvedLastVerseText}
                  </p>
                ) : (
                  <p className="text-sm text-[#f7f3ea]/85">
                    {lang === 'ar'
                      ? `القارئ: ${lastListened.reciterName || lastListened.subtitle}`
                      : `Reciter: ${lastListened.reciterName || lastListened.subtitle}`}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#f7f3ea]/75 pt-1 border-t border-white/10">
                  <span>{lastListened.reciterName || lastListened.subtitle}</span>
                  <span className="tabular-nums">
                    {lastListened.verseKey ? `${lastListened.verseKey}` : ''}
                    {lastListened.pageNumber ? ` · ${copy.page} ${formatNumber(lastListened.pageNumber, lang)}` : ''}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (activeTrack?.url === lastListened.url) {
                      onTogglePlayPause();
                    } else {
                      onPlayTrack({
                        id: lastListened.trackId,
                        type: lastListened.type,
                        title: lastListened.title,
                        subtitle: lastListened.subtitle,
                        url: lastListened.url,
                        reciterId: lastListened.reciterId,
                        reciterName: lastListened.reciterName,
                        surahNumber: lastListened.surahNumber,
                        ayahNumber: lastListened.ayahNumber,
                        verseKey: lastListened.verseKey,
                        verseText: resolvedLastVerseText || lastListened.verseText,
                        pageNumber: lastListened.pageNumber,
                        moshafServer: lastListened.moshafServer,
                      });
                    }
                  }}
                  className="min-h-[44px] px-5 rounded-full bg-[#c9a44c] text-[#17211d] text-xs font-bold flex items-center gap-2 hover:brightness-105 shadow-md"
                >
                  {activeTrack?.url === lastListened.url && isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span>
                    {activeTrack?.url === lastListened.url && isPlaying
                      ? lang === 'ar'
                        ? 'إيقاف مؤقت'
                        : 'Pause'
                      : lang === 'ar'
                      ? 'استئناف الاستماع'
                      : 'Resume Listening'}
                  </span>
                </button>

                {(lastListened.pageNumber || lastListened.surahNumber) && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetPage =
                        lastListened.pageNumber ||
                        chapters.find((c) => c.id === lastListened.surahNumber)?.pages[0] ||
                        1;
                      onOpenMushafPage(targetPage);
                    }}
                    className="min-h-[44px] px-4 rounded-full bg-white/12 hover:bg-white/20 text-[#f7f3ea] text-xs font-semibold flex items-center gap-2 transition-colors"
                  >
                    <BookOpen className="w-4 h-4 text-[#c9a44c]" />
                    <span>{lang === 'ar' ? 'فتح في المصحف' : 'Open in Mushaf'}</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl bg-black/15 border border-white/12 p-5 space-y-3">
              <p className="text-xs sm:text-sm text-[#f7f3ea]/85 leading-relaxed">
                {lang === 'ar'
                  ? 'لم تستمع لأي آية أو سورة بعد في هذا الحساب. اختر قارئك المفضل أو اضغط على أي آية في المصحف وسنحفظ لك موضع استماعك هنا تلقائياً.'
                  : 'No playback history in this account yet. Play any Ayah or Surah and it will appear here automatically.'}
              </p>
              <button
                type="button"
                onClick={() => onNavigateTab('listen', '/recitations')}
                className="min-h-[42px] px-5 rounded-full bg-[#c9a44c] text-[#17211d] text-xs font-bold inline-flex items-center gap-2"
              >
                <Headphones className="w-4 h-4" />
                <span>{lang === 'ar' ? 'تصفح القراء والتلاوات' : 'Browse Reciters'}</span>
              </button>
            </div>
          )}
        </section>

        {/* Upgraded Standalone Qibla Compass inside Library */}
        <section
          id="qibla-compass-section"
          className="lg:col-span-5 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/25 p-6 flex flex-col items-center justify-between gap-4"
        >
          <div className="w-full flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                <Compass className="w-5 h-5 text-[#0f6b4f] dark:text-[#c9a44c]" />
              </span>
              <div>
                <h2 className="text-base font-bold">{copy.qiblaCompass}</h2>
                <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                  {lang === 'ar' ? location.labelAr : location.labelEn}
                </p>
              </div>
            </div>
            <div className="text-end tabular-nums">
              <p className="text-lg font-extrabold text-[#0f6b4f] dark:text-[#c9a44c]">
                {qiblaSchedule.qiblaBearing.toFixed(1)}°
              </p>
              <p className="text-[10px] text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'زاوية القبلة' : 'Qibla Bearing'}
              </p>
            </div>
          </div>

          {/* Precision Multi-Ring SVG Compass */}
          <div className="relative w-60 h-60 flex items-center justify-center my-1">
            <svg viewBox="0 0 240 240" className="w-full h-full drop-shadow-sm" aria-hidden="true">
              <defs>
                <radialGradient id="compassFace" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fdfaf3" stopOpacity="0.98" />
                  <stop offset="82%" stopColor="#f3ebd8" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#e5d8bc" stopOpacity="0.95" />
                </radialGradient>
                <linearGradient id="kaabaGold" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#d8b55f" />
                  <stop offset="100%" stopColor="#a77d28" />
                </linearGradient>
              </defs>

              {/* Outer Brass Ring */}
              <circle cx="120" cy="120" r="114" fill="url(#compassFace)" stroke="#c9a44c" strokeWidth="3.5" />
              <circle cx="120" cy="120" r="102" fill="none" stroke="#0f6b4f" strokeOpacity="0.18" strokeWidth="1.5" />
              <circle cx="120" cy="120" r="76" fill="none" stroke="#0f6b4f" strokeOpacity="0.12" strokeDasharray="3 4" />

              {/* 36 Degree Tick Marks */}
              {Array.from({ length: 36 }).map((_, idx) => {
                const deg = idx * 10;
                const major = idx % 3 === 0;
                return (
                  <line
                    key={deg}
                    x1="120"
                    y1={major ? 14 : 18}
                    x2="120"
                    y2={major ? 25 : 23}
                    stroke={major ? '#0f6b4f' : '#5c6862'}
                    strokeOpacity={major ? 0.7 : 0.35}
                    strokeWidth={major ? 2 : 1.2}
                    transform={`rotate(${deg} 120 120)`}
                  />
                );
              })}

              {/* Cardinal Labels */}
              <text x="120" y="40" textAnchor="middle" fill="#b91c1c" fontSize="12" fontWeight="800">N</text>
              <text x="120" y="208" textAnchor="middle" fill="#5c6862" fontSize="11" fontWeight="700">S</text>
              <text x="204" y="124" textAnchor="middle" fill="#5c6862" fontSize="11" fontWeight="700">E</text>
              <text x="36" y="124" textAnchor="middle" fill="#5c6862" fontSize="11" fontWeight="700">W</text>

              {/* Rotating Qibla Needle */}
              <g
                style={{
                  transform: `rotate(${qiblaRelative}deg)`,
                  transformOrigin: '120px 120px',
                  transition: 'transform 280ms ease-out',
                }}
              >
                {/* Tail */}
                <polygon points="114,120 126,120 120,182" fill="#5c6862" fillOpacity="0.32" />
                {/* Emerald Needle */}
                <polygon points="111,120 129,120 120,42" fill="#0f6b4f" />
                {/* Kaaba Icon at Tip */}
                <rect x="112" y="34" width="16" height="16" rx="3" fill="#17211d" stroke="url(#kaabaGold)" strokeWidth="2" />
                <line x1="113" y1="39" x2="127" y2="39" stroke="#d8b55f" strokeWidth="1.8" />
                {/* Center Hub */}
                <circle cx="120" cy="120" r="10" fill="url(#kaabaGold)" stroke="#ffffff" strokeWidth="2.5" />
                <circle cx="120" cy="120" r="3.5" fill="#0f6b4f" />
              </g>
            </svg>
          </div>

          {locationError && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 text-center">{locationError}</p>
          )}

          <div className="w-full flex flex-wrap items-center justify-center gap-2">
            <select
              value={
                location.source === 'preset'
                  ? CITY_PRESETS.find(
                      (c) => Math.abs(c.lat - location.lat) < 0.01 && Math.abs(c.lng - location.lng) < 0.01
                    )?.id || 'custom'
                  : 'custom'
              }
              onChange={(e) => {
                const found = CITY_PRESETS.find((c) => c.id === e.target.value);
                if (found) {
                  const next: SavedLocation = {
                    labelAr: found.nameAr,
                    labelEn: found.nameEn,
                    lat: found.lat,
                    lng: found.lng,
                    method: found.method,
                    source: 'preset',
                    updatedAt: new Date().toISOString(),
                  };
                  saveUserLocation(next);
                  setLocation(next);
                }
              }}
              className="min-h-[38px] px-3 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs font-semibold"
            >
              {location.source !== 'preset' && (
                <option value="custom">{lang === 'ar' ? location.labelAr : location.labelEn}</option>
              )}
              {CITY_PRESETS.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'ar' ? c.nameAr : c.nameEn}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={locating}
              onClick={() => void handleRequestGps()}
              className="min-h-[38px] px-3.5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0a4e39]"
            >
              {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
              <span>{lang === 'ar' ? 'تحديد GPS' : 'GPS'}</span>
            </button>

            {!compassActive && (
              <button
                type="button"
                onClick={enableCompass}
                className="min-h-[38px] px-3.5 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0f6b4f]/10"
              >
                <Navigation className="w-3.5 h-3.5 text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'معايرة حية' : 'Calibrate'}</span>
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Offline Mushaf Section */}
      <section className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-[#0f6b4f] dark:text-[#c9a44c]" />
            </span>
            <div>
              <h2 className="text-base font-bold">
                {lang === 'ar' ? 'المصحف الشريف بدون إنترنت' : 'Offline Quran Mushaf'}
              </h2>
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar'
                  ? 'احفظ صفحات مصحف المدينة بالكامل أو جزء عمّ على جهازك للقراءة في أي وقت.'
                  : 'Cache full 604 Mushaf pages or Juz 30 locally for offline reading.'}
              </p>
            </div>
          </div>

          <span className="text-sm font-extrabold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
            {formatNumber(cachedPagesCount, lang)} / {formatNumber(604, lang)} {copy.page} ({formatNumber(mushafPct, lang)}%)
          </span>
        </div>

        <div className="h-2.5 rounded-full bg-[#0f6b4f]/12 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-l from-[#0f6b4f] to-[#c9a44c] transition-all duration-300"
            style={{ width: `${mushafPct}%` }}
          />
        </div>

        {downloadingPack ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
              {lang === 'ar'
                ? `جاري التنزيل: ${formatNumber(downloadProgress.done, lang)} / ${formatNumber(downloadProgress.total, lang)} صفحة...`
                : `Downloading ${downloadProgress.done} / ${downloadProgress.total} pages...`}
            </span>
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                setDownloadingPack(null);
              }}
              className="min-h-[38px] px-4 rounded-full border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إيقاف' : 'Cancel'}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateTab('quran', '/quran')}
              className="min-h-[42px] px-5 rounded-full bg-[#c9a44c] text-[#17211d] text-xs font-bold flex items-center gap-2 hover:brightness-105"
            >
              <BookOpen className="w-4 h-4" />
              <span>{lang === 'ar' ? 'فتح المصحف' : 'Open Mushaf'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPack('juz30')}
              className="min-h-[42px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-2 hover:bg-[#0f6b4f]/10"
            >
              <Download className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              <span>{lang === 'ar' ? 'تحميل جزء عمّ (٢٣ صفحة)' : 'Download Juz 30'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPack('full')}
              className="min-h-[42px] px-5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-2 hover:bg-[#0a4e39]"
            >
              <HardDrive className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تحميل المصحف كاملاً (٦٠٤ صفحة)' : 'Download Full Quran (604 pages)'}</span>
            </button>
            {cachedPagesCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await clearCachedMushafPages();
                  await refreshOfflineState();
                }}
                className="min-h-[42px] px-4 rounded-full border border-red-500/25 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/10"
              >
                {lang === 'ar' ? 'مسح صفحات المصحف' : 'Clear Pages'}
              </button>
            )}
          </div>
        )}
      </section>

      {/* All Downloaded Surahs & Ayahs Hub */}
      <section className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-[#c9a44c]/18 flex items-center justify-center shrink-0">
              <WifiOff className="w-5 h-5 text-[#c9a44c]" />
            </span>
            <div>
              <h2 className="text-base font-bold">
                {lang === 'ar' ? 'السور والآيات المحفوظة دون إنترنت' : 'Downloaded Surahs & Ayahs'}
              </h2>
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                {formatNumber(surahCount, lang)} {copy.surah} · {formatNumber(ayahCount, lang)} {copy.ayah}
                {totalBytes > 0 ? ` · ${formatBytes(totalBytes, lang)}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/10">
              {(
                [
                  { id: 'all', label: lang === 'ar' ? `الكل (${formatNumber(offlineTracks.length, lang)})` : `All (${offlineTracks.length})` },
                  { id: 'surah', label: lang === 'ar' ? `السور (${formatNumber(surahCount, lang)})` : `Surahs (${surahCount})` },
                  { id: 'ayah', label: lang === 'ar' ? `الآيات (${formatNumber(ayahCount, lang)})` : `Ayahs (${ayahCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAudioFilter(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    audioFilter === tab.id ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {offlineTracks.length > 0 && (
              <button
                type="button"
                onClick={() => void clearAllOfflineAudio()}
                className="min-h-[38px] px-3.5 rounded-full border border-red-500/25 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/10"
              >
                {lang === 'ar' ? 'مسح الصوتيات' : 'Clear Audio'}
              </button>
            )}
          </div>
        </div>

        {offlineTracks.length > 0 && (
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-[#5c6862] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
            <input
              type="text"
              value={audioSearch}
              onChange={(e) => setAudioSearch(e.target.value)}
              placeholder={
                lang === 'ar' ? 'ابحث في التنزيلات بالآية أو السورة أو القارئ...' : 'Search downloaded Surahs or Ayahs...'
              }
              className="w-full min-h-[42px] ps-10 pe-4 rounded-full bg-[#f7f3ea]/85 dark:bg-[#0b1411]/85 border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
            />
          </div>
        )}

        {filteredAudio.length === 0 ? (
          <div className="rounded-2xl bg-[#f7f3ea]/70 dark:bg-[#0b1411]/70 border border-[#0f6b4f]/10 p-8 text-center space-y-3">
            <p className="text-xs sm:text-sm text-[#5c6862] dark:text-[#98a69f]">
              {offlineTracks.length === 0
                ? lang === 'ar'
                  ? 'لا توجد سور أو آيات محمّلة بعد. يمكنك تحميل أي سورة أو آية من قسم «استماع» أو من نافذة الآية في «المصحف» لتظهر هنا تلقائياً.'
                  : 'No Surahs or Ayahs downloaded yet. Download any Surah or Ayah from Listen or Mushaf to access it offline here.'
                : lang === 'ar'
                ? 'لا توجد نتائج مطابقة في التنزيلات.'
                : 'No downloaded items match your filter.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab('listen', '/recitations')}
                className="min-h-[40px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold"
              >
                {lang === 'ar' ? 'الذهاب إلى التلاوات' : 'Go to Recitations'}
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('quran', '/quran')}
                className="min-h-[40px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold"
              >
                {lang === 'ar' ? 'الذهاب إلى المصحف' : 'Go to Mushaf'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAudio.map((item) => {
              const kind = item.kind || (item.verseKey ? 'ayah' : 'surah');
              const active = activeTrack?.url === item.url;
              return (
                <div
                  key={item.url}
                  className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-colors ${
                    active
                      ? 'border-[#0f6b4f] bg-[#0f6b4f]/10'
                      : 'border-[#0f6b4f]/12 bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ReciterAvatar
                        name={item.reciterName || item.subtitle}
                        reciterId={item.reciterId}
                        size="md"
                        active={active}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{item.title}</p>
                        <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f] truncate">
                          {item.reciterName || item.subtitle} · {kind === 'ayah' ? copy.ayah : copy.surah}
                          {item.sizeBytes ? ` · ${formatBytes(item.sizeBytes, lang)}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => playOfflineItem(item)}
                        aria-label={active && isPlaying ? 'Pause' : 'Play'}
                        className="w-10 h-10 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center hover:bg-[#0a4e39]"
                      >
                        {active && isPlaying ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4 fill-current" />
                        )}
                      </button>
                      {(item.pageNumber || item.surahNumber) && (
                        <button
                          type="button"
                          onClick={() => {
                            const targetPage =
                              item.pageNumber ||
                              chapters.find((c) => c.id === item.surahNumber)?.pages[0] ||
                              1;
                            onOpenMushafPage(targetPage);
                          }}
                          title={lang === 'ar' ? 'فتح في المصحف' : 'Open in Mushaf'}
                          className="w-10 h-10 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10 text-[#0f6b4f] dark:text-[#c9a44c]"
                        >
                          <BookOpen className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeOfflineAudio(item.url)}
                        aria-label={lang === 'ar' ? 'حذف من المكتبة' : 'Delete from library'}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {item.verseText && (
                    <p
                      className="font-quran text-lg leading-[1.95] px-3 py-2 rounded-xl bg-white/70 dark:bg-[#121f1a]/80 border border-[#0f6b4f]/10"
                      dir="rtl"
                    >
                      {item.verseText}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
