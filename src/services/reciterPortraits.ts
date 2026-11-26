import { stripArabicDiacritics } from './quranApi';

export type PortraitStyle = 'haramain' | 'azhar' | 'gulf' | 'classical';

const PORTRAIT_ASSETS: Record<PortraitStyle, string> = {
  haramain: '/src/assets/images/qari_portrait_haramain_1795681428036.jpg',
  azhar: '/src/assets/images/qari_portrait_azhar_1795681428950.jpg',
  gulf: '/src/assets/images/qari_portrait_gulf_1795681429242.jpg',
  classical: '/src/assets/images/qari_portrait_classical_1795681429065.jpg',
};

const AZHAR_KEYWORDS = [
  'الحصري',
  'المنشاوي',
  'عبدالباسط',
  'عبد الباسط',
  'الطبلاوي',
  'البنا',
  'اسماعيل',
  'شعيشع',
  'غلوش',
  'نعينع',
  'الشحات',
  'حجاج',
  'جبر',
  'جليل',
  'البهتيمي',
  'husary',
  'minshawi',
  'basit',
  'tablawi',
  'banna',
];

const HARAMAIN_KEYWORDS = [
  'السديس',
  'الشريم',
  'المعيقلي',
  'الحذيفي',
  'الجهني',
  'بليلة',
  'الدوسري',
  'القطامي',
  'الغامدي',
  'المحيسني',
  'المغامسي',
  'بصفر',
  'ايوب',
  'الأحمد',
  'المطرود',
  'sudais',
  'shuraim',
  'shuraym',
  'muaiqly',
  'dosari',
  'hudhaify',
  'ghamdi',
  'qatami',
  'ayyub',
];

const GULF_KEYWORDS = [
  'العفاسي',
  'العجمي',
  'البراك',
  'العتيبي',
  'الخشتي',
  'الشاطري',
  'الرفاعي',
  'الزهراني',
  'الحمد',
  'لحيدان',
  'alafasy',
  'ajmi',
  'shatri',
  'rifai',
  'luhaidan',
];

const ALL_STYLES: PortraitStyle[] = ['haramain', 'azhar', 'gulf', 'classical'];

export function getReciterPortraitStyle(reciterName: string, reciterId?: number): PortraitStyle {
  const norm = stripArabicDiacritics(reciterName || '').toLowerCase();
  if (AZHAR_KEYWORDS.some((kw) => norm.includes(stripArabicDiacritics(kw).toLowerCase()))) {
    return 'azhar';
  }
  if (HARAMAIN_KEYWORDS.some((kw) => norm.includes(stripArabicDiacritics(kw).toLowerCase()))) {
    return 'haramain';
  }
  if (GULF_KEYWORDS.some((kw) => norm.includes(stripArabicDiacritics(kw).toLowerCase()))) {
    return 'gulf';
  }
  if (typeof reciterId === 'number' && reciterId > 0) {
    return ALL_STYLES[reciterId % ALL_STYLES.length];
  }
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 31 + norm.charCodeAt(i)) >>> 0;
  }
  return ALL_STYLES[hash % ALL_STYLES.length];
}

export function getReciterPortraitUrl(reciterName: string, reciterId?: number): string {
  const style = getReciterPortraitStyle(reciterName, reciterId);
  return PORTRAIT_ASSETS[style];
}

export function getReciterInitials(reciterName: string): string {
  const cleaned = (reciterName || '').replace(/^(الشيخ|القارئ|sheikh)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ق';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
}
