import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  ListMusic,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AudioTrack, Language } from '../types/nour';
import { t } from '../i18n/translations';
import { ReciterAvatar } from './ReciterAvatar';

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
  queue?: AudioTrack[];
  onSelectQueueTrack?: (track: AudioTrack) => void;
  onRetryAudio?: () => void;
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

function formatRemaining(currentTime: number, duration: number): string {
  if (!Number.isFinite(duration) || duration <= 0) return '00:00';
  const remaining = Math.max(0, duration - currentTime);
  return `-${formatClock(remaining)}`;
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
  queue = [],
  onSelectQueueTrack,
  onRetryAudio,
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
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  const isRadio = track.type === 'radio';
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const effectiveVolume = isMuted ? 0 : volume;
  const showEq = isPlaying && !isBuffering && !audioError;

  return (
    <>
      {/* Full-Screen Expandable Sheet on Mobile */}
      {mobileExpanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lang === 'ar' ? 'مشغل التلاوة الموسّع' : 'Expanded Audio Player'}
          className="lg:hidden fixed inset-0 z-50 hero-emerald-surface text-[#f7f3ea] flex flex-col justify-between p-5 pb-8 overflow-y-auto"
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMobileExpanded(false)}
              aria-label={lang === 'ar' ? 'تصغير المشغل' : 'Minimize player'}
              className="w-11 h-11 rounded-full bg-white/12 hover:bg-white/20 flex items-center justify-center"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <span className="text-xs font-bold text-[#c9a44c]">
              {isRadio
                ? lang === 'ar'
                  ? 'بث إذاعي مباشر'
                  : 'Live Radio'
                : lang === 'ar'
                ? 'التلاوة الجارية'
                : 'Now Playing'}
            </span>
            <button
              type="button"
              onClick={() => {
                setMobileExpanded(false);
                onClose();
              }}
              aria-label={lang === 'ar' ? 'إغلاق المشغل' : 'Close player'}
              className="w-11 h-11 rounded-full bg-white/12 hover:bg-white/20 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col items-center text-center gap-4 my-auto py-4">
            <ReciterAvatar
              name={track.reciterName || track.subtitle}
              reciterId={track.reciterId}
              size="xl"
              active={isPlaying}
              className="w-28 h-28 ring-4 ring-[#c9a44c]/50"
            />
            <div className="space-y-1 max-w-sm">
              <h2 className="text-xl font-bold leading-snug">{track.title}</h2>
              <p className="text-sm text-[#f7f3ea]/80">{track.reciterName || track.subtitle}</p>
            </div>

            {audioError && (
              <div
                role="alert"
                className="w-full max-w-sm rounded-2xl bg-red-500/20 border border-red-300/40 px-4 py-3 text-xs flex items-center justify-between gap-2"
              >
                <span>{audioError}</span>
                {onRetryAudio && (
                  <button
                    type="button"
                    onClick={onRetryAudio}
                    className="min-h-[34px] px-3 rounded-full bg-[#c9a44c] text-[#17211d] font-bold flex items-center gap-1 shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                  </button>
                )}
              </div>
            )}

            {!isRadio && (
              <div className="w-full max-w-sm space-y-2 pt-2" dir="ltr">
                <input
                  type="range"
                  min={0}
                  max={duration > 0 ? duration : 100}
                  step={1}
                  value={Math.min(currentTime, duration || 100)}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  aria-label={lang === 'ar' ? 'التحكم بموضع التلاوة' : 'Seek audio'}
                  className="w-full h-2.5 rounded-full appearance-none cursor-pointer accent-[#c9a44c] bg-white/25"
                  style={{
                    background: `linear-gradient(to right, #c9a44c ${progressPct}%, rgba(255,255,255,0.26) ${progressPct}%)`,
                  }}
                />
                <div className="flex items-center justify-between text-xs font-mono tabular-nums text-[#f7f3ea]/85">
                  <span>{formatClock(currentTime)}</span>
                  <span>{formatRemaining(currentTime, duration)}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-5 pt-2">
              {!isRadio && (
                <button
                  type="button"
                  disabled={!canSkipPrev}
                  onClick={onSkipPrev}
                  aria-label={lang === 'ar' ? 'السورة السابقة' : 'Previous'}
                  className="w-12 h-12 rounded-full bg-white/14 hover:bg-white/24 disabled:opacity-35 flex items-center justify-center"
                >
                  {lang === 'ar' ? <SkipForward className="w-5 h-5" /> : <SkipBack className="w-5 h-5" />}
                </button>
              )}

              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? (lang === 'ar' ? 'إيقاف مؤقت' : 'Pause') : lang === 'ar' ? 'تشغيل' : 'Play'}
                className="w-16 h-16 rounded-full bg-[#c9a44c] text-[#17211d] flex items-center justify-center shadow-xl hover:brightness-105 active:scale-95 transition-transform"
              >
                {isBuffering ? (
                  <Loader2 className="w-7 h-7 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-7 h-7" />
                ) : (
                  <Play className="w-7 h-7 fill-current" />
                )}
              </button>

              {!isRadio && (
                <button
                  type="button"
                  disabled={!canSkipNext}
                  onClick={onSkipNext}
                  aria-label={lang === 'ar' ? 'السورة التالية' : 'Next'}
                  className="w-12 h-12 rounded-full bg-white/14 hover:bg-white/24 disabled:opacity-35 flex items-center justify-center"
                >
                  {lang === 'ar' ? <SkipBack className="w-5 h-5" /> : <SkipForward className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4 max-w-sm w-full mx-auto">
            {/* Volume Slider */}
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/10" dir="ltr">
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={isMuted || volume === 0 ? (lang === 'ar' ? 'إلغاء كتم الصوت' : 'Unmute') : lang === 'ar' ? 'كتم الصوت' : 'Mute'}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center shrink-0"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-[#c9a44c]" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={effectiveVolume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                aria-label={lang === 'ar' ? 'مستوى الصوت' : 'Volume'}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#c9a44c] bg-white/25"
              />
            </div>

            {/* Extra Controls Row */}
            <div className="flex items-center justify-between gap-2">
              {!isRadio && (
                <>
                  <button
                    type="button"
                    onClick={onCycleSpeed}
                    aria-label={copy.speed}
                    className="min-h-[42px] px-4 rounded-full bg-white/12 text-xs font-bold tabular-nums"
                  >
                    {copy.speed}: {speed}x
                  </button>
                  <button
                    type="button"
                    onClick={onToggleRepeat}
                    aria-label={copy.repeat}
                    aria-pressed={repeat}
                    className={`min-h-[42px] px-4 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      repeat ? 'bg-[#c9a44c] text-[#17211d]' : 'bg-white/12'
                    }`}
                  >
                    <Repeat className="w-4 h-4" />
                    <span>{copy.repeat}</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onCycleSleep}
                aria-label={copy.sleepTimer}
                className={`min-h-[42px] px-4 rounded-full text-xs font-bold flex items-center gap-1.5 tabular-nums ${
                  sleepMinutes ? 'bg-[#c9a44c] text-[#17211d]' : 'bg-white/12'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{sleepMinutes ? `${sleepMinutes}m` : copy.sleepTimer}</span>
              </button>
            </div>

            {queue.length > 0 && (
              <div className="rounded-2xl bg-black/20 border border-white/15 p-3 space-y-2 max-h-48 overflow-y-auto">
                <p className="text-xs font-bold text-[#c9a44c] flex items-center gap-1.5">
                  <ListMusic className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'قائمة التشغيل' : 'Playback Queue'}</span>
                </p>
                {queue.map((qItem) => {
                  const isCurrent = qItem.url === track.url;
                  return (
                    <button
                      key={qItem.id}
                      type="button"
                      onClick={() => onSelectQueueTrack?.(qItem)}
                      className={`w-full min-h-[38px] px-3 py-1.5 rounded-xl text-start text-xs flex items-center justify-between gap-2 ${
                        isCurrent ? 'bg-[#c9a44c] text-[#17211d] font-bold' : 'hover:bg-white/10'
                      }`}
                    >
                      <span className="truncate">{qItem.title}</span>
                      <span className="text-[11px] opacity-80 shrink-0 truncate max-w-[110px]">
                        {qItem.reciterName || qItem.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Persistent Docked Player (Compact on Mobile, Full Controls on Desktop) */}
      <div className="relative rounded-2xl crystal-dock text-[#f7f3ea] border border-[#c9a44c]/45 px-3 py-2 sm:px-4 sm:py-3 space-y-1.5 transition-all">
        {/* Desktop Expandable Queue Popover */}
        {queueOpen && queue.length > 0 && (
          <div className="absolute bottom-full mb-2 end-0 w-72 sm:w-80 max-h-64 overflow-y-auto rounded-2xl crystal-dock border border-[#c9a44c]/45 p-3 shadow-2xl space-y-1.5 z-50">
            <div className="flex items-center justify-between pb-1.5 border-b border-white/15">
              <span className="text-xs font-bold text-[#c9a44c] flex items-center gap-1.5">
                <ListMusic className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'قائمة التشغيل' : 'Queue'}</span>
              </span>
              <button
                type="button"
                onClick={() => setQueueOpen(false)}
                aria-label={lang === 'ar' ? 'إغلاق القائمة' : 'Close queue'}
                className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {queue.map((qItem) => {
              const isCurrent = qItem.url === track.url;
              return (
                <button
                  key={qItem.id}
                  type="button"
                  onClick={() => {
                    onSelectQueueTrack?.(qItem);
                    setQueueOpen(false);
                  }}
                  className={`w-full min-h-[36px] px-2.5 py-1.5 rounded-xl text-start text-xs flex items-center justify-between gap-2 ${
                    isCurrent ? 'bg-[#c9a44c] text-[#17211d] font-bold' : 'hover:bg-white/10'
                  }`}
                >
                  <span className="truncate">{qItem.title}</span>
                  <span className="text-[10px] opacity-75 shrink-0">{qItem.subtitle}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            {!isRadio && (
              <button
                type="button"
                disabled={!canSkipPrev}
                onClick={onSkipPrev}
                aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
                className="hidden sm:flex w-9 h-9 rounded-full bg-white/12 hover:bg-white/22 disabled:opacity-35 items-center justify-center shrink-0 transition-colors"
              >
                {lang === 'ar' ? <SkipForward className="w-4 h-4" /> : <SkipBack className="w-4 h-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? (lang === 'ar' ? 'إيقاف مؤقت' : 'Pause') : lang === 'ar' ? 'تشغيل' : 'Play'}
              className="w-10 h-10 rounded-full bg-[#c9a44c] text-[#17211d] flex items-center justify-center shrink-0 hover:brightness-105 active:scale-95 transition-all shadow-sm"
            >
              {isBuffering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
            </button>

            {!isRadio && (
              <button
                type="button"
                disabled={!canSkipNext}
                onClick={onSkipNext}
                aria-label={lang === 'ar' ? 'التالي' : 'Next'}
                className="hidden sm:flex w-9 h-9 rounded-full bg-white/12 hover:bg-white/22 disabled:opacity-35 items-center justify-center shrink-0 transition-colors"
              >
                {lang === 'ar' ? <SkipBack className="w-4 h-4" /> : <SkipForward className="w-4 h-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileExpanded(true)}
              className="min-w-0 ms-1 flex items-center gap-2.5 flex-1 text-start lg:cursor-default"
              aria-label={lang === 'ar' ? 'توسيع مشغل التلاوة' : 'Expand player'}
            >
              {!isRadio && (
                <ReciterAvatar
                  name={track.reciterName || track.subtitle}
                  reciterId={track.reciterId}
                  size="sm"
                  active={isPlaying}
                />
              )}
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
                  {audioError ? audioError : track.reciterName || track.subtitle}
                  {isRadio && !audioError ? ` · ${lang === 'ar' ? 'بث مباشر' : 'Live'}` : ''}
                </p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {audioError && onRetryAudio && (
              <button
                type="button"
                onClick={onRetryAudio}
                className="min-h-[34px] px-2.5 rounded-full bg-[#c9a44c] text-[#17211d] text-[11px] font-bold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{lang === 'ar' ? 'إعادة' : 'Retry'}</span>
              </button>
            )}

            {!isRadio && (
              <div className="hidden md:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onCycleSpeed}
                  aria-label={copy.speed}
                  title={copy.speed}
                  className="min-h-[36px] min-w-[36px] px-2.5 rounded-full bg-white/12 hover:bg-white/22 text-[11px] font-bold tabular-nums transition-colors"
                >
                  {speed}x
                </button>
                <button
                  type="button"
                  onClick={onToggleRepeat}
                  aria-label={copy.repeat}
                  title={copy.repeat}
                  aria-pressed={repeat}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    repeat ? 'bg-[#c9a44c] text-[#17211d]' : 'bg-white/12 hover:bg-white/22'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Desktop Volume & Mute */}
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10">
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={isMuted || volume === 0 ? (lang === 'ar' ? 'إلغاء كتم الصوت' : 'Unmute') : lang === 'ar' ? 'كتم الصوت' : 'Mute'}
                className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
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

            {queue.length > 0 && (
              <button
                type="button"
                onClick={() => setQueueOpen((v) => !v)}
                aria-label={lang === 'ar' ? 'قائمة التشغيل' : 'Queue'}
                className={`hidden sm:flex w-9 h-9 rounded-full items-center justify-center transition-colors ${
                  queueOpen ? 'bg-[#c9a44c] text-[#17211d]' : 'bg-white/12 hover:bg-white/22'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onCycleSleep}
              aria-label={copy.sleepTimer}
              title={copy.sleepTimer}
              className={`hidden sm:flex min-h-[36px] min-w-[36px] px-2 rounded-full items-center justify-center gap-1 text-[11px] font-bold tabular-nums transition-colors ${
                sleepMinutes ? 'bg-[#c9a44c] text-[#17211d]' : 'bg-white/12 hover:bg-white/22'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {sleepMinutes ? <span>{sleepMinutes}m</span> : null}
            </button>

            <button
              type="button"
              onClick={() => setMobileExpanded(true)}
              aria-label={lang === 'ar' ? 'توسيع المشغل' : 'Expand player'}
              className="lg:hidden w-9 h-9 rounded-full bg-white/12 hover:bg-white/22 flex items-center justify-center"
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={lang === 'ar' ? 'إغلاق المشغل' : 'Close player'}
              className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Seek Progress Bar with Elapsed & Remaining Time */}
        {!isRadio && (
          <div className="flex items-center gap-2 text-[10px] font-mono tabular-nums text-[#f7f3ea]/85" dir="ltr">
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
            <span className="w-11 text-start">{formatRemaining(currentTime, duration)}</span>
          </div>
        )}
      </div>
    </>
  );
};
