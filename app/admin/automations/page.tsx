import { getTenant } from '@/lib/data';
import { AUTOMATIONS, automationStates } from '@/lib/automations';
import { smsConfigured } from '@/lib/sms';
import AutomationsManager from '@/components/admin/AutomationsManager';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const states = await automationStates(tenant.id);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Reminders &amp; follow-ups</h2>
        <p className="max-w-2xl text-slate">
          Turn each message on or off, choose when it goes, and say it your way. Timed messages go out in the morning run
          (around 8am); “on the way” and “all done” go the moment the crew taps the button.
        </p>
      </div>
      <AutomationsManager
        defs={AUTOMATIONS.map((d) => ({ ...d }))}
        states={states}
        company={tenant.name}
        textingReady={smsConfigured()}
      />
    </div>
  );
}
