import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getClientRatesFor, getServiceTypes, getTenant, formatMoney } from '@/lib/data';
import { serviceByKey, SERVICES } from '@/lib/services';
import { homeForRole } from '@/lib/nav';

/**
 * What the front page should offer depends entirely on who is looking.
 *
 *  - A signed-out visitor needs a quote, or a way back in.
 *  - A customer with agreed rates on file should not be asked to request a
 *    quote they already have — they get Book now, and can see at a glance
 *    which services are priced and which would need a fresh walkthrough.
 *  - A customer with no rates yet is mid-funnel: their walkthrough is the
 *    next step, not a booking.
 *  - Staff who wander onto the front page get a door back to their own
 *    screen rather than a sales pitch.
 *
 * Server-rendered, so the page is never briefly wrong before JavaScript
 * catches up — nobody sees "Get a quote" flash at a customer who has an
 * agreed price on file.
 */
export default async function WelcomeCta() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; role?: string } | undefined;

  if (!user?.role) return <SignedOut />;

  if (user.role === 'ADMIN' || user.role === 'CLEANER') {
    return (
      <Panel
        heading={`Welcome back, ${user.name?.split(' ')[0] ?? 'there'}.`}
        blurb="You're signed in as staff."
      >
        <Link href={homeForRole(user.role)} className="btn-primary w-full max-w-xs">
          {user.role === 'ADMIN' ? 'Go to your dashboard' : 'Go to your jobs'}
        </Link>
      </Panel>
    );
  }

  // A customer. Which services can they book right now, and which would
  // still need us to come out and price them?
  const tenant = await getTenant();
  const allServices = tenant ? await getServiceTypes(tenant.id) : [];
  const rates = user.id ? await getClientRatesFor(user.id) : [];
  const rateFor = (serviceTypeId: string) => rates.find((r) => r.serviceTypeId === serviceTypeId);

  const priced = allServices.filter((s) => rateFor(s.id));
  const unpriced = allServices.filter((s) => !rateFor(s.id));

  if (priced.length === 0) {
    return (
      <Panel
        heading={`Welcome back, ${user.name?.split(' ')[0] ?? 'there'}.`}
        blurb="Once we've walked your home and you've approved the estimate, booking opens up right here."
      >
        <Link href="/new" className="btn-primary w-full max-w-xs">
          Book a free walkthrough
        </Link>
      </Panel>
    );
  }

  return (
    <Panel
      heading={`Welcome back, ${user.name?.split(' ')[0] ?? 'there'}.`}
      blurb="Your agreed pricing is on file — pick a time whenever you're ready."
    >
      <Link href="/book" className="btn-primary w-full max-w-xs">
        Book now
      </Link>

      <div className="mt-8 w-full max-w-lg text-left">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Your pricing</p>
        <ul className="space-y-1.5">
          {priced.map((s) => {
            const content = serviceByKey(s.key);
            return (
              <li key={s.id} className="flex items-center justify-between border-b border-line py-2 text-sm">
                <Link
                  href={content ? `/services/${content.slug}` : '/services'}
                  className="font-medium text-ink hover:text-bronze"
                >
                  {s.name}
                </Link>
                <span className="font-semibold text-bronze">{formatMoney(rateFor(s.id)!.rateCents)}</span>
              </li>
            );
          })}
        </ul>

        {unpriced.length > 0 && (
          <>
            <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
              Want something else?
            </p>
            <p className="mb-3 text-sm text-slate">
              We haven't priced these for your home yet — a short walkthrough sorts that out.
            </p>
            <ul className="space-y-1.5">
              {unpriced.map((s) => {
                const content = serviceByKey(s.key);
                return (
                  <li key={s.id} className="flex items-center justify-between border-b border-line py-2 text-sm">
                    <Link
                      href={content ? `/services/${content.slug}` : '/services'}
                      className="font-medium text-ink hover:text-bronze"
                    >
                      {s.name}
                    </Link>
                    <Link href="/new" className="font-semibold text-bronze hover:underline">
                      Get it priced →
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}

function SignedOut() {
  return (
    <Panel
      heading="Ready when you are."
      blurb="A real person comes out, looks at your home, and gives you an exact price on the spot. No obligation, nothing to pay up front."
    >
      <Link href="/new" className="btn-primary w-full max-w-xs">
        Get a free quote
      </Link>
      <Link href="/signin" className="mt-4 text-sm font-semibold text-bronze hover:underline">
        Already a customer? Sign in
      </Link>
      <p className="mt-6 max-w-sm text-xs text-muted">
        Serving Katy and the surrounding Houston area.{' '}
        <Link href="/services" className="underline hover:text-bronze">
          See everything we clean
        </Link>
        .
      </p>
    </Panel>
  );
}

function Panel({
  heading,
  blurb,
  children,
}: {
  heading: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-2xl font-bold text-ink md:text-3xl">{heading}</h2>
      <p className="mt-3 max-w-md text-slate">{blurb}</p>
      <div className="mt-8 flex w-full flex-col items-center">{children}</div>
    </div>
  );
}

/** Used by the landing page to list the four services as cards. */
export const SERVICE_CARDS = SERVICES;
