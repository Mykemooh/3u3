'use client';

import { createContext, useContext } from 'react';
import type { CompanyBrand } from '@/lib/brand';

const BrandContext = createContext<CompanyBrand | null>(null);

/**
 * Hands the company's brand (lib/brand.ts) to client components below —
 * chiefly <Logo>, so a company's own clients see its mark, not 3U3's.
 * Outside a provider everything renders the house brand, as before.
 */
export default function CompanyBrandProvider({ brand, children }: { brand: CompanyBrand; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useCompanyBrand(): CompanyBrand | null {
  return useContext(BrandContext);
}
