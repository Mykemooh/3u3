import { enforceMfa, type SessionUser } from '@/lib/sessionUser';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { homeForRole } from '@/lib/nav';
import { headers } from 'next/headers';
import AdminShell from '@/components/admin/AdminShell';
import { ADMIN_SECTIONS, QUICK_CREATE } from '@/lib/adminNav';
import { permissionForPath, ADMIN_PERMISSIONS } from '@/lib/permissions';
import { getUserRole } from '@/lib/roles';
import AccessNotice from '@/components/AccessNotice';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isPlatformAccessActive } from '@/lib/platform';

// Every admin page reads live operational data (bookings, leads, rates,
// crew). Setting this here cascades to all nested /admin pages, so none of
// them ever get baked into a static build-time snapshot.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // The authoritative check. The middleware guards the edge, but it can
  // only read the session cookie by guessing at its name; this runs in
  // Node against the real session and is the one that actually decides.
  // Keeping it here means a middleware that fails open still can't let
  // anyone into the admin.
  const role = (session?.user as { role?: string } | undefined)?.role;
  const tenantId = (session?.user as { tenantId?: string } | undefined)?.tenantId;
  if (!session?.user) redirect('/signin?next=/admin');
  if (role !== 'ADMIN') redirect(`${homeForRole(role)}?denied=1`);
  enforceMfa(session.user as unknown as SessionUser, '/admin');

  // Platform access gate (lib/platform.ts) — a lapsed trial, promo code,
  // or subscription locks the admin's own tools, not their customers'
  // live booking/account pages, so a billing hiccup never strands a
  // client mid-visit. Billing itself lives outside this layout
  // (app/billing) specifically so it's never the thing this gate blocks.
  const tenant = tenantId ? (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0] : undefined;
  if (tenant && !isPlatformAccessActive(tenant)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="card max-w-sm text-center">
          <p className="mb-2 text-2xl">🔒</p>
          <h1 className="mb-2 text-lg font-bold text-ink">Your platform access has lapsed</h1>
          <p className="mb-5 text-sm text-slate">
            Your free trial or subscription has ended. Renew or redeem a code to get back into your admin tools —
            your clients can still book and view their account in the meantime.
          </p>
          <Link href="/billing" className="btn-primary w-full">
            Go to Billing
          </Link>
        </div>
      </div>
    );
  }

  // What this person's role may open (lib/roles.ts): the rail only shows
  // those sections, and a page they can't use explains why instead of
  // half-loading. The API enforces the same rules (lib/adminApi.ts).
  const userId = (session.user as { id?: string }).id!;
  const { role: userRole, permissions } = await getUserRole(userId);
  const allowed = (perm?: string | null) => !perm || permissions.has(perm as never);
  const sections = ADMIN_SECTIONS.filter((s) => allowed(s.perm)).map((s) => ({
    ...s,
    pages: s.pages.filter((p) => allowed(p.perm ?? s.perm)),
  }));
  const quickCreate = QUICK_CREATE.filter((q) => allowed(q.perm));
  const path = headers().get('x-3u3-path') ?? '/admin';
  const needed = permissionForPath(path);
  const blocked = needed && !permissions.has(needed);

  return (
    <AdminShell
      sections={sections}
      quickCreate={quickCreate}
      brand={{
        name: tenant?.name ?? 'Admin',
        logoUrl: tenant?.logoUrl ?? null,
        useBrandLogo: !tenant?.logoUrl && /3u3/i.test(tenant?.name ?? ''),
      }}
      userName={session.user?.name ?? ''}
    >
      <AccessNotice />
      {blocked ? (
        <div className="card mx-auto mt-10 max-w-md text-center">
          <h2 className="text-lg font-bold text-ink">This part of the admin isn't on your role</h2>
          <p className="mt-2 text-sm text-slate">
            {userRole?.name ?? 'Your role'} doesn't include{' '}
            <strong>{ADMIN_PERMISSIONS.find((p) => p.key === needed)?.label ?? needed}</strong>. Ask an owner to add it under
            Team → Roles.
          </p>
          <Link href="/admin" className="btn-primary btn-sm mt-5">Back to today</Link>
        </div>
      ) : (
        children
      )}
    </AdminShell>
  );
}
