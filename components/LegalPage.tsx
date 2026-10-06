import PlatformShell from '@/components/PlatformShell';

export type LegalSection = { heading: string; body: (string | string[])[] };

/** A readable long-form page: a sticky contents list beside numbered sections. */
export default function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <PlatformShell className="bg-white">
      <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:px-8">
        <header className="max-w-[760px]">
          <h1 className="tc-h1">{title}</h1>
          <p className="mt-2 text-[14px] text-tc-500">Last updated {updated}</p>
          <p className="tc-lead mt-6">{intro}</p>
        </header>
        <div className="mt-12 grid gap-12 lg:grid-cols-[240px_1fr]">
          <nav aria-label="Sections" className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-[13px] font-semibold text-tc-500">On this page</p>
            <ol className="mt-3 space-y-1 border-l border-tc-200">
              {sections.map((s, i) => (
                <li key={s.heading}>
                  <a className="-ml-px block border-l-2 border-transparent py-1 pl-4 text-[14px] text-tc-700 hover:border-tc-black hover:text-tc-black" href={`#s${i + 1}`}>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="max-w-[70ch]">
            {sections.map((s, i) => (
              <section key={s.heading} id={`s${i + 1}`} className="scroll-mt-24 border-t border-tc-200 py-8 first:border-t-0 first:pt-0">
                <h2 className="tc-h3">
                  <span className="mr-2 tabular-nums text-tc-500">{i + 1}.</span>
                  {s.heading}
                </h2>
                <div className="mt-4 space-y-4 text-[16px] leading-relaxed text-tc-700">
                  {s.body.map((b, j) =>
                    Array.isArray(b) ? (
                      <ul key={j} className="list-disc space-y-2 pl-5 marker:text-tc-300">
                        {b.map((li) => (
                          <li key={li}>{li}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={j}>{b}</p>
                    ),
                  )}
                </div>
              </section>
            ))}
          </article>
        </div>
      </div>
    </PlatformShell>
  );
}
