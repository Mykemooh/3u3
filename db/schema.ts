import { pgTable, text, integer, real, doublePrecision, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Tenant (business) — originally a single row (3U3 Cleaning itself); now
// a real multi-tenant platform (lib/platform.ts, lib/tenantProvisioning.ts):
// a SUPER_ADMIN (platform owner, not a tenant's own ADMIN) creates a new
// company's tenant row from Admin → Platform, which provisions its whole
// starting stack (service types, checklist templates, a default crew, its
// first ADMIN user) the same way db/seed.ts always has for this one.
//
// One special row — isPlatform true — isn't a real cleaning business at
// all; it's just a home for SUPER_ADMIN users, who aren't scoped to any
// one tenant's operations.
// ---------------------------------------------------------------------------
export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  tagline: text('tagline'),
  primaryColor: text('primary_color').notNull().default('#2563EB'),
  inkColor: text('ink_color').notNull().default('#0B1F3B'),
  bronzeColor: text('bronze_color').notNull().default('#1D4ED8'),
  creamColor: text('cream_color').notNull().default('#EFF6FF'),
  logoUrl: text('logo_url'),
  serviceAreaRadiusMiles: integer('service_area_radius_miles').notNull().default(25),
  // Which subdomain (slug.<platform base domain>) or fully custom domain
  // resolves to this tenant for a signed-out visitor (lib/tenantResolution.ts)
  // — a signed-in user's own session.tenantId always wins over either.
  slug: text('slug').notNull(),
  customDomain: text('custom_domain'),
  // Marks the one non-business row SUPER_ADMIN users live under — never
  // shown in any company list, never billed, never access-gated.
  isPlatform: boolean('is_platform').notNull().default(false),
  // Platform billing (what this COMPANY pays 3U3 for platform access —
  // unrelated to anything this company bills its own clients). TRIALING/
  // ACTIVE with accessExpiresAt null means unlimited (a paid subscription
  // in good standing, or a "forever" promo code); a non-null
  // accessExpiresAt in the past means access has lapsed — see
  // lib/platform.ts isPlatformAccessActive, enforced in app/admin/layout.tsx.
  planStatus: text('plan_status', { enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED'] }).notNull().default('TRIALING'),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }),
  platformStripeCustomerId: text('platform_stripe_customer_id'),
  platformStripeSubscriptionId: text('platform_stripe_subscription_id'),
  // Payroll behavior the admin controls rather than the code deciding for
  // them (Admin → Settings) — each defaults to the option that matches
  // what the app already did before these existed, so adding them never
  // silently changes anyone's pay:
  //   percentPayBasis — what a PERCENTAGE-pay employee's cut is computed
  //     on: just the agreed cleaning price, or the full invoice including
  //     add-ons.
  //   hourlyPayModel — whether an HOURLY employee is paid for actual
  //     clocked time, or for the home's target clean time regardless of
  //     how long it actually took (rewards speed without cutting pay).
  //   tipSplitMethod — how a job's tip is divided across whoever was
  //     staffed on it.
  percentPayBasis: text('percent_pay_basis', { enum: ['BASE_PRICE', 'INVOICE_TOTAL'] }).notNull().default('BASE_PRICE'),
  hourlyPayModel: text('hourly_pay_model', { enum: ['ACTUAL_TIME', 'TARGET_TIME'] }).notNull().default('ACTUAL_TIME'),
  tipSplitMethod: text('tip_split_method', { enum: ['EVEN', 'BY_HOURS'] }).notNull().default('EVEN'),
  ...timestamps,
}, (t) => ({
  slugUnique: uniqueIndex('tenants_slug_unique').on(t.slug),
  customDomainUnique: uniqueIndex('tenants_custom_domain_unique').on(t.customDomain),
}));

// ---------------------------------------------------------------------------
// Users — one table for customers, cleaners, and admins, distinguished by
// role. Customers sign in by phone; staff sign in by email. Distinguishing
// new vs. returning customers is "does a User row with this phone exist".
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  // SUPER_ADMIN is the platform owner (Admin → Platform) — distinct from
  // a tenant's own ADMIN, which only ever manages its own company.
  role: text('role', { enum: ['CUSTOMER', 'CLEANER', 'ADMIN', 'SUPER_ADMIN'] }).notNull(),
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
  //   HOURLY     — clock-in/out time on each job (jobs.startedAt/
  //                completedAt) — or the home's target clean time instead,
  //                if tenants.hourlyPayModel is TARGET_TIME — times
  //                payRateCentsPerHour.
  //   PER_CLEAN  — a flat amount per job they're credited on ("per job"),
  //                times payRateCentsPerClean, regardless of how long it
  //                took or how many others worked it too.
  //   DAY_RATE   — a flat "full workday" amount, payRateCentsPerDay, for
  //                each calendar day they had at least one job.
  //   PERCENTAGE — payRatePercentBps (basis points, 1500 = 15.00%) of each
  //                job's price — the base cleaning price or the full
  //                invoice, per tenants.percentPayBasis.
  // All rates are nullable until an admin sets one.
  payType: text('pay_type', { enum: ['HOURLY', 'PER_CLEAN', 'DAY_RATE', 'PERCENTAGE'] }).notNull().default('HOURLY'),
  payRateCentsPerHour: integer('pay_rate_cents_per_hour'),
  payRateCentsPerClean: integer('pay_rate_cents_per_clean'),
  payRateCentsPerDay: integer('pay_rate_cents_per_day'),
  payRatePercentBps: integer('pay_rate_percent_bps'),
  // A CUSTOMER's one-time answer to "can we use your before/after photos
  // on social media?" (app/account/jobs/[id] — the before-and-after
  // gallery). Null = not asked yet; once set it's never asked again and
  // covers every future cleaning too, until the client changes it
  // themselves. True/false both count as "asked" — a decline is still a
  // recorded, respected answer, not a re-prompt.
  socialMediaConsent: boolean('social_media_consent'),
  socialMediaConsentAt: timestamp('social_media_consent_at', { withTimezone: true }),
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
  // "Cleaner needs to know" — the free-text catch-all a client can set
  // themselves from My Account. The structured home-profile fields below
  // are the same idea, broken into their own fields (mainly so the entry
  // code can be encrypted on its own, and so the admin can fill each in
  // separately during a quote walkthrough) — both are shown to the crew
  // together and must be acknowledged before a job can start (see
  // jobs.cleanerNotesAckAt).
  notes: text('notes'),
  // Captured during the quote process (app/new) or set later by the admin
  // or client — drives how many "Bedroom N" / "Bathroom N" entries a
  // job's checklist gets (lib/bookings.ts createBooking,
  // checklistTemplateItems.countBy). Null/1 keeps the plain singular name.
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  // How long this specific home should take to clean, set by the admin
  // (quote walkthrough or client profile) since home size/complexity
  // varies even within one service type. Falls back to the service's
  // own defaultDurationMinutes when null. Drives HOURLY pay when
  // tenants.hourlyPayModel is TARGET_TIME (lib/payroll.ts).
  targetCleanMinutes: integer('target_clean_minutes'),
  // Structured home profile (lib/homeProfile.ts) — set by the client, or
  // by the admin during the in-person quote walkthrough
  // (app/admin/leads/[id]/walkthrough). Per-room notes live in their own
  // table (addressRoomNotes) since there can be any number of them.
  pets: text('pets'),
  parkingNotes: text('parking_notes'),
  allergyNotes: text('allergy_notes'),
  doNotTouch: text('do_not_touch'),
  // AES-256-GCM ciphertext (lib/encryption.ts) — the plaintext alarm/entry
  // code is never stored, logged, or sent anywhere unencrypted; it's
  // decrypted only server-side, only for an admin or a crew member
  // actually assigned to a job at this address, only to render it on that
  // job's own page.
  entryCodeEncrypted: text('entry_code_encrypted'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).$onUpdate(() => new Date()),
  ...timestamps,
});

