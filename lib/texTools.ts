import { db } from '@/db/client';
import { bookings, crews, invoices, notificationLog, serviceTypes, tenants, users } from '@/db/schema';
import { and, asc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { articlesFor, search, type Article } from '@/lib/help';
import type { Audience } from '@/lib/help/content';
import { appUrl } from '@/lib/url';
import { getAccountBookings } from '@/lib/account';
import { getEstimatesForClient, estimateUrl } from '@/lib/estimates';
import { crewDashboard } from '@/lib/earnings';
import { getAdminToday } from '@/lib/adminToday';
import { createSupplyReport } from '@/lib/supplies';
import { getCrewForUser } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { businessNowISO, businessTodayISO, businessLocalToUtc } from '@/lib/time';
import { automationState } from '@/lib/automations';
import { ensureReferralCode, referralLink } from '@/lib/referrals';
import { SERVICES } from '@/lib/services';
import { invoiceLabel } from '@/lib/invoices';
import { phoneDigits } from '@/lib/sms';
import { ACCOUNT_FIELDS, TexActionError, confirmChange, openTimes, proposeAccountUpdate, proposeCancel, proposeReschedule, proposeVerify } from '@/lib/texActions';

/**
 * What Tex can look up and do, scoped to whoever is talking. Every tool
 * reads only the signed-in person's own records (a client's cleans and
 * invoices, a cleaner's jobs and pay) or, for office staff, their own
 * company's. The few actions are small and reversible — a note for the
 * crew, a supply report, a callback request — and anything that changes a
 * booking is handed back as a link to the page that does it, with its
 * rules. On phone calls (caller ID can be faked) Tex gets no account
 * tools at all; by text, replies only ever go to the number on file.
 */

export type TexChannel = 'WEB' | 'SMS' | 'VOICE';

export type TexContext = {
  tenant: typeof tenants.$inferSelect;
  audience: Audience;
  channel: TexChannel;
  userId: string | null;
  userName: string | null;
  phone: string | null;
  conversationId: string;
  /** By text or phone: has the person proved who they are with a code (lib/texActions.ts)? Web sessions always have. */
  verified: boolean;
  /** Set by tools during a turn. */
  handoff: boolean;
  articlesSeen: Article[];
};

type Tool = {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run: (ctx: TexContext, input: Record<string, unknown>) => Promise<unknown>;
};

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function alertTeam(ctx: TexContext, kind: string, text: string) {
  await db.insert(notificationLog).values({
    id: crypto.randomUUID(),
    tenantId: ctx.tenant.id,
    channel: ctx.channel === 'WEB' ? 'EMAIL' : 'SMS',
    recipient: 'admin',
    triggerEvent: `${kind}: ${text}`.slice(0, 500),
    isRead: false,
  });
}

// ------------------------------------------------------------- everyone

const searchHelp: Tool = {
  name: 'search_help',
  description:
    "Search the company's help articles and policies (booking, pricing approach, rescheduling, payments, photos, services, crew how-tos, office procedures). Use this before answering anything about how this company works.",
  input_schema: { type: 'object', properties: { query: { type: 'string', description: 'What to look up, in plain words' } }, required: ['query'] },
  async run(ctx, input) {
    const list = await articlesFor(ctx.tenant.id, ctx.audience, ctx.tenant.name);
    const hits = search(list, str(input.query, 200), 4).map((h) => h.article);
    ctx.articlesSeen.push(...hits.filter((h) => !ctx.articlesSeen.includes(h)));
    if (!hits.length) return { results: [], note: 'Nothing in the help covers this.' };
    return {
      results: hits.map((a) => ({ title: a.title, url: articleUrl(a, ctx.audience), text: a.body.slice(0, 1800) })),
    };
  },
};

const companyInfo: Tool = {
  name: 'company_info',
  description: 'The company name, the services it offers (no prices), and the links for booking a free walkthrough and for help.',
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    const offered = await db
      .select({ key: serviceTypes.key, name: serviceTypes.name })
      .from(serviceTypes)
      .where(and(eq(serviceTypes.tenantId, ctx.tenant.id), eq(serviceTypes.offered, true)));
    return {
      company: ctx.tenant.name,
      tagline: ctx.tenant.tagline,
      services: offered.map((s) => ({ name: s.name, about: SERVICES.find((x) => x.key === s.key)?.tagline ?? null, request_link: appUrl(`/new?service=${s.key}`) })),
      book_a_free_walkthrough: appUrl('/new'),
      help_center: appUrl('/help'),
      sign_in: appUrl('/signin'),
      text_us: ctx.tenant.smsNumber ?? null,
      pricing: 'Every job is priced after a free in-person walkthrough; there is no online price list.',
    };
  },
};

