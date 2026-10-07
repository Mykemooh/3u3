import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineMessages, format, fromAcceptLanguage, translator } from '@/lib/i18n';
import { bookingReminderEmail, bookingReminderText, passwordSetupEmail } from '@/lib/email';
import { whenLabel } from '@/lib/automations';
import { fillCompanyHtml, fillCompanyText } from '@/lib/emailBrand';

test('format fills {placeholders}, blanks missing values, leaves plain text alone', () => {
  assert.equal(format('Hi {name}, see you {day}.', { name: 'Ana', day: 'Friday' }), 'Hi Ana, see you Friday.');
  assert.equal(format('{count} jobs', { count: 3 }), '3 jobs');
  assert.equal(format('Hi {name}!', {}), 'Hi !', 'a missing value is empty, never "{name}"');
  assert.equal(format('Hi {name}!', { name: null }), 'Hi !');
  assert.equal(format('No vars here'), 'No vars here');
  assert.equal(format('{a}', { a: '{b}', b: 'x' }), '{b}', 'values are not re-scanned');
});

test('fromAcceptLanguage picks the first language we speak, by q', () => {
  assert.equal(fromAcceptLanguage('es-MX,es;q=0.9,en;q=0.8'), 'es');
  assert.equal(fromAcceptLanguage('en-US,en;q=0.9'), 'en');
  assert.equal(fromAcceptLanguage('fr-FR,fr;q=0.9,es;q=0.5,en;q=0.4'), 'es');
  assert.equal(fromAcceptLanguage('en;q=0.3, es;q=0.8'), 'es');
  assert.equal(fromAcceptLanguage('fr,de'), null);
  assert.equal(fromAcceptLanguage(''), null);
  assert.equal(fromAcceptLanguage(null), null);
  assert.equal(fromAcceptLanguage(undefined), null);
});

test('translator uses the chosen language and falls back to English, then the key', () => {
  const book = defineMessages({ en: { hi: 'Hi {name}', bye: 'Bye' }, es: { hi: 'Hola {name}', bye: '' } });
  assert.equal(translator(book, 'en')('hi', { name: 'Ana' }), 'Hi Ana');
  assert.equal(translator(book, 'es')('hi', { name: 'Ana' }), 'Hola Ana');
  // A Spanish entry that's missing at runtime (e.g. an older bundle) shows the English.
  const partial = { en: book.en, es: { hi: 'Hola {name}' } } as unknown as typeof book;
  assert.equal(translator(partial, 'es')('bye'), 'Bye');
  assert.equal(translator(book, 'es')('nope' as 'hi'), 'nope');
});

test('client reminder text: Spanish for es, unchanged English otherwise', () => {
  const en = { serviceName: 'Deep Cleaning', dateLabel: 'Friday, September 25', timeLabel: '9:00 AM – 11:00 AM', horizon: '3 days' };
  const before = '[[company]]: your Deep Cleaning is in 3 days — Friday, September 25 at 9:00 AM – 11:00 AM.';
  assert.equal(bookingReminderText(en), before);
  assert.equal(bookingReminderText({ ...en, locale: 'en' }), before);
  // The company's own name goes in at send time (lib/emailBrand.ts).
  assert.equal(fillCompanyText(before, { name: 'Sparkle & Co.' }), 'Sparkle & Co.: your Deep Cleaning is in 3 days — Friday, September 25 at 9:00 AM – 11:00 AM.');

  const es = bookingReminderText({
    serviceName: 'Limpieza profunda',
    dateLabel: 'viernes, 25 de septiembre',
    timeLabel: '9:00 AM – 11:00 AM',
    horizon: whenLabel(72, 'es'),
    locale: 'es',
  });
  assert.equal(es, '[[company]]: su Limpieza profunda es en 3 días — viernes, 25 de septiembre, 9:00 AM – 11:00 AM.');
  assert.ok(es.length <= before.length + 10, 'the Spanish text stays about as short as the English');
  assert.equal(whenLabel(24, 'es'), 'mañana');
  assert.equal(whenLabel(36, 'es'), 'en 36 horas');
  assert.equal(whenLabel(72), 'in 3 days', 'English unchanged');
});

test('client emails: Spanish subject, body and footer for es; English unchanged by default', () => {
  const input = { name: 'Ana María', serviceName: 'Deep Cleaning', dateLabel: 'Fri', timeLabel: '9 AM', horizon: '3 days' };
  const en = bookingReminderEmail(input);
  assert.deepEqual(bookingReminderEmail({ ...input, locale: 'en' }), en);
  assert.equal(en.subject, 'Reminder: your cleaning is in 3 days');
  assert.match(en.html, /\[\[brand-header\]\]/);
  const filled = fillCompanyHtml(en.html, { name: 'Sparkle & Co.', house: false, logoUrl: null, inkColor: '#1E1035' });
  assert.match(filled, /Sparkle &amp; Co\./);
  assert.doesNotMatch(filled, /3U3|\[\[/);

  const es = bookingReminderEmail({ ...input, horizon: 'en 3 días', locale: 'es' });
  assert.equal(es.subject, 'Recordatorio: su limpieza es en 3 días');
  assert.match(es.html, /Hola, Ana:/);
  assert.doesNotMatch(es.html, /Family owned|heads-up/);

  const setup = passwordSetupEmail({ name: 'Ana', url: 'https://example.com/x', locale: 'es' });
  assert.equal(setup.subject, 'Configure su cuenta de [[company]]');
  assert.match(setup.html, /Crear su contraseña/);
});
