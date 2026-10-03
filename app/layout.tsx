import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import BrandWatermark from '@/components/BrandWatermark';

/**
 * Two faces, per the brand book: Inter for body/UI text, Plus Jakarta Sans
 * for headings and display type (its rounded, geometric letterforms are
 * the brand's "Bold / Rounded / Modern" heading spec — Inter reads more
 * neutral at display sizes). next/font self-hosts both at build time, so
 * neither costs a font-CDN request or late-swapping layout shift.
 * --font-sans is Inter; --font-display is Plus Jakarta Sans, falling back
 * to --font-sans if it somehow fails to load.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '3U3 Cleaning — House cleaning in Katy & Houston',
  description:
    'Family owned, built in Texas. Standard, deep and move-in/move-out cleaning. A real person confirms your exact price at your door.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>
        <BrandWatermark />
        <div className="relative z-10">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
