import { db } from '@/db/client';
import { tenants, users, serviceTypes, bookings, automationSettings, integrations, scheduleTemplates, kbArticles } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * The setup guide a new company sees after signup (app/start): each step
 * checks real data, so it ticks itself off as the work gets done, and any
 * step can be marked "I don't need this". Modelled on the steps cleaning
 * owners need to be running in an afternoon, not on any one competitor's.
 */
export type SetupStep = {
  key: string;
  title: string;
  why: string;
  href: string;
  cta: string;
  done: boolean;
  skipped: boolean;
};

export async function setupSteps(tenantId: string): Promise<SetupStep[]> {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant) return [];
  const [people, services, cleans, autos, integ, templates, articles, firstTenant] = await Promise.all([
    db.select({ role: users.role }).from(users).where(eq(users.tenantId, tenantId)),
    db.select({ id: serviceTypes.id }).from(serviceTypes).where(eq(serviceTypes.tenantId, tenantId)),
    db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.isQuoteVisit, false))).limit(1),
    db.select({ id: automationSettings.id }).from(automationSettings).where(eq(automationSettings.tenantId, tenantId)).limit(1),
    db.select({ id: integrations.id }).from(integrations).where(eq(integrations.tenantId, tenantId)).limit(1),
    db.select({ id: scheduleTemplates.id }).from(scheduleTemplates).where(eq(scheduleTemplates.tenantId, tenantId)).limit(1),
    db.select({ id: kbArticles.id }).from(kbArticles).where(eq(kbArticles.tenantId, tenantId)).limit(1),
    db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isPlatform, false)).orderBy(tenants.createdAt).limit(1),
  ]);
  const skipped = new Set(tenant.setupSkippedSteps.split(',').filter(Boolean));
  // The original company runs on the platform's own Stripe account.
  const paymentsReady = tenant.stripeConnectReady || (firstTenant[0]?.id === tenantId && !!process.env.STRIPE_SECRET_KEY);

  const steps: Omit<SetupStep, 'skipped'>[] = [
    { key: 'profile', title: 'Set up your company', why: 'Your name, logo and colours appear on quotes, invoices and the client portal.', href: '/admin/settings', cta: 'Company settings', done: !!(tenant.logoUrl || tenant.tagline) },
    { key: 'services', title: 'Check your services', why: 'Each service has its own checklist and default length. Pre-filled from your answers at signup.', href: '/admin/services', cta: 'Review services', done: services.length > 0 && skipped.has('services-reviewed') },
    { key: 'quoting', title: 'Choose how you quote', why: 'By rooms, square footage, the hour or a walkthrough, plus clutter, pets and repeat-visit discounts. Estimates then work out the price for you.', href: '/admin/settings/quoting', cta: 'Set up quoting', done: !!tenant.quotingJson },
    { key: 'team', title: 'Invite your team', why: 'Cleaners get their own portal with their jobs, pay and next payout.', href: '/admin/team', cta: 'Add people', done: people.some((p) => p.role === 'CLEANER') },
    { key: 'clients', title: 'Add your clients', why: 'Add them one by one, or import a spreadsheet you already keep.', href: '/admin/clients', cta: 'Add clients', done: people.some((p) => p.role === 'CUSTOMER') },
    { key: 'templates', title: 'Pick schedule templates', why: 'A template holds a clean’s length, arrival window and repeat pattern, so booking takes three taps.', href: '/admin/templates', cta: 'Open templates', done: templates.length > 0 },
    { key: 'schedule', title: 'Schedule your first clean', why: 'One-time or recurring. Visits in a series can be moved without breaking the rest.', href: '/admin/series/new', cta: 'Schedule a clean', done: cleans.length > 0 },
    { key: 'payments', title: 'Get paid online', why: 'Clients pay from their invoice or portal, with tips that go straight to the crew.', href: '/admin/settings#payments', cta: 'Connect payments', done: paymentsReady },
    { key: 'automations', title: 'Choose reminders and follow-ups', why: 'Turn each one on or off and edit the wording. Nothing to code.', href: '/admin/automations', cta: 'Open settings', done: autos.length > 0 },
    { key: 'tex', title: 'Teach Tex about your company', why: 'Tex answers client questions in the portal, by text and by phone, from your help articles.', href: '/admin/help', cta: 'Open help articles', done: articles.length > 0 || !!tenant.smsNumber },
    { key: 'booking', title: 'Share your booking link', why: 'Put it on your website, Google profile and social pages.', href: '/admin/settings#booking-link', cta: 'Get the link', done: skipped.has('booking-shared') },
    { key: 'integrations', title: 'Connect your accounting', why: 'Paid invoices go to QuickBooks Online on their own, without duplicates.', href: '/admin/integrations', cta: 'Connect QuickBooks', done: integ.length > 0 },
  ];
  // What the owner said they want help with first (signup question 5)
  // comes straight after the basics.
  const FOCUS: Record<string, string[]> = {
    SCHEDULING: ['templates', 'schedule'],
    PAYMENTS: ['payments', 'automations'],
    GROWTH: ['booking', 'tex'],
    TEAM: ['team'],
  };
  let focus: string | undefined;
  try {
    focus = tenant.intakeJson ? JSON.parse(tenant.intakeJson).focus : undefined;
  } catch {
    focus = undefined;
  }
  const first = FOCUS[focus ?? ''] ?? [];
  const rank = (key: string) => (key === 'profile' ? 0 : key === 'services' ? 1 : key === 'quoting' ? 2 : first.includes(key) ? 3 + first.indexOf(key) : 10);
  const ordered = steps.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.key) - rank(b.s.key) || a.i - b.i).map((x) => x.s);
  return ordered.map((s) => ({ ...s, skipped: skipped.has(s.key) }));
}

export async function setupProgress(tenantId: string) {
  const steps = await setupSteps(tenantId);
  const done = steps.filter((s) => s.done || s.skipped).length;
  return { total: steps.length, done, remaining: steps.length - done };
}

export async function skipSetupStep(tenantId: string, key: string, skip = true) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant) return;
  const set = new Set(tenant.setupSkippedSteps.split(',').filter(Boolean));
  if (skip) set.add(key);
  else set.delete(key);
  await db.update(tenants).set({ setupSkippedSteps: Array.from(set).join(',') }).where(eq(tenants.id, tenantId));
}
