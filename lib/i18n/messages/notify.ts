import { defineMessages } from '@/lib/i18n';

/**
 * Emails and texts sent to clients (and to cleaners about their own
 * account), in the recipient's saved language (users.locale). Used by the
 * templates in lib/email.ts and by the senders that build a message
 * themselves (lib/tracking.ts, lib/passwordReset.ts, lib/automations.ts …).
 *
 * Spanish uses "usted" for clients; the payroll email (cleaners only) uses
 * "tú". Brand and company names stay as they are.
 *
 * Some English sentences carry a bit of HTML (<strong>, a link) — the
 * values that go into those {placeholders} are escaped by the caller.
 *
 * SMS: keep the Spanish about as short as the English — every extra
 * segment costs the company money.
 */
export const notifyMessages = defineMessages({
  en: {
    // Shared
    hiComma: 'Hi {name},',
    footerKaty: '— 3U3 Cleaning, Katy, TX',
    brandedFooter: '3U3 Cleaning · Family owned · Katy, TX',
    total: 'Total',
    viewBooking: 'View your booking',
    or: ' or ',
    and: ' and ',

    // Quote visit booked (quoteVisitCustomerEmail)
    qvSubject: "You're booked — {date} at {time}",
    qvIntro: 'Thanks for reaching out! Your free quote visit is confirmed{forService}:',
    qvForService: ' for <strong>{service}</strong>',
    qvBody: 'A team member will meet you at your home to take a look and give you an exact price on the spot — no obligation.',

    // Estimate (estimateEmail)
    estSubject: 'Your estimate from 3U3 Cleaning — {amount}',
    estHeading: '3U3 Cleaning — Your estimate',
    estIntro: "Hi {name}, thanks for having us out to take a look. Here's your price for <strong>{service}</strong>:",
    estApprove: 'Approve estimate',
    estDecline: 'No thanks',
    estFine: "Approve and you'll be able to pick your first cleaning time right away. This estimate is good through {date}.",

    // Invoice (invoiceEmail)
    invSubject: 'Your invoice from {brand} — {amount}',
    invHeading: '{brand} — Invoice',
    invIntro: "Hi {name}, thanks for having us out! Here's your invoice:",
    invPay: 'Pay now',

    // Payment received (paymentReceivedCustomerEmail)
    paidSubject: 'Payment received — thank you!',
    paidHeading: 'Payment received',
    paidBody: "Hi {name}, we've received your payment of <strong>{amount}</strong>. Thank you!",
    paidReceipt: 'View your receipt',

    // All done (jobCompleteCustomerEmail)
    jcSubject: 'Your home is clean — see the before and after',
    jcHeading: 'All done, {name}!',
    jcBody: 'Your {service} on {date} is finished. The crew documented {rooms}{media}, so you can see exactly what was done.',
    jcRoomOne: '{count} room',
    jcRoomMany: '{count} rooms',
    jcPhotoOne: '{count} photo',
    jcPhotoMany: '{count} photos',
    jcVideoOne: '{count} video',
    jcVideoMany: '{count} videos',
    jcWithMedia: ' with {media}',
    jcButton: 'See your before and after',
    jcFoot: "Your invoice will follow shortly by email. Anything not quite right? Just reply to this email and we'll make it right.",
    jcPreheader: 'Your before-and-after photos are ready.',

    // Rescheduled by the office (bookingRescheduledCustomerEmail)
    rsSubject: 'Your cleaning has moved to {date}',
    rsHeading: 'A change to your cleaning',
    rsIntro: 'Hi {name}, your {service} has a new time:',
    rsPrevious: 'Previously: {when}',
    rsFoot: "If the new time doesn't work for you, just reply to this email and we'll sort it out.",
    rsPreheader: 'Your cleaning is now {date}, {time}.',

    // Crew on the way (crewEnRouteCustomerEmail + the text in lib/tracking.ts)
    erSubject: 'Your crew is on the way',
    erSubjectEta: 'Your crew is on the way — arriving around {eta}',
    erHeading: 'On our way, {name}!',
    erBody: 'Your 3U3 crew has just set off for your home{eta}. You can follow them on the map until they pull up.',
    erBodyEta: ' and should arrive around <strong>{eta}</strong>',
    erButton: 'Track your crew',
    erFoot: 'Need to tell them something before they arrive? Just reply to this email.',
    erText: 'Your crew is on the way{eta}. Follow them: {url}',
    erTextEta: ', arriving around {eta}',

    // Booking confirmed (bookingConfirmedCustomerEmail)
    bcSubject: 'Booked: {service} — {when}',
    bcHeading: "You're booked, {name}",
    bcFoot: "Our crew of three will arrive at the start of your window. When they finish, you'll get before-and-after photos of every room.",
    bcPreheader: 'See you {when}.',

    // Password reset (passwordResetEmail + the text in lib/passwordReset.ts)
    prSubject: 'Reset your 3U3 Cleaning password',
    prIntro: 'We got a request to help you sign in. You can sign in with {ids}.',
    prChoose: 'To choose a new password, use the button below.',
    prButton: 'Choose a new password',
    prFine: "This link works once, for 1 hour. If you didn't ask for this, ignore this email — your password hasn't changed.",
    prPreheader: 'Your sign-in details and a link to reset your password.',
    prText: '3U3 Cleaning: you sign in with {ids}. Reset your password (link works for 1 hour): {url}',

    // Account setup (passwordSetupEmail)
    psSubject: 'Set up your 3U3 Cleaning account',
    psHeading: 'Welcome, {name}',
    psBody: 'Create a password so you can sign in anytime to see your booking, before-and-after photos, and invoices.',
    psButton: 'Create your password',
    psFine: "This link is good for 14 days. If you didn't expect this email, you can ignore it.",
    psPreheader: 'Set a password to access your account.',

    // Booking reminder (bookingReminderEmail / Text)
    brSubject: 'Reminder: your cleaning is in {horizon}',
    brIntro: 'Just a heads-up — your <strong>{service}</strong> is coming up in {horizon}:',
    brFine: 'Need to reschedule or cancel? You can do that from My Account up to 24 hours before — after that, just give us a call.',
    brPreheader: 'Your cleaning is in {horizon}.',
    brText: '3U3 Cleaning: your {service} is in {horizon} — {date} at {time}.',

    // Estimate reminder (estimateReminderEmail / Text)
    eqSubject: 'Still thinking it over? Your 3U3 Cleaning estimate — {amount}',
    eqIntro: 'Just checking in — your estimate for <strong>{service}</strong> is still waiting on you:',
    eqButton: 'View and approve',
    eqOptOut: 'Not interested? {link}.',
    eqOptOutLink: 'Stop these reminders',
    eqPreheader: 'Your estimate is still waiting.',
    eqText: '3U3 Cleaning: your {service} estimate ({amount}) is still open — {url}',

    // Standby offer (standbyOfferEmail / Text)
    sbSubject: 'A spot opened up — {date}',
    sbHeading: 'Good news, {name}!',
    sbIntro: 'A spot just opened up for <strong>{service}</strong> on the day you asked to be held for:',
    sbButton: 'Claim this spot',
    sbFine: "First come, first served — this hold expires {expires}. If you don't claim it in time, we'll offer it to the next person waiting.",
    sbPreheader: 'A spot opened up on the day you wanted.',
    sbText: '3U3 Cleaning: a spot opened up for {service} on {date} at {time} — claim it: {url}',

    // Reminders & follow-ups (lib/automations.ts): the system's own bits
    // around a company's wording.
    autoUnsubscribe: "Don't want these? Unsubscribe: {url}",
    autoStopQuoteReminders: 'Not interested? Stop these reminders: {url}',
    ctaOpenAccount: 'Open my account',
    ctaViewApprove: 'View and approve',
    ctaFollowCrew: 'Follow your crew',
    ctaBeforeAfter: 'See your before and after',
    ctaRateClean: 'Rate your clean',
    ctaViewPay: 'View and pay',
    ctaBookClean: 'Book a clean',
    whenTomorrow: 'tomorrow',
    whenDays: 'in {count} days',
    whenDay: 'in {count} day',
    whenHours: 'in {count} hours',
    serviceFallback: 'cleaning',
    serviceFallbackTitle: 'Cleaning',
    serviceFallbackLong: 'Cleaning service',
    companyFallback: 'Your cleaning company',

    // Standard wording of each reminder (until the company edits it).
    walkthroughSubject: 'See you {date} — your free walkthrough',
    walkthroughBody:
      'Hi {firstName}, a reminder that {company} is coming by for your free walkthrough on {date}, {time}. It takes about 20 minutes and you will get your price on the spot. Need a different time? Just reply.',
    visitFirstSubject: 'Reminder: your {service} is {when}',
    visitFirstBody:
      'Hi {firstName}, a heads-up that your {service} with {company} is {when}: {date}, {time}. Need to change it? You can from your account up to 24 hours before.',
    visitSecondSubject: 'Tomorrow-ish: your {service}',
    visitSecondBody: 'Hi {firstName}, your {service} with {company} is {when}: {date}, {time}. Anything the crew should know? Add a note in your account: {link}',
    enRouteSubject: 'Your crew is on the way',
    enRouteBody: 'Hi {firstName}, your {company} crew is on the way{eta}. Follow them here: {link}',
    jobCompleteSubject: 'Your home is clean — see the before and after',
    jobCompleteBody: 'Hi {firstName}, your {service} is done. See the before-and-after photos of every room here: {link}',
    reviewSubject: 'How did we do, {firstName}?',
    reviewBody: 'Hi {firstName}, thanks for having {company} over. How did we do? Rate each room in about 20 seconds: {link}',
    quoteFollowupSubject: 'Still thinking it over? Your quote — {amount}',
    quoteFollowupBody: 'Hi {firstName}, just checking in — your {service} quote from {company} ({amount}) is still waiting on you: {link}',
    invoiceFollowupSubject: 'A reminder about your invoice — {amount}',
    invoiceFollowupBody: 'Hi {firstName}, a friendly reminder that your invoice from {company} for {amount} is still open. You can pay it here: {link}',
    winbackSubject: 'We miss your home, {firstName}',
    winbackBody:
      'Hi {firstName}, it has been a little while since {company} last cleaned for you. Whenever you are ready, your crew would love to come back — book here: {link}',

    // Sign-in code (lib/mfa.ts)
    mfaSubject: 'Your sign-in code: {code}',
    mfaHeading: 'Your sign-in code',
    mfaBody: "Use {code} to finish signing in. It works for {minutes} minutes.\n\nIf you didn't just try to sign in, change your password — someone else may know it.",

    // Code Tex texts before making a change (lib/texActions.ts)
    texCode: '{company}: your code is {code}. It confirms: {purpose}. Give it only to Tex in this conversation; it expires in {minutes} minutes.',

    // Cleaner pay notice (lib/payroll.ts) — "tú" in Spanish
    paySubject: 'You were paid for {period}',
    payBody: 'You were just paid <strong>{amount}</strong> for <strong>{period}</strong>\n          ({summary}{tips}).',
    payTips: ', including {amount} in tips',
    payHours: '{count} hours',
    payCleans: '{count} cleans',
    payCleansAt: '{count} cleans at {percent}%',
    payDays: '{count} days',
    paySignoff: '— 3U3 Cleaning',
  },
  es: {
    hiComma: 'Hola, {name}:',
    footerKaty: '— 3U3 Cleaning, Katy, TX',
    brandedFooter: '3U3 Cleaning · Negocio familiar · Katy, TX',
    total: 'Total',
    viewBooking: 'Ver su reserva',
    or: ' o ',
    and: ' y ',

    qvSubject: 'Su cita está confirmada — {date}, {time}',
    qvIntro: '¡Gracias por comunicarse con nosotros! Su visita gratuita para cotizar está confirmada{forService}:',
    qvForService: ' para <strong>{service}</strong>',
    qvBody: 'Un miembro de nuestro equipo lo visitará en su casa para revisarla y darle un precio exacto en el momento, sin compromiso.',

    estSubject: 'Su presupuesto de 3U3 Cleaning — {amount}',
    estHeading: '3U3 Cleaning — Su presupuesto',
    estIntro: 'Hola, {name}. Gracias por recibirnos para revisar su casa. Este es su precio para <strong>{service}</strong>:',
    estApprove: 'Aprobar presupuesto',
    estDecline: 'No, gracias',
    estFine: 'Al aprobarlo, podrá elegir de inmediato la hora de su primera limpieza. Este presupuesto es válido hasta el {date}.',

    invSubject: 'Su factura de {brand} — {amount}',
    invHeading: '{brand} — Factura',
    invIntro: 'Hola, {name}. ¡Gracias por elegirnos! Aquí está su factura:',
    invPay: 'Pagar ahora',

    paidSubject: 'Pago recibido — ¡gracias!',
    paidHeading: 'Pago recibido',
    paidBody: 'Hola, {name}. Recibimos su pago de <strong>{amount}</strong>. ¡Gracias!',
    paidReceipt: 'Ver su recibo',

    jcSubject: 'Su casa está limpia — vea el antes y el después',
    jcHeading: '¡Listo, {name}!',
    jcBody: 'Terminamos su {service} del {date}. El equipo documentó {rooms}{media} para que vea exactamente lo que se hizo.',
    jcRoomOne: '{count} habitación',
    jcRoomMany: '{count} habitaciones',
    jcPhotoOne: '{count} foto',
    jcPhotoMany: '{count} fotos',
    jcVideoOne: '{count} video',
    jcVideoMany: '{count} videos',
    jcWithMedia: ' con {media}',
    jcButton: 'Ver el antes y el después',
    jcFoot: 'Pronto le enviaremos su factura por correo electrónico. ¿Algo no quedó bien? Responda a este correo y lo solucionaremos.',
    jcPreheader: 'Sus fotos del antes y el después están listas.',

    rsSubject: 'Su limpieza se cambió al {date}',
    rsHeading: 'Un cambio en su limpieza',
    rsIntro: 'Hola, {name}. Su {service} tiene un nuevo horario:',
    rsPrevious: 'Antes: {when}',
    rsFoot: 'Si el nuevo horario no le funciona, responda a este correo y lo resolveremos.',
    rsPreheader: 'Su limpieza ahora es el {date}, {time}.',

    erSubject: 'Su equipo va en camino',
    erSubjectEta: 'Su equipo va en camino — llegará alrededor de las {eta}',
    erHeading: '¡Vamos en camino, {name}!',
    erBody: 'Su equipo de 3U3 acaba de salir hacia su casa{eta}. Puede seguirlo en el mapa hasta que llegue.',
    erBodyEta: ' y debería llegar alrededor de las <strong>{eta}</strong>',
    erButton: 'Seguir a su equipo',
    erFoot: '¿Necesita decirles algo antes de que lleguen? Solo responda a este correo.',
    erText: 'Su equipo va en camino{eta}. Sígalo aquí: {url}',
    erTextEta: ', llega aprox. a las {eta}',

    bcSubject: 'Reservado: {service} — {when}',
    bcHeading: 'Su limpieza está reservada, {name}',
    bcFoot: 'Nuestro equipo de tres personas llegará al inicio de su horario. Al terminar, recibirá fotos del antes y el después de cada habitación.',
    bcPreheader: 'Nos vemos el {when}.',

    prSubject: 'Restablezca su contraseña de 3U3 Cleaning',
    prIntro: 'Recibimos una solicitud para ayudarle a iniciar sesión. Puede iniciar sesión con {ids}.',
    prChoose: 'Para elegir una nueva contraseña, use el botón de abajo.',
    prButton: 'Elegir una nueva contraseña',
    prFine: 'Este enlace funciona una sola vez, durante 1 hora. Si usted no lo solicitó, ignore este correo; su contraseña no ha cambiado.',
    prPreheader: 'Sus datos de inicio de sesión y un enlace para restablecer su contraseña.',
    prText: '3U3 Cleaning: su usuario es {ids}. Restablezca su contraseña (enlace válido por 1 hora): {url}',

    psSubject: 'Configure su cuenta de 3U3 Cleaning',
    psHeading: 'Le damos la bienvenida, {name}',
    psBody: 'Cree una contraseña para iniciar sesión cuando quiera y ver su reserva, sus fotos del antes y el después, y sus facturas.',
    psButton: 'Crear su contraseña',
    psFine: 'Este enlace es válido por 14 días. Si no esperaba este correo, puede ignorarlo.',
    psPreheader: 'Cree una contraseña para entrar a su cuenta.',

    // {horizon} here is the whole phrase, preposition included: "en 3 días", "mañana".
    brSubject: 'Recordatorio: su limpieza es {horizon}',
    brIntro: 'Le recordamos que su <strong>{service}</strong> es {horizon}:',
    brFine: '¿Necesita cambiar la fecha o cancelar? Puede hacerlo desde Mi cuenta hasta 24 horas antes; después de eso, llámenos.',
    brPreheader: 'Su limpieza es {horizon}.',
    brText: '3U3 Cleaning: su {service} es {horizon} — {date}, {time}.',

    eqSubject: '¿Lo sigue pensando? Su presupuesto de 3U3 Cleaning — {amount}',
    eqIntro: 'Solo queríamos saber de usted: su presupuesto para <strong>{service}</strong> sigue esperando su respuesta:',
    eqButton: 'Ver y aprobar',
    eqOptOut: '¿No le interesa? {link}.',
    eqOptOutLink: 'Dejar de recibir estos recordatorios',
    eqPreheader: 'Su presupuesto sigue pendiente.',
    eqText: '3U3 Cleaning: su presupuesto de {service} ({amount}) sigue pendiente — {url}',

    sbSubject: 'Se abrió un espacio — {date}',
    sbHeading: '¡Buenas noticias, {name}!',
    sbIntro: 'Se acaba de abrir un espacio para <strong>{service}</strong> el día que usted pidió:',
    sbButton: 'Reservar este espacio',
    sbFine: 'Se asigna por orden de llegada: esta oferta vence el {expires}. Si no la reserva a tiempo, se la ofreceremos a la siguiente persona en espera.',
    sbPreheader: 'Se abrió un espacio el día que usted quería.',
    sbText: '3U3 Cleaning: se abrió un espacio para {service} el {date}, {time}. Resérvelo: {url}',

    autoUnsubscribe: '¿No desea recibir estos mensajes? Cancele la suscripción: {url}',
    autoStopQuoteReminders: '¿No le interesa? Deje de recibir estos recordatorios: {url}',
    ctaOpenAccount: 'Abrir mi cuenta',
    ctaViewApprove: 'Ver y aprobar',
    ctaFollowCrew: 'Seguir a su equipo',
    ctaBeforeAfter: 'Ver el antes y el después',
    ctaRateClean: 'Calificar su limpieza',
    ctaViewPay: 'Ver y pagar',
    ctaBookClean: 'Reservar una limpieza',
    whenTomorrow: 'mañana',
    whenDays: 'en {count} días',
    whenDay: 'en {count} día',
    whenHours: 'en {count} horas',
    serviceFallback: 'limpieza',
    serviceFallbackTitle: 'Limpieza',
    serviceFallbackLong: 'Servicio de limpieza',
    companyFallback: 'Su compañía de limpieza',

    walkthroughSubject: 'Nos vemos el {date} — su visita gratuita',
    walkthroughBody:
      'Hola, {firstName}. Le recordamos que {company} irá a su casa para la visita gratuita el {date}, {time}. Dura unos 20 minutos y recibirá su precio en el momento. ¿Necesita otro horario? Solo responda a este mensaje.',
    visitFirstSubject: 'Recordatorio: su {service} es {when}',
    visitFirstBody:
      'Hola, {firstName}. Le recordamos que su {service} con {company} es {when}: {date}, {time}. ¿Necesita hacer un cambio? Puede hacerlo desde su cuenta hasta 24 horas antes.',
    visitSecondSubject: 'Muy pronto: su {service}',
    visitSecondBody: 'Hola, {firstName}. Su {service} con {company} es {when}: {date}, {time}. ¿Algo que el equipo deba saber? Agregue una nota en su cuenta: {link}',
    enRouteSubject: 'Su equipo va en camino',
    enRouteBody: 'Hola, {firstName}. Su equipo de {company} va en camino{eta}. Sígalo aquí: {link}',
    jobCompleteSubject: 'Su casa está limpia — vea el antes y el después',
    jobCompleteBody: 'Hola, {firstName}. Terminamos su {service}. Vea las fotos del antes y el después de cada habitación aquí: {link}',
    reviewSubject: '¿Cómo lo hicimos, {firstName}?',
    reviewBody: 'Hola, {firstName}. Gracias por recibir a {company}. ¿Cómo lo hicimos? Califique cada habitación en unos 20 segundos: {link}',
    quoteFollowupSubject: '¿Lo sigue pensando? Su cotización — {amount}',
    quoteFollowupBody: 'Hola, {firstName}. Solo queríamos saber de usted: su cotización de {service} de {company} ({amount}) sigue esperando su respuesta: {link}',
    invoiceFollowupSubject: 'Un recordatorio sobre su factura — {amount}',
    invoiceFollowupBody: 'Hola, {firstName}. Le recordamos amablemente que su factura de {company} por {amount} sigue pendiente. Puede pagarla aquí: {link}',
    winbackSubject: 'Extrañamos su casa, {firstName}',
    winbackBody:
      'Hola, {firstName}. Ha pasado un tiempo desde que {company} limpió su casa. Cuando le convenga, a su equipo le encantaría volver. Reserve aquí: {link}',

    mfaSubject: 'Su código de inicio de sesión: {code}',
    mfaHeading: 'Su código de inicio de sesión',
    mfaBody: 'Use {code} para terminar de iniciar sesión. Es válido por {minutes} minutos.\n\nSi usted no intentó iniciar sesión, cambie su contraseña; es posible que otra persona la conozca.',

    texCode: '{company}: su código es {code}. Confirma: {purpose}. Déselo solo a Tex en esta conversación; vence en {minutes} minutos.',

    paySubject: 'Te pagamos por {period}',
    payBody: 'Acabamos de pagarte <strong>{amount}</strong> por <strong>{period}</strong>\n          ({summary}{tips}).',
    payTips: ', incluidos {amount} en propinas',
    payHours: '{count} horas',
    payCleans: '{count} limpiezas',
    payCleansAt: '{count} limpiezas al {percent}%',
    payDays: '{count} días',
    paySignoff: '— 3U3 Cleaning',
  },
});
