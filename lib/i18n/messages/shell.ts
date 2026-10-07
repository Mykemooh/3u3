import { defineMessages } from '@/lib/i18n';

/** The frame around the client and cleaner apps: tabs, header, notices. */
export const shellMessages = defineMessages({
  en: {
    tabHome: 'Home',
    tabBook: 'Book',
    tabInvoices: 'Invoices',
    tabHelp: 'Help',
    tabJobs: 'Jobs',
    tabHowTo: 'How-to',
    sections: 'Sections',
    home: 'Home',
    signOut: 'Sign out',
    denied: "That page is for a different kind of account, so we've brought you back to yours.",
  },
  es: {
    tabHome: 'Inicio',
    tabBook: 'Reservar',
    tabInvoices: 'Facturas',
    tabHelp: 'Ayuda',
    tabJobs: 'Trabajos',
    tabHowTo: 'Guías',
    sections: 'Secciones',
    home: 'Inicio',
    signOut: 'Cerrar sesión',
    denied: 'Esa página es para otro tipo de cuenta, así que lo regresamos a la suya.',
  },
});
