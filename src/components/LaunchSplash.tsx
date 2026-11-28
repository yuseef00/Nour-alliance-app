import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Language } from '../types/nour';

const SPLASH_EMBLEM = '/src/assets/images/nour_logo.png';
const SPLASH_DURATION_MS = 2100;

interface LaunchSplashProps {
  lang: Language;
  onFinish: () => void;
}

export const LaunchSplash: React.FC<LaunchSplashProps> = ({ lang, onFinish }) => {
  const isAr = lang === 'ar';
  const [logoFailed, setLogoFailed] = useState(false);
  const dismissedRef = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReduced ? 900 : SPLASH_DURATION_MS;
    const timer = window.setTimeout(dismiss, duration);
    return () => window.clearTimeout(timer);
  }, [dismiss]);

  return (
    <motion.div
      dir={isAr ? 'rtl' : 'ltr'}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } }}
      onClick={dismiss}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between px-6 py-10 pt-safe pb-safe select-none overflow-hidden text-[#f7f3ea]"
      style={{
        background:
          'radial-gradient(circle at 50% 34%, #158461 0%, #0b513b 52%, #05261b 100%)',
      }}
    >
      {/* Subtle geometric architectural lattice */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 36%, rgba(201, 164, 76, 0.32) 0%, transparent 56%)',
        }}
      />

      {/* Fine concentric Islamic arch rings */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        <div className="w-[460px] h-[460px] sm:w-[560px] sm:h-[560px] rounded-full border border-[#c9a44c]/12" />
        <div className="absolute w-[340px] h-[340px] sm:w-[410px] sm:h-[410px] rounded-full border border-[#c9a44c]/18" />
      </div>

      {/* Top Bismillah */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 pt-3 text-center"
      >
        <p className="font-quran text-xl sm:text-2xl text-[#f4e6c2]/90 tracking-wide">
          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
        </p>
      </motion.div>

      {/* Center Emblem, Title & Ayah */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-6 flex items-center justify-center"
        >
          {/* Outer delicate gold ring */}
          <div
            aria-hidden="true"
            className="absolute -inset-3 rounded-full border border-[#c9a44c]/40"
          />
          <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full overflow-hidden border-2 border-[#c9a44c]/85 bg-[#fdfaf3] p-2.5 shadow-[0_24px_60px_-14px_rgba(0,0,0,0.55)] flex items-center justify-center">
            {!logoFailed ? (
              <img
                src={SPLASH_EMBLEM}
                alt={isAr ? 'شعار نور للقرآن الكريم' : 'Nour Quran Companion Logo'}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="font-quran text-4xl font-bold text-[#0f6b4f]">نور</span>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-2"
        >
          <h1 className="font-quran text-5xl sm:text-6xl font-bold tracking-tight text-[#f7f3ea] drop-shadow-sm">
            {isAr ? 'نور' : 'Nour'}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#e5c570] tracking-wide">
            {isAr ? 'رفيقك المتكامل للقرآن الكريم' : 'Your Complete Quran Companion'}
          </p>
        </motion.div>

        {/* Ornamental divider */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0.6 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.55, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="my-6 flex items-center gap-3 w-48"
          aria-hidden="true"
        >
          <span className="flex-1 h-px bg-gradient-to-l from-[#c9a44c]/65 to-transparent" />
          <span className="w-2 h-2 rotate-45 border border-[#c9a44c]/80 bg-[#c9a44c]/30" />
          <span className="flex-1 h-px bg-gradient-to-r from-[#c9a44c]/65 to-transparent" />
        </motion.div>

        {/* Ayah */}
        <motion.blockquote
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-1.5 px-4"
        >
          <p className="font-quran text-xl sm:text-2xl leading-relaxed text-[#f7f3ea]/95">
            ﴿قَدْ جَاءَكُم مِّنَ اللَّهِ نُورٌ وَكِتَابٌ مُّبِينٌ﴾
          </p>
          <footer className="text-xs text-[#f4e6c2]/65">
            {isAr ? 'سورة المائدة · الآية ١٥' : 'Surah Al-Ma’idah · Verse 15'}
          </footer>
        </motion.blockquote>
      </div>

      {/* Bottom progress indicator & immediate enter trigger */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-xs flex flex-col items-center gap-4 pb-2"
      >
        <div
          aria-hidden="true"
          className="w-40 h-1 rounded-full bg-[#f7f3ea]/15 overflow-hidden"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: SPLASH_DURATION_MS / 1000 - 0.15, ease: 'linear' }}
            style={{ transformOrigin: isAr ? 'right center' : 'left center' }}
            className="h-full w-full rounded-full bg-gradient-to-r from-[#c9a44c] via-[#f0d88b] to-[#c9a44c]"
          />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="min-h-[44px] px-7 rounded-full border border-[#c9a44c]/55 bg-[#fdfaf3]/10 hover:bg-[#fdfaf3]/18 active:scale-[0.98] text-sm font-semibold text-[#f7f3ea] transition-all cursor-pointer"
        >
          {isAr ? 'دخول' : 'Enter'}
        </button>
      </motion.div>
    </motion.div>
  );
};
