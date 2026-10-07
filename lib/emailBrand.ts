import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, users } from '@/db/schema';
import { isHouseBrand } from '@/lib/brand';
import { appUrl } from '@/lib/url';

/**
 * Every email and text the platform sends goes out in the name of the
 * company the person belongs to — never one company's name on another's
 * messages. Templates (lib/email.ts, lib/i18n/messages/notify.ts) write
 * these tokens instead of a name; lib/email.ts sendEmail and lib/notify.ts
 * fill them in at send time.
 */
import { BRAND_HEADER_TOKEN, COMPANY_TOKEN } from '@/lib/emailTokens';
export { BRAND_HEADER_TOKEN, COMPANY_TOKEN };

export type SenderCompany = { name: string; house: boolean; logoUrl: string | null; inkColor: string };

type TenantRow = typeof tenants.$inferSelect;

function toCompany(t: TenantRow | undefined): SenderCompany {
  if (!t) return { name: 'Your cleaning company', house: false, logoUrl: null, inkColor: '#0B1F3B' };
  return { name: t.name, house: isHouseBrand(t), logoUrl: t.logoUrl ?? null, inkColor: t.inkColor || '#0B1F3B' };
}

export async function companyForTenant(tenantId: string | null | undefined): Promise<SenderCompany> {
  if (tenantId) {
    const t = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
    if (t) return toCompany(t);
  }
  return toCompany((await db.select().from(tenants).where(eq(tenants.isPlatform, false)).orderBy(asc(tenants.createdAt)).limit(1))[0]);
}

/** The company of whoever owns this email address (emails are unique across the platform). */
export async function companyForRecipient(email: string): Promise<SenderCompany> {
  const u = (await db.select({ tenantId: users.tenantId }).from(users).where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`).limit(1))[0];
  return companyForTenant(u?.tenantId);
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Puts the company's name in place of the token (plain text: texts, subjects). */
export function fillCompanyText(text: string, company: Pick<SenderCompany, 'name'>): string {
  return text.split(COMPANY_TOKEN).join(company.name);
}

/** The header band of the branded emails: 3U3's wordmark, another company's logo, or its name. */
export function brandHeaderHtml(c: SenderCompany): string {
  if (c.house) {
    return `<div style="background:#0B1F3B;padding:20px;text-align:center;"><img src="${appUrl('/brand/logo-640.png')}" alt="${escHtml(c.name)}" width="180" style="width:180px;max-width:60%;height:auto;" /></div>`;
  }
  if (c.logoUrl) {
    return `<div style="background:#ffffff;border-bottom:1px solid #E5E7EB;padding:20px;text-align:center;"><img src="${escHtml(c.logoUrl)}" alt="${escHtml(c.name)}" style="max-height:48px;max-width:60%;height:auto;" /></div>`;
  }
  return `<div style="background:${escHtml(c.inkColor)};padding:22px 20px;text-align:center;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:#ffffff;">${escHtml(c.name)}</div>`;
}

/** Fills both tokens in an HTML email (the name is escaped). */
export function fillCompanyHtml(html: string, company: SenderCompany): string {
  return html.split(BRAND_HEADER_TOKEN).join(brandHeaderHtml(company)).split(COMPANY_TOKEN).join(escHtml(company.name));
}
