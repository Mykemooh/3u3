import { db } from '@/db/client';
import { supplyReports, users, crews } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getOwnerEmail } from '@/lib/data';
import { sendEmail, esc } from '@/lib/email';
import { appUrl } from '@/lib/url';

export class SupplyReportError extends Error {}

export const SUPPLY_STATUS_LABELS: Record<'LOW' | 'OUT' | 'DAMAGED', string> = {
  LOW: 'Running low',
  OUT: 'Out of stock',
  DAMAGED: 'Damaged',
};

/**
 * Deliberately light: a crew member types a product name and picks a
 * status — no catalog to maintain. Tied to the crew/team (supplies are
 * shared gear, not personal), and notifies the owner immediately so a
 * low or damaged item doesn't sit unnoticed until someone's next shift.
 */
export async function createSupplyReport(input: {
  tenantId: string;
  crewId: string;
  reportedByUserId: string;
  productName: string;
  status: 'LOW' | 'OUT' | 'DAMAGED';
  notes?: string | null;
}) {
  const id = crypto.randomUUID();
  await db.insert(supplyReports).values({
    id,
    tenantId: input.tenantId,
    crewId: input.crewId,
    reportedByUserId: input.reportedByUserId,
    productName: input.productName.trim(),
    status: input.status,
    notes: input.notes?.trim() || null,
  });

  try {
    const ownerEmail = await getOwnerEmail(input.tenantId);
    const [reporter, crew] = await Promise.all([
      db.select().from(users).where(eq(users.id, input.reportedByUserId)).limit(1).then((r) => r[0]),
      db.select().from(crews).where(eq(crews.id, input.crewId)).limit(1).then((r) => r[0]),
    ]);
    if (ownerEmail) {
      await sendEmail({
        to: ownerEmail,
        subject: `Supply alert: ${SUPPLY_STATUS_LABELS[input.status]} — ${input.productName}`,
        html: `<div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
          <h2 style="color:#1D4ED8;">3U3 Cleaning</h2>
          <p><strong>${esc(reporter?.name ?? 'A crew member')}</strong> (${esc(crew?.name ?? 'a team')}) flagged:</p>
          <p style="font-size:16px;"><strong>${esc(input.productName)}</strong> — ${SUPPLY_STATUS_LABELS[input.status]}</p>
          ${input.notes ? `<p style="color:#334155;">"${esc(input.notes)}"</p>` : ''}
          <p><a href="${appUrl('/admin/supplies')}" style="color:#1D4ED8;">View in the admin portal →</a></p>
        </div>`,
      });
    }
  } catch (err) {
    console.warn('[supplies] owner notification failed:', err);
  }

  return id;
}

export type SupplyReportRow = { report: typeof supplyReports.$inferSelect; reporterName: string; crewName: string };

export async function getSupplyReportsForTenant(tenantId: string, includeResolved = false): Promise<SupplyReportRow[]> {
  const rows = await db
    .select({ report: supplyReports, reporterName: users.name, crewName: crews.name })
    .from(supplyReports)
    .innerJoin(users, eq(supplyReports.reportedByUserId, users.id))
    .innerJoin(crews, eq(supplyReports.crewId, crews.id))
    .where(includeResolved ? eq(supplyReports.tenantId, tenantId) : and(eq(supplyReports.tenantId, tenantId), eq(supplyReports.resolved, false)));
  return rows.map((r) => ({ report: r.report, reporterName: r.reporterName, crewName: r.crewName })).sort((a, b) => b.report.createdAt.getTime() - a.report.createdAt.getTime());
}

export async function getSupplyReportsForCrew(crewId: string, limit = 10) {
  return db.select().from(supplyReports).where(eq(supplyReports.crewId, crewId)).orderBy(desc(supplyReports.createdAt)).limit(limit);
}

export async function resolveSupplyReport(tenantId: string, reportId: string) {
  const existing = (await db.select().from(supplyReports).where(and(eq(supplyReports.id, reportId), eq(supplyReports.tenantId, tenantId))).limit(1))[0];
  if (!existing) throw new SupplyReportError('Report not found');
  await db.update(supplyReports).set({ resolved: true, resolvedAt: new Date() }).where(eq(supplyReports.id, reportId));
}
