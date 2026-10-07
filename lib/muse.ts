import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { adConcepts, serviceTypes, tenants } from '@/db/schema';
import { logChange, type Actor } from '@/lib/audit';
import { createCampaign, segmentCounts, SEGMENTS, type Segment } from '@/lib/marketing';
import { appUrl, bookingLinkFor } from '@/lib/url';
import { businessTodayISO } from '@/lib/time';

/**
 * Muse — Tex's marketing agent. Give it a goal and it drafts ad and
 * campaign ideas from the company's own facts (services, who's lapsed,
 * the referral credit, the season), checks the copy against our house
 * rules, and suggests a four-week plan. Everything lands as a DRAFT; a
 * person edits and approves it before it can become an email or text
 * campaign or a paused Facebook/Instagram ad. Muse never sends, posts or
 * spends anything on its own.
 *
 * With ANTHROPIC_API_KEY Claude writes the ideas; without it Muse still
 * works from built-in templates, so the whole flow is usable for free.
 * Images are free, keyless AI images (Pollinations) shown from a URL; the
 * owner reviews every one.
 */

export class MuseError extends Error {
  status = 400;
}

export type Concept = {
  title: string;
  angle: string;
  headline: string;
  primaryText: string;
  cta: string;
  imagePrompt: string;
  audience: string;
  segment: Segment | null;
};

export const CHANNELS = ['META', 'EMAIL', 'TEXT'] as const;
export type MuseChannel = (typeof CHANNELS)[number];

// ---------------------------------------------------------------- rules

