import { enforceMfa, type SessionUser } from '@/lib/sessionUser';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getTenant, getServiceTypes, getClientRatesFor, formatMoney } from '@/lib/data';
import BookWizard from '@/components/BookWizard';
import CompanyBrandFrame from '@/components/brand/CompanyBrandFrame';
import AccessNotice from '@/components/AccessNotice';
import { homeForRole } from '@/lib/nav';
import { HIDDEN_SERVICE_KEYS } from '@/lib/services';
import { getAddOnsForClient } from '@/lib/addons';
import LocaleProvider from '@/components/i18n/LocaleProvider';
import LanguageToggle from '@/components/i18n/LanguageToggle';
import { getLocale } from '@/lib/i18n/server';

// Reads the signed-in customer's session and live rate/service data —
// never statically cacheable.
export const dynamic = 'force-dynamic';

export default async function BookPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin?next=/book');
  const role = (session.user as any).role;
  // Staff landing here get sent to their own screen. Bouncing them to the
  // sign-in form looks like a rejected password and explains nothing.
  if (role !== 'CUSTOMER') redirect(`${homeForRole(role)}?denied=1`);
  enforceMfa(session.user as unknown as SessionUser, '/book');

  const tenant = await getTenant();
  if (!tenant) redirect('/');

  const services = await getServiceTypes(tenant.id);
  const rates = await getClientRatesFor((session.user as any).id);
  const addOns = await getAddOnsForClient(tenant.id, (session.user as any).id);

  const eligibleServices = services
    .filter((s) => !HIDDEN_SERVICE_KEYS.includes(s.key))
    .map((s) => ({
      ...s,
      rateCents: rates.find((r) => r.serviceTypeId === s.id)?.rateCents ?? null,
      rateLabel: formatMoney(rates.find((r) => r.serviceTypeId === s.id)?.rateCents),
    }))
    .filter((s) => s.rateCents != null);

  const locale = await getLocale();

  // /book sits outside AppShell, so it hands down its own language and
  // carries its own EN | ES toggle (top-right, above the wizard's logo).
  return (
    <LocaleProvider locale={locale}>
      <CompanyBrandFrame>
      <div className="relative" lang={locale}>
        <div className="absolute right-4 top-4 z-10">
          <LanguageToggle tone="light" />
        </div>
        <div className="mx-auto max-w-xl px-6 pt-6">
          <AccessNotice />
        </div>
        <BookWizard
          customerName={(session.user as any).name ?? ''}
          services={eligibleServices}
          addOns={addOns}
        />
      </div>
      </CompanyBrandFrame>
    </LocaleProvider>
  );
}
