import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, WifiOff } from 'lucide-react';
import { Language } from '../types/nour';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  lang: Language;
  hasAudioBar?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ lang, hasAudioBar = false }) => {
  const isOnline = useOnlineStatus();
  const wasOfflineRef = useRef(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setShowReconnected(false);
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowReconnected(true);
      const timer = window.setTimeout(() => setShowReconnected(false), 3500);
      return () => window.clearTimeout(timer);
    }
  }, [isOnline]);

  if (isOnline && !showReconnected) {
    return null;
  }

  const bottomOffset = hasAudioBar ? 'bottom-36 lg:bottom-24' : 'bottom-20 lg:bottom-6';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed ${bottomOffset} start-4 z-40 max-w-xs sm:max-w-sm rounded-full px-4 py-2 text-xs font-semibold shadow-xl border flex items-center gap-2 transition-all ${
        !isOnline
          ? 'bg-[#17211d]/95 text-[#f7f3ea] border-[#c9a44c]/55 backdrop-blur-md'
          : 'bg-[#0f6b4f] text-white border-[#c9a44c]/40'
      }`}
    >
      {!isOnline ? (
        <>
          <span className="w-6 h-6 rounded-full bg-[#c9a44c]/25 text-[#c9a44c] flex items-center justify-center shrink-0">
            <WifiOff className="w-3.5 h-3.5" />
          </span>
          <span>
            {lang === 'ar'
              ? 'وضع عدم الاتصال · المصحف والأذكار والملفات المحفوظة متاحة'
              : 'Offline mode · Cached Quran, adhkar & downloads active'}
          </span>
        </>
      ) : (
        <>
          <CheckCircle2 className="w-4 h-4 text-[#c9a44c] shrink-0" />
          <span>
            {lang === 'ar'
              ? 'عاد الاتصال بالإنترنت · تم استئناف المزامنة'
              : 'Back online · Cloud sync resumed'}
          </span>
        </>
      )}
    </div>
  );
};
