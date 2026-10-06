import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from './helpers/fixtures';
import { users } from '@/db/schema';
import { ensurePlatformOwner } from '@/lib/platformBootstrap';

test('platform owner bootstrap: skips without env, creates once, never twice', async () => {
  assert.equal((await ensurePlatformOwner({})).status, 'skipped');

  const before = await db.select().from(users).where(eq(users.role, 'SUPER_ADMIN'));
  const email = `owner-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const first = await ensurePlatformOwner({ email, password: 'a-long-test-password' });
  if (before.length > 0) {
    assert.equal(first.status, 'exists');
    return;
  }
  assert.deepEqual(first, { status: 'created', email });
  const owner = (await db.select().from(users).where(eq(users.email, email)))[0];
  assert.equal(owner?.role, 'SUPER_ADMIN');
  assert.equal((await ensurePlatformOwner({ email: 'other@example.com', password: 'another-long-password' })).status, 'exists');
});
