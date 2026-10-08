import Image from 'next/image';
import { TC_IMAGES, type ImageSlotKey } from '@/lib/tc/images';

/**
 * A photography slot. With a file set in lib/tc/images.ts it renders the
 * photo; until then it renders a quiet, clearly-labelled placeholder that
 * carries the brief, so nobody mistakes it for finished art.
 */
export default function ImageSlot({
  slot,
  className = '',
  aspect = 'aspect-[3/2]',
  tone = 'light',
  sizes = '(min-width: 1024px) 50vw, 100vw',
  priority = false,
  captionClass = '',
  quality,
  children,
}: {
  slot: ImageSlotKey;
  className?: string;
  aspect?: string;
  tone?: 'light' | 'dark';
  sizes?: string;
  priority?: boolean;
  /** Extra classes for the placeholder caption, e.g. to clear an overlapping element. */
  captionClass?: string;
  /** Compression quality for the served photo (next/image default 75). */
  quality?: number;
  /** Overlays laid over a finished photo (e.g. a logo badge). */
  children?: React.ReactNode;
}) {
  const s = TC_IMAGES[slot];
  if (s.file) {
    return (
      <div className={`relative overflow-hidden rounded-tc-lg bg-tc-100 ${aspect} ${className}`}>
        <Image src={s.file} alt={s.alt} fill sizes={sizes} priority={priority} quality={quality} className="object-cover" />
        {children}
      </div>
    );
  }
  const dark = tone === 'dark';
  return (
    <figure
      className={`relative flex overflow-hidden rounded-tc-lg ${aspect} ${className} ${
        dark ? 'border border-white/10 bg-tc-black-2 text-white/70' : 'border border-dashed border-tc-300 bg-tc-50 text-tc-500'
      }`}
      aria-label={`Photo to come: ${s.title}`}
    >
      <svg aria-hidden="true" className={`absolute inset-0 h-full w-full ${dark ? 'opacity-[0.06]' : 'opacity-[0.5]'}`}>
        <defs>
          <pattern id={`hatch-${slot}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke={dark ? '#fff' : '#E5E7EB'} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#hatch-${slot})`} />
      </svg>
      <figcaption className={`relative m-auto max-w-[34ch] p-6 text-center ${captionClass}`}>
        <span
          className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full ${dark ? 'bg-white/10' : 'bg-white shadow-tc-ring'}`}
          aria-hidden="true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        <span className={`block text-[13px] font-semibold ${dark ? 'text-white' : 'text-tc-900'}`}>Photo: {s.title}</span>
        <span className="mt-1.5 block text-[12px] leading-relaxed">{s.brief}</span>
      </figcaption>
    </figure>
  );
}
