import { NextResponse } from 'next/server';
import { ApiKeyError } from '@/lib/apiKeys';
import { WebhookError } from '@/lib/webhooks';

/** Shared error shape for the API-and-webhooks admin routes. */
export function developersError(err: unknown) {
  if (err instanceof ApiKeyError || err instanceof WebhookError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
