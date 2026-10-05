'use client';

import { useState } from 'react';
import {
  POST_CON_PHASES,
  PROJECT_TYPES,
  FLOOR_TYPES,
  FACILITY_TYPES,
  TIMES_OF_DAY,
  COMMERCIAL_EXTRAS,
  intakeSchema,
  type Intake,
} from '@/lib/intake';

type Kind = 'POST_CONSTRUCTION' | 'COMMERCIAL';

function Chips<T extends string>({ options, value, onChange, multi }: { options: readonly (readonly [T, string])[]; value: T[]; onChange: (v: T[]) => void; multi?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([k, label]) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((v) => v !== k) : [...value, k]) : [k])}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${on ? 'border-gold bg-gold/10 text-ink' : 'border-line text-slate hover:border-gold'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/[^\d]/g, '')));

/**
 * The extra questions a post-construction or commercial lead answers
 * before picking a walkthrough time (lib/intake.ts). Short on purpose:
 * only what changes the price or the plan.
 */
export default function ProjectIntakeForm({ kind, initial, onDone, onBack }: { kind: Kind; initial: Intake | null; onDone: (intake: Intake) => void; onBack: () => void }) {
  const pc = initial?.kind === 'POST_CONSTRUCTION' ? initial : null;
  const cm = initial?.kind === 'COMMERCIAL' ? initial : null;
  const [projectType, setProjectType] = useState<string[]>(pc ? [pc.projectType] : []);
  const [squareFeet, setSquareFeet] = useState(String((pc ?? cm)?.squareFeet ?? ''));
  const [stories, setStories] = useState(String(pc?.stories ?? ''));
  const [phases, setPhases] = useState<string[]>(pc?.phases ?? ['FINAL']);
  const [readyDate, setReadyDate] = useState(pc?.readyDate ?? '');
  const [tradesOnSite, setTradesOnSite] = useState<string[]>(pc?.tradesOnSite == null ? [] : [pc.tradesOnSite ? 'YES' : 'NO']);
  const [utilitiesOn, setUtilitiesOn] = useState<string[]>(pc?.utilitiesOn ? [pc.utilitiesOn] : []);
  const [floors, setFloors] = useState<string[]>((pc ?? cm)?.floors ?? []);
  const [builder, setBuilder] = useState(pc?.builder ?? '');
  const [businessName, setBusinessName] = useState(cm?.businessName ?? '');
  const [facilityType, setFacilityType] = useState<string[]>(cm ? [cm.facilityType] : []);
  const [restrooms, setRestrooms] = useState(String(cm?.restrooms ?? ''));
  const [visits, setVisits] = useState<string[]>(cm ? [String(cm.visitsPerWeek)] : []);
  const [timeOfDay, setTimeOfDay] = useState<string[]>(cm?.timeOfDay ? [cm.timeOfDay] : []);
  const [extras, setExtras] = useState<string[]>(cm?.extras ?? []);
  const [suppliesBy, setSuppliesBy] = useState<string[]>(cm?.suppliesBy ? [cm.suppliesBy] : []);
  const [startDate, setStartDate] = useState(cm?.startDate ?? '');
  const [siteContact, setSiteContact] = useState((pc ?? cm)?.siteContact ?? '');
  const [notes, setNotes] = useState((pc ?? cm)?.notes ?? '');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const base = { squareFeet: num(squareFeet), floors, siteContact, notes };
    const candidate =
      kind === 'POST_CONSTRUCTION'
        ? {
            kind,
            ...base,
            projectType: projectType[0],
            stories: num(stories),
            phases,
            readyDate: readyDate || undefined,
            tradesOnSite: tradesOnSite[0] ? tradesOnSite[0] === 'YES' : undefined,
            utilitiesOn: utilitiesOn[0],
            builder,
          }
        : {
            kind,
            ...base,
            businessName,
            facilityType: facilityType[0],
            restrooms: num(restrooms),
            visitsPerWeek: visits[0] != null ? Number(visits[0]) : undefined,
            timeOfDay: timeOfDay[0],
            extras,
            suppliesBy: suppliesBy[0],
            startDate: startDate || undefined,
          };
    const parsed = intakeSchema.safeParse(candidate);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      const msg: Record<string, string> = {
        projectType: 'Pick the kind of project.',
        squareFeet: 'Add the square footage — a rough number is fine (200 or more).',
        phases: 'Pick at least one phase.',
        businessName: 'Add the business name.',
        facilityType: 'Pick the kind of space.',
        visitsPerWeek: 'Pick how often you need cleaning.',
      };
      setError(msg[String(field)] ?? 'Please check the highlighted answers.');
      return;
    }
    setError('');
    onDone(parsed.data);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={submit} className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-muted hover:text-ink">
        ← Back
      </button>
      {kind === 'POST_CONSTRUCTION' ? (
        <>
          <div>
            <h1 className="mb-1 text-xl font-bold">About the project</h1>
            <p className="text-sm text-slate">A few details so the walkthrough is about confirming, not starting from scratch.</p>
          </div>
          <fieldset>
            <legend className="label">What kind of project?</legend>
            <Chips options={PROJECT_TYPES} value={projectType} onChange={setProjectType} />
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">Square feet</span>
              <input className="input" inputMode="numeric" placeholder="e.g. 2,400" value={squareFeet} onChange={(e) => setSquareFeet(e.target.value)} required />
            </label>
            <label>
              <span className="label">Stories</span>
              <input className="input" inputMode="numeric" placeholder="1" value={stories} onChange={(e) => setStories(e.target.value)} />
            </label>
          </div>
          <fieldset>
            <legend className="label">Which cleans do you need?</legend>
            <div className="space-y-2">
              {POST_CON_PHASES.map((p) => {
                const on = phases.includes(p.key);
                return (
                  <label key={p.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${on ? 'border-gold bg-gold/5' : 'border-line'}`}>
                    <input type="checkbox" className="mt-1" checked={on} onChange={() => setPhases(on ? phases.filter((x) => x !== p.key) : [...phases, p.key])} />
                    <span>
                      <span className="block font-semibold">{p.label}</span>
                      <span className="text-sm text-slate">{p.detail}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted">Not sure? Pick Final — we’ll tell you at the walkthrough if a rough clean would help.</p>
          </fieldset>
          <label className="block">
            <span className="label">When will the site be ready for cleaning?</span>
            <input type="date" className="input" min={today} value={readyDate} onChange={(e) => setReadyDate(e.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="label">Trades still working then?</legend>
              <Chips options={[['YES', 'Yes'], ['NO', 'No']] as const} value={tradesOnSite} onChange={setTradesOnSite} />
            </fieldset>
            <fieldset>
              <legend className="label">Power and water on?</legend>
              <Chips options={[['YES', 'Yes'], ['NO', 'No'], ['NOT_SURE', 'Not sure']] as const} value={utilitiesOn} onChange={setUtilitiesOn} />
            </fieldset>
          </div>
          <fieldset>
            <legend className="label">Floors (pick any)</legend>
            <Chips options={FLOOR_TYPES} value={floors} onChange={setFloors} multi />
          </fieldset>
          <label className="block">
            <span className="label">Builder or contractor (optional)</span>
            <input className="input" value={builder} onChange={(e) => setBuilder(e.target.value)} />
          </label>
        </>
      ) : (
        <>
          <div>
            <h1 className="mb-1 text-xl font-bold">About your space</h1>
            <p className="text-sm text-slate">So we come to the walkthrough with the right plan — and the right crew size.</p>
          </div>
          <label className="block">
            <span className="label">Business name</span>
            <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
          </label>
          <fieldset>
            <legend className="label">What kind of space?</legend>
            <Chips options={FACILITY_TYPES} value={facilityType} onChange={setFacilityType} />
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">Square feet</span>
              <input className="input" inputMode="numeric" placeholder="e.g. 6,000" value={squareFeet} onChange={(e) => setSquareFeet(e.target.value)} required />
            </label>
            <label>
              <span className="label">Restrooms</span>
              <input className="input" inputMode="numeric" placeholder="2" value={restrooms} onChange={(e) => setRestrooms(e.target.value)} />
            </label>
          </div>
          <fieldset>
            <legend className="label">How often?</legend>
            <Chips
              options={[['0', 'One time'], ['1', 'Once a week'], ['2', '2× a week'], ['3', '3× a week'], ['5', 'Every weekday'], ['7', 'Every day']] as const}
              value={visits}
              onChange={setVisits}
            />
          </fieldset>
          <fieldset>
            <legend className="label">When should we clean?</legend>
            <Chips options={TIMES_OF_DAY} value={timeOfDay} onChange={setTimeOfDay} />
          </fieldset>
          <fieldset>
            <legend className="label">Floors (pick any)</legend>
            <Chips options={FLOOR_TYPES} value={floors} onChange={setFloors} multi />
          </fieldset>
          <fieldset>
            <legend className="label">Also needs (pick any)</legend>
            <Chips options={COMMERCIAL_EXTRAS} value={extras} onChange={setExtras} multi />
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="label">Restroom paper and soap</legend>
              <Chips options={[['US', 'You supply'], ['CLIENT', 'We supply'], ['NOT_SURE', 'Not sure']] as const} value={suppliesBy} onChange={setSuppliesBy} />
            </fieldset>
            <label>
              <span className="label">Ideal start date</span>
              <input type="date" className="input" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          </div>
        </>
      )}
      <label className="block">
        <span className="label">Who should we meet on site? (optional)</span>
        <input className="input" placeholder="Name and phone" value={siteContact} onChange={(e) => setSiteContact(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">Anything else we should know? (optional)</span>
        <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full">
        Continue to pick a walkthrough time
      </button>
    </form>
  );
}
