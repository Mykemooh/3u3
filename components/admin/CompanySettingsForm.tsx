'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Values = {
  name: string;
  tagline: string;
  payrollFrequency: 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';
  payrollAnchorDate: string;
  smsNumber: string;
  ownerPhone: string;
  texSmsAutoReply: boolean;
  texVoiceEnabled: boolean;
  texOpenDays: string;
  texOpenFrom: string;
  texOpenTo: string;
  texGreeting: string;
  googleReviewUrl: string;
  referralCreditDollars: string;
  winbackDays: number;
  mfaRequiredForCrew: boolean;
};

/** One form per settings card — each saves just its own fields. */
export default function CompanySettingsForm({ section, initial }: { section: 'profile' | 'payroll' | 'texting' | 'growth' | 'security'; initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle');
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((x) => ({ ...x, [k]: val }));

  const payload = (): Record<string, unknown> => {
    switch (section) {
      case 'profile':
        return { name: v.name, tagline: v.tagline || null };
      case 'payroll':
        return { payrollFrequency: v.payrollFrequency, payrollAnchorDate: v.payrollAnchorDate || null };
      case 'texting':
        return { smsNumber: v.smsNumber || null, ownerPhone: v.ownerPhone || null, texSmsAutoReply: v.texSmsAutoReply, texVoiceEnabled: v.texVoiceEnabled, texOpenDays: v.texOpenDays, texOpenFrom: v.texOpenFrom, texOpenTo: v.texOpenTo, texGreeting: v.texGreeting || null };
      case 'growth':
        return { googleReviewUrl: v.googleReviewUrl || '', referralCreditCents: Math.round(Number(v.referralCreditDollars || 0) * 100), winbackDays: v.winbackDays };
      case 'security':
        return { mfaRequiredForCrew: v.mfaRequiredForCrew };
    }
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState('saving');
    const res = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState(body.error ?? 'Could not save.');
    setState('saved');
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {section === 'profile' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="label">Company name</span><input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} required /></label>
          <label><span className="label">Tagline</span><input className="input" value={v.tagline} onChange={(e) => set('tagline', e.target.value)} /></label>
        </div>
      )}
      {section === 'payroll' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="label">Pay schedule</span>
            <select className="input" value={v.payrollFrequency} onChange={(e) => set('payrollFrequency', e.target.value as Values['payrollFrequency'])}>
              <option value="WEEKLY">Every week</option>
              <option value="BIWEEKLY">Every two weeks</option>
              <option value="SEMIMONTHLY">Twice a month (15th and last day)</option>
              <option value="MONTHLY">Once a month</option>
            </select>
          </label>
          {(v.payrollFrequency === 'WEEKLY' || v.payrollFrequency === 'BIWEEKLY' || v.payrollFrequency === 'MONTHLY') && (
            <label><span className="label">{v.payrollFrequency === 'MONTHLY' ? 'Payday (any month)' : 'One real payday'}</span>
              <input type="date" className="input" value={v.payrollAnchorDate} onChange={(e) => set('payrollAnchorDate', e.target.value)} />
            </label>
          )}
          <p className="text-xs text-muted sm:col-span-2">Cleaners see their next payout and what they've earned so far on their dashboard.</p>
        </div>
      )}
      {section === 'texting' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="label">Business texting number (Twilio)</span><input className="input" inputMode="tel" placeholder="281 555 0100" value={v.smsNumber} onChange={(e) => set('smsNumber', e.target.value)} /></label>
          <label><span className="label">Owner's cell (calls transfer here)</span><input className="input" inputMode="tel" value={v.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm text-slate"><input type="checkbox" checked={v.texSmsAutoReply} onChange={(e) => set('texSmsAutoReply', e.target.checked)} /> Tex answers texts when the office doesn't</label>
          <label className="flex items-center gap-2 text-sm text-slate"><input type="checkbox" checked={v.texVoiceEnabled} onChange={(e) => set('texVoiceEnabled', e.target.checked)} /> Tex answers phone calls</label>
          <div className="sm:col-span-2">
            <span className="label">Office hours — callers who ask for a person are put through to your cell while you’re open; after hours Tex takes a message</span>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
                const on = v.texOpenDays.split(',').includes(String(i));
                return (
                  <label key={d} className="flex items-center gap-1">
                    <input type="checkbox" checked={on} onChange={() => set('texOpenDays', (on ? v.texOpenDays.split(',').filter((x) => x !== String(i)) : [...v.texOpenDays.split(',').filter(Boolean), String(i)]).sort().join(','))} /> {d}
                  </label>
                );
              })}
              <input type="time" className="input w-auto" value={v.texOpenFrom} onChange={(e) => set('texOpenFrom', e.target.value)} />
              <span>to</span>
              <input type="time" className="input w-auto" value={v.texOpenTo} onChange={(e) => set('texOpenTo', e.target.value)} />
            </div>
          </div>
          <label className="sm:col-span-2"><span className="label">Phone greeting (optional — leave blank and Tex says hi by name)</span><input className="input" maxLength={240} placeholder={`Thanks for calling — this is Tex, the virtual assistant. How can I help?`} value={v.texGreeting} onChange={(e) => set('texGreeting', e.target.value)} /></label>
        </div>
      )}
      {section === 'growth' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-3"><span className="label">Google review link</span><input className="input" type="url" placeholder="https://g.page/r/…/review" value={v.googleReviewUrl} onChange={(e) => set('googleReviewUrl', e.target.value)} /></label>
          <label><span className="label">Referral credit ($)</span><input type="number" min={0} step="1" className="input" value={v.referralCreditDollars} onChange={(e) => set('referralCreditDollars', e.target.value)} /></label>
          <label><span className="label">Lapsed after (days)</span><input type="number" min={14} max={365} className="input" value={v.winbackDays} onChange={(e) => set('winbackDays', Number(e.target.value))} /></label>
        </div>
      )}
      {section === 'security' && (
        <label className="flex items-start gap-3 text-sm text-slate">
          <input type="checkbox" className="mt-1" checked={v.mfaRequiredForCrew} onChange={(e) => set('mfaRequiredForCrew', e.target.checked)} />
          <span>Require two-step sign-in for crew too. Admins always need it; clients are offered it.</span>
        </label>
      )}
      <div className="flex items-center gap-3">
        <button className="btn-primary btn-sm" disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save'}</button>
        {state === 'saved' && <span className="text-sm text-green">Saved</span>}
        {state !== 'idle' && state !== 'saving' && state !== 'saved' && <span className="text-sm text-red-600">{state}</span>}
      </div>
    </form>
  );
}