const handOff: Tool = {
  name: 'hand_off_to_team',
  description:
    'Pass the conversation to a person on the team. Use when someone asks for a person, has a complaint, damage, safety issue, refund or billing dispute, wants something you cannot do, or you are not sure. Say a person will follow up.',
  input_schema: {
    type: 'object',
    properties: { reason: { type: 'string', description: 'One line for the team: what the person needs' } },
    required: ['reason'],
  },
  async run(ctx, input) {
    ctx.handoff = true;
    await alertTeam(ctx, 'TEX_HANDOFF', `${ctx.userName ?? ctx.phone ?? 'A visitor'} (${ctx.channel.toLowerCase()}): ${str(input.reason, 300)}`);
    return { ok: true, note: 'The team has been told and will follow up.' };
  },
};

// ------------------------------------------------------------ visitors

const leaveContact: Tool = {
  name: 'leave_contact_details',
  description:
    'For someone not signed in who wants the company to contact them (a quote, a question you could not answer). Collect a name and a phone number or email first, then call this. It alerts the team.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      phone: { type: 'string' },
      email: { type: 'string' },
      message: { type: 'string', description: 'What they want, in one or two lines' },
    },
    required: ['name', 'message'],
  },
  async run(ctx, input) {
    const phone = str(input.phone, 30);
    const email = str(input.email, 120);
    if (!phone && !email) return { ok: false, error: 'Ask for a phone number or an email address first.' };
    ctx.handoff = true;
    await alertTeam(ctx, 'TEX_LEAD', `${str(input.name, 80)} — ${[phone, email].filter(Boolean).join(', ')} — ${str(input.message, 300)}`);
    return { ok: true, note: 'The team has their details and will reach out. For an exact price they can also book a free walkthrough.', book_a_free_walkthrough: appUrl('/new') };
  },
};

// ------------------------------------------------------------- clients

async function myRows(ctx: TexContext) {
  return ctx.userId ? getAccountBookings(ctx.userId) : [];
}

const myCleans: Tool = {
  name: 'my_cleans',
  description: "The signed-in client's upcoming cleans (date, arrival window, service, status, booking_id) and their most recent finished clean with its photos link.",
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    const rows = await myRows(ctx);
    const now = businessNowISO();
    const upcoming = rows.filter((r) => r.booking.slotEnd >= now && r.job?.status !== 'COMPLETE').slice(0, 6);
    const last = rows.filter((r) => r.job?.status === 'COMPLETE').pop();
    return {
      upcoming: upcoming.map((r) => ({
        booking_id: r.booking.id,
        date: formatDateLabel(r.booking.slotStart.slice(0, 10)),
        arrival_window: formatSlotLabel(r.booking.slotStart, r.booking.slotEnd),
        service: r.service?.name ?? 'Cleaning',
        status: r.job?.status === 'EN_ROUTE' ? 'crew on the way' : r.job?.status === 'IN_PROGRESS' ? 'cleaning now' : 'booked',
        note_for_crew: r.booking.clientNotes ?? null,
      })),
      last_finished: last
        ? { date: formatDateLabel(last.booking.slotStart.slice(0, 10)), service: last.service?.name ?? 'Cleaning', photos: last.photoCount, photos_link: appUrl(`/account/jobs/${last.job!.id}`) }
        : null,
      manage_link: appUrl('/account'),
      book_another: appUrl('/book'),
    };
  },
};

const myInvoices: Tool = {
  name: 'my_invoices',
  description: "The signed-in client's unpaid invoices (amount, pay link) and recent payments. These amounts are the client's own bills and may be shared with them.",
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    const rows = await myRows(ctx);
    const open = rows.filter((r) => r.invoice?.status === 'SENT').map((r) => r.invoice!);
    const paid = rows.filter((r) => r.invoice?.status === 'PAID').map((r) => r.invoice!).slice(-3);
    return {
      unpaid: open.map((i) => ({ invoice: invoiceLabel(i), amount: formatMoney(i.totalCents), sent: i.sentAt?.toISOString().slice(0, 10) ?? null, pay_link: appUrl(`/account/invoices/${i.id}`) })),
      total_due: formatMoney(open.reduce((s, i) => s + i.totalCents, 0)),
      recent_payments: paid.map((i) => ({ invoice: invoiceLabel(i), amount: formatMoney(i.totalCents), paid: i.paidAt?.toISOString().slice(0, 10) ?? null })),
      all_invoices: appUrl('/account/invoices'),
    };
  },
};

