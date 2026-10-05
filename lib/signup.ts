import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/db/client';
import { signupRequests, tenants, users, serviceTypes } from '@/db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { provisionTenant, slugify, ProvisioningError } from '@/lib/tenantProvisioning';
import { sendEmail, simpleEmail, emailConfigured } from '@/lib/email';
import { appUrl } from '@/lib/url';

/**
 * TrashCan self-serve signup (/start). A six-digit code emailed to the
 * owner proves the address before anything is created; then six short
 * questions shape the new company — which service lines it offers, how
 * big the team is, how it prices, and what the setup guide should put
 * first. While the platform owner keeps signup closed (Platform →
 * Signups), /start collects a waitlist instead.
 */

export class SignupError extends Error {
  status = 400;
}

export const SIGNUP_QUESTIONS = {
  services: {
    label: 'What kind of cleaning do you do?',
    options: [
      ['RESIDENTIAL', 'Homes on a regular schedule'],
      ['DEEP_MOVE', 'Deep cleans and move-in/out'],
      ['RENTALS', 'Short-term rental turnovers'],
      ['POST_CONSTRUCTION', 'Post-construction'],
      ['COMMERCIAL', 'Offices and commercial'],
    ],
  },
  teamSize: {
    label: 'How many people clean, including you?',
    options: [
      ['SOLO', 'Just me'],
      ['SMALL', '2–5'],
      ['MEDIUM', '6–15'],
      ['LARGE', '16 or more'],
    ],
  },
  pricing: {
    label: 'How do you price a job today?',
    options: [
      ['WALKTHROUGH', 'I see it first, then quote'],
      ['FLAT_BY_SIZE', 'Flat price by size or rooms'],
      ['HOURLY', 'By the hour'],
      ['NOT_SURE', 'Still figuring it out'],
    ],
  },
  focus: {
    label: 'What do you want help with first?',
    options: [
      ['SCHEDULING', 'Scheduling and the calendar'],
      ['PAYMENTS', 'Getting paid on time'],
      ['GROWTH', 'Getting more clients'],
      ['TEAM', 'Running my team and payroll'],
    ],
  },
  heardFrom: {
    label: 'How did you hear about TrashCan?',
    options: [
      ['FRIEND', 'Another cleaning business'],
      ['SEARCH', 'Search'],
      ['SOCIAL', 'Social media'],
      ['OTHER', 'Somewhere else'],
    ],
  },
} as const;

const keysOf = <K extends keyof typeof SIGNUP_QUESTIONS>(k: K) =>
  SIGNUP_QUESTIONS[k].options.map((o) => o[0]) as unknown as [string, ...string[]];

export const answersSchema = z.object({
  services: z.array(z.enum(keysOf('services'))).min(1),
  teamSize: z.enum(keysOf('teamSize')),
  serviceArea: z.string().trim().min(2).max(80),
  pricing: z.enum(keysOf('pricing')),
  focus: z.enum(keysOf('focus')),
  heardFrom: z.enum(keysOf('heardFrom')).optional(),
});
export type SignupAnswers = z.infer<typeof answersSchema>;

const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;

function hashCode(email: string, code: string) {
  const secret = process.env.NEXTAUTH_SECRET || 'dev-secret';
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}
const normEmail = (e: string) => e.trim().toLowerCase();

async function platformTenant() {
  return (await db.select().from(tenants).where(eq(tenants.isPlatform, true)).limit(1))[0];
}

export async function signupIsOpen() {
  return !!(await platformTenant())?.signupOpen;
}

export async function setSignupOpen(open: boolean) {
  const p = await platformTenant();
  if (!p) throw new SignupError('No platform set up.');
  await db.update(tenants).set({ signupOpen: open }).where(eq(tenants.id, p.id));
}

async function recentCount(where: ReturnType<typeof and>) {
  const r = await db.select({ n: sql<number>`count(*)` }).from(signupRequests).where(where);
  return Number(r[0]?.n ?? 0);
}

/** Step 1: email a code. Returns the code itself only outside production when email isn't set up (local testing). */
export async function startSignup(emailInput: string, ip: string | null) {
  if (!(await signupIsOpen())) throw new SignupError('Signup isn’t open yet — join the waitlist instead.');
  const email = normEmail(emailInput);
  if (!z.string().email().safeParse(email).success) throw new SignupError('Enter a valid email address.');
  const taken = (await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1))[0];
  if (taken) throw new SignupError('That email already has an account — sign in instead.');
  const hourAgo = new Date(Date.now() - 3600_000);
  if ((await recentCount(and(eq(signupRequests.email, email), gte(signupRequests.createdAt, hourAgo)))) >= 3) {
    throw new SignupError('Too many codes for this email — try again in an hour.');
  }
  if (ip && (await recentCount(and(eq(signupRequests.ip, ip), gte(signupRequests.createdAt, hourAgo)))) >= 10) {
    throw new SignupError('Too many signups from this network — try again later.');
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.insert(signupRequests).values({
    id: crypto.randomUUID(),
    kind: 'SIGNUP',
    email,
    codeHash: hashCode(email, code),
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    ip,
  });
  if (!emailConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new SignupError('Signup email isn’t set up yet. Please try again later.');
    console.warn(`[signup] email not configured — code for ${email}: ${code}`);
    return { devCode: code };
  }
  const ok = await sendEmail({
    to: email,
    subject: `${code} is your TrashCan code`,
    html: simpleEmail({
      brandName: 'TrashCan',
      heading: `Your code: ${code}`,
      body: `Enter this code to finish setting up your company on TrashCan. It works for ${CODE_MINUTES} minutes.\n\nDidn’t ask for this? You can ignore this email.`,
    }),
  });
  if (!ok) throw new SignupError('We couldn’t send the code. Check the address and try again.');
  return { devCode: null };
}

