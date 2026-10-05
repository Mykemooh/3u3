import assert from 'node:assert/strict';
import { Browser } from './client';
import { totp } from '@/lib/totp';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

async function main() {
  // 1. Admin signs in with a password — required setup blocks everything.
  const b = new Browser(BASE);
  assert.equal(await b.signIn('admin@3u3cleaning.com', 'admin123'), 200);
  let s = await b.session();
  assert.equal(s.data.user.role, 'ADMIN');
  assert.equal(s.data.user.mfaSetup, 'required');
  let page = await b.req('/admin');
  assert.equal(page.status, 307);
  assert.match(page.headers.get('location') ?? '', /\/mfa\/setup\?next=%2Fadmin/);
  assert.equal((await b.json('/api/admin/team/teams')).status, 401, 'admin API refuses before MFA');

  // 2. Link an authenticator, confirm, refresh the session — admin opens.
  const setup = await b.json('/api/mfa/setup', {});
  assert.equal(setup.status, 200);
  const confirm = await b.json('/api/mfa/confirm', { code: totp(setup.data.secret) });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.data.backupCodes.length, 10);
  s = await b.updateSession({ mfaRefresh: true });
  assert.equal(s.data.user.mfaSetup, null);
  assert.equal(s.data.user.mfaPending, false);
  page = await b.req('/admin');
  assert.equal(page.status, 200, 'admin opens after setup');

  // 3. A fresh sign-in now asks for a code; a wrong one is refused.
  const b2 = new Browser(BASE);
  await b2.signIn('admin@3u3cleaning.com', 'admin123');
  s = await b2.session();
  assert.equal(s.data.user.mfaPending, true);
  page = await b2.req('/admin/clients');
  assert.match(page.headers.get('location') ?? '', /^\/mfa\?next=|\/mfa\?next=/);
  s = await b2.updateSession({ mfaCode: '000000' });
  assert.equal(s.data.user.mfaPending, true);
  s = await b2.updateSession({ mfaCode: confirm.data.backupCodes[0] });
  assert.equal(s.data.user.mfaPending, false, 'backup code lets them in');
  assert.equal((await b2.req('/admin/clients')).status, 200);

  // 4. Remember this device: the next sign-in on this browser skips the code.
  assert.equal((await b2.json('/api/mfa/trust', {})).status, 200);
  const trusted = b2.cookies.get('mfa_trusted')!;
  const b3 = new Browser(BASE);
  b3.cookies.set('mfa_trusted', trusted);
  await b3.signIn('admin@3u3cleaning.com', 'admin123');
  assert.equal((await b3.session()).data.user.mfaPending, false);

  // 5. A client is offered setup once and can snooze it.
  const c = new Browser(BASE);
  await c.signIn('+12815550199', 'customer123');
  s = await c.session();
  assert.equal(s.data.user.mfaSetup, 'prompt');
  page = await c.req('/account');
  assert.match(page.headers.get('location') ?? '', /\/mfa\/setup\?optional=1/);
  assert.equal((await c.json('/api/mfa/snooze', {})).status, 200);
  s = await c.updateSession({ mfaRefresh: true });
  assert.equal(s.data.user.mfaSetup, null);
  assert.equal((await c.req('/account')).status, 200);

  // 6. A cleaner (not required by default) — prompt only.
  const cl = new Browser(BASE);
  await cl.signIn('jordan@3u3cleaning.com', 'clean123');
  assert.equal((await cl.session()).data.user.mfaSetup, 'prompt');

  console.log('MFA end-to-end: all checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
