import { enforceMfa, type SessionUser } from '@/lib/sessionUser';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { bookings, users, serviceTypes, jobs, jobChecklistItems, addresses, crews } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getCrewForUser, getTenant, SERVICE_LABELS, serviceLabel } from '@/lib/data';
import { homeForRole } from '@/lib/nav';
import { jobIdsForEmployee } from '@/lib/team';
import { businessTodayISO } from '@/lib/time';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import AppShell, { CREW_TABS } from '@/components/app/AppShell';
import ServiceWorkerRegistrar from '@/components/crew/ServiceWorkerRegistrar';
import CrewDashboardCards from '@/components/crew/CrewDashboardCards';
import { crewDashboard } from '@/lib/earnings';
import { formatMoney } from '@/lib/format';
import CalendarConnectCard from '@/components/CalendarConnectCard';
import { calendarConfigured, calendarConnection } from '@/lib/googleCalendar';
import { getLocale } from '@/lib/i18n/server';
import { intlLocale, translator, type Locale, type Translate } from '@/lib/i18n';
import CrewBand from '@/components/crew/CrewBand';
import CrewStatus, { type CrewJobState } from '@/components/crew/CrewStatus';
import { crewMessages } from '@/lib/i18n/messages/crew';

type T = Translate<typeof crewMessages.en>;

