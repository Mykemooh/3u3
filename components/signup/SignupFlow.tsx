'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { TcIcon } from '@/components/tc/TcLogo';
import { PLANS, PLAN_ORDER, bestPlanFor, dollars, feeLabel, type PlanKey } from '@/lib/billing/plans';
import type { IconName } from '@/lib/adminNav';

type Option = readonly [string, string];
type Questions = Record<'services' | 'teamSize' | 'pricing' | 'focus' | 'heardFrom', { label: string; options: readonly Option[] }>;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}

// What each answer means, in a line — so every choice is self-explanatory.
const DETAIL: Record<string, { icon: IconName; hint: string }> = {
  RESIDENTIAL: { icon: 'home', hint: 'Weekly, bi-weekly and monthly homes' },
  DEEP_MOVE: { icon: 'box', hint: 'One-off deep cleans, move-in and move-out' },
  RENTALS: { icon: 'repeat', hint: 'Turnovers between guests' },
  POST_CONSTRUCTION: { icon: 'layers', hint: 'Phased cleans for builders' },
  COMMERCIAL: { icon: 'jobs', hint: 'Offices on a monthly contract' },
  SOLO: { icon: 'users', hint: 'You do the cleaning' },
  SMALL: { icon: 'team', hint: 'One or two crews' },
  MEDIUM: { icon: 'team', hint: 'Several crews, an office helper' },
  LARGE: { icon: 'team', hint: 'Dispatchers and many crews' },
  WALKTHROUGH: { icon: 'map', hint: 'A visit, then a quote' },
  FLAT_BY_SIZE: { icon: 'quote', hint: 'Bedrooms, bathrooms, square feet' },
  HOURLY: { icon: 'clock', hint: 'Time on site' },
  NOT_SURE: { icon: 'help', hint: 'We’ll suggest a starting point' },
  SCHEDULING: { icon: 'calendar', hint: 'Calendar, recurring cleans, routes' },
  PAYMENTS: { icon: 'card', hint: 'Invoices, autopay, reminders' },
  GROWTH: { icon: 'trend', hint: 'Leads, reviews, referrals' },
  TEAM: { icon: 'wallet', hint: 'Crew app, pay rules, payroll' },
  FRIEND: { icon: 'users', hint: '' },
  SEARCH: { icon: 'search', hint: '' },
  SOCIAL: { icon: 'megaphone', hint: '' },
  OTHER: { icon: 'more', hint: '' },
};

type StepKey = 'email' | 'code' | 'about' | 'services' | 'team' | 'workflow' | 'plan' | 'review' | 'done';
const FLOW: { key: StepKey; title: string }[] = [
  { key: 'email', title: 'Email' },
  { key: 'code', title: 'Confirm' },
  { key: 'about', title: 'You' },
  { key: 'services', title: 'Services' },
  { key: 'team', title: 'Team' },
  { key: 'workflow', title: 'How you work' },
  { key: 'plan', title: 'Plan' },
  { key: 'review', title: 'Review' },
];

