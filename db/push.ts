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
      password_setup_token TEXT,
      password_setup_expires_at TIMESTAMPTZ,
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
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','EN_ROUTE','IN_PROGRESS','COMPLETE')),
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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_pin_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_pin_failures INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_pin_locked_until TIMESTAMPTZ;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tex_open_days TEXT NOT NULL DEFAULT '1,2,3,4,5';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tex_open_from TEXT NOT NULL DEFAULT '08:00';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tex_open_to TEXT NOT NULL DEFAULT '17:00';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tex_greeting TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_setup_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_setup_expires_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS users_password_setup_token_unique ON users(password_setup_token);

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

    -- Cleaner en route + live tracking map. EN_ROUTE sits between PENDING
    -- and IN_PROGRESS, so the inline CHECK on jobs.status (Postgres names it
    -- jobs_status_check) is swapped for one that allows it — only when the
    -- current definition doesn't already, so re-running is a no-op.
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'jobs'::regclass AND conname = 'jobs_status_check'
          AND pg_get_constraintdef(oid) LIKE '%EN_ROUTE%'
      ) THEN
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
          CHECK (status IN ('PENDING','EN_ROUTE','IN_PROGRESS','COMPLETE'));
      END IF;
    END $$;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS en_route_at TIMESTAMPTZ;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS crew_lat DOUBLE PRECISION;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS crew_lng DOUBLE PRECISION;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS crew_location_at TIMESTAMPTZ;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS route_geojson TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS route_duration_seconds INTEGER;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS route_updated_at TIMESTAMPTZ;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dest_lat DOUBLE PRECISION;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dest_lng DOUBLE PRECISION;
    -- addresses.lat/lng briefly cached geocoding results permanently, which
    -- Mapbox's free (temporary) geocoding doesn't allow. No longer read or
    -- written; kept (emptied) rather than dropped so a deployment still
    -- running the old code during rollout doesn't break.
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    UPDATE addresses SET lat = NULL, lng = NULL WHERE lat IS NOT NULL OR lng IS NOT NULL;

    -- Teams: roles, online-booking switch, per-job staffing swaps.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_role TEXT
      CHECK (staff_role IN ('TEAM_LEAD','CLEANER','JR_CLEANER'));
    UPDATE users SET staff_role = 'CLEANER' WHERE role = 'CLEANER' AND staff_role IS NULL;
    ALTER TABLE crews ADD COLUMN IF NOT EXISTS accepts_bookings BOOLEAN NOT NULL DEFAULT true;
    CREATE TABLE IF NOT EXISTS job_staff (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL CHECK (action IN ('ADD','REMOVE')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS job_staff_job_user_unique ON job_staff(job_id, user_id);

    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number INTEGER;
    UPDATE invoices SET invoice_number = numbered.n
      FROM (
        SELECT id, (SELECT COALESCE(MAX(invoice_number), 1000) FROM invoices)
                   + ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
        FROM invoices WHERE invoice_number IS NULL
      ) AS numbered
      WHERE invoices.id = numbered.id;
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_unique ON invoices(tenant_id, invoice_number);

    -- Client management: admin close/reopen, self-service address edits,
    -- and the admin "Alerts" feed for client-initiated changes.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

    -- My Account beef-up: profile picture, saved payment method (Stripe
    -- only — no card data here), notification channel preference, and a
    -- cleaner's hourly pay rate (payroll report input).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method_brand TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method_exp_month INTEGER;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method_exp_year INTEGER;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS autopay_enabled BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_channel TEXT NOT NULL DEFAULT 'EMAIL'
      CHECK (notification_channel IN ('EMAIL','SMS','WHATSAPP'));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_rate_cents_per_hour INTEGER;

    -- "Cleaner needs to know" per property, and the crew's acknowledgement
    -- of it before a job can start.
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cleaner_notes_ack_at TIMESTAMPTZ;

    -- Upcoming-cleaning reminders (3 days, then 36 hours before).
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_3d_sent_at TIMESTAMPTZ;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_36h_sent_at TIMESTAMPTZ;

    -- Tips (paid as their own small Stripe Checkout session, since the
    -- main invoice is already finalized at a fixed amount by then) and
    -- whether an invoice was settled by autopay.
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tip_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS autopay_charged BOOLEAN NOT NULL DEFAULT false;

    -- Quote follow-up cadence (24h, +3d, +2d, then weekly) and its opt-out.
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS reminders_opted_out BOOLEAN NOT NULL DEFAULT false;

    -- WhatsApp joins Email/SMS as a notification channel.
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'notification_log'::regclass AND conname = 'notification_log_channel_check'
          AND pg_get_constraintdef(oid) LIKE '%WHATSAPP%'
      ) THEN
        ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_channel_check;
        ALTER TABLE notification_log ADD CONSTRAINT notification_log_channel_check
          CHECK (channel IN ('EMAIL','SMS','WHATSAPP'));
      END IF;
    END $$;

    -- Accounting/payroll connections (QuickBooks today) — see lib/quickbooks.ts.
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      provider TEXT NOT NULL CHECK (provider IN ('QUICKBOOKS')),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      external_account_id TEXT,
      expires_at TIMESTAMPTZ,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS integrations_tenant_provider_unique ON integrations(tenant_id, provider);

    CREATE TABLE IF NOT EXISTS quickbooks_links (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      entity TEXT NOT NULL CHECK (entity IN ('CUSTOMER','INVOICE')),
      local_id TEXT NOT NULL,
      quickbooks_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS quickbooks_links_entity_unique ON quickbooks_links(tenant_id, entity, local_id);

    -- Pay types (hourly / per-clean / full-workday) alongside the existing
    -- hourly rate column, and the payroll run → review → paid workflow.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_type TEXT NOT NULL DEFAULT 'HOURLY'
      CHECK (pay_type IN ('HOURLY','PER_CLEAN','DAY_RATE'));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_rate_cents_per_clean INTEGER;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_rate_cents_per_day INTEGER;

    -- Added a 4th pay type (percentage of job price) — widen both CHECK
    -- constraints that were created with the old 3-value list (the
    -- ADD COLUMN ... CHECK above only ran once, when the column didn't
    -- exist yet, so it never picks up a later change to the list).
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pay_type_check;
    ALTER TABLE users ADD CONSTRAINT users_pay_type_check CHECK (pay_type IN ('HOURLY','PER_CLEAN','DAY_RATE','PERCENTAGE'));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_rate_percent_bps INTEGER;

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      label TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PAID')),
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS payroll_entries (
      id TEXT PRIMARY KEY,
      payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      pay_type TEXT NOT NULL CHECK (pay_type IN ('HOURLY','PER_CLEAN','DAY_RATE')),
      rate_cents INTEGER NOT NULL,
      hours REAL NOT NULL DEFAULT 0,
      job_count INTEGER NOT NULL DEFAULT 0,
      days_worked INTEGER NOT NULL DEFAULT 0,
      pay_cents INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE payroll_entries DROP CONSTRAINT IF EXISTS payroll_entries_pay_type_check;
    ALTER TABLE payroll_entries ADD CONSTRAINT payroll_entries_pay_type_check CHECK (pay_type IN ('HOURLY','PER_CLEAN','DAY_RATE','PERCENTAGE'));
    ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS rate_percent_bps INTEGER;

    CREATE TABLE IF NOT EXISTS payroll_entry_jobs (
      id TEXT PRIMARY KEY,
      payroll_entry_id TEXT NOT NULL REFERENCES payroll_entries(id),
      job_id TEXT NOT NULL REFERENCES jobs(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS payroll_entry_jobs_job_user_unique ON payroll_entry_jobs(job_id, user_id);

    -- A team's home base ("move a team to a location") — text only, never
    -- lat/lng (see the comment on db/schema.ts crews for why).
    ALTER TABLE crews ADD COLUMN IF NOT EXISTS home_address_line1 TEXT;
    ALTER TABLE crews ADD COLUMN IF NOT EXISTS home_city TEXT;
    ALTER TABLE crews ADD COLUMN IF NOT EXISTS home_state TEXT;
    ALTER TABLE crews ADD COLUMN IF NOT EXISTS home_zip TEXT;

    -- Standby requests (lib/standby.ts).
    CREATE TABLE IF NOT EXISTS standby_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      client_id TEXT NOT NULL REFERENCES users(id),
      service_type_id TEXT NOT NULL REFERENCES service_types(id),
      address_id TEXT REFERENCES addresses(id),
      preferred_date TEXT NOT NULL,
      cadence TEXT NOT NULL DEFAULT 'ONE_TIME' CHECK (cadence IN ('ONE_TIME','BIWEEKLY','MONTHLY')),
      status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING','OFFERED','BOOKED','EXPIRED','CANCELLED')),
      offer_token TEXT,
      offer_crew_id TEXT REFERENCES crews(id),
      offer_slot_start TEXT,
      offer_slot_end TEXT,
      offer_expires_at TIMESTAMPTZ,
      resulting_booking_id TEXT REFERENCES bookings(id),
      responded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS standby_requests_offer_token_unique ON standby_requests(offer_token);

    -- "Can we use your before/after photos on social media?" — asked once
    -- on the client's before-and-after gallery page, covers every future
    -- cleaning until they change it.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS social_media_consent BOOLEAN;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS social_media_consent_at TIMESTAMPTZ;
    -- Per-room-count checklist items: a client's bedroom/bathroom counts
    -- (captured at quote time, app/new, or by the admin during a
    -- walkthrough) and which template item expands per-room. Supersedes
    -- the earlier boolean-only "per_bedroom" column (never shipped to
    -- main) with a general count_by so bathrooms work the same way.
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS bedrooms INTEGER;
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS bathrooms INTEGER;
    ALTER TABLE checklist_template_items ADD COLUMN IF NOT EXISTS count_by TEXT CHECK (count_by IN ('BEDROOMS','BATHROOMS'));
    UPDATE checklist_template_items SET count_by = 'BEDROOMS' WHERE room_name = 'Bedrooms' AND count_by IS NULL;
    UPDATE checklist_template_items SET count_by = 'BATHROOMS' WHERE room_name = 'Bathrooms' AND count_by IS NULL;
    ALTER TABLE checklist_template_items DROP COLUMN IF EXISTS per_bedroom;

    -- Structured home profile (lib/homeProfile.ts): pets, parking,
    -- allergies, do-not-touch items, and an AES-256-GCM-encrypted entry/
    -- alarm code — set by the client or by the admin during the quote
    -- walkthrough (app/admin/leads/[id]/walkthrough), shown to the crew
    -- on every visit alongside the existing free-text "notes".
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS pets TEXT;
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS parking_notes TEXT;
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS allergy_notes TEXT;
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS do_not_touch TEXT;
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS entry_code_encrypted TEXT;

    CREATE TABLE IF NOT EXISTS address_room_notes (
      id TEXT PRIMARY KEY,
      address_id TEXT NOT NULL REFERENCES addresses(id),
      room_name TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Tip wages in payroll (lib/payroll.ts): a tip is taxable compensation
    -- for the employee, not a gift, so it gets its own reported line
    -- alongside hourly/per-clean/day-rate pay, not folded silently into
    -- it. tip_paid_out_cents tracks how much of an invoice's tip has
    -- already been claimed by a payroll run, so a tip that arrives after
    -- a job's hours were already paid out is still caught by the next run
    -- and never paid out twice.
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tip_paid_out_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS tip_cents INTEGER NOT NULL DEFAULT 0;

    -- Exactly which invoice(s) a payroll entry's tip_cents came from, and
    -- how much of each — so voidPayrollRun can precisely give the claimed
    -- amount back to invoices.tip_paid_out_cents instead of losing track
    -- of it (payroll_entry_jobs is the same pattern, for hours).
    CREATE TABLE IF NOT EXISTS payroll_entry_tips (
      id TEXT PRIMARY KEY,
      payroll_entry_id TEXT NOT NULL REFERENCES payroll_entries(id),
      invoice_id TEXT NOT NULL REFERENCES invoices(id),
      amount_cents INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Add-on services (lib/addons.ts): a tenant-wide catalog, with
    -- optional per-client pricing set during quote/client profile setup
    -- (mirrors client_rates), and a snapshot of what was actually picked
    -- and charged on each booking.
    CREATE TABLE IF NOT EXISTS add_on_services (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      default_price_cents INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS client_add_on_rates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      add_on_service_id TEXT NOT NULL REFERENCES add_on_services(id),
      price_cents INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS client_add_on_rates_unique ON client_add_on_rates(user_id, add_on_service_id);

    CREATE TABLE IF NOT EXISTS booking_add_ons (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      add_on_service_id TEXT NOT NULL REFERENCES add_on_services(id),
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Admin-configurable payroll behavior (Admin → Settings) — each
    -- default matches what the app already did before these existed.
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS percent_pay_basis TEXT NOT NULL DEFAULT 'BASE_PRICE'
      CHECK (percent_pay_basis IN ('BASE_PRICE','INVOICE_TOTAL'));
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS hourly_pay_model TEXT NOT NULL DEFAULT 'ACTUAL_TIME'
      CHECK (hourly_pay_model IN ('ACTUAL_TIME','TARGET_TIME'));
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tip_split_method TEXT NOT NULL DEFAULT 'EVEN'
      CHECK (tip_split_method IN ('EVEN','BY_HOURS'));

    -- How long this specific home should take to clean (admin-set, during
    -- the walkthrough or on the client profile) — falls back to the
    -- service's own default duration when null.
    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS target_clean_minutes INTEGER;

    -- Tips as their own invoice line item (lib/tips.ts) — shown
    -- consistently alongside every other line, and flagged non-taxable
    -- and excluded from invoice_items used for the billable total/
    -- subtotal (invoices.tip_cents stays what payroll actually reads).
    ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS taxable BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS is_tip BOOLEAN NOT NULL DEFAULT false;

    -- Reviews (lib/reviews.ts) — prompted once per booking on the client's
    -- before-and-after gallery; "featured" is an admin picking it for the
    -- landing page's testimonial carousel.
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      client_id TEXT NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      featured BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_unique ON reviews(booking_id);

    -- Light supply reporting from the crew portal (lib/supplies.ts): a
    -- free-text product name and a status, tied to the crew/team.
    CREATE TABLE IF NOT EXISTS supply_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      crew_id TEXT NOT NULL REFERENCES crews(id),
      reported_by_user_id TEXT NOT NULL REFERENCES users(id),
      product_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('LOW','OUT','DAMAGED')),
      notes TEXT,
      resolved BOOLEAN NOT NULL DEFAULT false,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Multi-tenant platform (lib/platform.ts, lib/tenantProvisioning.ts):
    -- SUPER_ADMIN, separate from a tenant's own ADMIN.
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER','CLEANER','ADMIN','SUPER_ADMIN'));

    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT;
    -- Backfill any tenant that predates slugs (every tenant seeded before
    -- today, including 3U3 itself) from its name, before making the
    -- column required — a plain NOT NULL add would fail on those rows.
    UPDATE tenants SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) || '-' || substr(id, 1, 6)
      WHERE slug IS NULL;
    ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_unique ON tenants(slug);

    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS tenants_custom_domain_unique ON tenants(custom_domain);

    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_platform BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'TRIALING'
      CHECK (plan_status IN ('TRIALING','ACTIVE','PAST_DUE','CANCELED'));
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS platform_stripe_customer_id TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS platform_stripe_subscription_id TEXT;
    -- Every tenant that existed before the platform billing model (3U3
    -- itself, today) keeps working with no interruption — unlimited
    -- access, never gated, until a SUPER_ADMIN deliberately changes it.
    UPDATE tenants SET plan_status = 'ACTIVE', access_expires_at = NULL WHERE is_platform = false;

    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('TRIAL_1MO','TRIAL_3MO','FOREVER')),
      duration_days INTEGER,
      max_redemptions INTEGER,
      redemption_count INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_unique ON promo_codes(code);

    CREATE TABLE IF NOT EXISTS promo_code_redemptions (
      id TEXT PRIMARY KEY,
      promo_code_id TEXT NOT NULL REFERENCES promo_codes(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS promo_code_redemptions_unique ON promo_code_redemptions(promo_code_id, tenant_id);

    -- Dashboard customization (lib/dashboard.ts, Admin → Dashboard).
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dashboard_hidden_widgets TEXT NOT NULL DEFAULT '';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS avg_supply_cost_cents_per_clean INTEGER NOT NULL DEFAULT 800;

    -- Service-area check, snapshotted once per lead (lib/serviceArea.ts).
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS outside_service_area BOOLEAN;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_area_distance_miles DOUBLE PRECISION;

    -- Monthly billing batches (lib/monthlyBilling.ts).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'PER_CLEAN'
      CHECK (billing_mode IN ('PER_CLEAN','MONTHLY_BATCH'));

    CREATE TABLE IF NOT EXISTS monthly_billing_batches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      client_id TEXT NOT NULL REFERENCES users(id),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INVOICED','PAID','FAILED')),
      total_cents INTEGER NOT NULL DEFAULT 0,
      stripe_invoice_id TEXT,
      hosted_invoice_url TEXT,
      invoice_pdf_url TEXT,
      receipt_url TEXT,
      autopay_charged BOOLEAN NOT NULL DEFAULT false,
      invoiced_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS monthly_billing_batches_client_period_unique ON monthly_billing_batches(client_id, period_start);

    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS batch_id TEXT REFERENCES monthly_billing_batches(id);

    -- =====================================================================
    -- October 2026 build (TrashCan SaaS + 3U3 portals). Every statement is
    -- additive and safe to re-run, same as everything above.
    -- =====================================================================

    -- Cancelled bookings no longer hold their crew's slot. The original
    -- unique index counted them, so a cancelled time could never be
    -- booked again; the replacement only counts live bookings.
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_crew_slot_active_unique ON bookings(crew_id, slot_start) WHERE status <> 'CANCELLED';
    DROP INDEX IF EXISTS bookings_crew_slot_unique;

    -- Wider cadence list for recurring series (lib/recurring.ts).
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cadence_check;
    ALTER TABLE bookings ADD CONSTRAINT bookings_cadence_check
      CHECK (cadence IN ('ONE_TIME','WEEKLY','BIWEEKLY','EVERY_4_WEEKS','MONTHLY','CUSTOM'));
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS series_id TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS series_occurrence_date TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_series_exception BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_notes TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS intake_json TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_series_occurrence_unique ON bookings(series_id, series_occurrence_date);

    -- Post-construction and commercial service lines.
    ALTER TABLE service_types DROP CONSTRAINT IF EXISTS service_types_key_check;
    ALTER TABLE service_types ADD CONSTRAINT service_types_key_check
      CHECK (key IN ('STANDARD','DEEP','MOVE_IN_OUT','AIRBNB','POST_CONSTRUCTION','COMMERCIAL'));

    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payroll_frequency TEXT NOT NULL DEFAULT 'BIWEEKLY'
      CHECK (payroll_frequency IN ('WEEKLY','BIWEEKLY','SEMIMONTHLY','MONTHLY'));
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payroll_anchor_date TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sms_number TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tex_sms_auto_reply BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tex_voice_enabled BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_phone TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_review_url TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS referral_credit_cents INTEGER NOT NULL DEFAULT 2500;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS winback_days INTEGER NOT NULL DEFAULT 60;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS intake_json TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS setup_skipped_steps TEXT NOT NULL DEFAULT '';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_connect_ready BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mfa_required_for_crew BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_email_code_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_email_code_expires_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_prompt_snoozed_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_out BOOLEAN NOT NULL DEFAULT false;
    CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique ON users(referral_code);

    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_by_user_id TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS start_lat DOUBLE PRECISION;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS start_lng DOUBLE PRECISION;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS finished_by_user_id TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS finish_lat DOUBLE PRECISION;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS finish_lng DOUBLE PRECISION;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS proof_token TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_proof_token_unique ON jobs(proof_token);

    ALTER TABLE job_checklist_items ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reclean_status TEXT
      CHECK (reclean_status IN ('REQUESTED','SCHEDULED','DONE','DISMISSED'));

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      base_role TEXT NOT NULL CHECK (base_role IN ('CUSTOMER','CLEANER','ADMIN')),
      staff_role TEXT CHECK (staff_role IN ('TEAM_LEAD','CLEANER','JR_CLEANER')),
      permissions TEXT NOT NULL DEFAULT '',
      default_key TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_name_unique ON roles(tenant_id, name);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      actor_user_id TEXT,
      actor_name TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      changes_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log(tenant_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(tenant_id, created_at);

    CREATE TABLE IF NOT EXISTS recurring_series (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      client_id TEXT NOT NULL REFERENCES users(id),
      service_type_id TEXT NOT NULL REFERENCES service_types(id),
      address_id TEXT REFERENCES addresses(id),
      crew_id TEXT NOT NULL REFERENCES crews(id),
      pattern TEXT NOT NULL CHECK (pattern IN ('WEEKLY','EVERY_2_WEEKS','EVERY_4_WEEKS','MONTHLY_NTH_WEEKDAY','CUSTOM_WEEKDAYS')),
      weekdays TEXT,
      nth INTEGER,
      start_date TEXT NOT NULL,
      end_date TEXT,
      start_minutes INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price_cents INTEGER,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ENDED')),
      template_id TEXT,
      notes TEXT,
      generated_through TEXT,
      updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE recurring_series ADD COLUMN IF NOT EXISTS skip_holidays BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS schedule_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      service_type_id TEXT REFERENCES service_types(id),
      duration_minutes INTEGER NOT NULL,
      arrival_window_minutes INTEGER NOT NULL DEFAULT 60,
      pattern TEXT NOT NULL DEFAULT 'ONE_TIME' CHECK (pattern IN ('ONE_TIME','WEEKLY','EVERY_2_WEEKS','EVERY_4_WEEKS','MONTHLY_NTH_WEEKDAY','CUSTOM_WEEKDAYS')),
      weekdays TEXT,
      preferred_start_minutes INTEGER NOT NULL DEFAULT 540,
      default_crew_id TEXT,
      team_size INTEGER,
      notes TEXT,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS automation_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      key TEXT NOT NULL,
      enabled BOOLEAN NOT NULL,
      offset_minutes INTEGER,
      subject TEXT,
      body TEXT,
      updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS automation_settings_tenant_key_unique ON automation_settings(tenant_id, key);

    CREATE TABLE IF NOT EXISTS automation_sends (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      key TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS automation_sends_key_ref_unique ON automation_sends(tenant_id, key, ref_id);

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      spent_on TEXT NOT NULL,
      category TEXT NOT NULL,
      vendor TEXT,
      amount_cents INTEGER NOT NULL,
      notes TEXT,
      job_id TEXT,
      crew_id TEXT,
      created_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS kb_articles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      audience TEXT NOT NULL CHECK (audience IN ('PUBLIC','CLIENT','CREW','ADMIN')),
      kind TEXT NOT NULL CHECK (kind IN ('FAQ','SOP')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tags TEXT,
      published BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS tex_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      conversation_id TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('WEB','SMS','VOICE')),
      user_id TEXT,
      phone TEXT,
      author TEXT NOT NULL CHECK (author IN ('USER','TEX','STAFF')),
      body TEXT NOT NULL,
      sources TEXT,
      handoff BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tex_messages_conversation_idx ON tex_messages(tenant_id, conversation_id);

    CREATE TABLE IF NOT EXISTS sms_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      client_id TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
      from_number TEXT NOT NULL,
      to_number TEXT NOT NULL,
      body TEXT NOT NULL,
      twilio_sid TEXT,
      sent_by_user_id TEXT,
      sent_by_tex BOOLEAN NOT NULL DEFAULT false,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sms_messages_thread_idx ON sms_messages(tenant_id, from_number, to_number);

    CREATE TABLE IF NOT EXISTS room_ratings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      review_id TEXT NOT NULL REFERENCES reviews(id),
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      job_checklist_item_id TEXT NOT NULL REFERENCES job_checklist_items(id),
      room_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS room_ratings_item_unique ON room_ratings(job_checklist_item_id);

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      segment TEXT NOT NULL CHECK (segment IN ('ALL_ACTIVE','LAPSED','RECURRING','ONE_TIME','LEADS')),
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT')),
      sent_count INTEGER NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Post-construction and commercial lines (lib/serviceLines.ts).
    ALTER TABLE service_types ADD COLUMN IF NOT EXISTS offered BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pricing_json TEXT;

    -- Self-serve signup, status page (lib/signup.ts, lib/health.ts).
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS signup_open BOOLEAN NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS signup_requests (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('SIGNUP','WAITLIST')),
      email TEXT NOT NULL,
      name TEXT,
      company_name TEXT,
      phone TEXT,
      code_hash TEXT,
      expires_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0,
      ip TEXT,
      completed_at TIMESTAMPTZ,
      tenant_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS signup_requests_email_idx ON signup_requests(email);
    -- One company per texting number (only created if the data already allows it).
    DO $$ BEGIN
      IF NOT EXISTS (SELECT sms_number FROM tenants WHERE sms_number IS NOT NULL GROUP BY sms_number HAVING count(*) > 1) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS tenants_sms_number_unique ON tenants(sms_number) WHERE sms_number IS NOT NULL;
      END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS tex_actions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('RESCHEDULE','CANCEL','UPDATE_ACCOUNT','VERIFY')),
      payload_json TEXT,
      summary TEXT NOT NULL,
      code_hash TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','EXPIRED','CANCELLED','FAILED')),
      done_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tex_actions_conversation_idx ON tex_actions(tenant_id, conversation_id);
    CREATE TABLE IF NOT EXISTS heartbeats (
      key TEXT PRIMARY KEY,
      ran_at TIMESTAMPTZ NOT NULL,
      ok BOOLEAN NOT NULL,
      detail TEXT
    );

    -- Developers: company API keys and outgoing webhooks (lib/apiKeys.ts, lib/webhooks.ts).
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      created_by_user_id TEXT,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_unique ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON api_keys(tenant_id);
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      url TEXT NOT NULL,
      description TEXT,
      events TEXT NOT NULL DEFAULT '*',
      secret TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS webhook_endpoints_tenant_idx ON webhook_endpoints(tenant_id);
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCEEDED','FAILED')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ,
      last_status_code INTEGER,
      last_error TEXT,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx ON webhook_deliveries(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS webhook_deliveries_tenant_idx ON webhook_deliveries(tenant_id, created_at);

    -- Leads sent in by API (lib/inboundLeads.ts).
    CREATE TABLE IF NOT EXISTS inbound_leads (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      source TEXT NOT NULL DEFAULT 'API',
      name TEXT NOT NULL,
      phone TEXT,
      phone_key TEXT,
      email TEXT,
      address TEXT,
      service TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','CONVERTED','DISMISSED')),
      client_id TEXT REFERENCES users(id),
      api_key_id TEXT,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      last_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS inbound_leads_tenant_idx ON inbound_leads(tenant_id, status);
    CREATE INDEX IF NOT EXISTS inbound_leads_phone_idx ON inbound_leads(tenant_id, phone_key);
    CREATE INDEX IF NOT EXISTS inbound_leads_email_idx ON inbound_leads(tenant_id, email);

    -- Google Calendar sync (lib/googleCalendar.ts).
    CREATE TABLE IF NOT EXISTS calendar_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL DEFAULT 'GOOGLE',
      account_email TEXT,
      refresh_token TEXT NOT NULL,
      access_token TEXT,
      expires_at TIMESTAMPTZ,
      calendar_id TEXT NOT NULL DEFAULT 'primary',
      last_synced_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS calendar_connections_user_unique ON calendar_connections(user_id);
    CREATE INDEX IF NOT EXISTS calendar_connections_tenant_idx ON calendar_connections(tenant_id);
    CREATE TABLE IF NOT EXISTS calendar_event_links (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      event_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_links_user_booking_unique ON calendar_event_links(user_id, booking_id);

    -- Weather on the schedule (lib/weather.ts): which add-ons are done outside.
    ALTER TABLE add_on_services ADD COLUMN IF NOT EXISTS outdoor BOOLEAN;

    -- Background checks through Checkr (lib/checkr.ts).
    CREATE TABLE IF NOT EXISTS background_checks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      candidate_id TEXT NOT NULL,
      invitation_id TEXT,
      invitation_url TEXT,
      report_id TEXT,
      package TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'INVITED',
      result TEXT,
      work_state TEXT,
      work_city TEXT,
      requested_by_user_id TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS background_checks_candidate_idx ON background_checks(candidate_id);
    CREATE INDEX IF NOT EXISTS background_checks_tenant_user_idx ON background_checks(tenant_id, user_id);

    -- Xero and Gusto connections share the integrations table with QuickBooks.
    ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
    ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check CHECK (provider IN ('QUICKBOOKS','XERO','GUSTO'));
    -- Gusto push (lib/gusto.ts).
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS gusto_payroll_id TEXT;
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS gusto_pushed_at TIMESTAMPTZ;

    -- Xero sync (lib/xero.ts).
    CREATE TABLE IF NOT EXISTS xero_links (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      entity TEXT NOT NULL CHECK (entity IN ('CONTACT','INVOICE')),
      local_id TEXT NOT NULL,
      xero_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS xero_links_entity_unique ON xero_links(tenant_id, entity, local_id);

    -- Muse (lib/muse.ts, lib/meta.ts).
    CREATE TABLE IF NOT EXISTS ad_concepts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      title TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'META' CHECK (channel IN ('META','EMAIL','TEXT')),
      goal TEXT, angle TEXT,
      headline TEXT NOT NULL,
      primary_text TEXT NOT NULL,
      cta TEXT NOT NULL DEFAULT 'Book a free walkthrough',
      image_prompt TEXT,
      image_seed INTEGER NOT NULL DEFAULT 1,
      audience TEXT,
      segment TEXT CHECK (segment IN ('ALL_ACTIVE','LAPSED','RECURRING','ONE_TIME','LEADS')),
      zips TEXT,
      daily_budget_cents INTEGER,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PUBLISHED','ARCHIVED')),
      campaign_id TEXT, meta_campaign_id TEXT, meta_ad_id TEXT, created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ad_concepts_tenant_idx ON ad_concepts(tenant_id, status);
    CREATE TABLE IF NOT EXISTS meta_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT,
      token_sealed TEXT NOT NULL,
      ad_account_id TEXT, ad_account_name TEXT, page_id TEXT, page_name TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_tenant_unique ON meta_connections(tenant_id);

    -- Supply catalog and restock list (lib/restock.ts).
    CREATE TABLE IF NOT EXISTS supply_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      vendor TEXT NOT NULL DEFAULT 'AMAZON' CHECK (vendor IN ('AMAZON','WALMART','SAMS','COSTCO','HOME_DEPOT','GRAINGER','OTHER')),
      sku TEXT, url TEXT, pack_size TEXT,
      order_qty INTEGER NOT NULL DEFAULT 1,
      par_level INTEGER NOT NULL DEFAULT 0,
      on_hand INTEGER NOT NULL DEFAULT 0,
      archived BOOLEAN NOT NULL DEFAULT false,
      last_ordered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS supply_items_tenant_idx ON supply_items(tenant_id, archived);

    -- TrashCan plans and prepaid usage (lib/billing/*, docs/billing.md).
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'FREE';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_comp_until TIMESTAMPTZ;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_comp_forever BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_exempt BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_model_version INTEGER NOT NULL DEFAULT 0;
    -- Rows that existed before this column get 0 (and the one-time move
    -- below); every company created afterwards starts on the new model.
    ALTER TABLE tenants ALTER COLUMN billing_model_version SET DEFAULT 1;
    DO $$ BEGIN
      ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check CHECK (plan IN ('FREE','CREW','TEAM'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS wallets (
      tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
      balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
      auto_top_up_enabled BOOLEAN NOT NULL DEFAULT false,
      auto_top_up_threshold_cents INTEGER NOT NULL DEFAULT 500,
      auto_top_up_amount_cents INTEGER NOT NULL DEFAULT 2000,
      stripe_customer_id TEXT,
      default_payment_method_id TEXT,
      card_brand TEXT,
      card_last4 TEXT,
      included_texts_remaining INTEGER NOT NULL DEFAULT 0 CHECK (included_texts_remaining >= 0),
      included_voice_minutes_remaining INTEGER NOT NULL DEFAULT 0 CHECK (included_voice_minutes_remaining >= 0),
      allowance_reset_at TIMESTAMPTZ,
      texting_status TEXT NOT NULL DEFAULT 'NONE' CHECK (texting_status IN ('NONE','PENDING_PAYMENT','REGISTERING','ACTIVE','REJECTED','SUSPENDED')),
      number_paid_through TIMESTAMPTZ,
      low_balance_notified_at TIMESTAMPTZ,
      empty_notified_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      type TEXT NOT NULL CHECK (type IN ('TOPUP','DEBIT','REFUND','ADJUSTMENT','ALLOWANCE')),
      amount_cents INTEGER NOT NULL,
      balance_after_cents INTEGER NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('SMS','VOICE','PHONE_NUMBER','SETUP_FEE','TOPUP','MANUAL')),
      quantity INTEGER NOT NULL DEFAULT 0,
      ref TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS wallet_ledger_tenant_idx ON wallet_ledger(tenant_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_topup_ref_unique ON wallet_ledger(ref) WHERE type = 'TOPUP' AND ref IS NOT NULL;

    CREATE TABLE IF NOT EXISTS voice_calls (
      call_sid TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      minutes_charged INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One-time move to the plan model (billing_model_version 0 → 1):
    --  • 3U3 Cleaning — the platform owner's own company — becomes a house
    --    account on Team with no platform fee and no metered usage.
    --  • Every other company: trials and promo access stop expiring (Free
    --    never locks); a live paid subscription maps to Team.
    UPDATE tenants SET plan = 'TEAM', billing_exempt = true
      WHERE billing_model_version = 0 AND is_platform = false
        AND (name ILIKE '%3u3%' OR (
          NOT EXISTS (SELECT 1 FROM tenants t2 WHERE t2.is_platform = false AND t2.name ILIKE '%3u3%')
          AND id = (SELECT id FROM tenants t3 WHERE t3.is_platform = false ORDER BY t3.created_at ASC LIMIT 1)
        ));
    UPDATE tenants SET plan = 'TEAM'
      WHERE billing_model_version = 0 AND is_platform = false AND billing_exempt = false
        AND plan_status = 'ACTIVE' AND platform_stripe_subscription_id IS NOT NULL;
    UPDATE tenants SET plan_comp_forever = true, plan = 'TEAM'
      WHERE billing_model_version = 0 AND is_platform = false AND billing_exempt = false
        AND plan_status = 'ACTIVE' AND platform_stripe_subscription_id IS NULL AND access_expires_at IS NULL
        AND EXISTS (SELECT 1 FROM promo_code_redemptions r JOIN promo_codes p ON p.id = r.promo_code_id WHERE r.tenant_id = tenants.id AND p.tier = 'FOREVER');
    UPDATE tenants SET plan_status = 'ACTIVE', access_expires_at = NULL
      WHERE billing_model_version = 0 AND is_platform = false AND plan_status IN ('TRIALING','PAST_DUE','CANCELED');
    UPDATE tenants SET billing_model_version = 1 WHERE billing_model_version = 0;
  `);

  console.log('Schema pushed to Postgres.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