const myQuotes: Tool = {
  name: 'my_quotes',
  description: "The signed-in client's quotes waiting for an answer (service, their quoted total, link to approve). These are the client's own quotes and may be shared with them.",
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    if (!ctx.userId) return { quotes: [] };
    const rows = (await getEstimatesForClient(ctx.userId)).filter((q) => q.status === 'SENT' && q.tenantId === ctx.tenant.id);
    const services = rows.length ? await db.select().from(serviceTypes).where(inArray(serviceTypes.id, rows.map((q) => q.serviceTypeId))) : [];
    return {
      quotes: rows.map((q) => ({
        service: services.find((s) => s.id === q.serviceTypeId)?.name ?? 'Cleaning',
        total: formatMoney(q.totalCents),
        good_until: q.expiresAt?.toISOString().slice(0, 10) ?? null,
        approve_link: q.approvalToken ? estimateUrl(q.approvalToken) : null,
      })),
    };
  },
};

const myAccount: Tool = {
  name: 'my_account',
  description: "The signed-in client's account settings: credit balance, autopay, how they get reminders, and their referral link if the company runs referrals.",
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    if (!ctx.userId) return {};
    const u = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
    if (!u) return {};
    const referrals = (await automationState(ctx.tenant.id, 'referral_rewards')).enabled && ctx.tenant.referralCreditCents > 0;
    const code = referrals ? await ensureReferralCode(u.id) : null;
    return {
      name: u.name,
      credit: formatMoney(u.creditCents),
      autopay: u.autopayEnabled,
      card_on_file: u.paymentMethodLast4 ? `${u.paymentMethodBrand ?? 'card'} ending ${u.paymentMethodLast4}` : null,
      reminders_by: u.notificationChannel,
      referral: code ? { link: referralLink(code), each_side_gets: formatMoney(ctx.tenant.referralCreditCents) } : null,
      settings_link: appUrl('/account/settings'),
    };
  },
};

async function ownBooking(ctx: TexContext, id: string) {
  if (!ctx.userId || !id) return null;
  const b = (await db.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.clientId, ctx.userId), eq(bookings.tenantId, ctx.tenant.id))).limit(1))[0];
  return b ?? null;
}

const addNote: Tool = {
  name: 'add_note_for_crew',
  description:
    "Add a note to one of the client's upcoming cleans for the crew to read on the day (for example: skip the guest room, dog is in the yard). Only when the client asked for it. Use booking_id from my_cleans. Repeat the note back after saving.",
  input_schema: {
    type: 'object',
    properties: { booking_id: { type: 'string' }, note: { type: 'string', description: 'The note in the client’s words' } },
    required: ['booking_id', 'note'],
  },
  async run(ctx, input) {
    // By text or phone the number could be faked, and the crew acts on notes.
    if (ctx.channel !== 'WEB' && !ctx.verified) return { ok: false, error: 'First call verify_identity so a code goes to the number on file, then confirm it, then add the note.' };
    const b = await ownBooking(ctx, str(input.booking_id, 80));
    if (!b) return { ok: false, error: 'That clean wasn’t found on this account.' };
    if (b.status === 'CANCELLED' || b.status === 'COMPLETED') return { ok: false, error: 'That clean is already finished or cancelled.' };
    const note = str(input.note, 400);
    if (!note) return { ok: false, error: 'The note is empty.' };
    const combined = [b.clientNotes, note].filter(Boolean).join('\n').slice(0, 1000);
    await db.update(bookings).set({ clientNotes: combined }).where(eq(bookings.id, b.id));
    return { ok: true, saved_note: note, for: `${formatDateLabel(b.slotStart.slice(0, 10))}, ${formatSlotLabel(b.slotStart, b.slotEnd)}` };
  },
};

