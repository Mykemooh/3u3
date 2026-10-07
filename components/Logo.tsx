'use client';

import Image from 'next/image';
import { useCompanyBrand } from '@/components/brand/CompanyBrandProvider';

const HEIGHTS = { sm: 34, md: 54, lg: 82 };
const TEXT = { sm: 'text-[20px]', md: 'text-[30px]', lg: 'text-[44px]' };
const ASPECT = 641 / 208; // native size of the exported mark

/**
 * The company's mark. On pages wrapped in a CompanyBrandProvider (the client
 * portal, booking, sign-in) a company other than 3U3 shows its own uploaded
 * logo, or its name set in the display face when it has none. Everywhere
 * else — and for 3U3 itself — this is the real 3U3 wordmark (exported brand
 * asset, cropped to just the mark). Two variants: navy numerals for light
 * backgrounds, white numerals for dark ones.
 */
export default function Logo({
  variant = 'dark',
  size = 'md',
  className = '',
  wrap = false,
}: {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** A company name set as text may take two lines on a phone instead of being cut off (portal header). */
  wrap?: boolean;
}) {
  const brand = useCompanyBrand();
  const h = HEIGHTS[size];

  if (brand && !brand.house) {
    if (brand.logoUrl) {
      return (
        // A company's uploaded file: any size or shape, so a plain img sized by height.
        // eslint-disable-next-line @next/next/no-img-element
        variant === 'light' ? (
          // On a dark bar an uploaded logo (often dark artwork) sits on a white chip so it always shows.
          <span className={`inline-flex items-center rounded-lg bg-white px-2 py-1 ${className}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} alt={brand.name} style={{ height: h - 8 }} className="w-auto max-w-[200px] select-none object-contain" />
          </span>
        ) : (
          <img src={brand.logoUrl} alt={brand.name} style={{ height: h }} className={`w-auto max-w-[220px] select-none object-contain ${className}`} />
        )
      );
    }
    if (wrap) {
      return (
        <span className={`line-clamp-2 block max-w-[52vw] md:line-clamp-none md:whitespace-nowrap font-display text-[17px] font-extrabold leading-[1.15] tracking-[-0.01em] sm:max-w-[280px] sm:text-[20px] ${variant === 'light' ? 'text-white' : 'text-ink'} ${className}`}>
          {brand.name}
        </span>
      );
    }
    return (
      <span className={`block max-w-[60vw] truncate whitespace-nowrap font-display font-extrabold leading-tight tracking-[-0.015em] sm:max-w-[280px] ${TEXT[size]} ${variant === 'light' ? 'text-white' : 'text-ink'} ${className}`}>
        {brand.name}
      </span>
    );
  }

  const w = Math.round(h * ASPECT);
  const src = variant === 'light' ? '/brand/logo-light-mark.png' : '/brand/logo-navy-mark.png';
  return <Image src={src} alt="3U3 Cleaning" width={w} height={h} priority className={`select-none ${className}`} />;
}
