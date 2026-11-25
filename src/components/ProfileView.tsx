import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Flame,
  Globe,
  HardDriveDownload,
  LogOut,
  Moon,
  Play,
  RefreshCw,
  Sun,
  Trash2,
  UserCheck,
  UserPlus,
  WifiOff,
  X,
} from 'lucide-react';
import { AudioTrack, Chapter, Language, ThemeMode, UserProfile, VerseBookmark } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import {
  mapFirebaseAuthError,
  resendVerificationEmail,
  signInEmail,
  signInGoogle,
  signUpEmail,
} from '../services/firebase';
import {
  clearCachedMushafPages,
  downloadMushafRangeOffline,
  getCachedMushafPagesCount,
} from '../services/quranApi';
import {
  getOfflineTracksMeta,
  OfflineTrackMeta,
  removeOfflineAudio,
} from '../services/mp3QuranApi';
import { PWAInstallButton } from './PWAInstallButton';

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
  onRefreshVerification: () => Promise<boolean>;
  onPlayTrack: (track: AudioTrack) => void;
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
  onRefreshVerification,
  onPlayTrack,
  onLogout,
  onDeleteAccount,
}) => {
  const copy = t(lang);
  const [notificationsOn, setNotificationsOn] = useState(
    () => localStorage.getItem('nour_notif') === '1'
  );
  const [verifySent, setVerifySent] = useState(false);
  const [checkingVerify, setCheckingVerify] = useState(false);
  const [authNotice, setAuthNotice] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  // Offline Manager State
  const [cachedPagesCount, setCachedPagesCount] = useState(0);
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrackMeta[]>(() => getOfflineTracksMeta());
  const [downloadingPack, setDownloadingPack] = useState<'full' | 'juz30' | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const refreshOfflineStatus = async () => {
    const count = await getCachedMushafPagesCount();
    setCachedPagesCount(count);
    setOfflineTracks(getOfflineTracksMeta());
  };

  useEffect(() => {
    void refreshOfflineStatus();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleDownloadPack = async (pack: 'full' | 'juz30') => {
    if (downloadingPack) return;
    const start = pack === 'juz30' ? 582 : 1;
    const end = 604;
    const total = end - start + 1;
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloadingPack(pack);
    setDownloadProgress({ done: 0, total });

    try {
      await downloadMushafRangeOffline(
        start,
        end,
        (done, tot) => {
          setDownloadProgress({ done, total: tot });
        },
        controller.signal
      );
      await refreshOfflineStatus();
    } finally {
      setDownloadingPack(null);
      abortRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    abortRef.current?.abort();
    setDownloadingPack(null);
  };

  const handleClearMushafCache = async () => {
    await clearCachedMushafPages();
    await refreshOfflineStatus();
  };

  const handleDeleteOfflineTrack = async (url: string) => {
    await removeOfflineAudio(url);
    setOfflineTracks(getOfflineTracksMeta());
  };

  // Guest Account Creation / Login Drawer State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [busyAuth, setBusyAuth] = useState(false);

  const handleUpgradeGoogle = async () => {
    setAuthNotice(null);
    setBusyAuth(true);
    try {
      await signInGoogle();
      setShowAuthModal(false);
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
      setAuthNotice({ type: 'error', text: mapFirebaseAuthError(err, lang) });
    } finally {
      setBusyAuth(false);
    }
  };

  const handleGuestEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice(null);
    if (authMode === 'signup' && !acceptedTerms) {
      setAuthNotice({
        type: 'error',
        text: lang === 'ar' ? 'يرجى الموافقة على شروط الاستخدام أولاً.' : 'Please accept the terms first.',
      });
      return;
    }
    setBusyAuth(true);
    try {
      if (authMode === 'signup') {
        await signUpEmail(
          name.trim() || (lang === 'ar' ? 'قارئ نور' : 'Nour Reader'),
          email.trim(),
          password
        );
        setAuthNotice({
          type: 'info',
          text:
            lang === 'ar'
              ? 'تم إنشاء حسابك بنجاح! أرسلنا رابط التأكيد إلى بريدك الإلكتروني.'
              : 'Account created! We sent a verification link to your email.',
        });
      } else {
        await signInEmail(email.trim(), password);
      }
      setShowAuthModal(false);
    } catch (err) {
      setAuthNotice({ type: 'error', text: mapFirebaseAuthError(err, lang) });
    } finally {
      setBusyAuth(false);
    }
  };

  const handleRefreshVerify = async () => {
    setCheckingVerify(true);
    setAuthNotice(null);
    try {
      const ok = await onRefreshVerification();
      setAuthNotice({
        type: ok ? 'info' : 'error',
        text: ok
          ? lang === 'ar'
            ? 'تم تأكيد بريدك الإلكتروني وتفعيل المزامنة السحابية!'
            : 'Email verified and cloud sync activated!'
          : lang === 'ar'
          ? 'لم يتم تأكيد البريد بعد. افتح رابط التفعيل في بريدك ثم أعد المحاولة.'
          : 'Email is not verified yet. Open the verification link in your inbox and try again.',
      });
    } finally {
      setCheckingVerify(false);
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
          <div className="w-14 h-14 rounded-full bg-[#fdfaf3] border-2 border-[#c9a44c]/70 p-1 flex items-center justify-center shadow-sm overflow-hidden shrink-0">
            <img src="/src/assets/images/icons/profile.png" alt={profile.displayName} className="w-full h-full object-contain" />
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setShowAuthModal((v) => !v);
                setAuthNotice(null);
              }}
              className="min-h-[44px] px-5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-2 hover:bg-[#0a4e39] transition-colors shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>{lang === 'ar' ? 'إنشاء حساب' : 'Create Account'}</span>
            </button>
            <button
              type="button"
              onClick={handleUpgradeGoogle}
              disabled={busyAuth}
              className="min-h-[44px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-2 hover:bg-[#0f6b4f]/10 transition-colors"
            >
              <UserCheck className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              <span>Google</span>
            </button>
          </div>
        )}
      </div>

      {/* Guest Account Creation Inline Form */}
      {profile.isGuest && showAuthModal && (
        <div className="crystal-card rounded-3xl border border-[#0f6b4f]/25 dark:border-[#c9a44c]/30 p-6 space-y-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold">
                {authMode === 'signup'
                  ? lang === 'ar'
                    ? 'إنشاء حساب جديد وحفظ التقدم سحابياً'
                    : 'Create Account & Sync Progress'
                  : copy.signIn}
              </h3>
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar'
                  ? 'سيتم الاحتفاظ بآخر صفحة وصلت إليها وعلاماتك المرجعية تلقائياً.'
                  : 'Your current reading page, bookmarks, and khatma progress will be preserved.'}
              </p>
            </div>
            <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15">
              <button
                type="button"
                onClick={() => setAuthMode('signup')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  authMode === 'signup' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                }`}
              >
                {copy.createAccount}
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  authMode === 'login' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                }`}
              >
                {copy.signIn}
              </button>
            </div>
          </div>

          <form onSubmit={handleGuestEmailAuth} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {authMode === 'signup' && (
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold">{copy.fullName}</span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-sm focus:outline-none focus:border-[#0f6b4f]"
                />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-semibold">{copy.email}</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-sm focus:outline-none focus:border-[#0f6b4f]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">{copy.password}</span>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-sm focus:outline-none focus:border-[#0f6b4f]"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  aria-label="Toggle password"
                  className="absolute inset-y-1 end-1.5 w-8 h-8 my-auto rounded-full flex items-center justify-center text-[#5c6862] hover:bg-[#0f6b4f]/10"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            {authMode === 'signup' && (
              <label className="flex items-center gap-2.5 text-xs cursor-pointer sm:col-span-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={acceptedTerms}
                  onClick={() => setAcceptedTerms(!acceptedTerms)}
                  className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                    acceptedTerms
                      ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white'
                      : 'border-[#0f6b4f]/30 bg-[#f7f3ea] dark:bg-[#0b1411]'
                  }`}
                >
                  {acceptedTerms && <Check className="w-3.5 h-3.5" />}
                </button>
                <span>{copy.acceptTerms}</span>
              </label>
            )}

            <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={busyAuth}
                className="min-h-[44px] px-6 rounded-full bg-[#0f6b4f] text-white text-xs font-bold hover:bg-[#0a4e39] disabled:opacity-60 transition-colors"
              >
                {busyAuth
                  ? '...'
                  : authMode === 'signup'
                  ? copy.createAccount
                  : copy.signIn}
              </button>
              <button
                type="button"
                disabled={busyAuth}
                onClick={handleUpgradeGoogle}
                className="min-h-[44px] px-5 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold hover:bg-[#0f6b4f]/8"
              >
                {copy.continueWithGoogle}
              </button>
            </div>
          </form>
        </div>
      )}

      {authNotice && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-medium ${
            authNotice.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
              : 'border-[#0f6b4f]/30 bg-[#0f6b4f]/10 text-[#0f6b4f] dark:text-[#34d399]'
          }`}
        >
          {authNotice.text}
        </div>
      )}

      {!profile.isGuest && profile.emailVerified === false && (
        <div className="rounded-2xl border border-[#c9a44c]/50 bg-[#c9a44c]/15 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>{copy.emailNotVerified}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshVerify}
              disabled={checkingVerify}
              className="px-4 py-2 rounded-full bg-[#0f6b4f] text-white font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingVerify ? 'animate-spin' : ''}`} />
              <span>{lang === 'ar' ? 'لقد أكدت بريدي' : "I've Verified"}</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await resendVerificationEmail();
                setVerifySent(true);
              }}
              className="px-3.5 py-2 rounded-full border border-[#0f6b4f]/30 font-semibold"
            >
              {verifySent ? (lang === 'ar' ? 'تم الإرسال' : 'Sent') : copy.resendVerification}
            </button>
          </div>
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
              <span className="w-8 h-8 rounded-full bg-[#c9a44c]/15 flex items-center justify-center">
                <Flame className="w-4 h-4 text-[#c9a44c]" />
              </span>
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
                      className="w-full rounded-t-full bg-[#0f6b4f] dark:bg-[#c9a44c] transition-all"
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
          <h3 className="text-base font-bold flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-[#c9a44c]/18 flex items-center justify-center">
              <Award className="w-4 h-4 text-[#c9a44c]" />
            </span>
            <span>{copy.achievements}</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {achievements.map((a) => (
              <div
                key={a.id}
                className={`rounded-2xl border p-3.5 text-center space-y-2 ${
                  a.unlocked
                    ? 'border-[#c9a44c] bg-[#c9a44c]/12'
                    : 'border-[#0f6b4f]/10 bg-[#f7f3ea]/70 dark:bg-[#0b1411]/70 opacity-55'
                }`}
              >
                <div
                  className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center ${
                    a.unlocked ? 'bg-[#c9a44c]/25 text-[#c9a44c]' : 'bg-[#0f6b4f]/10 text-[#5c6862]'
                  }`}
                >
                  {a.unlocked ? <CheckCircle2 className="w-5 h-5" /> : <Award className="w-5 h-5" />}
                </div>
                <p className="text-xs font-bold">{a.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bookmarks + Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-4">
          <h3 className="text-base font-bold flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
              <Bookmark className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
            </span>
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
                      className="w-9 h-9 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500/10"
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
            className="w-full min-h-[52px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                <Globe className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              </span>
              <span>{copy.languageLabel}</span>
            </span>
            <span>{lang === 'ar' ? 'العربية (RTL)' : 'English (LTR)'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full min-h-[52px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#c9a44c]/18 flex items-center justify-center">
                {theme === 'light' ? (
                  <Sun className="w-4 h-4 text-[#c9a44c]" />
                ) : (
                  <Moon className="w-4 h-4 text-[#c9a44c]" />
                )}
              </span>
              <span>{copy.themeLabel}</span>
            </span>
            <span>{theme === 'light' ? copy.lightMode : copy.darkMode}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleNotif}
            className="w-full min-h-[52px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                <Bell className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              </span>
              <span>{copy.notificationsLabel}</span>
            </span>
            <span>{notificationsOn ? (lang === 'ar' ? 'مفعّل' : 'On') : lang === 'ar' ? 'متوقف' : 'Off'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportBackup}
            className="w-full min-h-[52px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                <Download className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              </span>
              <span>{copy.backupExport}</span>
            </span>
            <span>JSON</span>
          </button>

          <PWAInstallButton lang={lang} />

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onLogout}
              className="flex-1 min-h-[44px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#0f6b4f]/8 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{copy.logout}</span>
            </button>
            {!profile.isGuest && (
              <button
                type="button"
                onClick={onDeleteAccount}
                className="min-h-[44px] px-4 rounded-full border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/10 transition-colors"
              >
                {copy.deleteAccount}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Offline Access & Downloads Manager */}
      <div className="crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center shrink-0">
              <HardDriveDownload className="w-5 h-5 text-[#0f6b4f] dark:text-[#c9a44c]" />
            </span>
            <div>
              <h3 className="text-base font-bold">
                {lang === 'ar' ? 'الوصول دون إنترنت والتنزيلات' : 'Offline Reading & Downloads'}
              </h3>
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar'
                  ? 'احفظ صفحات المصحف والتلاوات الصوتية على جهازك للقراءة والاستماع بلا اتصال.'
                  : 'Save Mushaf pages and audio recitations locally for full offline access.'}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
            {formatNumber(cachedPagesCount, lang)} / {formatNumber(604, lang)} {copy.page}
          </span>
        </div>

        {/* Mushaf Offline Progress & Pack Buttons */}
        <div className="rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 border border-[#0f6b4f]/12 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              <span>{lang === 'ar' ? 'جاهزية المصحف الشريف دون اتصال' : 'Offline Mushaf Readiness'}</span>
            </span>
            <span className="tabular-nums text-[#5c6862] dark:text-[#98a69f]">
              {formatNumber(Math.round((cachedPagesCount / 604) * 100), lang)}%
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[#0f6b4f]/12 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-[#0f6b4f] to-[#c9a44c] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round((cachedPagesCount / 604) * 100))}%` }}
            />
          </div>

          {downloadingPack ? (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
                {lang === 'ar'
                  ? `جاري التنزيل: ${formatNumber(downloadProgress.done, lang)} / ${formatNumber(downloadProgress.total, lang)} صفحة...`
                  : `Downloading ${downloadProgress.done} / ${downloadProgress.total} pages...`}
              </span>
              <button
                type="button"
                onClick={handleCancelDownload}
                className="min-h-[38px] px-4 rounded-full border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-red-500/10"
              >
                <X className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إيقاف' : 'Cancel'}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void handleDownloadPack('juz30')}
                className="min-h-[42px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-2 hover:bg-[#0f6b4f]/10 transition-colors"
              >
                <Download className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'تحميل جزء عمّ (٢٣ صفحة)' : 'Download Juz 30 (23 pages)'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPack('full')}
                className="min-h-[42px] px-5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-2 hover:bg-[#0a4e39] transition-colors shadow-sm"
              >
                <HardDriveDownload className="w-4 h-4" />
                <span>{lang === 'ar' ? 'تحميل المصحف كاملاً (٦٠٤ صفحة)' : 'Download Full Quran (604 pages)'}</span>
              </button>
              {cachedPagesCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleClearMushafCache()}
                  className="min-h-[42px] px-4 rounded-full border border-red-500/25 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/10 transition-colors"
                >
                  {lang === 'ar' ? 'مسح صفحات المصحف المحفوظة' : 'Clear Cached Pages'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Downloaded Audio Tracks Manager */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-[#c9a44c]" />
              <span>
                {lang === 'ar'
                  ? `التلاوات المحفوظة للاستماع دون اتصال (${formatNumber(offlineTracks.length, lang)})`
                  : `Saved Offline Recitations (${offlineTracks.length})`}
              </span>
            </h4>
          </div>

          {offlineTracks.length === 0 ? (
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar'
                ? 'يمكنك تحميل أي سورة من قسم «استماع» لتشغيلها لاحقاً دون اتصال بالإنترنت.'
                : 'Download any Surah from the Listen tab to play it offline anytime.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {offlineTracks.map((tr) => (
                <div
                  key={tr.url}
                  className="rounded-2xl border border-[#0f6b4f]/12 bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{tr.title}</p>
                    <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f] truncate">{tr.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onPlayTrack({
                          id: `offline_${tr.url}`,
                          title: tr.title,
                          subtitle: tr.subtitle,
                          url: tr.url,
                          type: 'surah',
                        })
                      }
                      aria-label={lang === 'ar' ? 'تشغيل' : 'Play'}
                      className="w-9 h-9 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center hover:bg-[#0a4e39]"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteOfflineTrack(tr.url)}
                      aria-label={lang === 'ar' ? 'حذف' : 'Delete'}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
