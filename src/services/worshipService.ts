import { CalculationMethod, Coordinates, PrayerTimes, Qibla } from 'adhan';
import { AdhkarItem, Language } from '../types/nour';

export type PrayerMethodKey =
  | 'ummAlQura'
  | 'egyptian'
  | 'muslimWorldLeague'
  | 'northAmerica'
  | 'dubai'
  | 'kuwait'
  | 'qatar'
  | 'karachi'
  | 'turkey'
  | 'singapore';

export type CityRegionKey = 'levant_gulf' | 'north_africa' | 'asia_turkey' | 'europe_americas';

export interface CityPreset {
  id: string;
  nameAr: string;
  nameEn: string;
  countryAr: string;
  countryEn: string;
  region: CityRegionKey;
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

export const CITY_REGION_LABELS: Record<CityRegionKey, { ar: string; en: string }> = {
  levant_gulf: { ar: 'بلاد الشام والخليج واليمن والعراق', en: 'Levant, Gulf, Iraq & Yemen' },
  north_africa: { ar: 'مصر والسودان والمغرب العربي', en: 'Egypt, Sudan & North Africa' },
  asia_turkey: { ar: 'تركيا وآسيا والعالم الإسلامي', en: 'Turkey & Asia' },
  europe_americas: { ar: 'أوروبا والأمريكتان وأستراليا', en: 'Europe, Americas & Oceania' },
};

export const CITY_PRESETS: CityPreset[] = [
  // Levant, Gulf, Iraq & Yemen
  { id: 'makkah', nameAr: 'مكة المكرمة', nameEn: 'Makkah', countryAr: 'السعودية', countryEn: 'Saudi Arabia', region: 'levant_gulf', lat: 21.4225, lng: 39.8262, method: 'ummAlQura' },
  { id: 'madinah', nameAr: 'المدينة المنورة', nameEn: 'Madinah', countryAr: 'السعودية', countryEn: 'Saudi Arabia', region: 'levant_gulf', lat: 24.4672, lng: 39.6111, method: 'ummAlQura' },
  { id: 'riyadh', nameAr: 'الرياض', nameEn: 'Riyadh', countryAr: 'السعودية', countryEn: 'Saudi Arabia', region: 'levant_gulf', lat: 24.7136, lng: 46.6753, method: 'ummAlQura' },
  { id: 'jeddah', nameAr: 'جدة', nameEn: 'Jeddah', countryAr: 'السعودية', countryEn: 'Saudi Arabia', region: 'levant_gulf', lat: 21.5433, lng: 39.1728, method: 'ummAlQura' },
  { id: 'damascus', nameAr: 'دمشق', nameEn: 'Damascus', countryAr: 'سوريا', countryEn: 'Syria', region: 'levant_gulf', lat: 33.5138, lng: 36.2765, method: 'muslimWorldLeague' },
  { id: 'aleppo', nameAr: 'حلب', nameEn: 'Aleppo', countryAr: 'سوريا', countryEn: 'Syria', region: 'levant_gulf', lat: 36.2021, lng: 37.1343, method: 'muslimWorldLeague' },
  { id: 'homs', nameAr: 'حمص', nameEn: 'Homs', countryAr: 'سوريا', countryEn: 'Syria', region: 'levant_gulf', lat: 34.7324, lng: 36.7137, method: 'muslimWorldLeague' },
  { id: 'jerusalem', nameAr: 'القدس الشريف', nameEn: 'Jerusalem', countryAr: 'فلسطين', countryEn: 'Palestine', region: 'levant_gulf', lat: 31.7683, lng: 35.2137, method: 'muslimWorldLeague' },
  { id: 'amman', nameAr: 'عمّان', nameEn: 'Amman', countryAr: 'الأردن', countryEn: 'Jordan', region: 'levant_gulf', lat: 31.9539, lng: 35.9106, method: 'muslimWorldLeague' },
  { id: 'beirut', nameAr: 'بيروت', nameEn: 'Beirut', countryAr: 'لبنان', countryEn: 'Lebanon', region: 'levant_gulf', lat: 33.8938, lng: 35.5018, method: 'muslimWorldLeague' },
  { id: 'baghdad', nameAr: 'بغداد', nameEn: 'Baghdad', countryAr: 'العراق', countryEn: 'Iraq', region: 'levant_gulf', lat: 33.3152, lng: 44.3661, method: 'muslimWorldLeague' },
  { id: 'dubai', nameAr: 'دبي', nameEn: 'Dubai', countryAr: 'الإمارات', countryEn: 'UAE', region: 'levant_gulf', lat: 25.2048, lng: 55.2708, method: 'dubai' },
  { id: 'abudhabi', nameAr: 'أبوظبي', nameEn: 'Abu Dhabi', countryAr: 'الإمارات', countryEn: 'UAE', region: 'levant_gulf', lat: 24.4539, lng: 54.3773, method: 'dubai' },
  { id: 'doha', nameAr: 'الدوحة', nameEn: 'Doha', countryAr: 'قطر', countryEn: 'Qatar', region: 'levant_gulf', lat: 25.2854, lng: 51.531, method: 'qatar' },
  { id: 'kuwait', nameAr: 'مدينة الكويت', nameEn: 'Kuwait City', countryAr: 'الكويت', countryEn: 'Kuwait', region: 'levant_gulf', lat: 29.3759, lng: 47.9774, method: 'kuwait' },
  { id: 'manama', nameAr: 'المنامة', nameEn: 'Manama', countryAr: 'البحرين', countryEn: 'Bahrain', region: 'levant_gulf', lat: 26.2285, lng: 50.586, method: 'dubai' },
  { id: 'muscat', nameAr: 'مسقط', nameEn: 'Muscat', countryAr: 'عُمان', countryEn: 'Oman', region: 'levant_gulf', lat: 23.588, lng: 58.3829, method: 'dubai' },
  { id: 'sanaa', nameAr: 'صنعاء', nameEn: "Sana'a", countryAr: 'اليمن', countryEn: 'Yemen', region: 'levant_gulf', lat: 15.3694, lng: 44.191, method: 'ummAlQura' },

  // Egypt, Sudan & North Africa
  { id: 'cairo', nameAr: 'القاهرة', nameEn: 'Cairo', countryAr: 'مصر', countryEn: 'Egypt', region: 'north_africa', lat: 30.0444, lng: 31.2357, method: 'egyptian' },
  { id: 'alexandria', nameAr: 'الإسكندرية', nameEn: 'Alexandria', countryAr: 'مصر', countryEn: 'Egypt', region: 'north_africa', lat: 31.2001, lng: 29.9187, method: 'egyptian' },
  { id: 'khartoum', nameAr: 'الخرطوم', nameEn: 'Khartoum', countryAr: 'السودان', countryEn: 'Sudan', region: 'north_africa', lat: 15.5007, lng: 32.5599, method: 'egyptian' },
  { id: 'tripoli', nameAr: 'طرابلس', nameEn: 'Tripoli', countryAr: 'ليبيا', countryEn: 'Libya', region: 'north_africa', lat: 32.8872, lng: 13.1913, method: 'egyptian' },
  { id: 'tunis', nameAr: 'تونس', nameEn: 'Tunis', countryAr: 'تونس', countryEn: 'Tunisia', region: 'north_africa', lat: 36.8065, lng: 10.1815, method: 'muslimWorldLeague' },
  { id: 'algiers', nameAr: 'الجزائر', nameEn: 'Algiers', countryAr: 'الجزائر', countryEn: 'Algeria', region: 'north_africa', lat: 36.7538, lng: 3.0588, method: 'muslimWorldLeague' },
  { id: 'rabat', nameAr: 'الرباط', nameEn: 'Rabat', countryAr: 'المغرب', countryEn: 'Morocco', region: 'north_africa', lat: 34.0209, lng: -6.8416, method: 'muslimWorldLeague' },
  { id: 'casablanca', nameAr: 'الدار البيضاء', nameEn: 'Casablanca', countryAr: 'المغرب', countryEn: 'Morocco', region: 'north_africa', lat: 33.5731, lng: -7.5898, method: 'muslimWorldLeague' },
  { id: 'nouakchott', nameAr: 'نواكشوط', nameEn: 'Nouakchott', countryAr: 'موريتانيا', countryEn: 'Mauritania', region: 'north_africa', lat: 18.0735, lng: -15.9582, method: 'muslimWorldLeague' },

  // Turkey & Asia
  { id: 'istanbul', nameAr: 'إسطنبول', nameEn: 'Istanbul', countryAr: 'تركيا', countryEn: 'Turkey', region: 'asia_turkey', lat: 41.0082, lng: 28.9784, method: 'turkey' },
  { id: 'ankara', nameAr: 'أنقرة', nameEn: 'Ankara', countryAr: 'تركيا', countryEn: 'Turkey', region: 'asia_turkey', lat: 39.9334, lng: 32.8597, method: 'turkey' },
  { id: 'jakarta', nameAr: 'جاكرتا', nameEn: 'Jakarta', countryAr: 'إندونيسيا', countryEn: 'Indonesia', region: 'asia_turkey', lat: -6.2088, lng: 106.8456, method: 'singapore' },
  { id: 'kualalumpur', nameAr: 'كوالالمبور', nameEn: 'Kuala Lumpur', countryAr: 'ماليزيا', countryEn: 'Malaysia', region: 'asia_turkey', lat: 3.139, lng: 101.6869, method: 'singapore' },
  { id: 'karachi', nameAr: 'كراتشي', nameEn: 'Karachi', countryAr: 'باكستان', countryEn: 'Pakistan', region: 'asia_turkey', lat: 24.8607, lng: 67.0011, method: 'karachi' },
  { id: 'islamabad', nameAr: 'إسلام آباد', nameEn: 'Islamabad', countryAr: 'باكستان', countryEn: 'Pakistan', region: 'asia_turkey', lat: 33.6844, lng: 73.0479, method: 'karachi' },
  { id: 'dhaka', nameAr: 'دكا', nameEn: 'Dhaka', countryAr: 'بنغلاديش', countryEn: 'Bangladesh', region: 'asia_turkey', lat: 23.8103, lng: 90.4125, method: 'karachi' },

  // Europe, Americas & Oceania
  { id: 'london', nameAr: 'لندن', nameEn: 'London', countryAr: 'المملكة المتحدة', countryEn: 'United Kingdom', region: 'europe_americas', lat: 51.5072, lng: -0.1276, method: 'muslimWorldLeague' },
  { id: 'paris', nameAr: 'باريس', nameEn: 'Paris', countryAr: 'فرنسا', countryEn: 'France', region: 'europe_americas', lat: 48.8566, lng: 2.3522, method: 'muslimWorldLeague' },
  { id: 'berlin', nameAr: 'برلين', nameEn: 'Berlin', countryAr: 'ألمانيا', countryEn: 'Germany', region: 'europe_americas', lat: 52.52, lng: 13.405, method: 'turkey' },
  { id: 'amsterdam', nameAr: 'أمستردام', nameEn: 'Amsterdam', countryAr: 'هولندا', countryEn: 'Netherlands', region: 'europe_americas', lat: 52.3676, lng: 4.9041, method: 'muslimWorldLeague' },
  { id: 'madrid', nameAr: 'مدريد', nameEn: 'Madrid', countryAr: 'إسبانيا', countryEn: 'Spain', region: 'europe_americas', lat: 40.4168, lng: -3.7038, method: 'muslimWorldLeague' },
  { id: 'newyork', nameAr: 'نيويورك', nameEn: 'New York', countryAr: 'الولايات المتحدة', countryEn: 'United States', region: 'europe_americas', lat: 40.7128, lng: -74.006, method: 'northAmerica' },
  { id: 'chicago', nameAr: 'شيكاغو', nameEn: 'Chicago', countryAr: 'الولايات المتحدة', countryEn: 'United States', region: 'europe_americas', lat: 41.8781, lng: -87.6298, method: 'northAmerica' },
  { id: 'toronto', nameAr: 'تورونتو', nameEn: 'Toronto', countryAr: 'كندا', countryEn: 'Canada', region: 'europe_americas', lat: 43.6532, lng: -79.3832, method: 'northAmerica' },
  { id: 'sydney', nameAr: 'سيدني', nameEn: 'Sydney', countryAr: 'أستراليا', countryEn: 'Australia', region: 'europe_americas', lat: -33.8688, lng: 151.2093, method: 'muslimWorldLeague' },
];

export const CALCULATION_METHOD_LABELS: Record<PrayerMethodKey, { ar: string; en: string }> = {
  ummAlQura: { ar: 'أم القرى (مكة)', en: 'Umm Al-Qura (Makkah)' },
  egyptian: { ar: 'الهيئة المصرية العامة للمساحة', en: 'Egyptian General Authority' },
  dubai: { ar: 'دبي / الإمارات وعُمان والبحرين', en: 'Dubai / UAE, Oman & Bahrain' },
  kuwait: { ar: 'الكويت (الأوقاف)', en: 'Kuwait' },
  qatar: { ar: 'قطر (التقويم القطري)', en: 'Qatar' },
  muslimWorldLeague: { ar: 'رابطة العالم الإسلامي', en: 'Muslim World League' },
  turkey: { ar: 'رئاسة الشؤون الدينية التركية (ديانت)', en: 'Diyanet (Turkey & Europe)' },
  karachi: { ar: 'جامعة العلوم الإسلامية (كراتشي)', en: 'Karachi (South Asia)' },
  singapore: { ar: 'سنغافورة وإندونيسيا وماليزيا', en: 'Singapore / Southeast Asia' },
  northAmerica: { ar: 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)', en: 'ISNA (North America)' },
};

export function inferMethodFromCountryCode(countryCode?: string): PrayerMethodKey {
  const code = (countryCode || '').trim().toUpperCase();
  if (code === 'SA' || code === 'YE') return 'ummAlQura';
  if (code === 'EG' || code === 'SD' || code === 'LY') return 'egyptian';
  if (code === 'KW') return 'kuwait';
  if (code === 'QA') return 'qatar';
  if (code === 'AE' || code === 'BH' || code === 'OM') return 'dubai';
  if (code === 'TR') return 'turkey';
  if (code === 'PK' || code === 'IN' || code === 'BD' || code === 'AF') return 'karachi';
  if (code === 'ID' || code === 'MY' || code === 'SG' || code === 'BN') return 'singapore';
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
  activePrayerNowName: string | null;
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
      : methodKey === 'kuwait'
      ? CalculationMethod.Kuwait()
      : methodKey === 'qatar'
      ? CalculationMethod.Qatar()
      : methodKey === 'karachi'
      ? CalculationMethod.Karachi()
      : methodKey === 'turkey'
      ? CalculationMethod.Turkey()
      : methodKey === 'singapore'
      ? CalculationMethod.Singapore()
      : CalculationMethod.UmmAlQura();

  const nowMs = now.getTime();
  const pt = new PrayerTimes(coords, now, params);
  const tomorrow = new Date(nowMs + 86400000);
  const tomorrowPt = new PrayerTimes(coords, tomorrow, params);

  const orderedToday: Array<{ name: string; time: Date }> = [
    { name: 'fajr', time: pt.fajr },
    { name: 'sunrise', time: pt.sunrise },
    { name: 'dhuhr', time: pt.dhuhr },
    { name: 'asr', time: pt.asr },
    { name: 'maghrib', time: pt.maghrib },
    { name: 'isha', time: pt.isha },
    { name: 'fajr', time: tomorrowPt.fajr },
  ];

  // Detect if a prayer just arrived within the last 60 seconds
  let activePrayerNowName: string | null = null;
  for (const candidate of orderedToday.slice(0, 6)) {
    if (candidate.name === 'sunrise') continue;
    const elapsed = nowMs - candidate.time.getTime();
    if (elapsed >= 0 && elapsed < 60000) {
      activePrayerNowName = candidate.name;
      break;
    }
  }

  // Strictly choose the next prayer whose timestamp is > nowMs
  const upcoming =
    orderedToday.find((item) => item.time.getTime() > nowMs) || {
      name: 'fajr',
      time: tomorrowPt.fajr,
    };

  return {
    fajr: pt.fajr,
    sunrise: pt.sunrise,
    dhuhr: pt.dhuhr,
    asr: pt.asr,
    maghrib: pt.maghrib,
    isha: pt.isha,
    nextPrayerName: upcoming.name,
    nextPrayerTime: upcoming.time,
    activePrayerNowName,
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
