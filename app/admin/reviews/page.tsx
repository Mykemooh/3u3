import { getTenant } from '@/lib/data';
import { getReviewsForTenant } from '@/lib/reviews';
import FeatureReviewToggle from '@/components/admin/FeatureReviewToggle';

export const dynamic = 'force-dynamic';

export default async function AdminReviews() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const reviews = await getReviewsForTenant(tenant.id);
  const featuredCount = reviews.filter((r) => r.review.featured).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Reviews</h1>
        <p className="text-slate">
          Every rating a client leaves after a cleaning. Feature the ones you want showing in the landing page's
          testimonial carousel — nothing goes public on its own. {featuredCount > 0 && `${featuredCount} currently featured.`}
        </p>
      </div>

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
            </div>
            <FeatureReviewToggle reviewId={review.id} featured={review.featured} />
          </div>
        ))}
        {reviews.length === 0 && <div className="card text-center text-muted">No reviews yet.</div>}
      </div>
    </div>
  );
}
