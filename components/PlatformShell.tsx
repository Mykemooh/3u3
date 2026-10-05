import Link from 'next/link';
import TrashCanMark from '@/components/TrashCanMark';

/** Header and footer for TrashCan's own pages (signup, terms, privacy, status). */
export default function PlatformShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/start" aria-label="TrashCan home"><TrashCanMark /></Link>
          <Link href="/signin?platform=1" className="text-sm font-semibold text-gold hover:underline">Sign in</Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-slate sm:px-6">
          <span>© {new Date().getFullYear()} TrashCan</span>
          <nav className="flex gap-4">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/status" className="hover:text-ink">Status</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
