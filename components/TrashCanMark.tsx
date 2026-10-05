/**
 * The TrashCan wordmark: a simple bin with a sparkle — the platform's own
 * mark, used on platform pages (signup, terms, status) and never on a
 * company's branded portals.
 */
export default function TrashCanMark({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="tc-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#016AEE" />
            <stop offset="1" stopColor="#2DBD91" />
          </linearGradient>
        </defs>
        <rect x="7" y="9" width="18" height="19" rx="3.5" fill="url(#tc-g)" />
        <rect x="5" y="6" width="22" height="4" rx="2" fill={light ? '#fff' : '#041730'} />
        <rect x="13" y="3" width="6" height="3" rx="1.5" fill={light ? '#fff' : '#041730'} />
        <path d="M16 13.5l1.2 2.8 2.8 1.2-2.8 1.2L16 21.5l-1.2-2.8-2.8-1.2 2.8-1.2z" fill="#fff" />
      </svg>
      <span className={`font-display text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>TrashCan</span>
    </span>
  );
}
