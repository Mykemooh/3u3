import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionUser, enforceMfa } from '@/lib/sessionUser';
import { mfaState, backupCodesLeft } from '@/lib/mfa';
import { homeForRole } from '@/lib/nav';
import { googleConfigured } from '@/lib/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import DisableMfaForm from '@/components/DisableMfaForm';

export const dynamic = 'force-dynamic';

/** Sign-in security for anyone signed in: two-step status and Google link. */
export default async function SecurityPage() {
  const user = await sessionUser();
  if (!user) redirect('/signin?next=/security');
  enforceMfa(user, '/security');
  const state = await mfaState(user.id);
  const left = state.enabled ? await backupCodesLeft(user.id) : 0;
  const row = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link href={homeForRole(user.role)} className="text-sm font-semibold text-bronze hover:underline">← Back</Link>
      <h1 className="mt-4 text-2xl font-bold text-ink">Sign-in & security</h1>

      <section className="card mt-6">
        <h2 className="font-semibold text-ink">Two-step sign-in</h2>
        {state.enabled ? (
          <>
            <p className="mt-1 text-sm text-slate">
              On. You'll be asked for a code from your authenticator app when you sign in on a new device.
            </p>
            <p className="mt-2 text-sm text-slate">
              Backup codes left: <span className="font-semibold text-ink">{left}</span>
              {left <= 3 && ' — set it up again to get a fresh set.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/mfa/setup?optional=1&next=/security" className="btn-secondary">Re-link app & new backup codes</Link>
            </div>
            {!state.required && <DisableMfaForm />}
            {state.required && <p className="mt-3 text-xs text-muted">Your role requires two-step sign-in, so it stays on.</p>}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate">Off. Turn it on so a stolen password alone can't open your account.</p>
            <Link href="/mfa/setup?optional=1&next=/security" className="btn-primary mt-4">Turn on two-step sign-in</Link>
          </>
        )}
      </section>

      <section className="card mt-6">
        <h2 className="font-semibold text-ink">Google sign-in</h2>
        {!googleConfigured() ? (
          <p className="mt-1 text-sm text-slate">Not switched on for this site yet.</p>
        ) : row?.googleSub ? (
          <p className="mt-1 text-sm text-slate">Linked. You can use "Continue with Google" on the sign-in page.</p>
        ) : (
          <p className="mt-1 text-sm text-slate">
            Use "Continue with Google" on the sign-in page with {row?.email ? <strong>{row.email}</strong> : 'the email on your account'} and it links automatically.
          </p>
        )}
      </section>
    </main>
  );
}
