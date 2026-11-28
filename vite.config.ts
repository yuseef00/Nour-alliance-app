import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import type {IncomingMessage, ServerResponse} from 'http';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const SITE_ORIGIN = 'https://nouralqran.vercel.app';

interface PrerenderRoute {
  route: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  noindex?: boolean;
}

const PRERENDER_ROUTES: PrerenderRoute[] = [
  {
    route: 'quran',
    title: 'القرآن الكريم ومصحف المدينة — نور | Nour',
    description:
      'اقرأ القرآن الكريم كاملاً برسم مصحف المدينة مع التلوين التجويدي، التصفح بالسور والأجزاء، وحفظ العلامات المرجعية دون إنترنت.',
    h1: 'القرآن الكريم ومصحف المدينة',
    lead: 'قراءة القرآن الكريم برسم مصحف المدينة النبوية، التلوين التجويدي، البحث الفوري في الآيات، ومتابعة الختمة اليومية.',
  },
  {
    route: 'tafsir',
    title: 'التفسير الميسر وتفسير السعدي — نور | Nour',
    description:
      'اقرأ آيات القرآن الكريم مع التفسير الميسر وتفسير السعدي وتأمل معاني الآيات مع إمكانية الاستماع والحفظ.',
    h1: 'التفسير الميسر وتفسير السعدي',
    lead: 'تدبر معاني كتاب الله عبر التفسير الميسر وتفسير الشيخ عبدالرحمن السعدي مع حفظ الملاحظات والعلامات المرجعية.',
  },
  {
    route: 'recitations',
    title: 'الاستماع إلى التلاوات القرآنية — نور',
    description:
      'استمع إلى تلاوات القرآن الكريم بأصوات مجموعة كبيرة من القراء، واختر الرواية والسورة واحفظ التلاوات للاستماع بدون إنترنت.',
    h1: 'الاستماع إلى التلاوات القرآنية',
    lead: 'مكتبة تلاوات قرآنية بأصوات مئات القراء بمختلف الروايات مع إذاعات القرآن الكريم المباشرة والتشغيل دون اتصال.',
  },
  {
    route: 'library',
    title: 'المكتبة والتنزيلات وبوصلة القبلة — نور | Nour',
    description:
      'مكتبتك الشخصية للقرآن الكريم: آخر آية مستمع لها، جميع السور والآيات وصفحات المصحف المحفوظة دون إنترنت، وبوصلة القبلة الدقيقة.',
    h1: 'المكتبة والتنزيلات وبوصلة القبلة',
    lead: 'إدارة تنزيلات القرآن الكريم والسور والآيات للاستماع دون إنترنت، مع آخر آية مستمع لها وبوصلة القبلة.',
  },
  {
    route: 'adhkar',
    title: 'الأذكار اليومية والسبحة الإلكترونية — نور | Nour',
    description:
      'أذكار الصباح والمساء اليومية مع عدادات متابعة مرئية والسبحة الإلكترونية التفاعلية في تطبيق نور.',
    h1: 'الأذكار اليومية والسبحة الإلكترونية',
    lead: 'أذكار الصباح والمساء الموثقة مع عدادات تفاعلية لإتمام الورد اليومي والسبحة الإلكترونية.',
  },
  {
    route: 'prayer-times',
    title: 'مواقيت الصلاة واتجاه القبلة — نور | Nour',
    description:
      'اعرف مواقيت الصلاة الدقيقة حسب موقعك الجغرافي مع بوصلة القبلة المباشرة ولوحة إشعارات الصلاة في تطبيق نور.',
    h1: 'مواقيت الصلاة واتجاه القبلة',
    lead: 'حساب دقيق لمواقيت الصلاة حسب موقعك الجغرافي مع بوصلة القبلة الحية ولوحة إشعارات الصلاة.',
  },
  {
    route: 'admin',
    title: 'لوحة تحكم المشرف — نور',
    description: 'لوحة إدارة تطبيق نور.',
    h1: 'لوحة تحكم المشرف — نور',
    lead: 'إدارة الإحصائيات ومظهر التطبيق.',
    noindex: true,
  },
  {
    route: 'privacy-policy',
    title: 'سياسة الخصوصية — تطبيق نور للقرآن الكريم | Nour Privacy Policy',
    description:
      'تعرف على سياسة الخصوصية في تطبيق نور للقرآن الكريم: حماية البيانات الشخصية، التخزين المحلي، بيانات الموقع، والتلاوات الصوتية.',
    h1: 'سياسة الخصوصية',
    lead: 'سياسة الخصوصية وحماية بيانات المستخدمين في تطبيق نور للقرآن الكريم ومسؤوليتنا تجاه خصوصيتك.',
  },
];

const VALID_SPA_PATHS = new Set([
  '/',
  '/quran',
  '/tafsir',
  '/recitations',
  '/library',
  '/adhkar',
  '/prayer-times',
  '/admin',
  '/privacy-policy',
]);

function normalizeReqPathname(rawUrl: string | undefined): string {
  const pathPart = (rawUrl || '/').split('?')[0].split('#')[0];
  try {
    const decoded = decodeURIComponent(pathPart);
    return decoded.replace(/\/+$/, '').toLowerCase() || '/';
  } catch {
    return pathPart.replace(/\/+$/, '').toLowerCase() || '/';
  }
}

