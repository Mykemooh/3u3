import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loadJob, canViewJob, viewerFrom } from '@/lib/jobs';
import { SERVICE_LABELS } from '@/lib/data';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { formatClock, BUSINESS_TIMEZONE } from '@/lib/time';
import { cleaningJourney } from '@/lib/account';
import { db } from '@/db/client';
import { invoices } from '@/db/schema';
import { eq } from 'drizzle-orm';
import JourneyRail from '@/components/app/JourneyRail';
import BeforeAfter from '@/components/app/BeforeAfter';
import LiveTrackingMap from '@/components/app/LiveTrackingMap';
import SocialMediaConsent from '@/components/account/SocialMediaConsent';
import ReviewPrompt from '@/components/account/ReviewPrompt';
import { getTracking, publicMapboxToken } from '@/lib/tracking';
import { getUserById } from '@/lib/data';
import { getReviewForBooking } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

function timestampLabel(createdAt: Date): string {
  return createdAt.toLocaleString('en-US', { timeZone: BUSINESS_TIMEZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function JobGallery({ params }: { params: { id: string } }) {
  const viewer = viewerFrom(await getServerSession(authOptions));
  if (!viewer) redirect(`/signin?next=/account/jobs/${params.id}`);
  const data = await loadJob(params.id);
  if (!data || !(await canViewJob(viewer, data.job, data.booking))) notFound();

  const { job, booking, client, service, items, media } = data;
  const invoiceRow = (await db.select().from(invoices).where(eq(invoices.bookingId, booking.id)).limit(1))[0];
  const invoice = invoiceRow && (viewer.role === 'ADMIN' || (invoiceRow.status !== 'DRAFT' && invoiceRow.status !== 'VOID')) ? invoiceRow : null;
  // Clients see the photos once the job is finished; staff see them live.
  const showMedia = job.status === 'COMPLETE' || viewer.role !== 'CUSTOMER';
  const serviceName = service ? SERVICE_LABELS[service.key] ?? service.name : 'Cleaning';
  const tracking = job.status === 'EN_ROUTE' ? getTracking(job) : null;

  return (
    <div className="space-y-6">
      <Link href={viewer.role === 'CUSTOMER' ? '/account' : `/crew/jobs/${job.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> {viewer.role === 'CUSTOMER' ? 'Your account' : 'Back to the job'}
      </Link>

      <header className="card space-y-5">
        <div>
          <p className="eyebrow">{serviceName}</p>
          <h1 className="mt-1 text-2xl font-bold">{formatDateLabel(booking.slotStart.slice(0, 10))}</h1>
          <p className="mt-1 text-slate">
            {job.startedAt && job.completedAt
              ? `Crew on site ${formatClock(job.startedAt)} – ${formatClock(job.completedAt)}`
              : formatSlotLabel(booking.slotStart, booking.slotEnd)}
          </p>
        </div>
        <JourneyRail steps={cleaningJourney({ job, invoice: invoice ?? null })} />
        {invoice && (
          <Link href={`/account/invoices/${invoice.id}`} className="btn-secondary btn-sm">
            {invoice.status === 'PAID' ? 'View receipt' : invoice.status === 'DRAFT' ? 'Preview invoice (draft)' : 'View invoice'}
          </Link>
        )}
      </header>

      {tracking?.status === 'EN_ROUTE' && <LiveTrackingMap jobId={job.id} token={publicMapboxToken()} initial={tracking} />}

      {!showMedia ? (
        <p className="card text-slate">
          {job.status === 'EN_ROUTE'
            ? "Your crew is on the way. Photos of every room will appear here once they've finished."
            : job.status === 'IN_PROGRESS'
            ? "The crew is working through your home now. Photos of every room will appear here the moment they finish."
            : 'Photos of every room will appear here once your cleaning is done.'}
        </p>
      ) : (
        <>
          {viewer.role === 'CUSTOMER' && (
            <SocialMediaConsent initialConsent={(await getUserById(viewer.id))?.socialMediaConsent ?? null} />
          )}
          {items.map((item) => {
          const roomMedia = media.filter((m) => m.itemId === item.id);
          const before = roomMedia.filter((m) => m.phase === 'BEFORE');
          const after = roomMedia.filter((m) => m.phase === 'AFTER');
          const firstBefore = before.find((m) => m.kind === 'PHOTO');
          const firstAfter = after.find((m) => m.kind === 'PHOTO');
          const extras = roomMedia.filter((m) => m !== firstBefore && m !== firstAfter);
          return (
            <section key={item.id} className="card space-y-4 p-5" aria-labelledby={`g-${item.id}`}>
              <div className="flex items-center justify-between gap-3">
                <h2 id={`g-${item.id}`} className="text-lg font-bold">
                  {item.roomName}
                </h2>
                {item.status === 'SKIPPED' && <span className="pill bg-amber-100 text-amber-800">Not cleaned</span>}
              </div>
              {item.status === 'SKIPPED' ? (
                <p className="text-sm text-slate">Reason: {item.skipReason}</p>
              ) : firstBefore && firstAfter ? (
                <>
                  <BeforeAfter before={firstBefore.url} after={firstAfter.url} room={item.roomName} />
                  <p className="text-center text-xs text-muted">Drag the handle to compare</p>
                  <p className="text-center text-xs text-muted">
                    Before {timestampLabel(firstBefore.createdAt)} · After {timestampLabel(firstAfter.createdAt)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">No photos for this room yet.</p>
              )}
              {extras.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {extras.map((m) => (
                    <figure key={m.id} className="relative overflow-hidden rounded-xl bg-surface">
                      {m.kind === 'VIDEO' ? (
                        <video src={m.url} controls playsInline preload="metadata" className="aspect-square w-full bg-ink object-cover" />
                      ) : (
                        <a href={m.url} target="_blank" rel="noreferrer">
                          <img src={m.url} alt={`${item.roomName} ${m.phase.toLowerCase()}`} className="aspect-square w-full object-cover" loading="lazy" />
                        </a>
                      )}
                      <figcaption
                        className={`pointer-events-none absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          m.phase === 'AFTER' ? 'bg-gold text-white' : 'bg-ink/75 text-white'
                        }`}
                      >
                        {m.phase === 'AFTER' ? 'After' : 'Before'}
                        {m.kind === 'VIDEO' ? ' · video' : ''}
                      </figcaption>
                      {m.kind === 'VIDEO' && (
                        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {timestampLabel(m.createdAt)}
                        </span>
                      )}
                    </figure>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        </>
      )}

      {viewer.role === 'CUSTOMER' && showMedia && job.status === 'COMPLETE' && (
        <ReviewPrompt
          jobId={job.id}
          name={client?.name ?? 'there'}
          avatarUrl={client?.avatarUrl ?? null}
          existingRating={(await getReviewForBooking(booking.id))?.rating ?? null}
        />
      )}

      {viewer.role === 'CUSTOMER' && showMedia && (
        <div className="card text-center">
          <p className="font-semibold">Anything not quite right?</p>
          <p className="mt-1 text-sm text-slate">Reply to your job-complete email and we'll make it right.</p>
          <Link href="/book" className="btn-primary mt-4">
            Book your next cleaning
          </Link>
        </div>
      )}
    </div>
  );
}
