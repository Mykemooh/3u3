import { defineMessages } from '@/lib/i18n';

/**
 * Shared components that sit on the client's account pages but are also
 * used in the (English-only) admin workspace: the address form, a booking
 * card, the avatar upload, the payment method card, notification choice,
 * the home profile editor, the phone PIN and the visit-report share link.
 * Outside a LocaleProvider these fall back to English. Spanish uses
 * "usted". Brand names (Stripe, WhatsApp) and "Tex" stay as they are.
 */
export const commonMessages = defineMessages({
  en: {
    // Shared
    cancel: 'Cancel',
    remove: 'Remove',
    saving: 'Saving…',
    saveError: "Couldn't save — please try again.",

    // Cadence labels (lib/cadence.ts keys)
    cadenceOneTime: 'One-time',
    cadenceWeekly: 'Weekly',
    cadenceBiweekly: 'Every other week',
    cadenceEvery4Weeks: 'Every 4 weeks',
    cadenceMonthly: 'Monthly',
    cadenceCustom: 'Custom schedule',

    // AddressForm
    addrCleanerNeedsToKnowPrefix: 'Cleaner needs to know: ',
    addrNone: 'No address on file yet.',
    addrEdit: 'Edit',
    addrAdd: 'Add address',
    addrStreet: 'Street address',
    addrCity: 'City',
    addrState: 'State',
    addrZip: 'ZIP',
    addrBedrooms: 'Bedrooms',
    addrNotSet: 'Not set',
    addrBedroomsHelp: 'Sets how many "Bedroom" entries show up on the cleaning checklist.',
    addrCleanerNeedsToKnow: 'Cleaner needs to know',
    addrNotesPlaceholder: 'Pets, gate or lockbox codes, parking, anything the crew should know before they arrive',
    addrNotesHelp: "Shown to the crew on this job — they'll see it before they can start.",
    addrSave: 'Save address',

    // MyBookingCard
    bookChangeFrequency: 'Change frequency',
    bookReschedule: 'Reschedule',
    bookLocked: 'Locked — within 24 hrs',
    bookLockedHelp: 'This cleaning starts in less than 24 hours, so changes need a phone call — please contact us directly.',
    bookSaveFrequency: 'Save frequency',
    bookLoadingSlots: 'Loading real availability…',
    bookNoSlots: 'No open slots in the next 10 days — please check back soon.',
    bookConfirmTime: 'Confirm new time',
    bookCancelConfirm: "Cancel this cleaning? This can't be undone.",
    bookCancelError: "Couldn't cancel — please try again.",

    // AvatarUpload
    avatarUploading: 'Uploading…',
    avatarChange: 'Change photo',
    avatarAdd: 'Add photo',
    avatarUploadError: 'Could not upload that photo.',
    avatarRemoveError: 'Could not remove your photo.',

    // PaymentMethodCard
    payMethodTitle: 'Payment method',
    payMethodNotEnabled: "Online payment setup isn't turned on for this business yet.",
    payMethodSecure: 'We never see or store your card number — Stripe handles it directly and securely.',
    payMethodAdd: 'Add a payment method',
    payMethodCard: 'Card',
    payMethodExpires: 'Expires {date}',
    payMethodReplace: 'Replace',
    payMethodRemove: 'Remove',
    payMethodAutopay: 'Turn on autopay',
    payMethodAutopayHelp: '— automatically charge this card when an invoice is ready, instead of emailing a pay link.',
    payMethodAutopayError: 'Could not update autopay.',
    payMethodRemoveError: 'Could not remove that card.',
    payMethodSetupError: 'Could not start payment setup.',
    payMethodLoading: 'Loading…',
    payMethodSaveError: 'Could not save that card.',
    payMethodSave: 'Save card',

    // NotificationPreferences
    notifTitle: 'Notifications',
    notifIntro: 'Where we send booking reminders (3 days, then 36 hours before a cleaning) and other updates.',
    notifEmail: 'Email',
    notifSms: 'Text message (SMS)',
    notifWhatsapp: 'WhatsApp',
    notifNeedsPhone: '(add a phone number first)',
    notifError: 'Could not update that.',

    // HomeProfileEditor
    homePets: 'Pets',
    homePetsPlaceholder: 'A friendly golden retriever, stays in the backyard',
    homeParking: 'Parking',
    homeParkingPlaceholder: 'Park in the driveway, not the street',
    homeAllergies: 'Product allergies',
    homeAllergiesPlaceholder: 'No fragranced products — sensitive to strong scents',
    homeDoNotTouch: 'Do not touch',
    homeDoNotTouchPlaceholder: 'The antique vase on the mantel, home office desk',
    homeEntryCode: 'Entry / alarm code',
    homeEntryNotConfigured: "Encryption isn't configured for this deployment yet — entry codes can't be saved until it is.",
    homeEntryPlaceholder: 'e.g. gate code, lockbox code',
    homeHide: 'Hide',
    homeShow: 'Show',
    homeEntryHelp: 'Stored encrypted — only visible to the crew assigned to a job here, and to you.',
    homeRoomNotes: 'Room-specific notes',
    homeNoRoomNotes: 'No room-specific notes yet.',
    homeRoom: 'Room',
    homeRoomPlaceholder: 'Primary bedroom',
    homeNote: 'Note',
    homeNotePlaceholder: "Rug is an heirloom — vacuum only, don't shampoo",
    homeAdd: 'Add',
    homeSaved: 'Saved ✓',
    homeSave: 'Save home profile',

    // PhonePinCard
    pinTitle: 'Phone PIN',
    pinIntro:
      'Pick 4 digits. When you call or text, say them and Tex knows it’s you — then it can look up your cleans, move a clean, or update your notes without a texted code. Don’t use your birthday or part of your phone number.',
    pinIsSet: 'You have a PIN set.',
    pinNotSet: 'You don’t have one yet.',
    pinNew: 'New PIN',
    pinLabel: 'PIN',
    pinChange: 'Change PIN',
    pinSet: 'Set PIN',
    pinSaveError: 'Could not save that.',
    pinSaved: 'Saved. You can now say this PIN when you call or text.',
    pinRemoved: 'PIN removed.',

    // ShareProofButton
    proofCopied: 'Link copied',
    proofShare: 'Share a visit report',
    proofOpen: 'Open',
    proofError: 'Could not make the link.',
  },
  es: {
    // Shared
    cancel: 'Cancelar',
    remove: 'Quitar',
    saving: 'Guardando…',
    saveError: 'No se pudo guardar — inténtelo de nuevo.',

    // Cadence labels
    cadenceOneTime: 'Una sola vez',
    cadenceWeekly: 'Semanal',
    cadenceBiweekly: 'Cada dos semanas',
    cadenceEvery4Weeks: 'Cada 4 semanas',
    cadenceMonthly: 'Mensual',
    cadenceCustom: 'Horario personalizado',

    // AddressForm
    addrCleanerNeedsToKnowPrefix: 'Lo que el equipo debe saber: ',
    addrNone: 'Todavía no hay una dirección registrada.',
    addrEdit: 'Editar',
    addrAdd: 'Agregar dirección',
    addrStreet: 'Dirección',
    addrCity: 'Ciudad',
    addrState: 'Estado',
    addrZip: 'Código postal',
    addrBedrooms: 'Recámaras',
    addrNotSet: 'Sin definir',
    addrBedroomsHelp: 'Define cuántas "Recámaras" aparecen en la lista de limpieza.',
    addrCleanerNeedsToKnow: 'Lo que el equipo debe saber',
    addrNotesPlaceholder: 'Mascotas, códigos del portón o de la caja de llaves, estacionamiento, lo que el equipo deba saber antes de llegar',
    addrNotesHelp: 'El equipo lo verá en este trabajo antes de poder empezar.',
    addrSave: 'Guardar dirección',

    // MyBookingCard
    bookChangeFrequency: 'Cambiar frecuencia',
    bookReschedule: 'Cambiar fecha',
    bookLocked: 'Bloqueada — faltan menos de 24 h',
    bookLockedHelp: 'Esta limpieza empieza en menos de 24 horas, así que los cambios se hacen por teléfono — por favor llámenos directamente.',
    bookSaveFrequency: 'Guardar frecuencia',
    bookLoadingSlots: 'Cargando disponibilidad real…',
    bookNoSlots: 'No hay horarios libres en los próximos 10 días — vuelva a consultar pronto.',
    bookConfirmTime: 'Confirmar nuevo horario',
    bookCancelConfirm: '¿Cancelar esta limpieza? No se puede deshacer.',
    bookCancelError: 'No se pudo cancelar — inténtelo de nuevo.',

    // AvatarUpload
    avatarUploading: 'Subiendo…',
    avatarChange: 'Cambiar foto',
    avatarAdd: 'Agregar foto',
    avatarUploadError: 'No se pudo subir esa foto.',
    avatarRemoveError: 'No se pudo quitar su foto.',

    // PaymentMethodCard
    payMethodTitle: 'Método de pago',
    payMethodNotEnabled: 'Los pagos en línea todavía no están activados para este negocio.',
    payMethodSecure: 'Nunca vemos ni guardamos el número de su tarjeta — Stripe lo maneja directamente y de forma segura.',
    payMethodAdd: 'Agregar un método de pago',
    payMethodCard: 'Tarjeta',
    payMethodExpires: 'Vence {date}',
    payMethodReplace: 'Reemplazar',
    payMethodRemove: 'Quitar',
    payMethodAutopay: 'Activar pago automático',
    payMethodAutopayHelp: '— cobrar automáticamente a esta tarjeta cuando una factura esté lista, en vez de enviarle un enlace de pago.',
    payMethodAutopayError: 'No se pudo actualizar el pago automático.',
    payMethodRemoveError: 'No se pudo quitar esa tarjeta.',
    payMethodSetupError: 'No se pudo iniciar la configuración del pago.',
    payMethodLoading: 'Cargando…',
    payMethodSaveError: 'No se pudo guardar esa tarjeta.',
    payMethodSave: 'Guardar tarjeta',

    // NotificationPreferences
    notifTitle: 'Notificaciones',
    notifIntro: 'Dónde le enviamos recordatorios de reservas (3 días y luego 36 horas antes de una limpieza) y otras novedades.',
    notifEmail: 'Correo electrónico',
    notifSms: 'Mensaje de texto (SMS)',
    notifWhatsapp: 'WhatsApp',
    notifNeedsPhone: '(primero agregue un número de teléfono)',
    notifError: 'No se pudo actualizar.',

    // HomeProfileEditor
    homePets: 'Mascotas',
    homePetsPlaceholder: 'Un golden retriever amigable, se queda en el patio',
    homeParking: 'Estacionamiento',
    homeParkingPlaceholder: 'Estacionarse en la entrada, no en la calle',
    homeAllergies: 'Alergias a productos',
    homeAllergiesPlaceholder: 'Nada de productos con fragancia — sensible a olores fuertes',
    homeDoNotTouch: 'No tocar',
    homeDoNotTouchPlaceholder: 'El jarrón antiguo de la chimenea, el escritorio de la oficina',
    homeEntryCode: 'Código de entrada / alarma',
    homeEntryNotConfigured: 'El cifrado todavía no está configurado en este sistema — no se pueden guardar códigos de entrada hasta que lo esté.',
    homeEntryPlaceholder: 'p. ej., código del portón o de la caja de llaves',
    homeHide: 'Ocultar',
    homeShow: 'Mostrar',
    homeEntryHelp: 'Se guarda cifrado — solo lo ven usted y el equipo asignado a un trabajo aquí.',
    homeRoomNotes: 'Notas por cuarto',
    homeNoRoomNotes: 'Todavía no hay notas por cuarto.',
    homeRoom: 'Cuarto',
    homeRoomPlaceholder: 'Recámara principal',
    homeNote: 'Nota',
    homeNotePlaceholder: 'El tapete es una reliquia — solo aspirar, no lavar con champú',
    homeAdd: 'Agregar',
    homeSaved: 'Guardado ✓',
    homeSave: 'Guardar perfil del hogar',

    // PhonePinCard
    pinTitle: 'PIN telefónico',
    pinIntro:
      'Elija 4 dígitos. Cuando llame o envíe un mensaje, dígalos y Tex sabrá que es usted — así podrá consultar sus limpiezas, cambiar una o actualizar sus notas sin un código por mensaje. No use su fecha de nacimiento ni parte de su número de teléfono.',
    pinIsSet: 'Ya tiene un PIN.',
    pinNotSet: 'Todavía no tiene uno.',
    pinNew: 'Nuevo PIN',
    pinLabel: 'PIN',
    pinChange: 'Cambiar PIN',
    pinSet: 'Crear PIN',
    pinSaveError: 'No se pudo guardar.',
    pinSaved: 'Guardado. Ya puede decir este PIN cuando llame o envíe un mensaje.',
    pinRemoved: 'PIN eliminado.',

    // ShareProofButton
    proofCopied: 'Enlace copiado',
    proofShare: 'Compartir un informe de la visita',
    proofOpen: 'Abrir',
    proofError: 'No se pudo crear el enlace.',
  },
});
