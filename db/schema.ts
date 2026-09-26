import { pgTable, text, integer, real, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Tenant (business) — V1 has exactly one row (3U3 Cleaning), but every
// customer-facing / operational entity is scoped to a tenant so the app is
// white-label-ready per PRD section 6.8.
// ---------------------------------------------------------------------------
export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  tagline: text('tagline'),
  primaryColor: text('primary_color').notNull().default('#2563EB'),
  inkColor: text('ink_color').notNull().default('#0B1F3B'),
  bronzeColor: text('bronze_color').notNull().default('#1D4ED8'),
  creamColor: text('cream_color').notNull().default('#EFF6FF'),
  serviceAreaRadiusMiles: integer('service_area_radius_miles').notNull().default(25),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Users — one table for customers, cleaners, and admins, distinguished by
// role. Customers sign in by phone; staff sign in by email. Distinguishing
// new vs. returning customers is "does a User row with this phone exist".
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  role: text('role', { enum: ['CUSTOMER', 'CLEANER', 'ADMIN'] }).notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  passwordHash: text('password_hash'),
  stripeCustomerId: text('stripe_customer_id'),
  ...timestamps,
}, (t) => ({
  phoneUnique: uniqueIndex('users_phone_unique').on(t.phone),
  emailUnique: uniqueIndex('users_email_unique').on(t.email),
}));

export const addresses = pgTable('addresses', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  line1: text('line1').notNull(),
  city: text('city').notNull().default('Katy'),
  state: text('state').notNull().default('TX'),
  zip: text('zip'),
  isPrimary: boolean('is_primary').notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Service types — Standard / Deep / Move-in-out / Airbnb turnover.
// Tenant-configurable duration per PRD 6.4. recurringEligible controls
// whether the cadence prompt (6.3) is shown for this service.
// ---------------------------------------------------------------------------
export const serviceTypes = pgTable('service_types', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  key: text('key', { enum: ['STANDARD', 'DEEP', 'MOVE_IN_OUT', 'AIRBNB'] }).notNull(),
  name: text('name').notNull(),
  defaultDurationMinutes: integer('default_duration_minutes').notNull(),
  recurringEligible: boolean('recurring_eligible').notNull().default(false),
  ...timestamps,
});

// Per-client agreed rate for a given service — "pricing is per client and
// per home, not a flat rate" (PRD 2 / 6.3).
export const clientRates = pgTable('client_rates', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  serviceTypeId: text('service_type_id').notNull().references(() => serviceTypes.id),
  rateCents: integer('rate_cents').notNull(),
  ...timestamps,
}, (t) => ({
  clientServiceUnique: uniqueIndex('client_rates_unique').on(t.userId, t.serviceTypeId),
}));

// ---------------------------------------------------------------------------
// Crews — the admin-side scheduling engine (PRD 6.4) reads its settings from
// here. V1 assumes a single crew/route.
// ---------------------------------------------------------------------------
export const crews = pgTable('crews', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  workStartMinutes: integer('work_start_minutes').notNull().default(8 * 60), // 8:00 AM
  workEndMinutes: integer('work_end_minutes').notNull().default(17 * 60), // 5:00 PM
  homesPerDay: integer('homes_per_day').notNull().default(3),
  commuteBufferMinutes: integer('commute_buffer_minutes').notNull().default(45),
  ...timestamps,
});

