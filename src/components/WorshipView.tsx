import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Compass,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import { Language } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import {
  clearPrayerBoardNotification,
  enableOsPrayerBoard,
  formatFullCountdown,
  getPrayerLabel,
  isOsPrayerBoardEnabled,
  setOsPrayerBoardEnabled,
} from '../services/prayerNotificationService';
import {
  ADHKAR_LIST,
  CALCULATION_METHOD_LABELS,
  calculatePrayerSchedule,
  CITY_PRESETS,
  detectHighAccuracyGps,
  GeocodedPlace,
  loadSavedLocation,
  LOCATION_UPDATED_EVENT,
  PrayerMethodKey,
  reverseGeocodeCoords,
  SavedLocation,
  searchLocationsByQuery,
  saveUserLocation,
} from '../services/worshipService';
import { readUserScoped, writeUserScoped } from '../utils/userStorage';

interface WorshipViewProps {
  uid: string;
  lang: Language;
  onOpenLibraryQibla?: () => void;
}

const TASBIH_PHRASES = [
  { id: 'subhan', ar: 'سُبْحَانَ اللَّهِ', en: 'SubhanAllah' },
  { id: 'hamd', ar: 'الْحَمْدُ لِلَّهِ', en: 'Alhamdulillah' },
  { id: 'akbar', ar: 'اللَّهُ أَكْبَرُ', en: 'Allahu Akbar' },
  { id: 'tahlil', ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ', en: 'La ilaha illallah' },
  { id: 'istighfar', ar: 'أَسْتَغْفِرُ اللَّهَ', en: 'Astaghfirullah' },
  { id: 'salawat', ar: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ', en: 'Allahumma Salli ala Muhammad' },
];

interface TasbihPersisted {
  count: number;
  goal: 33 | 100;
  phraseIdx: number;
}

export const WorshipView: React.FC<WorshipViewProps> = ({ uid, lang, onOpenLibraryQibla }) => {
  const copy = t(lang);
  const [location, setLocation] = useState<SavedLocation>(() => loadSavedLocation());
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [placeResults, setPlaceResults] = useState<GeocodedPlace[]>([]);
  const [adhkarTab, setAdhkarTab] = useState<'morning' | 'evening'>('morning');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [counts, setCounts] = useState<Record<string, number>>(() =>
    readUserScoped<Record<string, number>>(uid, 'adhkar_counts', {})
  );
  const [tasbihState, setTasbihState] = useState<TasbihPersisted>(() =>
    readUserScoped<TasbihPersisted>(uid, 'tasbih_state', { count: 0, goal: 33, phraseIdx: 0 })
  );
  const [beadPulse, setBeadPulse] = useState(false);

  const [osNotifEnabled, setOsNotifEnabled] = useState(() => isOsPrayerBoardEnabled());
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);

  // Sync per-account worship counters cleanly on account switch
  useEffect(() => {
    setCounts(readUserScoped<Record<string, number>>(uid, 'adhkar_counts', {}));
    setTasbihState(readUserScoped<TasbihPersisted>(uid, 'tasbih_state', { count: 0, goal: 33, phraseIdx: 0 }));
  }, [uid]);

  useEffect(() => {
    writeUserScoped(uid, 'adhkar_counts', counts);
  }, [uid, counts]);

  useEffect(() => {
    writeUserScoped(uid, 'tasbih_state', tasbihState);
  }, [uid, tasbihState]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onLocUpdated = () => setLocation(loadSavedLocation());
    window.addEventListener(LOCATION_UPDATED_EVENT, onLocUpdated);
    return () => window.removeEventListener(LOCATION_UPDATED_EVENT, onLocUpdated);
  }, []);

  const applyLocation = (next: SavedLocation) => {
    setLocation(next);
    saveUserLocation(next);
    setLocationError(null);
  };

  const schedule = useMemo(() => {
    return calculatePrayerSchedule(location.lat, location.lng, location.method, new Date(nowMs));
  }, [location, Math.floor(nowMs / 1000)]);

  const requestLocation = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const fix = await detectHighAccuracyGps();
      const geo = await reverseGeocodeCoords(fix.lat, fix.lng, lang);
      applyLocation({
        labelAr: geo.labelAr,
        labelEn: geo.labelEn,
        lat: fix.lat,
        lng: fix.lng,
        method: geo.method,
        source: 'gps',
        accuracyMeters: fix.accuracy,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'UNSUPPORTED') {
        setLocationError(
          lang === 'ar'
            ? 'المتصفح لا يدعم تحديد الموقع الجغرافي. يمكنك البحث عن مدينتك أدناه.'
            : 'Geolocation is not supported in this browser. Search your city below.'
        );
      } else if (code === 'PERMISSION_DENIED') {
        setLocationError(
          lang === 'ar'
            ? 'تم رفض إذن الموقع. فعّل إذن الموقع من إعدادات المتصفح أو ابحث عن مدينتك يدوياً.'
            : 'Location permission was denied. Enable it in browser settings or search your city manually.'
        );
      } else if (code === 'TIMEOUT') {
        setLocationError(
          lang === 'ar'
            ? 'انتهت مهلة إشارة GPS. تأكد من تفعيل خدمة الموقع وحاول مجدداً أو ابحث عن مدينتك.'
            : 'GPS timed out. Ensure location services are enabled or search your city manually.'
        );
      } else {
        setLocationError(
          lang === 'ar'
            ? 'تعذر قراءة إحداثيات GPS حالياً. يمكنك البحث عن مدينتك بالاسم.'
            : 'Unable to determine GPS position right now. Try searching your city by name.'
        );
      }
    } finally {
      setLocating(false);
    }
  };

  const handleSearchPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeQuery.trim()) return;
    setSearchingPlace(true);
    setLocationError(null);
    try {
      const hits = await searchLocationsByQuery(placeQuery, lang);
      setPlaceResults(hits);
      if (hits.length === 0) {
        setLocationError(lang === 'ar' ? 'لم يتم العثور على نتائج مطابقة.' : 'No matching locations found.');
      }
    } catch {
      setLocationError(
        lang === 'ar'
          ? 'تعذر البحث عن المدينة (تحقق من الاتصال بالإنترنت).'
          : 'Could not search locations (check your internet connection).'
      );
    } finally {
      setSearchingPlace(false);
    }
  };

  const handleTasbihTap = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(14);
    }
    setBeadPulse(true);
    window.setTimeout(() => setBeadPulse(false), 140);
    setTasbihState((prev) => ({ ...prev, count: prev.count + 1 }));
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const hijriDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-islamic' : 'en-US-u-ca-islamic', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(nowMs));
    } catch {
      return '';
    }
  }, [lang, Math.floor(nowMs / 86400000)]);

  const prayerRows = [
    { key: 'fajr', label: lang === 'ar' ? 'الفجر' : 'Fajr', time: schedule.fajr },
    { key: 'sunrise', label: lang === 'ar' ? 'الشروق' : 'Sunrise', time: schedule.sunrise },
    { key: 'dhuhr', label: lang === 'ar' ? 'الظهر' : 'Dhuhr', time: schedule.dhuhr },
    { key: 'asr', label: lang === 'ar' ? 'العصر' : 'Asr', time: schedule.asr },
    { key: 'maghrib', label: lang === 'ar' ? 'المغرب' : 'Maghrib', time: schedule.maghrib },
    { key: 'isha', label: lang === 'ar' ? 'العشاء' : 'Isha', time: schedule.isha },
  ];

  const visibleAdhkar = ADHKAR_LIST.filter((a) => a.category === adhkarTab);
  const completedAdhkarCount = visibleAdhkar.filter((a) => (counts[a.id] || 0) >= a.targetCount).length;

  const currentPhrase = TASBIH_PHRASES[tasbihState.phraseIdx] || TASBIH_PHRASES[0];
  const tasbihCycleCount = tasbihState.count % tasbihState.goal;
  const tasbihRounds = Math.floor(tasbihState.count / tasbihState.goal);
  const activeBeads = Math.round(((tasbihCycleCount === 0 && tasbihState.count > 0 ? tasbihState.goal : tasbihCycleCount) / tasbihState.goal) * 33);

  return (
    <div className="space-y-6">
      {/* Page Title & Quick Library Qibla Jump */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
            {lang === 'ar' ? 'العبادات ومواقيت الصلاة' : 'Worship, Prayer Times & Adhkar'}
          </h1>
          <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
            {hijriDate || (lang === 'ar' ? 'أوقات الصلاة الدقيقة والسبحة والأذكار اليومية' : 'Prayer schedule, digital tasbih & daily adhkar')}
          </p>
        </div>

        {onOpenLibraryQibla && (
          <button
            type="button"
            onClick={onOpenLibraryQibla}
            className="min-h-[40px] px-4 rounded-full crystal-card border border-[#c9a44c]/45 text-xs font-bold flex items-center gap-2 text-[#0f6b4f] dark:text-[#c9a44c] hover:border-[#0f6b4f] transition-colors"
          >
            <Compass className="w-4 h-4" />
            <span>{lang === 'ar' ? 'بوصلة القبلة في المكتبة' : 'Qibla Compass in Library'}</span>
          </button>
        )}
      </div>

      {/* Primary Row: Prayer Times Schedule + Redesigned Bead-Ring Digital Tasbih */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Prayer Times Card */}
        <section className="lg:col-span-6 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-bold">{copy.prayerTimes}</h2>
                <p className="text-[11px] text-[#0f6b4f] dark:text-[#c9a44c] font-semibold flex flex-wrap items-center gap-1.5 tabular-nums">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>{lang === 'ar' ? location.labelAr : location.labelEn}</span>
                  {typeof location.accuracyMeters === 'number' && location.source === 'gps' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#5c6862] dark:text-[#98a69f]">
                        {lang === 'ar'
                          ? `دقة ±${formatNumber(location.accuracyMeters, lang)} م`
                          : `±${location.accuracyMeters}m`}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
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
                      applyLocation({
                        labelAr: found.nameAr,
                        labelEn: found.nameEn,
                        lat: found.lat,
                        lng: found.lng,
                        method: found.method,
                        source: 'preset',
                        updatedAt: new Date().toISOString(),
                      });
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
                  onClick={() => setSearchOpen((s) => !s)}
                  aria-label={lang === 'ar' ? 'بحث عن مدينة' : 'Search city'}
                  className="w-9 h-9 rounded-full border border-[#0f6b4f]/25 flex items-center justify-center hover:bg-[#0f6b4f]/10"
                >
                  <Search className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
                </button>
                <button
                  type="button"
                  disabled={locating}
                  onClick={() => void requestLocation()}
                  className="min-h-[38px] px-3.5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0a4e39] disabled:opacity-65"
                >
                  {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                  <span>{locating ? '...' : lang === 'ar' ? 'GPS' : 'GPS'}</span>
                </button>
              </div>
            </div>

            {searchOpen && (
              <div className="rounded-2xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/15 p-3.5 space-y-2.5">
                <form onSubmit={handleSearchPlace} className="flex gap-2">
                  <input
                    type="text"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    placeholder={lang === 'ar' ? 'ابحث باسم المدينة أو الحي...' : 'Search city or neighborhood...'}
                    className="flex-1 min-h-[40px] px-3.5 rounded-full bg-white/80 dark:bg-[#13201b] border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
                  />
                  <button
                    type="submit"
                    disabled={searchingPlace}
                    className="min-h-[40px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold disabled:opacity-60"
                  >
                    {searchingPlace ? '...' : lang === 'ar' ? 'بحث' : 'Search'}
                  </button>
                </form>

                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[#5c6862] dark:text-[#98a69f]">
                    {lang === 'ar' ? 'طريقة الحساب:' : 'Method:'}
                  </span>
                  <select
                    value={location.method}
                    onChange={(e) =>
                      applyLocation({
                        ...location,
                        method: e.target.value as PrayerMethodKey,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="min-h-[34px] px-3 rounded-full bg-white/80 dark:bg-[#13201b] border border-[#0f6b4f]/20 text-[11px] font-semibold"
                  >
                    {(Object.keys(CALCULATION_METHOD_LABELS) as PrayerMethodKey[]).map((key) => (
                      <option key={key} value={key}>
                        {lang === 'ar' ? CALCULATION_METHOD_LABELS[key].ar : CALCULATION_METHOD_LABELS[key].en}
                      </option>
                    ))}
                  </select>
                </div>

                {placeResults.length > 0 && (
                  <div className="divide-y divide-[#0f6b4f]/10 max-h-44 overflow-y-auto">
                    {placeResults.map((place, idx) => (
                      <button
                        key={`${place.lat}_${place.lng}_${idx}`}
                        type="button"
                        onClick={() => {
                          applyLocation({
                            labelAr: place.labelAr,
                            labelEn: place.labelEn,
                            lat: place.lat,
                            lng: place.lng,
                            method: place.method,
                            source: 'search',
                            updatedAt: new Date().toISOString(),
                          });
                          setSearchOpen(false);
                          setPlaceResults([]);
                        }}
                        className="w-full py-2 px-2 text-start text-xs hover:bg-[#0f6b4f]/10 rounded-xl flex items-center justify-between gap-2"
                      >
                        <span className="font-semibold truncate">{lang === 'ar' ? place.labelAr : place.labelEn}</span>
                        <span className="text-[10px] font-mono text-[#5c6862] tabular-nums shrink-0">
                          {place.lat.toFixed(2)}°, {place.lng.toFixed(2)}°
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {locationError && (
              <div
                role="alert"
                className="rounded-xl bg-amber-500/12 border border-amber-500/35 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2"
              >
                <span>{locationError}</span>
                <button
                  type="button"
                  disabled={locating}
                  onClick={() => void requestLocation()}
                  className="min-h-[34px] px-3.5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold hover:bg-[#0a4e39] disabled:opacity-60"
                >
                  {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            )}

            <div className="rounded-2xl hero-emerald-surface text-[#f7f3ea] px-4 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] text-[#c9a44c] font-semibold">
                  {schedule.activePrayerNowName
                    ? lang === 'ar'
                      ? 'وقت الصلاة الآن'
                      : 'Prayer Time Now'
                    : copy.nextPrayer}
                </p>
                <p className="text-lg font-bold">
                  {schedule.activePrayerNowName
                    ? getPrayerLabel(schedule.activePrayerNowName, lang)
                    : prayerRows.find((r) => r.key === schedule.nextPrayerName)?.label}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    setNotifFeedback(null);
                    if (osNotifEnabled) {
                      setOsPrayerBoardEnabled(false);
                      setOsNotifEnabled(false);
                      await clearPrayerBoardNotification();
                    } else {
                      const res = await enableOsPrayerBoard(lang);
                      if (res.ok) setOsNotifEnabled(true);
                      else {
                        setNotifFeedback(
                          lang === 'ar'
                            ? 'اسمح بالإشعارات من المتصفح ليظهر شريط الصلاة في لوحة الإشعارات.'
                            : 'Allow browser notifications to show prayer times in your notification shade.'
                        );
                      }
                    }
                  }}
                  className={`min-h-[36px] px-3 rounded-full border text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
                    osNotifEnabled
                      ? 'bg-[#c9a44c] border-[#c9a44c] text-[#17211d]'
                      : 'bg-white/12 border-white/25 text-white hover:bg-white/20'
                  }`}
                >
                  {osNotifEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                  <span>{osNotifEnabled ? (lang === 'ar' ? 'الإشعارات مفعلة' : 'Alerts On') : lang === 'ar' ? 'تنبيه الإشعارات' : 'Notifications'}</span>
                </button>
                <span className="font-mono font-bold text-base tabular-nums text-[#c9a44c]">
                  {formatFullCountdown(
                    schedule.nextPrayerTime,
                    nowMs,
                    lang,
                    Boolean(schedule.activePrayerNowName)
                  )}
                </span>
              </div>
            </div>

            {notifFeedback && (
              <div className="rounded-xl bg-amber-500/12 border border-amber-500/35 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-300">
                {notifFeedback}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            {prayerRows.map((p) => {
              const isNext = schedule.nextPrayerName === p.key;
              return (
                <div
                  key={p.key}
                  className={`rounded-2xl border p-3 transition-colors ${
                    isNext
                      ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white shadow-sm'
                      : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border-[#0f6b4f]/12'
                  }`}
                >
                  <p className={`text-xs font-bold ${isNext ? 'text-[#c9a44c]' : 'text-[#5c6862] dark:text-[#98a69f]'}`}>
                    {p.label}
                  </p>
                  <p className="font-mono text-base font-bold tabular-nums mt-1">{formatTime(p.time)}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Redesigned Tactile 33-Bead Digital Tasbih Card */}
        <section className="lg:col-span-6 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/25 p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full bg-[#c9a44c]/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#c9a44c]" />
              </span>
              <div>
                <h2 className="text-lg font-bold">{lang === 'ar' ? 'المسبحة الإلكترونية' : 'Digital Tasbih'}</h2>
                <p className="text-xs text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                  {lang === 'ar' ? 'الدورات' : 'Rounds'}: {formatNumber(tasbihRounds, lang)} ·{' '}
                  {lang === 'ar' ? 'الإجمالي' : 'Total'}: {formatNumber(tasbihState.count, lang)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/10">
                {([33, 100] as const).map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => setTasbihState((p) => ({ ...p, goal }))}
                    className={`px-3 py-1 rounded-full text-xs font-bold tabular-nums transition-colors ${
                      tasbihState.goal === goal ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                    }`}
                  >
                    {formatNumber(goal, lang)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label="Reset Tasbih"
                onClick={() => setTasbihState((p) => ({ ...p, count: 0 }))}
                className="w-9 h-9 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tactile Bead Ring + Center Crystal Counter */}
          <div className="flex flex-col items-center justify-center py-1">
            <div className="relative w-64 h-64 flex items-center justify-center">
              <svg viewBox="0 0 260 260" className="w-full h-full pointer-events-none" aria-hidden="true">
                <defs>
                  <radialGradient id="beadGold" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#f5dfa0" />
                    <stop offset="55%" stopColor="#c9a44c" />
                    <stop offset="100%" stopColor="#856318" />
                  </radialGradient>
                  <radialGradient id="beadEmerald" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="65%" stopColor="#0f6b4f" />
                    <stop offset="100%" stopColor="#073b2b" />
                  </radialGradient>
                </defs>

                {/* String track behind beads */}
                <circle cx="130" cy="130" r="108" fill="none" stroke="#c9a44c" strokeOpacity="0.28" strokeWidth="2.5" />

                {/* 33 Interactive-Look Beads arranged evenly around ring */}
                {Array.from({ length: 33 }).map((_, idx) => {
                  const angle = ((idx / 33) * 360 - 90) * (Math.PI / 180);
                  const bx = 130 + 108 * Math.cos(angle);
                  const by = 130 + 108 * Math.sin(angle);
                  const lit = idx < activeBeads;
                  const isDivider = idx % 11 === 0;
                  return (
                    <circle
                      key={idx}
                      cx={bx}
                      cy={by}
                      r={isDivider ? 6.5 : 4.8}
                      fill={lit ? (isDivider ? 'url(#beadGold)' : 'url(#beadEmerald)') : '#d6cfc0'}
                      fillOpacity={lit ? 1 : 0.45}
                      stroke={lit ? '#fdfaf3' : 'transparent'}
                      strokeWidth={lit ? 1.2 : 0}
                    />
                  );
                })}
              </svg>

              <button
                type="button"
                onClick={handleTasbihTap}
                className={`absolute w-40 h-40 rounded-full hero-emerald-surface text-[#f7f3ea] border-2 border-[#c9a44c]/75 shadow-xl flex flex-col items-center justify-center gap-1 transition-transform ${
                  beadPulse ? 'scale-95' : 'hover:scale-[1.02] active:scale-95'
                }`}
              >
                <span className="font-quran text-base sm:text-lg text-[#f1d589] px-3 text-center leading-tight line-clamp-2">
                  {currentPhrase.ar}
                </span>
                <span className="text-4xl font-extrabold font-mono tabular-nums tracking-tight">
                  {formatNumber(tasbihCycleCount, lang)}
                </span>
                <span className="text-[11px] text-[#f7f3ea]/75 tabular-nums">
                  {lang === 'ar' ? `من ${formatNumber(tasbihState.goal, lang)} · اضغط للتسبيح` : `of ${tasbihState.goal} · Tap`}
                </span>
              </button>
            </div>
          </div>

          {/* Dhikr Phrase Selector Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TASBIH_PHRASES.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTasbihState((prev) => ({ ...prev, phraseIdx: idx }))}
                className={`min-h-[42px] px-3 py-2 rounded-2xl border text-xs font-bold transition-colors text-center ${
                  tasbihState.phraseIdx === idx
                    ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white shadow-xs'
                    : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border-[#0f6b4f]/15 hover:border-[#c9a44c]'
                }`}
              >
                {lang === 'ar' ? p.ar : p.en}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Daily Adhkar Section */}
      <section
        id="adhkar-section"
        className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{copy.adhkar}</h2>
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f] tabular-nums">
              {lang === 'ar'
                ? `أُنجز ${formatNumber(completedAdhkarCount, lang)} من أصل ${formatNumber(visibleAdhkar.length, lang)}`
                : `Completed ${completedAdhkarCount} of ${visibleAdhkar.length}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411]">
              <button
                type="button"
                onClick={() => setAdhkarTab('morning')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                  adhkarTab === 'morning' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                }`}
              >
                {copy.morningAdhkar}
              </button>
              <button
                type="button"
                onClick={() => setAdhkarTab('evening')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                  adhkarTab === 'evening' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                }`}
              >
                {copy.eveningAdhkar}
              </button>
            </div>
            <button
              type="button"
              aria-label="Reset counters"
              onClick={() => setCounts({})}
              className="w-10 h-10 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {visibleAdhkar.map((item) => {
            const current = counts[item.id] || 0;
            const completed = current >= item.targetCount;
            const ratio = Math.min(1, current / item.targetCount);
            const circumference = 2 * Math.PI * 14;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                    navigator.vibrate(10);
                  }
                  setCounts((prev) => ({
                    ...prev,
                    [item.id]: Math.min(item.targetCount, (prev[item.id] || 0) + 1),
                  }));
                }}
                className={`text-start rounded-2xl border p-4 sm:p-5 space-y-3 transition-all active:scale-[0.99] flex flex-col justify-between ${
                  completed
                    ? 'border-[#0f6b4f] bg-[#0f6b4f]/10'
                    : 'border-[#0f6b4f]/12 bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 hover:border-[#0f6b4f]/40'
                }`}
              >
                <div className="space-y-2">
                  <p className="font-quran text-xl sm:text-2xl leading-[1.95]">{item.arabic}</p>
                  {lang === 'en' && <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">{item.translation}</p>}
                </div>
                <div className="flex items-center justify-between text-xs pt-2.5 border-t border-[#0f6b4f]/10 w-full">
                  <span className="text-[#5c6862] dark:text-[#98a69f] font-semibold">{item.reference}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
                      {formatNumber(current, lang)} / {formatNumber(item.targetCount, lang)}
                    </span>
                    <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="#0f6b4f"
                        strokeWidth="3"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - ratio)}
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
