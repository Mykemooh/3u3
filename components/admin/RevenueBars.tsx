/**
 * Daily revenue as bars — minimal gridlines, black bars, today in lime
 * (TRASHCAN guide §5, charts). Server-rendered SVG that scales to its
 * container; every bar carries its exact value as a title for hover and
 * screen readers.
 */
export default function RevenueBars({ series, width = 640 }: { series: { date: string; cents: number }[]; width?: number }) {
  const w = width;
  const h = 190;
  const padT = 12;
  const padL = 44;
  const padB = 24;
  const max = Math.max(10000, ...series.map((p) => p.cents));
  const nice = niceCeil(max);
  const innerW = w - padL;
  const innerH = h - padB - padT;
  const slot = innerW / series.length;
  const bw = Math.min(26, slot * 0.62);
  const money = (c: number) => (c >= 100000 ? `$${(c / 100000).toFixed(c % 100000 ? 1 : 0)}k` : `$${Math.round(c / 100)}`);
  const lastIdx = series.length - 1;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={`Revenue collected per day, last ${series.length} days`}>
      {[0, 0.5, 1].map((f) => {
        const y = padT + innerH - innerH * f;
        return (
          <g key={f}>
            <line x1={padL} x2={w} y1={y} y2={y} stroke="#EEF0F2" strokeWidth={1} />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#6B7280" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {money(nice * f)}
            </text>
          </g>
        );
      })}
      {series.map((p, i) => {
        const bh = p.cents > 0 ? Math.max(3, (p.cents / nice) * innerH) : 0;
        const x = padL + slot * i + (slot - bw) / 2;
        const isToday = i === lastIdx;
        const d = new Date(`${p.date}T12:00:00Z`);
        const label = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2);
        return (
          <g key={p.date}>
            <title>{`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}: $${(p.cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}</title>
            {bh === 0 ? (
              <rect x={x} y={padT + innerH - 2} width={bw} height={2} rx={1} fill="#E5E7EB" />
            ) : (
              <rect x={x} y={padT + innerH - bh} width={bw} height={bh} rx={4} fill={isToday ? '#B8FF00' : '#0B0F14'} stroke={isToday ? '#0B0F14' : 'none'} strokeWidth={isToday ? 1.5 : 0} />
            )}
            <text x={x + bw / 2} y={h - 6} textAnchor="middle" fontSize="11" fill={isToday ? '#0B0F14' : '#9CA3AF'} fontWeight={isToday ? 700 : 400}>
              {isToday ? 'Today' : label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function niceCeil(cents: number) {
  const dollars = cents / 100;
  const pow = 10 ** Math.floor(Math.log10(dollars));
  const steps = [1, 2, 2.5, 5, 10];
  const n = steps.find((s) => s * pow >= dollars) ?? 10;
  return n * pow * 100;
}
