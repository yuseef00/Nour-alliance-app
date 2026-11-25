import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Globe2,
  Image as ImageIcon,
  Lock,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Upload,
  Users,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AppAppearance, Language, VisitRecord } from '../types/nour';
import {
  auth,
  checkIsAdmin,
  DEFAULT_APP_APPEARANCE,
  fetchAdminAnalytics,
  logoutAccount,
  sanitizeAppearanceUrl,
  signInEmail,
  signInGoogle,
  subscribeToAuth,
  updateAppAppearance,
} from '../services/firebase';
import { formatNumber } from '../i18n/translations';

interface AdminDashboardProps {
  lang: Language;
  currentAppearance: AppAppearance;
  onExitAdmin: () => void;
}

const PRESET_BACKGROUNDS = [
  {
    id: 'default_mosque' as const,
    labelAr: 'المسجد المضيء (الصورة المرفوعة)',
    labelEn: 'Illuminated Mosque (Uploaded)',
    url: '/src/assets/images/mosque_backdrop.png',
  },
  {
    id: 'preset_read' as const,
    labelAr: 'مصحف المدينة',
    labelEn: 'Madina Mushaf',
    url: '/src/assets/images/onboarding_read_art_1795615768427.jpg',
  },
  {
    id: 'preset_listen' as const,
    labelAr: 'محراب التلاوة',
    labelEn: 'Recitation Mihrab',
    url: '/src/assets/images/onboarding_listen_art_1795615769269.jpg',
  },
  {
    id: 'preset_mem' as const,
    labelAr: 'نور الفجر',
    labelEn: 'Dawn Light',
    url: '/src/assets/images/onboarding_memorize_art_1795615768961.jpg',
  },
  {
    id: 'none' as const,
    labelAr: 'بدون صورة خلفية (تدرج هادئ)',
    labelEn: 'No Image (Soft Gradient)',
    url: '',
  },
];

