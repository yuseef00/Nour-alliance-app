import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Link2,
  Plus,
  Smartphone,
  Square,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Language } from '../types/nour';
import {
  addCustomAthanFile,
  addCustomAthanUrl,
  deleteCustomAthanVoice,
  getAllPrayerSoundOptions,
  getPrayerSoundMode,
  isFlipToSilenceEnabled,
  isPrayerAudioPlaying,
  playPrayerAlertSound,
  PRAYER_AUDIO_EVENT,
  PRAYER_FLIP_SETTING_CHANGED_EVENT,
  PRAYER_SOUND_CHANGED_EVENT,
  PrayerSoundMode,
  setFlipToSilenceEnabled,
  setPrayerSoundMode,
  stopPrayerAlertSound,
  syncPrayerNotificationsSchedule,
} from '../services/prayerNotificationService';

interface AthanSoundManagerProps {
  lang: Language;
  compact?: boolean;
}

export const AthanSoundManager: React.FC<AthanSoundManagerProps> = ({ lang, compact = false }) => {
  const [options, setOptions] = useState(() => getAllPrayerSoundOptions());
  const [soundMode, setSoundModeState] = useState<PrayerSoundMode>(() => getPrayerSoundMode());
  const [audioPlaying, setAudioPlaying] = useState(() => isPrayerAudioPlaying());
  const [flipEnabled, setFlipEnabledState] = useState(() => isFlipToSilenceEnabled());
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'file' | 'url'>('file');
  const [customTitle, setCustomTitle] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onSoundChanged = () => {
      setOptions(getAllPrayerSoundOptions());
      setSoundModeState(getPrayerSoundMode());
    };
    const onAudioState = (e: Event) => {
      const playing = (e as CustomEvent<{ playing?: boolean }>).detail?.playing;
      setAudioPlaying(typeof playing === 'boolean' ? playing : isPrayerAudioPlaying());
    };
    const onFlipChanged = () => {
      setFlipEnabledState(isFlipToSilenceEnabled());
    };
    window.addEventListener(PRAYER_SOUND_CHANGED_EVENT, onSoundChanged);
    window.addEventListener(PRAYER_AUDIO_EVENT, onAudioState);
    window.addEventListener(PRAYER_FLIP_SETTING_CHANGED_EVENT, onFlipChanged);
    return () => {
      window.removeEventListener(PRAYER_SOUND_CHANGED_EVENT, onSoundChanged);
      window.removeEventListener(PRAYER_AUDIO_EVENT, onAudioState);
      window.removeEventListener(PRAYER_FLIP_SETTING_CHANGED_EVENT, onFlipChanged);
    };
  }, []);

  const handleSelectMode = (mode: PrayerSoundMode) => {
    setFeedback(null);
    setPrayerSoundMode(mode);
    setSoundModeState(mode);
    setOptions(getAllPrayerSoundOptions());
    void syncPrayerNotificationsSchedule(lang);
  };

  const handlePreviewToggle = async () => {
    setFeedback(null);
    if (audioPlaying) {
      stopPrayerAlertSound('manual');
      return;
    }
    const targetMode: PrayerSoundMode = soundMode === 'silent' ? 'athan_makkah' : soundMode;
    if (soundMode === 'silent') {
      handleSelectMode(targetMode);
    }
    await playPrayerAlertSound(targetMode);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaving(true);
    setFeedback(null);
    try {
      const created = await addCustomAthanFile(file, customTitle.trim() || undefined);
      setOptions(getAllPrayerSoundOptions());
      setSoundModeState(created.id);
      setCustomTitle('');
      setAddOpen(false);
      void syncPrayerNotificationsSchedule(lang);
      setFeedback(
        lang === 'ar' ? `تمت إضافة "${created.label}" وتحديده` : `Added and selected "${created.label}"`
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'AUDIO_TOO_LARGE') {
        setFeedback(
          lang === 'ar'
            ? 'حجم الملف كبير جداً (الحد الأقصى 15 ميجابايت).'
            : 'Audio file is too large (max 15 MB).'
        );
      } else {
        setFeedback(
          lang === 'ar'
            ? 'اختر ملف صوتي صالح (MP3 أو M4A أو WAV).'
            : 'Please select a valid audio file (MP3, M4A, or WAV).'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const created = addCustomAthanUrl(customUrl, customTitle || (lang === 'ar' ? 'أذان مخصص' : 'Custom Athan'));
      setOptions(getAllPrayerSoundOptions());
      setSoundModeState(created.id);
      setCustomTitle('');
      setCustomUrl('');
      setAddOpen(false);
      void syncPrayerNotificationsSchedule(lang);
      setFeedback(
        lang === 'ar' ? `تمت إضافة "${created.label}" وتحديده` : `Added and selected "${created.label}"`
      );
    } catch {
      setFeedback(
        lang === 'ar'
          ? 'أدخل رابطاً صوتياً مباشراً يبدأ بـ https://'
          : 'Enter a direct audio URL starting with https://'
      );
    }
  };

  const handleDeleteCustom = async (id: `custom_${string}`) => {
    await deleteCustomAthanVoice(id);
    setOptions(getAllPrayerSoundOptions());
    setSoundModeState(getPrayerSoundMode());
    void syncPrayerNotificationsSchedule(lang);
  };

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
      {/* Header row with preview + add new voice + flip-to-silence toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#17211d] dark:text-[#ede7da]">
          {soundMode === 'silent' ? (
            <VolumeX className="w-4 h-4 text-[#5c6862] shrink-0" />
          ) : (
            <Volume2 className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c] shrink-0" />
          )}
          <span>{lang === 'ar' ? 'أصوات الأذان والتنبيه' : 'Athan & Alert Voices'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handlePreviewToggle()}
            className={`min-h-[36px] px-3 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              audioPlaying
                ? 'bg-red-600 text-white'
                : 'bg-[#0f6b4f] text-white hover:bg-[#0a4e39]'
            }`}
          >
            {audioPlaying ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>
              {audioPlaying
                ? lang === 'ar'
                  ? 'إيقاف'
                  : 'Stop'
                : lang === 'ar'
                ? 'استماع'
                : 'Preview'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setAddOpen((v) => !v);
            }}
            className={`min-h-[36px] px-3 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              addOpen
                ? 'bg-[#0f6b4f]/15 border-[#0f6b4f] text-[#0f6b4f] dark:text-[#c9a44c]'
                : 'bg-[#f7f3ea] dark:bg-[#0b1411] border-[#0f6b4f]/25 text-[#0f6b4f] dark:text-[#c9a44c] hover:border-[#0f6b4f]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'إضافة صوت' : 'Add Voice'}</span>
          </button>
        </div>
      </div>

      {/* Voices Selection Grid */}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = soundMode === opt.id;
          return (
            <div key={opt.id} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => handleSelectMode(opt.id)}
                className={`min-h-[36px] px-3 py-1.5 text-[11px] font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  opt.isCustom ? 'rounded-s-lg' : 'rounded-lg'
                } border ${
                  active
                    ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white shadow-xs'
                    : 'bg-[#f7f3ea]/90 dark:bg-[#0b1411]/90 border-[#0f6b4f]/15 text-[#17211d] dark:text-[#ede7da] hover:border-[#0f6b4f]/45'
                }`}
              >
                {active && <Check className="w-3 h-3 shrink-0" />}
                <span>{lang === 'ar' ? opt.labelAr : opt.labelEn}</span>
              </button>
              {opt.isCustom && (
                <button
                  type="button"
                  onClick={() => void handleDeleteCustom(opt.id as `custom_${string}`)}
                  aria-label={lang === 'ar' ? `حذف ${opt.labelAr}` : `Delete ${opt.labelEn}`}
                  className="min-h-[36px] px-2 rounded-e-lg border border-s-0 border-[#0f6b4f]/15 bg-[#f7f3ea]/90 dark:bg-[#0b1411]/90 text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Custom Athan Panel */}
      {addOpen && (
        <div className="rounded-xl bg-[#f7f3ea]/90 dark:bg-[#0b1411]/90 border border-[#0f6b4f]/20 p-3 space-y-2.5">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0f6b4f]/10 w-fit">
            <button
              type="button"
              onClick={() => setAddMode('file')}
              className={`min-h-[32px] px-3 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
                addMode === 'file'
                  ? 'bg-white dark:bg-[#13201b] text-[#0f6b4f] dark:text-[#c9a44c] shadow-xs'
                  : 'text-[#5c6862] dark:text-[#98a69f]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'من ملفات الهاتف' : 'From Device'}</span>
            </button>
            <button
              type="button"
              onClick={() => setAddMode('url')}
              className={`min-h-[32px] px-3 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
                addMode === 'url'
                  ? 'bg-white dark:bg-[#13201b] text-[#0f6b4f] dark:text-[#c9a44c] shadow-xs'
                  : 'text-[#5c6862] dark:text-[#98a69f]'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'رابط صوتي' : 'Audio URL'}</span>
            </button>
          </div>

          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={lang === 'ar' ? 'اسم الصوت (مثلاً: أذان الشيخ محمد)' : 'Voice name (e.g. Custom Athan)'}
            className="w-full min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#13201b] border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
          />

          {addMode === 'file' ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.ogg"
                onChange={(e) => void handleFileChange(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[40px] px-4 rounded-lg bg-[#0f6b4f] text-white text-xs font-bold flex items-center gap-2 hover:bg-[#0a4e39] disabled:opacity-60"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {saving
                    ? lang === 'ar'
                      ? 'جارٍ الحفظ...'
                      : 'Saving...'
                    : lang === 'ar'
                    ? 'اختر ملف أذان (MP3 / M4A)'
                    : 'Choose Audio File'}
                </span>
              </button>
              <span className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                {lang === 'ar' ? 'يُحفظ للعمل بدون إنترنت' : 'Saved offline'}
              </span>
            </div>
          ) : (
            <form onSubmit={handleAddUrl} className="flex flex-wrap gap-2">
              <input
                type="url"
                required
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://example.com/athan.mp3"
                className="flex-1 min-w-[180px] min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#13201b] border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
              />
              <button
                type="submit"
                className="min-h-[40px] px-4 rounded-lg bg-[#0f6b4f] text-white text-xs font-bold hover:bg-[#0a4e39]"
              >
                {lang === 'ar' ? 'حفظ الصوت' : 'Save Voice'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Flip Phone Face-Down to Silence Athan Control */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[#0f6b4f]/10 text-[11px]">
        <div className="flex items-center gap-2 text-[#5c6862] dark:text-[#98a69f]">
          <Smartphone className="w-3.5 h-3.5 text-[#0f6b4f] dark:text-[#c9a44c] shrink-0" />
          <span>
            {lang === 'ar'
              ? 'إيقاف الأذان تلقائياً عند قلب الهاتف على وجهه'
              : 'Stop Athan automatically when phone is flipped face-down'}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={flipEnabled}
          onClick={() => {
            const next = !flipEnabled;
            setFlipToSilenceEnabled(next);
            setFlipEnabledState(next);
          }}
          className={`min-h-[34px] px-3 rounded-lg font-bold transition-colors border whitespace-nowrap ${
            flipEnabled
              ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white'
              : 'bg-[#f7f3ea] dark:bg-[#0b1411] border-[#0f6b4f]/20 text-[#5c6862] dark:text-[#98a69f]'
          }`}
        >
          {flipEnabled
            ? lang === 'ar'
              ? 'مفعّل'
              : 'Enabled'
            : lang === 'ar'
            ? 'معطّل'
            : 'Off'}
        </button>
      </div>

      {feedback && (
        <p className="text-[11px] font-semibold text-[#0f6b4f] dark:text-[#34d399]">{feedback}</p>
      )}
    </div>
  );
};
