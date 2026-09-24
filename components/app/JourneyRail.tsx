export type JourneyStep = { label: string; state: 'done' | 'current' | 'todo'; detail?: string };

/**
 * The flow line, as progress: each stage is a node on one continuous gold
 * line that fills up to where things stand. Used for the client's cleaning
 * (booked → paid) and the crew's job (start → finish), so both sides of the
 * business read progress the same way.
 */
export default function JourneyRail({ steps, compact = false }: { steps: JourneyStep[]; compact?: boolean }) {
  const n = steps.length;
  const lastReached = steps.reduce((acc, s, i) => (s.state !== 'todo' ? i : acc), 0);
  const fraction = n > 1 ? lastReached / (n - 1) : 0;
  // One column per step; the line runs from the centre of the first column
  // to the centre of the last, so every node sits exactly on it and the
  // gold fill ends exactly on the current node.
  const inset = `${50 / n}%`;
  return (
    <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-label="Progress">
      <span className="absolute top-3 h-[3px] rounded-full bg-line" style={{ left: inset, right: inset }} aria-hidden="true" />
      <span
        className="journey-fill absolute top-3 h-[3px] rounded-full bg-gold"
        style={{ left: inset, width: `calc((100% - ${100 / n}%) * ${fraction})` }}
        aria-hidden="true"
      />
      {steps.map((s) => (
        <li key={s.label} className="relative z-10 flex min-w-0 flex-col items-center px-0.5 text-center">
          <span
            aria-current={s.state === 'current' ? 'step' : undefined}
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
              s.state === 'done'
                ? 'border-gold bg-gold text-ink'
                : s.state === 'current'
                ? 'journey-pulse border-gold bg-white text-bronze'
                : 'border-line bg-white text-muted'
            }`}
          >
            {s.state === 'done' ? (
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                <path d="m5 10.5 3.2 3L15 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </span>
          {!compact && (
            <>
              <span className={`mt-2 text-[12px] font-semibold leading-tight ${s.state === 'todo' ? 'text-muted' : 'text-ink'}`}>
                {s.label}
              </span>
              {s.detail && <span className="mt-0.5 text-[11px] leading-tight text-muted">{s.detail}</span>}
            </>
          )}
          <span className="sr-only">
            {s.label}: {s.state === 'done' ? 'done' : s.state === 'current' ? 'in progress' : 'not yet'}
          </span>
        </li>
      ))}
    </ol>
  );
}
