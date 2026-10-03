'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function NewCompanyForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagline, setTagline] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [bronzeColor, setBronzeColor] = useState('#1D4ED8');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ slug: string; adminEmail: string } | null>(null);

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    const res = await fetch('/api/platform/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, tagline: tagline || undefined, primaryColor, bronzeColor, adminName, adminEmail, adminPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus('error');
      setError(data.error || 'Something went wrong.');
      return;
    }
    setDone({ slug, adminEmail });
    router.refresh();
  }

  if (done) {
    return (
      <div className="card max-w-lg text-center">
        <p className="mb-2 text-2xl">✓</p>
        <h2 className="mb-2 text-lg font-bold text-ink">{name} is live</h2>
        <p className="mb-4 text-sm text-slate">
          Its full starting stack is provisioned — service types, checklist templates, a default crew, and its first
          admin login. It's on a 14-day trial.
        </p>
        <div className="mb-4 rounded-xl bg-cream px-4 py-3 text-left text-sm">
          <p>
            <span className="text-muted">Admin login:</span> <strong>{done.adminEmail}</strong>
          </p>
          <p>
            <span className="text-muted">Slug:</span> <strong>{done.slug}</strong>
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <button type="button" onClick={() => setDone(null)} className="btn-secondary">
            Create another
          </button>
          <a href="/platform/companies" className="btn-primary">
            Back to companies
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card max-w-lg space-y-4">
      <div>
        <label className="label">Company name</label>
        <input className="input" value={name} onChange={(e) => onNameChange(e.target.value)} required />
      </div>
      <div>
        <label className="label">Slug (subdomain)</label>
        <input
          className="input"
          value={slug}
          onChange={(e) => {
            setSlug(slugify(e.target.value));
            setSlugTouched(true);
          }}
          required
        />
        <p className="mt-1 text-xs text-muted">Resolves this company's public site once a wildcard domain is configured for the platform.</p>
      </div>
      <div>
        <label className="label">Tagline (optional)</label>
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

      <div className="border-t border-line pt-4">
        <h3 className="mb-3 font-semibold text-ink">First admin login</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Temporary password</label>
            <input type="text" className="input" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} minLength={8} required />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={status === 'saving'} className="btn-primary w-full">
        {status === 'saving' ? 'Provisioning…' : 'Create company'}
      </button>
    </form>
  );
}
