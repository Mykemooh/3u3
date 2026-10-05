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
