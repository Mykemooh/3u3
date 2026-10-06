/**
 * Data backfills that run on every deploy, after the schema update
 * (scripts/migrate-on-build.ts) and before `next build`. Each one is
 * idempotent. Skipped when no database is configured (a local build).
 */
async function main() {
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    console.log('[backfill] No database configured — skipping.');
    return;
  }
  const { backfillServiceLines } = await import('../lib/serviceLines');
  const { pool } = await import('../db/client');
  const lines = await backfillServiceLines();
  console.log(`[backfill] Service lines: ${lines.added} added across ${lines.companies} companies.`);

  // The platform owner login, from PLATFORM_ADMIN_EMAIL / _PASSWORD
  // (lib/platformBootstrap.ts). Never fails the build.
  const { ensurePlatformOwner } = await import('../lib/platformBootstrap');
  const owner = await ensurePlatformOwner({
    email: process.env.PLATFORM_ADMIN_EMAIL,
    password: process.env.PLATFORM_ADMIN_PASSWORD,
    name: process.env.PLATFORM_ADMIN_NAME,
  }).catch((err) => ({ status: 'skipped' as const, reason: `error: ${err?.message ?? err}` }));
  if (owner.status === 'created') console.log(`[backfill] Platform owner login created for ${owner.email}.`);
  else if (owner.status === 'exists') console.log('[backfill] Platform owner login already exists.');
  else console.log(`[backfill] Platform owner: skipped (${owner.reason}).`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill] failed', err);
  process.exit(1);
});
