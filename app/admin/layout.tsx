import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { signOutLink, homeForRole } from '@/lib/nav';
import SignOutButton from '@/components/SignOutButton';
import Logo from '@/components/Logo';
import AccessNotice from '@/components/AccessNotice';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isPlatformAccessActive } from '@/lib/platform';

// Every admin page reads live operational data (bookings, leads, rates,
// crew). Setting this here cascades to all nested /admin pages, so none of
// them ever get baked into a static build-time snapshot.
export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/pipeline', label: 'Pipeline' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/estimates', label: 'Estimates' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/routes', label: 'Routes' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/crew', label: 'Jobs & photos' },
  { href: '/admin/invoices', label: 'Invoices' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/addons', label: 'Add-ons' },
  { href: '/admin/rates', label: 'Rates' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/supplies', label: 'Supplies' },
  { href: '/admin/notifications', label: 'Notifications' },
  { href: '/admin/payroll', label: 'Payroll' },
  { href: '/admin/integrations', label: 'Integrations' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/billing', label: 'Billing' },
];

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

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Logo variant="light" size="sm" />
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Admin</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/60">{session?.user?.name}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-6 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <AccessNotice />
        {children}
      </main>
    </div>
  );
}
