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
};
