import { AppTab } from '../types/nour';

export const SITE_ORIGIN = 'https://nouralqran.vercel.app';

export interface PublicRouteMeta {
  path: '/' | '/quran' | '/tafsir' | '/recitations' | '/adhkar' | '/prayer-times' | '/privacy-policy';
  tab: AppTab;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  canonical: string;
  h1Ar: string;
  h1En: string;
}

export const PUBLIC_ROUTES: PublicRouteMeta[] = [
  {
    path: '/',
    tab: 'home',
    titleAr: 'نور — رفيق القرآن الكريم | Nour Quran Companion',
    titleEn: 'Nour — Quran Companion | نور للقرآن الكريم',
    descriptionAr:
      'نور هو رفيقك للقرآن الكريم: مصحف المدينة، التفسير، التلاوات، الحفظ، خطة الختمة، الأذكار، مواقيت الصلاة والقبلة.',
    canonical: `${SITE_ORIGIN}/`,
    h1Ar: 'نور — رفيق القرآن الكريم',
    h1En: 'Nour — Quran Companion',
  },
  {
    path: '/quran',
    tab: 'quran',
    titleAr: 'القرآن الكريم ومصحف المدينة — نور | Nour',
    titleEn: 'The Holy Quran & Madina Mushaf — Nour',
    descriptionAr:
      'اقرأ القرآن الكريم كاملاً برسم مصحف المدينة مع التلوين التجويدي، التصفح بالسور والأجزاء، وحفظ العلامات المرجعية دون إنترنت.',
    canonical: `${SITE_ORIGIN}/quran`,
    h1Ar: 'القرآن الكريم ومصحف المدينة',
    h1En: 'The Holy Quran & Madina Mushaf',
  },
  {
    path: '/tafsir',
    tab: 'quran',
    titleAr: 'التفسير الميسر وتفسير السعدي — نور | Nour',
    titleEn: 'Quran Tafsir Al-Muyassar & Al-Saadi — Nour',
    descriptionAr:
      'اقرأ آيات القرآن الكريم مع التفسير الميسر وتفسير السعدي وتأمل معاني الآيات مع إمكانية الاستماع والحفظ.',
    canonical: `${SITE_ORIGIN}/tafsir`,
    h1Ar: 'التفسير الميسر وتفسير السعدي',
    h1En: 'Quran Tafsir — Al-Muyassar & Al-Saadi',
  },
  {
    path: '/recitations',
    tab: 'listen',
    titleAr: 'الاستماع إلى التلاوات القرآنية — نور | Nour',
    titleEn: 'Quran Audio Recitations & Live Radios — Nour',
    descriptionAr:
      'استمع إلى تلاوات القرآن الكريم بأصوات أشهر القراء بمختلف الروايات مع الإذاعات القرآنية المباشرة والتحميل للاستماع دون إنترنت.',
    canonical: `${SITE_ORIGIN}/recitations`,
    h1Ar: 'الاستماع إلى التلاوات القرآنية',
    h1En: 'Quran Audio Recitations & Live Radios',
  },
  {
    path: '/adhkar',
    tab: 'worship',
    titleAr: 'الأذكار اليومية والسبحة الإلكترونية — نور | Nour',
    titleEn: 'Daily Adhkar & Digital Tasbih — Nour',
    descriptionAr:
      'أذكار الصباح والمساء اليومية مع عدادات متابعة مرئية والسبحة الإلكترونية التفاعلية في تطبيق نور.',
    canonical: `${SITE_ORIGIN}/adhkar`,
    h1Ar: 'الأذكار اليومية والسبحة الإلكترونية',
    h1En: 'Daily Adhkar & Digital Tasbih',
  },
  {
    path: '/prayer-times',
    tab: 'worship',
    titleAr: 'مواقيت الصلاة واتجاه القبلة — نور | Nour',
    titleEn: 'Accurate Prayer Times & Qibla Compass — Nour',
    descriptionAr:
      'اعرف مواقيت الصلاة الدقيقة حسب موقعك الجغرافي مع بوصلة القبلة المباشرة ولوحة إشعارات الصلاة في تطبيق نور.',
    canonical: `${SITE_ORIGIN}/prayer-times`,
    h1Ar: 'مواقيت الصلاة واتجاه القبلة',
    h1En: 'Prayer Times & Qibla Compass',
  },
  {
    path: '/privacy-policy',
    tab: 'home',
    titleAr: 'سياسة الخصوصية — تطبيق نور للقرآن الكريم | Nour Privacy Policy',
    titleEn: 'Privacy Policy — Nour Quran Companion',
    descriptionAr:
      'تعرف على سياسة الخصوصية في تطبيق نور للقرآن الكريم: حماية البيانات، التخزين المحلي، بيانات الموقع، والتلاوات الصوتية.',
    canonical: `${SITE_ORIGIN}/privacy-policy`,
    h1Ar: 'سياسة الخصوصية',
    h1En: 'Privacy Policy',
  },
];

export function normalizePathname(rawPath: string): string {
  const clean = (rawPath || '/').split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase();
  return clean || '/';
}

export function matchPublicRoute(pathname: string): PublicRouteMeta | null {
  const norm = normalizePathname(pathname);
  return PUBLIC_ROUTES.find((r) => r.path === norm) || null;
}

export function getTabDefaultPath(tab: AppTab): string {
  switch (tab) {
    case 'home':
      return '/';
    case 'quran':
      return '/quran';
    case 'listen':
      return '/recitations';
    case 'worship':
      return '/prayer-times';
    case 'profile':
      return '/';
  }
}

export function isAdminRoutePath(pathname: string, hash: string): boolean {
  const norm = normalizePathname(pathname);
  const h = (hash || '').replace(/\/+$/, '').toLowerCase();
  return norm === '/admin' || h === '#/admin' || h === '#admin';
}

export function applyRouteDocumentMeta(pathname: string, isAdmin: boolean, isNotFound: boolean): void {
  if (typeof document === 'undefined') return;

  let robotsMeta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
  if (isAdmin || isNotFound) {
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.name = 'robots';
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.content = 'noindex, nofollow';
    if (isNotFound) {
      document.title = 'الصفحة غير موجودة (404) — نور | Nour';
    } else {
      document.title = 'لوحة تحكم المشرف — نور';
    }
    return;
  }

  if (robotsMeta) {
    robotsMeta.remove();
  }

  const route = matchPublicRoute(pathname) || PUBLIC_ROUTES[0];
  document.title = route.titleAr;

  const descEl = document.querySelector('meta[name="description"]');
  if (descEl) descEl.setAttribute('content', route.descriptionAr);

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) canonicalEl.setAttribute('href', route.canonical);

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', route.titleAr);

  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', route.descriptionAr);

  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', route.canonical);
}
