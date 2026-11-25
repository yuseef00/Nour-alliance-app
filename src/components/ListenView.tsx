import React, { useEffect, useMemo, useState } from 'react';
import { Check, Download, Heart, Pause, Play, Radio, Search, Star, Trash2, Volume2 } from 'lucide-react';
import { AudioTrack, Chapter, FavoriteRadio, Language, RadioStation, Reciter } from '../types/nour';
import { formatNumber, t } from '../i18n/translations';
import {
  buildSurahAudioUrl,
  fetchRadios,
  fetchReciters,
  getOfflineTracksMeta,
  OfflineTrackMeta,
  removeOfflineAudio,
  saveAudioOffline,
} from '../services/mp3QuranApi';

interface ListenViewProps {
  lang: Language;
  chapters: Chapter[];
  activeTrack: AudioTrack | null;
  isPlaying: boolean;
  favoriteRadios: FavoriteRadio[];
  defaultReciterId: number;
  onPlayTrack: (track: AudioTrack) => void;
  onTogglePlayPause: () => void;
  onToggleFavoriteRadio: (radio: RadioStation) => void;
  onSelectDefaultReciter: (reciterId: number) => void;
}

const FEATURED_KEYWORDS = ['العفاسي', 'الحصري', 'المنشاوي', 'عبدالباسط', 'المعيقلي', 'السديس', 'Alafasy', 'Husary', 'Minshawi', 'Basit', 'Sudais', 'Muaiqly'];

