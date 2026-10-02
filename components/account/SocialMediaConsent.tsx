'use client';

import { useState } from 'react';

/**
 * Asked once, on the client's before-and-after gallery — exactly where
 * they're looking at the photos in question. Their answer (yes or no,
 * both count) is remembered and covers every future cleaning too, so this
 * never prompts again — it just shows a one-line reminder of their answer
 * with a way to change it, rather than asking fresh on every job.
 */
export default function SocialMediaConsent({ initialConsent }: { initialConsent: boolean | null }) {
  const [consent, setConsent] = useState(initialConsent);
  const [busy, setBusy] = useState(false);

  async function answer(value: boolean) {
    setBusy(true);
    const res = await fetch('/api/account/social-consent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: value }),
    });
    setBusy(false);
    if (res.ok) setConsent(value);
  }

  if (consent !== null) {
    return (
      <p className="card text-sm text-slate">
        {consent
          ? "Thanks — we'll sometimes share photos like these on social media. "
          : "Got it — we won't share these photos anywhere. "}
        <button onClick={() => answer(!consent)} disabled={busy} className="font-semibold text-bronze hover:underline">
          Change this
        </button>
      </p>
    );
  }

  return (
    <div className="card space-y-3">
      <p className="font-semibold text-ink">Mind if we share photos like these?</p>
      <p className="text-sm text-slate">
        We'd love to show off results like this on our social media (just the before/after — never your address
        or other details). This is a one-time ask — whatever you choose covers this cleaning and every future one,
        and you can change your mind anytime.
      </p>
      <div className="flex gap-2">
        <button onClick={() => answer(true)} disabled={busy} className="btn-primary !px-4 !py-2 text-sm">
          Yes, you can share them
        </button>
        <button onClick={() => answer(false)} disabled={busy} className="btn-secondary !px-4 !py-2 text-sm">
          No thanks
        </button>
      </div>
    </div>
  );
}
