import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import Providers from './providers';
import BrandWatermark from '@/components/BrandWatermark';
import TexWidget from '@/components/TexWidget';
import ErrorReporter from '@/components/ErrorReporter';
import { getTenant } from '@/lib/data';
import { isHouseBrand } from '@/lib/brand';

/**
 * Two faces, per the brand book: Inter for body/UI text, Plus Jakarta Sans
 * for headings and display type (its rounded, geometric letterforms are
 * the brand's "Bold / Rounded / Modern" heading spec — Inter reads more
 * neutral at display sizes). next/font self-hosts both at build time, so
 * neither costs a font-CDN request or late-swapping layout shift.
 * --font-sans is Inter; --font-display is Plus Jakarta Sans, falling back
 * to --font-sans if it somehow fails to load.
 */
// All three faces are self-hosted from @fontsource-variable packages (latin
// subset, variable weight), so builds never depend on reaching Google Fonts.
const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-sans',
  display: 'swap',
});
const jakarta = localFont({
  src: '../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-display',
  display: 'swap',
});

// TrashCan's display face (docs/brand/trashcan-guidelines.md). The guide
// names Satoshi, which is distributed by Fontshare rather than Google Fonts;
// Manrope (self-hosted from @fontsource-variable/manrope) is the closest
// open geometric grotesk and stands in until the Satoshi files are added
// (see docs/brand/trashcan-guidelines.md → Fonts).
const tcDisplay = localFont({
  src: '../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-tc-display',
  display: 'swap',
});

const HOUSE_METADATA: Metadata = {
  title: '3U3 Cleaning — House cleaning in Katy & Houston',
  description:
    'Family owned, built in Texas. Standard, deep and move-in/move-out cleaning. A real person confirms your exact price at your door.',
};

// The fallback tab title for any page without its own: the company this
// visitor or signed-in user belongs to — never 3U3's on another company's
// portal.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant().catch(() => undefined);
  if (!tenant || isHouseBrand(tenant)) return HOUSE_METADATA;
  return { title: tenant.isPlatform ? 'TRASHCAN' : tenant.name, description: tenant.tagline ?? undefined };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} ${tcDisplay.variable}`}>
      <body>
        <BrandWatermark />
        <div className="relative z-10">
          <Providers>
            {children}
            <TexWidget />
            {process.env.SENTRY_DSN ? <ErrorReporter /> : null}
          </Providers>
        </div>
      </body>
    </html>
  );
}
