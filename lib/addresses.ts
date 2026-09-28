import { z } from 'zod';

/**
 * An address chosen from the Mapbox suggestions (components/AddressInput),
 * already split into parts. Forms send it alongside the typed line; when
 * it's missing (no Mapbox, or "use what I typed"), the typed text is saved
 * as line1 and city/state fall back to the column defaults.
 */
export const pickedAddressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(50),
  zip: z.string().trim().min(3).max(12),
});

export function addressFields(picked: z.infer<typeof pickedAddressSchema> | undefined, typed: string) {
  return picked ? { line1: picked.line1, city: picked.city, state: picked.state, zip: picked.zip } : { line1: typed };
}
