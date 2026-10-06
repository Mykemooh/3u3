import { and, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { inboundLeads, users } from '@/db/schema';
import { logChange, type Actor } from '@/lib/audit';
import { rawEvent } from '@/lib/events';
import { getOwnerEmail } from '@/lib/data';
import { sendEmail, esc } from '@/lib/email';
import { appUrl } from '@/lib/url';

/**
 * Leads that arrive from somewhere other than this site's own request
 * form — Angi, Thumbtack, Facebook Lead Ads, a website form — usually
 * through a Zapier/Make step posting to /api/hooks/leads with a company
 * API key.
 *
 * Field names are forgiving (name or first_name + last_name, phone or
 * phone_number, message or notes…) because every lead source names them
 * differently. A lead needs a name and a phone or email.
 *
 * Dedupe: while a lead from the same phone or email is still open (new
 * or contacted), a repeat is added to it — its note appended, blanks
 * filled, duplicateCount bumped — instead of making a second lead and a
 * second alert.
 */

export class InboundLeadError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const HOURLY_LIMIT = 200;
const OPEN = ['NEW', 'CONTACTED'] as const;

type Raw = Record<string, unknown>;

const str = (v: unknown, max: number): string | null => {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

const first = (raw: Raw, keys: string[], max: number) => {
  for (const k of keys) {
    const v = str(raw[k], max);
    if (v) return v;
  }
  return null;
};

/** Digits only, US numbers without the leading 1 — what two spellings of one number share. */
export function phoneKey(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length >= 7 ? d : null;
}

export type LeadInput = { name: string; phone: string | null; email: string | null; address: string | null; service: string | null; message: string | null; source: string };

export function parseLead(raw: Raw): LeadInput {
  const name =
    first(raw, ['name', 'full_name', 'fullName', 'customer_name', 'contact_name'], 120) ??
    ([first(raw, ['first_name', 'firstName'], 60), first(raw, ['last_name', 'lastName'], 60)].filter(Boolean).join(' ') || null);
  const phone = first(raw, ['phone', 'phone_number', 'phoneNumber', 'mobile', 'tel'], 40);
  const emailRaw = first(raw, ['email', 'email_address', 'emailAddress'], 200)?.toLowerCase() ?? null;
  const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
  const street = first(raw, ['address', 'street', 'address1', 'address_line1', 'street_address'], 200);
  const cityLine = [first(raw, ['city'], 80), first(raw, ['state'], 40), first(raw, ['zip', 'postal_code', 'zipcode'], 20)].filter(Boolean).join(' ');
  const address = [street, cityLine].filter(Boolean).join(', ') || null;
  const service = first(raw, ['service', 'service_type', 'serviceType', 'category', 'job_type'], 120);
  const message = first(raw, ['message', 'notes', 'comments', 'details', 'description'], 2000);
  const source = first(raw, ['source', 'lead_source', 'platform'], 60) ?? 'API';

  if (!name) throw new InboundLeadError('A lead needs a name.');
  if (!phoneKey(phone) && !email) throw new InboundLeadError('A lead needs a phone number or an email address.');
  return { name, phone: phoneKey(phone) ? phone : null, email, address, service, message, source };
}

/** An existing client of this company with the same phone or email, if any. */
async function matchClient(tenantId: string, lead: LeadInput) {
  const key = phoneKey(lead.phone);
  const candidates = await db
    .select({ id: users.id, phone: users.phone, email: users.email })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'CUSTOMER')));
  return candidates.find((c) => (key && phoneKey(c.phone) === key) || (lead.email && c.email?.toLowerCase() === lead.email))?.id ?? null;
}