function OptionCards({
  options,
  value,
  onChange,
  multi,
  columns = 2,
  name,
}: {
  options: readonly Option[];
  value: string[];
  onChange: (v: string[]) => void;
  multi?: boolean;
  columns?: 1 | 2;
  name: string;
}) {
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label={name} className={`grid gap-2.5 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
      {options.map(([k, label]) => {
        const on = value.includes(k);
        const d = DETAIL[k];
        return (
          <button
            key={k}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            onClick={() => onChange(multi ? (on ? value.filter((v) => v !== k) : [...value, k]) : [k])}
            className={`group flex min-h-[64px] items-center gap-3 rounded-tc-md border px-4 py-3 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tc-black ${
              on ? 'border-tc-black bg-white shadow-[0_0_0_1px_#0B0F14]' : 'border-tc-200 bg-white hover:border-tc-500'
            }`}
          >
            {d && (
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${on ? 'bg-tc-black text-tc-lime' : 'bg-tc-100 text-tc-700'}`}>
                <Icon name={d.icon} size={18} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-tc-900">{label}</span>
              {d?.hint ? <span className="block text-[13px] text-tc-500">{d.hint}</span> : null}
            </span>
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center border transition-colors ${multi ? 'rounded-md' : 'rounded-full'} ${
                on ? 'border-tc-black bg-tc-black text-tc-lime' : 'border-tc-300 bg-white'
              }`}
            >
              {on && <Icon name="check" size={13} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  return (
    <div className="flex gap-2" onPaste={(e) => {
      const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (p) {
        e.preventDefault();
        onChange(p);
        refs.current[Math.min(p.length, 5)]?.focus();
      }
    }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`Digit ${i + 1}`}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={d.trim()}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, '').slice(-1);
            const next = (value.slice(0, i) + ch + value.slice(i + 1)).slice(0, 6);
            onChange(next.replace(/\s/g, ''));
            if (ch && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i].trim() && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
          }}
          className="h-14 w-full min-w-0 rounded-tc-md border border-tc-300 bg-white text-center font-tc-display text-[24px] font-extrabold text-tc-900 transition focus:border-tc-black focus:outline-none focus:shadow-[0_0_0_4px_rgba(184,255,0,0.45)]"
        />
      ))}
    </div>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s += 1;
  if (pw.length >= 14) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s += 1;
  return s;
}

/** A live picture of the workspace they're building, on the right. */
function Preview({ companyName, services, teamSize, focus, plan, questions, area }: { companyName: string; services: string[]; teamSize: string; focus: string; plan: PlanKey; questions: Questions; area: string }) {
  const label = (k: keyof Questions, key: string) => questions[k].options.find((o) => o[0] === key)?.[1];
  const initials = (companyName || 'Your company').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const setup = [
    { t: 'Add your services and rates', done: services.length > 0 },
    { t: focus ? `Set up ${label('focus', focus)?.toLowerCase()}` : 'Pick what to set up first', done: !!focus },
    { t: 'Invite your team', done: false },
    { t: 'Connect Stripe to get paid', done: false },
  ];
  return (
    <div className="relative w-full max-w-[460px]">
      <p className="mb-4 text-[13px] font-semibold text-white/50">Your workspace, as you build it</p>
      <div className="overflow-hidden rounded-tc-lg bg-white text-tc-900 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)]">
        <div className="flex">
          <div className="flex w-14 flex-col items-center gap-3 bg-tc-black py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-tc-display text-[12px] font-extrabold text-white">{initials}</span>
            {(['home', 'calendar', 'users', 'quote', 'invoice'] as IconName[]).map((n, i) => (
              <span key={n} className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === 0 ? 'bg-tc-lime/15 text-tc-lime' : 'text-white/45'}`}>
                <Icon name={n} size={16} />
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1 bg-[#F6F7F9] p-4">
            <p className="truncate font-tc-display text-[17px] font-extrabold tracking-[-0.02em]">{companyName || 'Your company'}</p>
            <p className="truncate text-[12px] text-tc-500">{area || 'Your service area'} · {teamSize ? label('teamSize', teamSize) : 'Your team'}</p>
            <div className="mt-3 flex min-h-[26px] flex-wrap gap-1.5">
              {services.length === 0 ? (
                <span className="rounded-md border border-dashed border-tc-300 px-2 py-0.5 text-[11px] text-tc-500">Services you offer</span>
              ) : (
                services.map((s) => (
                  <span key={s} className="animate-tc-rise rounded-md bg-tc-black px-2 py-0.5 text-[11px] font-semibold text-white">
                    {label('services', s)}
                  </span>
                ))
              )}
            </div>
            <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-tc-200">
              <p className="text-[12px] font-semibold">Setup guide</p>
              <ul className="mt-2 space-y-1.5">
                {setup.map((s) => (
                  <li key={s.t} className="flex items-center gap-2 text-[12px]">
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full ${s.done ? 'bg-tc-black text-tc-lime' : 'ring-1 ring-tc-300'}`}>
                      {s.done && <Icon name="check" size={10} />}
                    </span>
                    <span className={s.done ? 'text-tc-900' : 'text-tc-500'}>{s.t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-tc-lime-wash px-3 py-2.5 ring-1 ring-[#E3F5A8]">
              <span className="text-[12px] font-semibold text-tc-lime-ink">{PLANS[plan].name} plan</span>
              <span className="text-[12px] font-bold">{dollars(PLANS[plan].monthlyCents)}/mo · {feeLabel(PLANS[plan]).replace(' on card payments', '')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupFlow({ open, questions, initialPlan = 'FREE' }: { open: boolean; questions: Questions; initialPlan?: PlanKey }) {
  const [step, setStep] = useState<StepKey | 'waitlisted'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [teamSize, setTeamSize] = useState<string[]>([]);
  const [serviceArea, setServiceArea] = useState('');
  const [pricing, setPricing] = useState<string[]>([]);
  const [focus, setFocus] = useState<string[]>([]);
  const [heardFrom, setHeardFrom] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanKey>(initialPlan);
  const [volume, setVolume] = useState(8000);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to each new step's heading, so keyboard and screen-reader
  // users land where the page changed.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const idx = FLOW.findIndex((f) => f.key === step);
  const pct = step === 'done' ? 100 : Math.round((Math.max(idx, 0) / FLOW.length) * 100);
  const best = useMemo(() => bestPlanFor(volume * 100), [volume]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const go = (s: StepKey) => {
    setError('');
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const err = error ? (
    <p role="alert" className="flex items-start gap-2 rounded-tc-md bg-red-50 px-3.5 py-3 text-[14px] text-red-700 ring-1 ring-red-200">
      {error}
    </p>
  ) : null;

  const heading = (title: string, sub?: React.ReactNode) => (
    <div>
      <h1 ref={headingRef} tabIndex={-1} className="tc-h2 outline-none">
        {title}
      </h1>
      {sub ? <p className="mt-2 text-[16px] leading-relaxed text-tc-700">{sub}</p> : null}
    </div>
  );

  const nav = (opts: { back?: StepKey; next?: () => void; nextLabel?: string; disabled?: boolean; submit?: boolean }) => (
    <div className="flex items-center justify-between gap-3 pt-2">
      {opts.back ? (
        <button type="button" onClick={() => go(opts.back!)} className="tc-btn-ghost tc-btn-sm">
          <Icon name="chevron" size={14} className="rotate-180" /> Back
        </button>
      ) : (
        <span />
      )}
      <button
        type={opts.submit ? 'submit' : 'button'}
        onClick={opts.submit ? undefined : opts.next}
        disabled={busy || opts.disabled}
        className="tc-btn-dark min-w-[150px]"
      >
        {busy ? 'One moment…' : opts.nextLabel ?? 'Continue'}
        {!busy && <Icon name="arrow" size={16} />}
      </button>
    </div>
  );

  // ---- Waitlist (signup closed) ------------------------------------------
  if (!open) {
    return (
      <Frame pct={step === 'waitlisted' ? 100 : 0} stepLabel={null} preview={null}>
        {step === 'waitlisted' ? (
          <div className="space-y-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tc-black text-tc-lime">
              <Icon name="check" size={22} />
            </span>
            {heading('You’re on the list', `We’re opening TRASHCAN to a few cleaning companies at a time. We’ll email ${email} when your spot is ready.`)}
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await post('/api/signup/waitlist', { email, name, companyName, phone: phone || undefined });
                setStep('waitlisted');
              });
            }}
          >
            {heading('Join the waitlist', 'We’re letting companies in a few at a time, so every one gets set up properly.')}
            <label className="block"><span className="tc-label">Your name</span><input className="tc-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label className="block"><span className="tc-label">Company</span><input className="tc-input" autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required /></label>
            <label className="block"><span className="tc-label">Work email</span><input className="tc-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className="block"><span className="tc-label">Phone <span className="font-normal text-tc-500">(optional)</span></span><input className="tc-input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            {err}
            <button className="tc-btn-dark w-full" disabled={busy}>{busy ? 'One moment…' : 'Join the waitlist'}</button>
          </form>
        )}
      </Frame>
    );
  }

  const preview = step === 'done' ? null : (
    <Preview companyName={companyName} services={services} teamSize={teamSize[0] ?? ''} focus={focus[0] ?? ''} plan={plan} questions={questions} area={serviceArea} />
  );
  const stepLabel = step === 'done' ? null : `Step ${idx + 1} of ${FLOW.length} · ${FLOW[idx]?.title}`;

  return (
    <Frame pct={pct} stepLabel={stepLabel} preview={preview}>
      {step === 'email' && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await post('/api/signup/start', { email });
              setDevCode(r.devCode ?? null);
              go('code');
            });
          }}
        >
          {heading('Start your company on TRASHCAN', 'Free to start, no card. We’ll email a six-digit code to confirm it’s you.')}
          <label className="block">
            <span className="tc-label">Work email</span>
            <input className="tc-input" type="email" autoComplete="email" placeholder="you@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {err}
          <button className="tc-btn-dark w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a code'}
            {!busy && <Icon name="arrow" size={16} />}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-[14px]">
            <button type="button" className="tc-link disabled:opacity-40" disabled={!email.includes('@')} onClick={() => go('code')}>
              I already have a code
            </button>
            <span className="text-tc-500">
              Have an account? <Link href="/signin?platform=1" className="tc-link">Log in</Link>
            </span>
          </div>
        </form>
      )}

      {step === 'code' && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await post('/api/signup/verify', { email, code });
              go('about');
            });
          }}
        >
          {heading('Check your email', <>We sent a 6-digit code to <strong className="text-tc-900">{email}</strong>. It works for 15 minutes.</>)}
          {devCode && (
            <p className="rounded-tc-md bg-amber-50 px-3.5 py-3 text-[14px] text-amber-800 ring-1 ring-amber-200">
              Email isn’t set up on this server, so here’s the code: <strong>{devCode}</strong>
            </p>
          )}
          <CodeBoxes value={code} onChange={setCode} />
          {err}
          {nav({ back: 'email', submit: true, disabled: code.length !== 6, nextLabel: 'Confirm' })}
          <button
            type="button"
            className="tc-link text-[14px]"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await post('/api/signup/start', { email });
                setDevCode(r.devCode ?? null);
              })
            }
          >
            Send a new code
          </button>
        </form>
      )}

      {step === 'about' && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 10) return setError('Use a password of at least 10 characters.');
            go('services');
          }}
        >
          {heading('You and your company', 'You’ll be the owner. You can add your team once you’re in.')}
          <label className="block"><span className="tc-label">Your name</span><input className="tc-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="block">
            <span className="tc-label">Company name</span>
            <input className="tc-input" autoComplete="organization" placeholder="e.g. Bright Home Cleaning" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            <span className="mt-1.5 block text-[13px] text-tc-500">Your clients see this on quotes, texts and invoices.</span>
          </label>
          <div>
            <label className="block">
              <span className="tc-label">Password</span>
              <span className="relative block">
                <input className="tc-input pr-20" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[13px] font-semibold text-tc-700 hover:bg-tc-100" aria-pressed={showPw}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < strength(password) ? (strength(password) >= 3 ? 'bg-tc-green' : 'bg-tc-amber') : 'bg-tc-200'}`} />
              ))}
            </div>
            <p className="mt-1.5 text-[13px] text-tc-500">At least 10 characters. Owners also set up an authenticator app on first sign-in.</p>
          </div>
          {err}
          {nav({ back: 'code', submit: true, disabled: !name.trim() || !companyName.trim() || password.length < 10 })}
        </form>
      )}

      {step === 'services' && (
        <div className="space-y-5">
          {heading('What kind of cleaning do you do?', 'Pick all that apply. We’ll switch on the checklists, quotes and billing each one needs.')}
          <OptionCards name="Services" options={questions.services.options} value={services} onChange={setServices} multi />
          {err}
          {nav({ back: 'about', next: () => go('team'), disabled: services.length === 0 })}
        </div>
      )}

      {step === 'team' && (
        <div className="space-y-6">
          {heading('Tell us about your team')}
          <fieldset>
            <legend className="tc-label">{questions.teamSize.label}</legend>
            <OptionCards name={questions.teamSize.label} options={questions.teamSize.options} value={teamSize} onChange={setTeamSize} />
          </fieldset>
          <label className="block">
            <span className="tc-label">Where do you clean?</span>
            <input className="tc-input" placeholder="City or ZIP, e.g. Katy, TX" autoComplete="address-level2" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} />
            <span className="mt-1.5 block text-[13px] text-tc-500">Sets your time zone and service area. You can draw it exactly later.</span>
          </label>
          {err}
          {nav({ back: 'services', next: () => go('workflow'), disabled: !teamSize.length || serviceArea.trim().length < 2 })}
        </div>
      )}

      {step === 'workflow' && (
        <div className="space-y-6">
          {heading('How you work today', 'So your setup guide starts with what matters most to you.')}
          <fieldset>
            <legend className="tc-label">{questions.pricing.label}</legend>
            <OptionCards name={questions.pricing.label} options={questions.pricing.options} value={pricing} onChange={setPricing} />
          </fieldset>
          <fieldset>
            <legend className="tc-label">{questions.focus.label}</legend>
            <OptionCards name={questions.focus.label} options={questions.focus.options} value={focus} onChange={setFocus} />
          </fieldset>
          <fieldset>
            <legend className="tc-label">
              {questions.heardFrom.label} <span className="font-normal text-tc-500">(optional)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {questions.heardFrom.options.map(([k, l]) => {
                const on = heardFrom.includes(k);
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => setHeardFrom(on ? [] : [k])} className={`min-h-[40px] rounded-lg border px-3 text-[14px] font-semibold transition-colors ${on ? 'border-tc-black bg-tc-black text-white' : 'border-tc-200 bg-white text-tc-700 hover:border-tc-500'}`}>
                    {l}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {err}
          {nav({ back: 'team', next: () => go('plan'), disabled: !pricing.length || !focus.length })}
        </div>
      )}

      {step === 'plan' && (
        <div className="space-y-5">
          {heading('Pick a plan', 'Every plan has every feature. You start on Free either way — switch whenever it saves you money.')}
          <div className="rounded-tc-md border border-tc-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="tc-volume" className="text-[14px] font-semibold">Roughly how much do clients pay you by card each month?</label>
              <output htmlFor="tc-volume" className="font-tc-display text-[20px] font-extrabold tabular-nums">{dollars(volume * 100)}</output>
            </div>
            <input id="tc-volume" type="range" min={0} max={40000} step={500} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="tc-range mt-2 w-full" />
            <p className="text-[13px] text-tc-500">
              Cheapest for you: <strong className="text-tc-900">{best.plan.name}</strong> at {dollars(best.costCents)} a month.{' '}
              {best.plan.key !== plan && (
                <button type="button" onClick={() => setPlan(best.plan.key)} className="tc-link">
                  Use {best.plan.name}
                </button>
              )}
            </p>
          </div>
          <div role="radiogroup" aria-label="Plan" className="grid gap-2.5">
            {PLAN_ORDER.map((k) => {
              const p = PLANS[k];
              const on = plan === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPlan(k)}
                  className={`flex min-h-[72px] items-center gap-4 rounded-tc-md border px-4 py-3 text-left transition-[border-color,box-shadow] duration-150 ${on ? 'border-tc-black shadow-[0_0_0_1px_#0B0F14]' : 'border-tc-200 hover:border-tc-500'} bg-white`}
                >
                  <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-tc-black bg-tc-black' : 'border-tc-300'}`}>
                    {on && <span className="h-2 w-2 rounded-full bg-tc-lime" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-bold">
                      {p.name}
                      {best.plan.key === k && <span className="rounded bg-tc-lime px-1.5 py-0.5 text-[11px] font-bold">Cheapest for you</span>}
                    </span>
                    <span className="block text-[13px] text-tc-500">
                      {feeLabel(p)} · {p.includedTexts ? `${p.includedTexts.toLocaleString()} texts and ${p.includedVoiceMinutes} Tex minutes a month` : 'texts and Tex minutes pay-as-you-go'}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-tc-display text-[22px] font-extrabold tabular-nums">{dollars(p.monthlyCents)}</span>
                    <span className="block text-[12px] text-tc-500">/ month</span>
                  </span>
                </button>
              );
            })}
          </div>
          {err}
          {nav({ back: 'workflow', next: () => go('review') })}
        </div>
      )}

      {step === 'review' && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await post('/api/signup/complete', {
                email,
                code,
                name,
                companyName,
                password,
                acceptTerms: accept,
                answers: { services, teamSize: teamSize[0], serviceArea, pricing: pricing[0], focus: focus[0], heardFrom: heardFrom[0], plan },
              });
              go('done');
            });
          }}
        >
          {heading('Ready to create your company', 'Check it over — you can change any of this later in Settings.')}
          <dl className="divide-y divide-tc-200 rounded-tc-md border border-tc-200 bg-white">
            {(
              [
                ['Company', companyName, 'about'],
                ['Owner', `${name} · ${email}`, 'about'],
                ['Services', services.map((s) => questions.services.options.find((o) => o[0] === s)?.[1]).join(', '), 'services'],
                ['Team', `${questions.teamSize.options.find((o) => o[0] === teamSize[0])?.[1] ?? ''} · ${serviceArea}`, 'team'],
                ['First focus', questions.focus.options.find((o) => o[0] === focus[0])?.[1] ?? '', 'workflow'],
                ['Plan', `${PLANS[plan].name} — ${dollars(PLANS[plan].monthlyCents)}/mo, ${feeLabel(PLANS[plan]).toLowerCase()}`, 'plan'],
              ] as [string, string, StepKey][]
            ).map(([k, v, s]) => (
              <div key={k} className="flex items-start justify-between gap-4 px-4 py-3">
                <dt className="w-28 shrink-0 text-[13px] font-semibold text-tc-500">{k}</dt>
                <dd className="min-w-0 flex-1 text-[14px] text-tc-900">{v}</dd>
                <button type="button" onClick={() => go(s)} className="text-[13px] font-semibold text-tc-700 underline decoration-tc-300 underline-offset-4 hover:decoration-tc-black">
                  Edit
                </button>
              </div>
            ))}
          </dl>
          {plan !== 'FREE' && (
            <p className="rounded-tc-md bg-tc-lime-wash px-3.5 py-3 text-[14px] text-tc-900 ring-1 ring-[#E3F5A8]">
              You’ll start on Free. Your workspace will offer to finish {PLANS[plan].name} checkout whenever you’re ready — nothing is charged now.
            </p>
          )}
          <label className="flex items-start gap-3 text-[14px] text-tc-700">
            <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-tc-300" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>
              I agree to the <Link href="/terms" target="_blank" className="tc-link">Terms</Link> and <Link href="/privacy" target="_blank" className="tc-link">Privacy Policy</Link>.
            </span>
          </label>
          {err}
          {nav({ back: 'plan', submit: true, disabled: !accept, nextLabel: 'Create my company' })}
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tc-black">
            <TcIcon size={32} />
          </span>
          {heading(`${companyName} is ready.`, 'Here’s what happens next — about fifteen minutes in all.')}
          <ol className="space-y-3">
            {[
              ['Sign in', `Use ${email} and the password you just set.`],
              ['Turn on two-step sign-in', 'Owners always use an authenticator app. It takes a minute.'],
              ['Follow the setup guide', 'Services and rates, your team, and your booking link.'],
              ['Connect Stripe', 'So clients pay your business directly.'],
              ['Send us your client list', 'Any spreadsheet. We import it for free.'],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-3 rounded-tc-md border border-tc-200 bg-white p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tc-black font-tc-display text-[13px] font-extrabold text-tc-lime">{i + 1}</span>
                <span>
                  <span className="block text-[15px] font-semibold">{t}</span>
                  <span className="text-[14px] text-tc-700">{b}</span>
                </span>
              </li>
            ))}
          </ol>
          <Link href={`/signin?platform=1&email=${encodeURIComponent(email)}`} className="tc-btn-dark tc-btn-lg w-full">
            Sign in to {companyName} <Icon name="arrow" size={18} />
          </Link>
        </div>
      )}
    </Frame>
  );
}

