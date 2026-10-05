import { appUrl } from '@/lib/url';

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
}) {
  return {
    subject: `You're booked — ${input.dateLabel} at ${input.timeLabel}`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        <h2 style="color:#1D4ED8;">3U3 Cleaning</h2>
        <p>Hi ${esc(input.name)},</p>
        <p>Thanks for reaching out! Your free quote visit is confirmed${
          input.serviceName ? ` for <strong>${esc(input.serviceName)}</strong>` : ''
        }:</p>
        <p style="font-size:18px;font-weight:bold;margin:16px 0;">
          ${input.dateLabel} &middot; ${input.timeLabel}
        </p>
        <p>A team member will meet you at your home to take a look and give you an exact price on the spot — no obligation.</p>
        <p style="color:#6b6b6b;font-size:13px;margin-top:24px;">— 3U3 Cleaning, Katy, TX</p>
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

function itemRows(items: { description: string; amountCents: number }[], totalCents: number) {
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
        <td style="padding:10px 0;font-weight:bold;">Total</td>
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
}) {
  return {
    subject: `Your estimate from 3U3 Cleaning — ${money(input.totalCents)}`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        <h2 style="color:#1D4ED8;">3U3 Cleaning — Your estimate</h2>
        <p>Hi ${esc(input.name)}, thanks for having us out to take a look. Here's your price for <strong>${esc(input.serviceName)}</strong>:</p>
        ${itemRows(input.items, input.totalCents)}
        ${input.notes ? `<p style="background:#EFF6FF;padding:12px;border-radius:8px;">${esc(input.notes)}</p>` : ''}
        <p style="text-align:center;margin:28px 0;">
          <a href="${input.url}?respond=approve" style="background:#2563EB;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Approve estimate</a>
        </p>
        <p style="text-align:center;margin:12px 0;">
          <a href="${input.url}?respond=decline" style="color:#6b6b6b;font-size:13px;">No thanks</a>
        </p>
        <p style="color:#6b6b6b;font-size:13px;">Approve and you'll be able to pick your first cleaning time right away. This estimate is good through ${input.expiresAt.toLocaleDateString()}.</p>
        <p style="color:#6b6b6b;font-size:13px;margin-top:24px;">— 3U3 Cleaning, Katy, TX</p>
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
}) {
  return {
    subject: `Your invoice from ${input.brand.name} — ${money(input.totalCents)}`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        ${brandHeader(input.brand, `${input.brand.name} — Invoice`)}
        <p>Hi ${esc(input.name)}, thanks for having us out! Here's your invoice:</p>
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
            <td style="padding:10px 0;font-weight:bold;">Total</td>
            <td style="padding:10px 0;font-weight:bold;text-align:right;">${money(input.totalCents)}</td>
          </tr>
        </table>
        <p style="text-align:center;margin:24px 0;">
          <a href="${input.payUrl}" style="background:${input.brand.primaryColor};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Pay now</a>
        </p>
        ${brandFooter(input.brand)}
      </div>
    `,
  };
}

export function paymentReceivedCustomerEmail(input: { brand: EmailBrand; name: string; totalCents: number; receiptUrl?: string }) {
  return {
    subject: `Payment received — thank you!`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        ${brandHeader(input.brand, 'Payment received')}
        <p>Hi ${esc(input.name)}, we've received your payment of <strong>${money(input.totalCents)}</strong>. Thank you!</p>
        ${
          input.receiptUrl
            ? `<p><a href="${input.receiptUrl}" style="color:${input.brand.bronzeColor};">View your receipt</a></p>`
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
function branded(body: string, preheader = '') {
  return `
  <div style="background:#F7F8FA;padding:24px 12px;">
    <span style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</span>
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1F3B;">
      <div style="background:#0B1F3B;padding:20px;text-align:center;">
        <img src="${appUrl('/brand/logo-640.png')}" alt="3U3 Cleaning" width="180" style="width:180px;max-width:60%;height:auto;" />
      </div>
      <div style="padding:28px 28px 8px;font-size:16px;line-height:1.6;">${body}</div>
      <div style="padding:16px 28px 28px;color:#6B727E;font-size:13px;">3U3 Cleaning · Family owned · Katy, TX</div>
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
}) {
  const media = [
    input.photos ? `${input.photos} photo${input.photos === 1 ? '' : 's'}` : '',
    input.videos ? `${input.videos} video${input.videos === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' and ');
  return {
    subject: 'Your home is clean — see the before and after',
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:22px;">All done, ${esc(input.name.split(' ')[0])}!</h2>
       <p>Your ${esc(input.serviceName.toLowerCase())} on ${esc(input.dateLabel)} is finished. The crew documented ${input.rooms} room${
         input.rooms === 1 ? '' : 's'
       }${media ? ` with ${media}` : ''}, so you can see exactly what was done.</p>
       ${button(input.galleryUrl, 'See your before and after')}
       <p style="color:#454C57;">Your invoice will follow shortly by email. Anything not quite right? Just reply to this email and we'll make it right.</p>`,
      'Your before-and-after photos are ready.',
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
}) {
  return {
    subject: `Your cleaning has moved to ${input.dateLabel}`,
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">A change to your cleaning</h2>
       <p>Hi ${esc(input.name.split(' ')[0])}, your ${esc(input.serviceName.toLowerCase())} has a new time:</p>
       <p style="font-size:18px;font-weight:bold;margin:16px 0;">${esc(input.dateLabel)} &middot; ${esc(input.timeLabel)}</p>
       <p style="color:#6B727E;">Previously: ${esc(input.previousLabel)}</p>
       ${button(input.accountUrl, 'View your booking')}
       <p style="color:#454C57;">If the new time doesn't work for you, just reply to this email and we'll sort it out.</p>`,
      `Your cleaning is now ${input.dateLabel}, ${input.timeLabel}.`,
    ),
  };
}

export function crewEnRouteCustomerEmail(input: { name: string; etaLabel: string | null; trackUrl: string }) {
  return {
    subject: input.etaLabel ? `Your crew is on the way — arriving around ${input.etaLabel}` : 'Your crew is on the way',
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:22px;">On our way, ${esc(input.name.split(' ')[0])}!</h2>
       <p>Your 3U3 crew has just set off for your home${
         input.etaLabel ? ` and should arrive around <strong>${esc(input.etaLabel)}</strong>` : ''
       }. You can follow them on the map until they pull up.</p>
       ${button(input.trackUrl, 'Track your crew')}
       <p style="color:#454C57;">Need to tell them something before they arrive? Just reply to this email.</p>`,
      'Your crew is on the way.',
    ),
  };
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
}) {
  return {
    subject: `Booked: ${input.serviceName} — ${input.whenLabel}`,
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:22px;">You're booked, ${esc(input.name.split(' ')[0])}</h2>
       <p style="font-size:18px;font-weight:bold;margin:16px 0 4px;">${esc(input.whenLabel)}</p>
       <p style="margin:0;color:#454C57;">${esc(input.serviceName)}${input.priceLabel ? ` · ${esc(input.priceLabel)}` : ''}</p>
       ${input.addressLabel ? `<p style="margin:4px 0 0;color:#454C57;">${esc(input.addressLabel)}</p>` : ''}
       ${button(input.accountUrl, 'View your booking')}
       <p style="color:#454C57;">Our crew of three will arrive at the start of your window. When they finish, you'll get before-and-after photos of every room.</p>`,
      `See you ${input.whenLabel}.`,
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
export function passwordResetEmail(input: { name: string; url: string; signInWith: string[] }) {
  return {
    subject: 'Reset your 3U3 Cleaning password',
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">Hi ${esc(input.name.split(' ')[0])},</h2>
       <p>We got a request to help you sign in. You can sign in with ${input.signInWith
         .map((v) => `<strong>${esc(v)}</strong>`)
         .join(' or ')}.</p>
       <p>To choose a new password, use the button below.</p>
       ${button(input.url, 'Choose a new password')}
       <p style="color:#6B727E;font-size:13px;">This link works once, for 1 hour. If you didn't ask for this, ignore this email — your password hasn't changed.</p>`,
      'Your sign-in details and a link to reset your password.',
    ),
  };
}

export function passwordSetupEmail(input: { name: string; url: string }) {
  return {
    subject: 'Set up your 3U3 Cleaning account',
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">Welcome, ${esc(input.name.split(' ')[0])}</h2>
       <p>Create a password so you can sign in anytime to see your booking, before-and-after photos, and invoices.</p>
       ${button(input.url, 'Create your password')}
       <p style="color:#6B727E;font-size:13px;">This link is good for 14 days. If you didn't expect this email, you can ignore it.</p>`,
      'Set a password to access your account.',
    ),
  };
}

/** 3-day / 36-hour heads-up before a booked cleaning (lib/reminders.ts). */
export function bookingReminderEmail(input: { name: string; serviceName: string; dateLabel: string; timeLabel: string; horizon: string }) {
  return {
    subject: `Reminder: your cleaning is in ${input.horizon}`,
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">Hi ${esc(input.name.split(' ')[0])},</h2>
       <p>Just a heads-up — your <strong>${esc(input.serviceName)}</strong> is coming up in ${input.horizon}:</p>
       <p style="font-size:18px;font-weight:bold;margin:16px 0;">${esc(input.dateLabel)} &middot; ${esc(input.timeLabel)}</p>
       <p style="color:#6B727E;font-size:13px;">Need to reschedule or cancel? You can do that from My Account up to 24 hours before — after that, just give us a call.</p>`,
      `Your cleaning is in ${input.horizon}.`,
    ),
  };
}

export function bookingReminderText(input: { serviceName: string; dateLabel: string; timeLabel: string; horizon: string }) {
  return `3U3 Cleaning: your ${input.serviceName} is in ${input.horizon} — ${input.dateLabel} at ${input.timeLabel}.`;
}

/** Quote follow-up cadence: 24h, +3d, +2d, then weekly, until answered or opted out (lib/reminders.ts). */
export function estimateReminderEmail(input: { name: string; serviceName: string; totalCents: number; url: string; optOutUrl: string }) {
  return {
    subject: `Still thinking it over? Your 3U3 Cleaning estimate — ${money(input.totalCents)}`,
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">Hi ${esc(input.name.split(' ')[0])},</h2>
       <p>Just checking in — your estimate for <strong>${esc(input.serviceName)}</strong> is still waiting on you:</p>
       <p style="font-size:20px;font-weight:bold;margin:16px 0;">${money(input.totalCents)}</p>
       ${button(input.url, 'View and approve')}
       <p style="color:#6B727E;font-size:13px;">Not interested? <a href="${input.optOutUrl}" style="color:#6B727E;">Stop these reminders</a>.</p>`,
      'Your estimate is still waiting.',
    ),
  };
}

