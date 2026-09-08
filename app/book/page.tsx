import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getTenant, getServiceTypes, getClientRatesFor, formatMoney } from '@/lib/data';
import BookWizard from '@/components/BookWizard';

export default async function BookPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'CUSTOMER') {
    redirect('/signin');
  }

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
    <BookWizard
      customerName={(session.user as any).name ?? 'there'}
      services={eligibleServices}
    />
  );
}
