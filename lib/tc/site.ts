/**
 * Where TrashCan's own marketing site lives.
 *
 * Every deployment serves it under /trashcan (so it works today on the
 * same address as 3U3's site). On a host listed in PLATFORM_HOSTS —
 * TrashCan's own domain, e.g. "trashcan.app,www.trashcan.app" — the
 * middleware serves it at the root instead: / is the TrashCan home page,
 * /pricing its pricing, and /trashcan/* redirects to the short path.
 */

export const TC_PREFIX = '/trashcan';

/** Marketing pages that move to the root on a platform host. */
export const TC_PAGES = ['/', '/features', '/pricing', '/resources'] as const;

export function platformHosts(): string[] {
  return (process.env.PLATFORM_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformHost(host: string | null | undefined) {
  if (!host) return false;
  return platformHosts().includes(host.split(':')[0].toLowerCase());
}

/** A link to a marketing page, for whichever host the visitor is on. */
export function tcHref(path: string, onPlatformHost: boolean) {
  const clean = path === '' ? '/' : path;
  if (onPlatformHost) return clean;
  return clean === '/' ? TC_PREFIX : `${TC_PREFIX}${clean}`;
}

export type TcNav = { features: string; pricing: string; resources: string; home: string };

export function tcNav(onPlatformHost: boolean): TcNav {
  return {
    home: tcHref('/', onPlatformHost),
    features: tcHref('/features', onPlatformHost),
    pricing: tcHref('/pricing', onPlatformHost),
    resources: tcHref('/resources', onPlatformHost),
  };
}
