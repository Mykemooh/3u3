import { db } from '@/db/client';
import {
  tenants, serviceTypes, crews, clientRates, users, addresses, bookings,
  jobs, jobChecklistItems, crewMembers,
} from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getTenant() {
  const rows = await db.select().from(tenants).limit(1);
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

export function formatMoney(cents: number | null | undefined) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

export const SERVICE_LABELS: Record<string, string> = {
  STANDARD: 'Standard Cleaning',
  DEEP: 'Deep Cleaning',
  MOVE_IN_OUT: 'Move-In / Move-Out',
  AIRBNB: 'Airbnb / Rental Turnover',
};
