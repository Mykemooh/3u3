'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { formsMessages } from '@/lib/i18n/messages/forms';

type Country = { code: string; dial: string; label: string };

// NANP countries share the +1 dial code, and lib/sms.ts's toE164() already
// treats any 10-digit (or 11-digit, leading 1) number as sendable — so
// Canada is a real, working option here, not a cosmetic one. Anything
// outside NANP isn't wired up to SMS yet (see toE164's doc comment), so
// this stays a short, honest list rather than a full country picker.
const COUNTRIES: Country[] = [
  { code: 'US', dial: '+1', label: 'United States' },
  { code: 'CA', dial: '+1', label: 'Canada' },
];

function splitPhone(value: string): { countryCode: string; national: string } {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  const national =
    digits.length === 11 && digits.startsWith('1')
      ? trimmed.replace(/^\+?1[\s-]*/, '')
      : trimmed.replace(/^\+1\s*/, '');
  return { countryCode: 'US', national };
}

/**
 * A phone field with a country-code selector in front of it (default:
 * United States). Composes back into the same plain "+1 (281) 555-0100"
 * string the rest of the app already stores and sends to the API —
 * callers don't need to change their state shape or submit payload.
 */
export default function PhoneInput({
  value,
  onChange,
  required,
  id,
  placeholder = '(281) 555-0100',
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const t = useT(formsMessages);
  const [{ countryCode, national }, setParts] = useState(() => splitPhone(value));

  function emit(nextCountryCode: string, nextNational: string) {
    const dial = COUNTRIES.find((c) => c.code === nextCountryCode)?.dial ?? '+1';
    const trimmed = nextNational.trim();
    onChange(trimmed ? `${dial} ${trimmed}` : '');
  }

  return (
    <div className="flex gap-2">
      <select
        className="input w-[6.5rem] shrink-0 px-2"
        value={countryCode}
        onChange={(e) => {
          setParts({ countryCode: e.target.value, national });
          emit(e.target.value, national);
        }}
        aria-label={t('country')}
        title={t('country')}
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.dial} {c.code}
          </option>
        ))}
      </select>
      <input
        id={id}
        className="input flex-1"
        type="tel"
        inputMode="tel"
        value={national}
        onChange={(e) => {
          setParts({ countryCode, national: e.target.value });
          emit(countryCode, e.target.value);
        }}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}