const findOpenTimes: Tool = {
  name: 'find_open_times',
  description:
    "Open times to move one of the client's cleans to (at least 24 hours out). Use booking_id from my_cleans. Optionally narrow with from/to dates (YYYY-MM-DD). Offer a few of these to the client — never invent a time.",
  input_schema: {
    type: 'object',
    properties: { booking_id: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } },
    required: ['booking_id'],
  },
  async run(ctx, input) {
    const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : undefined);
    return actionResult(() => openTimes(ctx, str(input.booking_id, 80), date(input.from), date(input.to)));
  },
};

const proposeMove: Tool = {
  name: 'propose_reschedule',
  description:
    'Step 1 of moving a clean: propose moving booking_id to one of the open times (slot_start and slot_end exactly as find_open_times gave them). This does NOT move it yet — follow the "next" instructions in the result, then call confirm_change.',
  input_schema: {
    type: 'object',
    properties: { booking_id: { type: 'string' }, slot_start: { type: 'string' }, slot_end: { type: 'string' } },
    required: ['booking_id', 'slot_start', 'slot_end'],
  },
  async run(ctx, input) {
    return actionResult(() => proposeReschedule(ctx, str(input.booking_id, 80), str(input.slot_start, 30), str(input.slot_end, 30)));
  },
};

const proposeCancelTool: Tool = {
  name: 'propose_cancel',
  description: 'Step 1 of cancelling a clean (booking_id from my_cleans). Does NOT cancel yet — follow the "next" instructions, then call confirm_change. Check they really want to cancel rather than move it.',
  input_schema: { type: 'object', properties: { booking_id: { type: 'string' } }, required: ['booking_id'] },
  async run(ctx, input) {
    return actionResult(() => proposeCancel(ctx, str(input.booking_id, 80)));
  },
};

const proposeUpdate: Tool = {
  name: 'propose_account_update',
  description: `Step 1 of updating the client's account. field is one of: ${Object.entries(ACCOUNT_FIELDS)
    .map(([k, v]) => `${k} (${v})`)
    .join(', ')}. Phone, address, entry codes and payment cards can't be changed here. Does NOT save yet — follow "next", then call confirm_change.`,
  input_schema: {
    type: 'object',
    properties: { field: { type: 'string', enum: Object.keys(ACCOUNT_FIELDS) }, value: { type: 'string' } },
    required: ['field', 'value'],
  },
  async run(ctx, input) {
    return actionResult(() => proposeAccountUpdate(ctx, str(input.field, 40), str(input.value, 500)));
  },
};

const confirmTool: Tool = {
  name: 'confirm_change',
  description:
    'Step 2: apply the change that is waiting (pending_id from the propose step). On the website, only after the person clearly said yes to the exact summary. By text or phone, pass the 6-digit code they gave you. Only tell them it is done if the result says done.',
  input_schema: {
    type: 'object',
    properties: { pending_id: { type: 'string' }, code: { type: 'string', description: 'The 6-digit code (text and phone only)' } },
    required: ['pending_id'],
  },
  async run(ctx, input) {
    return actionResult(async () => {
      const r = await confirmChange(ctx, str(input.pending_id, 80), str(input.code, 12));
      if (r.result.startsWith('Verified')) ctx.verified = true;
      return r;
    });
  },
};

const verifyCaller: Tool = {
  name: 'verify_identity',
  description:
    "Prove who you're talking to (phone calls before anything from the account; texts before adding a crew note): texts a 6-digit code to the mobile number on file. Ask them for it, then call confirm_change with the pending_id and code.",
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    return actionResult(() => proposeVerify(ctx));
  },
};

async function actionResult(fn: () => Promise<unknown>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TexActionError) return { ok: false, error: err.message };
    throw err;
  }
}

// ---------------------------------------------------------------- crew

const myJobs: Tool = {
  name: 'my_jobs',
  description: "The signed-in cleaner's cleans today and over the next week: time, client, team, whether they lead, teammates, and the job link.",
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    if (!ctx.userId) return {};
    const d = await crewDashboard(ctx.userId);
    if (!d) return {};
    const shape = (j: (typeof d.today)[number]) => ({
      date: formatDateLabel(j.date),
      time: formatSlotLabel(j.slotStart, j.slotEnd),
      client: j.clientName,
      team: j.crewName,
      you_are: j.placement,
      with: j.teammates,
      status: j.jobStatus,
      open: appUrl(`/crew/jobs/${j.jobId}`),
    });
    return { today: d.today.map(shape), coming_up: d.upcoming.map(shape) };
  },
};

