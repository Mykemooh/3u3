'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/components/i18n/LocaleProvider';
import { formsMessages } from '@/lib/i18n/messages/forms';

type Item = { slug: string; title: string; kind: 'FAQ' | 'SOP'; section: string; tags: string[]; body: string; source: 'PRODUCT' | 'COMPANY' };

/** Search box + sections. Search runs in the page; nothing is sent anywhere. */
export default function HelpCenter({ sections, base, askTex }: { sections: [string, Item[]][]; base: string; askTex?: boolean }) {
  const t = useT(formsMessages);
  const [q, setQ] = useState('');
  const all = useMemo(() => sections.flatMap(([, items]) => items), [sections]);
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return null;
    return all
      .map((a) => {
        const hay = `${a.title} ${a.tags.join(' ')} ${a.body}`.toLowerCase();
        const score = words.reduce(
          (s, w) => s + (a.title.toLowerCase().includes(w) ? 3 : 0) + (a.tags.some((t) => t.includes(w)) ? 3 : 0) + (hay.includes(w) ? 1 : 0),
          0,
        );
        return { a, score };
      })
      .filter((x) => x.score >= Math.max(1, words.length))
      .sort((x, y) => y.score - x.score)
      .map((x) => x.a);
  }, [q, all]);

  const card = (a: Item) => (
    <Link key={a.slug} href={`${base}/${a.slug}`} className="card-interactive block !p-4">
      <span className="flex items-center gap-2">
        <span className={`pill !px-2 !py-0.5 ${a.kind === 'SOP' ? 'bg-green/10 text-green' : 'bg-gold/10 text-gold'}`}>{a.kind === 'SOP' ? t('helpKindSop') : t('helpKindFaq')}</span>
        {a.source === 'COMPANY' && <span className="pill !px-2 !py-0.5 bg-surface text-slate">{t('helpOurs')}</span>}
      </span>
      <span className="mt-2 block font-semibold text-ink">{a.title}</span>
    </Link>
  );

  return (
    <div className="space-y-8">
      <div className="relative">
        <input
          className="input !py-3.5 pl-11"
          placeholder={t('helpSearchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('helpSearchAria')}
        />
        <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </div>
      {results ? (
        <section>
          <p className="mb-3 text-sm text-muted">
            {t(results.length === 1 ? 'helpResultOne' : 'helpResultMany', { count: results.length })}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">{results.map(card)}</div>
          {results.length === 0 && askTex && <p className="text-slate">{t('helpNothingMatched')}</p>}
        </section>
      ) : (
        sections.map(([title, items]) => (
          <section key={title}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">{items.map(card)}</div>
          </section>
        ))
      )}
    </div>
  );
}
