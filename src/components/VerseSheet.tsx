import React, { useEffect, useState } from 'react';
import { Bookmark, Check, Copy, Download, HardDriveDownload, Loader2, Play, X } from 'lucide-react';
import { HighlightColor, Language, TafsirSlug, Verse, VerseBookmark } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import { fetchAyahAudioUrl, fetchTafsirByAyah } from '../services/quranApi';
import { getOfflineTracksMeta, OFFLINE_UPDATED_EVENT, removeOfflineAudio, saveAudioOffline } from '../services/mp3QuranApi';

interface VerseSheetProps {
  verse: Verse | null;
  surahName: string;
  lang: Language;
  existingBookmark?: VerseBookmark;
  onClose: () => void;
  onSaveBookmark: (color: HighlightColor, note: string) => void;
  onPlayVerse: (verse: Verse) => void;
}

const HIGHLIGHT_OPTIONS: { id: HighlightColor; labelAr: string; labelEn: string; swatch: string }[] = [
  { id: 'none', labelAr: 'بدون', labelEn: 'None', swatch: 'bg-stone-200 dark:bg-stone-700' },
  { id: 'gold', labelAr: 'ذهبي', labelEn: 'Gold', swatch: 'bg-[#c9a44c]' },
  { id: 'emerald', labelAr: 'أخضر', labelEn: 'Green', swatch: 'bg-[#0f6b4f]' },
  { id: 'sky', labelAr: 'سماوي', labelEn: 'Sky', swatch: 'bg-sky-500' },
  { id: 'rose', labelAr: 'وردي', labelEn: 'Rose', swatch: 'bg-rose-500' },
];

