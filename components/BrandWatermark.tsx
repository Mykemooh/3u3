import Image from 'next/image';

/**
 * The logo, very large, pinned to the left edge behind everything on the page.
 *
 * Three things make this safe to put under live text:
 *
 * 1. `public/logo-mark.png` is a light-background cut of the brand mark — ink
 *    and gold on transparency, with the dark glow and the tagline stripped.
 *    The original logo.png is white artwork made for a dark box and would be
 *    invisible here.
 * 2. A white veil sits between the mark and the page, so the artwork can never
 *    push text below its contrast target no matter which section it lands in.
 *    VEIL is the one number to turn if it wants to be louder or quieter.
 * 3. `fixed` + `pointer-events-none` + `aria-hidden`: it never scrolls into a
 *    heading, never eats a click, and is not announced to a screen reader.
 *
 * It sits at z-0 with the page content at z-10, which means any section
 * carrying its own opaque fill (`bg-surface`, `bg-ink`) covers it — by design.
 * The mark reads through the white bands and quietly disappears behind the
 * grey and dark ones, so the page keeps its structure.
 */
const VEIL = 0.94; // white cover over the mark: higher = fainter logo

export default function BrandWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-y-0 left-0 z-0 hidden w-[40vw] max-w-[560px] select-none overflow-hidden sm:block"
    >
      <div className="absolute left-[-3%] top-1/2 w-[106%] -translate-y-1/2">
        <div className="relative aspect-[1200/564]">
          <Image
            src="/logo-mark.png"
            alt=""
            fill
            sizes="40vw"
            className="object-contain"
            priority={false}
          />
        </div>
      </div>

      {/* The veil. Slightly heavier on the right, where the mark runs under
          the body copy, and lighter at the very edge where nothing sits. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to right, rgba(255,255,255,${VEIL - 0.04}) 0%, rgba(255,255,255,${VEIL}) 55%, rgba(255,255,255,${Math.min(VEIL + 0.06, 1)}) 100%)`,
        }}
      />
    </div>
  );
}
