import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';
import BrandWatermark from '@/components/BrandWatermark';

/**
 * The whole site used to render in Times New Roman. tailwind.config.ts asked
 * for `var(--font-sans)`, nothing ever defined it, and an undefined custom
 * property makes the entire font-family declaration invalid at computed-value
 * time — so the browser fell back to its default serif rather than to the
 * `system-ui, sans-serif` written right beside it. --font-sans is now defined
 * in globals.css.
 *
 * It resolves to a system stack rather than a downloaded webfont on purpose:
 * no build-time dependency on a font CDN (a fetch failure there fails the
 * whole deploy), no flash of unstyled text, nothing extra for a phone on
 * cellular to download, and on Apple devices it renders as SF Pro. If a
 * distinctive brand typeface is wanted later, self-host the files and change
 * the one variable.
 */
export const metadata: Metadata = {
  title: '3U3 Cleaning — House cleaning in Katy & Houston',
  description:
    'Family owned, built in Texas. Standard, deep and move-in/move-out cleaning. A real person confirms your exact price at your door.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BrandWatermark />
        <div className="relative z-10">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