function isStaticOrViteInternal(rawPath: string): boolean {
  if (
    rawPath.startsWith('/@') ||
    rawPath.startsWith('/src/') ||
    rawPath.startsWith('/node_modules/') ||
    rawPath.startsWith('/assets/') ||
    rawPath.startsWith('/api/')
  ) {
    return true;
  }
  return /\.(js|mjs|cjs|ts|tsx|jsx|css|png|jpg|jpeg|webp|gif|svg|ico|json|webmanifest|woff|woff2|ttf|map|txt|xml|mp3|wav|ogg)$/i.test(
    rawPath
  );
}

function createSeoMiddleware(basePublicDir: string, isPreview: boolean) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    const normPath = normalizeReqPathname(req.url);

    if (normPath === '/robots.txt') {
      const filePath = path.join(basePublicDir, 'robots.txt');
      if (fs.existsSync(filePath)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(fs.readFileSync(filePath, 'utf-8'));
        return;
      }
    }

    if (normPath === '/sitemap.xml') {
      const filePath = path.join(basePublicDir, 'sitemap.xml');
      if (fs.existsSync(filePath)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.end(fs.readFileSync(filePath, 'utf-8'));
        return;
      }
    }

    if (normPath === '/.well-known/assetlinks.json' || normPath === '/well-known/assetlinks.json') {
      const filePath = path.join(basePublicDir, '.well-known', 'assetlinks.json');
      if (fs.existsSync(filePath)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(fs.readFileSync(filePath, 'utf-8'));
        return;
      }
    }

    if (isStaticOrViteInternal(normPath)) {
      next();
      return;
    }

    if (VALID_SPA_PATHS.has(normPath)) {
      if (isPreview && normPath !== '/') {
        const subHtml = path.join(basePublicDir, normPath.slice(1), 'index.html');
        if (fs.existsSync(subHtml)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          if (normPath === '/admin') {
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
          }
          res.end(fs.readFileSync(subHtml, 'utf-8'));
          return;
        }
      }
      next();
      return;
    }

    // Real HTTP 404 for unknown routes (never Soft 404)
    const file404 = path.join(basePublicDir, '404.html');
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (fs.existsSync(file404)) {
      res.end(fs.readFileSync(file404, 'utf-8'));
    } else {
      res.end('<!doctype html><html lang="ar" dir="rtl"><head><meta name="robots" content="noindex, nofollow"><title>404</title></head><body><h1>404 - الصفحة غير موجودة</h1></body></html>');
    }
  };
}

function renderRouteHtml(baseHtml: string, item: PrerenderRoute): string {
  const canonicalUrl = `${SITE_ORIGIN}/${item.route}`;
  let html = baseHtml;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${item.title}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${item.description}" />`
  );
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${canonicalUrl}" />`
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${item.title}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${item.description}" />`
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${canonicalUrl}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${item.title}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${item.description}" />`
  );

  if (item.noindex) {
    html = html.replace(
      /<\/head>/i,
      `  <meta name="robots" content="noindex, nofollow" />\n  </head>`
    );
  }

  html = html.replace(
    /<h1[^>]*>[\s\S]*?<\/h1>/i,
    `<h1 style="margin:0;font-size:30px;font-weight:700;color:#f7f3ea;font-family:'Amiri','Cairo',serif;">${item.h1}</h1>`
  );
  html = html.replace(
    /<p style="margin:8px 0 0;[^"]*">[\s\S]*?<\/p>/i,
    `<p style="margin:8px 0 0;font-size:14px;color:#e5c570;max-width:340px;line-height:1.7;">${item.lead}</p>`
  );

  return html;
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'og-image.png',
          'sw-prayer.js',
        ],
        manifest: {
          id: '/',
          name: 'نور — رفيق القرآن الكريم',
          short_name: 'نور',
          description:
            'نور هو رفيقك للقرآن الكريم: مصحف المدينة، التفسير، التلاوات، الحفظ، خطة الختمة، الأذكار، مواقيت الصلاة والقبلة.',
          theme_color: '#0f6b4f',
          background_color: '#f7f3ea',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          dir: 'rtl',
          lang: 'ar',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          importScripts: ['/sw-prayer.js'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff,woff2}'],
          globIgnores: ['**/robots.txt', '**/sitemap.xml', '**/404.html'],
          navigateFallback: '/index.html',
          navigateFallbackAllowlist: [
            /^\/$/,
            /^\/quran\/?$/,
            /^\/tafsir\/?$/,
            /^\/recitations\/?$/,
            /^\/library\/?$/,
            /^\/adhkar\/?$/,
            /^\/prayer-times\/?$/,
            /^\/admin\/?$/,
            /^\/privacy-policy\/?$/,
          ],
          navigateFallbackDenylist: [/^\/api\//, /^\/robots\.txt$/, /^\/sitemap\.xml$/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 12,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/api\.quran\.com\/api\/v4\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'nour-quran-api-cache',
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 1500,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/www\.mp3quran\.net\/api\/v3\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'nour-mp3quran-api-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
      {
        name: 'nour-seo-prerender-and-routing',
        configureServer(server) {
          server.middlewares.use(createSeoMiddleware(path.resolve(__dirname, 'public'), false));
        },
        configurePreviewServer(server) {
          server.middlewares.use(createSeoMiddleware(path.resolve(__dirname, 'dist'), true));
        },
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const indexHtmlPath = path.join(distDir, 'index.html');
          if (!fs.existsSync(indexHtmlPath)) return;

          const baseHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
          for (const item of PRERENDER_ROUTES) {
            const routeDir = path.join(distDir, item.route);
            fs.mkdirSync(routeDir, {recursive: true});
            fs.writeFileSync(path.join(routeDir, 'index.html'), renderRouteHtml(baseHtml, item), 'utf-8');
          }
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
