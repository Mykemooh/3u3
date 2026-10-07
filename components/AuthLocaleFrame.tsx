import LocaleProvider from '@/components/i18n/LocaleProvider';
import LanguageToggle from '@/components/i18n/LanguageToggle';
import { getLocale } from '@/lib/i18n/server';

/**
 * The language frame for the getting-in pages outside AppShell (/signin,
 * /forgot, /set-password, /mfa, /new): decides the request's language,
 * hands it to the client page below, and puts the EN | ES toggle in the
 * top-right corner. Used by each of those routes' layout.tsx.
 */
export default async function AuthLocaleFrame({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <LocaleProvider locale={locale}>
      <div className="relative" lang={locale}>
        <div className="absolute right-4 top-4 z-10">
          <LanguageToggle tone="light" />
        </div>
        {children}
      </div>
    </LocaleProvider>
  );
}
