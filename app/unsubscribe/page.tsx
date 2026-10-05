import type { Metadata } from 'next';
import { db } from '@/db/client';
import { users, tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyUnsubscribe } from '@/lib/unsubscribe';
import UnsubscribeButton from '@/components/UnsubscribeButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Email preferences', robots: { index: false } };

/**
 * A button rather than unsubscribing on page load: mail scanners open
 * links to check them, and they shouldn't unsubscribe anyone by doing so.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: { u?: string; t?: string } }) {
  const u = searchParams.u ?? '';
  const t = searchParams.t ?? '';
  const valid = !!u && !!t && verifyUnsubscribe(u, t);
  const user = valid ? (await db.select().from(users).where(eq(users.id, u)).limit(1))[0] : undefined;
  const tenant = user ? (await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1))[0] : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="card max-w-md text-center">
        {user ? (
          <>
            <h1 className="text-2xl font-bold">Email preferences</h1>
            <p className="mt-3 text-slate">
              Stop news and offers from {tenant?.name ?? 'us'}? You will still get messages about cleans you have booked — reminders,
              invoices and your before-and-after photos.
            </p>
            <UnsubscribeButton u={u} t={t} optedOut={user.marketingOptOut} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">This link has expired</h1>
            <p className="mt-3 text-slate">Reply to any of our emails and we will take you off the list by hand.</p>
          </>
        )}
      </div>
    </main>
  );
}
