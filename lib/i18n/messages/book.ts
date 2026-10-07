import { defineMessages } from '@/lib/i18n';

/**
 * The customer booking wizard (/book, components/BookWizard.tsx).
 * Spanish uses "usted" — these are household clients.
 *
 * Service names come from serviceName() (lib/format); add-on names and
 * prices are the company's own data and stay as typed.
 */
export const bookMessages = defineMessages({
  en: {
    // No address on file yet (/book asks before the wizard)
    needAddressTitle: 'First, where’s your home?',
    needAddressBody: 'Add your home address so the crew knows where to go. Then you can pick a time.',
    // Shared
    back: '← Back',
    continue: 'Continue',
    backToAccountAria: 'Back to your account',
    errorGeneric: 'Something went wrong.',
    errorRetry: 'Something went wrong. Please try again.',
    cadenceOneTime: 'One-time',
    cadenceBiweekly: 'Every other week',
    cadenceMonthly: 'Monthly',

    // No rate on file
    noRateNamed: "Hi {name} — we don't have an agreed rate on file for you yet. Please contact us directly to get set up.",
    noRate: "Hi there — we don't have an agreed rate on file for you yet. Please contact us directly to get set up.",
    backToAccount: 'Back to your account',

    // Step 1: service
    welcomeNamed: 'Welcome back, {name}',
    welcome: 'Welcome back',
    pickService: "Pick a service — you'll see your own agreed rate.",

    // Step 2: schedule
    yourRate: 'Your rate: {rate} · pick a day on the calendar, up to a year out — every date shown is our crew\'s real availability.',
    loadingAvailability: 'Loading real availability…',
    nothingOpenOn: 'Nothing open on {date}',
    nearbyIntro: "Here's what's open nearby — {before} days before to {after} weeks after:",
    nothingNearby: 'Nothing open nearby either — try another month, or hold your spot below.',
    standbySaved: "✓ You're on standby for {date} — we'll let you know if it opens up.",
    standbyOffer: "Rather have {date}? We'll notify you the moment a spot opens up that day.",
    standbySaving: 'Holding your spot…',
    standbyButton: 'Hold my spot for {date}',
    alternateDay: 'Booking {booked} instead — want us to watch {wanted} too? Use the button above.',

    // Step 3: add-ons
    addOnsTitle: 'Want to add a service for this clean?',
    addOnsIntro: "Totally optional — pick as many or as few as you'd like.",
    addOnsTotal: 'Add-ons: {total}',

    // Step 4: cadence
    cadenceTitle: 'How often?',
    cadenceIntro: 'Last step — set your cadence for {service}.',
    cadenceBiweeklySummary: "You're set for every other {weekday}, {time}.",
    cadenceMonthlySummary: "You're set for every {weekday}, {time}.",
    booking: 'Booking…',
    confirmBooking: 'Confirm booking',

    // Confirmed
    confirmedTitle: 'Booking confirmed!',
    confirmedNote: "A confirmation is on its way to your email. When the crew finishes, you'll get before-and-after photos of every room.",
    seeInAccount: 'See it in your account',
  },
  es: {
    needAddressTitle: 'Primero, ¿dónde está su casa?',
    needAddressBody: 'Agregue la dirección de su casa para que el equipo sepa a dónde ir. Después podrá elegir la hora.',
    back: '← Atrás',
    continue: 'Continuar',
    backToAccountAria: 'Volver a su cuenta',
    errorGeneric: 'Algo salió mal.',
    errorRetry: 'Algo salió mal. Por favor, inténtelo de nuevo.',
    cadenceOneTime: 'Una sola vez',
    cadenceBiweekly: 'Cada dos semanas',
    cadenceMonthly: 'Mensual',

    noRateNamed: 'Hola, {name}: todavía no tenemos una tarifa acordada para usted. Comuníquese con nosotros directamente para configurarla.',
    noRate: 'Hola: todavía no tenemos una tarifa acordada para usted. Comuníquese con nosotros directamente para configurarla.',
    backToAccount: 'Volver a su cuenta',

    welcomeNamed: 'Hola de nuevo, {name}',
    welcome: 'Hola de nuevo',
    pickService: 'Elija un servicio; verá su propia tarifa acordada.',

    yourRate: 'Su tarifa: {rate} · elija un día en el calendario, hasta un año por adelantado. Cada fecha muestra la disponibilidad real de nuestro equipo.',
    loadingAvailability: 'Cargando la disponibilidad real…',
    nothingOpenOn: 'No hay horarios disponibles el {date}',
    nearbyIntro: 'Esto es lo disponible en fechas cercanas, de {before} días antes a {after} semanas después:',
    nothingNearby: 'Tampoco hay nada disponible en fechas cercanas. Pruebe otro mes o reserve su lugar abajo.',
    standbySaved: '✓ Está en lista de espera para el {date}. Le avisaremos si se libera un lugar.',
    standbyOffer: '¿Prefiere el {date}? Le avisaremos en cuanto se libere un lugar ese día.',
    standbySaving: 'Reservando su lugar…',
    standbyButton: 'Guardar mi lugar para el {date}',
    alternateDay: 'Reservará el {booked} en su lugar. ¿Quiere que también estemos pendientes del {wanted}? Use el botón de arriba.',

    addOnsTitle: '¿Desea agregar un servicio a esta limpieza?',
    addOnsIntro: 'Es totalmente opcional: elija los que quiera.',
    addOnsTotal: 'Adicionales: {total}',

    cadenceTitle: '¿Con qué frecuencia?',
    cadenceIntro: 'Último paso: elija la frecuencia de su {service}.',
    cadenceBiweeklySummary: 'Queda programado cada dos semanas, el {weekday}, {time}.',
    cadenceMonthlySummary: 'Queda programado un {weekday} al mes, {time}.',
    booking: 'Reservando…',
    confirmBooking: 'Confirmar reserva',

    confirmedTitle: '¡Reserva confirmada!',
    confirmedNote: 'Le enviamos una confirmación por correo electrónico. Cuando el equipo termine, recibirá fotos de antes y después de cada habitación.',
    seeInAccount: 'Verla en su cuenta',
  },
});