/** The newest unexpired code request for this email, if the code matches. */
async function checkCode(email: string, code: string) {
  const row = (
    await db
      .select()
      .from(signupRequests)
      .where(and(eq(signupRequests.email, email), eq(signupRequests.kind, 'SIGNUP')))
      .orderBy(desc(signupRequests.createdAt))
      .limit(1)
  )[0];
  if (!row || row.completedAt || !row.codeHash || !row.expiresAt || row.expiresAt.getTime() < Date.now()) {
    throw new SignupError('That code has expired — ask for a new one.');
  }
  if (row.attempts >= MAX_ATTEMPTS) throw new SignupError('Too many wrong codes — ask for a new one.');
  const want = Buffer.from(row.codeHash);
  const got = Buffer.from(hashCode(email, code.replace(/\D/g, '')));
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    await db.update(signupRequests).set({ attempts: row.attempts + 1 }).where(eq(signupRequests.id, row.id));
    throw new SignupError('That code isn’t right — check the email and try again.');
  }
  return row;
}

/** Step 2 (optional check before the questions): is the code right? */
export async function verifySignupCode(emailInput: string, code: string) {
  await checkCode(normEmail(emailInput), code);
  return true;
}

export const completeSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(12),
  name: z.string().trim().min(2).max(80),
  companyName: z.string().trim().min(2).max(80),
  password: z.string().min(10).max(200),
  answers: answersSchema,
  acceptTerms: z.literal(true),
});

const SERVICE_KEYS_FOR: Record<string, string[]> = {
  RESIDENTIAL: ['STANDARD'],
  DEEP_MOVE: ['DEEP', 'MOVE_IN_OUT'],
  RENTALS: ['AIRBNB'],
  POST_CONSTRUCTION: ['POST_CONSTRUCTION'],
  COMMERCIAL: ['COMMERCIAL'],
};

/** Step 3: create the company and its first admin. */
export async function completeSignup(input: z.infer<typeof completeSchema>) {
  if (!(await signupIsOpen())) throw new SignupError('Signup isn’t open yet.');
  const email = normEmail(input.email);
  const request = await checkCode(email, input.code);

  // A unique, readable slug: "sparkle-co", then "sparkle-co-2", ...
  const base = slugify(input.companyName) || 'company';
  let slug = base;
  for (let i = 2; (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1)).length; i += 1) slug = `${base}-${i}`;

  let tenantId: string;
  try {
    ({ tenantId } = await provisionTenant({ name: input.companyName, slug, admin: { name: input.name, email, password: input.password } }));
  } catch (err) {
    if (err instanceof ProvisioningError) throw new SignupError(err.message);
    throw err;
  }

  // Offer only the lines they said they do (the rest are a switch away in Admin → Services).
  const offered = new Set(input.answers.services.flatMap((k) => SERVICE_KEYS_FOR[k] ?? []));
  const lines = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenantId));
  for (const line of lines) {
    if (!offered.has(line.key)) await db.update(serviceTypes).set({ offered: false }).where(eq(serviceTypes.id, line.id));
  }
  await db.update(tenants).set({ intakeJson: JSON.stringify(input.answers) }).where(eq(tenants.id, tenantId));
  await db.update(signupRequests).set({ completedAt: new Date(), tenantId, name: input.name, companyName: input.companyName }).where(eq(signupRequests.id, request.id));
  await notifyPlatformOwner(`New company on TrashCan: ${input.companyName}`, `${input.name} (${email}) just signed up ${input.companyName}.`);
  return { tenantId, slug };
}

export const waitlistSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(2).max(80),
  companyName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).optional(),
});

export async function joinWaitlist(input: z.infer<typeof waitlistSchema>, ip: string | null) {
  const email = normEmail(input.email);
  const hourAgo = new Date(Date.now() - 3600_000);
  if (ip && (await recentCount(and(eq(signupRequests.ip, ip), gte(signupRequests.createdAt, hourAgo)))) >= 10) {
    throw new SignupError('Too many requests from this network — try again later.');
  }
  const already = (await db.select({ id: signupRequests.id }).from(signupRequests).where(and(eq(signupRequests.email, email), eq(signupRequests.kind, 'WAITLIST'))).limit(1))[0];
  if (already) return { already: true };
  await db.insert(signupRequests).values({ id: crypto.randomUUID(), kind: 'WAITLIST', email, name: input.name, companyName: input.companyName, phone: input.phone || null, ip });
  await notifyPlatformOwner(`Waitlist: ${input.companyName}`, `${input.name} (${email}${input.phone ? `, ${input.phone}` : ''}) wants to run ${input.companyName} on TrashCan.`);
  return { already: false };
}

async function notifyPlatformOwner(subject: string, body: string) {
  const owners = await db.select({ email: users.email }).from(users).where(eq(users.role, 'SUPER_ADMIN'));
  for (const o of owners) {
    if (o.email) await sendEmail({ to: o.email, subject, html: simpleEmail({ brandName: 'TrashCan', heading: subject, body, cta: { label: 'Open the platform', url: appUrl('/platform/signups') } }) }).catch(() => false);
  }
}

export async function listSignups() {
  return db.select().from(signupRequests).orderBy(desc(signupRequests.createdAt)).limit(200);
}

/** For the IP rate limit: the caller's address as Vercel reports it, hashed so raw IPs aren't stored. */
export function hashedIp(forwardedFor: string | null) {
  const ip = forwardedFor?.split(',')[0]?.trim();
  return ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : null;
}
