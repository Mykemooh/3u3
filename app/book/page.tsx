import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getTenant, getServiceTypes, getClientRatesFor, formatMoney } from '@/lib/data';
import BookWizard from '@/components/BookWizard';
import AccessNotice from '@/components/AccessNotice';
import { homeForRole } from '@/lib/nav';

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

  const tenant = await getTenant();
  if (!tenant) redirect('/');

  const services = await getServiceTypes(tenant.id);
  const rates = await getClientRatesFor((session.user as any).id);

  const eligibleServices = services
    .map((s) => ({
      ...s,
      rateCents: rates.find((r) => r.serviceTypeId === s.id)?.rateCents ?? null,
      rateLabel: formatMoney(rates.find((r) => r.serviceTypeId === s.id)?.rateCents),
    }))
    .filter((s) => s.rateCents != null);

  return (
    <>
      <div className="mx-auto max-w-xl px-6 pt-6">
        <AccessNotice />
      </div>
      <BookWizard
        customerName={(session.user as any).name ?? 'there'}
        services={eligibleServices}
      />
    </>
  );
}