export async function receiveLead(tenantId: string, raw: Raw, apiKeyId: string | null) {
  const lead = parseLead(raw);
  const key = phoneKey(lead.phone);

  const recent = await db
    .select({ id: inboundLeads.id })
    .from(inboundLeads)
    .where(and(eq(inboundLeads.tenantId, tenantId), gte(inboundLeads.createdAt, new Date(Date.now() - 3600_000))));
  if (recent.length >= HOURLY_LIMIT) throw new InboundLeadError('Too many leads this hour. Try again later.', 429);

  const match = [key ? eq(inboundLeads.phoneKey, key) : undefined, lead.email ? eq(inboundLeads.email, lead.email) : undefined].filter(Boolean);
  const [open] = await db
    .select()
    .from(inboundLeads)
    .where(and(eq(inboundLeads.tenantId, tenantId), inArray(inboundLeads.status, [...OPEN]), or(...match)))
    .orderBy(desc(inboundLeads.createdAt))
    .limit(1);

  if (open) {
    const note = lead.message && lead.message !== open.message ? [open.message, `${lead.source}: ${lead.message}`].filter(Boolean).join('\n\n').slice(0, 6000) : open.message;
    await db
      .update(inboundLeads)
      .set({
        duplicateCount: open.duplicateCount + 1,
        lastReceivedAt: new Date(),
        updatedAt: new Date(),
        message: note,
        phone: open.phone ?? lead.phone,
        phoneKey: open.phoneKey ?? key,
        email: open.email ?? lead.email,
        address: open.address ?? lead.address,
        service: open.service ?? lead.service,
      })
      .where(eq(inboundLeads.id, open.id));
    return { id: open.id, duplicate: true };
  }

  const id = crypto.randomUUID();
  const clientId = await matchClient(tenantId, lead);
  await db.insert(inboundLeads).values({ id, tenantId, ...lead, phoneKey: key, clientId, apiKeyId });
  await logChange({ tenantId, actor: { name: `${lead.source} (API)` }, entityType: 'lead', entityId: id, action: 'created', summary: `New lead from ${lead.source}: ${lead.name}` });

  try {
    const owner = await getOwnerEmail(tenantId);
    if (owner) {
      const rows = [
        ['Phone', lead.phone],
        ['Email', lead.email],
        ['Address', lead.address],
        ['Service', lead.service],
        ['Message', lead.message],
      ].filter((r) => r[1]);
      await sendEmail({
        to: owner,
        subject: `New lead from ${lead.source}: ${lead.name}`,
        html: `<div style="font-family:sans-serif;color:#041730;max-width:480px;margin:0 auto;">
          <p><strong>${esc(lead.name)}</strong> came in from ${esc(lead.source)}${clientId ? ' (already a client)' : ''}.</p>
          <table style="font-size:14px;">${rows.map(([l, v]) => `<tr><td style="color:#5B7085;padding-right:12px;vertical-align:top;">${l}</td><td>${esc(v)}</td></tr>`).join('')}</table>
          <p><a href="${appUrl('/admin/leads')}" style="color:#0157C4;">Open Leads →</a></p>
        </div>`,
      });
    }
  } catch (err) {
    console.error('[leads] owner alert failed', err);
  }

  await rawEvent(tenantId, 'lead.created', {
    lead: { id, source: lead.source, name: lead.name, phone: lead.phone, email: lead.email, address: lead.address, service: lead.service, message: lead.message, existing_client_id: clientId },
  });
  return { id, duplicate: false };
}

export async function listInboundLeads(tenantId: string, opts: { includeClosed?: boolean } = {}) {
  const where = opts.includeClosed ? eq(inboundLeads.tenantId, tenantId) : and(eq(inboundLeads.tenantId, tenantId), inArray(inboundLeads.status, [...OPEN]));
  return db.select().from(inboundLeads).where(where).orderBy(desc(inboundLeads.lastReceivedAt)).limit(200);
}

export async function setInboundLeadStatus(tenantId: string, id: string, status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DISMISSED', actor: Actor) {
  const [row] = await db.select().from(inboundLeads).where(and(eq(inboundLeads.id, id), eq(inboundLeads.tenantId, tenantId))).limit(1);
  if (!row) throw new InboundLeadError('Not found', 404);
  if (row.status === status) return;
  await db.update(inboundLeads).set({ status, updatedAt: new Date() }).where(eq(inboundLeads.id, id));
  await logChange({
    tenantId,
    actor,
    entityType: 'lead',
    entityId: id,
    action: 'status',
    summary: `Marked ${row.name}'s lead ${status.toLowerCase()}`,
    changes: [{ field: 'status', from: row.status, to: status }],
  });
}