const MONEY = /\$\s?\d|\b\d[\d,.]*\s?(dollars?|usd|bucks|% off|percent off)\b|\b(half price|discount|coupon|\d+% off)\b/i;
const PUFFERY = /\b(guarantee[ds]?|best in|#1|number one|world[- ]class|cheapest|lowest price|100%|risk[- ]free|kills? (99|100)|germ[- ]free|sterili[sz]e)\b/i;
const PERSONAL = /\b(are you (struggling|overweight|depressed|lonely|broke|in debt)|your (disability|illness|age|religion|race))\b/i;
const FAKE_SOCIAL = /["“”][^"“”]{10,}["“”]\s*[-—–]\s*[A-Z][a-z]+|\b\d[\d,]* (five[- ]star|5[- ]star) reviews\b/;

/** Why a piece of copy can't go out as written. Empty means it's fine. */
export function copyIssues(c: { headline: string; primaryText: string; cta?: string }) {
  const text = `${c.headline}\n${c.primaryText}\n${c.cta ?? ''}`;
  const issues: string[] = [];
  if (MONEY.test(text)) issues.push('Mentions a price or discount — prices are set at the free walkthrough.');
  if (PUFFERY.test(text)) issues.push('Makes a claim we can’t back up (guarantee, “best”, germ-free…). Say what you actually do.');
  if (PERSONAL.test(text)) issues.push('Speaks to a personal circumstance, which ad platforms reject. Talk about the home, not the person.');
  if (FAKE_SOCIAL.test(text)) issues.push('Looks like a made-up testimonial or review count. Only use real reviews, word for word.');
  if (c.headline.length > 60) issues.push('Headline is over 60 characters and will be cut off.');
  if (c.primaryText.length > 500) issues.push('Primary text is long — keep it under 500 characters.');
  if (!c.headline.trim() || c.primaryText.trim().length < 20) issues.push('Needs a headline and a few sentences of text.');
  return issues;
}

// ---------------------------------------------------------------- images

const STYLE = 'bright natural light, clean modern home interior, photorealistic, no text, no logos, no people';

/** A free, keyless AI image (Pollinations). Same prompt + seed = same picture; a new seed = a new one. */
export function imageUrlFor(prompt: string | null | undefined, seed: number, wide = true) {
  const p = `${(prompt ?? 'a spotless bright living room').slice(0, 300)}, ${STYLE}`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=${wide ? 1200 : 1080}&height=${wide ? 628 : 1080}&nologo=true&seed=${seed}&model=flux`;
}

// --------------------------------------------------------------- seasons

const SEASONS: { months: number[]; theme: string; hook: string }[] = [
  { months: [2, 3, 4], theme: 'Spring cleaning', hook: 'a fresh start after winter — deep clean, windows, baseboards' },
  { months: [5, 6, 7, 8], theme: 'Move-outs and summer', hook: 'move-in/move-out cleans, vacation-ready homes, summer guests' },
  { months: [9, 10], theme: 'Back to routine', hook: 'getting the house in order before the holidays; a recurring schedule' },
  { months: [11, 12], theme: 'Holiday hosting', hook: 'a spotless home before guests arrive; gift a clean' },
  { months: [1], theme: 'New year reset', hook: 'start the year with a clean house and a recurring schedule' },
];
export const seasonFor = (iso = businessTodayISO()) => SEASONS.find((s) => s.months.includes(Number(iso.slice(5, 7)))) ?? SEASONS[0];

// ------------------------------------------------------------- the facts

export async function companyFacts(tenantId: string) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant) throw new MuseError('Company not found.');
  const offered = await db.select({ name: serviceTypes.name }).from(serviceTypes).where(and(eq(serviceTypes.tenantId, tenantId), eq(serviceTypes.offered, true)));
  const counts = await segmentCounts(tenantId);
  return {
    company: tenant.name,
    tagline: tenant.tagline,
    services: offered.map((s) => s.name),
    serviceAreaMiles: tenant.serviceAreaRadiusMiles,
    referralCreditDollars: tenant.referralCreditCents / 100,
    winbackDays: tenant.winbackDays,
    counts,
    season: seasonFor(),
    bookingLink: bookingLinkFor(tenant),
  };
}

// ----------------------------------------------------------- brainstorm

type Facts = Awaited<ReturnType<typeof companyFacts>>;

/** The free route: sensible concepts built from the company's own facts. */
export function templateConcepts(f: Facts, goal: string, count: number): Concept[] {
  const svc = f.services[0] ?? 'cleaning';
  const all: Concept[] = [
    {
      title: `${f.season.theme}: free walkthrough`,
      angle: 'Seasonal need + low-risk first step',
      headline: `${f.season.theme} made easy`,
      primaryText: `${f.company} takes ${f.season.hook} off your plate. Book a free in-person walkthrough and we’ll walk your home, listen to what matters, and give you an exact quote. No pressure.`,
      cta: 'Book a free walkthrough',
      imagePrompt: 'sunlit living room with freshly cleaned floors and tidy shelves',
      audience: `Homeowners within ${f.serviceAreaMiles} miles, 28–65`,
      segment: 'LEADS',
    },
    {
      title: 'Win back lapsed clients',
      angle: 'Warm, personal reminder',
      headline: 'It’s been a while — we miss you',
      primaryText: `Your home is probably due for a reset. Reply or book online and ${f.company} will get you back on the schedule that works for you.`,
      cta: 'Book a clean',
      imagePrompt: 'tidy kitchen counter with a fresh bouquet of flowers',
      audience: `Clients with no clean in ${f.winbackDays}+ days`,
      segment: 'LAPSED',
    },
    {
      title: 'Refer a friend',
      angle: 'Reward the clients who already love you',
      headline: `Give a clean, get $${f.referralCreditDollars} credit`.replace(/\$\d+ credit/, 'a credit'),
      primaryText: `Know someone who’d love a spotless home? Send them to ${f.company}. When they book, you get a credit on your next clean. Your personal link is in your account.`,
      cta: 'Share your link',
      imagePrompt: 'two coffee mugs on a clean table by a bright window',
      audience: 'Active clients',
      segment: 'ALL_ACTIVE',
    },
    {
      title: 'Make it a routine',
      angle: 'Upgrade one-time clients to recurring',
      headline: 'Same clean home, every week',
      primaryText: `Loved your clean? A repeating schedule means the same friendly team on a day that works for you, and a home that’s always ready. Ask ${f.company} about weekly or every-other-week visits.`,
      cta: 'Set up a schedule',
      imagePrompt: 'calendar on a wall next to a tidy entryway with a vase of flowers',
      audience: 'One-time clients',
      segment: 'ONE_TIME',
    },
    {
      title: `${svc}: what’s included`,
      angle: 'Educate — show the checklist',
      headline: `What our ${svc.toLowerCase()} includes`,
      primaryText: `Room by room, here’s exactly what ${f.company} does on every visit — and you can see photos when we’re done. Curious? Book a free walkthrough and ask us anything.`,
      cta: 'Learn more',
      imagePrompt: 'close-up of a spotless bathroom sink and gleaming faucet',
      audience: `Homeowners within ${f.serviceAreaMiles} miles`,
      segment: 'LEADS',
    },
  ];
  const g = goal.toLowerCase();
  const wanted = /lapsed|win.?back|return/.test(g) ? [1] : /refer/.test(g) ? [2] : /recurr|routine|schedule/.test(g) ? [3] : /new|lead|customer|book|walkthrough/.test(g) ? [0, 4] : [0, 1, 2, 3, 4];
  return [...wanted.map((i) => all[i]), ...all].filter((c, i, a) => a.indexOf(c) === i).slice(0, count);
}

async function claudeConcepts(f: Facts, goal: string, channel: MuseChannel, count: number): Promise<Concept[] | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const system = `You are Muse, the marketing writer for ${f.company}, a local cleaning company. Write ${count} distinct ad/campaign concepts for the goal given. Plain, warm, specific; sound like a local business owner, not an agency.

Hard rules (copy that breaks them is rejected):
- Never state a price, discount, percentage off, coupon or dollar amount. Prices are set after a free in-person walkthrough; the offer is the free walkthrough.
- No guarantees, "best", "#1", "100%", germ/sterile claims, or health claims.
- No made-up testimonials, review counts or statistics.
- Don't address personal circumstances (health, money, age, religion). Talk about the home.
- Facebook/Instagram: headline ≤ 40 characters, primary text ≤ 300 characters. Email: headline is the subject line. Text: primary text ≤ 300 characters.
- Image prompt: a home interior scene, no people, no text, no logos.

Facts about the company: ${JSON.stringify({ services: f.services, serviceAreaMiles: f.serviceAreaMiles, season: f.season, clients: f.counts, referralCredit: 'a credit on the referrer’s next clean', tagline: f.tagline })}
Allowed segments: ${SEGMENTS.map((s) => `${s.key} (${s.label})`).join(', ')}. Use null for new-customer ads.`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.MUSE_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2500,
        system,
        tool_choice: { type: 'tool', name: 'submit_concepts' },
        tools: [
          {
            name: 'submit_concepts',
            description: 'Submit the concepts',
            input_schema: {
              type: 'object',
              properties: {
                concepts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' }, angle: { type: 'string' }, headline: { type: 'string' }, primaryText: { type: 'string' }, cta: { type: 'string' },
                      imagePrompt: { type: 'string' }, audience: { type: 'string' }, segment: { type: ['string', 'null'] },
                    },
                    required: ['title', 'angle', 'headline', 'primaryText', 'cta', 'imagePrompt', 'audience'],
                  },
                },
              },
              required: ['concepts'],
            },
          },
        ],
        messages: [{ role: 'user', content: `Goal: ${goal}\nChannel: ${channel}\nToday: ${businessTodayISO()}` }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('[muse] Claude API error', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; input?: { concepts?: Concept[] } }[] };
    const list = data.content?.find((c) => c.type === 'tool_use')?.input?.concepts;
    if (!Array.isArray(list) || !list.length) return null;
    return list.slice(0, count).map((c) => ({
      title: String(c.title ?? '').slice(0, 120),
      angle: String(c.angle ?? '').slice(0, 200),
      headline: String(c.headline ?? '').slice(0, 120),
      primaryText: String(c.primaryText ?? '').slice(0, 900),
      cta: String(c.cta ?? 'Book a free walkthrough').slice(0, 40),
      imagePrompt: String(c.imagePrompt ?? '').slice(0, 300),
      audience: String(c.audience ?? '').slice(0, 200),
      segment: SEGMENTS.some((s) => s.key === c.segment) ? (c.segment as Segment) : null,
    }));
  } catch (err) {
    console.error('[muse] Claude call failed', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Draft concepts for a goal and save them. Nothing is sent or posted. */
export async function brainstorm(tenantId: string, input: { goal: string; channel?: MuseChannel; count?: number }, actor?: Actor) {
  const goal = input.goal.trim().slice(0, 400);
  if (goal.length < 3) throw new MuseError('Tell Muse what you want — for example “book more deep cleans this month”.');
  const channel = input.channel && CHANNELS.includes(input.channel) ? input.channel : 'META';
  const count = Math.min(6, Math.max(1, input.count ?? 3));
  const facts = await companyFacts(tenantId);
  const fromModel = await claudeConcepts(facts, goal, channel, count);
  const concepts = fromModel ?? templateConcepts(facts, goal, count);
  const saved: string[] = [];
  for (const c of concepts) {
    const id = crypto.randomUUID();
    await db.insert(adConcepts).values({
      id, tenantId, title: c.title, channel, goal, angle: c.angle, headline: c.headline, primaryText: c.primaryText, cta: c.cta,
      imagePrompt: c.imagePrompt, imageSeed: 1 + Math.floor(Math.random() * 9000), audience: c.audience, segment: c.segment, createdBy: actor?.id ?? null,
    });
    saved.push(id);
  }
  await logChange({ tenantId, actor, entityType: 'ad_concept', entityId: saved[0], action: 'created', summary: `Muse drafted ${saved.length} idea${saved.length === 1 ? '' : 's'}: ${goal}` });
  return { ids: saved, usedModel: !!fromModel };
}

// ------------------------------------------------------------- the plan

export type PlanItem = { week: number; theme: string; channel: MuseChannel; segment: Segment | null; why: string; goal: string };

/** A four-week plan from what the data says (who's lapsed, who could go recurring) and the season. */
export async function suggestPlan(tenantId: string): Promise<PlanItem[]> {
  const f = await companyFacts(tenantId);
  const c = f.counts as Record<Segment, number>;
  const plan: PlanItem[] = [];
  if (c.LAPSED > 0) plan.push({ week: 1, theme: 'Win back lapsed clients', channel: 'EMAIL', segment: 'LAPSED', why: `${c.LAPSED} client${c.LAPSED === 1 ? ' hasn’t' : 's haven’t'} booked in ${f.winbackDays}+ days.`, goal: 'win back lapsed clients with a friendly note' });
  plan.push({ week: plan.length ? 2 : 1, theme: `${f.season.theme}: new customers`, channel: 'META', segment: null, why: `It’s ${f.season.theme.toLowerCase()} season — ${f.season.hook}.`, goal: `book new customers for ${f.season.theme.toLowerCase()} with a free walkthrough` });
  if (c.ONE_TIME > 0) plan.push({ week: 3, theme: 'Turn one-time clients into a routine', channel: 'EMAIL', segment: 'ONE_TIME', why: `${c.ONE_TIME} one-time client${c.ONE_TIME === 1 ? '' : 's'} could be on a repeating schedule.`, goal: 'move one-time clients to a recurring schedule' });
  if (c.ALL_ACTIVE > 0) plan.push({ week: 4, theme: 'Ask for referrals', channel: 'TEXT', segment: 'ALL_ACTIVE', why: `${c.ALL_ACTIVE} active clients; a referral is your cheapest new customer.`, goal: 'ask happy clients to refer a friend' });
  return plan.map((p, i) => ({ ...p, week: Math.min(4, i + 1) }));
}

// -------------------------------------------------------------- the list

export async function listConcepts(tenantId: string, includeArchived = false) {
  const rows = await db.select().from(adConcepts).where(and(eq(adConcepts.tenantId, tenantId), inArray(adConcepts.status, includeArchived ? ['DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] : ['DRAFT', 'APPROVED', 'PUBLISHED']))).orderBy(desc(adConcepts.createdAt));
  return rows.map((r) => ({ ...r, issues: copyIssues(r), imageUrl: imageUrlFor(r.imagePrompt, r.imageSeed, r.channel === 'META') }));
}

export async function getConcept(tenantId: string, id: string) {
  const row = (await db.select().from(adConcepts).where(and(eq(adConcepts.id, id), eq(adConcepts.tenantId, tenantId))).limit(1))[0];
  if (!row) throw new MuseError('That idea wasn’t found.');
  return row;
}

type Edit = Partial<Pick<typeof adConcepts.$inferInsert, 'title' | 'headline' | 'primaryText' | 'cta' | 'imagePrompt' | 'audience' | 'segment' | 'zips' | 'dailyBudgetCents' | 'channel'>> & { newImage?: boolean; status?: 'DRAFT' | 'APPROVED' | 'ARCHIVED' };

export async function editConcept(tenantId: string, id: string, edit: Edit, actor?: Actor) {
  const row = await getConcept(tenantId, id);
  if (row.status === 'PUBLISHED') throw new MuseError('This one is already in Facebook. Change it there, or duplicate it.');
  const set: Partial<typeof adConcepts.$inferInsert> = { updatedAt: new Date() };
  for (const k of ['title', 'headline', 'primaryText', 'cta', 'imagePrompt', 'audience', 'segment', 'zips', 'dailyBudgetCents', 'channel'] as const) {
    if (edit[k] !== undefined) (set as Record<string, unknown>)[k] = edit[k];
  }
  if (edit.newImage) set.imageSeed = 1 + Math.floor(Math.random() * 9000);
  const merged = { ...row, ...set };
  if (edit.status === 'APPROVED') {
    const issues = copyIssues({ headline: merged.headline, primaryText: merged.primaryText, cta: merged.cta });
    if (issues.length) throw new MuseError(`Fix this before approving: ${issues[0]}`);
    set.status = 'APPROVED';
  } else if (edit.status) {
    set.status = edit.status;
  } else if (row.status === 'APPROVED' && (edit.headline !== undefined || edit.primaryText !== undefined || edit.cta !== undefined)) {
    set.status = 'DRAFT'; // edited copy needs approving again
  }
  await db.update(adConcepts).set(set).where(eq(adConcepts.id, id));
  await logChange({ tenantId, actor, entityType: 'ad_concept', entityId: id, action: 'updated', summary: `${edit.status === 'APPROVED' ? 'Approved' : 'Edited'} “${merged.title}”` });
}

/** An approved idea becomes an email or text campaign draft in Growth — still unsent. */
export async function toCampaign(tenantId: string, id: string, actor?: { id: string; name: string }) {
  const row = await getConcept(tenantId, id);
  if (row.status !== 'APPROVED' && row.status !== 'PUBLISHED') throw new MuseError('Approve the idea first.');
  if (row.campaignId) throw new MuseError('This idea is already a campaign draft in Growth.');
  const campaignId = await createCampaign(
    tenantId,
    { name: row.title, segment: (row.segment ?? 'ALL_ACTIVE') as Segment, subject: row.headline, body: `${row.primaryText}\n\n${row.cta}: ${await tenantBookingLink(tenantId)}` },
    actor,
  );
  await db.update(adConcepts).set({ campaignId, updatedAt: new Date() }).where(eq(adConcepts.id, id));
  return campaignId;
}

/** The company's own booking link (lib/url.ts bookingLinkFor), by id. */
export async function tenantBookingLink(tenantId: string) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return tenant ? bookingLinkFor(tenant) : appUrl('/new');
}
