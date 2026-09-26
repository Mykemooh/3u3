import { appUrl } from '@/lib/url';

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
  name: string;
  totalCents: number;
  items: { description: string; amountCents: number }[];
  payUrl: string;
}) {
  return {
    subject: `Your invoice from 3U3 Cleaning — ${money(input.totalCents)}`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        <h2 style="color:#1D4ED8;">3U3 Cleaning — Invoice</h2>
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
          <a href="${input.payUrl}" style="background:#2563EB;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Pay now</a>
        </p>
        <p style="color:#6b6b6b;font-size:13px;">— 3U3 Cleaning, Katy, TX</p>
      </div>
    `,
  };
}

export function paymentReceivedCustomerEmail(input: { name: string; totalCents: number; receiptUrl?: string }) {
  return {
    subject: `Payment received — thank you!`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        <h2 style="color:#1D4ED8;">Payment received</h2>
        <p>Hi ${esc(input.name)}, we've received your payment of <strong>${money(input.totalCents)}</strong>. Thank you!</p>
        ${
          input.receiptUrl
            ? `<p><a href="${input.receiptUrl}" style="color:#1D4ED8;">View your receipt</a></p>`
            : ''
        }
        <p style="color:#6b6b6b;font-size:13px;margin-top:24px;">— 3U3 Cleaning, Katy, TX</p>
      </div>
    `,
  };
}

export function paymentReceivedOwnerEmail(input: {
  clientName: string;
  totalCents: number;
  items: { description: string; amountCents: number }[];
}) {
  return {
    subject: `Payment received: ${esc(input.clientName)} — ${money(input.totalCents)}`,
    html: `
      <div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
        <h2 style="color:#1D4ED8;">Payment received</h2>
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