// Reads the signed-in cleaner's own jobs — live data, per-session.
export const dynamic = 'force-dynamic';

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows(myJobs: (typeof jobs.$inferSelect)[]) {
  if (myJobs.length === 0) return [];
  const bookingRows = await db.select().from(bookings).where(inArray(bookings.id, myJobs.map((j) => j.bookingId)));
  const clientRows = bookingRows.length
    ? await db.select().from(users).where(inArray(users.id, bookingRows.map((b) => b.clientId)))
    : [];
  const addressIds = bookingRows.map((b) => b.addressId).filter(Boolean) as string[];
  const addressRows = addressIds.length ? await db.select().from(addresses).where(inArray(addresses.id, addressIds)) : [];
  const serviceRows = await db.select().from(serviceTypes);
  const itemRows = await db.select().from(jobChecklistItems).where(inArray(jobChecklistItems.jobId, myJobs.map((j) => j.id)));

  return myJobs
    .map((job) => {
      const booking = bookingRows.find((b) => b.id === job.bookingId);
      if (!booking || booking.status === 'CANCELLED') return null;
      const items = itemRows.filter((i) => i.jobId === job.id);
      const address = addressRows.find((a) => a.id === booking.addressId);
      return {
        job,
        booking,
        client: clientRows.find((c) => c.id === booking.clientId),
        service: serviceRows.find((s) => s.id === booking.serviceTypeId),
        address: address ? `${address.line1}, ${address.city}` : null,
        total: items.length,
        done: items.filter((i) => i.status !== 'PENDING').length,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.booking.slotStart.localeCompare(b.booking.slotStart));
}

const serializeConnection = (c: Awaited<ReturnType<typeof calendarConnection>>) =>
  c ? { accountEmail: c.accountEmail, lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null, lastError: c.lastError } : null;

export default async function CrewHome() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin?next=/crew');
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role;
  // Authoritative role check — the middleware guards the edge but can fail
  // open, so the page decides. Admins may look; customers may not.
  if (role !== 'CLEANER' && role !== 'ADMIN') redirect(`${homeForRole(role)}?denied=1`);
  enforceMfa(session.user as unknown as SessionUser, '/crew');
  const locale = await getLocale();
  const t = translator(crewMessages, locale);

  let myJobs: (typeof jobs.$inferSelect)[] = [];
  if (role === 'CLEANER') {
    // Their team's jobs they weren't taken off, plus any they were added to.
    const ids = await jobIdsForEmployee(userId);
    if (ids.length === 0 && !(await getCrewForUser(userId))) {
      return (
        <AppShell name={session.user.name} tabs={CREW_TABS} homeHref="/crew">
          <CrewBand>
            <p className="font-tc-display text-[22px] font-extrabold leading-tight text-white">{t('homeNoJobsToday')}</p>
            <p className="mt-2 text-[15px] text-white/65">{t('noTeam')}</p>
          </CrewBand>
        </AppShell>
      );
    }
    myJobs = ids.length ? await db.select().from(jobs).where(inArray(jobs.id, ids)) : [];
  } else {
    // Admins see every team's jobs here — this is their "jobs" view too.
    const tenant = await getTenant();
    const crewIds = tenant ? (await db.select().from(crews).where(eq(crews.tenantId, tenant.id))).map((c) => c.id) : [];
    myJobs = crewIds.length ? await db.select().from(jobs).where(inArray(jobs.crewId, crewIds)) : [];
  }

  const rows = await loadRows(myJobs);
  const dashboard = role === 'CLEANER' ? await crewDashboard(userId) : null;
  const today = businessTodayISO();
  // A crew that's driving over counts as in progress: it's the job they're on.
  const inProgress = rows.filter((r) => r.job.status === 'IN_PROGRESS' || r.job.status === 'EN_ROUTE');
  const todays = rows.filter((r) => r.booking.slotStart.startsWith(today) && r.job.status === 'PENDING');
  const upcoming = rows.filter((r) => r.booking.slotStart.slice(0, 10) > today && r.job.status === 'PENDING');
  const overdue = rows.filter((r) => r.booking.slotStart.slice(0, 10) < today && r.job.status === 'PENDING');
  const completed = rows.filter((r) => r.job.status === 'COMPLETE').reverse().slice(0, 10);
  const next = inProgress[0] ?? todays[0];

  // The hero: the job you're on, else today's next, else the next one on
  // the calendar — there's always something to look at first.
  const heroRow = next ?? upcoming[0];
  // Placement, team and price for the next 7 days (lib/earnings.ts), shown on the job's row.
  const week = new Map((dashboard ? [...dashboard.today, ...dashboard.upcoming] : []).map((u) => [u.jobId, u]));
  const heroTeam = heroRow ? week.get(heroRow.job.id) : undefined;
  const tomorrow = new Date(new Date(`${today}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const dayWord = (iso: string) =>
    iso === today ? t('homeSectionToday') : iso === tomorrow ? t('homeTomorrow') : cap(formatDateLabel(iso, locale));
  const headline = inProgress.length
    ? t('homeJobInProgress')
    : todays.length
    ? t(todays.length === 1 ? 'homeJobsTodayOne' : 'homeJobsTodayMany', { count: todays.length })
    : t('homeNoJobsToday');

  return (
    <AppShell name={session.user.name} tabs={CREW_TABS} homeHref={role === 'ADMIN' ? '/admin' : '/crew'}>
      {role === 'CLEANER' && <ServiceWorkerRegistrar />}
      <CrewBand>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/55">
              {cap(formatDateLabel(today, locale))}
              {dashboard ? ` · ${t('homeHi', { name: dashboard.user.firstName })}` : ''}
            </p>
            <h1 className="mt-1 font-tc-display text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-white">{headline}</h1>
          </div>
          {dashboard?.teamName && (
            <span className="mt-0.5 shrink-0 truncate rounded-full border border-white/15 px-2.5 py-1 text-[12px] font-semibold text-white/75">
              {dashboard.teamName}
            </span>
          )}
        </div>

        {heroRow ? (
          <HeroJob
            row={heroRow}
            t={t}
            locale={locale}
            day={dayWord(heroRow.booking.slotStart.slice(0, 10))}
            team={heroTeam ? { lead: heroTeam.placement === 'Lead', mates: heroTeam.teammates } : null}
          />
        ) : (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="font-tc-display text-lg font-bold text-white">{t('homeNothingNext')}</p>
            <p className="mt-1 text-sm text-white/60">{t('homeNothingNextHint')}</p>
          </div>
        )}
      </CrewBand>

      <div className="mt-6 space-y-7">
        <Section t={t} locale={locale} week={week} title={t('homeSectionInProgress')} rows={inProgress.filter((r) => r !== heroRow)} />
        <Section t={t} locale={locale} week={week} title={t('homeSectionToday')} rows={todays.filter((r) => r !== heroRow)} />
        <Section t={t} locale={locale} title={t('homeSectionMissed')} rows={overdue} tone="warn" />
        <Section t={t} locale={locale} week={week} title={t('homeSectionComingUp')} rows={upcoming.filter((r) => r !== heroRow)} showDate />

        {dashboard && <CrewDashboardCards data={dashboard} locale={locale} />}

        {role === 'CLEANER' && (
          <Link
            href="/crew/supplies"
            className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-tc-200 bg-white px-4 py-3 transition-colors hover:border-tc-300"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tc-100 text-tc-900" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3h6v3l2 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l2-3V3Zm-2 9h10" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-tc-500">{t('homeSuppliesHint')}</span>
              <span className="block font-semibold text-tc-900">{t('homeReportSupplies')}</span>
            </span>
            <Chevron />
          </Link>
        )}

        <Section t={t} locale={locale} title={t('homeSectionFinished')} rows={completed} showDate muted />
        {rows.length === 0 && <p className="rounded-2xl border border-tc-200 bg-white p-5 text-tc-700">{t('homeEmpty')}</p>}
        {role === 'CLEANER' && calendarConfigured() && (
          <section className="card !p-5" aria-label="Google Calendar">
            <CalendarConnectCard connection={serializeConnection(await calendarConnection(userId))} />
          </section>
        )}
      </div>
    </AppShell>
  );
}

const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

function rowState(row: Row, missed?: boolean): CrewJobState {
  if (row.job.status === 'PENDING' && missed) return 'MISSED';
  return row.job.status as CrewJobState;
}

function stateLabel(t: T, state: CrewJobState) {
  return state === 'COMPLETE'
    ? t('statusDone')
    : state === 'IN_PROGRESS'
    ? t('statusInProgress')
    : state === 'EN_ROUTE'
    ? t('statusDriving')
    : state === 'MISSED'
    ? t('statusMissed')
    : t('statusNotStarted');
}

function Chevron({ className = 'text-tc-300' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * The next job, big: when, who, where, how far along, and the one lime
 * button. Everything in it is one link, so a thumb anywhere opens the job.
 */
function HeroJob({ row, t, locale, day, team }: { row: Row; t: T; locale: Locale; day: string; team: { lead: boolean; mates: string[] } | null }) {
  const { job, booking, client, service, address, total, done } = row;
  const started = job.status === 'IN_PROGRESS';
  const driving = job.status === 'EN_ROUTE';
  const [startTime, endTime] = formatSlotLabel(booking.slotStart, booking.slotEnd, locale).split(' – ');
  const state = rowState(row);
  return (
    <Link
      href={`/crew/jobs/${job.id}`}
      className="group mt-5 block rounded-[22px] bg-tc-black-2 p-5 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-tc-black-3 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-white/70">
          {started ? t('nextKeepGoing') : driving ? t('nextOnTheWay') : t('nextUpNext')} · {day}
        </p>
        <CrewStatus state={state} label={stateLabel(t, state)} on="dark" />
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 font-tc-display tabular-nums leading-none text-white">
        <span className="text-[44px] font-extrabold tracking-[-0.04em] sm:text-[52px]">{startTime}</span>
        <span className="text-[15px] font-semibold text-white/50">– {endTime}</span>
      </p>
      <p className="mt-4 font-tc-display text-[22px] font-bold leading-tight tracking-[-0.015em] text-white">{client?.name}</p>
      <p className="mt-1 text-[15px] text-white/65">
        {service ? (SERVICE_LABELS[service.key] ? serviceLabel(service.key, locale) : service.name) : t('serviceFallback')}
      </p>
      {address && (
        <p className="mt-0.5 flex items-start gap-1.5 text-[15px] text-white/65">
          <svg viewBox="0 0 24 24" className="mt-[3px] h-4 w-4 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          {address}
        </p>
      )}
      {team && (
        <p className="mt-3 text-[13px] text-white/55">
          <span className="mr-1.5 rounded-md bg-white/10 px-1.5 py-0.5 font-semibold text-white/85">{team.lead ? t('dashLead') : t('dashTeamMember')}</span>
          {team.mates.length ? t('dashWith', { names: team.mates.join(', ') }) : t('dashOnYourOwn')}
        </p>
      )}
      <div className="mt-5 flex items-center gap-1" aria-label={t('nextRooms', { done, total })}>
        {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < done ? 'bg-tc-lime' : 'bg-white/15'}`} aria-hidden="true" />
        ))}
      </div>
      <p className="mt-2 text-[12px] font-semibold tabular-nums text-white/55">{t('nextRooms', { done, total })}</p>
      <span className="tc-btn-lime mt-5 w-full !min-h-[52px] text-[16px]">
        {started ? t('nextOpenJob') : driving ? t('nextOpenJobArrived') : t('nextOpenAndStart')}
      </span>
    </Link>
  );
}

