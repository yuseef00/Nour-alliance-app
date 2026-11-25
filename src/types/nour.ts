export type Language = 'ar' | 'en';
export type ThemeMode = 'light' | 'dark';
export type AppTab = 'home' | 'quran' | 'listen' | 'worship' | 'profile';
export type AuthStage = 'splash' | 'onboarding' | 'auth' | 'app';
export type HighlightColor = 'none' | 'gold' | 'emerald' | 'sky' | 'rose';
export type MushafViewMode = 'page' | 'verse';
export type TafsirSlug = 'muyassar' | 'saadi';

export interface Chapter {
  id: number;
  revelation_place: 'makkah' | 'madinah';
  revelation_order: number;
  bismillah_pre: boolean;
  name_simple: string;
  name_complex: string;
  name_arabic: string;
  verses_count: number;
  pages: [number, number];
  translated_name?: {
    language_name: string;
    name: string;
  };
}

export interface Verse {
  id: number;
  verse_number: number;
  verse_key: string;
  hizb_number: number;
  rub_el_hizb_number: number;
  page_number: number;
  juz_number: number;
  text_uthmani: string;
  text_uthmani_tajweed?: string;
}

export interface Moshaf {
  id: number;
  name: string;
  rewaya_id?: number;
  server: string;
  surah_total: number;
  moshaf_type: number;
  surah_list: string;
}

export interface Reciter {
  id: number;
  name: string;
  letter: string;
  date?: string;
  moshaf: Moshaf[];
}

export interface RadioStation {
  id: number;
  name: string;
  url: string;
  recent_date?: string;
}

export interface SurahAudioMeta {
  id: number;
  name: string;
  start_page?: number;
  end_page?: number;
  makkia?: number;
}

export interface VerseBookmark {
  id: string;
  uid: string;
  verseKey: string;
  surahNumber: number;
  ayahNumber: number;
  pageNumber: number;
  highlightColor: HighlightColor;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemorizationItem {
  id: string;
  uid: string;
  surahNumber: number;
  startAyah: number;
  endAyah: number;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteRadio {
  id: string;
  uid: string;
  radioId: number;
  name: string;
  url: string;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  language: Language;
  theme: ThemeMode;
  defaultReciterId: number;
  streakDays: number;
  lastReadPage: number;
  lastReadSurah: number;
  lastReadAyah: number;
  lastReadDate: string;
  khatmaTargetDays: number;
  khatmaCurrentPage: number;
  khatmaStartDate: string;
  weeklyPages: number[];
  isGuest?: boolean;
  emailVerified?: boolean;
}

export interface AudioTrack {
  id: string;
  type: 'surah' | 'radio' | 'ayah';
  title: string;
  subtitle: string;
  url: string;
  surahNumber?: number;
  reciterId?: number;
  moshafServer?: string;
  verseKey?: string;
  pageNumber?: number;
}

export interface AdhkarItem {
  id: string;
  category: 'morning' | 'evening';
  arabic: string;
  translation: string;
  reference: string;
  targetCount: number;
}

export type BackgroundType = 'default_mosque' | 'preset' | 'custom_url' | 'custom_upload' | 'none';

export interface AppAppearance {
  backgroundType: BackgroundType;
  backgroundUrl: string;
  backgroundOpacity: number;
  backgroundBlur: number;
  updatedBy?: string;
  updatedAt?: string;
}

export interface VisitRecord {
  visitId: string;
  country: string;
  countryCode: string;
  city: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  language: Language;
  path: string;
  createdAt: string;
}

