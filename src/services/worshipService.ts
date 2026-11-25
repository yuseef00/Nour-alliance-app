import { CalculationMethod, Coordinates, PrayerTimes, Qibla } from 'adhan';
import { AdhkarItem, Language } from '../types/nour';

export type PrayerMethodKey =
  | 'ummAlQura'
  | 'egyptian'
  | 'muslimWorldLeague'
  | 'northAmerica'
  | 'dubai';

export interface CityPreset {
  id: string;
  nameAr: string;
  nameEn: string;
  lat: number;
  lng: number;
  method: PrayerMethodKey;
}

export interface SavedLocation {
  labelAr: string;
  labelEn: string;
  lat: number;
  lng: number;
  method: PrayerMethodKey;
  source: 'preset' | 'gps' | 'search';
  accuracyMeters?: number;
  updatedAt: string;
}

export interface GeocodedPlace {
  labelAr: string;
  labelEn: string;
  lat: number;
  lng: number;
  method: PrayerMethodKey;
}

const LOCATION_STORAGE_KEY = 'nour_user_location_v1';
export const LOCATION_UPDATED_EVENT = 'nour-location-updated';

export const CITY_PRESETS: CityPreset[] = [
  { id: 'makkah', nameAr: 'مكة المكرمة', nameEn: 'Makkah', lat: 21.4225, lng: 39.8262, method: 'ummAlQura' },
  { id: 'madinah', nameAr: 'المدينة المنورة', nameEn: 'Madinah', lat: 24.4672, lng: 39.6111, method: 'ummAlQura' },
  { id: 'riyadh', nameAr: 'الرياض', nameEn: 'Riyadh', lat: 24.7136, lng: 46.6753, method: 'ummAlQura' },
  { id: 'cairo', nameAr: 'القاهرة', nameEn: 'Cairo', lat: 30.0444, lng: 31.2357, method: 'egyptian' },
  { id: 'dubai', nameAr: 'دبي', nameEn: 'Dubai', lat: 25.2048, lng: 55.2708, method: 'dubai' },
  { id: 'amman', nameAr: 'عمّان', nameEn: 'Amman', lat: 31.9539, lng: 35.9106, method: 'muslimWorldLeague' },
  { id: 'baghdad', nameAr: 'بغداد', nameEn: 'Baghdad', lat: 33.3152, lng: 44.3661, method: 'muslimWorldLeague' },
  { id: 'rabat', nameAr: 'الرباط', nameEn: 'Rabat', lat: 34.0209, lng: -6.8416, method: 'muslimWorldLeague' },
  { id: 'istanbul', nameAr: 'إسطنبول', nameEn: 'Istanbul', lat: 41.0082, lng: 28.9784, method: 'muslimWorldLeague' },
  { id: 'london', nameAr: 'لندن', nameEn: 'London', lat: 51.5072, lng: -0.1276, method: 'muslimWorldLeague' },
  { id: 'newyork', nameAr: 'نيويورك', nameEn: 'New York', lat: 40.7128, lng: -74.006, method: 'northAmerica' },
];

export const CALCULATION_METHOD_LABELS: Record<PrayerMethodKey, { ar: string; en: string }> = {
  ummAlQura: { ar: 'أم القرى (مكة)', en: 'Umm Al-Qura (Makkah)' },
  egyptian: { ar: 'الهيئة المصرية العامة للمساحة', en: 'Egyptian General Authority' },
  dubai: { ar: 'دبي / الخليج', en: 'Dubai / Gulf Region' },
  muslimWorldLeague: { ar: 'رابطة العالم الإسلامي', en: 'Muslim World League' },
  northAmerica: { ar: 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)', en: 'ISNA (North America)' },
};

export function inferMethodFromCountryCode(countryCode?: string): PrayerMethodKey {
  const code = (countryCode || '').trim().toUpperCase();
  if (code === 'SA' || code === 'YE') return 'ummAlQura';
  if (code === 'EG' || code === 'SD' || code === 'LY') return 'egyptian';
  if (code === 'AE' || code === 'QA' || code === 'KW' || code === 'BH' || code === 'OM') return 'dubai';
  if (code === 'US' || code === 'CA' || code === 'MX') return 'northAmerica';
  return 'muslimWorldLeague';
}

export function loadSavedLocation(): SavedLocation {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedLocation;
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  const fallback = CITY_PRESETS[0];
  return {
    labelAr: fallback.nameAr,
    labelEn: fallback.nameEn,
    lat: fallback.lat,
    lng: fallback.lng,
    method: fallback.method,
    source: 'preset',
    updatedAt: new Date().toISOString(),
  };
}