const myPay: Tool = {
  name: 'my_pay',
  description: "The signed-in cleaner's pay period, what they've earned in it so far (from the same numbers payroll uses), tips waiting, and next payday. The cleaner's own pay may be shared with them.",
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    if (!ctx.userId) return {};
    const d = await crewDashboard(ctx.userId);
    if (!d) return {};
    return {
      pay_period: d.period ? { from: d.period.start, to: d.period.end } : null,
      next_payday: d.period?.payday ?? null,
      earned_so_far: d.earned?.payCents != null ? formatMoney(d.earned.payCents) : null,
      tips_waiting: d.earned ? formatMoney(d.earned.tipCents) : null,
      cleans: d.earned?.jobs ?? 0,
      hours: d.earned?.hours ?? 0,
      note: d.period ? null : 'The office hasn’t set the payroll calendar yet.',
      rate_set: d.rateSet,
    };
  },
};

const reportSupply: Tool = {
  name: 'report_supply_issue',
  description: "Report a supply that's running low, out, or damaged, for the signed-in cleaner's team. Only when they asked.",
  input_schema: {
    type: 'object',
    properties: { product: { type: 'string' }, status: { type: 'string', enum: ['LOW', 'OUT', 'DAMAGED'] }, notes: { type: 'string' } },
    required: ['product', 'status'],
  },
  async run(ctx, input) {
    if (!ctx.userId) return { ok: false };
    const crew = await getCrewForUser(ctx.userId);
    if (!crew) return { ok: false, error: 'You aren’t on a team yet — ask the office to add you.' };
    const status = ['LOW', 'OUT', 'DAMAGED'].includes(String(input.status)) ? (String(input.status) as 'LOW' | 'OUT' | 'DAMAGED') : 'LOW';
    await createSupplyReport({ tenantId: ctx.tenant.id, crewId: crew.id, reportedByUserId: ctx.userId, productName: str(input.product, 120), status, notes: str(input.notes, 300) || null });
    return { ok: true, reported: str(input.product, 120), status };
  },
};

// -------------------------------------------------------------- office

const todayOverview: Tool = {
  name: 'today_overview',
  description: "Today at a glance for the office: today's cleans and their status, new bookings, open quotes, unpaid invoices, and cleans with no team.",
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    const t = await getAdminToday(ctx.tenant.id);
    return {
      cards: t.cards.map((c) => ({ title: c.title, value: c.big, detail: c.caption, needs_attention: c.links.filter((l) => l.count > 0).map((l) => `${l.label}: ${l.count}`) })),
      today: t.visits.map((v) => ({ client: v.clientName, time: formatSlotLabel(v.start, v.end), status: v.status, team: v.crewName, late: v.late })),
      no_team_assigned: t.unassignedTotal,
      open: appUrl('/admin'),
    };
  },
};

const scheduleFor: Tool = {
  name: 'schedule_for',
  description: 'Every clean and walkthrough on a given date (YYYY-MM-DD) for the office: time, client, service, team, status.',
  input_schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD; use today if not given' } } },
  async run(ctx, input) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date ?? '')) ? String(input.date) : businessTodayISO();
    const rows = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, ctx.tenant.id), ne(bookings.status, 'CANCELLED'), sql`substr(${bookings.slotStart}, 1, 10) = ${date}`))
      .orderBy(asc(bookings.slotStart))
      .limit(60);
    const people = rows.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, rows.map((r) => r.clientId))) : [];
    const teams = await db.select({ id: crews.id, name: crews.name }).from(crews).where(eq(crews.tenantId, ctx.tenant.id));
    const services = await db.select({ id: serviceTypes.id, name: serviceTypes.name }).from(serviceTypes).where(eq(serviceTypes.tenantId, ctx.tenant.id));
    return {
      date: formatDateLabel(date),
      visits: rows.map((r) => ({
        time: formatSlotLabel(r.slotStart, r.slotEnd),
        client: people.find((p) => p.id === r.clientId)?.name ?? 'Client',
        kind: r.isQuoteVisit ? 'walkthrough' : services.find((s) => s.id === r.serviceTypeId)?.name ?? 'clean',
        team: teams.find((t) => t.id === r.crewId)?.name ?? 'not assigned',
        status: r.status,
      })),
      calendar: appUrl('/admin/schedule'),
    };
  },
};

