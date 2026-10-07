import CompanyBrandProvider from '@/components/brand/CompanyBrandProvider';
import { getTenant } from '@/lib/data';
import { companyBrand, type CompanyBrand } from '@/lib/brand';

/** The brand tokens re-pointed at a company's colours, page-wide (so Tex and anything portalled follow too). */
export function BrandVars({ brand }: { brand: CompanyBrand }) {
  if (!brand.vars) return null;
  // Values come from lib/brand.ts as numbers and rgba() built from parsed hex — never raw input.
  const css = `:root{${Object.entries(brand.vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {/* Marks the page as another company's, which hides 3U3's watermark (app/globals.css). */}
      <span className="portal-company hidden" aria-hidden="true" />
    </>
  );
}

/**
 * The company's brand for pages its clients see outside AppShell — booking
 * and the sign-in screens: its colours (lib/brand.ts) and, through
 * CompanyBrandProvider, its logo in place of 3U3's.
 */
export default async function CompanyBrandFrame({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  const brand = companyBrand(tenant ?? { name: 'Your cleaning company' });
  return (
    <CompanyBrandProvider brand={brand}>
      <BrandVars brand={brand} />
      {children}
    </CompanyBrandProvider>
  );
}
