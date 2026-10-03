'use client';

import { useState } from 'react';
import AvatarUpload from '@/components/AvatarUpload';

export default function ReviewPrompt({
  jobId,
  name,
  avatarUrl,
  existingRating,
}: {
  jobId: string;
  name: string;
  avatarUrl: string | null;
  existingRating: number | null;
}) {
  const [rating, setRating] = useState(existingRating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>(existingRating ? 'done' : 'idle');
  const [error, setError] = useState('');

  async function submit(stars: number) {
    setRating(stars);
    setStatus('saving');
    setError('');
    const res = await fetch(`/api/account/jobs/${jobId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: stars, comment: comment.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus('error');
      setError(data.error || 'Something went wrong.');
      return;
    }
    setStatus('done');
  }

  if (status === 'done') {
    return (
      <div className="card text-center">
        <p className="font-semibold text-ink">Thanks for your feedback! 🎉</p>
        {rating > 0 && <p className="mt-1 text-sm text-slate">You rated this cleaning {rating} star{rating === 1 ? '' : 's'}.</p>}
        {!avatarUrl && (
          <div className="mt-5 border-t border-line pt-5">
            <p className="mb-3 text-sm text-slate">Want to add a profile picture?</p>
            <div className="flex justify-center">
              <AvatarUpload name={name} initialUrl={avatarUrl} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card text-center">
      <p className="font-semibold text-ink">How was your cleaning?</p>
      <p className="mt-1 text-sm text-slate">Rate this visit — it helps us and other clients.</p>
      <div className="mt-4 flex justify-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            disabled={status === 'saving'}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(star)}
            className="text-3xl leading-none transition hover:scale-110"
          >
            <span className={(hoverRating || rating) >= star ? 'text-gold' : 'text-line'}>★</span>
          </button>
        ))}
      </div>
      {rating > 0 && (
        <div className="mx-auto mt-4 max-w-sm space-y-3">
          <textarea
            className="input w-full"
            rows={3}
            placeholder="Anything you'd like to add? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button type="button" onClick={() => submit(rating)} disabled={status === 'saving'} className="btn-primary w-full">
            {status === 'saving' ? 'Submitting…' : 'Submit review'}
          </button>
          {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
