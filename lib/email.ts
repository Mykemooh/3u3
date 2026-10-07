import { appUrl } from '@/lib/url';
import { intlLocale, plural, translator, type Locale } from '@/lib/i18n';
import { notifyMessages } from '@/lib/i18n/messages/notify';
import { serviceName as builtInServiceName } from '@/lib/format';

/**
 * Templates sent to a client (or to a cleaner about their own account)
 * take an optional `locale` — the recipient's users.locale — and default to
 * English, which renders exactly as it always has. Words live in
 * lib/i18n/messages/notify.ts. Owner-facing templates stay English.
 */
const tFor = (locale: Locale | undefined) => translator(notifyMessages, locale ?? 'en');

/**
 * A service's name for a message in `locale`: English keeps whatever name
 * the caller already used; Spanish uses the built-in Spanish label for the
 * standard services (a company's own service names stay as typed).
 */
export function localizedServiceName(locale: Locale | undefined, englishName: string, key?: string | null): string {
  if (locale !== 'es' || !key) return englishName;
  return builtInServiceName(key, englishName, 'es');
}

/**
 * A tenant's own name/colors/logo for the handful of templates that carry
 * real money (invoice, payment-received) — the ones a company's own
 * branding actually needs to show up on, not every notification. Most of
 * this file's other templates are still hardcoded to 3U3 itself (a
 * known gap, not an oversight): rebranding all of them means threading
 * a tenant through every call site across the app, which hasn't been
 * done yet. FROM_EMAIL below is unaffected either way — one shared
 * Resend sender for the whole platform, since per-tenant sending would
 * need each company to verify its own domain with Resend.
 */
export type EmailBrand = { name: string; tagline: string | null; primaryColor: string; bronzeColor: string; logoUrl: string | null };

function brandHeader(brand: EmailBrand, heading: string) {
  const logo = brand.logoUrl ? `<img src="${brand.logoUrl}" alt="${esc(brand.name)}" style="max-height:40px;display:block;margin-bottom:8px;" />` : '';
  return `${logo}<h2 style="color:${brand.bronzeColor};margin:0 0 4px;">${esc(heading)}</h2>`;
}

function brandFooter(brand: EmailBrand) {
  return `<p style="color:#6b6b6b;font-size:13px;margin-top:24px;">— ${esc(brand.name)}</p>`;
}

// Real email sending via Resend (https://resend.com — free tier covers
// thousands/month, matching the PRD's "effectively free at launch volume"
// note in section 6.6). Every send still goes through logNotification()
// in lib/bookings.ts first, so notification_log stays the source of truth
// for the cost-tracking goal in PRD section 3 regardless of whether the
// provider is configured yet.
//
// Until RESEND_API_KEY is set, sendEmail() no-ops with a console warning
// instead of throwing — so the booking flow itself never fails just
// because email delivery isn't wired up yet.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || '3U3 Cleaning <onboarding@resend.dev>';

export function emailConfigured() {
  return !!RESEND_API_KEY;
}

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — would have sent "${input.subject}" to ${input.to}`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: input.to, subject: input.subject, html: input.html }),
    });
    if (!res.ok) {
      console.error('[email] Resend rejected the request:', await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] send failed:', err);
    return false;
  }
}

export function quoteVisitCustomerEmail(input: {
  name: string;
  serviceName?: string;
  dateLabel: string;
  timeLabel: string;
  locale?: Locale;
}) {
  const t = tFor(input.locale);
  return {
    subject: t('qvSubject', { date: input.dateLabel, time: input.timeLabel }),
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        <h2 style="color:#1D4ED8;">3U3 Cleaning</h2>
        <p>${t('hiComma', { name: esc(input.name) })}</p>
        <p>${t('qvIntro', { forService: input.serviceName ? t('qvForService', { service: esc(input.serviceName) }) : '' })}</p>
        <p style="font-size:18px;font-weight:bold;margin:16px 0;">
          ${input.dateLabel} &middot; ${input.timeLabel}
        </p>
        <p>${t('qvBody')}</p>
        <p style="color:#6b6b6b;font-size:13px;margin-top:24px;">${t('footerKaty')}</p>
      </div>
    `,
  };
}

