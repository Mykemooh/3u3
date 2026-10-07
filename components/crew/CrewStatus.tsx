/**
 * A job's state, readable at a glance and the same everywhere in the
 * cleaner app: not started (grey ring), on the way (blue), in progress
 * (lime — the job you're on), done (green check), still open from a past
 * day (amber). `on="dark"` is for the black layer (the home hero, the job
 * header). Labels are passed in so this works in server and client code.
 */
export type CrewJobState = 'PENDING' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETE' | 'MISSED';

const LIGHT: Record<CrewJobState, string> = {
  PENDING: 'bg-tc-100 text-tc-700',
  EN_ROUTE: 'bg-[#EAF2FE] text-[#1D4ED8]',
  IN_PROGRESS: 'bg-tc-lime-wash text-tc-lime-ink ring-1 ring-inset ring-[#D9F99D]',
  COMPLETE: 'bg-emerald-50 text-emerald-700',
  MISSED: 'bg-amber-50 text-amber-800',
};
const DARK: Record<CrewJobState, string> = {
  PENDING: 'bg-white/10 text-white/85',
  EN_ROUTE: 'bg-[#3882F6]/25 text-[#BFDBFE]',
  IN_PROGRESS: 'bg-tc-lime text-tc-black',
  COMPLETE: 'bg-emerald-400/15 text-emerald-300',
  MISSED: 'bg-amber-400/15 text-amber-200',
};

export default function CrewStatus({ state, label, on = 'light', className = '' }: { state: CrewJobState; label: string; on?: 'light' | 'dark'; className?: string }) {
  const tone = (on === 'dark' ? DARK : LIGHT)[state];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-2 pr-2.5 text-[12px] font-semibold leading-none ${tone} ${className}`}>
      <StateMark state={state} />
      {label}
    </span>
  );
}

function StateMark({ state }: { state: CrewJobState }) {
  if (state === 'COMPLETE') {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
        <path d="m5 10.5 3.2 3L15 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'PENDING') return <span className="h-2 w-2 rounded-full border-[1.5px] border-current opacity-70" aria-hidden="true" />;
  if (state === 'IN_PROGRESS') return <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />;
  if (state === 'EN_ROUTE') {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z" />
      </svg>
    );
  }
  return <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />;
}