/** Two panes: the step on the left, the live workspace preview on the right. */
function Frame({ children, pct, stepLabel, preview }: { children: React.ReactNode; pct: number; stepLabel: string | null; preview: React.ReactNode }) {
  return (
    <div className="grid min-h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex flex-col bg-white">
        <div className="h-1 bg-tc-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Signup progress">
          <div className="h-full bg-tc-black transition-[width] duration-300 ease-tc-out" style={{ width: `${pct}%` }} />
        </div>
        <div className="mx-auto w-full max-w-[560px] flex-1 px-4 pb-16 pt-10 sm:px-6 md:pt-14">
          {stepLabel && <p className="mb-5 text-[13px] font-semibold text-tc-500">{stepLabel}</p>}
          <div key={stepLabel ?? 'x'} className="animate-tc-rise">{children}</div>
        </div>
      </div>
      <aside aria-label="Preview" className="tc-dark relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center lg:px-10">
        <div aria-hidden="true" className="tc-grid-bg pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full opacity-[0.14] blur-[100px]" style={{ background: '#B8FF00' }} />
        <div className="relative w-full max-w-[460px]">
          {preview ?? (
            <div>
              <p className="tc-display text-white">
                Cleaning business, <span className="text-tc-lime">cleaned up.</span>
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
