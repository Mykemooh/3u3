import { headers } from 'next/headers';
import TcSiteHeader from '@/components/tc/TcSiteHeader';
import TcFooter from '@/components/tc/TcFooter';
import { isPlatformHost, tcNav, type TcNav } from '@/lib/tc/site';

/** Links for whichever host the visitor is on (lib/tc/site.ts). */
export function getTcNav(): TcNav {
  return tcNav(isPlatformHost(headers().get('host')));
}

/**
 * The frame every TrashCan page shares: theme scope, header, footer.
 * `data-tc-surface` tells the company-site chrome (watermark, Tex bubble)
 * to stay out of the way.
 */
export default function TcSite({
  children,
  headerTone = 'dark',
  minimal = false,
  footer = true,
  className = 'bg-white',
}: {
  children: React.ReactNode;
  headerTone?: 'light' | 'dark';
  minimal?: boolean;
  footer?: boolean;
  className?: string;
}) {
  const nav = getTcNav();
  return (
    <div className={`theme-tc min-h-screen text-tc-900 ${className}`} data-tc-surface>
      <a href="#main" className="sr-only z-[60] rounded-lg bg-tc-lime px-4 py-2 font-semibold text-tc-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <TcSiteHeader nav={nav} tone={headerTone} minimal={minimal} />
      <main id="main">{children}</main>
      {footer && <TcFooter nav={nav} />}
    </div>
  );
}
