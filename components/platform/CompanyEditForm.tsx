'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Tenant = {
  id: string;
  name: string;
  tagline: string | null;
  primaryColor: string;
  bronzeColor: string;
  customDomain: string | null;
  logoUrl: string | null;
  planStatus: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  accessExpiresAt: string | null;
};

export default function CompanyEditForm({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [name, setName] = useState(tenant.name);
  const [tagline, setTagline] = useState(tenant.tagline ?? '');
  const [primaryColor, setPrimaryColor] = useState(tenant.primaryColor);
  const [bronzeColor, setBronzeColor] = useState(tenant.bronzeColor);
  const [customDomain, setCustomDomain] = useState(tenant.customDomain ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save() {
    setStatus('saving');
    const res = await fetch(`/api/platform/companies/${tenant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        tagline: tagline || null,
        primaryColor,
        bronzeColor,
        customDomain: customDomain || null,
      }),
    });
    if (res.ok) {
      setStatus('saved');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  async function onLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    setLogoError('');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/platform/companies/${tenant.id}/logo`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setLogoBusy(false);
    if (!res.ok) return setLogoError(data.error || 'Could not upload that logo.');
    setLogoUrl(data.logoUrl);
    router.refresh();
  }

  return (
    <div className="card max-w-xl space-y-4">
      <div>
        <label className="label">Logo</label>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-14 w-14 rounded-lg border border-line object-contain" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted">No logo</span>
          )}
          <label className="btn-secondary !px-4 !py-2 text-sm">
            {logoBusy ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onLogoPick} disabled={logoBusy} />
          </label>
        </div>
        {logoError && <p className="mt-1.5 text-xs text-red-600">{logoError}</p>}
      </div>
      <div>
        <label className="label">Company name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Tagline</label>
        <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Primary color</label>
          <input type="color" className="input h-10" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
        </div>
        <div>
          <label className="label">Accent color</label>
          <input type="color" className="input h-10" value={bronzeColor} onChange={(e) => setBronzeColor(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Custom domain (optional)</label>
        <input className="input" placeholder="www.theircompany.com" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} />
      </div>


      <button type="button" onClick={save} disabled={status === 'saving'} className="btn-primary w-full">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save changes'}
      </button>
      {status === 'error' && <p className="text-sm text-red-600">Couldn't save — try again.</p>}
    </div>
  );
}
