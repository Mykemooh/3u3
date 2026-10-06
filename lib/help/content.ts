/**
 * The product's own help: FAQs for clients and SOPs (standard operating
 * procedures) for crews and the office, written against what the app
 * actually does. Every company gets these; a company adds its own
 * articles in Admin → Help & SOPs (kb_articles), and Tex answers from both
 * — the company's own first.
 *
 * Bodies use a tiny format the help pages render: blank line between
 * paragraphs, "- " for bullets, "1. " for steps, "## " for a subheading.
 * {company} becomes the company's name.
 */

export type Audience = 'PUBLIC' | 'CLIENT' | 'CREW' | 'ADMIN';
export type HelpArticle = {
  slug: string;
  title: string;
  kind: 'FAQ' | 'SOP';
  audience: Audience[];
  section: string;
  tags: string[];
  body: string;
};

export const HELP_ARTICLES: HelpArticle[] = [
  // ---------------------------------------------------------------- Clients
  {
    slug: 'how-pricing-works',
    title: 'How is my price set?',
    kind: 'FAQ',
    audience: ['PUBLIC', 'CLIENT'],
    section: 'Booking and pricing',
    tags: ['price', 'cost', 'quote', 'estimate', 'how much', 'walkthrough'],
    body: `{company} prices every home in person. Someone comes for a free walkthrough, looks at the home and what you want done, and you get a written quote you can approve from your phone.

There is no price list online on purpose: two homes with the same number of bedrooms can take very different amounts of work, and a guessed price usually changes at the door.

Once you approve, that price is your agreed rate for that kind of clean, and you can book it yourself from your account.`,
  },
  {
    slug: 'book-a-walkthrough',
    title: 'How do I get a quote?',
    kind: 'FAQ',
    audience: ['PUBLIC'],
    section: 'Booking and pricing',
    tags: ['quote', 'book', 'walkthrough', 'estimate', 'start', 'new client'],
    body: `Request a free walkthrough from the website — pick the kind of cleaning, add your details and choose a time. It takes about two minutes and needs no account or card.

For post-construction and commercial cleaning you will also answer a few questions about the project or space (square footage, how often, which phases), so the walkthrough is about confirming details.

After the walkthrough you get a written quote by email with Approve and Decline buttons. Quotes are good for 30 days.`,
  },
  {
    slug: 'what-is-included',
    title: 'What is included in each kind of clean?',
    kind: 'FAQ',
    audience: ['PUBLIC', 'CLIENT'],
    section: 'Booking and pricing',
    tags: ['included', 'checklist', 'standard', 'deep', 'move', 'services', 'what do you clean'],
    body: `Every clean follows a room-by-room checklist, so the same things get done every visit. The Services pages list exactly what each clean covers and what it does not.

- Standard clean: the regular upkeep — kitchen, bathrooms, dusting, floors.
- Deep clean: everything in a standard clean plus baseboards, inside the microwave, grout detail and other build-up.
- Move-in / move-out: an empty-home deep clean, including inside cabinets, the oven and the fridge.
- Post-construction: rough, final and touch-up cleans after building work.
- Commercial: offices and workplaces on a schedule.

Extras such as inside the oven or fridge, interior windows or laundry can be added to a booking.`,
  },
  {
    slug: 'reschedule-or-cancel',
    title: 'Can I reschedule or cancel?',
    kind: 'FAQ',
    audience: ['PUBLIC', 'CLIENT'],
    section: 'Your cleans',
    tags: ['reschedule', 'cancel', 'change', 'move', 'date', 'time', '24 hours'],
    body: `Yes. From your account you can move or cancel a clean up to 24 hours before it starts. Inside 24 hours, call or text {company} and they will sort it out with you.

If you have a repeating schedule, moving one visit only moves that visit — the rest of your schedule stays as it was.`,
  },
  {
    slug: 'phone-pin',
    title: 'What is the phone PIN?',
    kind: 'FAQ',
    audience: ['PUBLIC', 'CLIENT'],
    section: 'Your account',
    tags: ['pin', 'phone', 'call', 'text', 'verify', 'security', 'code', 'identity'],
    body: `Your phone PIN is 4 digits you choose in Account → Settings. When you call or text {company}, say the PIN and Tex knows it's really you, so it can look up your cleans, move one, or update your notes without sending a code.

Tex never repeats your PIN and it isn't saved in the conversation. After five wrong tries it pauses PIN checks on your account for a while. If you haven't set one, Tex can text a one-time code to the number on file instead.`,
  },
  {
    slug: 'what-to-prepare',
    title: 'How should I get ready for a clean?',
    kind: 'FAQ',
    audience: ['PUBLIC', 'CLIENT'],
    section: 'Your cleans',
    tags: ['prepare', 'ready', 'clutter', 'pets', 'dog', 'cat', 'home', 'before'],
    body: `You do not need to clean before the cleaners come. A few things help the crew spend their time on cleaning:

- Pick up things on the floor and counters you want left exactly where they are.
- Let the team know about pets, and whether they should be kept in a room.
- Leave a note for anything fragile or off-limits, or anything you want extra attention on.

You can add notes for the crew on any upcoming clean in your account, and keep standing notes (pets, parking, do-not-touch items) in your home profile.`,
  },
  {
    slug: 'entry-and-access',
    title: 'Do I need to be home?',
    kind: 'FAQ',
    audience: ['PUBLIC', 'CLIENT'],
    section: 'Your cleans',
    tags: ['home', 'key', 'code', 'lockbox', 'garage', 'entry', 'access', 'door'],
    body: `No. Many clients are at work. Add your entry details (door code, lockbox, garage code) to your home profile in your account. Entry codes are stored encrypted and shown only to the crew on your clean's job page, hidden until they tap to reveal them.

If anything changes — a new code, an alarm — update your home profile or text {company} before the clean.`,
  },
  {
    slug: 'crew-on-the-way',
    title: 'How do I know when the crew is coming?',
    kind: 'FAQ',
    audience: ['CLIENT'],
    section: 'Your cleans',
    tags: ['arrive', 'eta', 'on the way', 'track', 'map', 'when', 'late'],
    body: `You get reminders before each clean, then a message when the crew starts driving, with a link to follow them on a map and an arrival estimate.

Your clean has an arrival window rather than an exact minute, because the clean before yours can run a little long.`,
  },
  {
    slug: 'before-and-after-photos',
    title: 'Where are my before-and-after photos?',
    kind: 'FAQ',
    audience: ['CLIENT'],
    section: 'After the clean',
    tags: ['photos', 'pictures', 'before', 'after', 'proof', 'gallery', 'video'],
    body: `When the crew finishes you get a message with a link to the before-and-after photos of every room. They are also in your account under past cleans.

You can share a proof-of-clean link (city only, never your address) from the clean's page — handy for landlords and property managers. Photos are kept for 6 months.`,
  },
  {
    slug: 'not-happy',
    title: 'Something wasn’t right — what happens?',
    kind: 'FAQ',
    audience: ['CLIENT'],
    section: 'After the clean',
    tags: ['unhappy', 'missed', 'complaint', 'reclean', 're-clean', 'problem', 'rating', 'review'],
    body: `Rate the clean room by room from your account. Any room rated 2 stars or lower goes straight to the owner as a re-clean request, and they will contact you to put it right.

You can also reply to any message from {company} — a real person reads them.`,
  },
  {
    slug: 'paying',
    title: 'How do I pay?',
    kind: 'FAQ',
    audience: ['PUBLIC', 'CLIENT'],
    section: 'Payments',
    tags: ['pay', 'payment', 'card', 'invoice', 'autopay', 'bill', 'cash', 'receipt'],
    body: `After each clean you get an invoice you can pay online by card. Card details are handled by Stripe and never stored by {company}.

- Autopay: save a card in your account and turn on autopay, and each clean is charged when it is finished.
- Monthly billing: some clients (often offices) get one statement a month for all their visits.
- Receipts: every payment has a receipt in your account under Invoices.`,
  },
  {
    slug: 'tipping',
    title: 'Can I tip the crew?',
    kind: 'FAQ',
    audience: ['CLIENT'],
    section: 'Payments',
    tags: ['tip', 'gratuity', 'thank', 'crew'],
    body: `Yes, from the invoice page after your clean. The whole tip goes to the crew who cleaned your home and is paid out with their wages.`,
  },
  {
    slug: 'reminders-and-texts',
    title: 'How do I change how you contact me?',
    kind: 'FAQ',
    audience: ['CLIENT'],
    section: 'Your account',
    tags: ['text', 'sms', 'email', 'whatsapp', 'notifications', 'stop', 'unsubscribe', 'reminders'],
    body: `In your account settings, choose email, text or WhatsApp for reminders and updates.

- Reply STOP to any text to stop texts; START turns them back on.
- News and offers by email have an unsubscribe link. Reminders and invoices still come.`,
  },
  {
    slug: 'referrals',
    title: 'Do you have a referral program?',
    kind: 'FAQ',
    audience: ['CLIENT'],
    section: 'Your account',
    tags: ['refer', 'referral', 'friend', 'credit', 'discount'],
    body: `If {company} runs referrals, your account shows your own link. When a friend books through it and has their first clean, you both get credit, which comes off your next invoice automatically.`,
  },
  {
    slug: 'standby-list',
    title: 'The day I want is full — can I wait for an opening?',
    kind: 'FAQ',
    audience: ['CLIENT'],
    section: 'Your cleans',
    tags: ['full', 'waitlist', 'standby', 'opening', 'cancellation', 'available'],
    body: `Yes. Ask to be held on standby for that day when you book. If a spot opens, you get a message and the first person to claim it gets it.`,
  },
  {
    slug: 'post-construction-faq',
    title: 'How does post-construction cleaning work?',
    kind: 'FAQ',
    audience: ['PUBLIC'],
    section: 'Post-construction and commercial',
    tags: ['post-construction', 'construction', 'builder', 'renovation', 'remodel', 'new build', 'dust', 'phases'],
    body: `Construction dust settles in waves, so the work comes in phases:

- Rough clean, while trades are finishing: debris out, heavy dust down.
- Final clean, once construction ends: every surface top to bottom, stickers and film off.
- Touch-up, right before handover or move-in.

You choose which phases you need. Each is priced in writing after a walkthrough of the site and scheduled around your builder. Power and water need to be on for the final clean.`,
  },
  {
    slug: 'commercial-faq',
    title: 'How does commercial cleaning work?',
    kind: 'FAQ',
    audience: ['PUBLIC'],
    section: 'Post-construction and commercial',
    tags: ['commercial', 'office', 'business', 'medical', 'after hours', 'contract', 'monthly'],
    body: `After a walkthrough of your space you get one monthly price based on its size and how often you want cleaning. Visits can be after hours, during the day or at weekends.

You are billed once a month for the visits that actually happened. Restroom paper and soap can be supplied by {company} or by you.`,
  },

  // -------------------------------------------------------------- Crew SOPs
  {
    slug: 'sop-crew-day',
    title: 'Your day in the app',
    kind: 'SOP',
    audience: ['CREW'],
    section: 'Doing the job',
    tags: ['today', 'jobs', 'schedule', 'dashboard', 'start', 'day'],
    body: `Your home screen shows today's cleans, the week ahead with who you are working with, what you have earned this pay period and your next payday.

1. Open today's first clean to see the address, the client's notes and the checklist.
2. Tap Start driving when you leave — the client is told you are on the way.
3. When you arrive, tap I've arrived — start job. Anyone on the team can start the clock.
4. Work room by room (see Rooms, photos and timers).
5. The team lead finishes the job when every room is done.`,
  },
  {
    slug: 'sop-rooms-photos',
    title: 'Rooms, photos and timers',
    kind: 'SOP',
    audience: ['CREW'],
    section: 'Doing the job',
    tags: ['photo', 'before', 'after', 'room', 'timer', 'checklist', 'skip'],
    body: `Every room on the checklist has its own before and after photos and a timer.

1. Open the room — its timer starts counting up.
2. Take the before photo from the doorway, showing the whole room.
3. Clean the room using the checklist.
4. Take the after photo from the same spot.
5. Mark the room done — the timer stops.

## If you can't clean a room
Skip it and say why (locked, client asked, unsafe). The client and the office both see the reason.

## Why it matters
Photos are the client's proof of the clean and your protection if something is questioned. Room times show how long homes really take, so schedules and pay stay fair.`,
  },
  {
    slug: 'sop-finishing',
    title: 'Finishing a job',
    kind: 'SOP',
    audience: ['CREW'],
    section: 'Doing the job',
    tags: ['finish', 'complete', 'done', 'lead', 'leave', 'lock'],
    body: `1. Check every room is done or skipped with a reason.
2. Walk the home once: lights, doors, anything moved put back.
3. Lock up exactly as the home profile says, and set the alarm if there is one.
4. The team lead taps Finish job. The client gets the before-and-after photos straight away and the invoice is prepared.

Only the team lead can finish a job when a lead is on it.`,
  },
  {
    slug: 'sop-offline',
    title: 'No signal in the home',
    kind: 'SOP',
    audience: ['CREW'],
    section: 'Doing the job',
    tags: ['offline', 'signal', 'internet', 'wifi', 'sync', 'upload'],
    body: `Keep working. The app saves your photos, ticks and timers on the phone and sends them when you get signal again. Don't close the app or clear it from memory until the queue shows everything has synced.`,
  },
  {
    slug: 'sop-entry-safety',
    title: 'Entry codes, keys and safety',
    kind: 'SOP',
    audience: ['CREW'],
    section: 'Homes and clients',
    tags: ['code', 'key', 'alarm', 'pet', 'dog', 'safety', 'chemical', 'unsafe'],
    body: `- Entry codes are hidden on the job page until you tap to show them. Never write them down or share them.
- Read the home profile before you go in: pets, alarms, do-not-touch items, allergies.
- Never mix cleaning chemicals, and keep products out of reach of children and pets.
- If you feel unsafe, leave and call the office. Your safety comes before the clean.
- If you break or damage something, photograph it and tell the office the same day.`,
  },
  {
    slug: 'sop-supplies',
    title: 'Running low on supplies',
    kind: 'SOP',
    audience: ['CREW'],
    section: 'Homes and clients',
    tags: ['supplies', 'restock', 'chemicals', 'products', 'running low', 'order'],
    body: `Report low supplies from the Supplies tab as soon as you notice — before you run out. The office sees every request and marks it done when restocked.`,
  },
  {
    slug: 'sop-pay',
    title: 'How your pay and tips work',
    kind: 'SOP',
    audience: ['CREW'],
    section: 'Pay',
    tags: ['pay', 'payday', 'earnings', 'tips', 'hourly', 'payroll', 'payout'],
    body: `Your dashboard shows this pay period's earnings and your next payday, using the same numbers payroll uses.

- Pay is by the hour, per clean, per day or a percentage — whatever your company set for you.
- Tips from clients are split between the crew on that clean and paid with your wages. Tips are taxable wages.
- Questions about a pay run go to the office, who can see every clean behind it.`,
  },

  // ------------------------------------------------------------ Office SOPs
  {
    slug: 'sop-new-lead',
    title: 'From new lead to booked client',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Sales',
    tags: ['lead', 'walkthrough', 'quote', 'estimate', 'pipeline', 'new client', 'sales'],
    body: `1. A lead requests a walkthrough from your website. You get an email and it appears in Clients → Leads.
2. Before the visit, read what they told you (post-construction and commercial leads answer extra questions).
3. At the walkthrough, open Walk this home: set room counts and fill in the home profile.
4. Build the estimate from the lead. For post-construction use Price by phase; for commercial, the monthly calculator.
5. Send it. The client approves from their phone; follow-ups go out on their own if they don't answer.
6. Once approved, schedule the clean (Schedule → Schedule a clean). The approved price fills in.

Track every lead's stage in Clients → Pipeline.`,
  },
  {
    slug: 'sop-scheduling',
    title: 'Scheduling cleans and recurring series',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Scheduling',
    tags: ['schedule', 'recurring', 'series', 'template', 'calendar', 'move', 'skip', 'find a time'],
    body: `1. Schedule → Schedule a clean, or the + button.
2. Pick the client, then a template — it fills in length, arrival window, repeat and team.
3. Use Find a Time to see the openings that keep each crew's day close together.
4. Save. A recurring series creates its visits eight weeks ahead and keeps topping up.

## Changing a series
- Move or skip one visit: only that visit changes.
- Change this and after: the series splits from that date, so past visits keep their history.
- Pause or end the series from its page.

US holidays can be skipped automatically.`,
  },
  {
    slug: 'sop-invoices',
    title: 'Invoices, autopay and monthly billing',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Money',
    tags: ['invoice', 'autopay', 'payment', 'monthly', 'billing', 'credit', 'discount', 'unpaid'],
    body: `When a job is finished an invoice is drafted from the agreed price and add-ons.

- Autopay clients are charged right away and get a receipt.
- Everyone else's invoice waits as a draft for you to check and send.
- Monthly-billing clients (often offices) get one statement at the end of the month.
- A minus line on an invoice is a credit or discount; referral credit is applied for you.
- Turn on Unpaid invoice reminders in Settings → Reminders & follow-ups to stop chasing.`,
  },
  {
    slug: 'sop-payroll',
    title: 'Running payroll',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Money',
    tags: ['payroll', 'pay', 'wages', 'tips', 'pay run', 'payday', 'export'],
    body: `1. Set your payday once in Settings → Payroll calendar — cleaners see their next payout from it.
2. Payroll → preview the pay period: every finished clean, hours and tips per person.
3. Check anyone flagged without a pay rate.
4. Create the pay run. Each clean is only ever paid once.
5. Pay through your payroll provider and mark the run paid.

Tips are wages for tax purposes and are included in the run.`,
  },
  {
    slug: 'sop-reclean',
    title: 'Handling a re-clean request',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Quality',
    tags: ['reclean', 're-clean', 'complaint', 'rating', 'review', 'unhappy', 'quality'],
    body: `Any room rated 2 stars or lower opens a re-clean request and emails you.

1. Contact the client the same day.
2. Schedule the re-clean and mark the request Scheduled.
3. After the visit, mark it Done.

Happy clients (4 stars or more on every room) are offered your Google review link instead — set it in Settings → Reviews and referrals.`,
  },
  {
    slug: 'sop-texting',
    title: 'Texting clients and Tex',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Messages',
    tags: ['text', 'sms', 'messages', 'tex', 'inbox', 'reply', 'stop', 'phone', 'calls'],
    body: `Messages → Texts is a two-way inbox from your business number. Reminders and Tex's replies appear in each client's thread.

- Tex answers client chats, texts and calls from your help articles when you turn it on (Settings → Texting and Tex). It never quotes prices, and it hands off to you when it can't help.
- Tex can also help a client who is signed in, or whose phone number matches their account: look up their cleans and invoices, move or cancel a clean (same 24-hour rule and open times as their account), and update notes like pets and parking. Changes are always two steps — Tex says exactly what will change and the client confirms. By text or phone the client first proves it's them — by saying the 4-digit phone PIN they set in their account, or by reading back a one-time code texted to the number on file (a changed email always needs the code). You get the usual "client updated their account" email.
- Tex works like a front desk: it greets known callers by name, takes new requests (name, best number, address, service, timing) as leads, and texts the booking link. Set your office hours and greeting in Settings → Texting and Tex: while you're open, a caller who asks for a person is put through to your cell (with voicemail if you don't pick up); after hours Tex takes a message. Voicemails and new requests show up as alerts.
- Once you reply to a thread yourself, Tex stays quiet in it for a while so you're not talking over each other.
- Clients who reply STOP can't be texted until they text START.
- Every Tex conversation is in Messages → Tex conversations. Ones marked Needs you are waiting on a person.`,
  },
  {
    slug: 'sop-help-articles',
    title: 'Teaching Tex about your company',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Messages',
    tags: ['tex', 'help', 'faq', 'articles', 'knowledge', 'answers'],
    body: `Tex answers from two places: the product's own help, and your company's articles in Help & SOPs. Yours come first.

Good articles to add:
- Your cancellation and late policies
- Areas you serve, and areas you don't
- What clients should do with pets, keys and alarms
- Supplies and equipment you bring
- Holiday closures

Mark an article Public for anyone, Clients for signed-in clients, Crew for your team, or Office for staff only.`,
  },
  {
    slug: 'sop-automations',
    title: 'Reminders and follow-ups',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Messages',
    tags: ['reminders', 'follow-up', 'automations', 'review', 'win back', 'invoice'],
    body: `Settings → Reminders & follow-ups lists every message clients get automatically. Each has an on/off switch, a timing choice and wording you can edit, with a live preview.

New ones start off so nothing new goes to clients until you turn it on. Timed messages go out in the morning run.`,
  },
  {
    slug: 'sop-roles',
    title: 'Roles and who can see what',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Team',
    tags: ['roles', 'permissions', 'access', 'team', 'office manager', 'dispatcher', 'rename'],
    body: `Team → Roles. Rename any role to match how you talk, give each office role only the sections it needs, and add roles from presets like Office Manager or Dispatcher.

- The Admin role always has everything; there is always at least one admin.
- Crew roles decide whether a cleaner sees prices and the team schedule.
- Every change is recorded in Reports → Change history.`,
  },
  {
    slug: 'sop-security',
    title: 'Sign-in security',
    kind: 'SOP',
    audience: ['ADMIN', 'CREW'],
    section: 'Team',
    tags: ['mfa', 'authenticator', 'password', 'security', 'google', 'backup codes', 'locked out'],
    body: `Owners and office staff sign in with a password (or Google) plus an authenticator app. You can require it for cleaners too in Settings → Sign-in security.

- Save the backup codes when you set it up — each works once if you lose your phone.
- You can get a one-time code by email instead.
- Trusted devices skip the code for 30 days.`,
  },
  {
    slug: 'sop-expenses-reports',
    title: 'Expenses, reports and exports',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Money',
    tags: ['expenses', 'reports', 'profit', 'export', 'csv', 'accountant', 'room times'],
    body: `Record what you spend in Expenses (supplies, fuel, equipment). Reports then shows what you collected, labor, expenses and what you kept, plus time per room, by service, by person, quality and new business.

Every report downloads as a spreadsheet for your accountant.`,
  },
  {
    slug: 'sop-postcon-commercial',
    title: 'Quoting post-construction and commercial',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Sales',
    tags: ['post-construction', 'commercial', 'quote', 'phases', 'square feet', 'monthly', 'production rate'],
    body: `## Post-construction
Price each phase per square foot. The editor shows the commonly published ranges as a guide: rough $0.15–0.40, final and touch-up $0.20–0.60. Each phase is scheduled as its own visit; the approved phase prices appear as quick picks when you schedule.

## Commercial
The calculator turns square footage into cleaner-hours using a production rate (offices typically 3,000–4,000 sq ft an hour, medical 1,500–2,500), then hours × your hourly rate × visits a week × 52 ÷ 12, plus supplies. When the client approves, each visit is billed at its share and the client moves to monthly billing.

Guides are starting points — adjust to what you saw on site.`,
  },
  {
    slug: 'sop-integrations',
    title: 'Connecting payments, texting and accounting',
    kind: 'SOP',
    audience: ['ADMIN'],
    section: 'Setup',
    tags: ['stripe', 'twilio', 'quickbooks', 'integrations', 'connect', 'keys', 'setup'],
    body: `- Payments: Settings → Payments. Connect your own Stripe account so client payments go to your bank.
- Texting: your business number and Tex in Settings → Texting and Tex.
- Accounting: Settings → Integrations to connect QuickBooks Online; paid invoices sync without duplicates.

Keys for platform-wide services are added by the platform owner in the hosting settings, never typed into a page.`,
  },
];

