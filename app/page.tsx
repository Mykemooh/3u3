import Link from 'next/link';
import Logo from '@/components/Logo';

// Welcome & entry (PRD 6.1): exactly two primary paths, no other choices,
// so the branch point stays unambiguous. A looping background video was
// specced but no asset is available here — a subtle animated gradient
// stands in for it and can be swapped for <video> later.
export default function WelcomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-ink text-white flex flex-col items-center justify-between px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 20% 20%, rgba(210,150,30,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(138,109,29,0.3), transparent 50%)',
        }}
      />

      <div className="relative flex-1 flex flex-col items-center justify-center text-center">
        <Logo variant="light" size="lg" />
        <p className="mt-4 max-w-xs text-sm italic text-white/70">
          Family Owned by Parents of Three boys, Built in Texas
        </p>
      </div>

      <div className="relative w-full max-w-sm space-y-3">
        <Link href="/signin" className="btn-primary w-full text-base">
          I'm a returning customer
        </Link>
        <Link href="/new" className="btn-secondary w-full !bg-transparent !border-white/25 !text-white text-base hover:!border-gold hover:!text-gold">
          I'm new here
        </Link>
      </div>

      <div className="relative mt-8 flex gap-4 text-xs text-white/30">
        <Link href="/signin?role=crew" className="hover:text-white/60">
          Crew sign-in
        </Link>
        <span>·</span>
        <Link href="/signin?role=admin" className="hover:text-white/60">
          Admin sign-in
        </Link>
      </div>
    </main>
  );
}