/** Escapes user-supplied text before it goes into an email's HTML. */
export function esc(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function itemRows(items: { description: string; amountCents: number }[], totalCents: number, totalLabel = 'Total') {
  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${items
        .map(
          (item) => `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #eee;">${esc(item.description)}</td>
          <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;">${money(item.amountCents)}</td>
        </tr>`,
        )
        .join('')}
      <tr>
        <td style="padding:10px 0;font-weight:bold;">${totalLabel}</td>
        <td style="padding:10px 0;font-weight:bold;text-align:right;">${money(totalCents)}</td>
      </tr>
    </table>`;
}

// The estimate that comes out of a walkthrough. Approve / Decline are plain
// links to the same token URL (with ?respond=), not form buttons, because
// several email clients strip forms outright.
export function estimateEmail(input: {
  name: string;
  serviceName: string;
  totalCents: number;
  items: { description: string; amountCents: number }[];
  notes?: string;
  url: string;
  expiresAt: Date;
  locale?: Locale;
}) {
  const t = tFor(input.locale);
  const expires = input.locale === 'es' ? input.expiresAt.toLocaleDateString(intlLocale('es'), { month: 'long', day: 'numeric', year: 'numeric' }) : input.expiresAt.toLocaleDateString();
  return {
    subject: t('estSubject', { amount: money(input.totalCents) }),
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        <h2 style="color:#1D4ED8;">${t('estHeading')}</h2>
        <p>${t('estIntro', { name: esc(input.name), service: esc(input.serviceName) })}</p>
        ${itemRows(input.items, input.totalCents, t('total'))}
        ${input.notes ? `<p style="background:#EFF6FF;padding:12px;border-radius:8px;">${esc(input.notes)}</p>` : ''}
        <p style="text-align:center;margin:28px 0;">
          <a href="${input.url}?respond=approve" style="background:#2563EB;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">${t('estApprove')}</a>
        </p>
        <p style="text-align:center;margin:12px 0;">
          <a href="${input.url}?respond=decline" style="color:#6b6b6b;font-size:13px;">${t('estDecline')}</a>
        </p>
        <p style="color:#6b6b6b;font-size:13px;">${t('estFine', { date: expires })}</p>
        <p style="color:#6b6b6b;font-size:13px;margin-top:24px;">${t('footerKaty')}</p>
      </div>
    `,
  };
}

export function estimateRespondedOwnerEmail(input: {
  clientName: string;
  clientPhone?: string;
  serviceName: string;
  totalCents: number;
  items: { description: string; amountCents: number }[];
  approved: boolean;
}) {
  return {
    subject: input.approved
      ? `Estimate approved: ${esc(input.clientName)} — ${money(input.totalCents)}`
      : `Estimate declined: ${esc(input.clientName)}`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        <h2 style="color:#1D4ED8;">Estimate ${input.approved ? 'approved' : 'declined'}</h2>
        <p><strong>${esc(input.clientName)}</strong>${input.clientPhone ? ` (${esc(input.clientPhone)})` : ''} ${
          input.approved ? 'approved' : 'declined'
        } their ${esc(input.serviceName)} estimate of <strong>${money(input.totalCents)}</strong>.</p>
        ${itemRows(input.items, input.totalCents)}
        <p style="color:#6b6b6b;font-size:13px;">${
          input.approved
            ? "The agreed rate is now on file, so they can book their first clean themselves. Watch for it under Bookings."
            : 'See it in the admin dashboard under Estimates.'
        }</p>
      </div>
    `,
  };
}

export function invoiceEmail(input: {
  brand: EmailBrand;
  name: string;
  totalCents: number;
  items: { description: string; amountCents: number }[];
  payUrl: string;
  /** No card link yet: the button opens the invoice page, which says how to pay. */
  viewOnly?: boolean;
  locale?: Locale;
}) {
  const t = tFor(input.locale);
  return {
    subject: t('invSubject', { brand: input.brand.name, amount: money(input.totalCents) }),
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        ${brandHeader(input.brand, t('invHeading', { brand: input.brand.name }))}
        <p>${t('invIntro', { name: esc(input.name) })}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          ${input.items
            .map(
              (item) => `
            <tr>
              <td style="padding:6px 0;border-bottom:1px solid #eee;">${esc(item.description)}</td>
              <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;">${money(item.amountCents)}</td>
            </tr>`,
            )
            .join('')}
          <tr>
            <td style="padding:10px 0;font-weight:bold;">${t('total')}</td>
            <td style="padding:10px 0;font-weight:bold;text-align:right;">${money(input.totalCents)}</td>
          </tr>
        </table>
        <p style="text-align:center;margin:24px 0;">
          <a href="${input.payUrl}" style="background:${input.brand.primaryColor};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">${t(input.viewOnly ? 'invView' : 'invPay')}</a>
        </p>
        ${input.viewOnly ? `<p style="color:#555;font-size:14px;">${t('invHowToPay', { brand: esc(input.brand.name) })}</p>` : ''}
        ${brandFooter(input.brand)}
      </div>
    `,
  };
}

