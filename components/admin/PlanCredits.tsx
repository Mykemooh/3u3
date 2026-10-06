'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { PLANS, PLAN_ORDER, dollars, feeLabel, type PlanKey } from '@/lib/billing/plans';

type Wallet = {
  balanceCents: number;
  includedTexts: number;
  includedMinutes: number;
  autoTopUp: boolean;
  autoAmountCents: number;
  autoThresholdCents: number;
  card: string | null;
  textingStatus: 'NONE' | 'PENDING_PAYMENT' | 'REGISTERING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
  numberPaidThrough: string | null;
};
type Row = { id: string; at: string; type: string; reason: string; quantity: number; amountCents: number; balanceAfterCents: number; note: string | null };
type Usage = { texts: { qty: number; spentCents: number }; voiceMinutes: { qty: number; spentCents: number }; number: { qty: number; spentCents: number } };

const REASON: Record<string, string> = { SMS: 'Texts', VOICE: 'Tex phone minutes', PHONE_NUMBER: 'Business number', SETUP_FEE: 'Texting setup', TOPUP: 'Credits added', MANUAL: 'Adjustment' };

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data as { url?: string; message?: string };
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function PlanCredits(props: {
  flash: string | null;
  stripeReady: boolean;
  company: string;
  exempt: boolean;
  plan: PlanKey;
  effective: PlanKey;
  comp: string | null;
  subscribed: boolean;
  hasCustomer: boolean;
  intakePlan: PlanKey | null;
  cardVolumeCents: number;
  best: { key: PlanKey; costCents: number; currentCostCents: number };
  smsNumber: string | null;
  wallet: Wallet;
  usage: Usage;
  ledger: Row[];
  rates: { sms: number; voice: number; number: number; setup: number; topUps: number[] };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(props.flash);
  const [choice, setChoice] = useState<PlanKey>(props.intakePlan ?? props.plan);
  const [auto, setAuto] = useState(props.wallet.autoTopUp);
  const [autoAmount, setAutoAmount] = useState(props.wallet.autoAmountCents);
  const [code, setCode] = useState('');

  async function act(key: string, fn: () => Promise<{ url?: string; message?: string } | void>) {
    setBusy(key);
    setError('');
    try {
      const r = await fn();
      if (r && r.url) {
        window.location.href = r.url;
        return;
      }
      if (r && r.message) setNotice(r.message);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const w = props.wallet;
  const current = PLANS[props.effective];
  const saving = props.best.currentCostCents - props.best.costCents;
  const textAllowance = PLANS[props.effective].includedTexts;
  const minuteAllowance = PLANS[props.effective].includedVoiceMinutes;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-tc-display text-[28px] font-extrabold tracking-[-0.03em]">Plan & credits</h2>
          <p className="mt-1 text-[15px] text-tc-700">What {props.company} pays TRASHCAN, and the credits that pay for texts and Tex phone calls.</p>
        </div>
        <a href="/api/admin/billing/ledger" className="tc-btn-ghost tc-btn-sm">
          <Icon name="download" size={15} /> Credit history (CSV)
        </a>
      </div>

      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-tc-md bg-emerald-50 px-4 py-3 text-[14px] font-medium text-emerald-800 ring-1 ring-emerald-200">
          <Icon name="check" size={16} /> {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-tc-md bg-red-50 px-4 py-3 text-[14px] text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      {!props.stripeReady && !props.exempt && (
        <p className="rounded-tc-md bg-amber-50 px-4 py-3 text-[14px] text-amber-800 ring-1 ring-amber-200">
          Payments aren’t switched on for TRASHCAN yet, so plan changes and credits can’t be bought from here today.
        </p>
      )}

      {props.exempt ? (
        <section className="tc-dark relative overflow-hidden rounded-tc-lg p-6 md:p-8">
          <div aria-hidden="true" className="tc-grid-bg pointer-events-none absolute inset-0" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="inline-flex items-center gap-2 rounded-md bg-tc-lime px-2 py-0.5 text-[12px] font-bold text-tc-black">House account</p>
              <h3 className="mt-3 font-tc-display text-[26px] font-extrabold tracking-[-0.02em] text-white">Every feature. No platform fee. No metered usage.</h3>
              <p className="mt-2 max-w-[60ch] text-[15px] text-white/65">
                {props.company} runs on TRASHCAN’s Team plan as the platform’s own company. Card payments carry only Stripe’s processing cost, and texts and Tex calls are never paused. Usage is still logged below so you can see what it would cost a customer.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          {/* ---- Plan ---- */}
          <div className="tc-card p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-tc-500">Current plan</p>
                <p className="mt-1 font-tc-display text-[30px] font-extrabold tracking-[-0.03em]">
                  {current.name} <span className="text-[16px] font-semibold text-tc-500">{dollars(current.monthlyCents)}/mo · {feeLabel(current).toLowerCase()}</span>
                </p>
                {props.comp && (
                  <p className="mt-1 text-[14px] text-tc-700">
                    Complimentary Team {props.comp === 'forever' ? 'for good' : `until ${fmtDate(props.comp)}`} — then {PLANS[props.plan].name}.
                  </p>
                )}
              </div>
              {props.hasCustomer && (
                <button type="button" className="tc-btn-ghost tc-btn-sm" disabled={!!busy} onClick={() => act('portal', () => post('/api/admin/billing/portal'))}>
                  <Icon name="card" size={15} /> Card & invoices
                </button>
              )}
            </div>

            {props.intakePlan && (
              <p className="mt-4 rounded-tc-md bg-tc-lime-wash px-4 py-3 text-[14px] ring-1 ring-[#E3F5A8]">
                You picked <strong>{PLANS[props.intakePlan].name}</strong> when you signed up. Finish checkout below whenever you’re ready.
              </p>
            )}

            <div role="radiogroup" aria-label="Choose a plan" className="mt-5 grid gap-2.5 sm:grid-cols-3">
              {PLAN_ORDER.map((k) => {
                const p = PLANS[k];
                const on = choice === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setChoice(k)}
                    className={`rounded-tc-md border p-4 text-left transition-[border-color,box-shadow] ${on ? 'border-tc-black shadow-[0_0_0_1px_#0B0F14]' : 'border-tc-200 hover:border-tc-500'}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-[15px] font-bold">{p.name}</span>
                      {props.plan === k && <span className="rounded bg-tc-100 px-1.5 py-0.5 text-[11px] font-bold text-tc-700">Current</span>}
                    </span>
                    <span className="mt-2 block font-tc-display text-[22px] font-extrabold tabular-nums">{dollars(p.monthlyCents)}<span className="text-[13px] font-semibold text-tc-500">/mo</span></span>
                    <span className="block text-[12px] text-tc-500">{feeLabel(p)}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="tc-btn-dark"
                disabled={!!busy || choice === props.plan || !props.stripeReady}
                onClick={() => act('plan', () => post('/api/admin/billing/plan', { plan: choice }))}
              >
                {busy === 'plan' ? 'One moment…' : choice === props.plan ? 'This is your plan' : choice === 'FREE' ? 'Switch to Free' : props.subscribed ? `Switch to ${PLANS[choice].name}` : `Continue to checkout`}
              </button>
              <span className="text-[13px] text-tc-500">Change any time. Paid plans renew monthly; moving to Free takes effect at the end of the period.</span>
            </div>
          </div>

          {/* ---- Best plan for you ---- */}
          <div className="tc-card flex flex-col p-5 md:p-6">
            <p className="text-[13px] font-semibold text-tc-500">Last 30 days</p>
            <p className="mt-1 font-tc-display text-[30px] font-extrabold tabular-nums tracking-[-0.03em]">{dollars(props.cardVolumeCents)}</p>
            <p className="text-[14px] text-tc-700">in card payments through TRASHCAN</p>
            <div className="mt-5 flex-1 rounded-tc-md bg-tc-50 p-4">
              {props.best.key === props.effective || saving <= 0 ? (
                <p className="text-[14px]">
                  <strong>{current.name} is the cheapest plan for you</strong> at this volume — about {dollars(props.best.currentCostCents)} a month.
                </p>
              ) : (
                <>
                  <p className="text-[14px]">
                    <strong>{PLANS[props.best.key].name}</strong> would have cost {dollars(props.best.costCents)} instead of {dollars(props.best.currentCostCents)}.
                  </p>
                  <button type="button" onClick={() => setChoice(props.best.key)} className="mt-2 text-[14px] font-semibold underline decoration-tc-300 underline-offset-4 hover:decoration-tc-black">
                    Choose {PLANS[props.best.key].name} — save {dollars(saving)}/mo
                  </button>
                </>
              )}
            </div>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act('code', async () => {
                  await post('/api/admin/billing/redeem', { code });
                  setCode('');
                  return { message: 'Code applied — enjoy Team.' };
                });
              }}
            >
              <label className="sr-only" htmlFor="tc-promo">Promo code</label>
              <input id="tc-promo" className="tc-input h-10 py-0" placeholder="Promo code" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="tc-btn-ghost tc-btn-sm shrink-0" disabled={!code.trim() || !!busy}>Apply</button>
            </form>
          </div>
        </section>
      )}

      {/* ---- Credits + texting ---- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="tc-card p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-tc-500">Credit balance</p>
              <p className="mt-1 font-tc-display text-[40px] font-extrabold leading-none tabular-nums tracking-[-0.03em]">{dollars(w.balanceCents, { cents: true })}</p>
            </div>
            {props.exempt && <span className="tc-status bg-tc-lime-wash text-tc-lime-ink">Not needed</span>}
            {!props.exempt && w.balanceCents === 0 && w.includedTexts === 0 && (
              <span className="tc-status bg-red-50 text-red-700">Texting paused</span>
            )}
          </div>

          {!props.exempt && (textAllowance > 0 || minuteAllowance > 0) && (
            <div className="mt-5 space-y-3">
              {[
                ['Included texts left', w.includedTexts, textAllowance],
                ['Included Tex minutes left', w.includedMinutes, minuteAllowance],
              ].map(([label, left, total]) => (
                <div key={label as string}>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-tc-700">{label}</span>
                    <span className="font-semibold tabular-nums">
                      {(left as number).toLocaleString()} / {(total as number).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-tc-100">
                    <div className="h-full rounded-full bg-tc-black" style={{ width: `${Math.min(100, ((left as number) / Math.max(1, total as number)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {props.exempt && (
            <p className="mt-4 text-[14px] text-tc-700">A house account never spends credits — texts and Tex calls are on the platform. Customer companies prepay here.</p>
          )}
          {!props.exempt && (
            <>
              <p className="mt-6 text-[13px] font-semibold text-tc-700">Add credits</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {props.rates.topUps.map((c) => (
                  <button key={c} type="button" className="tc-btn-ghost" disabled={!!busy || !props.stripeReady} onClick={() => act(`top-${c}`, () => post('/api/admin/billing/topup', { cents: c }))}>
                    {busy === `top-${c}` ? '…' : dollars(c)}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-tc-md bg-tc-50 p-4">
                <div>
                  <p className="text-[14px] font-semibold">Auto top-up</p>
                  <p className="text-[13px] text-tc-500">
                    {w.card ? `Adds credits on ${w.card} when you drop below ${dollars(w.autoThresholdCents)}.` : 'Add credits once by card to turn this on.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="tc-auto-amt">Top-up amount</label>
                  <select id="tc-auto-amt" className="h-10 rounded-[10px] border border-tc-300 bg-white px-2 text-[14px]" value={autoAmount} onChange={(e) => setAutoAmount(Number(e.target.value))} disabled={!w.card}>
                    {[2000, 5000, 10000].map((c) => (
                      <option key={c} value={c}>{dollars(c)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={auto}
                    aria-label="Auto top-up"
                    disabled={!w.card || !!busy}
                    onClick={() =>
                      act('auto', async () => {
                        await post('/api/admin/billing/auto-topup', { enabled: !auto, amountCents: autoAmount });
                        setAuto(!auto);
                      })
                    }
                    className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-40 ${auto ? 'bg-tc-black' : 'bg-tc-300'}`}
                  >
                    <span className={`absolute top-1 h-5 w-5 rounded-full transition-[left] duration-200 ${auto ? 'left-6 bg-tc-lime' : 'left-1 bg-white'}`} />
                  </button>
                </div>
              </div>
              <p className="mt-4 text-[13px] text-tc-500">
                Texts {props.rates.sms}¢ each · Tex phone minutes {props.rates.voice}¢ · business number {dollars(props.rates.number)}/month. With no credits, texts and calls pause — email, the app and Tex web chat keep working.
              </p>
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="tc-card p-5 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-tc-500">Business texting number</p>
                <p className="mt-1 font-tc-display text-[22px] font-extrabold tabular-nums">{props.smsNumber ?? 'Not set up'}</p>
              </div>
              <TextingStatus status={w.textingStatus} hasNumber={!!props.smsNumber} exempt={props.exempt} />
            </div>
            <p className="mt-3 text-[14px] text-tc-700">
              {w.textingStatus === 'REGISTERING'
                ? 'We’re registering your number with US carriers. That usually takes a few business days — client messages go by email until it’s live.'
                : w.textingStatus === 'SUSPENDED'
                  ? 'Your credits couldn’t cover this month’s number fee. Add credits within 30 days to keep the number.'
                  : props.smsNumber
                    ? `Clients text and call this number. ${w.numberPaidThrough && !props.exempt ? `Paid through ${fmtDate(w.numberPaidThrough)}.` : ''}`
                    : `Two-way texting and Tex on the phone use your own business number. One-time setup of ${dollars(props.rates.setup)} covers the number and US carrier registration.`}
            </p>
            {!props.exempt && !props.smsNumber && (w.textingStatus === 'NONE' || w.textingStatus === 'PENDING_PAYMENT' || w.textingStatus === 'REJECTED') && (
              <button type="button" className="tc-btn-dark mt-4" disabled={!!busy || !props.stripeReady} onClick={() => act('texting', () => post('/api/admin/billing/texting'))}>
                <Icon name="phone" size={16} /> Set up texting — {dollars(props.rates.setup)}
              </button>
            )}
          </div>

          <div className="tc-card p-5 md:p-6">
            <p className="text-[13px] font-semibold text-tc-500">This month</p>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              {[
                ['Texts', props.usage.texts.qty.toLocaleString(), props.usage.texts.spentCents],
                ['Tex minutes', props.usage.voiceMinutes.qty.toLocaleString(), props.usage.voiceMinutes.spentCents],
                ['Number', props.usage.number.qty ? 'Paid' : '—', props.usage.number.spentCents],
              ].map(([k, v, c]) => (
                <div key={k as string} className="rounded-tc-md bg-tc-50 p-3">
                  <dt className="text-[12px] text-tc-500">{k}</dt>
                  <dd className="mt-0.5 font-tc-display text-[20px] font-extrabold tabular-nums">{v}</dd>
                  <dd className="text-[12px] text-tc-500">{props.exempt ? 'House account' : `${dollars(c as number, { cents: true })} from credits`}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ---- History ---- */}
      <section className="tc-card overflow-hidden">
        <h3 className="px-5 pb-3 pt-5 text-[16px] font-bold">Credit history</h3>
        {props.ledger.length === 0 ? (
          <p className="px-5 pb-6 text-[14px] text-tc-500">Nothing yet. Texts, calls and top-ups show up here as they happen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[14px]">
              <thead>
                <tr className="border-y border-tc-100 bg-tc-50 text-[12px] font-semibold text-tc-500">
                  <th className="px-5 py-2.5">When</th>
                  <th className="px-5 py-2.5">What</th>
                  <th className="px-5 py-2.5 text-right">Qty</th>
                  <th className="px-5 py-2.5 text-right">Amount</th>
                  <th className="px-5 py-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tc-100">
                {props.ledger.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-tc-500">{new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="px-5 py-2.5">
                      {REASON[r.reason] ?? r.reason}
                      {r.type === 'ALLOWANCE' && <span className="ml-2 text-[12px] text-tc-500">{r.note ?? 'Included'}</span>}
                      {r.type === 'REFUND' && <span className="ml-2 text-[12px] text-tc-500">Refunded</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.quantity || ''}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold tabular-nums ${r.amountCents > 0 ? 'text-emerald-700' : ''}`}>
                      {r.amountCents === 0 ? '—' : `${r.amountCents > 0 ? '+' : '−'}${dollars(Math.abs(r.amountCents), { cents: true })}`}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-tc-500">{dollars(r.balanceAfterCents, { cents: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TextingStatus({ status, hasNumber, exempt }: { status: Wallet['textingStatus']; hasNumber: boolean; exempt: boolean }) {
  if (exempt && hasNumber) return <span className="tc-status bg-emerald-50 text-emerald-700">Live</span>;
  const map: Record<Wallet['textingStatus'], [string, string] | null> = {
    NONE: hasNumber ? ['Live', 'bg-emerald-50 text-emerald-700'] : null,
    PENDING_PAYMENT: ['Waiting for payment', 'bg-tc-100 text-tc-700'],
    REGISTERING: ['Registering', 'bg-blue-50 text-blue-700'],
    ACTIVE: ['Live', 'bg-emerald-50 text-emerald-700'],
    REJECTED: ['Needs attention', 'bg-red-50 text-red-700'],
    SUSPENDED: ['Paused', 'bg-amber-50 text-amber-700'],
  };
  const m = map[status];
  return m ? <span className={`tc-status ${m[1]}`}>{m[0]}</span> : null;
}
