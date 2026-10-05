import { db } from '@/db/client';
import { heartbeats } from '@/db/schema';
import { sql } from 'drizzle-orm';

/**
 * Health for the public status page (/status) and uptime monitors
 * (/api/health): can we reach the database, and have the daily jobs run
 * when they should? Nothing here reveals configuration or customer data.
 */

export const JOBS: { key: string; label: string; staleAfterHours: number }[] = [
  { key: 'cron:reminders', label: 'Reminders and follow-ups', staleAfterHours: 26 },
  { key: 'cron:monthly-billing', label: 'Monthly billing', staleAfterHours: 26 },
  { key: 'cron:media-cleanup', label: 'Photo storage cleanup', staleAfterHours: 26 },
];

export async function recordHeartbeat(key: string, ok: boolean, detail?: unknown) {
  const text = detail == null ? null : JSON.stringify(detail).slice(0, 2000);
  await db
    .insert(heartbeats)
    .values({ key, ranAt: new Date(), ok, detail: text })
    .onConflictDoUpdate({ target: heartbeats.key, set: { ranAt: new Date(), ok, detail: text } })
    .catch((err) => console.error('[health] heartbeat failed', err));
}

export type Health = {
  status: 'operational' | 'degraded' | 'down';
  database: { ok: boolean; ms: number | null };
  jobs: { key: string; label: string; lastRun: string | null; ok: boolean | null; state: 'ok' | 'late' | 'failed' | 'never' }[];
  checkedAt: string;
};

export async function checkHealth(): Promise<Health> {
  const t0 = Date.now();
  let dbOk = true;
  let rows: (typeof heartbeats.$inferSelect)[] = [];
  try {
    await db.execute(sql`select 1`);
    rows = await db.select().from(heartbeats);
  } catch {
    dbOk = false;
  }
  const ms = dbOk ? Date.now() - t0 : null;
  const jobs = JOBS.map((j) => {
    const r = rows.find((x) => x.key === j.key);
    const state: Health['jobs'][number]['state'] = !r ? 'never' : !r.ok ? 'failed' : Date.now() - r.ranAt.getTime() > j.staleAfterHours * 3600_000 ? 'late' : 'ok';
    return { key: j.key, label: j.label, lastRun: r?.ranAt.toISOString() ?? null, ok: r?.ok ?? null, state };
  });
  const status: Health['status'] = !dbOk ? 'down' : jobs.some((j) => j.state === 'failed' || j.state === 'late') ? 'degraded' : 'operational';
  return { status, database: { ok: dbOk, ms }, jobs, checkedAt: new Date().toISOString() };
}
