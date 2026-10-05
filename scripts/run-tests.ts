/**
 * npm test — recreates a throwaway test database, applies the real schema
 * script (db/push.ts) and seed (db/seed.ts) to it, then runs every
 * tests/*.test.ts file against it with node's built-in test runner.
 *
 * TEST_DATABASE_URL picks the server; the database named in it is dropped
 * and recreated on every run, so never point it at real data. It refuses
 * to run against anything that isn't localhost.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { Client } from 'pg';

async function main() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/threeu3_test';
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error(`Refusing to reset a non-local database (${parsed.hostname}).`);
  }
  const dbName = parsed.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();

  const env = {
    ...process.env,
    POSTGRES_URL: url,
    NEXTAUTH_SECRET: 'test-secret-0123456789abcdef',
    NEXTAUTH_URL: 'http://localhost:3000',
    HOME_PROFILE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    NODE_ENV: 'test' as const,
  };
  for (const script of ['db/push.ts', 'db/seed.ts']) {
    const r = spawnSync('npx', ['tsx', script], { env, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  const only = process.argv.slice(2);
  const files = readdirSync('tests')
    .filter((f) => f.endsWith('.test.ts'))
    .filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
    .map((f) => `tests/${f}`);
  const r = spawnSync('npx', ['tsx', '--test', '--test-concurrency=1', ...files], { env, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
