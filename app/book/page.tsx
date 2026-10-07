import { enforceMfa, type SessionUser } from '@/lib/sessionUser';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getTenant, getServiceTypes, getClientRatesFor, formatMoney } from '@/lib/data';
import BookWizard from '@/components/BookWizard';
import AppShell, { CUSTOMER_TABS } from '@/components/app/AppShell';
import { homeForRole } from '@/lib/nav';
import { HIDDEN_SERVICE_KEYS } from '@/lib/services';
import { getAddOnsForClient } from '@/lib/addons';

// Reads the signed-in customer's session and live rate/service data —
// never statically cacheable.
export const dynamic = 'force-dynamic';

export default async function BookPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin?next=/book');
  const role = (session.user as any).role;
  // Staff landing here get sent to their own screen. Bouncing them to the
  // sign-in form looks like a rejected password and explains nothing.
  if (role !== 'CUSTOMER') redirect(`${homeForRole(role)}?denied=1`);
  enforceMfa(session.user as unknown as SessionUser, '/book');

  const tenant = await getTenant();
  if (!tenant) redirect('/');

  const services = await getServiceTypes(tenant.id);
  const rates = await getClientRatesFor((session.user as any).id);
  const addOns = await getAddOnsForClient(tenant.id, (session.user as any).id);

  const eligibleServices = services
    .filter((s) => !HIDDEN_SERVICE_KEYS.includes(s.key))
    .map((s) => ({
      ...s,
      rateCents: rates.find((r) => r.serviceTypeId === s.id)?.rateCents ?? null,
      rateLabel: formatMoney(rates.find((r) => r.serviceTypeId === s.id)?.rateCents),
    }))
    .filter((s) => s.rateCents != null);

  // Booking is one of the client's tabs, so it wears the same frame as the
  // rest of the portal (AppShell: company colours and mark, EN | ES, the
  // account menu and the tab bar) instead of dropping them on a bare page.
  return (
    <AppShell name={session.user.name} tabs={CUSTOMER_TABS} homeHref="/account">
      <BookWizard customerName={(session.user as any).name ?? ''} services={eligibleServices} addOns={addOns} />
    </AppShell>
  );
}
