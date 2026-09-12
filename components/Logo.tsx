import Image from 'next/image';

const SIZES = {
  sm: { w: 120, h: 80 },
  md: { w: 180, h: 120 },
  lg: { w: 280, h: 187 },
};

// The real 3U3 logo (white wordmark, gold "U" with water-droplet accent and
// wave underline, backlit glow) — designed only for dark backgrounds, so
// every placement on a light page wraps it in a dark container.
export default function Logo({
  size = 'md',
  className = '',
}: {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { w, h } = SIZES[size];
  return (
    <Image
      src="/logo.png"
      alt="3U3 Cleaning"
      width={w}
      height={h}
      priority
      className={`select-none ${className}`}
    />
  );
}
