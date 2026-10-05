'use client';

import { useState } from 'react';
import Link from 'next/link';

type Option = readonly [string, string];
type Questions = Record<'services' | 'teamSize' | 'pricing' | 'focus' | 'heardFrom', { label: string; options: readonly Option[] }>;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}

function Chips({ options, value, onChange, multi }: { options: readonly Option[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([k, label]) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((v) => v !== k) : [...value, k]) : [k])}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${on ? 'border-gold bg-gold/10 text-ink' : 'border-line text-slate hover:border-gold'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function SignupFlow({ open, questions }: { open: boolean; questions: Questions }) {
  const [step, setStep] = useState<'email' | 'code' | 'about' | 'questions' | 'done' | 'waitlisted'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [teamSize, setTeamSize] = useState<string[]>([]);
  const [serviceArea, setServiceArea] = useState('');
  const [pricing, setPricing] = useState<string[]>([]);
  const [focus, setFocus] = useState<string[]>([]);
  const [heardFrom, setHeardFrom] = useState<string[]>([]);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const err = error && <p className="text-sm text-red-600">{error}</p>;

  if (!open) {
    if (step === 'waitlisted') {
      return (
        <div className="card text-center">
          <h2 className="text-xl font-bold">You’re on the list</h2>
          <p className="mt-2 text-slate">We’re opening TrashCan to a few cleaning companies at a time. We’ll email {email} when your spot is ready.</p>
        </div>
      );
    }
    return (
      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await post('/api/signup/waitlist', { email, name, companyName, phone: phone || undefined });
            setStep('waitlisted');
          });
        }}
      >
        <div>
          <h2 className="text-xl font-bold">Join the waitlist</h2>
          <p className="text-sm text-slate">We’re letting companies in a few at a time, so every one gets set up properly.</p>
        </div>
        <label className="block"><span className="label">Your name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="block"><span className="label">Company</span><input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required /></label>
        <label className="block"><span className="label">Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="block"><span className="label">Phone (optional)</span><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        {err}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'One moment…' : 'Join the waitlist'}</button>
      </form>
    );
  }

  if (step === 'email') {
    return (
      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await post('/api/signup/start', { email });
            setDevCode(r.devCode ?? null);
            setStep('code');
          });
        }}
      >
        <div>
          <h2 className="text-xl font-bold">Start your free trial</h2>
          <p className="text-sm text-slate">14 days, no card. We’ll email you a code to confirm it’s you.</p>
        </div>
        <label className="block"><span className="label">Work email</span><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {err}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
        <button
          type="button"
          className="w-full text-sm font-semibold text-gold hover:underline disabled:opacity-40"
          disabled={!email.includes('@')}
          onClick={() => {
            setError('');
            setStep('code');
          }}
        >
          I already have a code
        </button>
        <p className="text-center text-sm text-slate">Already have an account? <Link href="/signin?platform=1" className="font-semibold text-gold hover:underline">Sign in</Link></p>
      </form>
    );
  }

  if (step === 'code') {
    return (
      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await post('/api/signup/verify', { email, code });
            setStep('about');
          });
        }}
      >
        <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setStep('email')}>← Use a different email</button>
        <div>
          <h2 className="text-xl font-bold">Check your email</h2>
          <p className="text-sm text-slate">We sent a 6-digit code to {email}. It works for 15 minutes.</p>
        </div>
        {devCode && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Email isn’t set up on this server, so here’s the code: <strong>{devCode}</strong></p>}
        <input className="input text-center font-mono text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required aria-label="Code" />
        {err}
        <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
        <button type="button" className="w-full text-sm font-semibold text-gold hover:underline" disabled={busy} onClick={() => run(async () => { const r = await post('/api/signup/start', { email }); setDevCode(r.devCode ?? null); })}>
          Send a new code
        </button>
      </form>
    );
  }

  if (step === 'about') {
    return (
      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length < 10) return setError('Use a password of at least 10 characters.');
          setError('');
          setStep('questions');
        }}
      >
        <div>
          <h2 className="text-xl font-bold">You and your company</h2>
          <p className="text-sm text-slate">You’ll be the owner. You can add your team once you’re in.</p>
        </div>
        <label className="block"><span className="label">Your name</span><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="block"><span className="label">Company name</span><input className="input" autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required /></label>
        <label className="block">
          <span className="label">Password</span>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} />
          <span className="mt-1 block text-xs text-muted">At least 10 characters. You’ll also set up an authenticator app when you first sign in.</span>
        </label>
        {err}
        <button className="btn-primary w-full">Continue</button>
      </form>
    );
  }

  if (step === 'questions') {
    const q = questions;
    return (
      <form
        className="card space-y-5"
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
              answers: { services, teamSize: teamSize[0], serviceArea, pricing: pricing[0], focus: focus[0], heardFrom: heardFrom[0] },
            });
            setStep('done');
          });
        }}
      >
        <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setStep('about')}>← Back</button>
        <div>
          <h2 className="text-xl font-bold">Six quick questions</h2>
          <p className="text-sm text-slate">So {companyName || 'your company'} starts set up the way you actually work.</p>
        </div>
        <fieldset><legend className="label">1. {q.services.label} <span className="font-normal text-muted">(pick any)</span></legend><Chips options={q.services.options} value={services} onChange={setServices} multi /></fieldset>
        <fieldset><legend className="label">2. {q.teamSize.label}</legend><Chips options={q.teamSize.options} value={teamSize} onChange={setTeamSize} /></fieldset>
        <label className="block"><span className="label">3. Where do you work?</span><input className="input" placeholder="City or ZIP, e.g. Katy, TX" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} /></label>
        <fieldset><legend className="label">4. {q.pricing.label}</legend><Chips options={q.pricing.options} value={pricing} onChange={setPricing} /></fieldset>
        <fieldset><legend className="label">5. {q.focus.label}</legend><Chips options={q.focus.options} value={focus} onChange={setFocus} /></fieldset>
        <fieldset><legend className="label">6. {q.heardFrom.label} <span className="font-normal text-muted">(optional)</span></legend><Chips options={q.heardFrom.options} value={heardFrom} onChange={setHeardFrom} /></fieldset>
        <label className="flex items-start gap-2 text-sm text-slate">
          <input type="checkbox" className="mt-1" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>
            I agree to the <Link href="/terms" target="_blank" className="font-semibold text-gold hover:underline">Terms</Link> and{' '}
            <Link href="/privacy" target="_blank" className="font-semibold text-gold hover:underline">Privacy Policy</Link>.
          </span>
        </label>
        {err}
        <button className="btn-primary w-full" disabled={busy || !services.length || !teamSize.length || !pricing.length || !focus.length || serviceArea.trim().length < 2 || !accept}>
          {busy ? 'Setting up your company…' : 'Create my company'}
        </button>
      </form>
    );
  }

  return (
    <div className="card space-y-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green/15 text-2xl text-green">✓</div>
      <h2 className="text-xl font-bold">{companyName} is ready</h2>
      <p className="text-slate">
        Sign in with {email}. You’ll set up an authenticator app first (owners always use one), then the setup guide walks you through
        your services, team, booking link and payments — about 15 minutes.
      </p>
      <Link href={`/signin?platform=1&email=${encodeURIComponent(email)}`} className="btn-primary w-full">Sign in to {companyName}</Link>
    </div>
  );
}
