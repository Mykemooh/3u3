import fs from 'fs';
import path from 'path';
import Image from 'next/image';

/**
 * The family photo — or a deliberate stand-in until there is one.
 *
 * Same trick as HeroMedia: this checks at render time whether the file
 * exists under public/. Drop the photo in at public/images/family.jpg,
 * redeploy, and it appears. No code change, no forgotten placeholder
 * shipped to a customer by accident.
 *
 * A portrait crop is intentional. A family reads as a family at 4:5; the
 * same photo at 16:9 turns everyone into a row of small heads.
 */
const PHOTO_PATH = 'images/family.jpg';

function publicFileExists(rel: string) {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', rel));
  } catch {
    return false;
  }
}

export default function FamilyPortrait({ className = '' }: { className?: string }) {
  const hasPhoto = publicFileExists(PHOTO_PATH);

  if (hasPhoto) {
    return (
      <figure className={className}>
        <div className="media relative aspect-[4/5] shadow-card-lg">
          <Image
            src={`/${PHOTO_PATH}`}
            alt="The husband-and-wife owners of 3U3 Cleaning, standing hand in hand"
            fill
            sizes="(max-width: 1024px) 100vw, 44vw"
            className="object-cover"
            priority
          />
        </div>
        <figcaption className="meta mt-4">Us — the two people whose name is on this.</figcaption>
      </figure>
    );
  }

  return (
    <div className={className}>
      <div
        className="relative flex aspect-[4/5] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gold/45 px-8 text-center"
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(210,150,30,0.12), transparent 60%), radial-gradient(ellipse at 75% 85%, rgba(138,109,29,0.10), transparent 60%), #F7F8FA',
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-12 w-12 text-bronze"
        >
          <path d="M3 9a2 2 0 0 1 2-2h2l1.2-1.8A1 1 0 0 1 9 4.7h6a1 1 0 0 1 .8.5L17 7h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          <circle cx="12" cy="12.5" r="3.4" />
        </svg>

        <p className="mt-5 text-lg font-bold text-ink">A family photo goes here</p>
        <p className="body mt-2 max-w-[24ch] text-sm">
          The family, somewhere that looks like home. Portrait orientation works best.
        </p>

        {process.env.NODE_ENV !== 'production' && (
          <code className="mt-5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-muted shadow-card">
            public/{PHOTO_PATH}
          </code>
        )}
      </div>
    </div>
  );
}
