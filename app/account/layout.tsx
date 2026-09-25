import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { homeForRole } from '@/lib/nav';
import AppShell, { CUSTOMER_TABS } from '@/components/app/AppShell';

export const dynamic = 'force-dynamic';

/**
 * The client's own area. Customers only — except that an admin may open a
 * specific job's photos or invoice here to see exactly what the client
 * sees (those pages check ownership themselves).
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) redirect('/signin?next=/account');
  if (role !== 'CUSTOMER' && role !== 'ADMIN') redirect(`${homeForRole(role)}?denied=1`);
  return (
    <AppShell name={session.user.name} tabs={role === 'CUSTOMER' ? CUSTOMER_TABS : []} homeHref={homeForRole(role)}>
      {children}
    </AppShell>
  );
}
