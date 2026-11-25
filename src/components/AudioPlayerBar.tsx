import React from 'react';
import { Clock, Loader2, Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { AudioTrack, Language } from '../types/nour';
import { t } from '../i18n/translations';

interface AudioPlayerBarProps {
  lang: Language;
  track: AudioTrack;
  isPlaying: boolean;
  isBuffering: boolean;
  audioError: string | null;
  currentTime: number;
  duration: number;
  speed: number;
  repeat: boolean;
  sleepMinutes: number | null;
  volume: number;
  isMuted: boolean;
  canSkipPrev: boolean;
  canSkipNext: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkipPrev: () => void;
  onSkipNext: () => void;
  onCycleSpeed: () => void;
  onToggleRepeat: () => void;
  onCycleSleep: () => void;
  onToggleMute: () => void;
  onVolumeChange: (vol: number) => void;
  onClose: () => void;
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  lang,
  track,
  isPlaying,
  isBuffering,
  audioError,
  currentTime,
  duration,
  speed,
  repeat,
  sleepMinutes,
  volume,
  isMuted,
  canSkipPrev,
  canSkipNext,
  onTogglePlay,
  onSeek,
  onSkipPrev,
  onSkipNext,
  onCycleSpeed,
  onToggleRepeat,
  onCycleSleep,
  onToggleMute,
  onVolumeChange,
  onClose,
}) => {
  const copy = t(lang);
  const isRadio = track.type === 'radio';
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const effectiveVolume = isMuted ? 0 : volume;
  const showEq = isPlaying && !isBuffering && !audioError;

  return (
    <div className="rounded-2xl crystal-dock text-[#f7f3ea] border border-[#c9a44c]/45 px-3.5 py-2.5 sm:px-4 sm:py-3 space-y-2 transition-all">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!isRadio && (
            <button
              type="button"
              disabled={!canSkipPrev}
              onClick={onSkipPrev}
              aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
              className="w-9 h-9 rounded-xl bg-white/12 hover:bg-white/22 disabled:opacity-35 flex items-center justify-center shrink-0 transition-colors"
            >
              {lang === 'ar' ? <SkipForward className="w-4 h-4" /> : <SkipBack className="w-4 h-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? (lang === 'ar' ? 'إيقاف مؤقت' : 'Pause') : lang === 'ar' ? 'تشغيل' : 'Play'}
            className="w-10 h-10 rounded-xl bg-[#c9a44c] text-[#17211d] flex items-center justify-center shrink-0 hover:brightness-105 active:scale-95 transition-all shadow-sm"
          >
            {isBuffering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>

          {!isRadio && (
            <button
              type="button"
              disabled={!canSkipNext}
              onClick={onSkipNext}
              aria-label={lang === 'ar' ? 'التالي' : 'Next'}
              className="w-9 h-9 rounded-xl bg-white/12 hover:bg-white/22 disabled:opacity-35 flex items-center justify-center shrink-0 transition-colors"
            >
              {lang === 'ar' ? <SkipBack className="w-4 h-4" /> : <SkipForward className="w-4 h-4" />}
            </button>
          )}

          <div className="min-w-0 ms-1 flex items-center gap-2.5 flex-1">
            {showEq && (
              <div className="flex items-end gap-0.5 h-4 shrink-0" aria-hidden="true">
                <span className="w-0.5 h-3 rounded-full bg-[#c9a44c] eq-bar" style={{ animationDelay: '0ms' }} />
                <span className="w-0.5 h-4 rounded-full bg-[#f7f3ea] eq-bar" style={{ animationDelay: '180ms' }} />
                <span className="w-0.5 h-2.5 rounded-full bg-[#c9a44c] eq-bar" style={{ animationDelay: '340ms' }} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-bold truncate">{track.title}</p>
              <p className="text-[11px] text-[#f7f3ea]/80 truncate">
                {audioError ? audioError : track.subtitle}
                {isRadio && !audioError ? ` · ${lang === 'ar' ? 'بث مباشر' : 'Live'}` : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isRadio && (
            <>
              <button
                type="button"
                onClick={onCycleSpeed}
                title={copy.speed}
                className="min-h-[36px] px-2 rounded-xl bg-white/12 hover:bg-white/22 text-[11px] font-bold tabular-nums transition-colors"
              >
                {speed}x
              </button>
              <button
                type="button"
                onClick={onToggleRepeat}
                title={copy.repeat}
                aria-pressed={repeat}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  repeat ? 'bg-[#c9a44c] text-[#17211d]' : 'bg-white/12 hover:bg-white/22'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Desktop/Tablet Volume & Mute */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/10">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
              className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center transition-colors"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-[#c9a44c]" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={effectiveVolume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label={lang === 'ar' ? 'مستوى الصوت' : 'Volume'}
              dir="ltr"
              className="w-16 md:w-20 h-1 rounded-full appearance-none cursor-pointer accent-[#c9a44c] bg-white/25"
            />
          </div>

          <button
            type="button"
            onClick={onCycleSleep}
            title={copy.sleepTimer}
            className={`min-h-[36px] px-2 rounded-xl flex items-center gap-1 text-[11px] font-bold tabular-nums transition-colors ${
              sleepMinutes ? 'bg-[#c9a44c] text-[#17211d]' : 'bg-white/12 hover:bg-white/22'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {sleepMinutes ? <span>{sleepMinutes}m</span> : null}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق المشغل' : 'Close player'}
            className="w-9 h-9 rounded-xl hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Seek Progress Bar for Surah & Ayah playback */}
      {!isRadio && (
        <div className="flex items-center gap-2.5 text-[10px] font-mono tabular-nums text-[#f7f3ea]/85" dir="ltr">
          <span className="w-10 text-end">{formatClock(currentTime)}</span>
          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 100}
              step={1}
              value={Math.min(currentTime, duration || 100)}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label={lang === 'ar' ? 'التحكم بموضع التلاوة' : 'Seek audio'}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#c9a44c] bg-white/20"
              style={{
                background: `linear-gradient(to right, #c9a44c ${progressPct}%, rgba(255,255,255,0.24) ${progressPct}%)`,
              }}
            />
          </div>
          <span className="w-10">{formatClock(duration)}</span>
        </div>
      )}
    </div>
  );
};
