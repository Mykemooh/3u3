import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Encode, base32Decode, hotp, totp, verifyTotp } from '@/lib/totp';
import { beginSetup, confirmSetup, verifyMfaCode, mfaState, makeTrustCookie, isTrustedDevice, snoozePrompt, disableMfa, backupCodesLeft } from '@/lib/mfa';
import { seeded, makeUser } from './helpers/fixtures';

test('RFC 6238 test vector (SHA-1)', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(hotp(secret, 1, 8), '94287082'); // T = 59s
  assert.equal(hotp(secret, Math.floor(1111111109 / 30), 8), '07081804');
  assert.equal(hotp(secret, Math.floor(20000000000 / 30), 8), '65353130');
  assert.deepEqual(base32Decode(base32Encode(secret)), secret);
});

test('codes one step either side are accepted, older ones are not', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  const now = 1_700_000_000_000;
  assert.ok(verifyTotp(secret, totp(secret, now), now));
  assert.ok(verifyTotp(secret, totp(secret, now - 30_000), now));
  assert.ok(!verifyTotp(secret, totp(secret, now - 120_000), now));
  assert.ok(!verifyTotp(secret, 'abcdef', now));
});

test('admins are required to use MFA; clients are only prompted', async () => {
  const { admin, client } = await seeded();
  assert.deepEqual(await mfaState(admin.id), { enabled: false, required: true, shouldPrompt: false, hasEmail: true });
  const c = await mfaState(client.id);
  assert.equal(c.required, false);
  assert.equal(c.shouldPrompt, true);
  await snoozePrompt(client.id);
  assert.equal((await mfaState(client.id)).shouldPrompt, false);
});

test('setup, sign-in codes and single-use backup codes', async () => {
  const { tenant } = await seeded();
  const person = await makeUser(tenant.id, 'CLEANER');
  const { secret, qrDataUrl } = await beginSetup(person.id);
  assert.match(qrDataUrl, /^data:image\/png;base64,/);
  await assert.rejects(confirmSetup(person.id, '000000'), /didn't match/);
  const { backupCodes } = await confirmSetup(person.id, totp(secret));
  assert.equal(backupCodes.length, 10);
  assert.equal((await mfaState(person.id)).enabled, true);

  assert.equal(await verifyMfaCode(person.id, totp(secret)), 'totp');
  assert.equal(await verifyMfaCode(person.id, '123456'), null);
  assert.equal(await verifyMfaCode(person.id, backupCodes[0].toLowerCase()), 'backup');
  assert.equal(await verifyMfaCode(person.id, backupCodes[0]), null, 'a backup code works once');
  assert.equal(await backupCodesLeft(person.id), 9);

  await disableMfa(person.id, totp(secret));
  assert.equal((await mfaState(person.id)).enabled, false);
});

test('remember-this-device cookies are tied to one person and expire', async () => {
  const { value } = makeTrustCookie('user-a');
  assert.ok(isTrustedDevice(value, 'user-a'));
  assert.ok(!isTrustedDevice(value, 'user-b'));
  assert.ok(!isTrustedDevice(value.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), 'user-a'));
  const [uid, , sig] = value.split('.');
  assert.ok(!isTrustedDevice(`${uid}.${Date.now() - 1000}.${sig}`, 'user-a'));
});
