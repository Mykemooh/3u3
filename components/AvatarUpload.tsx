'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/LocaleProvider';
import { commonMessages } from '@/lib/i18n/messages/common';

export default function AvatarUpload({ name, initialUrl }: { name: string; initialUrl: string | null }) {
  const t = useT(commonMessages);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/account/avatar', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || t('avatarUploadError'));
    setUrl(data.avatarUrl);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/account/avatar', { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setError(t('avatarRemoveError'));
    setUrl(null);
    router.refresh();
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="flex items-center gap-4">
      {url ? (
        <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-cream text-xl font-bold text-bronze">
          {initial}
        </span>
      )}
      <div>
        <div className="flex gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-secondary !px-4 !py-2 text-sm">
            {busy ? t('avatarUploading') : url ? t('avatarChange') : t('avatarAdd')}
          </button>
          {url && (
            <button type="button" onClick={remove} disabled={busy} className="text-sm text-muted hover:text-ink">
              {t('remove')}
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} />
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
