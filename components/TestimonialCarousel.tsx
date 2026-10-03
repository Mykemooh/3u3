'use client';

import { useEffect, useState } from 'react';

type Review = { rating: number; comment: string | null; clientName: string };

export default function TestimonialCarousel({ reviews }: { reviews: Review[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reviews.length < 2 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % reviews.length), 6000);
    return () => clearInterval(t);
  }, [reviews.length, paused]);

  if (reviews.length === 0) return null;
  const r = reviews[index];

  return (
    <section
      className="mt-24 w-full max-w-md"
      aria-label="What our clients say"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate">What our clients say</p>
      <div className="relative mt-6 min-h-[140px]">
        {reviews.map((review, i) => (
          <div
            key={i}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 transition-opacity duration-500"
            style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? 'auto' : 'none' }}
            aria-hidden={i !== index}
          >
            <span className="text-gold" aria-hidden="true">
              {'★'.repeat(review.rating)}
              <span className="text-line">{'★'.repeat(5 - review.rating)}</span>
            </span>
            {review.comment && <p className="text-lg font-medium text-ink">"{review.comment}"</p>}
            <p className="text-sm text-slate">— {review.clientName}</p>
          </div>
        ))}
      </div>
      {reviews.length > 1 && (
        <div className="mt-4 flex justify-center gap-1.5" role="tablist" aria-label="Select a review">
          {reviews.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Review ${i + 1} of ${reviews.length}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 w-5 rounded-full transition ${i === index ? 'bg-gold' : 'bg-line hover:bg-slate/40'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
