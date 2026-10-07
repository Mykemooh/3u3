/** @type {import('next').NextConfig} */
// Hosts that only send cleaners to the cleaner app (e.g. trashcancleaning.app),
// on the main address (NEXTAUTH_URL), where they sign in once and add
// "TrashCan Crew" to their home screen (app/crew/layout.tsx).
const CREW_HOSTS = (process.env.CREW_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const RAW_ORIGIN = (process.env.NEXTAUTH_URL || '').trim().replace(/\/+$/, '');
// NEXTAUTH_URL is sometimes set as a bare hostname; links need the scheme.
const APP_ORIGIN = RAW_ORIGIN && !/^https?:\/\//.test(RAW_ORIGIN) ? `https://${RAW_ORIGIN}` : RAW_ORIGIN;

const nextConfig = {
  async redirects() {
    if (!CREW_HOSTS.length || !/^https?:\/\//.test(APP_ORIGIN)) return [];
    return CREW_HOSTS.flatMap((host) => [
      { source: '/crew/:path*', has: [{ type: 'host', value: host }], destination: `${APP_ORIGIN}/crew/:path*`, permanent: false },
      { source: '/:path*', has: [{ type: 'host', value: host }], destination: `${APP_ORIGIN}/crew`, permanent: false },
    ]);
  },
  // The address picker (components/AddressInput.tsx) calls Mapbox from the
  // browser, so it needs the public token client-side. Mirroring it here
  // means MAPBOX_ACCESS_TOKEN stays the only variable to set.
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || '',
  },
  experimental: {
    serverComponentsExternalPackages: ['pg'],
    // instrumentation.ts: Sentry error capture when SENTRY_DSN is set.
    instrumentationHook: true,
  },
  images: {
    // AVIF first, then WebP, then the original. These photos are large
    // areas of smooth wall, counter and linen, which is exactly what AVIF
    // compresses best. Measured on the bathroom photo at a phone width:
    // 37 KB as JPEG, 20 KB as AVIF — a 46% saving per image, on a page
    // that carries nine of them.
    formats: ['image/avif', 'image/webp'],
    // Next's default largest candidate is 3840px. Every source here is
    // 1600px or narrower, so a 3840 entry can only ever return the source
    // unchanged — while still tempting a browser to pick the biggest
    // entry in the srcset when it resolves `sizes` before layout settles.
    // Capping the list keeps the worst case honest.
    deviceSizes: [390, 640, 750, 828, 1080, 1200, 1600],
    imageSizes: [256, 384, 560],
  },
};

module.exports = nextConfig;