export const SECTIONS_ORDER = [
  'Booking and pricing',
  'Your cleans',
  'After the clean',
  'Payments',
  'Your account',
  'Post-construction and commercial',
  'Doing the job',
  'Homes and clients',
  'Pay',
  'Sales',
  'Scheduling',
  'Money',
  'Quality',
  'Messages',
  'Team',
  'Setup',
];

// ------------------------------------------------------------------ Spanish
//
// Spanish versions of the articles cleaners read at /crew/help (audience
// CREW), keyed by slug, plus the section names they sit under. Same body
// format and {company} placeholder as above. An article missing here is
// shown in English. When you change a crew article above, change it here
// too. (Client and office articles aren't translated yet.)

export const HELP_ARTICLES_ES: Record<string, { title: string; body: string }> = {
  'sop-crew-day': {
    title: 'Tu día en la app',
    body: `Tu pantalla de inicio muestra las limpiezas de hoy, la semana que viene y con quién vas a trabajar, lo que has ganado en este periodo de pago y tu próximo día de pago.

1. Abre la primera limpieza del día para ver la dirección, las notas del cliente y la lista de tareas.
2. Toca Empezar a manejar cuando salgas — al cliente se le avisa que vas en camino.
3. Cuando llegues, toca Ya llegué — empezar trabajo. Cualquiera del equipo puede empezar el reloj.
4. Trabaja cuarto por cuarto (mira Cuartos, fotos y cronómetros).
5. El líder de equipo termina el trabajo cuando todos los cuartos están listos.`,
  },
  'sop-rooms-photos': {
    title: 'Cuartos, fotos y cronómetros',
    body: `Cada cuarto de la lista tiene sus propias fotos de antes y después y su cronómetro.

1. Abre el cuarto — su cronómetro empieza a contar.
2. Toma la foto de antes desde la puerta, que se vea todo el cuarto.
3. Limpia el cuarto siguiendo la lista.
4. Toma la foto de después desde el mismo lugar.
5. Marca el cuarto como listo — el cronómetro se detiene.

## Si no puedes limpiar un cuarto
Omítelo y di por qué (cerrado con llave, el cliente lo pidió, no es seguro). El cliente y la oficina ven el motivo.

## Por qué importa
Las fotos son la prueba de la limpieza para el cliente y te protegen si alguien tiene una duda. Los tiempos por cuarto muestran cuánto tardan de verdad las casas, para que los horarios y el pago sean justos.`,
  },
  'sop-finishing': {
    title: 'Terminar un trabajo',
    body: `1. Revisa que todos los cuartos estén listos u omitidos con un motivo.
2. Da una vuelta por la casa: luces, puertas, y regresa a su lugar lo que hayas movido.
3. Cierra tal como dice el perfil de la casa, y pon la alarma si hay una.
4. El líder de equipo toca Terminar trabajo. Al cliente le llegan las fotos de antes y después de inmediato y se prepara la factura.

Cuando hay un líder en el trabajo, solo el líder puede terminarlo.`,
  },
  'sop-offline': {
    title: 'Sin señal en la casa',
    body: `Sigue trabajando. La app guarda tus fotos, marcas y cronómetros en el teléfono y los envía cuando vuelvas a tener señal. No cierres la app ni la quites de la memoria hasta que la fila muestre que todo se sincronizó.`,
  },
  'sop-entry-safety': {
    title: 'Códigos de entrada, llaves y seguridad',
    body: `- Los códigos de entrada están ocultos en la página del trabajo hasta que tocas para verlos. Nunca los escribas ni los compartas.
- Lee el perfil de la casa antes de entrar: mascotas, alarmas, cosas que no se tocan, alergias.
- Nunca mezcles productos de limpieza, y mantenlos lejos del alcance de niños y mascotas.
- Si no te sientes seguro, sal y llama a la oficina. Tu seguridad va antes que la limpieza.
- Si rompes o dañas algo, tómale una foto y avísale a la oficina el mismo día.`,
  },
  'sop-supplies': {
    title: 'Cuando se acaban los suministros',
    body: `Reporta los suministros que se están acabando desde la pestaña de Suministros en cuanto lo notes — antes de que se acaben. La oficina ve cada reporte y lo marca como resuelto cuando se reponen.`,
  },
  'sop-pay': {
    title: 'Cómo funcionan tu pago y tus propinas',
    body: `Tu panel muestra lo que has ganado en este periodo de pago y tu próximo día de pago, con los mismos números que usa la nómina.

- El pago es por hora, por limpieza, por día o un porcentaje — lo que tu compañía haya configurado para ti.
- Las propinas de los clientes se reparten entre el equipo de esa limpieza y se pagan con tu salario. Las propinas son salario que paga impuestos.
- Las preguntas sobre un pago van a la oficina, que puede ver cada limpieza incluida.`,
  },
  'sop-security': {
    title: 'Seguridad al iniciar sesión',
    body: `Los dueños y el personal de oficina inician sesión con una contraseña (o Google) más una app de autenticación. También se puede pedir para los limpiadores en Configuración → Seguridad al iniciar sesión.

- Guarda los códigos de respaldo cuando lo configures — cada uno sirve una vez si pierdes tu teléfono.
- También puedes recibir un código de un solo uso por correo.
- Los dispositivos de confianza no piden el código por 30 días.`,
  },
};

/** Section names in Spanish, for the sections crew articles use. */
export const SECTIONS_ES: Record<string, string> = {
  'Doing the job': 'Haciendo el trabajo',
  'Homes and clients': 'Casas y clientes',
  Pay: 'Pago',
  Team: 'Equipo',
};
