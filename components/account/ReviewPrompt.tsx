'use client';

import { useState } from 'react';
import AvatarUpload from '@/components/AvatarUpload';
import { useT } from '@/components/i18n/LocaleProvider';
import { accountMessages } from '@/lib/i18n/messages/account';

export default function ReviewPrompt({
  jobId,
  name,
  avatarUrl,
  existingRating,
  rooms = [],
  googleReviewUrl = null,
}: {
  jobId: string;
  name: string;
  avatarUrl: string | null;
  existingRating: number | null;
  /** Rooms the crew finished, for the optional room-by-room score. */
  rooms?: { id: string; roomName: string }[];
  /** Only offered back by the server after a happy review. */
  googleReviewUrl?: string | null;
}) {
  const t = useT(accountMessages);
  const [roomScores, setRoomScores] = useState<Record<string, number>>({});
  const [outcome, setOutcome] = useState<{ googleReviewUrl: string | null; recleanRequested: boolean } | null>(null);
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
      body: JSON.stringify({
        rating: stars,
        comment: comment.trim() || undefined,
        rooms: Object.entries(roomScores).map(([itemId, r]) => ({ itemId, rating: r })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus('error');
      setError(data.error || t('reviewError'));
      return;
    }
    setOutcome({ googleReviewUrl: data.googleReviewUrl ?? null, recleanRequested: !!data.recleanRequested });
    setStatus('done');
  }

  if (status === 'done') {
    return (
      <div className="card text-center">
        <p className="font-semibold text-ink">{t('reviewThanks')}</p>
        {rating > 0 && <p className="mt-1 text-sm text-slate">{t(rating === 1 ? 'reviewYouRatedOne' : 'reviewYouRatedMany', { count: rating })}</p>}
        {outcome?.recleanRequested && (
          <p className="mx-auto mt-3 max-w-sm rounded-xl bg-cream px-4 py-3 text-sm text-ink">
            {t('reviewSorry')}
          </p>
        )}
        {outcome?.googleReviewUrl && (
          <div className="mt-4">
            <p className="text-sm text-slate">{t('reviewGoogleAsk')}</p>
            <a href={outcome.googleReviewUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm mt-3">{t('reviewGoogleButton')}</a>
          </div>
        )}
        {!avatarUrl && (
          <div className="mt-5 border-t border-line pt-5">
            <p className="mb-3 text-sm text-slate">{t('reviewAddAvatar')}</p>
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
      <p className="font-semibold text-ink">{t('reviewHow')}</p>
      <p className="mt-1 text-sm text-slate">{t('reviewSub')}</p>
      <div className="mt-4 flex justify-center gap-1" role="radiogroup" aria-label={t('reviewRatingAria')}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={t(star === 1 ? 'reviewStarsOne' : 'reviewStarsMany', { count: star })}
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
          {rooms.length > 0 && (
            <div className="rounded-xl bg-surface p-3 text-left">
              <p className="mb-2 text-xs font-semibold text-slate">{t('reviewRateRooms')}</p>
              <ul className="space-y-1.5">
                {rooms.map((room) => (
                  <li key={room.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-ink">{room.roomName}</span>
                    <span className="flex gap-0.5" role="radiogroup" aria-label={t('reviewRoomAria', { room: room.roomName })}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={roomScores[room.id] === n}
                          aria-label={t('reviewOfFive', { n })}
                          onClick={() => setRoomScores((s) => ({ ...s, [room.id]: n }))}
                          className="text-lg leading-none"
                        >
                          <span className={(roomScores[room.id] ?? 0) >= n ? 'text-gold' : 'text-line'}>★</span>
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <textarea
            className="input w-full"
            rows={3}
            placeholder={t('reviewPlaceholder')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button type="button" onClick={() => submit(rating)} disabled={status === 'saving'} className="btn-primary w-full">
            {status === 'saving' ? t('reviewSubmitting') : t('reviewSubmit')}
          </button>
          {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
