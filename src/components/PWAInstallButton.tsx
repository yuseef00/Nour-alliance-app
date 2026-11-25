import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { Language } from '../types/nour';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  lang: Language;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang, compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          compact
            ? 'min-h-[40px] px-3.5 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-[#0a4e39] transition-colors'
            : 'w-full min-h-[46px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm hover:bg-[#0a4e39] transition-colors'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{lang === 'ar' ? 'تثبيت التطبيق على الجهاز' : 'Install Nour App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'min-h-[40px] px-3.5 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0f6b4f]/8 transition-colors'
              : 'w-full min-h-[46px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#0f6b4f]/8 transition-colors'
          }
        >
          <Smartphone className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c] shrink-0" />
          <span>{lang === 'ar' ? 'تثبيت على آيفون وآيباد' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl crystal-card border border-[#0f6b4f]/20 dark:border-[#c9a44c]/30 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-10 h-10 rounded-full bg-[#0f6b4f] text-white flex items-center justify-center">
                    <Share className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold">
                    {lang === 'ar' ? 'تثبيت تطبيق نور على iOS' : 'Install Nour on iPhone / iPad'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close"
                  className="w-9 h-9 rounded-full border border-[#0f6b4f]/15 flex items-center justify-center hover:bg-[#0f6b4f]/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs text-[#5c6862] dark:text-[#98a69f] leading-relaxed">
                {lang === 'ar' ? (
                  <>
                    <p>١. اضغط على زر <strong>المشاركة (Share)</strong> في شريط متصفح Safari.</p>
                    <p>٢. مرّر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</p>
                    <p>٣. بعد التثبيت يمكنك فتح «نور» وقراءة الصفحات المحفوظة حتى دون اتصال بالإنترنت.</p>
                  </>
                ) : (
                  <>
                    <p>1. Tap the <strong>Share</strong> button in the Safari toolbar.</p>
                    <p>2. Scroll down and tap <strong>Add to Home Screen</strong>.</p>
                    <p>3. Launch Nour anytime from your home screen, including offline reading.</p>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-full bg-[#0f6b4f] text-white text-xs font-semibold hover:bg-[#0a4e39] transition-colors"
              >
                {lang === 'ar' ? 'فهمت' : 'Got it'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
