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
      <div style="font-family:sans-serif;color:#1A1A1A;max-width:480px;margin:0 auto;">
        <h2 style="color:#8A6D1D;">3U3 Cleaning</h2>
        <p>Hi ${input.name},</p>
        <p>Thanks for reaching out! Your free quote visit is confirmed${
          input.serviceName ? ` for <strong>${input.serviceName}</strong>` : ''
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

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
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
      <div style="font-family:sans-serif;color:#1A1A1A;max-width:480px;margin:0 auto;">
        <h2 style="color:#8A6D1D;">3U3 Cleaning — Invoice</h2>
        <p>Hi ${input.name}, thanks for having us out! Here's your invoice:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          ${input.items
            .map(
              (item) => `
            <tr>
              <td style="padding:6px 0;border-bottom:1px solid #eee;">${item.description}</td>
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
          <a href="${input.payUrl}" style="background:#D2961E;color:#1A1A1A;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Pay now</a>
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
      <div style="font-family:sans-serif;color:#1A1A1A;max-width:480px;margin:0 auto;">
        <h2 style="color:#8A6D1D;">Payment received</h2>
        <p>Hi ${input.name}, we've received your payment of <strong>${money(input.totalCents)}</strong>. Thank you!</p>
        ${
          input.receiptUrl
            ? `<p><a href="${input.receiptUrl}" style="color:#8A6D1D;">View your receipt</a></p>`
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
    subject: `Payment received: ${input.clientName} — ${money(input.totalCents)}`,
    html: `
      <div style="font-family:sans-serif;color:#1A1A1A;max-width:480px;margin:0 auto;">
        <h2 style="color:#8A6D1D;">Payment received</h2>
        <p><strong>${input.clientName}</strong> just paid <strong>${money(input.totalCents)}</strong>.</p>
        <ul>
          ${input.items.map((i) => `<li>${i.description} — ${money(i.amountCents)}</li>`).join('')}
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
    subject: `New lead: ${input.name} — quote visit ${input.dateLabel}`,
    html: `
      <div style="font-family:sans-serif;color:#1A1A1A;max-width:480px;margin:0 auto;">
        <h2 style="color:#8A6D1D;">New quote-visit request</h2>
        <p><strong>${input.name}</strong> just booked a quote visit${
          input.serviceName ? ` (interested in ${input.serviceName})` : ''
        }.</p>
        <ul>
          <li>Phone: ${input.phone}</li>
          ${input.email ? `<li>Email: ${input.email}</li>` : ''}
          <li>Address: ${input.address}</li>
          <li>Visit: ${input.dateLabel} &middot; ${input.timeLabel}</li>
        </ul>
        <p style="color:#6b6b6b;font-size:13px;">See it in the admin dashboard under Leads.</p>
      </div>
    `,
  };
}
