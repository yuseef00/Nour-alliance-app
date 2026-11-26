import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Globe, Loader2, MailCheck, Moon, Sun } from 'lucide-react';
import { AuthStage, Language, ThemeMode } from '../types/nour';
import { t } from '../i18n/translations';
import {
  auth,
  mapFirebaseAuthError,
  resetPasswordEmail,
  signInEmail,
  signInGoogle,
  signUpEmail,
  waitForAuthReady,
} from '../services/firebase';

const SPLASH_EMBLEM = '/src/assets/images/nour_logo.png';
const ONBOARDING_IMAGES = [
  '/src/assets/images/onboarding_read_art_1795615768427.jpg',
  '/src/assets/images/onboarding_listen_art_1795615769269.jpg',
  '/src/assets/images/onboarding_memorize_art_1795615768961.jpg',
];

interface AuthFlowProps {
  stage: Exclude<AuthStage, 'app'>;
  lang: Language;
  theme: ThemeMode;
  initialEmail?: string;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onChangeStage: (stage: AuthStage) => void;
  onGuestContinue: () => void;
}

export const AuthFlow: React.FC<AuthFlowProps> = ({
  stage,
  lang,
  theme,
  initialEmail = '',
  onToggleLang,
  onToggleTheme,
  onChangeStage,
  onGuestContinue,
}) => {
  const copy = t(lang);
  const [slideIdx, setSlideIdx] = useState(0);
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (initialEmail && !email) {
      setEmail(initialEmail);
    }
  }, [initialEmail, email]);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const timer = window.setTimeout(() => setResetCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resetCooldown]);

  useEffect(() => {
    if (stage !== 'splash') return;
    let cancelled = false;
    const minDelay = new Promise<void>((resolve) => window.setTimeout(resolve, 1100));
    Promise.all([minDelay, waitForAuthReady()]).then(() => {
      if (cancelled) return;
      if (auth.currentUser || localStorage.getItem('nour_active_uid_v1')) {
        onChangeStage('app');
        return;
      }
      const hasOnboarded = localStorage.getItem('nour_onboarded') === '1';
      onChangeStage(hasOnboarded ? 'auth' : 'onboarding');
    });
    return () => {
      cancelled = true;
    };
  }, [stage, onChangeStage]);

  const slides = [
    { title: copy.onboarding1Title, body: copy.onboarding1Body, img: ONBOARDING_IMAGES[0] },
    { title: copy.onboarding2Title, body: copy.onboarding2Body, img: ONBOARDING_IMAGES[1] },
    { title: copy.onboarding3Title, body: copy.onboarding3Body, img: ONBOARDING_IMAGES[2] },
  ];

  const passwordStrength = (() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  const finishOnboarding = () => {
    localStorage.setItem('nour_onboarded', '1');
    onChangeStage('auth');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFeedback({
        type: 'error',
        text: lang === 'ar' ? 'يرجى إدخال بريد إلكتروني صحيح.' : 'Please enter a valid email address.',
      });
      return;
    }

    setBusy(true);
    try {
      if (mode === 'forgot') {
        await resetPasswordEmail(cleanEmail, lang);
        setResetSentTo(cleanEmail);
        setResetCooldown(60);
        setFeedback({
          type: 'info',
          text:
            lang === 'ar'
              ? `تم إرسال رابط استعادة كلمة المرور من «نور» إلى ${cleanEmail}. تحقق من البريد الوارد أو مجلد الرسائل غير المرغوب فيها (Spam).`
              : `A Nour password reset link has been sent to ${cleanEmail}. Check your inbox or Spam folder.`,
        });
      } else if (mode === 'signup') {
        if (!acceptedTerms) {
          setFeedback({
            type: 'error',
            text: lang === 'ar' ? 'يرجى الموافقة على شروط الاستخدام أولاً.' : 'Please accept the terms first.',
          });
          setBusy(false);
          return;
        }
        const res = await signUpEmail(
          name.trim() || (lang === 'ar' ? 'قارئ نور' : 'Nour Reader'),
          cleanEmail,
          password,
          lang
        );
        if (res.verificationSent) {
          setFeedback({
            type: 'info',
            text:
              lang === 'ar'
                ? 'تم إنشاء الحساب وإرسال رسالة التأكيد باسم «نور» إلى بريدك الإلكتروني.'
                : 'Account created! A Nour verification email has been sent.',
          });
        } else {
          setFeedback({
            type: 'error',
            text:
              res.verificationError ||
              (lang === 'ar'
                ? 'تم إنشاء الحساب لكن تعذر إرسال رسالة التفعيل تلقائياً. يمكنك إعادة الإرسال من داخل التطبيق.'
                : 'Account created, but automatic verification email failed. You can resend it inside the app.'),
          });
        }
      } else {
        await signInEmail(cleanEmail, password);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: mapFirebaseAuthError(err, lang) });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setFeedback(null);
    setBusy(true);
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
      setFeedback({ type: 'error', text: mapFirebaseAuthError(err, lang) });
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'splash') {
    return (
      <div className="min-h-screen bg-[#0f6b4f] text-[#f7f3ea] flex flex-col items-center justify-center p-6 geometric-pattern">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center gap-5"
        >
          <div className="w-36 h-36 rounded-full overflow-hidden border-2 border-[#c9a44c]/80 shadow-2xl bg-[#fdfaf3] p-2.5 flex items-center justify-center">
            <img
              src={SPLASH_EMBLEM}
              alt="شعار نور للقرآن الكريم"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <h2 className="font-quran text-5xl font-bold tracking-tight text-[#f7f3ea]">{copy.appName}</h2>
          <p className="text-sm text-[#f7f3ea]/80 max-w-xs">{copy.appTagline}</p>
          <div className="w-8 h-8 rounded-full border-2 border-[#f7f3ea]/25 border-t-[#c9a44c] animate-spin mt-1" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#17211d] dark:text-[#ede7da] flex flex-col">
      <header className="w-full max-w-6xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden border border-[#c9a44c]/60 bg-[#fdfaf3] p-1 shrink-0 flex items-center justify-center shadow-sm">
            <img src={SPLASH_EMBLEM} alt="شعار نور للقرآن الكريم" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
          </div>
          <span className="font-quran text-2xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">{copy.appName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleLang}
            className="min-h-[42px] px-3.5 rounded-full border border-[#0f6b4f]/20 dark:border-[#c9a44c]/25 crystal-card text-xs font-semibold flex items-center gap-1.5 hover:border-[#0f6b4f] transition-colors"
          >
            <Globe className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={copy.themeLabel}
            className="w-11 h-11 rounded-full border border-[#0f6b4f]/20 dark:border-[#c9a44c]/25 crystal-card flex items-center justify-center hover:border-[#0f6b4f] transition-colors"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-[#c9a44c]" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-6">
        {stage === 'onboarding' ? (
          <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 rounded-3xl p-6 sm:p-10">
            <div className="lg:col-span-6">
              <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-[#0f6b4f]/10 border border-[#c9a44c]/25">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={slideIdx}
                    src={slides[slideIdx].img}
                    alt={slides[slideIdx].title}
                    referrerPolicy="no-referrer"
                    initial={{ opacity: 0.3, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0.3 }}
                    transition={{ duration: 0.25 }}
                    className="w-full h-full object-cover"
                  />
                </AnimatePresence>
              </div>
            </div>
            <div className="lg:col-span-6 flex flex-col justify-between gap-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] tabular-nums">
                  {slideIdx + 1} / {slides.length}
                </span>
                <button
                  type="button"
                  onClick={finishOnboarding}
                  className="text-xs font-semibold text-[#5c6862] dark:text-[#98a69f] hover:text-[#0f6b4f] min-h-[36px] px-2"
                >
                  {copy.skip}
                </button>
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl sm:text-3xl font-bold leading-snug text-balance">{slides[slideIdx].title}</h2>
                <p className="text-sm sm:text-base text-[#5c6862] dark:text-[#98a69f] leading-relaxed">
                  {slides[slideIdx].body}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Slide ${idx + 1}`}
                    onClick={() => setSlideIdx(idx)}
                    className={`h-2 rounded-full transition-all ${
                      slideIdx === idx ? 'w-8 bg-[#0f6b4f] dark:bg-[#c9a44c]' : 'w-2.5 bg-[#0f6b4f]/25 dark:bg-[#c9a44c]/25'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (slideIdx < slides.length - 1) setSlideIdx(slideIdx + 1);
                  else finishOnboarding();
                }}
                className="w-full min-h-[48px] px-5 rounded-full bg-[#0f6b4f] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#0a4e39] transition-colors shadow-sm"
              >
                <span>{slideIdx < slides.length - 1 ? copy.next : copy.startNow}</span>
                {lang === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 rounded-3xl p-6 sm:p-10">
            <div className="hidden lg:flex lg:col-span-5 flex-col justify-between rounded-2xl bg-[#0f6b4f] text-[#f7f3ea] p-8 relative overflow-hidden">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#c9a44c]">{copy.appTagline}</p>
                <h2 className="font-quran text-3xl leading-relaxed">
                  ﴿إِنَّ هَٰذَا الْقُرْآنَ يَهْدِي لِلَّتِي هِيَ أَقْوَمُ﴾
                </h2>
                <p className="text-xs text-[#f7f3ea]/75">سورة الإسراء · الآية ٩</p>
              </div>
              <div className="rounded-xl overflow-hidden border border-[#c9a44c]/30 aspect-[4/3]">
                <img
                  src={ONBOARDING_IMAGES[0]}
                  alt="مصحف القرآن الكريم — قراءة القرآن بتدبر وخشوع"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-center space-y-5">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold">
                  {mode === 'login' ? copy.welcomeBack : mode === 'signup' ? copy.createAccount : copy.forgotPassword}
                </h2>
                <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                  {mode === 'forgot'
                    ? lang === 'ar'
                      ? 'أدخل بريدك الإلكتروني وسنرسل لك رسالة باسم «نور» لإعادة تعيين كلمة المرور.'
                      : 'Enter your email and we will send you a Nour password reset link.'
                    : copy.appTagline}
                </p>
              </div>

              {mode !== 'forgot' && (
                <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/10">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setFeedback(null);
                      setResetSentTo(null);
                    }}
                    className={`min-h-[40px] rounded-full text-xs font-semibold transition-colors ${
                      mode === 'login' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                    }`}
                  >
                    {copy.signIn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setFeedback(null);
                      setResetSentTo(null);
                    }}
                    className={`min-h-[40px] rounded-full text-xs font-semibold transition-colors ${
                      mode === 'signup' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                    }`}
                  >
                    {copy.createAccount}
                  </button>
                </div>
              )}

              {feedback && (
                <div
                  className={`rounded-xl px-4 py-3 text-xs font-medium border flex items-start gap-2.5 ${
                    feedback.type === 'error'
                      ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                      : 'bg-[#0f6b4f]/10 border-[#0f6b4f]/30 text-[#0f6b4f] dark:text-[#34d399]'
                  }`}
                >
                  {feedback.type === 'info' && <MailCheck className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span>{feedback.text}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === 'signup' && (
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold">{copy.fullName}</span>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 dark:border-[#c9a44c]/20 text-sm focus:outline-none focus:border-[#0f6b4f]"
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
                    placeholder="name@example.com"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 dark:border-[#c9a44c]/20 text-sm focus:outline-none focus:border-[#0f6b4f]"
                  />
                </label>

                {mode !== 'forgot' && (
                  <div className="space-y-1.5">
                    <label className="block space-y-1">
                      <span className="text-xs font-semibold">{copy.password}</span>
                      <div className="relative">
                        <input
                          type={showPass ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 dark:border-[#c9a44c]/20 text-sm focus:outline-none focus:border-[#0f6b4f]"
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

                    {mode === 'signup' && password.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                          <span>{copy.passwordStrength}</span>
                          <span>{passwordStrength >= 3 ? copy.strong : passwordStrength === 2 ? copy.medium : copy.weak}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 h-1.5">
                          {[1, 2, 3].map((step) => (
                            <div
                              key={step}
                              className={`rounded-full ${
                                passwordStrength >= step
                                  ? passwordStrength >= 3
                                    ? 'bg-[#0f6b4f]'
                                    : passwordStrength === 2
                                    ? 'bg-[#c9a44c]'
                                    : 'bg-red-500'
                                  : 'bg-[#0f6b4f]/15'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {mode === 'login' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setFeedback(null);
                        setResetSentTo(null);
                      }}
                      className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] hover:underline"
                    >
                      {copy.forgotPassword}
                    </button>
                  </div>
                )}

                {mode === 'signup' && (
                  <label className="flex items-center gap-2.5 text-xs cursor-pointer py-1">
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

                <button
                  type="submit"
                  disabled={busy || (mode === 'forgot' && resetCooldown > 0)}
                  className="w-full min-h-[46px] rounded-full bg-[#0f6b4f] text-white text-sm font-semibold hover:bg-[#0a4e39] disabled:opacity-60 transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {mode === 'login'
                      ? copy.signIn
                      : mode === 'signup'
                      ? copy.createAccount
                      : resetCooldown > 0
                      ? lang === 'ar'
                        ? `إعادة الإرسال بعد ${resetCooldown} ثانية`
                        : `Resend in ${resetCooldown}s`
                      : resetSentTo
                      ? lang === 'ar'
                        ? 'إعادة إرسال رابط الاستعادة'
                        : 'Resend Reset Link'
                      : copy.resetPassword}
                  </span>
                </button>
              </form>

              {mode === 'forgot' ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setFeedback(null);
                    setResetSentTo(null);
                  }}
                  className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] text-center hover:underline"
                >
                  {copy.backToLogin}
                </button>
              ) : (
                <div className="space-y-2.5 pt-2 border-t border-[#0f6b4f]/10 dark:border-[#c9a44c]/15">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleGoogle}
                    className="w-full min-h-[44px] rounded-full border border-[#0f6b4f]/25 dark:border-[#c9a44c]/25 bg-[#f7f3ea] dark:bg-[#0b1411] text-xs font-semibold hover:border-[#0f6b4f] transition-colors"
                  >
                    {copy.continueWithGoogle}
                  </button>
                  <button
                    type="button"
                    onClick={onGuestContinue}
                    className="w-full min-h-[44px] rounded-full text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c] hover:bg-[#0f6b4f]/8 transition-colors"
                  >
                    {copy.continueAsGuest}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
