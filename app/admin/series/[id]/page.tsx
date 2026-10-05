import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenant } from '@/lib/data';
import { getSeriesDetail, minutesLabel } from '@/lib/recurring';
import { formatMoney } from '@/lib/format';
import { db } from '@/db/client';
import { crews } from '@/db/schema';
import { eq } from 'drizzle-orm';
import HistoryPanel from '@/components/admin/HistoryPanel';
import { SeriesStatusButtons, SeriesVisits } from '@/components/admin/SeriesControls';

export const dynamic = 'force-dynamic';

export default async function SeriesDetailPage({ params }: { params: { id: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const data = await getSeriesDetail(tenant.id, params.id);
  if (!data) notFound();
  const crewRows = await db.select().from(crews).where(eq(crews.tenantId, tenant.id));
  const { series } = data;

  return (
    <div className="space-y-6">
      <Link href="/admin/series" className="text-sm font-semibold text-bronze hover:underline">← Recurring cleans</Link>
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{data.service?.name}</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-ink">
              <Link href={`/admin/clients/${data.client?.id}`} className="hover:text-bronze">{data.client?.name}</Link>
            </h2>
            <p className="mt-1 text-slate">{data.describe} · {minutesLabel(series.startMinutes)}–{minutesLabel(series.startMinutes + series.durationMinutes)}</p>
            <p className="text-sm text-muted">
              {data.crew?.name} · {series.priceCents != null ? `${formatMoney(series.priceCents)} a visit` : 'No price set'}
              {series.endDate ? ` · ends ${series.endDate}` : ''}
              {series.skipHolidays ? ' · skips holidays' : ''}
            </p>
            {series.notes && <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-sm text-slate">{series.notes}</p>}
          </div>
          <SeriesStatusButtons seriesId={series.id} status={series.status} />
        </div>
      </div>
      <SeriesVisits
        seriesId={series.id}
        visits={data.visits.map((v) => ({
          id: v.id,
          slotStart: v.slotStart,
          slotEnd: v.slotEnd,
          status: v.status,
          isSeriesException: v.isSeriesException,
          jobStatus: v.jobStatus,
          jobId: v.jobId,
          seriesOccurrenceDate: v.seriesOccurrenceDate,
          crewId: v.crewId,
        }))}
        crews={crewRows.map((c) => ({ id: c.id, name: c.name }))}
        defaults={{ startMinutes: series.startMinutes, durationMinutes: series.durationMinutes, crewId: series.crewId, priceCents: series.priceCents }}
      />
      <HistoryPanel tenantId={tenant.id} entityType="series" entityId={series.id} />
    </div>
  );
}
