import Link from 'next/link';
import Image from 'next/image';

// Native pixel sizes of the upscaled (3x + Lanczos) mark pieces — see
// public/brand/mark-*.png. Displayed well below their native size, so
// they stay crisp even at 2x/3x device pixel ratios ("hyper resolution").
// The container height scales down on small screens (the full 3x size —
// 246px, three times the old header-scale logo — is for md+ only, since
// it's wider than a phone viewport at full size); the U's width tracks
// each breakpoint's height at the same aspect ratio.
const LEFT_3 = { w: 633, h: 624 };
const RIGHT_3 = { w: 630, h: 624 };

export default function WelcomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center overflow-x-hidden bg-white px-6 py-20 text-center">
      <div
        role="img"
        aria-label="3U3 Cleaning"
        className="flex h-[110px] items-center justify-center sm:h-[170px] md:h-[246px]"
      >
        <Image
          src="/brand/mark-3-left.png"
          alt=""
          width={LEFT_3.w}
          height={LEFT_3.h}
          priority
          className="h-full w-auto select-none"
          aria-hidden="true"
        />
        <div
          className="u-gradient-mask h-full w-[116px] shrink-0 sm:w-[179px] md:w-[260px]"
          aria-hidden="true"
        />
        <Image
          src="/brand/mark-3-right.png"
          alt=""
          width={RIGHT_3.w}
          height={RIGHT_3.h}
          priority
          className="h-full w-auto select-none"
          aria-hidden="true"
        />
      </div>

      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.14em] text-slate">
        Clean spaces. Brighter days.
      </p>

      <div className="mt-12 flex flex-col gap-3 sm:flex-row">
        <Link href="/new" className="btn-primary">
          Get a free quote
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/signin" className="btn-secondary">
          Sign in
        </Link>
      </div>

      <div className="relative mx-auto mt-24 max-w-sm overflow-hidden py-2">
        <p className="text-center text-lg font-semibold text-ink">Come on, commit to something!</p>
        <span
          className="broom-sweep pointer-events-none absolute top-1/2 -translate-y-1/2 text-2xl"
          aria-hidden="true"
        >
          🧹
        </span>
      </div>
    </main>
  );
}
