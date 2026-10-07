'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { formsMessages } from '@/lib/i18n/messages/forms';

export type PickedAddress = { line1: string; city: string; state: string; zip: string };

// Inlined at build time from MAPBOX_ACCESS_TOKEN (next.config.js), so no
// second variable is needed. It's the same public pk.… token the live map uses.
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

type Suggestion = PickedAddress & { id: string; label: string; source: 'searchbox' | 'geocode' };

const SEARCH = 'https://api.mapbox.com/search/searchbox/v1';

/** One Search Box session per typing-to-pick (billed per session, not per keystroke). */
function newSessionToken() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Address field with real-address suggestions (Mapbox Search Box:
 * suggest while typing, retrieve on pick, one session token per pick so
 * it's billed per session rather than per keystroke) — so what we save is
 * an address that exists, split into street / city / state / ZIP, and the
 * live "crew on the way" map can always find it. Suggestions are biased
 * towards the visitor's own area (proximity=ip), not a hardcoded city.
 * If Search Box isn't available on the token, it falls back to Mapbox
 * geocoding's autocomplete mode. Coordinates from either are never kept.
 *
 * `value` is what's typed; `picked` is set only when a suggestion is
 * chosen, and cleared again on any edit. If Mapbox isn't configured or
 * can't be reached, it behaves as a plain text field.
 */
export default function AddressInput({
  id,
  value,
  onChange,
  picked,
  onPick,
  placeholder,
  required,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  picked: PickedAddress | null;
  onPick: (address: PickedAddress | null) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const t = useT(formsMessages);
  const listId = useId();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const session = useRef(newSessionToken());
  const searchBoxOff = useRef(false);

  useEffect(() => {
    const q = value.trim();
    if (!TOKEN || picked || q.length < 4) {
      setSuggestions([]);
      return;
    }
    const n = ++request.current;
    const timer = setTimeout(async () => {
      try {
        let list: Suggestion[] | null = null;
        if (!searchBoxOff.current) {
          const res = await fetch(
            `${SEARCH}/suggest?q=${encodeURIComponent(q)}&types=address&country=us&language=en&proximity=ip&limit=5&session_token=${session.current}&access_token=${TOKEN}`,
          );
          if (res.ok) list = ((await res.json()).suggestions ?? []).map(fromSearchBox).filter(Boolean) as Suggestion[];
          else if (res.status === 401 || res.status === 403) searchBoxOff.current = true; // token without Search Box: use geocoding
          else throw new Error(String(res.status));
        }
        if (!list) {
          const res = await fetch(
            `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&autocomplete=true&types=address&country=us&proximity=ip&limit=5&access_token=${TOKEN}`,
          );
          if (!res.ok) throw new Error(String(res.status));
          list = ((await res.json()).features ?? []).map(toSuggestion).filter(Boolean) as Suggestion[];
        }
        if (n !== request.current) return; // a newer keystroke won
        setSuggestions(list);
        setActive(-1);
        setOpen(true);
        setFailed(false);
      } catch (err) {
        console.error('[address] suggestions failed:', err);
        if (n === request.current) setFailed(true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value, picked]);

  async function choose(s: Suggestion) {
    onChange(s.label);
    onPick({ line1: s.line1, city: s.city, state: s.state, zip: s.zip });
    setOpen(false);
    setSuggestions([]);
    if (s.source === 'searchbox') {
      // Retrieve closes the billing session and confirms the parts; the
      // coordinates it returns are dropped.
      const token = session.current;
      session.current = newSessionToken();
      try {
        const res = await fetch(`${SEARCH}/retrieve/${encodeURIComponent(s.id)}?session_token=${token}&access_token=${TOKEN}`);
        if (!res.ok) return;
        const full = fromSearchBox((await res.json()).features?.[0]?.properties);
        if (full) {
          onChange(full.label);
          onPick({ line1: full.line1, city: full.city, state: full.state, zip: full.zip });
        }
      } catch {
        // The suggestion's own parts are already saved.
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        id={id}
        className="input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (picked) onPick(null);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        required={required}
        autoComplete="street-address"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-card-lg">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              className={`cursor-pointer px-4 py-3 text-sm ${i === active ? 'bg-cream' : 'hover:bg-surface'}`}
            >
              <span className="font-semibold text-ink">{s.line1}</span>
              <span className="text-slate">
                {' '}
                · {s.city}, {s.state} {s.zip}
              </span>
            </li>
          ))}
        </ul>
      )}
      {TOKEN && !failed && !picked && value.trim().length >= 4 && !showList && (
        <p className="mt-1 text-xs text-muted">{t('addressPickHint')}</p>
      )}
      {picked && <p className="mt-1 text-xs font-semibold text-green">{t('addressFound')}</p>}
    </div>
  );
}

/** Mapbox v6 feature → our address fields. Skips anything without a street and ZIP. */
function toSuggestion(f: any): Suggestion | null {
  const c = f?.properties?.context ?? {};
  const line1 = f?.properties?.name;
  const city = c.place?.name ?? c.locality?.name;
  const state = c.region?.region_code ?? c.region?.name;
  const zip = c.postcode?.name;
  if (!line1 || !city || !state || !zip) return null;
  return {
    id: f.properties.mapbox_id ?? f.id ?? `${line1}${zip}`,
    label: `${line1}, ${city}, ${state} ${zip}`,
    line1,
    city,
    state,
    zip,
    source: 'geocode',
  };
}

/** Mapbox Search Box suggestion (or retrieved feature's properties) → our address fields. */
export function fromSearchBox(p: any): Suggestion | null {
  const c = p?.context ?? {};
  const line1 = c.address?.name ?? p?.address ?? p?.name;
  const city = c.place?.name ?? c.locality?.name;
  const state = c.region?.region_code ?? c.region?.name;
  const zip = c.postcode?.name;
  if (!p?.mapbox_id || !line1 || !city || !state || !zip) return null;
  return { id: p.mapbox_id, label: `${line1}, ${city}, ${state} ${zip}`, line1, city, state, zip, source: 'searchbox' };
}
