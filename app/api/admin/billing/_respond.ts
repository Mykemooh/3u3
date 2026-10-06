import { NextResponse } from 'next/server';
import { BillingError } from '@/lib/billing/stripeBilling';

/** Billing errors become their message; anything else is a logged 500. */
export function billingError(err: unknown) {
  if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof Error && /between/.test(err.message)) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error('[billing]', err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