export const ListenView: React.FC<ListenViewProps> = ({
  lang,
  chapters,
  activeTrack,
  isPlaying,
  favoriteRadios,
  defaultReciterId,
  onPlayTrack,
  onTogglePlayPause,
  onToggleFavoriteRadio,
  onSelectDefaultReciter,
}) => {
  const copy = t(lang);
  const [subTab, setSubTab] = useState<'reciters' | 'radios'>('reciters');
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [radios, setRadios] = useState<RadioStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [riwayaFilter, setRiwayaFilter] = useState('all');
  const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
  const [selectedMoshafIdx, setSelectedMoshafIdx] = useState(0);
  const [offlineList, setOfflineList] = useState<OfflineTrackMeta[]>(() => getOfflineTracksMeta());
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchReciters(lang), fetchRadios(lang)])
      .then(([recData, radData]) => {
        if (cancelled) return;
        setReciters(recData);
        setRadios(radData);
        const def = recData.find((r) => r.id === defaultReciterId) || recData[0] || null;
        setSelectedReciter(def);
        setSelectedMoshafIdx(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang, defaultReciterId]);

  const featuredReciters = useMemo(() => {
    const picks: Reciter[] = [];
    for (const kw of FEATURED_KEYWORDS) {
      const found = reciters.find((r) => r.name.includes(kw) && !picks.some((p) => p.id === r.id));
      if (found) picks.push(found);
      if (picks.length >= 6) break;
    }
    return picks;
  }, [reciters]);

  const riwayaOptions = useMemo(() => {
    const set = new Set<string>();
    reciters.forEach((r) =>
      r.moshaf.forEach((m) => {
        const clean = m.name.split('-')[0].trim();
        if (clean) set.add(clean);
      })
    );
    return Array.from(set).slice(0, 12);
  }, [reciters]);

  const filteredReciters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reciters.filter((r) => {
      const matchesName = !q || r.name.toLowerCase().includes(q);
      const matchesRiwaya =
        riwayaFilter === 'all' || r.moshaf.some((m) => m.name.includes(riwayaFilter));
      return matchesName && matchesRiwaya;
    });
  }, [reciters, searchQuery, riwayaFilter]);

  const filteredRadios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = !q ? radios : radios.filter((r) => r.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const aFav = favoriteRadios.some((f) => f.radioId === a.id) ? 0 : 1;
      const bFav = favoriteRadios.some((f) => f.radioId === b.id) ? 0 : 1;
      return aFav - bFav;
    });
  }, [radios, searchQuery, favoriteRadios]);

  const favIds = useMemo(() => new Set(favoriteRadios.map((f) => f.radioId)), [favoriteRadios]);
  const offlineUrls = useMemo(() => new Set(offlineList.map((o) => o.url)), [offlineList]);

  const selectedMoshaf = selectedReciter?.moshaf[selectedMoshafIdx] || selectedReciter?.moshaf[0] || null;
  const availableSurahIds = useMemo(() => {
    if (!selectedMoshaf?.surah_list) return chapters.map((c) => c.id);
    return selectedMoshaf.surah_list
      .split(',')
      .map((s) => Number(s.trim()))
      .filter(Boolean);
  }, [selectedMoshaf, chapters]);

  const handleDownload = async (url: string, title: string, subtitle: string) => {
    setDownloadingUrl(url);
    try {
      await saveAudioOffline({ url, title, subtitle, savedAt: new Date().toISOString() });
      setOfflineList(getOfflineTracksMeta());
    } catch {
      // ignore if CORS blocks cache fetch on specific CDN
    } finally {
      setDownloadingUrl(null);
    }
  };

  const handleRemoveOffline = async (url: string) => {
    await removeOfflineAudio(url);
    setOfflineList(getOfflineTracksMeta());
  };

  return (
    <div className="space-y-5">
      {/* Header Controls */}
      <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex p-1 rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80">
          <button
            type="button"
            onClick={() => setSubTab('reciters')}
            className={`min-h-[42px] px-4 rounded-lg text-xs font-semibold transition-colors ${
              subTab === 'reciters' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
            }`}
          >
            {copy.reciters} ({formatNumber(reciters.length, lang)})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('radios')}
            className={`min-h-[42px] px-4 rounded-lg text-xs font-semibold transition-colors ${
              subTab === 'radios' ? 'bg-[#0f6b4f] text-white' : 'text-[#5c6862] dark:text-[#98a69f]'
            }`}
          >
            {copy.radios} ({formatNumber(radios.length, lang)})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#5c6862] absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'ابحث عن قارئ أو إذاعة...' : 'Search reciter or radio...'}
              className="w-full min-h-[44px] ps-9 pe-3 rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs"
            />
          </div>
          {subTab === 'reciters' && (
            <select
              value={riwayaFilter}
              onChange={(e) => setRiwayaFilter(e.target.value)}
              className="min-h-[44px] px-3 rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/20 text-xs"
            >
              <option value="all">{copy.allRiwayat}</option>
              {riwayaOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Featured Reciters Quick Strip */}
      {!loading && subTab === 'reciters' && featuredReciters.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {featuredReciters.map((rec) => {
            const active = selectedReciter?.id === rec.id;
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => {
                  setSelectedReciter(rec);
                  setSelectedMoshafIdx(0);
                  onSelectDefaultReciter(rec.id);
                }}
                className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-2 transition-colors ${
                  active
                    ? 'bg-[#0f6b4f] border-[#0f6b4f] text-white shadow-sm'
                    : 'crystal-card border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 hover:border-[#c9a44c]'
                }`}
              >
                <Star className="w-3.5 h-3.5 text-[#c9a44c]" />
                <span>{rec.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-[#5c6862]">
          {lang === 'ar' ? 'جاري تحميل المكتبة الصوتية...' : 'Loading audio library...'}
        </div>
      ) : subTab === 'reciters' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Reciters Directory */}
          <div className="lg:col-span-5 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 max-h-[68vh] overflow-y-auto divide-y divide-[#0f6b4f]/10">
            {filteredReciters.slice(0, 140).map((reciter) => {
              const active = selectedReciter?.id === reciter.id;
              return (
                <button
                  key={reciter.id}
                  type="button"
                  onClick={() => {
                    setSelectedReciter(reciter);
                    setSelectedMoshafIdx(0);
                    onSelectDefaultReciter(reciter.id);
                  }}
                  className={`w-full min-h-[48px] py-3 px-3 rounded-xl flex items-center justify-between text-start transition-colors ${
                    active ? 'bg-[#0f6b4f]/14 text-[#0f6b4f] dark:text-[#c9a44c]' : 'hover:bg-[#0f6b4f]/6'
                  }`}
                >
                  <div>
                    <p className="font-bold text-sm">{reciter.name}</p>
                    <p className="text-[11px] text-[#5c6862] dark:text-[#98a69f]">
                      {reciter.moshaf[0]?.name || 'حفص عن عاصم'}
                    </p>
                  </div>
                  <Volume2 className="w-4 h-4 shrink-0 opacity-70" />
                </button>
              );
            })}
          </div>

          {/* Selected Reciter Surahs */}
          <div className="lg:col-span-7 rounded-3xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-5 space-y-4 max-h-[68vh] overflow-y-auto">
            {selectedReciter && selectedMoshaf ? (
              <>
                <div className="border-b border-[#0f6b4f]/10 pb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{selectedReciter.name}</h3>
                    <p className="text-xs text-[#5c6862] dark:text-[#98a69f]">
                      {selectedMoshaf.name} · {formatNumber(availableSurahIds.length, lang)} {copy.surah}
                    </p>
                  </div>
                  {selectedReciter.moshaf.length > 1 && (
                    <select
                      value={selectedMoshafIdx}
                      onChange={(e) => setSelectedMoshafIdx(Number(e.target.value))}
                      className="min-h-[38px] px-3 rounded-xl bg-[#f7f3ea] dark:bg-[#0b1411] border border-[#0f6b4f]/20 text-xs"
                    >
                      {selectedReciter.moshaf.map((m, idx) => (
                        <option key={m.id} value={idx}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-2.5">
                  {availableSurahIds.map((surahId) => {
                    const ch = chapters.find((c) => c.id === surahId);
                    const url = buildSurahAudioUrl(selectedMoshaf, surahId);
                    const isThisTrack = activeTrack?.url === url;
                    const isSaved = offlineUrls.has(url);
                    const title = ch
                      ? lang === 'ar'
                        ? `سورة ${ch.name_arabic}`
                        : `Surah ${ch.name_simple}`
                      : `Surah ${surahId}`;

                    return (
                      <div
                        key={surahId}
                        className={`rounded-2xl border p-3 flex items-center justify-between gap-2 transition-colors ${
                          isThisTrack
                            ? 'border-[#0f6b4f] bg-[#0f6b4f]/12 shadow-sm'
                            : 'border-[#0f6b4f]/12 bg-[#f7f3ea]/75 dark:bg-[#0b1411]/75 hover:border-[#0f6b4f]/35'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (isThisTrack) onTogglePlayPause();
                            else
                              onPlayTrack({
                                id: `${selectedReciter.id}_${surahId}`,
                                type: 'surah',
                                title,
                                subtitle: selectedReciter.name,
                                url,
                                surahNumber: surahId,
                                reciterId: selectedReciter.id,
                                moshafServer: selectedMoshaf.server,
                              });
                          }}
                          className="flex items-center gap-3 text-start flex-1 min-w-0 min-h-[44px]"
                        >
                          <span className="w-9 h-9 rounded-xl bg-[#0f6b4f] text-white flex items-center justify-center shrink-0">
                            {isThisTrack && isPlaying ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-semibold text-xs block">{title}</span>
                              {isThisTrack && isPlaying && (
                                <span className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
                                  <span className="w-0.5 h-2 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] eq-bar" />
                                  <span className="w-0.5 h-3 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] eq-bar" style={{ animationDelay: '160ms' }} />
                                  <span className="w-0.5 h-1.5 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] eq-bar" style={{ animationDelay: '300ms' }} />
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#5c6862] dark:text-[#98a69f] tabular-nums">
                              {String(surahId).padStart(3, '0')}
                              {ch ? ` · ${formatNumber(ch.verses_count, lang)} ${copy.ayah}` : ''}
                            </span>
                          </div>
                        </button>

                        {isSaved ? (
                          <button
                            type="button"
                            title={copy.downloaded}
                            onClick={() => handleRemoveOffline(url)}
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#0f6b4f] dark:text-[#c9a44c] hover:bg-red-500/10"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title={copy.downloadOffline}
                            disabled={downloadingUrl === url}
                            onClick={() => handleDownload(url, title, selectedReciter.name)}
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#5c6862] hover:text-[#0f6b4f]"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredRadios.map((radio) => {
            const isFav = favIds.has(radio.id);
            const isThis = activeTrack?.url === radio.url;
            return (
              <div
                key={radio.id}
                className={`rounded-2xl crystal-card border p-4 flex items-center justify-between gap-3 ${
                  isThis ? 'border-[#0f6b4f] bg-[#0f6b4f]/10' : 'border-[#0f6b4f]/15 dark:border-[#c9a44c]/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isThis) onTogglePlayPause();
                    else
                      onPlayTrack({
                        id: `radio_${radio.id}`,
                        type: 'radio',
                        title: radio.name,
                        subtitle: copy.radios,
                        url: radio.url,
                      });
                  }}
                  className="flex items-center gap-3 text-start flex-1 min-w-0 min-h-[44px]"
                >
                  <span className="w-10 h-10 rounded-xl bg-[#0f6b4f]/14 text-[#0f6b4f] dark:text-[#c9a44c] flex items-center justify-center shrink-0">
                    {isThis && isPlaying ? <Pause className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="text-xs font-bold truncate">{radio.name}</span>
                    {isThis && isPlaying && (
                      <span className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
                        <span className="w-0.5 h-2 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] eq-bar" />
                        <span className="w-0.5 h-3 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] eq-bar" style={{ animationDelay: '160ms' }} />
                        <span className="w-0.5 h-2 rounded-full bg-[#0f6b4f] dark:bg-[#c9a44c] eq-bar" style={{ animationDelay: '320ms' }} />
                      </span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={copy.favorites}
                  onClick={() => onToggleFavoriteRadio(radio)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[#0f6b4f]/10 shrink-0"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      isFav ? 'fill-[#c9a44c] text-[#c9a44c]' : 'text-[#5c6862]'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {offlineList.length > 0 && (
        <div className="rounded-2xl crystal-card border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-4 space-y-2">
          <h4 className="text-xs font-bold">{copy.offlineDownloads}</h4>
          <div className="flex flex-wrap gap-2">
            {offlineList.map((item) => (
              <div
                key={item.url}
                className="flex items-center gap-2 rounded-xl bg-[#f7f3ea]/80 dark:bg-[#0b1411]/80 border border-[#0f6b4f]/15 px-3 py-1.5 text-xs"
              >
                <span>
                  {item.title} · {item.subtitle}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveOffline(item.url)}
                  className="text-red-500 hover:opacity-80"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
