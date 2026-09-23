import { notFound } from 'next/navigation';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import { getEstimateByToken } from '@/lib/estimates';
import { formatMoney } from '@/lib/data';
import EstimateResponse from '@/components/EstimateResponse';

// Reads a live estimate by token — never prerender or cache this.
export const dynamic = 'force-dynamic';

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: { token: string };
  // The emailed Approve / Decline buttons are plain links carrying
  // ?respond=approve|decline, since many email clients strip <form>s.
  searchParams: { respond?: string };
}) {
  const data = await getEstimateByToken(params.token);
  if (!data) notFound();
  const { quote, items, client, service, address } = data;

  const expired = quote.status === 'EXPIRED' || (!!quote.expiresAt && quote.expiresAt.getTime() < Date.now());
  const intent =
    searchParams.respond === 'approve' ? 'APPROVE' : searchParams.respond === 'decline' ? 'DECLINE' : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="bg-ink px-6 py-4">
        <Logo size="sm" className="h-10 w-auto" />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <div className="card">
          <p className="text-sm font-semibold uppercase tracking-widest text-bronze">Your estimate</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{service?.name ?? 'Cleaning service'}</h1>
          <p className="text-slate">
            Prepared for {client?.name}
            {address ? ` · ${address.line1}, ${address.city}` : ''}
          </p>

          <table className="mt-6 w-full text-sm">
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-2">{item.description}</td>
                  <td className="py-2 text-right">{formatMoney(item.amountCents)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-3 text-lg font-bold">Total</td>
                <td className="py-3 text-right text-lg font-bold text-bronze">{formatMoney(quote.totalCents)}</td>
              </tr>
            </tbody>
          </table>

          {quote.notes && (
            <p className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-sm text-slate">{quote.notes}</p>
          )}

          <EstimateResponse
            token={params.token}
            initialStatus={quote.status}
            expired={expired}
            expiresAt={quote.expiresAt ? quote.expiresAt.toLocaleDateString() : undefined}
            clientHasPassword={!!client?.passwordHash}
            clientPhone={client?.phone ?? undefined}
            autoRespond={intent}
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Questions? Just reply to the email we sent and we'll take care of it.
        </p>
      </main>

      <Footer />
    </div>
  );
}
