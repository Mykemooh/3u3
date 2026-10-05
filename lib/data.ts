import { db } from '@/db/client';
import {
  tenants, serviceTypes, crews, clientRates, users, addresses, bookings,
  jobs, jobChecklistItems, crewMembers, notificationLog, invoices,
} from '@/db/schema';
import { asc, eq, and } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { headers } from 'next/headers';
import { authOptions } from '@/lib/auth';

/**
 * Resolves "which company's site/data is this request for" — the one
 * thing every page in a multi-tenant platform needs, that a single-
 * tenant app never had to ask. In order:
 *   1. A signed-in session's own tenantId (covers every admin/crew/
 *      account page correctly, scoped per-request, not globally).
 *   2. A signed-out visitor's Host header — the subdomain
 *      (acme.<platform base domain>) or a tenant's own custom domain.
 *   3. Falls back to the first non-platform tenant — exactly today's
 *      pre-multi-tenant behavior, so local dev and a deployment with no
 *      subdomain/custom-domain set up yet (the current production
 *      3u3-fm98.vercel.app address, until a real domain is attached)
 *      keep working unchanged.
 * This is the only place that fallback lives — every one of this app's
 * existing getTenant() call sites (admin/crew/account pages) keeps
 * working with no changes, and now resolves correctly per request.
 */
export async function getTenant() {
  const session = await getServerSession(authOptions).catch(() => null);
  const sessionTenantId = (session?.user as { tenantId?: string } | undefined)?.tenantId;
  if (sessionTenantId) {
    const row = (await db.select().from(tenants).where(eq(tenants.id, sessionTenantId)).limit(1))[0];
    if (row) return row;
  }

  const host = headers().get('host')?.split(':')[0]?.toLowerCase();
  if (host) {
    const byDomain = (await db.select().from(tenants).where(eq(tenants.customDomain, host)).limit(1))[0];
    if (byDomain) return byDomain;

    // <slug>.<TENANT_BASE_DOMAIN> only. Without a configured base domain
    // a host's first label is never treated as a company slug — otherwise
    // a self-serve company named after the deployment's own address (for
    // example "3u3-fm98" on 3u3-fm98.vercel.app) could take over the site.
    const base = process.env.TENANT_BASE_DOMAIN?.toLowerCase().replace(/^\./, '');
    if (base && host.endsWith(`.${base}`)) {
      const subdomain = host.slice(0, -(base.length + 1));
      if (subdomain && !subdomain.includes('.')) {
        const bySlug = (await db.select().from(tenants).where(eq(tenants.slug, subdomain)).limit(1))[0];
        if (bySlug && !bySlug.isPlatform) return bySlug;
      }
    }
  }

  // The platform's first company — ordered, so it can't change as rows are updated.
  const rows = await db.select().from(tenants).where(eq(tenants.isPlatform, false)).orderBy(asc(tenants.createdAt)).limit(1);
  return rows[0];
}

export async function getServiceTypes(tenantId: string) {
  return db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenantId));
}

export async function getServiceType(id: string) {
  const rows = await db.select().from(serviceTypes).where(eq(serviceTypes.id, id)).limit(1);
  return rows[0];
}

export async function getPrimaryCrew(tenantId: string) {
  const rows = await db.select().from(crews).where(eq(crews.tenantId, tenantId)).limit(1);
  return rows[0];
}

export async function getAllCrews(tenantId: string) {
  return db.select().from(crews).where(eq(crews.tenantId, tenantId));
}

export async function getClientRatesFor(userId: string) {
  return db.select().from(clientRates).where(eq(clientRates.userId, userId));
}

export async function getUserByPhone(phone: string) {
  const rows = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return rows[0];
}

// The real inbox that gets the "instant notification" PRD 6.6 promises the
// owner — looked up dynamically (rather than hardcoded) so it stays correct
// if the seeded admin user is ever replaced.
export async function getOwnerEmail(tenantId: string) {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'ADMIN')))
    .limit(1);
  return rows[0]?.email ?? process.env.ADMIN_NOTIFICATION_EMAIL ?? undefined;
}

export async function getUserById(id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function getAddressesFor(userId: string) {
  return db.select().from(addresses).where(eq(addresses.userId, userId));
}

export async function getBookingsForCrewOnOrAfter(crewId: string) {
  const rows = await db.select().from(bookings).where(eq(bookings.crewId, crewId));
  return rows.filter((b) => b.status !== 'CANCELLED');
}

export async function getAllBookings(tenantId: string) {
  const rows = await db.select().from(bookings).where(eq(bookings.tenantId, tenantId));
  return rows.sort((a, b) => a.slotStart.localeCompare(b.slotStart));
}

// Upcoming, non-cancelled, non-quote-visit bookings for a single client —
// backs the customer self-service settings page (reschedule/cadence/cancel).
export async function getUpcomingBookingsForClient(clientId: string) {
  const rows = await db.select().from(bookings).where(eq(bookings.clientId, clientId));
  const nowIso = new Date().toISOString();
  return rows
    .filter((b) => !b.isQuoteVisit && b.status !== 'CANCELLED' && b.slotStart >= nowIso)
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
}

export async function getJobsForCrew(crewId: string) {
  return db.select().from(jobs).where(eq(jobs.crewId, crewId));
}

export async function getJobById(id: string) {
  const rows = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return rows[0];
}

export async function getBookingById(id: string) {
  const rows = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return rows[0];
}

export async function getChecklistItemsForJob(jobId: string) {
  const rows = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, jobId));
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getCrewForUser(userId: string) {
  const memberships = await db.select().from(crewMembers).where(eq(crewMembers.userId, userId)).limit(1);
  const membership = memberships[0];
  if (!membership) return undefined;
  const rows = await db.select().from(crews).where(eq(crews.id, membership.crewId)).limit(1);
  return rows[0];
}

export { formatMoney, SERVICE_LABELS } from './format';

export async function getClientsForTenant(tenantId: string) {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'CUSTOMER')));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAllInvoicesForTenant(tenantId: string) {
  const rows = await db.select().from(invoices).where(eq(invoices.tenantId, tenantId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getNotificationLogForTenant(tenantId: string) {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.tenantId, tenantId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Unread entries for the admin "Alerts" panel — client-initiated changes
 * (address, cadence, reschedule, cancel) that the owner should see. */
export async function getUnreadAdminAlerts(tenantId: string, limit = 20) {
  const rows = await db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.tenantId, tenantId), eq(notificationLog.isRead, false)));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

