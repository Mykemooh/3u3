import { defineMessages } from '@/lib/i18n';

/**
 * Shared form pieces that sit inside translated pages (/book, /new,
 * /crew/help, /help): the post-construction / commercial intake
 * (components/intake/ProjectIntakeForm.tsx), the address and phone fields,
 * the booking calendar and the help center's search.
 *
 * Spanish uses "usted" (household and business clients). The help center
 * is also shown to cleaners, so its sentences avoid addressing anyone.
 *
 * Intake option labels are keyed by the option's id in lib/intake.ts
 * (projectType_NEW_BUILD, floor_TILE, …); the ids themselves are what's
 * saved, so only the words here change. Month names and weekday letters
 * come from Intl (intlLocale), not this file.
 */
export const formsMessages = defineMessages({
  en: {
    // Intake — shared
    back: '← Back',
    yes: 'Yes',
    no: 'No',
    notSure: 'Not sure',
    squareFeet: 'Square feet',
    floorsLabel: 'Floors (pick any)',
    siteContactLabel: 'Who should we meet on site? (optional)',
    siteContactPlaceholder: 'Name and phone',
    notesLabel: 'Anything else we should know? (optional)',
    continueToWalkthrough: 'Continue to pick a walkthrough time',
    errProjectType: 'Pick the kind of project.',
    errSquareFeet: 'Add the square footage — a rough number is fine (200 or more).',
    errPhases: 'Pick at least one phase.',
    errBusinessName: 'Add the business name.',
    errFacilityType: 'Pick the kind of space.',
    errVisitsPerWeek: 'Pick how often you need cleaning.',
    errGeneric: 'Please check the highlighted answers.',

    // Intake — post-construction
    pcTitle: 'About the project',
    pcIntro: 'A few details so the walkthrough is about confirming, not starting from scratch.',
    pcProjectType: 'What kind of project?',
    pcSquareFeetPlaceholder: 'e.g. 2,400',
    pcStories: 'Stories',
    pcPhases: 'Which cleans do you need?',
    pcPhasesHint: 'Not sure? Pick Final — we’ll tell you at the walkthrough if a rough clean would help.',
    pcReadyDate: 'When will the site be ready for cleaning?',
    pcTrades: 'Trades still working then?',
    pcUtilities: 'Power and water on?',
    pcBuilder: 'Builder or contractor (optional)',

    projectType_NEW_BUILD: 'New build',
    projectType_RENOVATION: 'Renovation or addition',
    projectType_REMODEL: 'Kitchen or bath remodel',
    projectType_OTHER: 'Something else',

    phase_ROUGH: 'Rough clean',
    phase_ROUGH_detail: 'While trades are finishing: debris out, heavy dust down, before cabinets and fixtures go in.',
    phase_FINAL: 'Final clean',
    phase_FINAL_detail: 'After construction ends: every surface top to bottom, stickers and film off, ready for inspection or move-in.',
    phase_TOUCH_UP: 'Touch-up clean',
    phase_TOUCH_UP_detail: 'Right before handover or move-in: the dust that settled since the final clean.',

    floor_HARDWOOD: 'Hardwood',
    floor_TILE: 'Tile or stone',
    floor_VINYL: 'Vinyl or laminate',
    floor_CARPET: 'Carpet',
    floor_CONCRETE: 'Sealed concrete',

    // Intake — commercial
    cmTitle: 'About your space',
    cmIntro: 'So we come to the walkthrough with the right plan — and the right crew size.',
    cmBusinessName: 'Business name',
    cmFacilityType: 'What kind of space?',
    cmSquareFeetPlaceholder: 'e.g. 6,000',
    cmRestrooms: 'Restrooms',
    cmHowOften: 'How often?',
    cmVisits0: 'One time',
    cmVisits1: 'Once a week',
    cmVisits2: '2× a week',
    cmVisits3: '3× a week',
    cmVisits5: 'Every weekday',
    cmVisits7: 'Every day',
    cmWhen: 'When should we clean?',
    cmExtras: 'Also needs (pick any)',
    cmSupplies: 'Restroom paper and soap',
    cmSuppliesUs: 'You supply',
    cmSuppliesClient: 'We supply',
    cmStartDate: 'Ideal start date',

    facility_OFFICE: 'Office',
    facility_MEDICAL: 'Medical or dental',
    facility_RETAIL: 'Retail or showroom',
    facility_FITNESS: 'Gym or studio',
    facility_SCHOOL_CHILDCARE: 'School or childcare',
    facility_CHURCH: 'Church or venue',
    facility_OTHER: 'Something else',

    time_AFTER_HOURS: 'After hours',
    time_BUSINESS_HOURS: 'During business hours',
    time_WEEKENDS: 'Weekends',
    time_FLEXIBLE: 'Flexible',

    extra_BREAK_ROOM: 'Break room or kitchen',
    extra_SHOWERS: 'Showers or locker rooms',
    extra_EXAM_ROOMS: 'Exam or treatment rooms',
    extra_GLASS: 'Lots of glass or storefront',
    extra_HIGH_DUSTING: 'High dusting (vents, beams)',
    extra_FLOOR_CARE: 'Floor care (strip & wax, carpet shampoo)',

    // AddressInput
    addressPickHint: 'Pick your address from the list so our crew can find you.',
    addressFound: '✓ Address found',

    // PhoneInput
    country: 'Country',

    // BookingCalendar
    prevMonth: 'Previous month',
    nextMonth: 'Next month',

    // HelpCenter
    helpSearchPlaceholder: 'Search help — try “reschedule”, “photos” or “payroll”',
    helpSearchAria: 'Search help',
    helpKindSop: 'How-to',
    helpKindFaq: 'FAQ',
    helpOurs: 'Ours',
    helpResultOne: '{count} result',
    helpResultMany: '{count} results',
    helpNothingMatched: 'Nothing matched — ask Tex in the bubble at the bottom of the screen.',
  },
  es: {
    back: '← Atrás',
    yes: 'Sí',
    no: 'No',
    notSure: 'No sé',
    squareFeet: 'Pies cuadrados',
    floorsLabel: 'Pisos (elija los que apliquen)',
    siteContactLabel: '¿Con quién nos vemos en el lugar? (opcional)',
    siteContactPlaceholder: 'Nombre y teléfono',
    notesLabel: '¿Algo más que debamos saber? (opcional)',
    continueToWalkthrough: 'Continuar para elegir hora de visita',
    errProjectType: 'Elija el tipo de proyecto.',
    errSquareFeet: 'Indique los pies cuadrados; un número aproximado está bien (200 o más).',
    errPhases: 'Elija al menos una etapa.',
    errBusinessName: 'Indique el nombre del negocio.',
    errFacilityType: 'Elija el tipo de espacio.',
    errVisitsPerWeek: 'Elija con qué frecuencia necesita limpieza.',
    errGeneric: 'Revise las respuestas marcadas.',

    pcTitle: 'Sobre el proyecto',
    pcIntro: 'Algunos datos para que en la visita solo confirmemos, sin empezar de cero.',
    pcProjectType: '¿Qué tipo de proyecto?',
    pcSquareFeetPlaceholder: 'p. ej., 2,400',
    pcStories: 'Plantas',
    pcPhases: '¿Qué limpiezas necesita?',
    pcPhasesHint: '¿No está seguro? Elija Final; en la visita le diremos si conviene una limpieza gruesa.',
    pcReadyDate: '¿Cuándo estará listo el lugar para limpiar?',
    pcTrades: '¿Seguirán trabajando contratistas?',
    pcUtilities: '¿Hay luz y agua?',
    pcBuilder: 'Constructor o contratista (opcional)',

    projectType_NEW_BUILD: 'Construcción nueva',
    projectType_RENOVATION: 'Renovación o ampliación',
    projectType_REMODEL: 'Remodelación de cocina o baño',
    projectType_OTHER: 'Otro',

    phase_ROUGH: 'Limpieza gruesa',
    phase_ROUGH_detail: 'Mientras terminan los contratistas: sacar escombros y polvo grueso antes de instalar gabinetes y accesorios.',
    phase_FINAL: 'Limpieza final',
    phase_FINAL_detail: 'Al terminar la obra: todas las superficies de arriba abajo, sin etiquetas ni plástico, lista para inspección o mudanza.',
    phase_TOUCH_UP: 'Limpieza de retoque',
    phase_TOUCH_UP_detail: 'Justo antes de la entrega o mudanza: el polvo acumulado desde la limpieza final.',

    floor_HARDWOOD: 'Madera',
    floor_TILE: 'Cerámica o piedra',
    floor_VINYL: 'Vinil o laminado',
    floor_CARPET: 'Alfombra',
    floor_CONCRETE: 'Concreto sellado',

    cmTitle: 'Sobre su espacio',
    cmIntro: 'Para llegar a la visita con el plan correcto y el equipo del tamaño adecuado.',
    cmBusinessName: 'Nombre del negocio',
    cmFacilityType: '¿Qué tipo de espacio?',
    cmSquareFeetPlaceholder: 'p. ej., 6,000',
    cmRestrooms: 'Baños',
    cmHowOften: '¿Con qué frecuencia?',
    cmVisits0: 'Una sola vez',
    cmVisits1: 'Una vez por semana',
    cmVisits2: '2 veces por semana',
    cmVisits3: '3 veces por semana',
    cmVisits5: 'De lunes a viernes',
    cmVisits7: 'Todos los días',
    cmWhen: '¿Cuándo debemos limpiar?',
    cmExtras: 'También necesita (elija los que apliquen)',
    cmSupplies: 'Papel y jabón de los baños',
    cmSuppliesUs: 'Ustedes los ponen',
    cmSuppliesClient: 'Nosotros los ponemos',
    cmStartDate: 'Fecha de inicio ideal',

    facility_OFFICE: 'Oficina',
    facility_MEDICAL: 'Consultorio médico o dental',
    facility_RETAIL: 'Tienda o sala de exhibición',
    facility_FITNESS: 'Gimnasio o estudio',
    facility_SCHOOL_CHILDCARE: 'Escuela o guardería',
    facility_CHURCH: 'Iglesia o salón de eventos',
    facility_OTHER: 'Otro',

    time_AFTER_HOURS: 'Fuera de horario',
    time_BUSINESS_HOURS: 'En horario de trabajo',
    time_WEEKENDS: 'Fines de semana',
    time_FLEXIBLE: 'Flexible',

    extra_BREAK_ROOM: 'Comedor o cocina',
    extra_SHOWERS: 'Regaderas o vestidores',
    extra_EXAM_ROOMS: 'Salas de consulta o tratamiento',
    extra_GLASS: 'Mucho vidrio o escaparate',
    extra_HIGH_DUSTING: 'Polvo en lo alto (ventilas, vigas)',
    extra_FLOOR_CARE: 'Cuidado de pisos (decapado y encerado, lavado de alfombras)',

    addressPickHint: 'Elija su dirección de la lista para que nuestro equipo pueda encontrarle.',
    addressFound: '✓ Dirección encontrada',

    country: 'País',

    prevMonth: 'Mes anterior',
    nextMonth: 'Mes siguiente',

    helpSearchPlaceholder: 'Buscar en la ayuda: «reprogramar», «fotos» o «pago»',
    helpSearchAria: 'Buscar en la ayuda',
    helpKindSop: 'Guía',
    helpKindFaq: 'Pregunta',
    helpOurs: 'Nuestra',
    helpResultOne: '{count} resultado',
    helpResultMany: '{count} resultados',
    helpNothingMatched: 'Sin resultados. Tex puede ayudar desde la burbuja al pie de la pantalla.',
  },
});

export type FormsKey = keyof (typeof formsMessages)['en'];
