import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import BrandWatermark from '@/components/BrandWatermark';

/**
 * Inter, not the system-UI stack this used to resolve to. next/font
 * self-hosts the font files at build time and serves them from this same
 * domain — the two things the old system-stack choice was specifically
 * avoiding (a font-CDN dependency at request time, and layout shift from
 * a webfont swapping in late) don't actually apply to next/font, since it
 * downloads once at build and ships a size-adjusted fallback for the gap
 * before the real font paints. --font-sans now resolves to Inter first,
 * falling back to the same system stack if it somehow fails to load.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: '3U3 Cleaning — House cleaning in Katy & Houston',
  description:
    'Family owned, built in Texas. Standard, deep and move-in/move-out cleaning. A real person confirms your exact price at your door.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <BrandWatermark />
        <div className="relative z-10">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
