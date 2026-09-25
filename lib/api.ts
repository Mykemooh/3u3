import { NextResponse } from 'next/server';
import { JobError } from '@/lib/jobs';

/** Turns a thrown JobError into its HTTP status; anything else is a logged 500. */
export function apiError(err: unknown) {
  if (err instanceof JobError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
