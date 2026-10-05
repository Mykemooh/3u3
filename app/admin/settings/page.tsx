import { db } from '@/db/client';
import { crews } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTenant } from '@/lib/data';
import { getPayrollSettings } from '@/lib/payroll';
import TenantSettingsForm from '@/components/admin/TenantSettingsForm';
import ServiceAreaForm from '@/components/admin/ServiceAreaForm';
import CompanySettingsForm from '@/components/admin/CompanySettingsForm';
import { appUrl } from '@/lib/url';
import { isStripeConfigured } from '@/lib/stripe';

export default async function AdminSettings() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const settings = await getPayrollSettings(tenant.id);
  const crewRows = await db.select().from(crews).where(eq(crews.tenantId, tenant.id));
  const hasCrewHomeBase = crewRows.some((c) => c.homeAddressLine1 && c.homeCity && c.homeState);

  const initial = {
    name: tenant.name,
    tagline: tenant.tagline ?? '',
    payrollFrequency: tenant.payrollFrequency,
    payrollAnchorDate: tenant.payrollAnchorDate ?? '',
    smsNumber: tenant.smsNumber ?? '',
    ownerPhone: tenant.ownerPhone ?? '',
    texSmsAutoReply: tenant.texSmsAutoReply,
    texVoiceEnabled: tenant.texVoiceEnabled,
    googleReviewUrl: tenant.googleReviewUrl ?? '',
    referralCreditDollars: String(tenant.referralCreditCents / 100),
    winbackDays: tenant.winbackDays,
    mfaRequiredForCrew: tenant.mfaRequiredForCrew,
  };
  const bookingLink = appUrl('/new');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Settings</h1>
        <p className="text-slate">Behaviors you control directly, rather than the app deciding for you.</p>
      </div>

      <div className="card max-w-2xl">
        <h2 className="mb-3 font-semibold text-ink">Company</h2>
        <CompanySettingsForm section="profile" initial={initial} />
      </div>

      <div id="booking-link" className="card max-w-2xl">
        <h2 className="mb-1 font-semibold text-ink">Booking link</h2>
        <p className="mb-3 text-sm text-slate">Put this on your website, Google profile and social pages. New clients book a free walkthrough from it.</p>
        <p className="rounded-xl bg-surface px-4 py-3 font-mono text-sm text-ink">{bookingLink}</p>
      </div>

      <div id="payments" className="card max-w-2xl">
        <h2 className="mb-1 font-semibold text-ink">Payments</h2>
        <p className="text-sm text-slate">
          {isStripeConfigured()
            ? 'Online payments are on. Clients pay from their invoice or portal; tips go to the crew through payroll.'
            : 'Online payments are off until Stripe keys are added (Vercel → Settings → Environment Variables: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).'}
        </p>
      </div>

      <div className="card max-w-2xl">
        <h2 className="mb-3 font-semibold text-ink">Payroll calendar</h2>
        <CompanySettingsForm section="payroll" initial={initial} />
      </div>

      <div id="texting" className="card max-w-2xl scroll-mt-24">
        <h2 className="mb-1 font-semibold text-ink">Texting and Tex</h2>
        <p className="mb-3 text-sm text-slate">Two-way texts with clients come from this number. Tex answers from your help articles and hands off to you when it should.</p>
        <CompanySettingsForm section="texting" initial={initial} />
      </div>

      <div id="growth" className="card max-w-2xl scroll-mt-24">
        <h2 className="mb-3 font-semibold text-ink">Reviews and referrals</h2>
        <CompanySettingsForm section="growth" initial={initial} />
      </div>

      <div className="card max-w-2xl">
        <h2 className="mb-3 font-semibold text-ink">Sign-in security</h2>
        <CompanySettingsForm section="security" initial={initial} />
      </div>

      <div className="card max-w-2xl">
        <h2 className="mb-1 font-semibold text-ink">Service area</h2>
        <ServiceAreaForm initialRadiusMiles={tenant.serviceAreaRadiusMiles} hasCrewHomeBase={hasCrewHomeBase} />
      </div>

      <div className="card max-w-2xl">
        <h2 className="mb-1 font-semibold text-ink">Payroll rules</h2>
        <TenantSettingsForm initial={settings} />
      </div>
    </div>
  );
}