export function saveUserLocation(loc: SavedLocation): void {
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc));
    window.dispatchEvent(new CustomEvent(LOCATION_UPDATED_EVENT, { detail: loc }));
  } catch {
    // ignore storage errors
  }
}

export async function reverseGeocodeCoords(
  lat: number,
  lng: number,
  lang: Language
): Promise<{ labelAr: string; labelEn: string; method: PrayerMethodKey }> {
  const coordLabel = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&zoom=12&accept-language=${lang === 'ar' ? 'ar' : 'en'}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('Reverse geocode failed');
    const data = await res.json();
    const addr = data?.address || {};
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.suburb ||
      addr.state ||
      addr.county ||
      '';
    const country = addr.country || '';
    const countryCode = addr.country_code || '';
    const placeText = [city, country].filter(Boolean).join('، ') || coordLabel;
    const placeTextEn = [city, country].filter(Boolean).join(', ') || coordLabel;
    return {
      labelAr: placeText,
      labelEn: placeTextEn,
      method: inferMethodFromCountryCode(countryCode),
    };
  } catch {
    return {
      labelAr: `موقعي (${coordLabel})`,
      labelEn: `My Location (${coordLabel})`,
      method: inferMethodFromCountryCode(),
    };
  }
}

export async function searchLocationsByQuery(queryText: string, lang: Language): Promise<GeocodedPlace[]> {
  const q = queryText.trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(
    q
  )}&accept-language=${lang === 'ar' ? 'ar' : 'en'}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Location search failed');
  const rows = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name?: string;
    address?: {
      city?: string;
      town?: string;
      village?: string;
      state?: string;
      country?: string;
      country_code?: string;
    };
  }>;

  return rows
    .map((row) => {
      const lat = Number(row.lat);
      const lng = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const a = row.address || {};
      const city = a.city || a.town || a.village || a.state || row.display_name?.split(',')[0] || q;
      const country = a.country || '';
      return {
        labelAr: [city, country].filter(Boolean).join('، '),
        labelEn: [city, country].filter(Boolean).join(', '),
        lat,
        lng,
        method: inferMethodFromCountryCode(a.country_code),
      } satisfies GeocodedPlace;
    })
    .filter((item): item is GeocodedPlace => item !== null);
}

/**
 * Acquires the tightest possible GPS fix by using enableHighAccuracy=true
 * and briefly watching for a higher-precision reading if initial accuracy > 120m.
 */
export function detectHighAccuracyGps(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
}> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('UNSUPPORTED'));
      return;
    }

    let bestPos: GeolocationPosition | null = null;
    let settled = false;
    let watchId: number | null = null;
    let refineTimer: number | null = null;

    const finish = (pos: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (refineTimer !== null) window.clearTimeout(refineTimer);
      resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0),
      });
    };

    const fail = (err: GeolocationPositionError) => {
      if (settled) return;
      if (bestPos) {
        finish(bestPos);
        return;
      }
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (refineTimer !== null) window.clearTimeout(refineTimer);
      if (err.code === err.PERMISSION_DENIED) reject(new Error('PERMISSION_DENIED'));
      else if (err.code === err.TIMEOUT) reject(new Error('TIMEOUT'));
      else reject(new Error('POSITION_UNAVAILABLE'));
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
          bestPos = pos;
        }
        if (pos.coords.accuracy <= 65) {
          finish(pos);
          return;
        }
        if (refineTimer === null) {
          refineTimer = window.setTimeout(() => {
            if (bestPos) finish(bestPos);
          }, 3500);
        }
      },
      fail,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

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
  methodKey: PrayerMethodKey = 'ummAlQura',
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
    arabic: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا',
    translation: 'I am pleased with Allah as my Lord, with Islam as my religion, and with Muhammad (peace be upon him) as my Prophet.',
    reference: 'أبو داود',
    targetCount: 3,
  },
  {
    id: 'e1',
    category: 'evening',
    arabic: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
    translation: 'We have reached the evening and at this very time all sovereignty belongs to Allah.',
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
    arabic: 'حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ',
    translation: 'Allah is sufficient for me; there is no deity except Him. On Him I have relied, and He is the Lord of the Great Throne.',
    reference: 'أبو داود',
    targetCount: 7,
  },
  {
    id: 'e4',
    category: 'evening',
    arabic: 'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ',
    translation: 'O Allah, send blessings and peace upon our Prophet Muhammad.',
    reference: 'صحيح الجامع',
    targetCount: 10,
  },
];