export function paymentReceivedCustomerEmail(input: { brand: EmailBrand; name: string; totalCents: number; receiptUrl?: string; locale?: Locale }) {
  const t = tFor(input.locale);
  return {
    subject: t('paidSubject'),
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        ${brandHeader(input.brand, t('paidHeading'))}
        <p>${t('paidBody', { name: esc(input.name), amount: money(input.totalCents) })}</p>
        ${
          input.receiptUrl
            ? `<p><a href="${input.receiptUrl}" style="color:${input.brand.bronzeColor};">${t('paidReceipt')}</a></p>`
            : ''
        }
        ${brandFooter(input.brand)}
      </div>
    `,
  };
}

export function paymentReceivedOwnerEmail(input: {
  brand: EmailBrand;
  clientName: string;
  totalCents: number;
  items: { description: string; amountCents: number }[];
}) {
  return {
    subject: `Payment received: ${esc(input.clientName)} — ${money(input.totalCents)}`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        ${brandHeader(input.brand, 'Payment received')}
        <p><strong>${esc(input.clientName)}</strong> just paid <strong>${money(input.totalCents)}</strong>.</p>
        <ul>
          ${input.items.map((i) => `<li>${esc(i.description)} — ${money(i.amountCents)}</li>`).join('')}
        </ul>
        <p style="color:#6b6b6b;font-size:13px;">See it in the admin dashboard under Invoices.</p>
      </div>
    `,
  };
}

export function newLeadOwnerEmail(input: {
  name: string;
  phone: string;
  email?: string;
  address: string;
  serviceName?: string;
  dateLabel: string;
  timeLabel: string;
  /** Post-construction / commercial answers (lib/intake.ts describeIntake). */
  details?: { label: string; value: string }[];
}) {
  return {
    subject: `New lead: ${esc(input.name)} — quote visit ${input.dateLabel}`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        <h2 style="color:#1D4ED8;">New quote-visit request</h2>
        <p><strong>${esc(input.name)}</strong> just booked a quote visit${
          input.serviceName ? ` (interested in ${esc(input.serviceName)})` : ''
        }.</p>
        <ul>
          <li>Phone: ${esc(input.phone)}</li>
          ${input.email ? `<li>Email: ${esc(input.email)}</li>` : ''}
          <li>Address: ${esc(input.address)}</li>
          <li>Visit: ${input.dateLabel} &middot; ${input.timeLabel}</li>
        </ul>
        ${
          input.details?.length
            ? `<p style="margin-bottom:4px;"><strong>About the project</strong></p><ul>${input.details.map((d) => `<li>${esc(d.label)}: ${esc(d.value)}</li>`).join('')}</ul>`
            : ''
        }
        <p style="color:#6b6b6b;font-size:13px;">See it in the admin dashboard under Leads.</p>
      </div>
    `,
  };
}

// ---------------------------------------------------------------------------
// Branded layout for the job-lifecycle emails: the 3U3 logo on its dark band
// (the logo is designed for dark backgrounds), then the message on white.
// ---------------------------------------------------------------------------
function branded(body: string, preheader = '', locale?: Locale) {
  return `
  <div style="background:#F7F8FA;padding:24px 12px;">
    <span style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</span>
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1F3B;">
      <div style="background:#0B1F3B;padding:20px;text-align:center;">
        <img src="${appUrl('/brand/logo-640.png')}" alt="3U3 Cleaning" width="180" style="width:180px;max-width:60%;height:auto;" />
      </div>
      <div style="padding:28px 28px 8px;font-size:16px;line-height:1.6;">${body}</div>
      <div style="padding:16px 28px 28px;color:#6B727E;font-size:13px;">${tFor(locale)('brandedFooter')}</div>
    </div>
  </div>`;
}

function button(href: string, label: string) {
  return `<p style="text-align:center;margin:28px 0;"><a href="${href}" style="background:#2563EB;color:#ffffff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block;">${esc(label)}</a></p>`;
}

export function jobCompleteCustomerEmail(input: {
  name: string;
  serviceName: string;
  dateLabel: string;
  rooms: number;
  photos: number;
  videos: number;
  galleryUrl: string;
  locale?: Locale;
}) {
  const t = tFor(input.locale);
  const media = [
    input.photos ? t(plural(input.photos, 'jcPhotoOne', 'jcPhotoMany') as 'jcPhotoOne', { count: input.photos }) : '',
    input.videos ? t(plural(input.videos, 'jcVideoOne', 'jcVideoMany') as 'jcVideoOne', { count: input.videos }) : '',
  ]
    .filter(Boolean)
    .join(t('and'));
  return {
    subject: t('jcSubject'),
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:22px;">${t('jcHeading', { name: esc(input.name.split(' ')[0]) })}</h2>
       <p>${t('jcBody', {
         service: esc(input.serviceName.toLowerCase()),
         date: esc(input.dateLabel),
         rooms: t(plural(input.rooms, 'jcRoomOne', 'jcRoomMany') as 'jcRoomOne', { count: input.rooms }),
         media: media ? t('jcWithMedia', { media }) : '',
       })}</p>
       ${button(input.galleryUrl, t('jcButton'))}
       <p style="color:#454C57;">${t('jcFoot')}</p>`,
      t('jcPreheader'),
      input.locale,
    ),
  };
}

