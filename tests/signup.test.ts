import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './helpers/fixtures';
import { setSignupOpen, startSignup, verifySignupCode, completeSignup, joinWaitlist, SignupError, signupIsOpen } from '@/lib/signup';
import { checkHealth, recordHeartbeat } from '@/lib/health';
import { connectRouting } from '@/lib/connect';
import { setupSteps } from '@/lib/setupGuide';
import { tenants, users, serviceTypes } from '@/db/schema';
import { eq } from 'drizzle-orm';

const answers = { services: ['RESIDENTIAL', 'COMMERCIAL'], teamSize: 'SMALL', serviceArea: 'Austin, TX', pricing: 'WALKTHROUGH', focus: 'PAYMENTS' } as const;

test('signup is closed by default; the waitlist works either way', async () => {
  assert.equal(await signupIsOpen(), false);
  await assert.rejects(startSignup('owner@example.com', null), SignupError);
  const w = await joinWaitlist({ email: 'Wait@Example.com', name: 'Wendy', companyName: 'Wendy Cleans' }, 'ip1');
  assert.equal(w.already, false);
  assert.equal((await joinWaitlist({ email: 'wait@example.com', name: 'Wendy', companyName: 'Wendy Cleans' }, 'ip1')).already, true, 'one waitlist entry per email');
});

test('open signup: emailed code, wrong codes counted, company created with only the lines they do', async () => {
  if (!(await db.select().from(tenants).where(eq(tenants.isPlatform, true))).length) {
    await db.insert(tenants).values({ id: crypto.randomUUID(), name: 'Platform', slug: `platform-${Date.now()}`, isPlatform: true, planStatus: 'ACTIVE' });
  }
  await setSignupOpen(true);
  const email = `owner-${Date.now()}@example.com`;
  const { devCode } = await startSignup(email, 'ip2');
  assert.match(devCode!, /^\d{6}$/, 'without email set up (tests), the code comes back for local use');
  const wrong = devCode === '000000' ? '111111' : '000000';
  await assert.rejects(verifySignupCode(email, wrong), /isn’t right/);
  assert.equal(await verifySignupCode(email, devCode!), true);

  await assert.rejects(startSignup('admin@3u3cleaning.com', null), /already has an account/);

  const r = await completeSignup({ email, code: devCode!, name: 'Olive Owner', companyName: 'Sparkle Co', password: 'a-long-password-1', answers: { ...answers, services: [...answers.services] }, acceptTerms: true });
  assert.match(r.slug, /^sparkle-co/);
  const tenant = (await db.select().from(tenants).where(eq(tenants.slug, r.slug)))[0];
  assert.equal(tenant.planStatus, 'TRIALING');
  assert.equal(JSON.parse(tenant.intakeJson!).focus, 'PAYMENTS');
  const lines = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenant.id));
  assert.equal(lines.length, 6, 'every line exists');
  assert.deepEqual(lines.filter((l) => l.offered).map((l) => l.key).sort(), ['COMMERCIAL', 'STANDARD']);
  const owner = (await db.select().from(users).where(eq(users.email, email)))[0];
  assert.equal(owner.role, 'ADMIN');
  assert.equal(owner.tenantId, tenant.id);

  // The code is spent.
  await assert.rejects(completeSignup({ email, code: devCode!, name: 'X', companyName: 'Again', password: 'a-long-password-1', answers: { ...answers, services: [...answers.services] }, acceptTerms: true }), SignupError);

  // Setup guide puts their stated focus right after the basics.
  const steps = await setupSteps(tenant.id);
  assert.deepEqual(steps.slice(0, 4).map((s) => s.key), ['profile', 'services', 'payments', 'automations']);
  assert.equal(await connectRouting(tenant.id), null, 'payments stay on the platform account until Connect is ready');
  await setSignupOpen(false);
});

test('status: database reachable, jobs reported, failures show as degraded', async () => {
  let h = await checkHealth();
  assert.equal(h.database.ok, true);
  assert.ok(h.jobs.length >= 3);
  await recordHeartbeat('cron:reminders', true, { ok: 1 });
  await recordHeartbeat('cron:monthly-billing', true);
  await recordHeartbeat('cron:media-cleanup', false, 'boom');
  h = await checkHealth();
  assert.equal(h.jobs.find((j) => j.key === 'cron:reminders')!.state, 'ok');
  assert.equal(h.status, 'degraded');
  await recordHeartbeat('cron:media-cleanup', true);
  assert.equal((await checkHealth()).status, 'operational');
});
