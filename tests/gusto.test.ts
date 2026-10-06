import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, seeded, makeUser } from './helpers/fixtures';
import { payrollEntries, payrollRuns, integrations } from '@/db/schema';
import { gustoCsv, pushRunToGusto } from '@/lib/gusto';
import { saveConnection } from '@/lib/companyConnections';
import { getPayrollRun } from '@/lib/payroll';
import { and, eq } from 'drizzle-orm';

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.GUSTO_CLIENT_ID;
  delete process.env.GUSTO_CLIENT_SECRET;
});

async function makeRun(tenantId: string) {
  const hourly = await makeUser(tenantId, 'CLEANER', { name: 'Hana Hourly', email: `hana-${Date.now()}@example.com` });
  const perClean = await makeUser(tenantId, 'CLEANER', { name: 'Pat "PC" Clean Jr', email: `pat-${Date.now()}@example.com` });
  const runId = crypto.randomUUID();
  await db.insert(payrollRuns).values({ id: runId, tenantId, label: 'Oct 1–14', periodStart: '2026-10-01', periodEnd: '2026-10-14' });
  await db.insert(payrollEntries).values([
    { id: crypto.randomUUID(), payrollRunId: runId, userId: hourly.id, payType: 'HOURLY', rateCents: 2000, hours: 31.5, payCents: 63000, tipCents: 2500 },
    { id: crypto.randomUUID(), payrollRunId: runId, userId: perClean.id, payType: 'PER_CLEAN', rateCents: 6000, jobCount: 7, payCents: 42000, tipCents: 0 },
  ]);
  return { runId, hourly, perClean };
}

test('Gusto CSV: hours for hourly pay, commission for per-clean pay, tips as paycheck tips', async () => {
  const { tenant } = await seeded();
  const { runId } = await makeRun(tenant.id);
  const csv = gustoCsv((await getPayrollRun(tenant.id, runId))!.rows);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'last_name,first_name,regular_hours,overtime_hours,double_overtime_hours,bonus,commission,paycheck_tips,cash_tips,reimbursement');
  assert.ok(lines.includes('Hourly,Hana,31.50,0.00,0.00,0.00,0.00,25.00,0.00,0.00'));
  assert.ok(lines.includes('Jr,"Pat ""PC"" Clean",0.00,0.00,0.00,0.00,420.00,0.00,0.00,0.00'));
});

test('Send to Gusto fills the open payroll for the period, matched by email', async () => {
  const { tenant, admin } = await seeded();
  process.env.GUSTO_CLIENT_ID = 'gid';
  process.env.GUSTO_CLIENT_SECRET = 'gsecret';
  const { runId, hourly, perClean } = await makeRun(tenant.id);
  await assert.rejects(pushRunToGusto(tenant.id, runId, null), /Connect Gusto first/);
  await saveConnection(tenant.id, 'GUSTO', { access_token: 'tok', refresh_token: 'ref', expires_in: 7200 }, 'co-uuid', null, 'Gusto');

  const calls: { method: string; url: string; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const u = String(url);
    calls.push({ method, url: u, body: init.body ? JSON.parse(String(init.body)) : null });
    if (u.includes('/employees')) return Response.json([{ uuid: 'e-hana', email: hourly.email, first_name: 'Hana', last_name: 'Hourly' }]);
    if (u.includes('/payrolls?')) return Response.json([{ payroll_uuid: 'p-other', pay_period: { start_date: '2026-09-15', end_date: '2026-09-30' } }, { payroll_uuid: 'p-oct', pay_period: { start_date: '2026-10-01', end_date: '2026-10-14' } }]);
    if (u.endsWith('/prepare')) return Response.json({ payroll_uuid: 'p-oct', version: 'v123' });
    return Response.json({});
  }) as typeof fetch;

  const r = await pushRunToGusto(tenant.id, runId, { id: admin.id, name: admin.name });
  assert.deepEqual(r.matched, ['Hana Hourly']);
  assert.deepEqual(r.unmatched, [perClean.name]);
  const update = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/payrolls/p-oct'))!;
  assert.ok(update.url.startsWith('https://api.gusto-demo.com/v1/companies/co-uuid/'));
  assert.equal(update.body.version, 'v123');
  assert.deepEqual(update.body.employee_compensations, [
    { employee_uuid: 'e-hana', hourly_compensations: [{ name: 'Regular Hours', hours: '31.500' }], fixed_compensations: [{ name: 'Paycheck Tips', amount: '25.00' }] },
  ]);
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
  assert.equal(run.gustoPayrollId, 'p-oct');
  const [conn] = await db.select().from(integrations).where(and(eq(integrations.tenantId, tenant.id), eq(integrations.provider, 'GUSTO')));
  assert.notEqual(conn.accessToken, 'tok', 'tokens sealed at rest');
});
