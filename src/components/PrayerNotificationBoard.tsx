import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, BellRing, ChevronDown, ChevronUp, MapPin, X } from 'lucide-react';
import { Language } from '../types/nour';
import {
  calculatePrayerSchedule,
  loadSavedLocation,
  LOCATION_UPDATED_EVENT,
  SavedLocation,
} from '../services/worshipService';
import {
  clearPrayerBoardNotification,
  enableOsPrayerBoard,
  formatShortCountdown,
  getNotificationPermissionState,
  getPrayerLabel,
  isOsPrayerBoardEnabled,
  pushPrayerBoardNotification,
  setOsPrayerBoardEnabled,
} from '../services/prayerNotificationService';

interface PrayerNotificationBoardProps {
  lang: Language;
  visible: boolean;
  onHide: () => void;
  onOpenWorship: () => void;
}

export const PrayerNotificationBoard: React.FC<PrayerNotificationBoardProps> = ({
  lang,
  visible,
  onHide,
  onOpenWorship,
}) => {
  const [location, setLocation] = useState<SavedLocation>(() => loadSavedLocation());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(true);
  const [osEnabled, setOsEnabled] = useState(() => isOsPrayerBoardEnabled());
  const [permNotice, setPermNotice] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onLocUpdate = () => {
      setLocation(loadSavedLocation());
      if (isOsPrayerBoardEnabled() && getNotificationPermissionState() === 'granted') {
        void pushPrayerBoardNotification(lang);
      }
    };
    window.addEventListener(LOCATION_UPDATED_EVENT, onLocUpdate);
    return () => window.removeEventListener(LOCATION_UPDATED_EVENT, onLocUpdate);
  }, [lang]);

  const schedule = useMemo(() => {
    return calculatePrayerSchedule(location.lat, location.lng, location.method, new Date(nowMs));
  }, [location, Math.floor(nowMs / 60000)]);

  if (!visible) return null;

  const fmt = (d: Date) =>
    d.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const nextLabel = getPrayerLabel(schedule.nextPrayerName, lang);
  const remaining = formatShortCountdown(schedule.nextPrayerTime, nowMs, lang);

  const items = [
    { key: 'fajr', label: getPrayerLabel('fajr', lang), time: schedule.fajr },
    { key: 'dhuhr', label: getPrayerLabel('dhuhr', lang), time: schedule.dhuhr },
    { key: 'asr', label: getPrayerLabel('asr', lang), time: schedule.asr },
    { key: 'maghrib', label: getPrayerLabel('maghrib', lang), time: schedule.maghrib },
    { key: 'isha', label: getPrayerLabel('isha', lang), time: schedule.isha },
  ];

  const handleToggleOsBoard = async () => {
    setPermNotice(null);
    if (osEnabled) {
      setOsPrayerBoardEnabled(false);
      setOsEnabled(false);
      await clearPrayerBoardNotification();
      return;
    }

    const res = await enableOsPrayerBoard(lang);
    if (res.ok) {
      setOsEnabled(true);
    } else if (res.permission === 'denied') {
      setPermNotice(
        lang === 'ar'
          ? 'تم حظر الإشعارات من المتصفح. اسمح بالإشعارات من إعدادات الموقع ليظهر شريط الصلاة في إشعارات الجهاز.'
          : 'Notifications are blocked by the browser. Allow notifications in site settings to pin this board.'
      );
    } else if (res.permission === 'unsupported') {
      setPermNotice(
        lang === 'ar'
          ? 'إشعارات النظام غير مدعومة في هذا المتصفح، ستبقى اللوحة ظاهرة هنا داخل التطبيق.'
          : 'System notifications are unsupported here; the live prayer board stays active inside the app.'
      );
    }
  };

  return (
    <section
      aria-label={lang === 'ar' ? 'لوحة إشعارات أوقات الصلاة' : 'Prayer Times Notification Board'}
      className="rounded-2xl crystal-card border border-[#0f6b4f]/25 dark:border-[#c9a44c]/30 shadow-sm overflow-hidden"
    >
      {/* Notification Header Bar */}
      <div className="px-4 py-2.5 bg-[#0f6b4f]/10 dark:bg-[#0f6b4f]/25 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenWorship}
          className="flex items-center gap-2.5 min-w-0 text-start group"
        >
          <span className="w-8 h-8 rounded-full bg-[#0f6b4f] text-[#c9a44c] flex items-center justify-center shrink-0 shadow-xs">
            <BellRing className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
                {lang === 'ar' ? `الصلاة القادمة: ${nextLabel}` : `Next: ${nextLabel}`}
              </span>
              <span className="font-mono font-bold tabular-nums">{fmt(schedule.nextPrayerTime)}</span>
              <span className="text-[#5c6862] dark:text-[#98a69f]" aria-hidden="true">·</span>
              <span className="font-mono font-bold text-[#0f6b4f] dark:text-[#34d399] tabular-nums">
                -{remaining}
              </span>
            </div>
            <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f] flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{lang === 'ar' ? location.labelAr : location.labelEn}</span>
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleToggleOsBoard()}
            className={`min-h-[34px] px-3 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-colors border ${
              osEnabled
                ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white'
                : 'bg-[#f7f3ea]/90 dark:bg-[#0b1411]/90 border-[#0f6b4f]/25 text-[#0f6b4f] dark:text-[#c9a44c] hover:border-[#0f6b4f]'
            }`}
          >
            {osEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            <span>
              {osEnabled
                ? lang === 'ar'
                  ? 'مُثبّت بإشعارات الجهاز'
                  : 'Pinned to OS'
                : lang === 'ar'
                ? 'تثبيت بالإشعارات'
                : 'Pin Notification'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="w-8 h-8 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onHide}
            aria-label={lang === 'ar' ? 'إخفاء اللوحة' : 'Hide board'}
            className="w-8 h-8 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-red-500/10 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 5 Prayers Strip */}
      {expanded && (
        <div className="px-3 py-2.5 grid grid-cols-5 gap-1.5 text-center">
          {items.map((p) => {
            const isNext = schedule.nextPrayerName === p.key;
            return (
              <div
                key={p.key}
                className={`rounded-xl py-1.5 px-1 transition-colors ${
                  isNext
                    ? 'bg-[#0f6b4f] text-white shadow-xs'
                    : 'bg-[#f7f3ea]/70 dark:bg-[#0b1411]/70 text-[#17211d] dark:text-[#ede7da]'
                }`}
              >
                <p className={`text-[10px] font-bold truncate ${isNext ? 'text-[#f7f3ea]' : 'text-[#5c6862] dark:text-[#98a69f]'}`}>
                  {p.label}
                </p>
                <p className="font-mono text-[11px] sm:text-xs font-bold tabular-nums mt-0.5">
                  {fmt(p.time)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {permNotice && (
        <div className="px-4 py-2 bg-amber-500/12 border-t border-amber-500/25 text-[11px] text-amber-800 dark:text-amber-300">
          {permNotice}
        </div>
      )}
    </section>
  );
};
