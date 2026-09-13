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
