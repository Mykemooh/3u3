// Pure, db-free formatting helpers — safe to import from client
// components. Keep this file free of any import that reaches db/client.ts
// (directly or transitively): a 'use client' component that imports
// anything importing the Postgres driver fails to bundle for the browser
// (pg needs Node's fs/dns/net/tls, which don't exist there).

export function formatMoney(cents: number | null | undefined) {
  if (cents == null) return '—';
  // "−$12.00", not "$-12.00" — credits and losses read naturally.
  return cents < 0 ? `−$${(-cents / 100).toFixed(2)}` : `$${(cents / 100).toFixed(2)}`;
}

export const SERVICE_LABELS: Record<string, string> = {
  STANDARD: 'Standard Cleaning',
  DEEP: 'Deep Cleaning',
  MOVE_IN_OUT: 'Move-In / Move-Out',
  AIRBNB: 'Airbnb / Rental Turnover',
  POST_CONSTRUCTION: 'Post-Construction Cleaning',
  COMMERCIAL: 'Commercial Cleaning',
};

/** SERVICE_LABELS in Spanish (lib/i18n). */
export const SERVICE_LABELS_ES: Record<string, string> = {
  STANDARD: 'Limpieza estándar',
  DEEP: 'Limpieza profunda',
  MOVE_IN_OUT: 'Limpieza de mudanza (entrada / salida)',
  AIRBNB: 'Limpieza de Airbnb / alquiler',
  POST_CONSTRUCTION: 'Limpieza post-construcción',
  COMMERCIAL: 'Limpieza comercial',
};

/** A built-in service's name in the reader's language; unknown keys come back as given. */
export function serviceLabel(key: string, locale: 'en' | 'es' = 'en'): string {
  return (locale === 'es' ? SERVICE_LABELS_ES[key] : SERVICE_LABELS[key]) ?? SERVICE_LABELS[key] ?? key;
}

/**
 * A service's display name: the built-in label in the reader's language for
 * the standard keys, or the owner's own name for a service they created.
 */
export function serviceName(key: string, customName: string | null | undefined, locale: 'en' | 'es' = 'en'): string {
  return SERVICE_LABELS[key] ? serviceLabel(key, locale) : customName || key;
}
