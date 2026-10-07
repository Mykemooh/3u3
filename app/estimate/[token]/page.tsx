import { notFound } from 'next/navigation';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import { getEstimateByToken } from '@/lib/estimates';
import { formatMoney } from '@/lib/data';
import EstimateResponse from '@/components/EstimateResponse';
import { parsePricing } from '@/lib/pricingGuides';
import { cookies } from 'next/headers';
import { getLocale } from '@/lib/i18n/server';
import { translator, intlLocale, isLocale, LOCALE_COOKIE, type Locale } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { serviceName as serviceLabel } from '@/lib/format';
import LanguageToggle from '@/components/i18n/LanguageToggle';
import LocaleProvider from '@/components/i18n/LocaleProvider';

// Reads a live estimate by token — never prerender or cache this.
export const dynamic = 'force-dynamic';

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: { token: string };
  // The emailed Approve / Decline buttons are plain links carrying
  // ?respond=approve|decline, since many email clients strip <form>s.
  searchParams: { respond?: string };
}) {
  const data = await getEstimateByToken(params.token);
  if (!data) notFound();
  const { quote, items, client, service, address } = data;
  const pricing = parsePricing(quote.pricingJson);
  // The toggle wins; otherwise the client's own saved language (this page is
  // usually opened signed out, from their email), then the browser's.
  const cookie = cookies().get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookie) ? cookie : isLocale(client?.locale) ? client!.locale as Locale : await getLocale();
  const t = translator(accountMessages, locale);

  const expired = quote.status === 'EXPIRED' || (!!quote.expiresAt && quote.expiresAt.getTime() < Date.now());
  const intent =
    searchParams.respond === 'approve' ? 'APPROVE' : searchParams.respond === 'decline' ? 'DECLINE' : undefined;

  return (
    <LocaleProvider locale={locale}>
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between gap-4 bg-ink px-6 py-4">
        <Logo variant="light" size="sm" />
        <LanguageToggle tone="dark" />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <div className="card">
          <p className="text-sm font-semibold uppercase tracking-widest text-bronze">{t('estYour')}</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{service ? serviceLabel(service.key, service.name, locale) : t('serviceFallback')}</h1>
          <p className="text-slate">
            {t('estPreparedFor', { name: client?.name ?? '' })}
            {address ? ` · ${address.line1}, ${address.city}` : ''}
          </p>

          <table className="mt-6 w-full text-sm">
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-2">{item.description}</td>
                  <td className="py-2 text-right">{formatMoney(item.amountCents)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-3 text-lg font-bold">{pricing?.kind === 'COMMERCIAL' && pricing.visitsPerWeek > 0 ? t('estMonthlyTotal') : t('total')}</td>
                <td className="py-3 text-right text-lg font-bold text-bronze">{formatMoney(quote.totalCents)}</td>
              </tr>
            </tbody>
          </table>

          {pricing?.kind === 'COMMERCIAL' && pricing.visitsPerWeek > 0 && (
            <p className="mt-3 text-sm text-slate">
              {t(pricing.visitsPerWeek === 1 ? 'estCommercialOne' : 'estCommercialMany', { count: pricing.visitsPerWeek, each: formatMoney(pricing.perVisitCents) })}
            </p>
          )}
          {pricing?.kind === 'POST_CONSTRUCTION' && pricing.phases.length > 1 && (
            <p className="mt-3 text-sm text-slate">
              {t('estPhases')}
            </p>
          )}

          {quote.notes && (
            <p className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-sm text-slate">{quote.notes}</p>
          )}

          <EstimateResponse
            token={params.token}
            initialStatus={quote.status}
            expired={expired}
            expiresAt={quote.expiresAt ? quote.expiresAt.toLocaleDateString(intlLocale(locale), { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : undefined}
            locale={locale}
            clientHasPassword={!!client?.passwordHash}
            clientPhone={client?.phone ?? undefined}
            autoRespond={intent}
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          {t('estQuestions')}
        </p>
      </main>

      <Footer />
    </div>
    </LocaleProvider>
  );
}
