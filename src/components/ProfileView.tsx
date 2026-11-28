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
  Info,
  KeyRound,
  Loader2,
  LogOut,
  MailCheck,
  Moon,
  Play,
  RefreshCw,
  Share2,
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
  resetPasswordEmail,
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
  OFFLINE_UPDATED_EVENT,
  OfflineTrackMeta,
  removeOfflineAudio,
} from '../services/mp3QuranApi';
import { readUserScoped, writeUserScoped } from '../utils/userStorage';
import { shareNourApp } from '../utils/shareApp';

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
  onOpenLibrary?: () => void;
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
  onOpenLibrary,
  onLogout,
  onDeleteAccount,
}) => {
  const copy = t(lang);
  const [notificationsOn, setNotificationsOn] = useState<boolean>(() =>
    readUserScoped<boolean>(profile.uid, 'notif_enabled', false)
  );
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const [resendingVerify, setResendingVerify] = useState(false);
  const [checkingVerify, setCheckingVerify] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [sendingReset, setSendingReset] = useState(false);
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
    setNotificationsOn(readUserScoped<boolean>(profile.uid, 'notif_enabled', false));
    setAuthNotice(null);
    setVerifyCooldown(0);
    setResetCooldown(0);
  }, [profile.uid]);

  useEffect(() => {
    if (verifyCooldown <= 0) return;
    const tmr = window.setTimeout(() => setVerifyCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(tmr);
  }, [verifyCooldown]);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const tmr = window.setTimeout(() => setResetCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(tmr);
  }, [resetCooldown]);

  useEffect(() => {
    void refreshOfflineStatus();
    const onOfflineChange = () => {
      setOfflineTracks(getOfflineTracksMeta());
    };
    window.addEventListener(OFFLINE_UPDATED_EVENT, onOfflineChange);
    return () => {
      window.removeEventListener(OFFLINE_UPDATED_EVENT, onOfflineChange);
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

  // Guest Account Creation / Login / Forgot Password Drawer State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'login' | 'forgot'>('signup');
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
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthNotice({
        type: 'error',
        text: lang === 'ar' ? 'يرجى إدخال بريد إلكتروني صحيح.' : 'Please enter a valid email address.',
      });
      return;
    }

    if (authMode === 'signup' && !acceptedTerms) {
      setAuthNotice({
        type: 'error',
        text: lang === 'ar' ? 'يرجى الموافقة على شروط الاستخدام أولاً.' : 'Please accept the terms first.',
      });
      return;
    }

    setBusyAuth(true);
    try {
      if (authMode === 'forgot') {
        await resetPasswordEmail(cleanEmail, lang);
        setResetCooldown(60);
        setAuthNotice({
          type: 'info',
          text:
            lang === 'ar'
              ? `تم إرسال رابط استعادة كلمة المرور من «نور» إلى ${cleanEmail}. تحقق من البريد الوارد أو الرسائل غير المرغوب فيها (Spam).`
              : `A Nour password reset link was sent to ${cleanEmail}. Check your inbox or Spam folder.`,
        });
        setShowAuthModal(false);
        return;
      }
      if (authMode === 'signup') {
        const res = await signUpEmail(
          name.trim() || (lang === 'ar' ? 'قارئ نور' : 'Nour Reader'),
          cleanEmail,
          password,
          lang
        );
        if (res.verificationSent) {
          setVerifyCooldown(60);
          setAuthNotice({
            type: 'info',
            text:
              lang === 'ar'
                ? `تم إنشاء حسابك بنجاح! أرسلنا رابط التأكيد باسم «نور» إلى ${cleanEmail}.`
                : `Account created! We sent a Nour verification link to ${cleanEmail}.`,
          });
        } else {
          setAuthNotice({
            type: 'error',
            text:
              res.verificationError ||
              (lang === 'ar'
                ? 'تم إنشاء الحساب، لكن تعذر إرسال رابط التفعيل الآن. يمكنك إعادة المحاولة من الزر أدناه.'
                : 'Account created, but verification email could not be sent right now. Please retry below.'),
          });
        }
      } else {
        await signInEmail(cleanEmail, password);
      }
      setShowAuthModal(false);
    } catch (err) {
      setAuthNotice({ type: 'error', text: mapFirebaseAuthError(err, lang) });
    } finally {
      setBusyAuth(false);
    }
  };

  const handleResendVerify = async () => {
    if (resendingVerify || verifyCooldown > 0) return;
    setResendingVerify(true);
    setAuthNotice(null);
    try {
      const res = await resendVerificationEmail(lang);
      if (res.alreadyVerified) {
        await onRefreshVerification();
        setAuthNotice({
          type: 'info',
          text:
            lang === 'ar'
              ? 'بريدك الإلكتروني مؤكد بالفعل! تم تفعيل المزامنة السحابية في «نور».'
              : 'Your email is already verified! Cloud sync is active in Nour.',
        });
      } else {
        setVerifyCooldown(60);
        setAuthNotice({
          type: 'info',
          text:
            lang === 'ar'
              ? `تم إرسال رابط التأكيد باسم «نور» إلى ${profile.email || 'بريدك الإلكتروني'}. تحقق من البريد الوارد أو الرسائل غير المرغوب فيها (Spam).`
              : `Verification email from Nour sent to ${profile.email || 'your email'}. Please check inbox or Spam.`,
        });
      }
    } catch (err) {
      setAuthNotice({ type: 'error', text: mapFirebaseAuthError(err, lang) });
    } finally {
      setResendingVerify(false);
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
            ? 'تم تأكيد بريدك الإلكتروني وتفعيل المزامنة السحابية في «نور»!'
            : 'Email verified and cloud sync activated!'
          : lang === 'ar'
          ? 'لم يتم تأكيد البريد بعد. افتح رابط التفعيل في بريدك (وتحقق من Spam) ثم أعد المحاولة.'
          : 'Email is not verified yet. Open the verification link in your inbox (check Spam) and try again.',
      });
    } catch (err) {
      setAuthNotice({ type: 'error', text: mapFirebaseAuthError(err, lang) });
    } finally {
      setCheckingVerify(false);
    }
  };

  const handleSendProfilePasswordReset = async () => {
    if (!profile.email || sendingReset || resetCooldown > 0) return;
    setSendingReset(true);
    setAuthNotice(null);
    try {
      await resetPasswordEmail(profile.email, lang);
      setResetCooldown(60);
      setAuthNotice({
        type: 'info',
        text:
          lang === 'ar'
            ? `تم إرسال رابط إعادة تعيين كلمة المرور باسم «نور» إلى ${profile.email}. تحقق من البريد الوارد أو Spam.`
            : `Password reset email from Nour sent to ${profile.email}. Check inbox or Spam.`,
      });
    } catch (err) {
      setAuthNotice({ type: 'error', text: mapFirebaseAuthError(err, lang) });
    } finally {
      setSendingReset(false);
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
    writeUserScoped(profile.uid, 'notif_enabled', next);
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
      {/* User Card + Account Overview */}
      <div className="crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#fdfaf3] border-2 border-[#c9a44c]/75 p-1 flex items-center justify-center shadow-sm overflow-hidden shrink-0">
              <img src="/src/assets/images/icons/profile.png" alt={profile.displayName} className="w-full h-full object-contain" />
            </div>
            <div className="space-y-0.5">
              <h2 className="text-xl font-bold">{profile.displayName}</h2>
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {profile.isGuest
                  ? lang === 'ar'
                    ? 'وضع الضيف · بيانات محلية مستقلة'
                    : 'Guest Mode · Isolated Local Profile'
                  : profile.email || 'Firebase Cloud Sync'}
              </p>
              <p className="text-[11px] font-semibold text-[#0f6b4f] dark:text-[#c9a44c]">
                {lang === 'ar'
                  ? 'نشاط هذا الحساب وعلاماته محفوظة بشكل مستقل تماماً'
                  : 'Activity & bookmarks are isolated per account'}
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

        {/* Account Isolated Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#0f6b4f]/10">
          <div className="rounded-2xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/10 p-3 text-center">
            <p className="text-lg font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
              {formatNumber(profile.streakDays, lang)}
            </p>
            <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">{copy.streakDays}</p>
          </div>
          <div className="rounded-2xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/10 p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{formatNumber(totalPagesRead, lang)}</p>
            <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar' ? 'صفحات الأسبوع' : 'Weekly Pages'}
            </p>
          </div>
          <div className="rounded-2xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/10 p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{formatNumber(profile.khatmaCurrentPage, lang)}</p>
            <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar' ? 'صفحة الختمة' : 'Khatma Page'}
            </p>
          </div>
          <div className="rounded-2xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/10 p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{formatNumber(bookmarks.length, lang)}</p>
            <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">{copy.savedBookmarks}</p>
          </div>
        </div>
      </div>

      {/* Guest Account Creation / Login / Forgot Password Inline Form */}
      {profile.isGuest && showAuthModal && (
        <div className="crystal-card rounded-3xl border border-[#0f6b4f]/25 dark:border-[#c9a44c]/30 p-6 space-y-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold">
                {authMode === 'signup'
                  ? lang === 'ar'
                    ? 'إنشاء حساب جديد وحفظ التقدم سحابياً'
                    : 'Create Account & Sync Progress'
                  : authMode === 'forgot'
                  ? copy.forgotPassword
                  : copy.signIn}
              </h3>
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {authMode === 'forgot'
                  ? lang === 'ar'
                    ? 'أدخل بريدك الإلكتروني لإرسال رابط استعادة كلمة المرور باسم «نور».'
                    : 'Enter your email to receive a Nour password reset link.'
                  : lang === 'ar'
                  ? 'يبدأ كل حساب جديد بمساحة مستقلة لحفظ القراءة والعلامات دون التداخل مع الضيف أو أي حساب آخر.'
                  : 'Every account keeps its own isolated reading history, bookmarks, and khatma progress.'}
              </p>
            </div>
            <div className="flex p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthNotice(null);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  authMode === 'signup' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                }`}
              >
                {copy.createAccount}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthNotice(null);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  authMode === 'login' || authMode === 'forgot' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
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
            <label className={`block space-y-1 ${authMode === 'forgot' ? 'sm:col-span-2' : ''}`}>
              <span className="text-xs font-semibold">{copy.email}</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-sm focus:outline-none focus:border-[#0f6b4f]"
              />
            </label>
            {authMode !== 'forgot' && (
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
            )}

            {authMode === 'login' && (
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('forgot');
                    setAuthNotice(null);
                  }}
                  className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] hover:underline"
                >
                  {copy.forgotPassword}
                </button>
              </div>
            )}

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
                disabled={busyAuth || (authMode === 'forgot' && resetCooldown > 0)}
                className="min-h-[44px] px-6 rounded-full bg-[#0f6b4f] text-white text-xs font-bold hover:bg-[#0a4e39] disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                {busyAuth && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {authMode === 'signup'
                    ? copy.createAccount
                    : authMode === 'forgot'
                    ? resetCooldown > 0
                      ? lang === 'ar'
                        ? `إعادة الإرسال (${resetCooldown}ث)`
                        : `Resend (${resetCooldown}s)`
                      : copy.resetPassword
                    : copy.signIn}
                </span>
              </button>
              {authMode === 'forgot' ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthNotice(null);
                  }}
                  className="min-h-[44px] px-5 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold hover:bg-[#0f6b4f]/8"
                >
                  {copy.backToLogin}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyAuth}
                  onClick={handleUpgradeGoogle}
                  className="min-h-[44px] px-5 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold hover:bg-[#0f6b4f]/8"
                >
                  {copy.continueWithGoogle}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {authNotice && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-medium flex items-start gap-2.5 ${
            authNotice.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
              : 'border-[#0f6b4f]/30 bg-[#0f6b4f]/10 text-[#0f6b4f] dark:text-[#34d399]'
          }`}
        >
          {authNotice.type === 'info' && <MailCheck className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{authNotice.text}</span>
        </div>
      )}

      {!profile.isGuest && profile.emailVerified === false && (
        <div className="rounded-2xl border border-[#c9a44c]/55 bg-[#c9a44c]/15 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <p className="font-bold text-[#17211d] dark:text-[#ede7da]">{copy.emailNotVerified}</p>
            <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar'
                ? `افتح الرسالة المرسلة باسم «نور» على ${profile.email || 'بريدك'} (وتحقق من مجلد Spam)، ثم اضغط «لقد أكدت بريدي».`
                : `Open the Nour verification email sent to ${profile.email || 'your inbox'} (check Spam), then tap "I've Verified".`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefreshVerify}
              disabled={checkingVerify}
              className="min-h-[40px] px-4 py-2 rounded-full bg-[#0f6b4f] text-white font-semibold flex items-center gap-1.5 hover:bg-[#0a4e39] disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingVerify ? 'animate-spin' : ''}`} />
              <span>{lang === 'ar' ? 'لقد أكدت بريدي' : "I've Verified"}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleResendVerify()}
              disabled={resendingVerify || verifyCooldown > 0}
              className="min-h-[40px] px-3.5 py-2 rounded-full border border-[#0f6b4f]/30 font-semibold flex items-center gap-1.5 hover:bg-[#0f6b4f]/10 disabled:opacity-60"
            >
              {resendingVerify && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {verifyCooldown > 0
                  ? lang === 'ar'
                    ? `أُرسل (${verifyCooldown}ث)`
                    : `Sent (${verifyCooldown}s)`
                  : copy.resendVerification}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Streak + Weekly Chart + Achievements */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 crystal-card rounded-3xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 flex flex-col justify-between gap-5">
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

          <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-40 pt-2">
            {profile.weeklyPages.map((val, idx) => {
              const pct = Math.max(12, Math.round((val / maxWeekly) * 100));
              return (
                <div key={idx} className="flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-[11px] font-bold text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                    {formatNumber(val, lang)}
                  </span>
                  <div className="w-6 sm:w-7 flex-1 rounded-full bg-[#0f6b4f]/10 dark:bg-[#c9a44c]/12 p-0.5 flex items-end overflow-hidden">
                    <div
                      className="w-full rounded-full bg-gradient-to-t from-[#0f6b4f] to-[#1a8a67] dark:from-[#c9a44c] dark:to-[#e0bd66] transition-all duration-300"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="w-7 h-7 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/15 flex items-center justify-center text-[11px] font-bold">
                    {weekdayLabels[idx]}
                  </span>
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

          <button
            type="button"
            onClick={() => void shareNourApp(lang)}
            className="w-full min-h-[52px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 transition-colors"
          >
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                <Share2 className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              </span>
              <span>{lang === 'ar' ? 'مشاركة تطبيق نور' : 'Share Nour App'}</span>
            </span>
            <span className="text-[#0f6b4f] dark:text-[#c9a44c]">
              {lang === 'ar' ? 'مشاركة' : 'Share'}
            </span>
          </button>

          <div className="w-full min-h-[52px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#c9a44c]/18 flex items-center justify-center">
                <Info className="w-4 h-4 text-[#c9a44c]" />
              </span>
              <span>{lang === 'ar' ? 'عن تطبيق نور' : 'About Nour'}</span>
            </span>
            <span className="text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar' ? 'الإصدار ١.١ · عالمي' : 'v1.1 · Global'}
            </span>
          </div>

          {!profile.isGuest && profile.email && (
            <button
              type="button"
              disabled={sendingReset || resetCooldown > 0}
              onClick={() => void handleSendProfilePasswordReset()}
              className="w-full min-h-[52px] px-4 rounded-2xl bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 flex items-center justify-between text-xs font-semibold hover:bg-[#0f6b4f]/8 disabled:opacity-60 transition-colors"
            >
              <span className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center">
                  {sendingReset ? (
                    <Loader2 className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c] animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
                  )}
                </span>
                <span>
                  {lang === 'ar' ? 'استعادة أو تغيير كلمة المرور' : 'Reset / Change Password'}
                </span>
              </span>
              <span className="text-[#0f6b4f] dark:text-[#c9a44c]">
                {resetCooldown > 0
                  ? lang === 'ar'
                    ? `أُرسل (${resetCooldown}ث)`
                    : `Sent (${resetCooldown}s)`
                  : lang === 'ar'
                  ? 'إرسال رابط'
                  : 'Send Link'}
              </span>
            </button>
          )}

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
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
              {formatNumber(cachedPagesCount, lang)} / {formatNumber(604, lang)} {copy.page}
            </span>
            {onOpenLibrary && (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="min-h-[38px] px-4 rounded-full bg-[#0f6b4f]/12 text-[#0f6b4f] dark:text-[#c9a44c] text-xs font-bold hover:bg-[#0f6b4f]/20 transition-colors"
              >
                {lang === 'ar' ? 'فتح المكتبة ←' : 'Open Library →'}
              </button>
            )}
          </div>
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