/**
 * Sent to the owner whenever a client makes a change themselves from their
 * account — new address, changed frequency, self-service reschedule, or a
 * cancellation. One generic template so the owner has a single consistent
 * "a client just did something" alert, mirrored in the admin Alerts panel.
 */
export function clientAccountChangeOwnerEmail(input: {
  clientName: string;
  clientPhone?: string;
  summary: string;
  manageUrl: string;
}) {
  return {
    subject: `${input.clientName} updated their account`,
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">A client made a change</h2>
       <p><strong>${esc(input.clientName)}</strong>${input.clientPhone ? ` (${esc(input.clientPhone)})` : ''}</p>
       <p>${esc(input.summary)}</p>
       ${button(input.manageUrl, 'Open their account')}`,
    ),
  };
}

export function bookingRescheduledCustomerEmail(input: {
  name: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  previousLabel: string;
  accountUrl: string;
  locale?: Locale;
}) {
  const t = tFor(input.locale);
  return {
    subject: t('rsSubject', { date: input.dateLabel }),
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">${t('rsHeading')}</h2>
       <p>${t('rsIntro', { name: esc(input.name.split(' ')[0]), service: esc(input.serviceName.toLowerCase()) })}</p>
       <p style="font-size:18px;font-weight:bold;margin:16px 0;">${esc(input.dateLabel)} &middot; ${esc(input.timeLabel)}</p>
       <p style="color:#6B727E;">${t('rsPrevious', { when: esc(input.previousLabel) })}</p>
       ${button(input.accountUrl, t('viewBooking'))}
       <p style="color:#454C57;">${t('rsFoot')}</p>`,
      t('rsPreheader', { date: input.dateLabel, time: input.timeLabel }),
      input.locale,
    ),
  };
}

export function crewEnRouteCustomerEmail(input: { name: string; etaLabel: string | null; trackUrl: string; locale?: Locale }) {
  const t = tFor(input.locale);
  return {
    subject: input.etaLabel ? t('erSubjectEta', { eta: input.etaLabel }) : t('erSubject'),
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:22px;">${t('erHeading', { name: esc(input.name.split(' ')[0]) })}</h2>
       <p>${t('erBody', { eta: input.etaLabel ? t('erBodyEta', { eta: esc(input.etaLabel) }) : '' })}</p>
       ${button(input.trackUrl, t('erButton'))}
       <p style="color:#454C57;">${t('erFoot')}</p>`,
      `${t('erSubject')}.`,
      input.locale,
    ),
  };
}

/** The "crew on the way" text (lib/tracking.ts), when the company hasn't edited the wording. */
export function crewEnRouteText(input: { etaLabel: string | null; trackUrl: string; locale?: Locale }) {
  const t = tFor(input.locale);
  return t('erText', { eta: input.etaLabel ? t('erTextEta', { eta: input.etaLabel }) : '', url: input.trackUrl });
}

export function jobCompleteOwnerEmail(input: {
  clientName: string;
  serviceName: string;
  dateLabel: string;
  galleryUrl: string;
  invoiceUrl: string;
}) {
  return {
    subject: `Job complete: ${input.clientName} — invoice ready to review`,
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">Job complete</h2>
       <p><strong>${esc(input.clientName)}</strong> · ${esc(input.serviceName)} · ${esc(input.dateLabel)}</p>
       <p>The client has been sent their before-and-after photos. A draft invoice at their agreed rate is waiting for your review.</p>
       ${button(input.invoiceUrl, 'Review and send invoice')}
       <p style="text-align:center;"><a href="${input.galleryUrl}" style="color:#1D4ED8;">View the photos</a></p>`,
    ),
  };
}

