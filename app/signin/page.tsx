'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const role = params.get('role'); // 'admin' | 'crew' | null (customer)
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isStaff = role === 'admin' || role === 'crew';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await signIn('credentials', {
      identifier,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError('That phone/email and password combination doesn\'t match our records.');
      return;
    }
    router.push(role === 'admin' ? '/admin' : role === 'crew' ? '/crew' : '/book');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="mb-8">
        <Logo variant="light" />
      </Link>
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-bold text-ink mb-1">
          {isStaff ? 'Staff sign-in' : 'Welcome back'}
        </h1>
        <p className="text-sm text-ink/60 mb-6">
          {isStaff
            ? 'Sign in with your work email and password.'
            : 'Sign in with your phone number and password.'}
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">{isStaff ? 'Work email' : 'Phone number'}</label>
            <input
              className="input"
              type={isStaff ? 'email' : 'tel'}
              placeholder={isStaff ? 'you@3u3cleaning.com' : '+1 (281) 555-0199'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {!isStaff && (
          <p className="mt-4 text-center text-sm text-ink/60">
            New here?{' '}
            <Link href="/new" className="font-semibold text-bronze underline">
              Get a quote instead
            </Link>
          </p>
        )}
      </div>
      <p className="mt-6 text-xs text-white/40">
        Demo customer: +12815550199 / customer123
      </p>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}