export function estimateReminderText(input: { serviceName: string; totalCents: number; url: string }) {
  return `3U3 Cleaning: your ${input.serviceName} estimate (${money(input.totalCents)}) is still open — ${input.url}`;
}

/** A standby slot opened up on the day a client asked to be held for (lib/standby.ts). */
export function standbyOfferEmail(input: { name: string; serviceName: string; dateLabel: string; timeLabel: string; url: string; expiresLabel: string }) {
  return {
    subject: `A spot opened up — ${input.dateLabel}`,
    html: branded(
      `<h2 style="margin:0 0 12px;font-size:20px;">Good news, ${esc(input.name.split(' ')[0])}!</h2>
       <p>A spot just opened up for <strong>${esc(input.serviceName)}</strong> on the day you asked to be held for:</p>
       <p style="font-size:18px;font-weight:bold;margin:16px 0;">${esc(input.dateLabel)} &middot; ${esc(input.timeLabel)}</p>
       ${button(input.url, 'Claim this spot')}
       <p style="color:#6B727E;font-size:13px;">First come, first served — this hold expires ${esc(input.expiresLabel)}. If you don't claim it in time, we'll offer it to the next person waiting.</p>`,
      'A spot opened up on the day you wanted.',
    ),
  };
}

export function standbyOfferText(input: { serviceName: string; dateLabel: string; timeLabel: string; url: string }) {
  return `3U3 Cleaning: a spot opened up for ${input.serviceName} on ${input.dateLabel} at ${input.timeLabel} — claim it: ${input.url}`;
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
