/** @type {import('next').NextConfig} */
const nextConfig = {
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
