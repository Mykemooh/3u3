import { db } from '@/db/client';
import { auditLog } from '@/db/schema';
import { and, desc, eq, gte } from 'drizzle-orm';

/**
 * Change history: who changed what, and when, on any record. Writing an
 * entry never fails the change it describes — a history row is worth
 * having, but never worth losing the actual edit over.
 */

export type Actor = { id?: string | null; name?: string | null } | null | undefined;

export type AuditEntity =
  | 'booking' | 'series' | 'invoice' | 'quote' | 'client' | 'role' | 'team_member'
  | 'payroll_run' | 'settings' | 'automation' | 'template' | 'expense' | 'job'
  | 'review' | 'campaign' | 'kb_article' | 'service'
  | 'ad_concept' | 'api_key' | 'webhook' | 'lead' | 'integration' | 'background_check';

export type FieldChange = { field: string; from: unknown; to: unknown };

export async function logChange(input: {
  tenantId: string;
  actor: Actor;
  entityType: AuditEntity;
  entityId: string;
  action: string;
  summary: string;
  changes?: FieldChange[];
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      actorUserId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? 'System',
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      changesJson: input.changes?.length ? JSON.stringify(input.changes) : null,
    });
  } catch (err) {
    console.error('[audit] could not record change', err);
  }
}

/** Field-by-field differences between two snapshots of a record. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields?: (keyof T)[]): FieldChange[] {
  const keys = (fields ?? (Object.keys(after) as (keyof T)[])).filter((k) => k in after);
  const out: FieldChange[] = [];
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) out.push({ field: String(k), from: norm(a), to: norm(b) });
  }
  return out;
}

export async function historyFor(tenantId: string, entityType: AuditEntity, entityId: string) {
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(desc(auditLog.createdAt));
  return rows.map(shape);
}

export async function recentActivity(tenantId: string, opts: { sinceDays?: number; entityType?: AuditEntity; actorUserId?: string; limit?: number } = {}) {
  const since = new Date(Date.now() - (opts.sinceDays ?? 30) * 86400000);
  const conditions = [eq(auditLog.tenantId, tenantId), gte(auditLog.createdAt, since)];
  if (opts.entityType) conditions.push(eq(auditLog.entityType, opts.entityType));
  if (opts.actorUserId) conditions.push(eq(auditLog.actorUserId, opts.actorUserId));
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(opts.limit ?? 200);
  return rows.map(shape);
}

function shape(row: typeof auditLog.$inferSelect) {
  let changes: FieldChange[] = [];
  try {
    changes = row.changesJson ? JSON.parse(row.changesJson) : [];
  } catch {
    changes = [];
  }
  return { ...row, changes };
}

/** Plain-words label for a field name in the history view. */
export function fieldLabel(field: string): string {
  return field
    .replace(/Cents$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
