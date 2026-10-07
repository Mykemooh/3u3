/**
 * Stand-ins for the sending company's name and header in message templates
 * (lib/email.ts, lib/i18n/messages/notify.ts). Filled in at send time by
 * lib/emailBrand.ts, so no message ever carries another company's name.
 * Kept in their own file so templates import no database code.
 */
export const COMPANY_TOKEN = '[[company]]';
export const BRAND_HEADER_TOKEN = '[[brand-header]]';
