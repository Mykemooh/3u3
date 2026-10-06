/**
 * TrashCan logo system (docs/brand/trashcan-guidelines.md §2).
 *
 * The icon is drawn on a 32×32 grid: a handle, a lid, and a tapered body
 * split into three slats — heavy verticals, softened corners, no sparkle.
 * The wordmark is set uppercase in the display face with the logo's
 * crossbar-less A (Λ), which is the one letterform that makes it read as
 * TRASHCAN rather than as a font.
 *
 * Colour rules: the icon is always lime. On dark, the wordmark is white;
 * on light, black. The app icon is the lime mark on a black rounded square.
 */

const LIME = '#B8FF00';
const BLACK = '#0B0F14';

// Slats: polygons with a hairline stroke in the same colour and round joins,
// which softens every corner by the same amount at any size.
const LEFT = '6.2,12.4 10.3,12.4 11.4,27.4 8.4,27.4';
const RIGHT = '21.7,12.4 25.8,12.4 23.6,27.4 20.6,27.4';

export function TcIcon({ size = 28, color = LIME, title }: { size?: number | string; color?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill={color}
    >
      {title ? <title>{title}</title> : null}
      <rect x="10" y="4" width="12" height="2.4" rx="1.2" />
      <rect x="5" y="8.2" width="22" height="2.8" rx="1.4" />
      <g stroke={color} strokeWidth="0.9" strokeLinejoin="round">
        <polygon points={LEFT} />
        <polygon points={RIGHT} />
        <rect x="14.5" y="12.4" width="3" height="15" rx="0.5" />
      </g>
    </svg>
  );
}

/** The crossbar-less A, sized to the cap height of the surrounding text. */
function Lambda() {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className="inline-block align-baseline"
      style={{ width: '0.74em', height: '0.715em', margin: '0 0.012em' }}
      fill="currentColor"
    >
      <polygon points="0,100 39,0 61,0 100,100 77,100 50,29 23,100" />
    </svg>
  );
}

export function TcWordmark({ className = '', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const color = tone === 'light' ? 'text-white' : 'text-tc-black';
  return (
    <span
      className={`inline-flex items-baseline font-tc-display font-extrabold uppercase leading-none tracking-[0.02em] ${color} ${className}`}
      aria-label="TRASHCAN"
      role="img"
    >
      <span aria-hidden="true" className="inline-flex items-baseline">
        TR<Lambda />SHC<Lambda />N
      </span>
    </span>
  );
}

/**
 * Preferred lockup: icon at left + TRASHCAN. `tone` is the background it
 * sits on — 'light' background gives a black wordmark, 'dark' a white one.
 */
export default function TcLogo({
  on = 'light',
  size = 'md',
  className = '',
}: {
  on?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const icon = size === 'sm' ? 22 : size === 'lg' ? 36 : 28;
  const text = size === 'sm' ? 'text-[15px]' : size === 'lg' ? 'text-[24px]' : 'text-[19px]';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <TcIcon size={icon} />
      <TcWordmark tone={on === 'dark' ? 'light' : 'dark'} className={text} />
    </span>
  );
}

/** App icon: the lime mark centred on a black rounded square. */
export function TcAppIcon({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.24, background: BLACK }}
    >
      <TcIcon size={Math.round(size * 0.68)} />
    </span>
  );
}
