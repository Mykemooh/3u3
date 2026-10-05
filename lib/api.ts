import { NextResponse } from 'next/server';
import { JobError } from '@/lib/jobs';
import { MfaError } from '@/lib/mfa';

/** Turns a thrown JobError into its HTTP status; anything else is a logged 500. */
export function apiError(err: unknown) {
  if (err instanceof JobError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

/** MFA errors become their message and status; anything else is a logged 500. */
export function mfaApiError(err: unknown) {
  if (err instanceof MfaError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

/** Errors that carry their own HTTP status (series, templates, roles…) become their message. */
export function statusApiError(err: unknown) {
  const e = err as { status?: number; message?: string } | null;
  if (e && typeof e.status === 'number' && e.status >= 400 && e.status < 500 && e.message) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (err instanceof Error && ['DoubleBookingError', 'DispatchError', 'TemplateError', 'SeriesError'].includes(err.constructor.name)) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
