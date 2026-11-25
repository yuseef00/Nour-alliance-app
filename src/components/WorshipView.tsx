import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Compass, Loader2, MapPin, Navigation, RotateCcw, Search } from 'lucide-react';
import { Language } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import {
  clearPrayerBoardNotification,
  enableOsPrayerBoard,
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
  saveUserLocation,
  searchLocationsByQuery,
} from '../services/worshipService';

interface WorshipViewProps {
  lang: Language;
}

const TASBIH_PHRASES = [
  { id: 'subhan', ar: 'سُبْحَانَ اللَّهِ', en: 'SubhanAllah' },
  { id: 'hamd', ar: 'الْحَمْدُ لِلَّهِ', en: 'Alhamdulillah' },
  { id: 'akbar', ar: 'اللَّهُ أَكْبَرُ', en: 'Allahu Akbar' },
  { id: 'tahlil', ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ', en: 'La ilaha illallah' },
  { id: 'istighfar', ar: 'أَسْتَغْفِرُ اللَّهَ', en: 'Astaghfirullah' },
];

function formatCountdown(targetDate: Date, nowMs: number): string {
  const diff = Math.max(0, Math.floor((targetDate.getTime() - nowMs) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export const WorshipView: React.FC<WorshipViewProps> = ({ lang }) => {
  const copy = t(lang);
  const [location, setLocation] = useState<SavedLocation>(() => loadSavedLocation());
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [placeResults, setPlaceResults] = useState<GeocodedPlace[]>([]);
  const [heading, setHeading] = useState<number>(0);
  const [compassActive, setCompassActive] = useState(false);
  const [adhkarTab, setAdhkarTab] = useState<'morning' | 'evening'>('morning');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('nour_adhkar_counts');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Digital Tasbih State
  const [tasbihPhraseIdx, setTasbihPhraseIdx] = useState(0);
  const [tasbihGoal, setTasbihGoal] = useState<33 | 100>(33);
  const [tasbihCount, setTasbihCount] = useState<number>(() => {
    const saved = Number(localStorage.getItem('nour_tasbih_count') || 0);
    return Number.isFinite(saved) ? saved : 0;
  });
  const [osNotifEnabled, setOsNotifEnabled] = useState(() => isOsPrayerBoardEnabled());
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onLocUpdated = () => setLocation(loadSavedLocation());
    window.addEventListener(LOCATION_UPDATED_EVENT, onLocUpdated);
    return () => window.removeEventListener(LOCATION_UPDATED_EVENT, onLocUpdated);
  }, []);

  useEffect(() => {
    localStorage.setItem('nour_adhkar_counts', JSON.stringify(counts));
  }, [counts]);

  useEffect(() => {
    localStorage.setItem('nour_tasbih_count', String(tasbihCount));
  }, [tasbihCount]);

  useEffect(() => {
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (typeof e.alpha === 'number') {
        setHeading(360 - e.alpha);
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
    }
  };

  const applyLocation = (next: SavedLocation) => {
    setLocation(next);
    saveUserLocation(next);
    setLocationError(null);
  };

  const schedule = useMemo(() => {
    return calculatePrayerSchedule(location.lat, location.lng, location.method, new Date(nowMs));
  }, [location, Math.floor(nowMs / 60000)]);

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
        setLocationError(
          lang === 'ar' ? 'لم يتم العثور على نتائج مطابقة.' : 'No matching locations found.'
        );
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

  const qiblaRelative = (schedule.qiblaBearing - heading + 360) % 360;
  const visibleAdhkar = ADHKAR_LIST.filter((a) => a.category === adhkarTab);
  const currentPhrase = TASBIH_PHRASES[tasbihPhraseIdx];
  const tasbihCycleCount = tasbihCount % tasbihGoal;
  const tasbihRounds = Math.floor(tasbihCount / tasbihGoal);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Prayer Times */}
        <div className="lg:col-span-7 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-bold">{copy.prayerTimes}</h2>
              {hijriDate && <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">{hijriDate}</p>}
              <p className="text-[11px] text-[#0f6b4f] dark:text-[#c9a44c] font-semibold flex flex-wrap items-center gap-1.5 tabular-nums">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'ar' ? location.labelAr : location.labelEn}</span>
                {typeof location.accuracyMeters === 'number' && location.source === 'gps' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#5c6862] dark:text-[#98a69f]">
                      {lang === 'ar'
                        ? `دقة ±${formatNumber(location.accuracyMeters, lang)} م`
                        : `Accuracy ±${location.accuracyMeters}m`}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                className="min-h-[40px] px-3 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs font-semibold"
              >
                {location.source !== 'preset' && (
                  <option value="custom">
                    {lang === 'ar' ? location.labelAr : location.labelEn}
                  </option>
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
                className="w-10 h-10 rounded-full border border-[#0f6b4f]/25 flex items-center justify-center hover:bg-[#0f6b4f]/10"
              >
                <Search className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              </button>
              <button
                type="button"
                disabled={locating}
                onClick={() => void requestLocation()}
                className="min-h-[40px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0a4e39] disabled:opacity-65 transition-colors"
              >
                {locating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MapPin className="w-3.5 h-3.5" />
                )}
                <span>
                  {locating
                    ? lang === 'ar'
                      ? 'جاري التحديد...'
                      : 'Locating...'
                    : lang === 'ar'
                    ? 'تحديد موقعي GPS'
                    : 'Accurate GPS'}
                </span>
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
                      <span className="font-semibold truncate">
                        {lang === 'ar' ? place.labelAr : place.labelEn}
                      </span>
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
            <div className="rounded-xl bg-amber-500/12 border border-amber-500/35 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-300">
              {locationError}
            </div>
          )}

          <div className="rounded-2xl bg-[#0f6b4f]/10 dark:bg-[#0f6b4f]/25 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#0f6b4f] dark:text-[#c9a44c]">
              {copy.nextPrayer}: {prayerRows.find((r) => r.key === schedule.nextPrayerName)?.label}
            </span>
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
                className={`min-h-[32px] px-3 rounded-full border text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
                  osNotifEnabled
                    ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white'
                    : 'bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border-[#0f6b4f]/25 text-[#0f6b4f] dark:text-[#c9a44c]'
                }`}
              >
                {osNotifEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                <span>
                  {osNotifEnabled
                    ? lang === 'ar'
                      ? 'إشعارات الصلاة مفعّلة'
                      : 'Prayer Board On'
                    : lang === 'ar'
                    ? 'عرض عند الإشعارات'
                    : 'Show in Notifications'}
                </span>
              </button>
              <span className="font-mono font-bold text-sm tabular-nums">
                -{formatCountdown(schedule.nextPrayerTime, nowMs)}
              </span>
            </div>
          </div>

          {notifFeedback && (
            <div className="rounded-xl bg-amber-500/12 border border-amber-500/35 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-300">
              {notifFeedback}
            </div>
          )}

          <div className="divide-y divide-[#0f6b4f]/10 dark:divide-[#c9a44c]/12">
            {prayerRows.map((p) => {
              const isNext = schedule.nextPrayerName === p.key;
              return (
                <div
                  key={p.key}
                  className={`py-3.5 px-3 rounded-xl flex items-center justify-between ${
                    isNext ? 'bg-[#0f6b4f] text-white' : ''
                  }`}
                >
                  <span className="font-semibold text-sm">{p.label}</span>
                  <span className="font-mono text-sm font-bold tabular-nums">{formatTime(p.time)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Qibla Compass */}
        <div className="lg:col-span-5 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6 flex flex-col items-center justify-between gap-5">
          <div className="w-full flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                <Compass className="w-5 h-5 text-[#0f6b4f] dark:text-[#c9a44c]" />
              </span>
              <span>{copy.qiblaCompass}</span>
            </h2>
            <span className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
              {schedule.qiblaBearing.toFixed(1)}°
            </span>
          </div>

          <div className="relative w-56 h-56 rounded-full border-4 border-[#c9a44c]/50 bg-[#f7f3ea] dark:bg-[#0b1411] flex items-center justify-center shadow-inner">
            <span className="absolute top-2.5 text-[11px] font-bold text-[#5c6862]">N</span>
            <span className="absolute bottom-2.5 text-[11px] font-bold text-[#5c6862]">S</span>
            <span className="absolute end-3 text-[11px] font-bold text-[#5c6862]">E</span>
            <span className="absolute start-3 text-[11px] font-bold text-[#5c6862]">W</span>
            <div
              className="w-full h-full flex items-center justify-center transition-transform duration-300"
              style={{ transform: `rotate(${qiblaRelative}deg)` }}
            >
              <div className="flex flex-col items-center">
                <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[48px] border-b-[#0f6b4f]" />
                <div className="w-3.5 h-3.5 rounded-full bg-[#c9a44c] -my-1 border-2 border-white" />
                <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[36px] border-t-[#5c6862]/40" />
              </div>
            </div>
          </div>

          <div className="space-y-2 text-center w-full">
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar'
                ? 'يشير السهم الأخضر نحو الكعبة المشرفة بناءً على إحداثيات مدينتك.'
                : 'The green needle points toward the Kaaba from your selected coordinates.'}
            </p>
            {!compassActive && (
              <button
                type="button"
                onClick={enableCompass}
                className="min-h-[40px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#0f6b4f]/10"
              >
                <Navigation className="w-3.5 h-3.5 text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'معايرة البوصلة الحية' : 'Calibrate Live Compass'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Digital Tasbih Counter */}
      <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold">{lang === 'ar' ? 'السبحة الإلكترونية' : 'Digital Tasbih'}</h2>
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f] tabular-nums">
              {lang === 'ar' ? 'الدورات المكتملة' : 'Completed rounds'}: {formatNumber(tasbihRounds, lang)} ·{' '}
              {lang === 'ar' ? 'الإجمالي' : 'Total'}: {formatNumber(tasbihCount, lang)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411]">
              {([33, 100] as const).map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => setTasbihGoal(goal)}
                  className={`px-3 py-1 rounded-full text-xs font-bold tabular-nums ${
                    tasbihGoal === goal ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                  }`}
                >
                  {formatNumber(goal, lang)}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="Reset Tasbih"
              onClick={() => setTasbihCount(0)}
              className="w-10 h-10 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-wrap gap-2 justify-center md:justify-start">
            {TASBIH_PHRASES.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTasbihPhraseIdx(idx)}
                className={`min-h-[40px] px-4 rounded-full border text-xs font-bold transition-colors ${
                  tasbihPhraseIdx === idx
                    ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white'
                    : 'bg-[#f7f3ea] dark:bg-[#0b1411] border-[#0f6b4f]/15 hover:border-[#c9a44c]'
                }`}
              >
                {lang === 'ar' ? p.ar : p.en}
              </button>
            ))}
          </div>

          <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
            <svg className="w-40 h-40 -rotate-90 pointer-events-none" viewBox="0 0 160 160" aria-hidden="true">
              <circle
                cx="80"
                cy="80"
                r="72"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.14"
                strokeWidth="6"
              />
              <circle
                cx="80"
                cy="80"
                r="72"
                fill="none"
                stroke="#c9a44c"
                strokeWidth="6"
                strokeDasharray={2 * Math.PI * 72}
                strokeDashoffset={2 * Math.PI * 72 * (1 - tasbihCycleCount / tasbihGoal)}
                strokeLinecap="round"
                className="transition-all duration-150"
              />
            </svg>
            <button
              type="button"
              onClick={() => setTasbihCount((c) => c + 1)}
              className="absolute w-32 h-32 rounded-full hero-emerald-surface text-[#f7f3ea] border-2 border-[#c9a44c]/60 shadow-lg flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
            >
              <span className="font-quran text-base text-[#c9a44c] px-2 truncate max-w-full">
                {currentPhrase.ar}
              </span>
              <span className="text-3xl font-bold font-mono tabular-nums">
                {formatNumber(tasbihCycleCount, lang)}
              </span>
              <span className="text-[11px] text-[#f7f3ea]/75 tabular-nums">
                / {formatNumber(tasbihGoal, lang)}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Daily Adhkar */}
      <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{copy.adhkar}</h2>
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {visibleAdhkar.map((item) => {
            const current = counts[item.id] || 0;
            const completed = current >= item.targetCount;
            const ratio = Math.min(1, current / item.targetCount);
            const circumference = 2 * Math.PI * 14;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setCounts((prev) => ({
                    ...prev,
                    [item.id]: Math.min(item.targetCount, (prev[item.id] || 0) + 1),
                  }))
                }
                className={`text-start rounded-2xl border p-4 space-y-3 transition-all active:scale-[0.99] ${
                  completed
                    ? 'border-[#0f6b4f] bg-[#0f6b4f]/10'
                    : 'border-[#0f6b4f]/12 bg-[#f7f3ea] dark:bg-[#0b1411] hover:border-[#0f6b4f]/40'
                }`}
              >
                <p className="font-quran text-xl leading-[1.9]">{item.arabic}</p>
                {lang === 'en' && <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">{item.translation}</p>}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-[#0f6b4f]/10">
                  <span className="text-[#5c6862] dark:text-[#98a69f]">{item.reference}</span>
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
      </div>
    </div>
  );
};