export function bookingConfirmedCustomerEmail(input: {
  name: string;
  serviceName: string;
  whenLabel: string;
  addressLabel?: string;
  priceLabel?: string;
  accountUrl: string;
  locale?: Locale;
}) {
  const t = tFor(input.locale);
  return {
    subject: t('bcSubject', { service: input.serviceName, when: input.whenLabel }),
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:22px;">${t('bcHeading', { name: esc(input.name.split(' ')[0]) })}</h2>
       <p style="font-size:18px;font-weight:bold;margin:16px 0 4px;">${esc(input.whenLabel)}</p>
       <p style="margin:0;color:#454C57;">${esc(input.serviceName)}${input.priceLabel ? ` · ${esc(input.priceLabel)}` : ''}</p>
       ${input.addressLabel ? `<p style="margin:4px 0 0;color:#454C57;">${esc(input.addressLabel)}</p>` : ''}
       ${button(input.accountUrl, t('viewBooking'))}
       <p style="color:#454C57;">${t('bcFoot')}</p>`,
      t('bcPreheader', { when: input.whenLabel }),
      input.locale,
    ),
  };
}

export function newBookingOwnerEmail(input: {
  clientName: string;
  clientPhone?: string;
  serviceName: string;
  whenLabel: string;
  addressLabel?: string;
  priceLabel?: string;
  scheduleUrl: string;
}) {
  return {
    subject: `New booking: ${input.clientName} — ${input.whenLabel}`,
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">New cleaning booked</h2>
       <p><strong>${esc(input.clientName)}</strong>${input.clientPhone ? ` (${esc(input.clientPhone)})` : ''}</p>
       <p>${esc(input.serviceName)} · ${esc(input.whenLabel)}${input.priceLabel ? ` · ${esc(input.priceLabel)}` : ''}</p>
       ${input.addressLabel ? `<p>${esc(input.addressLabel)}</p>` : ''}
       ${button(input.scheduleUrl, 'Open the schedule')}`,
    ),
  };
}

/**
 * Sent the moment a new client record is created — lead capture or an
 * admin-added client — so they never have to ask the office for a
 * password. The link is good for 14 days (lib/passwordSetup.ts).
 */
export function passwordResetEmail(input: { name: string; url: string; signInWith: string[]; locale?: Locale }) {
  const t = tFor(input.locale);
  return {
    subject: t('prSubject'),
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">${t('hiComma', { name: esc(input.name.split(' ')[0]) })}</h2>
       <p>${t('prIntro', { ids: input.signInWith.map((v) => `<strong>${esc(v)}</strong>`).join(t('or')) })}</p>
       <p>${t('prChoose')}</p>
       ${button(input.url, t('prButton'))}
       <p style="color:#6B727E;font-size:13px;">${t('prFine')}</p>`,
      t('prPreheader'),
      input.locale,
    ),
  };
}

/** The password-reset text (lib/passwordReset.ts). */
export function passwordResetText(input: { url: string; signInWith: string[]; locale?: Locale }) {
  const t = tFor(input.locale);
  return t('prText', { ids: input.signInWith.join(t('or')), url: input.url });
}

export function passwordSetupEmail(input: { name: string; url: string; locale?: Locale }) {
  const t = tFor(input.locale);
  return {
    subject: t('psSubject'),
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">${t('psHeading', { name: esc(input.name.split(' ')[0]) })}</h2>
       <p>${t('psBody')}</p>
       ${button(input.url, t('psButton'))}
       <p style="color:#6B727E;font-size:13px;">${t('psFine')}</p>`,
      t('psPreheader'),
      input.locale,
    ),
  };
}

/**
 * 3-day / 36-hour heads-up before a booked cleaning (lib/reminders.ts).
 * `horizon`: English "3 days" / "36 hours" (after "in"); Spanish the whole
 * phrase, "en 3 días" / "mañana" (whenLabel(hours, 'es')).
 */
