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
  `);

  console.log('Schema pushed to Postgres.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