function countryCodeToFlag(code: string): string {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean) || clean === 'XX') return '🌐';
  return String.fromCodePoint(...Array.from(clean).map((c) => 127397 + c.charCodeAt(0)));
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const maxDim = 1400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
        let dataUrl = canvas.toDataURL(mime, 0.78);
        if (dataUrl.length > 360000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        }
        if (dataUrl.length > 395000) {
          reject(new Error('Image too large after compression'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  lang,
  currentAppearance,
  onExitAdmin,
}) => {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');

  // Analytics State
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [totalRegisteredUsers, setTotalRegisteredUsers] = useState(0);
  const [countrySearch, setCountrySearch] = useState('');

  // Appearance Editor State
  const [draftAppearance, setDraftAppearance] = useState<AppAppearance>(currentAppearance);
  const [customUrlInput, setCustomUrlInput] = useState(
    currentAppearance.backgroundType === 'custom_url' ? currentAppearance.backgroundUrl : ''
  );
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [appearanceNotice, setAppearanceNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setDraftAppearance(currentAppearance);
  }, [currentAppearance]);

  useEffect(() => {
    const unsub = subscribeToAuth(async (u) => {
      setUser(u);
      setCheckingAuth(true);
      const allowed = await checkIsAdmin(u);
      setIsAdmin(allowed);
      setCheckingAuth(false);
    });
    return unsub;
  }, []);

  const loadAnalytics = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingStats(true);
    setStatsError(null);
    try {
      const res = await fetchAdminAnalytics();
      setVisits(res.visits);
      setTotalRegisteredUsers(res.totalRegisteredUsers);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Unable to fetch analytics');
    } finally {
      setLoadingStats(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void loadAnalytics();
    }
  }, [isAdmin, loadAnalytics]);

  const handleAdminGoogleLogin = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signInGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAdminEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signInEmail(emailInput.trim(), passInput);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveAppearance = async (target: AppAppearance = draftAppearance) => {
    setSavingAppearance(true);
    setAppearanceNotice(null);
    try {
      await updateAppAppearance(target);
      setAppearanceNotice({
        type: 'ok',
        text: lang === 'ar' ? 'تم تحديث خلفية التطبيق لجميع المستخدمين بنجاح.' : 'App background updated for all visitors.',
      });
    } catch (err) {
      setAppearanceNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save background',
      });
    } finally {
      setSavingAppearance(false);
    }
  };

  const handleUploadBackgroundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAppearanceNotice(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      const next: AppAppearance = {
        ...draftAppearance,
        backgroundType: 'custom_upload',
        backgroundUrl: dataUrl,
      };
      setDraftAppearance(next);
    } catch (err) {
      setAppearanceNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to process image',
      });
    } finally {
      e.target.value = '';
    }
  };

  // Computed Analytics
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayVisitsCount = useMemo(
    () => visits.filter((v) => v.createdAt.slice(0, 10) === todayStr).length,
    [visits, todayStr]
  );

  const countryStats = useMemo(() => {
    const map = new Map<string, { country: string; code: string; count: number; cities: Set<string> }>();
    visits.forEach((v) => {
      const key = `${v.countryCode}_${v.country}`;
      const existing = map.get(key) || {
        country: v.country,
        code: v.countryCode,
        count: 0,
        cities: new Set<string>(),
      };
      existing.count += 1;
      if (v.city) existing.cities.add(v.city);
      map.set(key, existing);
    });
    const list = Array.from(map.values()).sort((a, b) => b.count - a.count);
    const q = countrySearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.country.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        Array.from(item.cities).some((c) => c.toLowerCase().includes(q))
    );
  }, [visits, countrySearch]);

  const deviceStats = useMemo(() => {
    const counts = { mobile: 0, tablet: 0, desktop: 0 };
    visits.forEach((v) => {
      counts[v.deviceType] += 1;
    });
    return counts;
  }, [visits]);

  const dailySeries = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        date: iso,
        label: d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'short' }),
        count: visits.filter((v) => v.createdAt.slice(0, 10) === iso).length,
      });
    }
    return days;
  }, [visits, lang]);

  const maxDailyCount = Math.max(1, ...dailySeries.map((d) => d.count));
  const totalCountriesCount = useMemo(
    () => new Set(visits.map((v) => v.country)).size,
    [visits]
  );

  // LOCKED GATE VIEW
  if (checkingAuth || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#f7f3ea] dark:bg-[#0b1411] text-[#17211d] dark:text-[#ede7da] geometric-pattern flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl crystal-card border border-[#0f6b4f]/20 dark:border-[#c9a44c]/30 p-7 sm:p-8 space-y-6 shadow-2xl relative z-10">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-[#0f6b4f] text-[#c9a44c] border-2 border-[#c9a44c]/60 flex items-center justify-center shadow-md">
              {user && !checkingAuth ? <ShieldAlert className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
            </div>
            <h1 className="text-xl font-bold">
              {lang === 'ar' ? 'لوحة تحكم المشرف مقفلة' : 'Admin Dashboard Locked'}
            </h1>
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f] leading-relaxed">
              {checkingAuth
                ? lang === 'ar'
                  ? 'جاري التحقق من صلاحيات المشرف...'
                  : 'Verifying administrator permissions...'
                : user
                ? lang === 'ar'
                  ? `الحساب الحالي (${user.email || 'غير موثق'}) لا يملك صلاحيات المشرف.`
                  : `Account (${user.email || 'unverified'}) does not have admin privileges.`
                : lang === 'ar'
                ? 'الوصول مقصور على حساب المشرف المعتمد فقط لإدارة الخلفية وعرض الإحصائيات.'
                : 'Access is restricted to authorized administrators only.'}
            </p>
          </div>

          {authError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-300">
              {authError}
            </div>
          )}

          {!checkingAuth && (
            <div className="space-y-3">
              {!user ? (
                <>
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={handleAdminGoogleLogin}
                    className="w-full min-h-[46px] rounded-xl bg-[#0f6b4f] text-white text-xs font-bold hover:bg-[#0a4e39] transition-colors"
                  >
                    {lang === 'ar' ? 'فتح القفل بحساب Google للمشرف' : 'Unlock with Admin Google Account'}
                  </button>

                  <form onSubmit={handleAdminEmailLogin} className="space-y-2.5 pt-2 border-t border-[#0f6b4f]/10">
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder={lang === 'ar' ? 'البريد الإلكتروني للمشرف' : 'Admin email'}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs"
                    />
                    <input
                      type="password"
                      required
                      value={passInput}
                      onChange={(e) => setPassInput(e.target.value)}
                      placeholder={lang === 'ar' ? 'كلمة المرور' : 'Password'}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={authBusy}
                      className="w-full min-h-[42px] rounded-xl border border-[#0f6b4f]/25 text-xs font-semibold hover:bg-[#0f6b4f]/10"
                    >
                      {lang === 'ar' ? 'دخول بالبريد وكلمة المرور' : 'Unlock with Email'}
                    </button>
                  </form>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void logoutAccount()}
                  className="w-full min-h-[44px] rounded-xl bg-red-500/12 border border-red-500/25 text-red-600 dark:text-red-300 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'تسجيل الخروج والمحاولة بحساب آخر' : 'Sign Out & Switch Account'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onExitAdmin}
                className="w-full min-h-[42px] rounded-xl text-xs font-semibold text-[#5c6862] dark:text-[#98a69f] hover:text-[#0f6b4f] flex items-center justify-center gap-1.5"
              >
                {lang === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                <span>{lang === 'ar' ? 'العودة إلى تطبيق نور' : 'Return to Nour App'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // UNLOCKED ADMIN CONSOLE
  return (
    <div className="min-h-screen bg-[#f7f3ea] dark:bg-[#0b1411] text-[#17211d] dark:text-[#ede7da] geometric-pattern relative">
      <header className="sticky top-0 z-30 crystal-nav border-b border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#0f6b4f] text-[#c9a44c] border border-[#c9a44c]/50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold">
                {lang === 'ar' ? 'لوحة تحكم المشرف — نور' : 'Nour Admin Console'}
              </h1>
              <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAnalytics()}
              disabled={loadingStats}
              className="min-h-[40px] px-4 rounded-full border border-[#0f6b4f]/20 text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0f6b4f]/8"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
              <span>{lang === 'ar' ? 'تحديث' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={onExitAdmin}
              className="min-h-[40px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0a4e39]"
            >
              <span>{lang === 'ar' ? 'فتح التطبيق' : 'Open App'}</span>
            </button>
            <button
              type="button"
              onClick={() => void logoutAccount()}
              aria-label="Logout"
              className="w-10 h-10 rounded-full border border-red-500/25 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 relative z-10">
        {statsError && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-xs text-red-600 dark:text-red-300">
            {statsError}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 space-y-1">
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f] flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              <span>{lang === 'ar' ? 'إجمالي الزيارات المسجلة' : 'Total Visits'}</span>
            </p>
            <p className="text-3xl font-bold tabular-nums">{formatNumber(visits.length, lang)}</p>
          </div>

          <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 space-y-1">
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f] flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-[#c9a44c]" />
              <span>{lang === 'ar' ? 'زيارات اليوم' : "Today's Visits"}</span>
            </p>
            <p className="text-3xl font-bold tabular-nums">{formatNumber(todayVisitsCount, lang)}</p>
          </div>

          <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 space-y-1">
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f] flex items-center gap-1.5">
              <Globe2 className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
              <span>{lang === 'ar' ? 'الدول النشطة' : 'Countries'}</span>
            </p>
            <p className="text-3xl font-bold tabular-nums">{formatNumber(totalCountriesCount, lang)}</p>
          </div>

          <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 space-y-1">
            <p className="text-xs text-[#5c6862] dark:text-[#98a69f] flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#c9a44c]" />
              <span>{lang === 'ar' ? 'الحسابات المسجلة' : 'Registered Users'}</span>
            </p>
            <p className="text-3xl font-bold tabular-nums">{formatNumber(totalRegisteredUsers, lang)}</p>
          </div>
        </div>

        {/* Analytics & Countries Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Weekly Visits Trend & Devices */}
          <div className="lg:col-span-5 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-5">
            <h2 className="text-base font-bold">
              {lang === 'ar' ? 'الزيارات خلال آخر ٧ أيام' : '7-Day Visit Trend'}
            </h2>
            <div className="grid grid-cols-7 gap-2 items-end h-36 pt-4">
              {dailySeries.map((day) => {
                const hPct = Math.max(8, Math.round((day.count / maxDailyCount) * 100));
                return (
                  <div key={day.date} className="flex flex-col items-center justify-end gap-1.5 h-full">
                    <span className="text-[10px] font-bold tabular-nums">{formatNumber(day.count, lang)}</span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-lg bg-[#0f6b4f] dark:bg-[#c9a44c] transition-all"
                        style={{ height: `${hPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[#5c6862] dark:text-[#98a69f]">{day.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-[#0f6b4f]/10 space-y-2.5">
              <h3 className="text-xs font-bold text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'توزيع الأجهزة' : 'Device Breakdown'}
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 p-3 space-y-1">
                  <Smartphone className="w-4 h-4 mx-auto text-[#0f6b4f] dark:text-[#c9a44c]" />
                  <p className="text-sm font-bold tabular-nums">{formatNumber(deviceStats.mobile, lang)}</p>
                  <p className="text-[10px] text-[#5c6862]">{lang === 'ar' ? 'جوال' : 'Mobile'}</p>
                </div>
                <div className="rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 p-3 space-y-1">
                  <Tablet className="w-4 h-4 mx-auto text-[#0f6b4f] dark:text-[#c9a44c]" />
                  <p className="text-sm font-bold tabular-nums">{formatNumber(deviceStats.tablet, lang)}</p>
                  <p className="text-[10px] text-[#5c6862]">{lang === 'ar' ? 'لوحي' : 'Tablet'}</p>
                </div>
                <div className="rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 p-3 space-y-1">
                  <Monitor className="w-4 h-4 mx-auto text-[#0f6b4f] dark:text-[#c9a44c]" />
                  <p className="text-sm font-bold tabular-nums">{formatNumber(deviceStats.desktop, lang)}</p>
                  <p className="text-[10px] text-[#5c6862]">{lang === 'ar' ? 'حاسوب' : 'Desktop'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Countries Table */}
          <div className="lg:col-span-7 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'الزيارات حسب الدول والمدن' : 'Visits by Country'}</span>
              </h2>
              <input
                type="text"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder={lang === 'ar' ? 'تصفية دولة أو مدينة...' : 'Filter country or city...'}
                className="min-h-[38px] px-3 rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs"
              />
            </div>

            {countryStats.length === 0 ? (
              <p className="text-xs text-[#5c6862] py-10 text-center">
                {lang === 'ar' ? 'لا توجد زيارات مسجلة مطابقة بعد.' : 'No recorded visits yet.'}
              </p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pe-1">
                {countryStats.map((item) => {
                  const pct = Math.max(4, Math.round((item.count / Math.max(1, visits.length)) * 100));
                  const cityList = Array.from(item.cities).slice(0, 3).join(' · ');
                  return (
                    <div
                      key={`${item.code}_${item.country}`}
                      className="rounded-2xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/12 p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">{countryCodeToFlag(item.code)}</span>
                          <span className="font-bold truncate">{item.country}</span>
                          {cityList && (
                            <span className="text-[11px] text-[#5c6862] dark:text-[#98a69f] truncate">
                              · {cityList}
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums shrink-0">
                          {formatNumber(item.count, lang)} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#0f6b4f]/15 overflow-hidden">
                        <div className="h-full bg-[#0f6b4f] dark:bg-[#c9a44c]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Background Customization Section */}
        <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'تغيير خلفية التطبيق العامة' : 'Global App Background'}</span>
              </h2>
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar'
                  ? 'اختر الخلفية الافتراضية أو ارفع صورة جديدة أو أدخل رابط صورة لتطبيقها على جميع المستخدمين.'
                  : 'Choose a preset, upload a custom image, or paste an HTTPS URL for all visitors.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDraftAppearance(DEFAULT_APP_APPEARANCE)}
              className="min-h-[38px] px-3.5 rounded-xl border border-[#0f6b4f]/20 text-xs font-semibold hover:bg-[#0f6b4f]/8"
            >
              {lang === 'ar' ? 'استعادة الافتراضي' : 'Reset Default'}
            </button>
          </div>

          {appearanceNotice && (
            <div
              className={`rounded-xl px-4 py-2.5 text-xs font-semibold border ${
                appearanceNotice.type === 'ok'
                  ? 'bg-[#0f6b4f]/12 border-[#0f6b4f]/30 text-[#0f6b4f] dark:text-[#34d399]'
                  : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300'
              }`}
            >
              {appearanceNotice.text}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Presets & Upload Controls */}
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {PRESET_BACKGROUNDS.map((preset) => {
                  const selected =
                    preset.id === 'none'
                      ? draftAppearance.backgroundType === 'none'
                      : draftAppearance.backgroundUrl === preset.url &&
                        (draftAppearance.backgroundType === 'default_mosque' ||
                          draftAppearance.backgroundType === 'preset');
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setDraftAppearance((prev) => ({
                          ...prev,
                          backgroundType:
                            preset.id === 'default_mosque'
                              ? 'default_mosque'
                              : preset.id === 'none'
                              ? 'none'
                              : 'preset',
                          backgroundUrl: preset.url,
                        }))
                      }
                      className={`rounded-2xl border p-2.5 text-start space-y-2 transition-colors ${
                        selected
                          ? 'border-[#0f6b4f] bg-[#0f6b4f]/10 ring-1 ring-[#0f6b4f]'
                          : 'border-[#0f6b4f]/15 bg-[#f7f3ea]/70 dark:bg-[#0b1411]/70 hover:border-[#c9a44c]'
                      }`}
                    >
                      <div className="aspect-[16/10] rounded-xl overflow-hidden bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/10 flex items-center justify-center">
                        {preset.url ? (
                          <img
                            src={preset.url}
                            alt={preset.labelEn}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[11px] text-[#5c6862]">
                            {lang === 'ar' ? 'بدون صورة' : 'None'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold truncate">
                        {lang === 'ar' ? preset.labelAr : preset.labelEn}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <label className="min-h-[42px] px-4 rounded-xl border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-2 cursor-pointer hover:bg-[#0f6b4f]/8">
                  <Upload className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
                  <span>{lang === 'ar' ? 'رفع صورة من الجهاز' : 'Upload Image File'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleUploadBackgroundFile}
                    className="sr-only"
                  />
                </label>

                <div className="flex-1 min-w-[220px] flex items-center gap-2">
                  <input
                    type="url"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder={lang === 'ar' ? 'أو ضع رابط صورة HTTPS...' : 'Or paste HTTPS image URL...'}
                    className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const safe = sanitizeAppearanceUrl(customUrlInput);
                      if (!safe) {
                        setAppearanceNotice({
                          type: 'err',
                          text: lang === 'ar' ? 'يرجى إدخال رابط HTTPS صالح للصورة.' : 'Please enter a valid HTTPS image URL.',
                        });
                        return;
                      }
                      setDraftAppearance((prev) => ({
                        ...prev,
                        backgroundType: 'custom_url',
                        backgroundUrl: safe,
                      }));
                    }}
                    className="min-h-[42px] px-3.5 rounded-xl border border-[#0f6b4f]/25 text-xs font-semibold hover:bg-[#0f6b4f]/8"
                  >
                    {lang === 'ar' ? 'معاينة' : 'Preview'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <label className="space-y-1.5 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span>{lang === 'ar' ? 'شفافية الخلفية' : 'Background Opacity'}</span>
                    <span className="tabular-nums">{Math.round(draftAppearance.backgroundOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.85}
                    step={0.05}
                    value={draftAppearance.backgroundOpacity}
                    onChange={(e) =>
                      setDraftAppearance((prev) => ({ ...prev, backgroundOpacity: Number(e.target.value) }))
                    }
                    className="w-full accent-[#0f6b4f]"
                  />
                </label>

                <label className="space-y-1.5 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span>{lang === 'ar' ? 'ضبابية الخلفية' : 'Background Blur'}</span>
                    <span className="tabular-nums">{draftAppearance.backgroundBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={draftAppearance.backgroundBlur}
                    onChange={(e) =>
                      setDraftAppearance((prev) => ({ ...prev, backgroundBlur: Number(e.target.value) }))
                    }
                    className="w-full accent-[#0f6b4f]"
                  />
                </label>
              </div>

              <button
                type="button"
                disabled={savingAppearance}
                onClick={() => void handleSaveAppearance()}
                className="min-h-[46px] px-6 rounded-xl bg-[#0f6b4f] text-white text-xs font-bold flex items-center gap-2 hover:bg-[#0a4e39] disabled:opacity-60 transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>
                  {savingAppearance
                    ? lang === 'ar'
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : lang === 'ar'
                    ? 'حفظ وتطبيق الخلفية للتطبيق'
                    : 'Save & Apply App Background'}
                </span>
              </button>
            </div>

            {/* Live Mini Preview */}
            <div className="lg:col-span-5 space-y-2">
              <p className="text-xs font-bold">{lang === 'ar' ? 'معاينة حية للخلفية' : 'Live Preview'}</p>
              <div className="relative h-64 rounded-2xl overflow-hidden border border-[#0f6b4f]/20 bg-[#f7f3ea] dark:bg-[#0b1411] geometric-pattern flex items-center justify-center p-5">
                {draftAppearance.backgroundType !== 'none' && draftAppearance.backgroundUrl && (
                  <img
                    src={draftAppearance.backgroundUrl}
                    alt="Background preview"
                    referrerPolicy="no-referrer"
                    style={{
                      opacity: draftAppearance.backgroundOpacity,
                      filter: draftAppearance.backgroundBlur ? `blur(${draftAppearance.backgroundBlur}px)` : undefined,
                    }}
                    className={`absolute inset-0 w-full h-full pointer-events-none ${
                      draftAppearance.backgroundType === 'default_mosque'
                        ? 'object-contain object-bottom mix-blend-multiply dark:mix-blend-screen'
                        : 'object-cover'
                    }`}
                  />
                )}
                <div className="relative z-10 w-full max-w-xs rounded-2xl crystal-card border border-[#0f6b4f]/15 p-4 text-center space-y-1">
                  <p className="font-quran text-xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">نور</p>
                  <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                    {lang === 'ar' ? 'هكذا ستظهر البطاقات البلورية فوق الخلفية' : 'Crystal cards preview over background'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Visits Log */}
        {visits.length > 0 && (
          <div className="rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-3">
            <h2 className="text-sm font-bold">
              {lang === 'ar' ? 'أحدث الزيارات المسجلة' : 'Recent Visits'}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead>
                  <tr className="border-b border-[#0f6b4f]/15 text-[#5c6862] dark:text-[#98a69f]">
                    <th className="py-2 px-2 text-start">{lang === 'ar' ? 'الدولة' : 'Country'}</th>
                    <th className="py-2 px-2 text-start">{lang === 'ar' ? 'المدينة' : 'City'}</th>
                    <th className="py-2 px-2 text-start">{lang === 'ar' ? 'الجهاز' : 'Device'}</th>
                    <th className="py-2 px-2 text-start">{lang === 'ar' ? 'اللغة' : 'Lang'}</th>
                    <th className="py-2 px-2 text-start">{lang === 'ar' ? 'الوقت' : 'Time'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0f6b4f]/10">
                  {visits.slice(0, 20).map((v) => (
                    <tr key={v.visitId}>
                      <td className="py-2.5 px-2 font-semibold">
                        {countryCodeToFlag(v.countryCode)} {v.country}
                      </td>
                      <td className="py-2.5 px-2 text-[#5c6862] dark:text-[#98a69f]">{v.city || '—'}</td>
                      <td className="py-2.5 px-2">{v.deviceType}</td>
                      <td className="py-2.5 px-2 uppercase">{v.language}</td>
                      <td className="py-2.5 px-2 tabular-nums text-[#5c6862] dark:text-[#98a69f]">
                        {new Date(v.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
