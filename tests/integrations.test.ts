import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, seeded } from './helpers/fixtures';
import { integrations } from '@/db/schema';
import { integrationOverview, envReport } from '@/lib/integrationsHub';
import { eq } from 'drizzle-orm';

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const before: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    before[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(vars)) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  });
}

test('integrations hub: missing keys, ready to connect, connected', async () => {
  const { tenant, admin } = await seeded();
  await withEnv({ QUICKBOOKS_CLIENT_ID: undefined, QUICKBOOKS_CLIENT_SECRET: undefined }, async () => {
    const qb = (await integrationOverview(tenant.id, admin.id)).find((i) => i.key === 'quickbooks')!;
    assert.equal(qb.status, 'missing_keys');
  });
  await withEnv({ QUICKBOOKS_CLIENT_ID: 'id-value', QUICKBOOKS_CLIENT_SECRET: 'secret-value' }, async () => {
    let qb = (await integrationOverview(tenant.id, admin.id)).find((i) => i.key === 'quickbooks')!;
    assert.equal(qb.status, 'needs_connect');
    const id = crypto.randomUUID();
    await db.insert(integrations).values({ id, tenantId: tenant.id, provider: 'QUICKBOOKS', accessToken: 'a', refreshToken: 'r', externalAccountId: '123' });
    qb = (await integrationOverview(tenant.id, admin.id)).find((i) => i.key === 'quickbooks')!;
    assert.equal(qb.status, 'connected');
    await db.delete(integrations).where(eq(integrations.id, id));
  });
});

test('integrations hub never exposes a key value', async () => {
  const { tenant, admin } = await seeded();
  await withEnv({ RESEND_API_KEY: 're_super_secret_value_123' }, async () => {
    const all = JSON.stringify([await integrationOverview(tenant.id, admin.id), envReport()]);
    assert.ok(!all.includes('re_super_secret_value_123'));
    const resend = envReport().find((r) => r.key === 'resend')!;
    assert.equal(resend.vars.find((v) => v.name === 'RESEND_API_KEY')!.set, true);
  });
});
