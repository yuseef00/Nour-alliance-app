import React, { useEffect, useMemo, useState } from 'react';
import { Compass, MapPin, Navigation, RotateCcw } from 'lucide-react';
import { Language } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import {
  ADHKAR_LIST,
  calculatePrayerSchedule,
  CITY_PRESETS,
  CityPreset,
} from '../services/worshipService';

interface WorshipViewProps {
  lang: Language;
}

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
  const [selectedCity, setSelectedCity] = useState<CityPreset>(CITY_PRESETS[0]);
  const [customCoords, setCustomCoords] = useState<{ lat: number; lng: number } | null>(null);
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

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem('nour_adhkar_counts', JSON.stringify(counts));
  }, [counts]);

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

  const schedule = useMemo(() => {
    const lat = customCoords?.lat ?? selectedCity.lat;
    const lng = customCoords?.lng ?? selectedCity.lng;
    return calculatePrayerSchedule(lat, lng, selectedCity.method, new Date(nowMs));
  }, [selectedCity, customCoords, Math.floor(nowMs / 60000)]);

  const requestLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setCustomCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    });
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Prayer Times */}
        <div className="lg:col-span-7 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{copy.prayerTimes}</h2>
              {hijriDate && <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">{hijriDate}</p>}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedCity.id}
                onChange={(e) => {
                  const found = CITY_PRESETS.find((c) => c.id === e.target.value);
                  if (found) {
                    setSelectedCity(found);
                    setCustomCoords(null);
                  }
                }}
                className="min-h-[40px] px-3 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs font-semibold"
              >
                {CITY_PRESETS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === 'ar' ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={requestLocation}
                className="min-h-[40px] px-3 rounded-xl border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0f6b4f]/10"
              >
                <MapPin className="w-3.5 h-3.5 text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'موقعي' : 'GPS'}</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0f6b4f]/10 dark:bg-[#0f6b4f]/25 px-4 py-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#0f6b4f] dark:text-[#c9a44c]">
              {copy.nextPrayer}: {prayerRows.find((r) => r.key === schedule.nextPrayerName)?.label}
            </span>
            <span className="font-mono font-bold text-sm tabular-nums">
              -{formatCountdown(schedule.nextPrayerTime, nowMs)}
            </span>
          </div>

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
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#0f6b4f] dark:text-[#c9a44c]" />
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
                className="min-h-[40px] px-4 rounded-xl border border-[#0f6b4f]/25 text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#0f6b4f]/10"
              >
                <Navigation className="w-3.5 h-3.5 text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'معايرة البوصلة الحية' : 'Calibrate Live Compass'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Daily Adhkar */}
      <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{copy.adhkar}</h2>
          <div className="flex items-center gap-2">
            <div className="flex p-1 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411]">
              <button
                type="button"
                onClick={() => setAdhkarTab('morning')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                  adhkarTab === 'morning' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                }`}
              >
                {copy.morningAdhkar}
              </button>
              <button
                type="button"
                onClick={() => setAdhkarTab('evening')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
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
              className="w-10 h-10 rounded-xl border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10"
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
