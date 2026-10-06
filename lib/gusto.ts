import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { payrollRuns } from '@/db/schema';
import { getPayrollRun, type PayrollRunRow } from '@/lib/payroll';
import { appUrl } from '@/lib/url';
import { logChange, type Actor } from '@/lib/audit';
import { freshAccessToken, getConnection, saveConnection, type TokenSet } from '@/lib/companyConnections';

/**
 * Payroll in Gusto.
 *
 * Works today with no keys: every payroll run exports as a CSV laid out
 * like Gusto's "import hours and earnings" template — first and last
 * name, regular hours, commission, paycheck tips. Hourly pay goes in as
 * hours (Gusto applies its own rate); per-clean, day-rate and percentage
 * pay go in as commission; tips go in as paycheck tips (tips are taxable
 * wages, IRS Topic 761). Check the columns against the template in your
 * Gusto account before the first upload.
 *
 * With Gusto partner credentials (GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET;
 * GUSTO_ENVIRONMENT=production to leave Gusto's demo environment) a
 * company connects its Gusto account and "Send to Gusto" writes the same
 * numbers into the open Gusto payroll for that pay period, matching
 * people by email. Nothing is submitted — the owner reviews and runs
 * payroll in Gusto.
 */

export class GustoError extends Error {}

const API_VERSION = '2024-04-01';
export const gustoConfigured = () => !!(process.env.GUSTO_CLIENT_ID?.trim() && process.env.GUSTO_CLIENT_SECRET?.trim());
const base = () => (process.env.GUSTO_ENVIRONMENT === 'production' ? 'https://api.gusto.com' : 'https://api.gusto-demo.com');
const redirectUri = () => appUrl('/api/admin/integrations/gusto/callback');

