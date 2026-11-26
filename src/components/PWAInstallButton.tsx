import React, { useState } from 'react';
import { CheckCircle2, Download, Loader2, Share, Smartphone, X } from 'lucide-react';
import { Language } from '../types/nour';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  lang: Language;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang, compact = false }) => {
  const { isInstallable, isInstalling, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (compact) return null;
    return (
      <div
        role="status"
        className="w-full min-h-[46px] px-4 rounded-full bg-[#0f6b4f]/12 border border-[#0f6b4f]/30 text-[#0f6b4f] dark:text-[#34d399] text-xs font-bold flex items-center justify-center gap-2"
      >
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span className="whitespace-nowrap">{lang === 'ar' ? 'نور مثبت على جهازك' : 'Nour is Installed'}</span>
      </div>
    );
  }

  if (isInstalling) {
    return (
      <button
        type="button"
        disabled
        className={
          compact
            ? 'min-h-[40px] px-3.5 rounded-full bg-[#0f6b4f]/80 text-white text-xs font-semibold flex items-center gap-1.5 opacity-90 cursor-wait whitespace-nowrap'
            : 'w-full min-h-[46px] px-4 rounded-full bg-[#0f6b4f]/80 text-white text-xs font-semibold flex items-center justify-center gap-2 opacity-90 cursor-wait whitespace-nowrap'
        }
      >
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span>{lang === 'ar' ? 'جارٍ التثبيت...' : 'Installing...'}</span>
      </button>
    );
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          compact
            ? 'min-h-[40px] px-3.5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-[#0a4e39] transition-colors whitespace-nowrap'
            : 'w-full min-h-[46px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm hover:bg-[#0a4e39] transition-colors whitespace-nowrap'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{lang === 'ar' ? 'ثبّت نور على جهازك' : 'Install Nour on Device'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className={
          compact
            ? 'min-h-[40px] px-3 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0f6b4f]/8 transition-colors whitespace-nowrap'
            : 'w-full min-h-[46px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#0f6b4f]/8 transition-colors whitespace-nowrap'
        }
      >
        <Smartphone className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c] shrink-0" />
        <span>{lang === 'ar' ? 'طريقة تثبيت نور' : 'How to Install Nour'}</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lang === 'ar' ? 'طريقة تثبيت نور' : 'How to Install Nour'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-sm rounded-3xl crystal-card border border-[#0f6b4f]/20 dark:border-[#c9a44c]/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center shrink-0">
                  <Share className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold">
                  {lang === 'ar' ? 'طريقة تثبيت تطبيق نور' : 'How to Install Nour App'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
                className="w-10 h-10 rounded-full border border-[#0f6b4f]/15 flex items-center justify-center hover:bg-[#0f6b4f]/10 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#5c6862] dark:text-[#98a69f] leading-relaxed">
              {isIOS ? (
                lang === 'ar' ? (
                  <>
                    <p>١. افتح الموقع في متصفح <strong>Safari</strong>.</p>
                    <p>٢. اضغط على زر <strong>المشاركة (Share)</strong> في شريط المتصفح.</p>
                    <p>٣. اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong> ثم اضغط «إضافة».</p>
                  </>
                ) : (
                  <>
                    <p>1. Open Nour in <strong>Safari</strong>.</p>
                    <p>2. Tap the <strong>Share</strong> icon in the toolbar.</p>
                    <p>3. Select <strong>Add to Home Screen</strong> and confirm.</p>
                  </>
                )
              ) : lang === 'ar' ? (
                <>
                  <p>
                    <strong>على أندرويد (Chrome):</strong> اضغط قائمة المتصفح (⋮) ثم اختر{' '}
                    <strong>تثبيت التطبيق</strong> أو <strong>الإضافة إلى الشاشة الرئيسية</strong>.
                  </p>
                  <p>
                    <strong>على الحاسوب (Chrome / Edge):</strong> اضغط أيقونة التثبيت في شريط العنوان أعلى المتصفح.
                  </p>
                  <p>بعد التثبيت يعمل «نور» كتطبيق مستقل مع وصول سريع لقراءة المصحف والتلاوات المحفوظة.</p>
                </>
              ) : (
                <>
                  <p>
                    <strong>On Android (Chrome):</strong> Open browser menu (⋮) and choose <strong>Install app</strong> or{' '}
                    <strong>Add to Home screen</strong>.
                  </p>
                  <p>
                    <strong>On Desktop (Chrome / Edge):</strong> Click the install icon inside the address bar.
                  </p>
                  <p>Once installed, Nour launches fullscreen with quick offline access.</p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-full bg-[#0f6b4f] text-white text-xs font-semibold hover:bg-[#0a4e39] transition-colors"
            >
              {lang === 'ar' ? 'فهمت' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
