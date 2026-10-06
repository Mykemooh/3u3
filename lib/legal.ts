import type { LegalSection } from '@/components/LegalPage';

/**
 * TRASHCAN's Terms and Privacy Policy, in plain language and matched to
 * what the software actually does (what it stores, who processes it, how
 * long photos are kept). Have a lawyer review both before relying on
 * them; edit here and the pages update.
 */

export const LEGAL_UPDATED = 'October 6, 2026';
export const contactLine = () =>
  process.env.PLATFORM_CONTACT_EMAIL
    ? `Email ${process.env.PLATFORM_CONTACT_EMAIL}, or use Help inside your account.`
    : 'Use Help inside your account, or reply to any email we send you.';

export const TERMS: LegalSection[] = [
  {
    heading: 'Who these terms are between',
    body: [
      'TRASHCAN is software for running a cleaning company: quotes, scheduling, crews, payments, messaging and an AI receptionist called Tex. These terms are between TRASHCAN and the business that signs up (“you” or “the Company”). The people the Company invites — office staff, cleaners and clients — use TRASHCAN through the Company’s account.',
    ],
  },
  {
    heading: 'Your account',
    body: [
      'You must be at least 18 and able to agree to these terms for your business. Keep your sign-in secure. Owners and office staff must use multi-factor authentication. You are responsible for what happens under your account and for who you give access to.',
    ],
  },
  {
    heading: 'Trial, plans and billing',
    body: [
      'Every company starts on the Free plan, with no card and no time limit. On the Free plan, a platform fee of 1% applies to card payments your clients make through TRASHCAN. The Crew plan ($49 a month) lowers that fee to 0.5% and the Team plan ($129 a month) removes it; both include a monthly allowance of texts and Tex phone minutes. Current prices are always on the pricing page, and we will tell account owners by email before a price that affects you changes.',
      'Your company is the merchant for its own clients’ payments. Payments are processed by Stripe through your company’s own connected Stripe account; Stripe’s processing fees, refunds and disputes on those payments are your company’s, under Stripe’s terms. The platform fee is collected by Stripe as part of each payment.',
      'Paid plans renew monthly until you change plan or cancel. If a subscription payment fails and Stripe’s retries are exhausted, your company moves to the Free plan. Nothing is locked or deleted.',
      'Texts, Tex phone minutes and your business phone number are paid for with prepaid credits you add by card. When credits run out, texting and Tex phone calls pause until you add more; email, the app and Tex web chat keep working. The one-time texting setup fee covers your business number and carrier registration. Credits are not refundable except when you close your account.',
    ],
  },
  {
    heading: 'Your data',
    body: [
      'Your company’s data — clients, homes, schedules, photos, invoices, messages — belongs to you. We use it only to run TRASHCAN for you, keep it secure, and support you when you ask. You can export clients, invoices, cleans, payroll, expenses and room times as spreadsheets at any time from Reports.',
      'You decide what you collect from your clients and staff, and you are responsible for having the right to collect it, including consent to text people (US carriers require registration and opt-in for business texting).',
    ],
  },
  {
    heading: 'Running your business',
    body: [
      'TRASHCAN helps with pricing, pay and taxes but does not make those decisions for you. You set your prices, decide how your crew is paid, and are responsible for employment law, payroll taxes (including on tips, which are taxable wages in the US), sales tax, licenses and insurance.',
      'Pricing guides shown inside the quote editor are general published ranges, not advice for your market.',
    ],
  },
  {
    heading: 'Tex, the AI receptionist',
    body: [
      'Tex answers clients by text, phone and chat using your help articles and FAQs. It can be wrong. It is set up not to quote prices or make commitments and to hand off to your team when it should, but you remain responsible for what your business tells clients. You can turn Tex off for texts and calls in Settings.',
    ],
  },
  {
    heading: 'Acceptable use',
    body: [
      'Don’t use TRASHCAN to send spam or messages people haven’t agreed to, to store data you have no right to hold, to break the law, to probe or overload the service, or to access another company’s data.',
      'We may suspend an account that puts other customers, carriers or the service at risk, and we will tell you why.',
    ],
  },
  {
    heading: 'Availability and changes',
    body: [
      'We work to keep TRASHCAN running and show its health at /status, but it is provided without a guaranteed uptime. Features change as the product improves; if we remove something you rely on, we will give notice where we reasonably can.',
    ],
  },
  {
    heading: 'Cancelling',
    body: [
      'You can cancel any time; access continues to the end of the period you paid for. Export your data before you go. A closed account’s data is kept so you can come back; ask us and we will delete it, except what we must keep by law (for example payment records).',
    ],
  },
  {
    heading: 'Liability',
    body: [
      'TRASHCAN is provided “as is”. To the extent the law allows, we are not liable for indirect or consequential losses (such as lost profits or lost bookings), and our total liability for any claim is limited to what you paid us in the 12 months before it.',
    ],
  },
  {
    heading: 'Law, changes to these terms, and contact',
    body: [
      'These terms are governed by the laws of Texas, USA. If we change them in a way that matters, we will tell account owners by email before the change takes effect.',
      contactLine(),
    ],
  },
];

