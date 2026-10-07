/**
 * A company's own look, for the pages its clients see (the client portal,
 * booking, sign-in). The cleaner app and the owner workspace wear
 * TrashCan's look instead (.theme-tc).
 *
 * The brand tokens in app/globals.css (:root) are 3U3 Cleaning's own brand
 * book — the house account, and the platform's first company. Every other
 * company gets those same tokens re-pointed at the colours chosen in
 * Platform → Companies (tenants.primaryColor and friends), and its own logo
 * or, with none uploaded, its name set in the display face.
 *
 * Pure and db-free: safe to import from client components.
 */

export type CompanyBrand = {
  name: string;
  /** 3U3's own brand book and wordmark (public/brand). */
  house: boolean;
  logoUrl: string | null;
  /** CSS custom properties for the brand tokens, or null for the house brand. */
  vars: Record<string, string> | null;
};

type TenantLike = {
  name: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  inkColor?: string | null;
  bronzeColor?: string | null;
  creamColor?: string | null;
};

/** 3U3 keeps its built-in brand book (the same rule the workspace uses for its mark). */
export function isHouseBrand(t: { name: string; logoUrl?: string | null }): boolean {
  return !t.logoUrl && /3u3/i.test(t.name);
}

/** "#2563EB" → [37, 99, 235]; null when it isn't a 3- or 6-digit hex colour. */
export function hexToRgb(hex: string | null | undefined): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const channels = (rgb: [number, number, number]) => rgb.join(' ');
const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  a.map((v, i) => Math.round(v + (b[i] - v) * t)) as [number, number, number];
const WHITE: [number, number, number] = [255, 255, 255];

export function companyBrand(t: TenantLike): CompanyBrand {
  const house = isHouseBrand(t);
  if (house) return { name: t.name, house, logoUrl: null, vars: null };

  const primary = hexToRgb(t.primaryColor) ?? [37, 99, 235];
  const ink = hexToRgb(t.inkColor) ?? [11, 31, 59];
  const deep = hexToRgb(t.bronzeColor) ?? mix(primary, ink, 0.25);
  const cream = hexToRgb(t.creamColor) ?? mix(primary, WHITE, 0.94);
  const p = (r: number, g: number, b: number, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

  return {
    name: t.name,
    house,
    logoUrl: t.logoUrl ?? null,
    vars: {
      '--c-gold': channels(primary),
      // The house brand's buttons run blue → green; a company's run from its
      // colour to a lighter step of the same, so no stray hue appears.
      '--c-gold-light': channels(mix(primary, WHITE, 0.28)),
      '--c-bronze': channels(deep),
      '--c-ink': channels(ink),
      '--c-ink-soft': channels(mix(ink, WHITE, 0.08)),
      '--c-slate': channels(mix(ink, WHITE, 0.12)),
      '--c-green': channels(primary),
      '--c-green-light': channels(mix(primary, WHITE, 0.9)),
      '--c-cream': channels(cream),
      '--c-surface': channels(mix(cream, [241, 245, 248], 0.5)),
      '--shadow-gold': `0 2px 6px ${p(...primary, 0.22)}, 0 10px 24px -10px ${p(...primary, 0.4)}`,
      '--shadow-gold-lg': `0 4px 10px ${p(...primary, 0.26)}, 0 16px 32px -12px ${p(...primary, 0.45)}`,
    },
  };
}
