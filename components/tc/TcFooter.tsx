import Link from 'next/link';
import TcLogo from '@/components/tc/TcLogo';
import type { TcNav } from '@/lib/tc/site';

/** TrashCan's footer — the same on every TrashCan page. */
export default function TcFooter({ nav }: { nav: TcNav }) {
  const cols: { title: string; links: [string, string][] }[] = [
    {
      title: 'Product',
      links: [
        ['Features', nav.features],
        ['Pricing', nav.pricing],
        ['Crew app', `${nav.features}#clean`],
        ['Tex, the AI receptionist', `${nav.features}#win`],
      ],
    },
    {
      title: 'Company',
      links: [
        ['Resources', nav.resources],
        ['System status', '/status'],
        ['Get started free', '/start'],
        ['Log in', '/signin?platform=1'],
      ],
    },
    {
      title: 'Legal',
      links: [
        ['Terms', '/terms'],
        ['Privacy', '/privacy'],
      ],
    },
  ];
  return (
    <footer className="tc-dark border-t border-white/10">
      <div className="mx-auto max-w-[1280px] px-4 pb-10 pt-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <TcLogo on="dark" />
            <p className="mt-4 max-w-[30ch] text-[15px] leading-relaxed text-white/60">The operating system for cleaning businesses. Built in Katy, Texas, by a cleaning company that runs on it every day.</p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-[13px] font-semibold text-white">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-[14px] text-white/60 transition-colors hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-[13px] text-white/45">
          <span>© {new Date().getFullYear()} TRASHCAN. Cleaning business, cleaned up.</span>
          <span>Made in Texas</span>
        </div>
      </div>
    </footer>
  );
}
