/**
 * TRASHCAN against the category leaders, for a five-person company.
 * Competitor figures are from their published pricing (October 2026) —
 * update this table when theirs change.
 */
const ROWS: { label: string; tc: string; jobber: string; hcp: string; zen: string }[] = [
  { label: 'Monthly price, 5 people', tc: '$0 – $129', jobber: '$139+', hcp: '$189+', zen: '$39 – $49' },
  { label: 'Per-seat fees', tc: 'Never', jobber: '$29 per extra user', hcp: '$35 per extra user', zen: 'Per employee' },
  { label: 'AI receptionist', tc: 'Included', jobber: 'Paid add-on', hcp: 'Paid add-on', zen: 'Not offered' },
  { label: 'Built for cleaning', tc: 'Yes', jobber: 'General field service', hcp: 'General field service', zen: 'Yes' },
  { label: 'Per-room timers', tc: 'Yes', jobber: 'No', hcp: 'No', zen: 'No' },
  { label: 'Live crew tracking for clients', tc: 'Every plan', jobber: 'Top plans', hcp: 'Yes', zen: 'Higher plans' },
  { label: 'Free plan', tc: 'Yes, $0 forever', jobber: 'Trial only', hcp: 'Trial only', zen: 'Trial only' },
];

export default function CompareTable({ className = '' }: { className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-tc-lg border border-tc-200 ${className}`}>
      <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
        <caption className="sr-only">TRASHCAN compared with Jobber, Housecall Pro and ZenMaid</caption>
        <thead>
          <tr className="bg-tc-50">
            <th scope="col" className="w-[26%] px-5 py-4 font-semibold text-tc-500">
              <span className="sr-only">Feature</span>
            </th>
            <th scope="col" className="bg-tc-black px-5 py-4 font-bold text-tc-lime">TRASHCAN</th>
            <th scope="col" className="px-5 py-4 font-semibold text-tc-900">Jobber</th>
            <th scope="col" className="px-5 py-4 font-semibold text-tc-900">Housecall Pro</th>
            <th scope="col" className="px-5 py-4 font-semibold text-tc-900">ZenMaid</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label} className="border-t border-tc-200">
              <th scope="row" className="px-5 py-4 font-medium text-tc-700">{r.label}</th>
              <td className="border-x border-tc-200 bg-tc-lime-wash/60 px-5 py-4 font-bold text-tc-black">{r.tc}</td>
              <td className="px-5 py-4 text-tc-700">{r.jobber}</td>
              <td className="px-5 py-4 text-tc-700">{r.hcp}</td>
              <td className="px-5 py-4 text-tc-700">{r.zen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