const shortDay = (iso: string, locale: Locale) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(intlLocale(locale), { weekday: 'short', month: 'short', day: 'numeric' });

type WeekInfo = { placement: string; crewName: string; priceCents: number | null };

function Section({ t, locale, title, rows, showDate, muted, tone, week }: { t: T; locale: Locale; title: string; rows: Row[]; showDate?: boolean; muted?: boolean; tone?: 'warn'; week?: Map<string, WeekInfo> }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-2.5 flex items-baseline gap-2 px-1 font-tc-display text-[17px] font-bold tracking-[-0.01em] ${tone === 'warn' ? 'text-amber-800' : 'text-tc-900'}`}>
        {title}
        <span className="text-[14px] font-semibold tabular-nums text-tc-500">{rows.length}</span>
      </h2>
      <ul className={`divide-y divide-tc-200 overflow-hidden rounded-2xl border bg-white ${tone === 'warn' ? 'border-amber-200' : 'border-tc-200'}`}>
        {rows.map((row) => {
          const { job, booking, client, service } = row;
          const [startTime] = formatSlotLabel(booking.slotStart, booking.slotEnd, locale).split(' – ');
          const [clock, ampm] = [startTime.replace(/\s*(AM|PM|a\. m\.|p\. m\.)$/, ''), (startTime.match(/(AM|PM|a\. m\.|p\. m\.)$/) ?? [''])[0]];
          const state = rowState(row, tone === 'warn');
          const info = week?.get(job.id);
          return (
            <li key={job.id}>
              <Link
                href={`/crew/jobs/${job.id}`}
                className={`flex min-h-[76px] items-center gap-3 px-4 py-3 transition-colors hover:bg-tc-50 active:bg-tc-100 ${muted ? 'text-tc-500' : ''}`}
              >
                <span className="w-[58px] shrink-0 text-center">
                  <span className={`block font-tc-display text-[18px] font-extrabold tabular-nums leading-none tracking-[-0.02em] ${muted ? 'text-tc-500' : 'text-tc-900'}`}>{clock}</span>
                  <span className="mt-1 block text-[11px] font-semibold text-tc-500">{ampm}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-semibold ${muted ? 'text-tc-700' : 'text-tc-900'}`}>{client?.name}</span>
                  <span className="block truncate text-[13px] text-tc-500">
                    {showDate || tone === 'warn' ? `${shortDay(booking.slotStart.slice(0, 10), locale)} · ` : ''}
                    {service ? (SERVICE_LABELS[service.key] ? serviceLabel(service.key, locale) : service.name) : t('serviceFallback')}
                  </span>
                  {info && (
                    <span className="mt-0.5 block truncate text-[12px] text-tc-500">
                      {info.placement === 'Lead' ? t('dashLead') : t('dashTeam')} · {info.crewName}
                      {info.priceCents != null ? ` · ${formatMoney(info.priceCents)}` : ''}
                    </span>
                  )}
                </span>
                {/* A future job that hasn't started needs no badge; anything else says where it stands. */}
                {state === 'PENDING' ? <Chevron /> : <CrewStatus state={state} label={stateLabel(t, state)} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
