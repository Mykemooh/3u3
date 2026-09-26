'use client';

import { useState } from 'react';
import type { ServiceContent } from '@/lib/services';

/**
 * One service, collapsed to just its name and one blue statement by
 * default — the full room-by-room breakdown only shows once someone
 * actually asks for it, right in place rather than a separate page.
 */
export default function ServiceAccordion({ service }: { service: ServiceContent }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card">
      <h2 className="h3">{service.name}</h2>
      <p className="mt-1.5 font-semibold text-gold">{service.tagline}</p>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-4 text-sm font-semibold text-bronze underline underline-offset-2 hover:text-ink"
      >
        {open ? 'Hide details' : "See what's included"}
      </button>

      {open && (
        <div className="mt-5 space-y-5 border-t border-line pt-5 text-left">
          <p className="body">{service.summary}</p>
          <p className="meta">
            {service.cadence} · {service.typicalLength}
          </p>

          <div className="space-y-4">
            {service.includes.map((group) => (
              <div key={group.area}>
                <p className="font-semibold text-ink">{group.area}</p>
                <ul className="mt-1.5 space-y-1">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-slate">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div>
            <p className="font-semibold text-ink">Not included</p>
            <ul className="mt-1.5 space-y-1">
              {service.notIncluded.map((item) => (
                <li key={item} className="text-sm text-muted">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
