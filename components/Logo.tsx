import Image from 'next/image';

const HEIGHTS = { sm: 34, md: 54, lg: 82 };
const ASPECT = 641 / 208; // native size of the exported mark

/**
 * The real 3U3 wordmark (exported brand asset, cropped to just the mark —
 * no tagline, since callers that want one render it as their own text, e.g.
 * Footer). Two variants: navy numerals for light backgrounds, white
 * numerals for dark ones. Both keep the mark's blue-to-green gradient U.
 */
export default function Logo({
  variant = 'dark',
  size = 'md',
  className = '',
}: {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const h = HEIGHTS[size];
  const w = Math.round(h * ASPECT);
  const src = variant === 'light' ? '/brand/logo-light-mark.png' : '/brand/logo-navy-mark.png';
  return (
    <Image
      src={src}
      alt="3U3 Cleaning"
      width={w}
      height={h}
      priority
      className={`select-none ${className}`}
    />
  );
}
