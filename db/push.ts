// Hand-written schema bootstrap (Postgres). We intentionally avoid the
// drizzle-kit CLI migration workflow so setup is a single predictable
// script — these are idempotent CREATE TABLE statements mirroring
// db/schema.ts exactly. Safe to re-run.
import { pool } from './client';

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT,
      primary_color TEXT NOT NULL DEFAULT '#D2961E',
      ink_color TEXT NOT NULL DEFAULT '#1A1A1A',
      bronze_color TEXT NOT NULL DEFAULT '#8A6D1D',
      cream_color TEXT NOT NULL DEFAULT '#FAEEDA',
      service_area_radius_miles INTEGER NOT NULL DEFAULT 25,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      role TEXT NOT NULL CHECK (role IN ('CUSTOMER','CLEANER','ADMIN')),
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone);
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      line1 TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Katy',
      state TEXT NOT NULL DEFAULT 'TX',
      zip TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS service_types (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      key TEXT NOT NULL CHECK (key IN ('STANDARD','DEEP','MOVE_IN_OUT','AIRBNB')),
      name TEXT NOT NULL,
      default_duration_minutes INTEGER NOT NULL,
      recurring_eligible BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS client_rates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      service_type_id TEXT NOT NULL REFERENCES service_types(id),
      rate_cents INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS client_rates_unique ON client_rates(user_id, service_type_id);

    CREATE TABLE IF NOT EXISTS crews (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      work_start_minutes INTEGER NOT NULL DEFAULT 480,
      work_end_minutes INTEGER NOT NULL DEFAULT 1020,
      homes_per_day INTEGER NOT NULL DEFAULT 3,
      commute_buffer_minutes INTEGER NOT NULL DEFAULT 45,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS crew_members (
      id TEXT PRIMARY KEY,
      crew_id TEXT NOT NULL REFERENCES crews(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS checklist_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      service_type_id TEXT NOT NULL REFERENCES service_types(id),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS checklist_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES checklist_templates(id),
      room_name TEXT NOT NULL,
      task_detail TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      client_id TEXT NOT NULL REFERENCES users(id),
      service_type_id TEXT REFERENCES service_types(id),
      crew_id TEXT REFERENCES crews(id),
      address_id TEXT REFERENCES addresses(id),
      slot_start TEXT NOT NULL,
      slot_end TEXT NOT NULL,
      cadence TEXT NOT NULL DEFAULT 'ONE_TIME' CHECK (cadence IN ('ONE_TIME','BIWEEKLY','MONTHLY')),
      status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('REQUESTED','CONFIRMED','COMPLETED','CANCELLED')),
      price_cents INTEGER,
      is_quote_visit BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_crew_slot_unique ON bookings(crew_id, slot_start);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      crew_id TEXT NOT NULL REFERENCES crews(id),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETE')),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS job_checklist_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      template_item_id TEXT REFERENCES checklist_template_items(id),
      room_name TEXT NOT NULL,
      task_detail TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETE','SKIPPED')),
      skip_reason TEXT,
      before_photo_path TEXT,
      after_photo_path TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      channel TEXT NOT NULL CHECK (channel IN ('EMAIL','SMS')),
      recipient TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      cost_cents REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT','FAILED','RETRIED')),
      related_booking_id TEXT REFERENCES bookings(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  console.log('Schema pushed to Postgres.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
