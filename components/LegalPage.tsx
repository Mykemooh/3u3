import PlatformShell from '@/components/PlatformShell';

export type LegalSection = { heading: string; body: (string | string[])[] };

/** A readable long-form page: numbered sections, paragraphs and lists. */
export default function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <PlatformShell>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="text-3xl font-extrabold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">Last updated {updated}</p>
        <p className="mt-6 text-lg text-slate">{intro}</p>
        <nav aria-label="Sections" className="mt-6 rounded-xl bg-white p-4 text-sm">
          <ol className="grid gap-1 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.heading}><a className="text-gold hover:underline" href={`#s${i + 1}`}>{i + 1}. {s.heading}</a></li>
            ))}
          </ol>
        </nav>
        {sections.map((s, i) => (
          <section key={s.heading} id={`s${i + 1}`} className="mt-10 scroll-mt-20">
            <h2 className="text-xl font-bold text-ink">{i + 1}. {s.heading}</h2>
            <div className="mt-3 space-y-3 text-slate">
              {s.body.map((b, j) =>
                Array.isArray(b) ? (
                  <ul key={j} className="list-disc space-y-1.5 pl-5">{b.map((li) => <li key={li}>{li}</li>)}</ul>
                ) : (
                  <p key={j}>{b}</p>
                ),
              )}
            </div>
          </section>
        ))}
      </article>
    </PlatformShell>
  );
}
