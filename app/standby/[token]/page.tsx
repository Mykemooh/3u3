import { notFound } from 'next/navigation';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import { getStandbyOfferByToken } from '@/lib/standby';
import StandbyResponse from '@/components/StandbyResponse';

export const dynamic = 'force-dynamic';

export default async function StandbyOfferPage({ params }: { params: { token: string } }) {
  const offer = await getStandbyOfferByToken(params.token);
  if (!offer) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="bg-ink px-6 py-4">
        <Logo variant="light" size="sm" />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <div className="card">
          <p className="text-sm font-semibold uppercase tracking-widest text-bronze">A spot opened up</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{offer.serviceName}</h1>
          <p className="mt-2 text-lg font-semibold text-ink">
            {offer.dateLabel} · {offer.timeLabel}
          </p>

          <StandbyResponse token={params.token} initialStatus={offer.request.status} expired={offer.expired} />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Questions? Just reply to the email we sent and we'll take care of it.
        </p>
      </main>

      <Footer />
    </div>
  );
}