const money = (cents: number) => (cents / 100).toFixed(2);
const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? { first: parts[0], last: '' } : { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/** The part of an entry's pay that isn't hours (Gusto's rate covers hourly pay). */
const commissionCents = (row: PayrollRunRow) => (row.entry.payType === 'HOURLY' ? 0 : row.entry.payCents);

export function gustoCsv(rows: PayrollRunRow[]): string {
  const header = ['last_name', 'first_name', 'regular_hours', 'overtime_hours', 'double_overtime_hours', 'bonus', 'commission', 'paycheck_tips', 'cash_tips', 'reimbursement'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const { first, last } = splitName(r.name);
    const hours = r.entry.payType === 'HOURLY' ? r.entry.hours.toFixed(2) : '0.00';
    lines.push([q(last), q(first), hours, '0.00', '0.00', '0.00', money(commissionCents(r)), money(r.entry.tipCents), '0.00', '0.00'].join(','));
  }
  return lines.join('\n') + '\n';
}

// ---- Connect -------------------------------------------------------------

export function gustoAuthorizeUrl(state: string) {
  const params = new URLSearchParams({ client_id: process.env.GUSTO_CLIENT_ID ?? '', redirect_uri: redirectUri(), response_type: 'code', state });
  return `${base()}/oauth/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${base()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: process.env.GUSTO_CLIENT_ID, client_secret: process.env.GUSTO_CLIENT_SECRET, redirect_uri: redirectUri(), ...body }),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as TokenSet;
  if (!res.ok || !data.access_token) throw new GustoError(`Gusto sign-in failed (${res.status})`);
  return data;
}

async function gusto(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-Gusto-API-Version': API_VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new GustoError(`Gusto refused (${res.status})${data?.errors?.[0]?.message ? `: ${data.errors[0].message}` : ''}`);
  return data;
}

export async function connectGusto(tenantId: string, code: string, actor: Actor) {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code });
  const info = await gusto(tokens.access_token, 'GET', '/v1/token_info');
  const companyUuid = info?.resource?.type === 'Company' ? String(info.resource.uuid) : null;
  if (!companyUuid) throw new GustoError('That Gusto sign-in isn’t tied to a company.');
  await saveConnection(tenantId, 'GUSTO', tokens, companyUuid, actor, 'Gusto');
}

async function access(tenantId: string) {
  const row = await getConnection(tenantId, 'GUSTO');
  if (!row?.externalAccountId) throw new GustoError('Connect Gusto first (Settings → Integrations).');
  const token = await freshAccessToken(row, (refresh_token) => tokenRequest({ grant_type: 'refresh_token', refresh_token }));
  return { token, company: row.externalAccountId };
}

// ---- Push ------------------------------------------------------------------

type GustoEmployee = { uuid: string; email?: string | null; work_email?: string | null; first_name: string; last_name: string };
type GustoPayroll = { payroll_uuid?: string; uuid?: string; version?: string; pay_period?: { start_date: string; end_date: string }; processed?: boolean };

export async function pushRunToGusto(tenantId: string, runId: string, actor: Actor) {
  if (!gustoConfigured()) throw new GustoError('Gusto isn’t set up for this site yet.');
  const data = await getPayrollRun(tenantId, runId);
  if (!data) throw new GustoError('Payroll run not found.');
  const { token, company } = await access(tenantId);

  const employees: GustoEmployee[] = [];
  for (let page = 1; page <= 20; page++) {
    const batch = (await gusto(token, 'GET', `/v1/companies/${company}/employees?page=${page}&per=100`)) as GustoEmployee[];
    employees.push(...(batch ?? []));
    if (!batch || batch.length < 100) break;
  }
  const payrolls = (await gusto(token, 'GET', `/v1/companies/${company}/payrolls?processing_statuses=unprocessed&payroll_types=regular`)) as GustoPayroll[];
  const target =
    payrolls.find((p) => p.pay_period?.start_date === data.run.periodStart && p.pay_period?.end_date === data.run.periodEnd) ??
    payrolls.find((p) => p.pay_period && p.pay_period.start_date <= data.run.periodEnd && p.pay_period.end_date >= data.run.periodStart);
  const payrollId = target?.payroll_uuid ?? target?.uuid;
  if (!payrollId) throw new GustoError(`Gusto has no open payroll for ${data.run.periodStart} to ${data.run.periodEnd}. Open that pay period in Gusto first.`);

  // Prepare returns the current version, which the update must quote.
  const prepared = (await gusto(token, 'PUT', `/v1/companies/${company}/payrolls/${payrollId}/prepare`)) as GustoPayroll;

  const matched: string[] = [];
  const unmatched: string[] = [];
  const comps = [];
  for (const r of data.rows) {
    const email = r.email?.toLowerCase();
    const emp = email ? employees.find((e) => e.email?.toLowerCase() === email || e.work_email?.toLowerCase() === email) : undefined;
    if (!emp) {
      unmatched.push(r.name);
      continue;
    }
    matched.push(r.name);
    comps.push({
      employee_uuid: emp.uuid,
      hourly_compensations: r.entry.payType === 'HOURLY' ? [{ name: 'Regular Hours', hours: r.entry.hours.toFixed(3) }] : [],
      fixed_compensations: [
        ...(commissionCents(r) > 0 ? [{ name: 'Commission', amount: money(commissionCents(r)) }] : []),
        ...(r.entry.tipCents > 0 ? [{ name: 'Paycheck Tips', amount: money(r.entry.tipCents) }] : []),
      ],
    });
  }
  if (!comps.length) throw new GustoError('Nobody in this run matched a Gusto employee by email. Check the emails on Team match Gusto.');

  await gusto(token, 'PUT', `/v1/companies/${company}/payrolls/${payrollId}`, { version: prepared?.version, employee_compensations: comps });
  await db.update(payrollRuns).set({ gustoPayrollId: payrollId, gustoPushedAt: new Date() }).where(eq(payrollRuns.id, runId));
  await logChange({
    tenantId,
    actor,
    entityType: 'payroll_run',
    entityId: runId,
    action: 'sent_to_gusto',
    summary: `Sent ${matched.length} ${matched.length === 1 ? 'person' : 'people'} to Gusto${unmatched.length ? `; not found in Gusto: ${unmatched.join(', ')}` : ''}`,
  });
  return { matched, unmatched };
}