const findClient: Tool = {
  name: 'find_client',
  description: "Look up one of the company's clients by name or phone for the office: contact details, next clean, amount owed, and their page.",
  input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  async run(ctx, input) {
    const q = str(input.query, 80);
    if (q.length < 2) return { clients: [] };
    const digits = phoneDigits(q.replace(/\D/g, '').length >= 10 ? q : null);
    const rows = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.tenantId, ctx.tenant.id),
          eq(users.role, 'CUSTOMER'),
          digits ? sql`right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10) = ${digits}` : or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)),
        ),
      )
      .limit(5);
    const out = [];
    for (const u of rows) {
      const own = await getAccountBookings(u.id);
      const now = businessNowISO();
      const next = own.find((r) => r.booking.slotEnd >= now && r.job?.status !== 'COMPLETE');
      const owed = own.filter((r) => r.invoice?.status === 'SENT').reduce((s, r) => s + (r.invoice?.totalCents ?? 0), 0);
      out.push({
        name: u.name,
        phone: u.phone,
        email: u.email,
        active: u.isActive,
        next_clean: next ? `${formatDateLabel(next.booking.slotStart.slice(0, 10))}, ${formatSlotLabel(next.booking.slotStart, next.booking.slotEnd)}` : null,
        owes: formatMoney(owed),
        page: appUrl(`/admin/clients/${u.id}`),
      });
    }
    return { clients: out };
  },
};

const unpaid: Tool = {
  name: 'unpaid_invoices',
  description: 'Invoices sent and not yet paid, oldest first, with the total outstanding — for the office.',
  input_schema: { type: 'object', properties: {} },
  async run(ctx) {
    const rows = await db.select().from(invoices).where(and(eq(invoices.tenantId, ctx.tenant.id), eq(invoices.status, 'SENT'))).orderBy(asc(invoices.sentAt)).limit(200);
    const people = rows.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, rows.map((r) => r.clientId))) : [];
    return {
      count: rows.length,
      total: formatMoney(rows.reduce((s, r) => s + r.totalCents, 0)),
      oldest: rows.slice(0, 10).map((r) => ({ invoice: invoiceLabel(r), client: people.find((p) => p.id === r.clientId)?.name ?? 'Client', amount: formatMoney(r.totalCents), sent: r.sentAt?.toISOString().slice(0, 10) ?? null, link: appUrl(`/admin/invoices/${r.id}`) })),
    };
  },
};

function articleUrl(a: Article, audience: Audience) {
  if (a.audience.includes('PUBLIC') || a.audience.includes('CLIENT')) return appUrl(`/help/${a.slug}`);
  if (audience === 'CREW') return appUrl(`/crew/help/${a.slug}`);
  return appUrl(`/admin/help/${a.slug}`);
}
export { articleUrl };

/** The tools for this person on this channel. */
export function toolsFor(ctx: Pick<TexContext, 'audience' | 'channel' | 'userId' | 'verified'>): Tool[] {
  const base = [searchHelp, companyInfo, handOff];
  if (!ctx.userId) return [...base, leaveContact];
  if (ctx.audience === 'CLIENT') {
    const reads = [myCleans, myInvoices, myQuotes, myAccount];
    const changes = [addNote, findOpenTimes, proposeMove, proposeCancelTool, proposeUpdate, confirmTool];
    // On a call, caller ID can be faked: nothing from the account until a
    // code texted to the number on file has been read back.
    if (ctx.channel === 'VOICE' && !ctx.verified) return [...base, leaveContact, verifyCaller, confirmTool];
    return [...base, ...reads, ...changes, ...(ctx.channel === 'SMS' && !ctx.verified ? [verifyCaller] : [])];
  }
  if (ctx.channel === 'VOICE') return [...base, leaveContact];
  if (ctx.audience === 'CREW') return [...base, myJobs, myPay, reportSupply];
  if (ctx.audience === 'ADMIN') return [...base, todayOverview, scheduleFor, findClient, unpaid];
  return [...base, leaveContact];
}

export async function runTool(ctx: TexContext, name: string, input: Record<string, unknown>) {
  const tool = toolsFor(ctx).find((t) => t.name === name);
  if (!tool) return { error: `No tool called ${name} here.` };
  try {
    return await tool.run(ctx, input ?? {});
  } catch (err) {
    console.error('[tex] tool failed', name, err);
    return { error: 'That lookup failed. Apologise briefly and offer to pass it to the team.' };
  }
}
