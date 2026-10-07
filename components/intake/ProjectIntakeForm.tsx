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
import { useT } from '@/components/i18n/LocaleProvider';
import { formsMessages, type FormsKey } from '@/lib/i18n/messages/forms';

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
  const t = useT(formsMessages);
  /** lib/intake's options with their words from formsMessages (ids unchanged). */
  const opts = <K extends string>(prefix: string, list: readonly (readonly [K, string])[]) =>
    list.map(([k]) => [k, t(`${prefix}_${k}` as FormsKey)] as const);

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
        projectType: t('errProjectType'),
        squareFeet: t('errSquareFeet'),
        phases: t('errPhases'),
        businessName: t('errBusinessName'),
        facilityType: t('errFacilityType'),
        visitsPerWeek: t('errVisitsPerWeek'),
      };
      setError(msg[String(field)] ?? t('errGeneric'));
      return;
    }
    setError('');
    onDone(parsed.data);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={submit} className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-muted hover:text-ink">
        {t('back')}
      </button>
      {kind === 'POST_CONSTRUCTION' ? (
        <>
          <div>
            <h1 className="mb-1 text-xl font-bold">{t('pcTitle')}</h1>
            <p className="text-sm text-slate">{t('pcIntro')}</p>
          </div>
          <fieldset>
            <legend className="label">{t('pcProjectType')}</legend>
            <Chips options={opts('projectType', PROJECT_TYPES)} value={projectType} onChange={setProjectType} />
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">{t('squareFeet')}</span>
              <input className="input" inputMode="numeric" placeholder={t('pcSquareFeetPlaceholder')} value={squareFeet} onChange={(e) => setSquareFeet(e.target.value)} required />
            </label>
            <label>
              <span className="label">{t('pcStories')}</span>
              <input className="input" inputMode="numeric" placeholder="1" value={stories} onChange={(e) => setStories(e.target.value)} />
            </label>
          </div>
          <fieldset>
            <legend className="label">{t('pcPhases')}</legend>
            <div className="space-y-2">
              {POST_CON_PHASES.map((p) => {
                const on = phases.includes(p.key);
                return (
                  <label key={p.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${on ? 'border-gold bg-gold/5' : 'border-line'}`}>
                    <input type="checkbox" className="mt-1" checked={on} onChange={() => setPhases(on ? phases.filter((x) => x !== p.key) : [...phases, p.key])} />
                    <span>
                      <span className="block font-semibold">{t(`phase_${p.key}`)}</span>
                      <span className="text-sm text-slate">{t(`phase_${p.key}_detail`)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted">{t('pcPhasesHint')}</p>
          </fieldset>
          <label className="block">
            <span className="label">{t('pcReadyDate')}</span>
            <input type="date" className="input" min={today} value={readyDate} onChange={(e) => setReadyDate(e.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="label">{t('pcTrades')}</legend>
              <Chips options={[['YES', t('yes')], ['NO', t('no')]] as const} value={tradesOnSite} onChange={setTradesOnSite} />
            </fieldset>
            <fieldset>
              <legend className="label">{t('pcUtilities')}</legend>
              <Chips options={[['YES', t('yes')], ['NO', t('no')], ['NOT_SURE', t('notSure')]] as const} value={utilitiesOn} onChange={setUtilitiesOn} />
            </fieldset>
          </div>
          <fieldset>
            <legend className="label">{t('floorsLabel')}</legend>
            <Chips options={opts('floor', FLOOR_TYPES)} value={floors} onChange={setFloors} multi />
          </fieldset>
          <label className="block">
            <span className="label">{t('pcBuilder')}</span>
            <input className="input" value={builder} onChange={(e) => setBuilder(e.target.value)} />
          </label>
        </>
      ) : (
        <>
          <div>
            <h1 className="mb-1 text-xl font-bold">{t('cmTitle')}</h1>
            <p className="text-sm text-slate">{t('cmIntro')}</p>
          </div>
          <label className="block">
            <span className="label">{t('cmBusinessName')}</span>
            <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
          </label>
          <fieldset>
            <legend className="label">{t('cmFacilityType')}</legend>
            <Chips options={opts('facility', FACILITY_TYPES)} value={facilityType} onChange={setFacilityType} />
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">{t('squareFeet')}</span>
              <input className="input" inputMode="numeric" placeholder={t('cmSquareFeetPlaceholder')} value={squareFeet} onChange={(e) => setSquareFeet(e.target.value)} required />
            </label>
            <label>
              <span className="label">{t('cmRestrooms')}</span>
              <input className="input" inputMode="numeric" placeholder="2" value={restrooms} onChange={(e) => setRestrooms(e.target.value)} />
            </label>
          </div>
          <fieldset>
            <legend className="label">{t('cmHowOften')}</legend>
            <Chips
              options={[['0', t('cmVisits0')], ['1', t('cmVisits1')], ['2', t('cmVisits2')], ['3', t('cmVisits3')], ['5', t('cmVisits5')], ['7', t('cmVisits7')]] as const}
              value={visits}
              onChange={setVisits}
            />
          </fieldset>
          <fieldset>
            <legend className="label">{t('cmWhen')}</legend>
            <Chips options={opts('time', TIMES_OF_DAY)} value={timeOfDay} onChange={setTimeOfDay} />
          </fieldset>
          <fieldset>
            <legend className="label">{t('floorsLabel')}</legend>
            <Chips options={opts('floor', FLOOR_TYPES)} value={floors} onChange={setFloors} multi />
          </fieldset>
          <fieldset>
            <legend className="label">{t('cmExtras')}</legend>
            <Chips options={opts('extra', COMMERCIAL_EXTRAS)} value={extras} onChange={setExtras} multi />
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="label">{t('cmSupplies')}</legend>
              <Chips options={[['US', t('cmSuppliesUs')], ['CLIENT', t('cmSuppliesClient')], ['NOT_SURE', t('notSure')]] as const} value={suppliesBy} onChange={setSuppliesBy} />
            </fieldset>
            <label>
              <span className="label">{t('cmStartDate')}</span>
              <input type="date" className="input" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          </div>
        </>
      )}
      <label className="block">
        <span className="label">{t('siteContactLabel')}</span>
        <input className="input" placeholder={t('siteContactPlaceholder')} value={siteContact} onChange={(e) => setSiteContact(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">{t('notesLabel')}</span>
        <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full">
        {t('continueToWalkthrough')}
      </button>
    </form>
  );
}
