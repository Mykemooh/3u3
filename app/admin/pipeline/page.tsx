import Link from 'next/link';
import { getTenant, formatMoney } from '@/lib/data';
import { getPipeline, PIPELINE_STAGES } from '@/lib/pipeline';

export default async function AdminPipeline() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const { cards, lost } = await getPipeline(tenant.id);

  const open = PIPELINE_STAGES.filter((s) => s.key !== 'PAID').reduce(
    (sum, s) => sum + cards[s.key].reduce((t, c) => t + (c.amountCents ?? 0), 0),
    0,
  );
  const inFlight = PIPELINE_STAGES.filter((s) => s.key !== 'PAID').reduce(
    (sum, s) => sum + cards[s.key].length,
    0,
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Pipeline</h1>
        <p className="text-slate">
          {inFlight} {inFlight === 1 ? 'client' : 'clients'} in flight · {formatMoney(open)} not yet collected
        </p>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3" style={{ minWidth: `${PIPELINE_STAGES.length * 200}px` }}>
          {PIPELINE_STAGES.map((stage) => {
            const column = cards[stage.key];
            const total = column.reduce((t, c) => t + (c.amountCents ?? 0), 0);
            return (
              <div key={stage.key} className="flex-1">
                <div className={`rounded-t-xl border-t-4 bg-surface px-3 py-2 ${stage.accent}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-ink">{stage.label}</span>
                    <span className="text-sm font-bold text-muted">{column.length}</span>
                  </div>
                  <p className="text-xs text-muted">{stage.hint}</p>
                  {total > 0 && <p className="mt-0.5 text-xs font-semibold text-bronze">{formatMoney(total)}</p>}
                </div>

                <div className="space-y-2 rounded-b-xl bg-surface p-2">
                  {column.map((card) => (
                    <Link
                      key={`${stage.key}-${card.clientId}`}
                      href={card.href}
                      className="block rounded-xl border border-line bg-white p-2.5 text-xs transition hover:border-gold"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-ink">{card.clientName}</span>
                        {card.amountCents != null && (
                          <span className="whitespace-nowrap font-bold text-bronze">
                            {formatMoney(card.amountCents)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-muted">{card.detail}</p>
                      {card.clientPhone && <p className="text-muted">{card.clientPhone}</p>}
                    </Link>
                  ))}
                  {column.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-muted">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {lost.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 font-semibold text-ink">Didn't go ahead</h2>
          <p className="mb-3 text-sm text-muted">
            Kept on purpose — these are the ones worth a call in a few months.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lost.map((card) => (
              <Link
                key={card.clientId}
                href={card.href}
                className="card flex items-center justify-between !p-3 text-sm transition hover:border-gold"
              >
                <div>
                  <p className="font-semibold text-ink">{card.clientName}</p>
                  <p className="text-xs text-muted">{card.detail}</p>
                </div>
                {card.amountCents != null && (
                  <span className="text-sm font-semibold text-muted">{formatMoney(card.amountCents)}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="mt-8 text-sm text-muted">
        Every stage here is worked out from your real records — a booked walkthrough, a sent estimate, a finished
        job, a paid invoice. There's no status to keep up to date by hand, so this can't drift out of step with
        what's actually happening.
      </p>
    </div>
  );
}
