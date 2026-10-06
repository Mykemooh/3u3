import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { backgroundChecks, users } from '@/db/schema';
import { logChange, type Actor } from '@/lib/audit';
import { getOwnerEmail } from '@/lib/data';
import { sendEmail, esc } from '@/lib/email';
import { appUrl } from '@/lib/url';

/**
 * Background checks through Checkr (checkr.com), from Team.
 *
 * "Send background check" creates a Checkr candidate and an invitation:
 * Checkr emails the cleaner its own hosted form, which takes their
 * details, the FCRA disclosure and their consent — none of that passes
 * through this app. Checkr then tells us how it's going by webhook
 * (POST /api/hooks/checkr, signed with the API key), and we keep only the
 * status and the overall result. The report stays in Checkr.
 *
 * Needs CHECKR_API_KEY (a Checkr partner/API account). Optional:
 * CHECKR_PACKAGE (the package slug on that account; default
 * "basic_plus") and CHECKR_ENVIRONMENT=staging for Checkr's test
 * environment.
 */

export class CheckrError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const checkrConfigured = () => !!process.env.CHECKR_API_KEY?.trim();
const apiBase = () => (process.env.CHECKR_ENVIRONMENT === 'staging' ? 'https://api.checkr-staging.com/v1' : 'https://api.checkr.com/v1');
export const checkrPackage = () => process.env.CHECKR_PACKAGE?.trim() || 'basic_plus';

async function checkr(path: string, body: Record<string, unknown>) {
  const key = process.env.CHECKR_API_KEY?.trim();
  if (!key) throw new CheckrError('Background checks aren’t set up for this site yet.');
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new CheckrError(`Checkr said: ${data.error ?? data.errors?.join?.(', ') ?? `HTTP ${res.status}`}`, 502);
  return data;
}

const OPEN = ['INVITED', 'PENDING', 'SUSPENDED', 'DISPUTE'];

export async function startBackgroundCheck(
  tenantId: string,
  userId: string,
  where: { state: string; city?: string | null },
  actor: Actor,
) {
  if (!checkrConfigured()) throw new CheckrError('Background checks aren’t set up for this site yet.');
  const [person] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId))).limit(1);
  if (!person || person.role !== 'CLEANER') throw new CheckrError('Team member not found.', 404);
  if (!person.email) throw new CheckrError('Add an email for this person first — Checkr sends the form there.');
  const state = where.state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new CheckrError('Enter the two-letter state they’ll work in.');
  const open = await db
    .select()
    .from(backgroundChecks)
    .where(and(eq(backgroundChecks.tenantId, tenantId), eq(backgroundChecks.userId, userId), inArray(backgroundChecks.status, OPEN)));
  if (open.length) throw new CheckrError('A check is already under way for this person.');

  const [first, ...rest] = person.name.trim().split(/\s+/);
  const candidate = await checkr('/candidates', {
    first_name: first,
    last_name: rest.join(' ') || first,
    email: person.email,
    phone: person.phone ?? undefined,
    work_locations: [{ country: 'US', state, city: where.city?.trim() || undefined }],
    metadata: { trashcan_tenant: tenantId, trashcan_user: userId },
  });
  const pkg = checkrPackage();
  const invitation = await checkr('/invitations', {
    candidate_id: candidate.id,
    package: pkg,
    work_locations: [{ country: 'US', state, city: where.city?.trim() || undefined }],
  });

  const id = crypto.randomUUID();
  await db.insert(backgroundChecks).values({
    id,
    tenantId,
    userId,
    candidateId: String(candidate.id),
    invitationId: invitation.id ? String(invitation.id) : null,
    invitationUrl: typeof invitation.invitation_url === 'string' ? invitation.invitation_url : null,
    package: pkg,
    status: 'INVITED',
    workState: state,
    workCity: where.city?.trim() || null,
    requestedByUserId: actor?.id ?? null,
  });
  await logChange({ tenantId, actor, entityType: 'background_check', entityId: id, action: 'invited', summary: `Sent ${person.name} a background check (${pkg})` });
  return { id };
}

export async function listBackgroundChecks(tenantId: string) {
  return db.select().from(backgroundChecks).where(eq(backgroundChecks.tenantId, tenantId)).orderBy(desc(backgroundChecks.createdAt));
}

