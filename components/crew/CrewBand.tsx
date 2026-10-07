/**
 * The black layer at the top of every cleaner screen. It runs straight on
 * from the black header (components/app/AppShell.tsx, crew look) edge to
 * edge, and holds what matters right now: the next job on home, the job
 * you're on, or the page's title. Lime lives here (guide: lime belongs on
 * the dark layer), so the one primary action on a screen sits in it or in
 * the black dock at the bottom.
 *
 * The inner column matches AppShell's (max-w-xl, md:max-w-3xl).
 */
export default function CrewBand({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`tc-dark relative left-1/2 w-screen -translate-x-1/2 rounded-b-[28px] bg-tc-black ${className}`}>
      <div className="mx-auto max-w-xl px-4 pb-6 pt-4 sm:px-5 md:max-w-3xl md:pb-8 md:pt-6">{children}</div>
    </div>
  );
}

/** A plain page head on the black layer: title and one line of help. */
export function CrewPageHead({ title, intro, children }: { title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <CrewBand>
      {children}
      <h1 className="font-tc-display text-[28px] font-extrabold leading-[1.1] tracking-[-0.025em] text-white text-balance md:text-[34px]">{title}</h1>
      {intro && <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-white/65">{intro}</p>}
    </CrewBand>
  );
}