export const PRIVACY: LegalSection[] = [
  {
    heading: 'Who is responsible for your information',
    body: [
      'If you are a client or employee of a cleaning company that uses TRASHCAN, that company decides what is collected about you and why; TRASHCAN stores and processes it on the company’s behalf. Questions about your cleaning — or requests to see or delete your information — go to that company first; we will help them answer.',
      'For company owners who sign up, TRASHCAN is responsible for your account information.',
    ],
  },
  {
    heading: 'What is collected',
    body: [
      [
        'Account details: name, email, phone, and a password stored only as a one-way hash. Multi-factor secrets are encrypted; backup and email codes are stored only as hashes.',
        'Home and job details: addresses, home notes, room counts, and entry codes (encrypted), the cleaning checklist, before-and-after photos and videos, room times, and the GPS position where the crew started and finished each clean (proof of the visit).',
        'Live location while a crew is driving to a home, so the client can see them coming. Positions are kept only for that trip.',
        'Billing: invoices and payment status. Card numbers are collected by Stripe and never touch TRASHCAN; we keep only the card brand, last four digits and expiry.',
        'Messages: texts with the company, conversations with Tex, reviews and room ratings.',
        'Usage and security records: sign-ins, a change history of who edited what, and basic server logs.',
      ],
    ],
  },
  {
    heading: 'How it is used',
    body: [
      'To run the cleaning business: quoting, scheduling, sending reminders and photos, getting crews paid and clients billed, answering questions (including through Tex), and keeping accounts secure. We do not sell personal information and do not use it for advertising.',
    ],
  },
  {
    heading: 'Who processes it for us',
    body: [
      'TRASHCAN uses these service providers, each only for its part of the work:',
      [
        'Vercel (hosting) and a managed Postgres database (Neon)',
        'Stripe (payments and subscriptions)',
        'Resend (email)',
        'Twilio (texts and phone calls)',
        'Mapbox (maps, directions and arrival times)',
        'Cloudflare R2 or Vercel Blob (photo and video storage)',
        'Google (only if you choose “Continue with Google”)',
        'Anthropic (to write Tex’s answers from the company’s help articles)',
        'Intuit QuickBooks (only if the company connects it)',
      ],
    ],
  },
  {
    heading: 'How long it is kept',
    body: [
      'Before-and-after photos are kept for 6 months and videos for 30 days by default. Other records are kept while the company’s account exists; when a company asks us to delete its account, we delete its records except where the law requires us to keep them (for example payment and tax records).',
    ],
  },
  {
    heading: 'Your choices',
    body: [
      [
        'Unsubscribe from news and offers with the link in any marketing email. Reminders and invoices still come.',
        'Reply STOP to any text to stop texts from that company; START turns them back on.',
        'Choose email, text or WhatsApp for your reminders in your account settings.',
        'Ask the company (or us, if you own an account) to see, correct or delete your information.',
      ],
    ],
  },
  {
    heading: 'Security',
    body: [
      'Multi-factor sign-in for owners and office staff, encryption in transit everywhere and at rest for sensitive fields, signed webhooks, and every company’s data kept separate from every other company’s. No system is perfectly secure; if a breach affects you, we will tell the affected company and help them notify you as the law requires.',
    ],
  },
  {
    heading: 'Children',
    body: ['TRASHCAN is for businesses and adults. It is not directed to children under 13, and we do not knowingly collect their information.'],
  },
  {
    heading: 'Changes and contact',
    body: ['If this policy changes in a way that matters, we will tell account owners by email before it takes effect.', contactLine()],
  },
];
