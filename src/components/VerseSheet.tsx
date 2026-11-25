import React, { useEffect, useState } from 'react';
import { Bookmark, Check, Copy, Download, Play, X } from 'lucide-react';
import { HighlightColor, Language, TafsirSlug, Verse, VerseBookmark } from '../types/nour';
import { t } from '../i18n/translations';
import { fetchTafsirByAyah } from '../services/quranApi';

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
  const [loadingTafsir, setLoadingTafsir] = useState(false);
  const [color, setColor] = useState<HighlightColor>('gold');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!verse) return;
    setColor(existingBookmark?.highlightColor || 'gold');
    setNote(existingBookmark?.note || '');
  }, [verse, existingBookmark]);

  useEffect(() => {
    if (!verse) return;
    let cancelled = false;
    setLoadingTafsir(true);
    fetchTafsirByAyah(verse.verse_key, tafsirSlug)
      .then((res) => {
        if (!cancelled) setTafsirText(res.text);
      })
      .catch(() => {
        if (!cancelled) {
          setTafsirText(lang === 'ar' ? 'تعذر تحميل التفسير حالياً.' : 'Unable to load Tafsir right now.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTafsir(false);
      });
    return () => {
      cancelled = true;
    };
  }, [verse, tafsirSlug, lang]);

  if (!verse) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${verse.text_uthmani} [${surahName}: ${verse.verse_number}]`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold">{copy.tafsir}</h3>
            <div className="flex gap-1 p-1 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411]">
              <button
                type="button"
                onClick={() => setTafsirSlug('muyassar')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  tafsirSlug === 'muyassar' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                }`}
              >
                {copy.tafsirMuyassar}
              </button>
              <button
                type="button"
                onClick={() => setTafsirSlug('saadi')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  tafsirSlug === 'saadi' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862]'
                }`}
              >
                {copy.tafsirSaadi}
              </button>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#f7f3ea] dark:bg-[#0b1411] text-sm leading-[1.9] min-h-[90px]">
            {loadingTafsir ? (lang === 'ar' ? 'جاري تحميل التفسير...' : 'Loading Tafsir...') : tafsirText}
          </div>
        </div>
      </div>
    </div>
  );
};
