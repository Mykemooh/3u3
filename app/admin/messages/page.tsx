import { getTenant } from '@/lib/data';
import { listThreads } from '@/lib/messaging';
import { smsConfigured, phoneDigits } from '@/lib/sms';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import Inbox from '@/components/admin/Inbox';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({ searchParams }: { searchParams: { client?: string; t?: string; new?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [threads, clientRows] = await Promise.all([
    listThreads(tenant.id),
    db
      .select({ id: users.id, name: users.name, phone: users.phone, smsConsent: users.smsConsent })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), eq(users.role, 'CUSTOMER'), eq(users.isActive, true), isNotNull(users.phone))),
  ]);
  const clients = clientRows
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone!, key: phoneDigits(c.phone) ?? '', optedOut: c.smsConsent === false }))
    .filter((c) => c.key)
    .sort((a, b) => a.name.localeCompare(b.name));
  const fromClient = searchParams.client ? clients.find((c) => c.id === searchParams.client)?.key ?? null : null;
  const startKey = fromClient ?? (searchParams.t && /^\d{10}$/.test(searchParams.t) ? searchParams.t : null);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Texts</h2>
        <p className="max-w-2xl text-slate">
          Two-way texting from your business number. Reminders and Tex’s replies show up in each client’s thread, so you
          always see the whole conversation.
        </p>
      </div>
      <Inbox initialThreads={threads} clients={clients} textingReady={smsConfigured()} startKey={startKey} startNew={searchParams.new === '1'} />
    </div>
  );
}
