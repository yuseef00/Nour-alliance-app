import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, MailCheck, X, AlertCircle } from 'lucide-react';
import { Language } from '../types/nour';
import {
  applyEmailVerificationCode,
  confirmNewPassword,
  mapFirebaseAuthError,
  verifyResetCode,
} from '../services/firebase';

export type PendingAuthAction =
  | { kind: 'verifyEmail'; oobCode: string }
  | { kind: 'resetPassword'; oobCode: string }
  | null;

interface AuthActionModalProps {
  action: PendingAuthAction;
  lang: Language;
  onClose: () => void;
  onVerified: () => Promise<void>;
  onResetSuccess: (email: string) => void;
}

export const AuthActionModal: React.FC<AuthActionModalProps> = ({
  action,
  lang,
  onClose,
  onVerified,
  onResetSuccess,
}) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'success' | 'error'>('loading');
  const [targetEmail, setTargetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!action) return;
    let cancelled = false;
    setStatus('loading');
    setMessage('');
    setNewPassword('');
    setConfirmPassword('');

    if (action.kind === 'verifyEmail') {
      applyEmailVerificationCode(action.oobCode)
        .then(async () => {
          if (cancelled) return;
          await onVerified().catch(() => {});
          if (cancelled) return;
          setStatus('success');
          setMessage(
            lang === 'ar'
              ? 'تم تأكيد بريدك الإلكتروني في تطبيق «نور» بنجاح وتفعيل المزامنة السحابية!'
              : 'Your email in Nour has been verified and cloud sync is now active!'
          );
        })
        .catch((err) => {
          if (cancelled) return;
          setStatus('error');
          setMessage(mapFirebaseAuthError(err, lang));
        });
    } else {
      verifyResetCode(action.oobCode)
        .then((email) => {
          if (cancelled) return;
          setTargetEmail(email);
          setStatus('ready');
        })
        .catch((err) => {
          if (cancelled) return;
          setStatus('error');
          setMessage(mapFirebaseAuthError(err, lang));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [action, lang, onVerified]);

  if (!action) return null;

  const passwordStrength = (() => {
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (/[A-Z0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    return score;
  })();

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (action.kind !== 'resetPassword') return;
    if (newPassword.length < 6) {
      setMessage(
        lang === 'ar'
          ? 'كلمة المرور يجب أن تتكون من ٦ أحرف على الأقل.'
          : 'Password must be at least 6 characters.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage(
        lang === 'ar'
          ? 'كلمتا المرور غير متطابقتين، يرجى التأكد وإعادة المحاولة.'
          : 'Passwords do not match.'
      );
      return;
    }

    setStatus('submitting');
    setMessage('');
    try {
      await confirmNewPassword(action.oobCode, newPassword);
      setStatus('success');
      setMessage(
        lang === 'ar'
          ? 'تم تحديث كلمة المرور لحسابك في «نور» بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.'
          : 'Your Nour password has been updated! You can now sign in with your new password.'
      );
      onResetSuccess(targetEmail);
    } catch (err) {
      setStatus('ready');
      setMessage(mapFirebaseAuthError(err, lang));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-3xl crystal-card border border-[#0f6b4f]/25 dark:border-[#c9a44c]/30 p-6 sm:p-7 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-[#0f6b4f]/12 flex items-center justify-center shrink-0">
              {action.kind === 'verifyEmail' ? (
                <MailCheck className="w-5 h-5 text-[#0f6b4f] dark:text-[#c9a44c]" />
              ) : (
                <KeyRound className="w-5 h-5 text-[#0f6b4f] dark:text-[#c9a44c]" />
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#c9a44c]">
                {lang === 'ar' ? 'نور — رفيق القرآن الكريم' : 'Nour — Quran Companion'}
              </p>
              <h2 className="text-base font-bold text-[#17211d] dark:text-[#ede7da]">
                {action.kind === 'verifyEmail'
                  ? lang === 'ar'
                    ? 'تأكيد البريد الإلكتروني'
                    : 'Verify Email Address'
                  : lang === 'ar'
                  ? 'تعيين كلمة مرور جديدة'
                  : 'Set New Password'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
            className="w-9 h-9 rounded-full border border-[#0f6b4f]/20 flex items-center justify-center hover:bg-[#0f6b4f]/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {status === 'loading' && (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-[#0f6b4f] dark:text-[#c9a44c] animate-spin" />
            <p className="text-xs font-semibold text-[#5c6862] dark:text-[#98a69f]">
              {lang === 'ar' ? 'جاري التحقق من الرابط...' : 'Verifying link...'}
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#0f6b4f]/30 bg-[#0f6b4f]/10 p-4 flex items-start gap-3 text-xs font-medium text-[#0f6b4f] dark:text-[#34d399]">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[46px] rounded-full bg-[#0f6b4f] text-white text-sm font-bold hover:bg-[#0a4e39] transition-colors"
            >
              {lang === 'ar' ? 'المتابعة في نور' : 'Continue to Nour'}
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3 text-xs font-medium text-red-700 dark:text-red-300">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[44px] rounded-full border border-[#0f6b4f]/25 text-xs font-bold hover:bg-[#0f6b4f]/8 transition-colors"
            >
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
        )}

        {(status === 'ready' || status === 'submitting') && action.kind === 'resetPassword' && (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            {targetEmail && (
              <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'الحساب:' : 'Account:'}{' '}
                <span className="font-bold text-[#17211d] dark:text-[#ede7da] dir-ltr inline-block">
                  {targetEmail}
                </span>
              </p>
            )}

            {message && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300">
                {message}
              </div>
            )}

            <label className="block space-y-1">
              <span className="text-xs font-semibold">
                {lang === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
              </span>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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

            {newPassword.length > 0 && (
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
            )}

            <label className="block space-y-1">
              <span className="text-xs font-semibold">
                {lang === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
              </span>
              <input
                type={showPass ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-sm focus:outline-none focus:border-[#0f6b4f]"
              />
            </label>

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full min-h-[46px] rounded-full bg-[#0f6b4f] text-white text-sm font-bold hover:bg-[#0a4e39] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {status === 'submitting' && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{lang === 'ar' ? 'حفظ كلمة المرور الجديدة' : 'Save New Password'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
