import { CalculationMethod, Coordinates, PrayerTimes, Qibla } from 'adhan';
import { AdhkarItem } from '../types/nour';

export interface CityPreset {
  id: string;
  nameAr: string;
  nameEn: string;
  lat: number;
  lng: number;
  method: 'ummAlQura' | 'egyptian' | 'muslimWorldLeague' | 'northAmerica' | 'dubai';
}

export const CITY_PRESETS: CityPreset[] = [
  { id: 'makkah', nameAr: 'مكة المكرمة', nameEn: 'Makkah', lat: 21.4225, lng: 39.8262, method: 'ummAlQura' },
  { id: 'madinah', nameAr: 'المدينة المنورة', nameEn: 'Madinah', lat: 24.4672, lng: 39.6111, method: 'ummAlQura' },
  { id: 'riyadh', nameAr: 'الرياض', nameEn: 'Riyadh', lat: 24.7136, lng: 46.6753, method: 'ummAlQura' },
  { id: 'cairo', nameAr: 'القاهرة', nameEn: 'Cairo', lat: 30.0444, lng: 31.2357, method: 'egyptian' },
  { id: 'dubai', nameAr: 'دبي', nameEn: 'Dubai', lat: 25.2048, lng: 55.2708, method: 'dubai' },
  { id: 'istanbul', nameAr: 'إسطنبول', nameEn: 'Istanbul', lat: 41.0082, lng: 28.9784, method: 'muslimWorldLeague' },
  { id: 'london', nameAr: 'لندن', nameEn: 'London', lat: 51.5072, lng: -0.1276, method: 'muslimWorldLeague' },
  { id: 'newyork', nameAr: 'نيويورك', nameEn: 'New York', lat: 40.7128, lng: -74.006, method: 'northAmerica' },
];

export interface CalculatedPrayers {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
  nextPrayerName: string;
  nextPrayerTime: Date;
  qiblaBearing: number;
}

export function calculatePrayerSchedule(
  lat: number,
  lng: number,
  methodKey: CityPreset['method'] = 'ummAlQura',
  now: Date = new Date()
): CalculatedPrayers {
  const coords = new Coordinates(lat, lng);
  const params =
    methodKey === 'egyptian'
      ? CalculationMethod.Egyptian()
      : methodKey === 'muslimWorldLeague'
      ? CalculationMethod.MuslimWorldLeague()
      : methodKey === 'northAmerica'
      ? CalculationMethod.NorthAmerica()
      : methodKey === 'dubai'
      ? CalculationMethod.Dubai()
      : CalculationMethod.UmmAlQura();

  const pt = new PrayerTimes(coords, now, params);
  const next = pt.nextPrayer(now);
  let nextName = 'fajr';
  let nextTime = pt.fajr;

  if (next === 'fajr') {
    nextName = 'fajr';
    nextTime = pt.fajr;
  } else if (next === 'sunrise') {
    nextName = 'sunrise';
    nextTime = pt.sunrise;
  } else if (next === 'dhuhr') {
    nextName = 'dhuhr';
    nextTime = pt.dhuhr;
  } else if (next === 'asr') {
    nextName = 'asr';
    nextTime = pt.asr;
  } else if (next === 'maghrib') {
    nextName = 'maghrib';
    nextTime = pt.maghrib;
  } else if (next === 'isha') {
    nextName = 'isha';
    nextTime = pt.isha;
  } else {
    const tomorrow = new Date(now.getTime() + 86400000);
    const tomorrowPt = new PrayerTimes(coords, tomorrow, params);
    nextName = 'fajr';
    nextTime = tomorrowPt.fajr;
  }

  return {
    fajr: pt.fajr,
    sunrise: pt.sunrise,
    dhuhr: pt.dhuhr,
    asr: pt.asr,
    maghrib: pt.maghrib,
    isha: pt.isha,
    nextPrayerName: nextName,
    nextPrayerTime: nextTime,
    qiblaBearing: Qibla(coords),
  };
}

export const ADHKAR_LIST: AdhkarItem[] = [
  {
    id: 'm1',
    category: 'morning',
    arabic: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
    translation: 'We have reached the morning and at this very time all sovereignty belongs to Allah, and all praise is for Allah.',
    reference: 'صحيح مسلم',
    targetCount: 1,
  },
  {
    id: 'm2',
    category: 'morning',
    arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
    translation: 'Glory be to Allah and praise Him.',
    reference: 'صحيح مسلم',
    targetCount: 100,
  },
  {
    id: 'm3',
    category: 'morning',
    arabic: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
    translation: 'In the name of Allah with whose name nothing is harmed on earth nor in the heavens, and He is the All-Hearing, All-Knowing.',
    reference: 'أبو داود والترمذي',
    targetCount: 3,
  },
  {
    id: 'm4',
    category: 'morning',
    arabic: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ',
    translation: 'O Allah, You are my Lord, none has the right to be worshipped except You. You created me and I am Your servant.',
    reference: 'صحيح البخاري (سيد الاستغفار)',
    targetCount: 1,
  },
  {
    id: 'm5',
    category: 'morning',
    arabic: 'حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ',
    translation: 'Allah is sufficient for me. There is no deity except Him; upon Him I have relied, and He is the Lord of the Great Throne.',
    reference: 'أبو داود',
    targetCount: 7,
  },
  {
    id: 'e1',
    category: 'evening',
    arabic: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
    translation: 'We have reached the evening and at this very time all sovereignty belongs to Allah, and all praise is for Allah.',
    reference: 'صحيح مسلم',
    targetCount: 1,
  },
  {
    id: 'e2',
    category: 'evening',
    arabic: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
    translation: 'I seek refuge in the perfect words of Allah from the evil of what He has created.',
    reference: 'صحيح مسلم',
    targetCount: 3,
  },
  {
    id: 'e3',
    category: 'evening',
    arabic: 'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ',
    translation: 'O Allah, by You we enter the evening, by You we enter the morning, by You we live and die, and to You is the final return.',
    reference: 'الترمذي',
    targetCount: 1,
  },
  {
    id: 'e4',
    category: 'evening',
    arabic: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ',
    translation: 'I seek the forgiveness of Allah and repent to Him.',
    reference: 'متفق عليه',
    targetCount: 100,
  },
];