export const crewMembers = pgTable('crew_members', {
  id: id(),
  crewId: text('crew_id').notNull().references(() => crews.id),
  userId: text('user_id').notNull().references(() => users.id),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Checklist templates — one per (tenant, service type); items are the rooms
// / areas a cleaner must document. Instantiated onto a Job at booking time.
// ---------------------------------------------------------------------------
export const checklistTemplates = pgTable('checklist_templates', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  serviceTypeId: text('service_type_id').notNull().references(() => serviceTypes.id),
  name: text('name').notNull(),
  ...timestamps,
});

export const checklistTemplateItems = pgTable('checklist_template_items', {
  id: id(),
  templateId: text('template_id').notNull().references(() => checklistTemplates.id),
  roomName: text('room_name').notNull(),
  taskDetail: text('task_detail'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Bookings — covers both quote-visits (new-lead capture, PRD 6.2) and real
// cleaning jobs (PRD 6.3). isQuoteVisit distinguishes the two.
//
// slotStart/slotEnd are deliberately plain text, not a Postgres timestamp
// column: they hold naive "business-local wall-clock" strings
// (YYYY-MM-DDTHH:MM:00) that lib/scheduling.ts parses with simple string
// math — there's a single service area / timezone in V1, so no timezone
// conversion is wanted here.
// ---------------------------------------------------------------------------
export const bookings = pgTable('bookings', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  clientId: text('client_id').notNull().references(() => users.id),
  serviceTypeId: text('service_type_id').references(() => serviceTypes.id),
  crewId: text('crew_id').references(() => crews.id),
  addressId: text('address_id').references(() => addresses.id),
  slotStart: text('slot_start').notNull(),
  slotEnd: text('slot_end').notNull(),
  cadence: text('cadence', { enum: ['ONE_TIME', 'BIWEEKLY', 'MONTHLY'] }).notNull().default('ONE_TIME'),
  status: text('status', { enum: ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] }).notNull().default('CONFIRMED'),
  priceCents: integer('price_cents'),
  isQuoteVisit: boolean('is_quote_visit').notNull().default(false),
  ...timestamps,
}, (t) => ({
  // No double-booking: a crew cannot hold two active bookings starting at
  // the same instant (PRD section 8).
  crewSlotUnique: uniqueIndex('bookings_crew_slot_unique').on(t.crewId, t.slotStart),
}));

// ---------------------------------------------------------------------------
// Jobs — the cleaner-facing execution of a (non-quote-visit) booking.
// ---------------------------------------------------------------------------
export const jobs = pgTable('jobs', {
  id: id(),
  bookingId: text('booking_id').notNull().references(() => bookings.id),
  crewId: text('crew_id').notNull().references(() => crews.id),
  status: text('status', { enum: ['PENDING', 'IN_PROGRESS', 'COMPLETE'] }).notNull().default('PENDING'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  // Per-job photo policy, admin-editable (CrewJob settings panel): lets a
  // job opt out of the before photo, or of photo documentation entirely,
  // for service types where it doesn't make sense. Defaults preserve the
  // original behavior — before and after both required.
  requireBeforePhoto: boolean('require_before_photo').notNull().default(true),
  noPhotosNeeded: boolean('no_photos_needed').notNull().default(false),
  ...timestamps,
});

export const jobChecklistItems = pgTable('job_checklist_items', {
  id: id(),
  jobId: text('job_id').notNull().references(() => jobs.id),
  templateItemId: text('template_item_id').references(() => checklistTemplateItems.id),
  roomName: text('room_name').notNull(),
  taskDetail: text('task_detail'),
  sortOrder: integer('sort_order').notNull().default(0),
  status: text('status', { enum: ['PENDING', 'COMPLETE', 'SKIPPED'] }).notNull().default('PENDING'),
  skipReason: text('skip_reason'),
  beforePhotoPath: text('before_photo_path'),
  afterPhotoPath: text('after_photo_path'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Job media — every before/after photo and video, one row per file, per room.
// This is what the client's before-and-after gallery reads from. The two
// legacy columns on job_checklist_items (before/afterPhotoPath) are kept in
// step with the first photo of each phase so older code keeps working.
//
// expiresAt is set on videos only, when VIDEO_RETENTION_DAYS is configured:
// the daily clean-up job deletes the file after that, keeping storage
// inside the free tier. Photos are kept for good.
// ---------------------------------------------------------------------------
export const jobMedia = pgTable('job_media', {
  id: id(),
  jobId: text('job_id').notNull().references(() => jobs.id),
  itemId: text('item_id').notNull().references(() => jobChecklistItems.id),
  phase: text('phase', { enum: ['BEFORE', 'AFTER'] }).notNull(),
  kind: text('kind', { enum: ['PHOTO', 'VIDEO'] }).notNull(),
  url: text('url').notNull(),
  storageKey: text('storage_key'),
  contentType: text('content_type'),
  sizeBytes: integer('size_bytes'),
  durationSeconds: real('duration_seconds'),
  uploadedBy: text('uploaded_by').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Estimates — the missing middle of the lifecycle. A quote visit (above)
// only books the walkthrough; this is what comes out of it. The admin
// builds priced line items, sends it, and the client approves or declines
// with one click from the email.
//
// approvalToken is a capability URL secret (a long random string, unique,
// only ever set when the estimate is sent) rather than a signed JWT: the
// client has no account yet at this point, so there is nothing to
// authenticate against, and this is the same pattern Stripe's own hosted
// invoice links use. Approving writes the agreed rate into client_rates,
// which is exactly what unlocks the existing returning-customer booking
// flow — so approval feeds straight into scheduling with no admin step in
// between.
// ---------------------------------------------------------------------------
export const quotes = pgTable('quotes', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  clientId: text('client_id').notNull().references(() => users.id),
  // The walkthrough this estimate came out of. Nullable because an admin
  // can also write an estimate for an existing client without a visit.
  quoteVisitBookingId: text('quote_visit_booking_id').references(() => bookings.id),
  serviceTypeId: text('service_type_id').notNull().references(() => serviceTypes.id),
  status: text('status', { enum: ['DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'EXPIRED'] })
    .notNull()
    .default('DRAFT'),
  totalCents: integer('total_cents').notNull().default(0),
  notes: text('notes'),
  approvalToken: text('approval_token'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  ...timestamps,
}, (t) => ({
  tokenUnique: uniqueIndex('quotes_approval_token_unique').on(t.approvalToken),
}));

export const quoteItems = pgTable('quote_items', {
  id: id(),
  quoteId: text('quote_id').notNull().references(() => quotes.id),
  description: text('description').notNull(),
  amountCents: integer('amount_cents').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Invoices — the quote → job → invoice → payment → receipt tail end. One
// invoice per (non-quote-visit) booking, auto-drafted the moment its job is
// marked COMPLETE (see lib/invoices.ts), reviewed/edited by the admin, then
// finalized as a real Stripe Invoice (send_invoice collection method) —
// which is what gives us a branded, Stripe-hosted pay page and PDF ("use
// templates for invoicing") without inventing our own. Receipt delivery
// and "paid" status both come from Stripe (webhook), not guessed
// client-side.
// ---------------------------------------------------------------------------
export const invoices = pgTable('invoices', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  bookingId: text('booking_id').notNull().references(() => bookings.id),
  clientId: text('client_id').notNull().references(() => users.id),
  status: text('status', { enum: ['DRAFT', 'SENT', 'PAID', 'VOID'] }).notNull().default('DRAFT'),
  totalCents: integer('total_cents').notNull().default(0),
  stripeInvoiceId: text('stripe_invoice_id'),
  hostedInvoiceUrl: text('hosted_invoice_url'),
  invoicePdfUrl: text('invoice_pdf_url'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  // Human-facing sequential number (1001, 1002, ...) printed on the invoice.
  invoiceNumber: integer('invoice_number'),
  receiptUrl: text('receipt_url'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  ...timestamps,
}, (t) => ({
  bookingUnique: uniqueIndex('invoices_booking_unique').on(t.bookingId),
}));

export const invoiceItems = pgTable('invoice_items', {
  id: id(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id),
  description: text('description').notNull(),
  amountCents: integer('amount_cents').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Notification log — supports the cost-tracking goal in PRD section 3.
// ---------------------------------------------------------------------------
export const notificationLog = pgTable('notification_log', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  channel: text('channel', { enum: ['EMAIL', 'SMS'] }).notNull(),
  recipient: text('recipient').notNull(),
  triggerEvent: text('trigger_event').notNull(),
  costCents: real('cost_cents').notNull().default(0),
  status: text('status', { enum: ['SENT', 'FAILED', 'RETRIED'] }).notNull().default('SENT'),
  relatedBookingId: text('related_booking_id').references(() => bookings.id),
  ...timestamps,
});
