import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// POSTGRES_URL (Vercel's convention) or DATABASE_URL — either works.
// Locally, point this at any Postgres instance (see .env.example).
// On Vercel, add Postgres from the Storage tab and it sets POSTGRES_URL
// for you automatically.
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'Missing POSTGRES_URL (or DATABASE_URL). Set it in .env.local for local dev, ' +
      'or add Postgres from the Storage tab in your Vercel project.',
  );
}

// A small pool is plenty for this app's traffic; Vercel serverless
// functions each get their own short-lived pool instance, which is the
// standard pattern for node-postgres on serverless.
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5,
});

export const db = drizzle(pool, { schema });
export { pool };
