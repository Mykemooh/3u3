/**
 * Runs the idempotent schema script (db/push.ts) as the first step of every
 * build, so a deploy never ships code that expects a table or column the
 * production database doesn't have yet.
 *
 * Every statement in db/push.ts is additive and safe to repeat (CREATE ...
 * IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, guarded backfills). If the
 * database can't be reached the build stops, and Vercel keeps serving the
 * previous deployment — nothing half-migrated goes live.
 *
 * With no database configured (a local `next build`), it's skipped.
 */
if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  console.log('[migrate] No POSTGRES_URL / DATABASE_URL set — skipping schema update.');
} else {
  console.log('[migrate] Applying schema updates before build…');
  // db/push.ts runs itself on import and exits non-zero on failure.
  require('../db/push');
}