/** Checkr signs each webhook with HMAC-SHA256 of the raw body, keyed with the API key. */
export function verifyCheckrSignature(rawBody: string, signature: string | null): boolean {
  const key = process.env.CHECKR_API_KEY?.trim();
  if (!key || !signature) return false;
  const expected = Buffer.from(createHmac('sha256', key).update(rawBody).digest('hex'));
  const given = Buffer.from(signature.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type CheckrEvent = { type?: string; data?: { object?: Record<string, any> } };

/** What one webhook event means for our row. Pure, so it's easy to test. */
export function statusFromEvent(event: CheckrEvent): { status?: string; result?: string | null; reportId?: string; done?: boolean } | null {
  const type = event.type ?? '';
  const o = event.data?.object ?? {};
  switch (type) {
    case 'invitation.completed':
      return { status: 'PENDING' };
    case 'invitation.expired':
      return { status: 'EXPIRED', done: true };
    case 'invitation.deleted':
      return { status: 'CANCELED', done: true };
    case 'report.created':
      return { status: 'PENDING', reportId: o.id };
    case 'report.suspended':
      return { status: 'SUSPENDED', reportId: o.id };
    case 'report.resumed':
      return { status: 'PENDING', reportId: o.id };
    case 'report.disputed':
      return { status: 'DISPUTE', reportId: o.id };
    case 'report.canceled':
      return { status: 'CANCELED', reportId: o.id, done: true };
    case 'report.completed':
    case 'report.upgraded': {
      // Newer accounts report an assessment ("eligible"/"review"/"escalated");
      // older ones a result ("clear"/"consider").
      const verdict = String(o.assessment ?? o.result ?? '').toLowerCase();
      const clear = verdict === 'clear' || verdict === 'eligible';
      return { status: clear ? 'CLEAR' : 'CONSIDER', result: verdict || null, reportId: o.id, done: true };
    }
    default:
      return null;
  }
}

export async function handleCheckrEvent(event: CheckrEvent) {
  const change = statusFromEvent(event);
  if (!change) return { handled: false };
  const candidateId = event.data?.object?.candidate_id;
  if (!candidateId) return { handled: false };
  const [row] = await db.select().from(backgroundChecks).where(eq(backgroundChecks.candidateId, String(candidateId))).orderBy(desc(backgroundChecks.createdAt)).limit(1);
  if (!row) return { handled: false };
  // A finished check doesn't go back to pending on a late, out-of-order event.
  if (['CLEAR', 'CONSIDER'].includes(row.status) && change.status === 'PENDING') return { handled: true };

  await db
    .update(backgroundChecks)
    .set({
      status: change.status ?? row.status,
      result: change.result !== undefined ? change.result : row.result,
      reportId: change.reportId ?? row.reportId,
      completedAt: change.done ? new Date() : row.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(backgroundChecks.id, row.id));
  if (change.status !== row.status) {
    await logChange({ tenantId: row.tenantId, actor: { name: 'Checkr' }, entityType: 'background_check', entityId: row.id, action: 'status', summary: `Background check ${change.status?.toLowerCase()}`, changes: [{ field: 'status', from: row.status, to: change.status }] });
  }

  if (change.status === 'CLEAR' || change.status === 'CONSIDER') {
    try {
      const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.userId)).limit(1);
      const owner = await getOwnerEmail(row.tenantId);
      if (owner) {
        await sendEmail({
          to: owner,
          subject: `Background check ${change.status === 'CLEAR' ? 'clear' : 'needs your review'}: ${person?.name ?? 'team member'}`,
          html: `<div style="font-family:sans-serif;color:#041730;max-width:480px;margin:0 auto;">
            <p>The background check for <strong>${esc(person?.name ?? 'a team member')}</strong> is finished: <strong>${change.status === 'CLEAR' ? 'clear' : 'needs review'}</strong>.</p>
            <p>The full report is in your Checkr dashboard. ${change.status === 'CONSIDER' ? 'If you decide not to hire based on it, Checkr walks you through the required adverse-action notices.' : ''}</p>
            <p><a href="${appUrl('/admin/team')}" style="color:#0157C4;">Open Team →</a></p>
          </div>`,
        });
      }
    } catch (err) {
      console.error('[checkr] owner email failed', err);
    }
  }
  return { handled: true };
}