export function bookingReminderEmail(input: { name: string; serviceName: string; dateLabel: string; timeLabel: string; horizon: string; locale?: Locale }) {
  const t = tFor(input.locale);
  return {
    subject: t('brSubject', { horizon: input.horizon }),
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">${t('hiComma', { name: esc(input.name.split(' ')[0]) })}</h2>
       <p>${t('brIntro', { service: esc(input.serviceName), horizon: input.horizon })}</p>
       <p style="font-size:18px;font-weight:bold;margin:16px 0;">${esc(input.dateLabel)} &middot; ${esc(input.timeLabel)}</p>
       <p style="color:#6B727E;font-size:13px;">${t('brFine')}</p>`,
      t('brPreheader', { horizon: input.horizon }),
      input.locale,
    ),
  };
}

export function bookingReminderText(input: { serviceName: string; dateLabel: string; timeLabel: string; horizon: string; locale?: Locale }) {
  return tFor(input.locale)('brText', { service: input.serviceName, horizon: input.horizon, date: input.dateLabel, time: input.timeLabel });
}

/** Quote follow-up cadence: 24h, +3d, +2d, then weekly, until answered or opted out (lib/reminders.ts). */
export function estimateReminderEmail(input: { name: string; serviceName: string; totalCents: number; url: string; optOutUrl: string; locale?: Locale }) {
  const t = tFor(input.locale);
  return {
    subject: t('eqSubject', { amount: money(input.totalCents) }),
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">${t('hiComma', { name: esc(input.name.split(' ')[0]) })}</h2>
       <p>${t('eqIntro', { service: esc(input.serviceName) })}</p>
       <p style="font-size:20px;font-weight:bold;margin:16px 0;">${money(input.totalCents)}</p>
       ${button(input.url, t('eqButton'))}
       <p style="color:#6B727E;font-size:13px;">${t('eqOptOut', { link: `<a href="${input.optOutUrl}" style="color:#6B727E;">${t('eqOptOutLink')}</a>` })}</p>`,
      t('eqPreheader'),
      input.locale,
    ),
  };
}

export function estimateReminderText(input: { serviceName: string; totalCents: number; url: string; locale?: Locale }) {
  return tFor(input.locale)('eqText', { service: input.serviceName, amount: money(input.totalCents), url: input.url });
}

/** A standby slot opened up on the day a client asked to be held for (lib/standby.ts). */
export function standbyOfferEmail(input: { name: string; serviceName: string; dateLabel: string; timeLabel: string; url: string; expiresLabel: string; locale?: Locale }) {
  const t = tFor(input.locale);
  return {
    subject: t('sbSubject', { date: input.dateLabel }),
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">${t('sbHeading', { name: esc(input.name.split(' ')[0]) })}</h2>
       <p>${t('sbIntro', { service: esc(input.serviceName) })}</p>
       <p style="font-size:18px;font-weight:bold;margin:16px 0;">${esc(input.dateLabel)} &middot; ${esc(input.timeLabel)}</p>
       ${button(input.url, t('sbButton'))}
       <p style="color:#6B727E;font-size:13px;">${t('sbFine', { expires: esc(input.expiresLabel) })}</p>`,
      t('sbPreheader'),
      input.locale,
    ),
  };
}

export function standbyOfferText(input: { serviceName: string; dateLabel: string; timeLabel: string; url: string; locale?: Locale }) {
  return tFor(input.locale)('sbText', { service: input.serviceName, date: input.dateLabel, time: input.timeLabel, url: input.url });
}

/**
 * A plain branded message — used by the newer automations (reminders and
 * follow-ups, MFA codes, campaigns, team invites) whose wording a company
 * edits itself. Paragraph text is escaped; line breaks are kept.
 */
export function simpleEmail(input: {
  brandName: string;
  heading: string;
  body: string;
  cta?: { label: string; url: string };
  footer?: string;
}) {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;line-height:1.5;">${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const button = input.cta
    ? `<p style="margin:20px 0;"><a href="${esc(input.cta.url)}" style="background:#016AEE;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold;display:inline-block;">${esc(input.cta.label)}</a></p>`
    : '';
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#041730;max-width:520px;margin:0 auto;">
      <h2 style="color:#0157C4;margin:0 0 12px;">${esc(input.heading)}</h2>
      ${paragraphs}
      ${button}
      <p style="color:#5B7085;font-size:13px;margin-top:24px;">${esc(input.footer ?? `— ${input.brandName}`)}</p>
    </div>
  `;
}
