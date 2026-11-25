import React, { useState } from 'react';
import {
  Award,
  Bell,
  Bookmark,
  Download,
  Flame,
  Globe,
  LogOut,
  Moon,
  Sun,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Chapter, Language, ThemeMode, UserProfile, VerseBookmark } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import { resendVerificationEmail, signInGoogle } from '../services/firebase';

interface ProfileViewProps {
  lang: Language;
  theme: ThemeMode;
  profile: UserProfile;
  chapters: Chapter[];
  bookmarks: VerseBookmark[];
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onOpenBookmarkPage: (page: number) => void;
  onRemoveBookmark: (verseKey: string) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  lang,
  theme,
  profile,
  chapters,
  bookmarks,
  onToggleLang,
  onToggleTheme,
  onOpenBookmarkPage,
  onRemoveBookmark,
  onLogout,
  onDeleteAccount,
}) => {
  const copy = t(lang);
  const [notificationsOn, setNotificationsOn] = useState(
    () => localStorage.getItem('nour_notif') === '1'
  );
  const [verifySent, setVerifySent] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const handleUpgradeGoogle = async () => {
    setAuthNotice(null);
    try {
      await signInGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : String(err);
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        msg.includes('popup-closed-by-user') ||
        msg.includes('cancelled-popup-request')
      ) {
        return;
      }
      setAuthNotice(
        code === 'auth/popup-blocked' || msg.includes('popup-blocked')
          ? lang === 'ar'
            ? 'تم حظر النافذة المنبثقة من المتصفح. يرجى السماح بالنوافذ المنبثقة والمحاولة مجدداً.'
            : 'Browser blocked the sign-in popup. Please allow popups and try again.'
          : msg
      );
    }
  };

  const weekdayLabels =
    lang === 'ar'
      ? ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']
      : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const maxWeekly = Math.max(10, ...profile.weeklyPages);
  const totalPagesRead = profile.weeklyPages.reduce((acc, v) => acc + v, 0);

  const achievements = [
    {
      id: 'first_page',
      title: lang === 'ar' ? 'البداية المباركة' : 'First Steps',
      unlocked: profile.khatmaCurrentPage >= 1,
    },
    {
      id: 'streak_3',
      title: lang === 'ar' ? 'مواظبة ٣ أيام' : '3-Day Streak',
      unlocked: profile.streakDays >= 3,
    },
    {
      id: 'juz_1',
      title: lang === 'ar' ? 'إتمام جزء' : 'First Juz',
      unlocked: profile.khatmaCurrentPage >= 21,
    },
    {
      id: 'note_keeper',
      title: lang === 'ar' ? 'متدبر الآيات' : 'Reflection Keeper',
      unlocked: bookmarks.length >= 1,
    },
  ];

  const handleToggleNotif = async () => {
    if (!notificationsOn && 'Notification' in window) {
      await Notification.requestPermission();
    }
    const next = !notificationsOn;
    setNotificationsOn(next);
    localStorage.setItem('nour_notif', next ? '1' : '0');
  };

  const handleExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      bookmarks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nour-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* User Card */}
      <div className="crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0f6b4f] text-[#f7f3ea] flex items-center justify-center text-xl font-bold shadow-sm">
            {profile.displayName.slice(0, 1)}
          </div>
          <div>
            <h2 className="text-xl font-bold">{profile.displayName}</h2>
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
              {profile.isGuest
                ? lang === 'ar'
                  ? 'وضع الضيف · حفظ محلي'
                  : 'Guest Mode · Local Storage'
                : profile.email || 'Firebase Cloud Sync'}
            </p>
          </div>
        </div>

        {profile.isGuest && (
          <button
            type="button"
            onClick={handleUpgradeGoogle}
            className="min-h-[44px] px-5 rounded-xl bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-2 hover:bg-[#0a4e39] transition-colors"
          >
            <UserCheck className="w-4 h-4" />
            <span>{copy.upgradeAccount}</span>
          </button>
        )}
      </div>

      {authNotice && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300">
          {authNotice}
        </div>
      )}

      {!profile.isGuest && profile.emailVerified === false && (
        <div className="rounded-2xl border border-[#c9a44c]/50 bg-[#c9a44c]/15 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>{copy.emailNotVerified}</span>
          <button
            type="button"
            onClick={async () => {
              await resendVerificationEmail();
              setVerifySent(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-[#0f6b4f] text-white font-semibold"
          >
            {verifySent ? (lang === 'ar' ? 'تم الإرسال' : 'Sent') : copy.resendVerification}
          </button>
        </div>
      )}

      {/* Streak + Weekly Chart + Achievements */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold">{copy.weeklyActivity}</h3>
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                {formatNumber(totalPagesRead, lang)} {copy.page}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
              <Flame className="w-4 h-4" />
              <span>
                {formatNumber(profile.streakDays, lang)} {copy.streakDays}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-3 items-end h-36 pt-4">
            {profile.weeklyPages.map((val, idx) => {
              const pct = Math.max(8, Math.round((val / maxWeekly) * 100));
              return (
                <div key={idx} className="flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-[11px] font-semibold text-[#5c6862] tabular-nums">
                    {formatNumber(val, lang)}
                  </span>
                  <div className="w-full max-w-[34px] flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-xl bg-[#0f6b4f] dark:bg-[#c9a44c] transition-all"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold">{weekdayLabels[idx]}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Award className="w-4 h-4 text-[#c9a44c]" />
            <span>{copy.achievements}</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {achievements.map((a) => (
              <div
                key={a.id}
                className={`rounded-2xl border p-3.5 text-center space-y-1.5 ${
                  a.unlocked
                    ? 'border-[#c9a44c] bg-[#c9a44c]/12'
                    : 'border-[#0f6b4f]/10 bg-[#f7f3ea]/70 dark:bg-[#0b1411]/70 opacity-55'
                }`}
              >
                <Award className={`w-5 h-5 mx-auto ${a.unlocked ? 'text-[#c9a44c]' : 'text-[#5c6862]'}`} />
                <p className="text-xs font-bold">{a.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bookmarks + Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
            <span>
              {copy.savedBookmarks} ({formatNumber(bookmarks.length, lang)})
            </span>
          </h3>
          {bookmarks.length === 0 ? (
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f] py-4">
              {lang === 'ar' ? 'اضغط على أي آية في المصحف لحفظها أو إضافة ملاحظة.' : 'Tap any verse in the Mushaf to bookmark or add a note.'}
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {bookmarks.map((bm) => {
                const ch = chapters.find((c) => c.id === bm.surahNumber);
                return (
                  <div
                    key={bm.verseKey}
                    className="rounded-2xl border border-[#0f6b4f]/12 bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 p-3 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenBookmarkPage(bm.pageNumber)}
                      className="text-start flex-1 min-w-0"
                    >
                      <p className="font-bold text-xs">
                        {ch ? (lang === 'ar' ? ch.name_arabic : ch.name_simple) : bm.surahNumber} ·{' '}
                        {bm.verseKey}
                      </p>
                      {bm.note && <p className="text-[11px] text-[#5c6862] truncate">{bm.note}</p>}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveBookmark(bm.verseKey)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-3">
          <h3 className="text-base font-bold mb-2">{copy.settingsTitle}</h3>

          <button
            type="button"
            onClick={onToggleLang}
            className="w-full min-h-[48px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              <span>{copy.languageLabel}</span>
            </span>
            <span>{lang === 'ar' ? 'العربية (RTL)' : 'English (LTR)'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full min-h-[48px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              {theme === 'light' ? (
                <Sun className="w-4 h-4 text-[#c9a44c]" />
              ) : (
                <Moon className="w-4 h-4 text-[#c9a44c]" />
              )}
              <span>{copy.themeLabel}</span>
            </span>
            <span>{theme === 'light' ? copy.lightMode : copy.darkMode}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleNotif}
            className="w-full min-h-[48px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              <span>{copy.notificationsLabel}</span>
            </span>
            <span>{notificationsOn ? (lang === 'ar' ? 'مفعّل' : 'On') : lang === 'ar' ? 'متوقف' : 'Off'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportBackup}
            className="w-full min-h-[48px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Download className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              <span>{copy.backupExport}</span>
            </span>
            <span>JSON</span>
          </button>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onLogout}
              className="flex-1 min-h-[44px] px-4 rounded-xl border border-[#0f6b4f]/25 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#0f6b4f]/8 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{copy.logout}</span>
            </button>
            {!profile.isGuest && (
              <button
                type="button"
                onClick={onDeleteAccount}
                className="min-h-[44px] px-4 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/10 transition-colors"
              >
                {copy.deleteAccount}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
