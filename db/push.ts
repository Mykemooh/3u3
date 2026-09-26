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
      primary_color TEXT NOT NULL DEFAULT '#2563EB',
      ink_color TEXT NOT NULL DEFAULT '#0B1F3B',
      bronze_color TEXT NOT NULL DEFAULT '#1D4ED8',
      cream_color TEXT NOT NULL DEFAULT '#EFF6FF',
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
      stripe_customer_id TEXT,
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
      require_before_photo BOOLEAN NOT NULL DEFAULT true,
      no_photos_needed BOOLEAN NOT NULL DEFAULT false,
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

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      client_id TEXT NOT NULL REFERENCES users(id),
      quote_visit_booking_id TEXT REFERENCES bookings(id),
      service_type_id TEXT NOT NULL REFERENCES service_types(id),
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','APPROVED','DECLINED','EXPIRED')),
      total_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      approval_token TEXT,
      sent_at TIMESTAMPTZ,
      responded_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS quotes_approval_token_unique ON quotes(approval_token);

    CREATE TABLE IF NOT EXISTS quote_items (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES quotes(id),
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      client_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','PAID','VOID')),
      total_cents INTEGER NOT NULL DEFAULT 0,
      stripe_invoice_id TEXT,
      hosted_invoice_url TEXT,
      invoice_pdf_url TEXT,
      stripe_payment_intent_id TEXT,
      receipt_url TEXT,
      sent_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_booking_unique ON invoices(booking_id);

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id),
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
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

    -- CREATE TABLE IF NOT EXISTS is a no-op on a table that already
    -- exists, so a new column on an existing table (like this one, added
    -- alongside invoicing) needs an explicit ALTER TABLE too, or it will
    -- never reach an already-deployed database no matter how many times
    -- this script is re-run.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

    -- Job media: one row per before/after photo or video, per room.
    CREATE TABLE IF NOT EXISTS job_media (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      item_id TEXT NOT NULL REFERENCES job_checklist_items(id),
      phase TEXT NOT NULL CHECK (phase IN ('BEFORE','AFTER')),
      kind TEXT NOT NULL CHECK (kind IN ('PHOTO','VIDEO')),
      url TEXT NOT NULL,
      storage_key TEXT,
      content_type TEXT,
      size_bytes INTEGER,
      duration_seconds REAL,
      uploaded_by TEXT REFERENCES users(id),
      expires_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS job_media_job_idx ON job_media(job_id);
    CREATE INDEX IF NOT EXISTS job_media_item_idx ON job_media(item_id);

    -- Photos taken before job_media existed lived only on the checklist row.
    -- Copy them across once so they show up in the client's gallery too.
    INSERT INTO job_media (id, job_id, item_id, phase, kind, url, created_at)
      SELECT gen_random_uuid()::text, i.job_id, i.id, 'BEFORE', 'PHOTO', i.before_photo_path, COALESCE(i.completed_at, i.created_at)
      FROM job_checklist_items i
      WHERE i.before_photo_path IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM job_media m WHERE m.item_id = i.id AND m.url = i.before_photo_path);
    INSERT INTO job_media (id, job_id, item_id, phase, kind, url, created_at)
      SELECT gen_random_uuid()::text, i.job_id, i.id, 'AFTER', 'PHOTO', i.after_photo_path, COALESCE(i.completed_at, i.created_at)
      FROM job_checklist_items i
      WHERE i.after_photo_path IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM job_media m WHERE m.item_id = i.id AND m.url = i.after_photo_path);

    -- Sequential, human-facing invoice numbers (1001, 1002, ...). Existing
    -- invoices are numbered in the order they were created.
    -- Per-job photo policy (admin-editable): a room can require before+after
    -- photos (default), skip the before photo, or skip photos entirely.
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS require_before_photo BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS no_photos_needed BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number INTEGER;
    UPDATE invoices SET invoice_number = numbered.n
      FROM (
        SELECT id, (SELECT COALESCE(MAX(invoice_number), 1000) FROM invoices)
                   + ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
        FROM invoices WHERE invoice_number IS NULL
      ) AS numbered
      WHERE invoices.id = numbered.id;
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_unique ON invoices(tenant_id, invoice_number);
  `);

  console.log('Schema pushed to Postgres.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
