import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { parseDsn, captureException, parseStack, safePath } from '@/lib/monitoring';
import { POST as clientError } from '@/app/api/monitoring/client-error/route';

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.SENTRY_DSN;
});

test('DSN parsing', () => {
  assert.deepEqual(parseDsn('https://abc123@o42.ingest.sentry.io/7'), { key: 'abc123', host: 'https://o42.ingest.sentry.io', projectId: '7', raw: 'https://abc123@o42.ingest.sentry.io/7' });
  assert.equal(parseDsn(''), null);
  assert.equal(parseDsn('not a url'), null);
  assert.equal(parseDsn('http://abc@host/1'), null, 'https only');
});

test('nothing is sent without SENTRY_DSN; with it, an envelope goes to the project', async () => {
  delete process.env.SENTRY_DSN;
  let calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: String(init.body) });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  assert.equal(await captureException(new Error('x')), false);
  assert.equal(calls.length, 0);

  process.env.SENTRY_DSN = 'https://pubkey@o1.ingest.sentry.io/99';
  assert.equal(await captureException(new TypeError('boom'), { path: '/admin/leads' }), true);
  assert.equal(calls[0].url, 'https://o1.ingest.sentry.io/api/99/envelope/');
  assert.match(calls[0].headers['X-Sentry-Auth'], /sentry_key=pubkey/);
  const [, item, payload] = calls[0].body.split('\n');
  assert.equal(JSON.parse(item).type, 'event');
  const event = JSON.parse(payload);
  assert.equal(event.exception.values[0].type, 'TypeError');
  assert.equal(event.exception.values[0].value, 'boom');
  assert.ok(event.exception.values[0].stacktrace.frames.length > 0);
  assert.equal(event.tags.path, '/admin/leads');

  calls = [];
  const res = await clientError(new Request('http://localhost/api/monitoring/client-error', { method: 'POST', body: JSON.stringify({ name: 'Error', message: 'button broke', url: '/estimate/abc?token=secret#x' }), headers: { 'x-forwarded-for': '1.2.3.4' } }));
  assert.equal(res.status, 204);
  const browserEvent = JSON.parse(calls[0].body.split('\n')[2]);
  assert.equal(browserEvent.platform, 'javascript');
  assert.equal(browserEvent.tags.path, '/estimate/abc');
  assert.ok(!calls[0].body.includes('secret'), 'query strings never leave');
});

test('stack parsing and path scrubbing', () => {
  const frames = parseStack('Error: x\n    at inner (/app/lib/a.ts:10:5)\n    at outer (/app/node_modules/b.js:2:1)');
  assert.deepEqual(frames.map((f) => f.function), ['outer', 'inner'], 'oldest first');
  assert.equal(frames[0].in_app, false);
  assert.equal(safePath('https://site.test/set-password?token=abc'), '/set-password');
});
