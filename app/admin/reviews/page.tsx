import { getTenant } from '@/lib/data';
import { getReviewsForTenant } from '@/lib/reviews';
import FeatureReviewToggle from '@/components/admin/FeatureReviewToggle';
import RecleanActions from '@/components/admin/RecleanActions';
import { roomRatingsForReviews, qualitySummary } from '@/lib/quality';

export const dynamic = 'force-dynamic';

export default async function AdminReviews() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const reviews = await getReviewsForTenant(tenant.id);
  const featuredCount = reviews.filter((r) => r.review.featured).length;
  const [rooms, summary] = await Promise.all([roomRatingsForReviews(reviews.map((r) => r.review.id)), qualitySummary(tenant.id)]);
  const recleans = reviews.filter((r) => r.review.recleanStatus === 'REQUESTED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Reviews</h1>
        <p className="text-slate">
          Every rating a client leaves after a cleaning. Feature the ones you want showing in the landing page's
          testimonial carousel — nothing goes public on its own. {featuredCount > 0 && `${featuredCount} currently featured.`}
        </p>
      </div>

      {recleans.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">Re-clean requests</h2>
          <ul className="mt-3 space-y-4">
            {recleans.map(({ review, clientName, bookingLabel }) => (
              <li key={review.id} className="space-y-2">
                <p className="text-sm text-amber-900">
                  <strong>{clientName}</strong> · {bookingLabel} · {review.rating}/5 overall
                  {rooms.filter((r) => r.reviewId === review.id && r.rating <= 2).map((r) => ` · ${r.roomName} ${r.rating}/5`).join('')}
                </p>
                {review.comment && <p className="text-sm text-amber-900">"{review.comment}"</p>}
                <RecleanActions reviewId={review.id} clientId={review.clientId} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.rooms.length > 0 && (
        <section className="card">
          <h2 className="mb-3 font-semibold text-ink">Room scores</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.rooms.map((r) => (
              <li key={r.room} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm">
                <span className="text-ink">{r.room}</span>
                <span className={r.average < 4 ? 'font-semibold text-amber-700' : 'text-slate'}>{r.average.toFixed(1)} · {r.ratings} ratings</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-3">
        {reviews.map(({ review, clientName, bookingLabel }) => (
          <div key={review.id} className="card flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-gold" aria-hidden="true">
                  {'★'.repeat(review.rating)}
                  <span className="text-line">{'★'.repeat(5 - review.rating)}</span>
                </span>
                <span className="font-semibold text-ink">{clientName}</span>
                <span className="text-xs text-muted">· {bookingLabel}</span>
                {review.featured && <span className="pill bg-gold/15 text-bronze">Featured</span>}
              </div>
              {review.comment && <p className="mt-2 max-w-xl text-sm text-slate">"{review.comment}"</p>}
              {rooms.some((r) => r.reviewId === review.id) && (
                <p className="mt-1 text-xs text-muted">
                  {rooms.filter((r) => r.reviewId === review.id).map((r) => `${r.roomName} ${r.rating}/5`).join(' · ')}
                </p>
              )}
            </div>
            <FeatureReviewToggle reviewId={review.id} featured={review.featured} />
          </div>
        ))}
        {reviews.length === 0 && <div className="card text-center text-muted">No reviews yet.</div>}
      </div>
    </div>
  );
}
