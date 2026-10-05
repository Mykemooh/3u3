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
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill] failed', err);
  process.exit(1);
});
