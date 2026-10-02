import { pgTable, text, integer, real, doublePrecision, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

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
  // Job title for CLEANER users. A Team Lead is the one who starts the
  // trip and finishes the job (lib/team.ts canLeadJob); the others open
  // jobs and document rooms. Null for customers and admins.
  staffRole: text('staff_role', { enum: ['TEAM_LEAD', 'CLEANER', 'JR_CLEANER'] }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  passwordHash: text('password_hash'),
  stripeCustomerId: text('stripe_customer_id'),
  // Set whenever a new client is created (lead capture or admin-added) so
  // they can be emailed a "create your password" link — see lib/passwordSetup.ts.
  // Cleared the moment it's used, so a link only ever works once.
  passwordSetupToken: text('password_setup_token'),
  passwordSetupExpiresAt: timestamp('password_setup_expires_at', { withTimezone: true }),
  // Last time a "forgot password" link was sent (lib/passwordReset.ts), so
  // the form can't be used to flood someone's inbox or phone.
  passwordResetSentAt: timestamp('password_reset_sent_at', { withTimezone: true }),
  // Admin "close client" toggle (closed clients can't sign in or book, but
  // their history is kept, not deleted).
  isActive: boolean('is_active').notNull().default(true),
  avatarUrl: text('avatar_url'),
  // Saved payment method for autopay — only ever an opaque Stripe
  // PaymentMethod id. brand/last4/exp are non-sensitive display fields
  // Stripe returns about that method; the actual card number never
  // touches our server or database (PCI scope stays with Stripe).
  stripeDefaultPaymentMethodId: text('stripe_default_payment_method_id'),
  paymentMethodBrand: text('payment_method_brand'),
  paymentMethodLast4: text('payment_method_last4'),
  paymentMethodExpMonth: integer('payment_method_exp_month'),
  paymentMethodExpYear: integer('payment_method_exp_year'),
  autopayEnabled: boolean('autopay_enabled').notNull().default(false),
  // Where reminders and alerts go for this person — a customer picks this
  // in My Account; defaults to email until they choose otherwise.
  notificationChannel: text('notification_channel', { enum: ['EMAIL', 'SMS', 'WHATSAPP'] })
    .notNull()
    .default('EMAIL'),
  // How a CLEANER is paid (Admin → Team / Add employee), and the rate for
  // whichever one applies — the input to payroll (lib/payroll.ts):
  //   HOURLY    — actual clock-in/out time on each job (jobs.startedAt/
  //               completedAt), times payRateCentsPerHour.
  //   PER_CLEAN — a flat amount per job they're credited on, times
  //               payRateCentsPerClean, regardless of how long it took or
  //               how many others worked it too.
  //   DAY_RATE  — a flat "full workday" amount, payRateCentsPerDay, for
  //               each calendar day they had at least one job.
  // All three rates are nullable until an admin sets one.
  payType: text('pay_type', { enum: ['HOURLY', 'PER_CLEAN', 'DAY_RATE'] }).notNull().default('HOURLY'),
  payRateCentsPerHour: integer('pay_rate_cents_per_hour'),
  payRateCentsPerClean: integer('pay_rate_cents_per_clean'),
  payRateCentsPerDay: integer('pay_rate_cents_per_day'),
  ...timestamps,
}, (t) => ({
  phoneUnique: uniqueIndex('users_phone_unique').on(t.phone),
  passwordSetupTokenUnique: uniqueIndex('users_password_setup_token_unique').on(t.passwordSetupToken),
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
  // "Cleaner needs to know" — pets, gate/lockbox codes, parking, anything
  // the crew should see before they start. Client-editable from My
  // Account; shown to the crew on the job and must be acknowledged
  // before they can start (see jobs.cleanerNotesAckAt).
  notes: text('notes'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).$onUpdate(() => new Date()),
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
  // Whether customers can book this team online. Teams created from the
  // Team page start switched off, so an empty team never opens slots.
  acceptsBookings: boolean('accepts_bookings').notNull().default(true),
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
  // Upcoming-cleaning reminders (lib/reminders.ts, cron-driven): set the
  // first time each has gone out, so a booking never gets the same
  // reminder twice no matter how often the cron runs.
  reminder3dSentAt: timestamp('reminder_3d_sent_at', { withTimezone: true }),
  reminder36hSentAt: timestamp('reminder_36h_sent_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).$onUpdate(() => new Date()),
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
  // PENDING → EN_ROUTE (crew tapped "Start driving") → IN_PROGRESS (on
  // site, "Start job") → COMPLETE. EN_ROUTE is optional: a crew can go
  // straight from PENDING to IN_PROGRESS.
  status: text('status', { enum: ['PENDING', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETE'] }).notNull().default('PENDING'),
  enRouteAt: timestamp('en_route_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  // Per-job photo policy, admin-editable (CrewJob settings panel): lets a
  // job opt out of the before photo, or of photo documentation entirely,
  // for service types where it doesn't make sense. Defaults preserve the
  // original behavior — before and after both required.
  requireBeforePhoto: boolean('require_before_photo').notNull().default(true),
  noPhotosNeeded: boolean('no_photos_needed').notNull().default(false),
  // Set the moment the crew lead acknowledges the property's "cleaner
  // needs to know" notes — gates the "I've arrived — start job" button in
  // the crew app when there's something on file (components/CrewJob.tsx).
  // Null when there was nothing to acknowledge, or it hasn't happened yet.
  cleanerNotesAckAt: timestamp('cleaner_notes_ack_at', { withTimezone: true }),
  // Live tracking while EN_ROUTE — only the crew's latest position is kept,
  // never a history, and all of it is cleared the moment they arrive.
  // routeGeojson / routeDurationSeconds are the last Mapbox Directions
  // result, cached here so the client's map polls the database, not Mapbox.
  // destLat/destLng: the client's address geocoded for this trip only —
  // Mapbox's free geocoding allows temporary use, not permanent storage.
  destLat: doublePrecision('dest_lat'),
  destLng: doublePrecision('dest_lng'),
  crewLat: doublePrecision('crew_lat'),
  crewLng: doublePrecision('crew_lng'),
  crewLocationAt: timestamp('crew_location_at', { withTimezone: true }),
  routeGeojson: text('route_geojson'),
  routeDurationSeconds: integer('route_duration_seconds'),
  routeUpdatedAt: timestamp('route_updated_at', { withTimezone: true }),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Per-job staffing swaps. A job is staffed by its team's members by
// default; ADD puts someone from elsewhere on this one job, REMOVE takes a
// team member off it. No rows = the team as-is. Cleared when the job moves
// to a different team (lib/dispatch.ts).
// ---------------------------------------------------------------------------
export const jobStaff = pgTable('job_staff', {
  id: id(),
  jobId: text('job_id').notNull().references(() => jobs.id),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action', { enum: ['ADD', 'REMOVE'] }).notNull(),
  ...timestamps,
}, (t) => ({
  jobUserUnique: uniqueIndex('job_staff_job_user_unique').on(t.jobId, t.userId),
}));

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
  // Follow-up cadence for a SENT quote nobody has answered yet
  // (lib/reminders.ts): 24h, then +3d, then +2d, then weekly — each send
  // bumps reminderCount and lastReminderAt. remindersOptedOut is set by
  // the "stop these reminders" link every reminder carries.
  reminderCount: integer('reminder_count').notNull().default(0),
  lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
  remindersOptedOut: boolean('reminders_opted_out').notNull().default(false),
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
  // A tip the client added on top of the invoice total, paid separately
  // via its own small Stripe Checkout session (the main invoice is
  // already finalized at a fixed amount by the time a tip is possible) —
  // see lib/tips.ts. Counted into nothing else; purely additive.
  tipCents: integer('tip_cents').notNull().default(0),
  // Whether this invoice was paid by autopay (client.autopayEnabled) vs.
  // the usual emailed pay-link, purely informational for the admin.
  autopayCharged: boolean('autopay_charged').notNull().default(false),
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
  channel: text('channel', { enum: ['EMAIL', 'SMS', 'WHATSAPP'] }).notNull(),
  recipient: text('recipient').notNull(),
  triggerEvent: text('trigger_event').notNull(),
  costCents: real('cost_cents').notNull().default(0),
  status: text('status', { enum: ['SENT', 'FAILED', 'RETRIED'] }).notNull().default('SENT'),
  relatedBookingId: text('related_booking_id').references(() => bookings.id),
  // Drives the admin "Alerts" feed (a client changed their own address,
  // frequency, time or cancelled) — separate from the SENT/FAILED/RETRIED
  // delivery status above.
  isRead: boolean('is_read').notNull().default(false),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Third-party accounting/payroll connections (QuickBooks Online today —
// lib/quickbooks.ts). One row per tenant per provider, OAuth tokens only.
// Nothing here is required: every caller checks for a connected row first
// and no-ops (same graceful-degradation pattern as Stripe/Twilio) when
// there isn't one.
// ---------------------------------------------------------------------------
export const integrations = pgTable('integrations', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  provider: text('provider', { enum: ['QUICKBOOKS'] }).notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  // QuickBooks' "realm id" — which company file these tokens authorize.
  externalAccountId: text('external_account_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).$onUpdate(() => new Date()),
}, (t) => ({
  tenantProviderUnique: uniqueIndex('integrations_tenant_provider_unique').on(t.tenantId, t.provider),
}));

// Maps our own users/invoices to QuickBooks' ids once each has been synced
// once, so a repeat sync updates instead of duplicating.
export const quickbooksLinks = pgTable('quickbooks_links', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  entity: text('entity', { enum: ['CUSTOMER', 'INVOICE'] }).notNull(),
  localId: text('local_id').notNull(),
  quickbooksId: text('quickbooks_id').notNull(),
  ...timestamps,
}, (t) => ({
  entityUnique: uniqueIndex('quickbooks_links_entity_unique').on(t.tenantId, t.entity, t.localId),
}));

// ---------------------------------------------------------------------------
// Payroll (lib/payroll.ts) — Admin → Payroll turns the hours/pay numbers
// into a real run → review → mark-as-paid workflow, not just a report:
// a payroll_run is one pay period; a payroll_entry is one employee's pay
// within it (rate and totals are snapshotted at creation time, so a later
// rate change never rewrites history); payroll_entry_jobs records exactly
// which jobs each entry counted, with a unique (job, employee) index —
// that's what makes a job physically impossible to pay out twice for the
// same person, no matter what date range a later run is generated for.
// ---------------------------------------------------------------------------
export const payrollRuns = pgTable('payroll_runs', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  label: text('label').notNull(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  status: text('status', { enum: ['OPEN', 'PAID'] }).notNull().default('OPEN'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  ...timestamps,
});

export const payrollEntries = pgTable('payroll_entries', {
  id: id(),
  payrollRunId: text('payroll_run_id').notNull().references(() => payrollRuns.id),
  userId: text('user_id').notNull().references(() => users.id),
  // Snapshotted from the employee at the moment the run was created.
  payType: text('pay_type', { enum: ['HOURLY', 'PER_CLEAN', 'DAY_RATE'] }).notNull(),
  rateCents: integer('rate_cents').notNull(),
  hours: real('hours').notNull().default(0),
  jobCount: integer('job_count').notNull().default(0),
  daysWorked: integer('days_worked').notNull().default(0),
  payCents: integer('pay_cents').notNull(),
  ...timestamps,
});

export const payrollEntryJobs = pgTable('payroll_entry_jobs', {
  id: id(),
  payrollEntryId: text('payroll_entry_id').notNull().references(() => payrollEntries.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  userId: text('user_id').notNull().references(() => users.id),
  ...timestamps,
}, (t) => ({
  jobUserUnique: uniqueIndex('payroll_entry_jobs_job_user_unique').on(t.jobId, t.userId),
}));