export const VerseSheet: React.FC<VerseSheetProps> = ({
  verse,
  surahName,
  lang,
  existingBookmark,
  onClose,
  onSaveBookmark,
  onPlayVerse,
}) => {
  const copy = t(lang);
  const [tafsirSlug, setTafsirSlug] = useState<TafsirSlug>('muyassar');
  const [tafsirText, setTafsirText] = useState('');
  const [tafsirResourceName, setTafsirResourceName] = useState('');
  const [tafsirError, setTafsirError] = useState(false);
  const [tafsirRetryTick, setTafsirRetryTick] = useState(0);
  const [loadingTafsir, setLoadingTafsir] = useState(false);
  const [color, setColor] = useState<HighlightColor>('gold');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);
  const [savedAudioUrl, setSavedAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!verse) return;
    setColor(existingBookmark?.highlightColor || 'gold');
    setNote(existingBookmark?.note || '');
    const checkSaved = () => {
      const existing = getOfflineTracksMeta().find((m) => m.verseKey === verse.verse_key);
      setSavedAudioUrl(existing?.url || null);
    };
    checkSaved();
    window.addEventListener(OFFLINE_UPDATED_EVENT, checkSaved);
    return () => window.removeEventListener(OFFLINE_UPDATED_EVENT, checkSaved);
  }, [verse, existingBookmark]);

  useEffect(() => {
    if (!verse) return;
    let cancelled = false;
    setLoadingTafsir(true);
    setTafsirError(false);
    fetchTafsirByAyah(verse.verse_key, tafsirSlug)
      .then((res) => {
        if (!cancelled) {
          setTafsirText(res.text);
          setTafsirResourceName(
            res.resourceName || (tafsirSlug === 'saadi' ? copy.tafsirSaadi : copy.tafsirMuyassar)
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTafsirError(true);
          setTafsirText('');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTafsir(false);
      });
    return () => {
      cancelled = true;
    };
  }, [verse, tafsirSlug, tafsirRetryTick, copy.tafsirSaadi, copy.tafsirMuyassar]);

  if (!verse) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${verse.text_uthmani} [${surahName}: ${verse.verse_number}]`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleToggleOfflineVerse = async () => {
    if (savedAudioUrl) {
      await removeOfflineAudio(savedAudioUrl);
      setSavedAudioUrl(null);
      return;
    }
    setSavingAudio(true);
    try {
      const url = await fetchAyahAudioUrl(verse.verse_key, 7);
      const surahNum = Number(verse.verse_key.split(':')[0]);
      await saveAudioOffline({
        url,
        title: `${surahName} · ${copy.ayah} ${formatNumber(verse.verse_number, lang)}`,
        subtitle: lang === 'ar' ? 'مشاري العفاسي' : 'Mishary Alafasy',
        savedAt: new Date().toISOString(),
        kind: 'ayah',
        surahNumber: surahNum,
        ayahNumber: verse.verse_number,
        verseKey: verse.verse_key,
        verseText: verse.text_uthmani,
        pageNumber: verse.page_number,
        reciterId: 7,
        reciterName: lang === 'ar' ? 'مشاري راشد العفاسي' : 'Mishary Rashid Alafasy',
      });
      setSavedAudioUrl(url);
    } catch {
      // ignore if offline
    } finally {
      setSavingAudio(false);
    }
  };

  const handleShareCard = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f6b4f';
    ctx.fillRect(0, 0, 1080, 1080);
    ctx.strokeStyle = '#c9a44c';
    ctx.lineWidth = 6;
    ctx.strokeRect(48, 48, 984, 984);

    ctx.fillStyle = '#f7f3ea';
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px Amiri, serif';

    const words = verse.text_uthmani.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > 840) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);

    const startY = 520 - (lines.length * 64) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, 540, startY + i * 68);
    });

    ctx.fillStyle = '#c9a44c';
    ctx.font = '600 28px Cairo, sans-serif';
    ctx.fillText(`${surahName} · آية ${verse.verse_number} — نور`, 540, 940);

    const link = document.createElement('a');
    link.download = `nour-${verse.verse_key.replace(':', '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl crystal-card border border-[#0f6b4f]/20 dark:border-[#c9a44c]/25 p-5 sm:p-7 pb-safe space-y-5 shadow-2xl">
        <div className="w-10 h-1.5 rounded-full bg-[#0f6b4f]/25 mx-auto sm:hidden" />

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold text-[#0f6b4f] dark:text-[#c9a44c]">
            {surahName} · {copy.ayah} {verse.verse_number} · {copy.page} {verse.page_number}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#f7f3ea] dark:bg-[#0b1411] hover:bg-[#0f6b4f]/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="font-quran text-2xl sm:text-3xl leading-[2.1] text-center py-3 px-2 rounded-2xl bg-[#f7f3ea] dark:bg-[#0b1411]">
          {verse.text_uthmani}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPlayVerse(verse)}
            className="min-h-[42px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold flex items-center gap-2 hover:bg-[#0a4e39]"
          >
            <Play className="w-4 h-4" />
            <span>{copy.playFromHere}</span>
          </button>
          <button
            type="button"
            disabled={savingAudio}
            onClick={() => void handleToggleOfflineVerse()}
            className={`min-h-[42px] px-4 rounded-full border text-xs font-semibold flex items-center gap-2 transition-colors ${
              savedAudioUrl
                ? 'border-[#0f6b4f] bg-[#0f6b4f]/12 text-[#0f6b4f] dark:text-[#c9a44c]'
                : 'border-[#0f6b4f]/25 hover:bg-[#0f6b4f]/8'
            }`}
          >
            {savingAudio ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : savedAudioUrl ? (
              <Check className="w-4 h-4" />
            ) : (
              <HardDriveDownload className="w-4 h-4 text-[#0f6b4f] dark:text-[#c9a44c]" />
            )}
            <span>
              {savedAudioUrl
                ? lang === 'ar'
                  ? 'محفوظة في المكتبة'
                  : 'Saved in Library'
                : lang === 'ar'
                ? 'حفظ للمكتبة'
                : 'Save to Library'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[42px] px-4 rounded-full border border-[#0f6b4f]/25 text-xs font-semibold flex items-center gap-2 hover:bg-[#0f6b4f]/8"
          >
            {copied ? <Check className="w-4 h-4 text-[#0f6b4f]" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? copy.copied : copy.copyVerse}</span>
          </button>
          <button
            type="button"
            onClick={handleShareCard}
            className="min-h-[42px] px-4 rounded-full border border-[#c9a44c]/40 text-xs font-semibold flex items-center gap-2 hover:bg-[#c9a44c]/15"
          >
            <Download className="w-4 h-4 text-[#c9a44c]" />
            <span>{copy.shareCard}</span>
          </button>
        </div>

        <div className="space-y-3 pt-3 border-t border-[#0f6b4f]/10 dark:border-[#c9a44c]/15">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">{copy.highlight}</span>
            <div className="flex items-center gap-2">
              {HIGHLIGHT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={lang === 'ar' ? opt.labelAr : opt.labelEn}
                  onClick={() => setColor(opt.id)}
                  className={`w-7 h-7 rounded-full ${opt.swatch} border-2 transition-transform ${
                    color === opt.id ? 'border-[#17211d] dark:border-white scale-110' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold block">{copy.personalNote}</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={lang === 'ar' ? 'اكتب تدبراً أو فائدة حول هذه الآية...' : 'Write a reflection or note...'}
              className="w-full p-3 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs focus:outline-none focus:border-[#0f6b4f]"
            />
            <button
              type="button"
              onClick={() => onSaveBookmark(color, note)}
              className="min-h-[42px] px-4 rounded-xl bg-[#c9a44c] text-[#17211d] text-xs font-bold flex items-center gap-2 hover:opacity-90"
            >
              <Bookmark className="w-4 h-4" />
              <span>{copy.saveNote}</span>
            </button>
          </div>
        </div>

        <div className="space-y-3 pt-3 border-t border-[#0f6b4f]/10 dark:border-[#c9a44c]/15">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <img src="/assets/aistudio/quran_01fb2fd7.png" alt="" className="w-5 h-5 object-contain shrink-0" />
              <span>{copy.tafsir}</span>
            </h3>
            <div className="flex gap-1 p-1 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411]">
              <button
                type="button"
                onClick={() => setTafsirSlug('muyassar')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tafsirSlug === 'muyassar' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {copy.tafsirMuyassar}
              </button>
              <button
                type="button"
                onClick={() => setTafsirSlug('saadi')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tafsirSlug === 'saadi' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
                }`}
              >
                {copy.tafsirSaadi}
              </button>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/10 text-sm leading-[1.9] min-h-[100px] space-y-2">
            <p className="text-xs font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
              {tafsirResourceName || (tafsirSlug === 'saadi' ? copy.tafsirSaadi : copy.tafsirMuyassar)}
            </p>
            {loadingTafsir ? (
              <div className="flex items-center gap-2 text-xs text-[#5c6862] dark:text-[#98a69f] py-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#0f6b4f] dark:text-[#c9a44c]" />
                <span>{lang === 'ar' ? 'جارٍ تحميل التفسير...' : 'Loading Tafsir...'}</span>
              </div>
            ) : tafsirError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-2" role="alert">
                <span className="text-xs text-red-600 dark:text-red-400">
                  {lang === 'ar' ? 'تعذر تحميل التفسير حالياً.' : 'Unable to load Tafsir right now.'}
                </span>
                <button
                  type="button"
                  onClick={() => setTafsirRetryTick((n) => n + 1)}
                  className="min-h-[36px] px-4 rounded-full bg-[#0f6b4f] text-white text-xs font-semibold hover:bg-[#0a4e39]"
                >
                  {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            ) : (
              <p>{tafsirText}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