// Per-room notes on a home profile — "in the primary bedroom, the rug is
// an heirloom, vacuum only" — any number per address, each tied to a room
// name the admin or client typed in (not the checklist's own room list,
// since a home profile note can exist before a checklist ever has rooms).
export const addressRoomNotes = pgTable('address_room_notes', {
  id: id(),
  addressId: text('address_id').notNull().references(() => addresses.id),
  roomName: text('room_name').notNull(),
  notes: text('notes').notNull(),
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
  // Where this team's day starts/ends — admin-settable ("move a team to a
  // location"), and what lib/routeOptimization.ts measures drive time
  // from. Deliberately text, not lat/lng: this app never permanently
  // stores geocoded coordinates (see jobs.destLat/destLng above — Mapbox's
  // free geocoding tier only allows temporary use), so a crew's home base
  // is geocoded fresh, in memory, each time a route is optimized.
  homeAddressLine1: text('home_address_line1'),
  homeCity: text('home_city'),
  homeState: text('home_state'),
  homeZip: text('home_zip'),
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
  // When set (the seeded "Bedrooms"/"Bathrooms" rows), lib/bookings.ts
  // createBooking expands this one template item into one job checklist
  // item per actual room of that kind at the client's address
  // ("Bedroom 1", "Bedroom 2", ... / "Bathroom 1", "Bathroom 2", ...)
  // instead of a single generic entry — each gets its own before/after
  // photos like any other room. Null for every other room, which passes
  // through unchanged.
  countBy: text('count_by', { enum: ['BEDROOMS', 'BATHROOMS'] }),
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
// expiresAt (lib/mediaRetention.ts) is set on every row at upload time —
// photos default to 6 months, videos to 30 days, both overridable via
// PHOTO_RETENTION_DAYS / VIDEO_RETENTION_DAYS — and the daily clean-up job
// deletes the file once it passes, keeping storage inside the free tier.
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
  // How much of tipCents has already been claimed by a payroll run
  // (lib/payroll.ts) and paid out to the crew as reported tip wages —
  // never the whole tipCents at once if a tip arrives in installments or
  // after an earlier run already processed this job's hours.
  tipPaidOutCents: integer('tip_paid_out_cents').notNull().default(0),
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
  // Whichever sales/use tax is ever added (none exists yet) must sum
  // only taxable items for its base — a tip is the employee's money,
  // never the business's revenue, and is never itself taxed as a sale.
  taxable: boolean('taxable').notNull().default(true),
  // The one tip line item on this invoice (lib/tips.ts confirmTipPaid),
  // shown separately from — and excluded from invoice.totalCents and
  // the billable subtotal, which stay "what the business charged for
  // the clean" only. invoices.tipCents/tipPaidOutCents (not this row)
  // remains the source of truth payroll actually reads from; this row
  // exists so the tip shows up consistently alongside every other line
  // item, in exports and future tooling, not as a special case.
  isTip: boolean('is_tip').notNull().default(false),
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
  payType: text('pay_type', { enum: ['HOURLY', 'PER_CLEAN', 'DAY_RATE', 'PERCENTAGE'] }).notNull(),
  rateCents: integer('rate_cents').notNull(),
  // Only set (and only meaningful) for a PERCENTAGE entry — rateCents
  // stays 0 for those, since a percentage isn't a cents rate.
  ratePercentBps: integer('rate_percent_bps'),
  hours: real('hours').notNull().default(0),
  jobCount: integer('job_count').notNull().default(0),
  daysWorked: integer('days_worked').notNull().default(0),
  payCents: integer('pay_cents').notNull(),
  // Tip wages earned on jobs in this run — a separate reported-wages line,
  // never folded into payCents: a customer tip is taxable compensation
  // for the employee (IRS Topic 761), not a gift, and needs its own line
  // so it's taxed and reported the same way the rest of their pay is.
  // Split evenly across whoever was staffed on each tipped job.
  tipCents: integer('tip_cents').notNull().default(0),
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

// Exactly which invoice(s) a payroll entry's tipCents came from, and how
// much of each — so voidPayrollRun can precisely give the claimed amount
// back to invoices.tipPaidOutCents instead of just deleting the entry and
// losing track of it (payroll_entry_jobs is the same pattern, for hours).
export const payrollEntryTips = pgTable('payroll_entry_tips', {
  id: id(),
  payrollEntryId: text('payroll_entry_id').notNull().references(() => payrollEntries.id),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id),
  amountCents: integer('amount_cents').notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Standby requests (lib/standby.ts) — "I'd rather have this day; hold my
// spot and tell me if it opens up." Created from the booking wizard when a
// client's first-choice day has nothing open and they book an alternative
// instead. Whenever a booking is cancelled or moved off a date (lib/
// bookings.ts, lib/dispatch.ts), the freed day is checked against WAITING
// requests oldest-first; a match gets a time-boxed OFFERED link and, if it
// lapses or is declined, the next WAITING request for that day gets it.
// ---------------------------------------------------------------------------
export const standbyRequests = pgTable('standby_requests', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  clientId: text('client_id').notNull().references(() => users.id),
  serviceTypeId: text('service_type_id').notNull().references(() => serviceTypes.id),
  addressId: text('address_id').references(() => addresses.id),
  preferredDate: text('preferred_date').notNull(), // YYYY-MM-DD
  cadence: text('cadence', { enum: ['ONE_TIME', 'BIWEEKLY', 'MONTHLY'] }).notNull().default('ONE_TIME'),
  status: text('status', { enum: ['WAITING', 'OFFERED', 'BOOKED', 'EXPIRED', 'CANCELLED'] }).notNull().default('WAITING'),
  offerToken: text('offer_token'),
  offerCrewId: text('offer_crew_id').references(() => crews.id),
  offerSlotStart: text('offer_slot_start'),
  offerSlotEnd: text('offer_slot_end'),
  offerExpiresAt: timestamp('offer_expires_at', { withTimezone: true }),
  resultingBookingId: text('resulting_booking_id').references(() => bookings.id),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  ...timestamps,
}, (t) => ({
  offerTokenUnique: uniqueIndex('standby_requests_offer_token_unique').on(t.offerToken),
}));

// ---------------------------------------------------------------------------
// Add-on services (lib/addons.ts) — "Want to add a service for this
// clean?" on the booking wizard: a non-mandatory, tenant-wide catalog
// (admin-managed), with optional per-client pricing set during quote/
// client profile setup — mirrors clientRates exactly, just for add-ons
// instead of the base service. What a client actually picked is snapshot
// onto bookingAddOns (name + price at booking time), the same reasoning
// invoiceItems snapshots a description rather than re-deriving it later.
// ---------------------------------------------------------------------------
export const addOnServices = pgTable('add_on_services', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
  defaultPriceCents: integer('default_price_cents').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const clientAddOnRates = pgTable('client_add_on_rates', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  addOnServiceId: text('add_on_service_id').notNull().references(() => addOnServices.id),
  priceCents: integer('price_cents').notNull(),
  ...timestamps,
}, (t) => ({
  clientAddOnUnique: uniqueIndex('client_add_on_rates_unique').on(t.userId, t.addOnServiceId),
}));

export const bookingAddOns = pgTable('booking_add_ons', {
  id: id(),
  bookingId: text('booking_id').notNull().references(() => bookings.id),
  addOnServiceId: text('add_on_service_id').notNull().references(() => addOnServices.id),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Reviews (lib/reviews.ts) — prompted on the client's before-and-after
// gallery once a job is complete (one per booking). Every review reaches
// the admin portal first; "featured" is the admin's deliberate choice to
// show it in the landing page's testimonial carousel, so nothing a client
// writes goes public without a human picking it.
// ---------------------------------------------------------------------------
export const reviews = pgTable('reviews', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  bookingId: text('booking_id').notNull().references(() => bookings.id),
  clientId: text('client_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  featured: boolean('featured').notNull().default(false),
  ...timestamps,
}, (t) => ({
  bookingUnique: uniqueIndex('reviews_booking_unique').on(t.bookingId),
}));

// ---------------------------------------------------------------------------
// Supply reports (lib/supplies.ts) — a deliberately light way for a crew
// member to flag a product that's low, out, or damaged, from the crew
// portal: just a product name typed in free text and a status, no catalog
// to maintain. Tied to the crew/team (supplies are shared by a team, not
// an individual), and notifies the owner the moment one comes in.
// ---------------------------------------------------------------------------
export const supplyReports = pgTable('supply_reports', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  crewId: text('crew_id').notNull().references(() => crews.id),
  reportedByUserId: text('reported_by_user_id').notNull().references(() => users.id),
  productName: text('product_name').notNull(),
  status: text('status', { enum: ['LOW', 'OUT', 'DAMAGED'] }).notNull(),
  notes: text('notes'),
  resolved: boolean('resolved').notNull().default(false),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Platform promo codes (lib/platform.ts) — SUPER_ADMIN-managed codes a new
// company can redeem for free platform access instead of paying: a fixed
// trial length (1 or 3 months) or FOREVER (never expires). Each code can
// cap how many different companies may redeem it; a given company can
// never redeem the same code twice (promoCodeRedemptions' unique index).
// ---------------------------------------------------------------------------
export const promoCodes = pgTable('promo_codes', {
  id: id(),
  code: text('code').notNull(),
  tier: text('tier', { enum: ['TRIAL_1MO', 'TRIAL_3MO', 'FOREVER'] }).notNull(),
  // Redundant with `tier` but kept explicit rather than re-deriving it at
  // redemption time, so changing what "1 month" means later never
  // silently reinterprets an already-issued code.
  durationDays: integer('duration_days'),
  maxRedemptions: integer('max_redemptions'),
  redemptionCount: integer('redemption_count').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  ...timestamps,
}, (t) => ({
  codeUnique: uniqueIndex('promo_codes_code_unique').on(t.code),
}));

export const promoCodeRedemptions = pgTable('promo_code_redemptions', {
  id: id(),
  promoCodeId: text('promo_code_id').notNull().references(() => promoCodes.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  oncePerTenant: uniqueIndex('promo_code_redemptions_unique').on(t.promoCodeId, t.tenantId),
}));
