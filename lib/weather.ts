import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { addOnServices, addresses, bookingAddOns, bookings, crews, users } from '@/db/schema';
import { BUSINESS_TIMEZONE } from '@/lib/time';

/**
 * Weather on the schedule, from Open-Meteo (open-meteo.com — free, no
 * account, no key). Only days that have a job with an outdoor add-on
 * (patio, windows, pressure washing…) get a rain or heat flag, so the
 * office can call ahead or move the outdoor part.
 *
 * Open-Meteo's free endpoint is for non-commercial use. A business using
 * this commercially should take an Open-Meteo API plan and set
 * OPEN_METEO_API_KEY; the same calls then go to their customer endpoint.
 *
 * Where: the city of a team's home base, or else the city most of this
 * week's jobs are in. That city is looked up with Open-Meteo's own
 * geocoder, so no Mapbox result is ever stored or reused.
 */

export const RAIN_PROBABILITY = 60; // %
export const RAIN_INCHES = 0.2;
export const HEAT_F = 95;

const OUTDOOR_WORDS = /\b(patio|deck|porch|driveway|sidewalk|pressure|power[\s-]?wash|gutters?|exterior|outdoor|outside|garage door|siding|screens?|windows?)\b/i;
const INDOOR_WORDS = /\b(inside|interior|indoor)\b/i;

export function isOutdoorAddOn(name: string, flag: boolean | null | undefined): boolean {
  if (flag != null) return flag;
  return OUTDOOR_WORDS.test(name) && !INDOOR_WORDS.test(name);
}

export type DayForecast = { date: string; highF: number | null; rainChance: number | null; rainInches: number | null; code: number | null };
export type DayFlags = { rain: boolean; heat: boolean; text: string };

export function flagsFor(day: DayForecast): DayFlags {
  const rain = (day.rainChance ?? 0) >= RAIN_PROBABILITY || (day.rainInches ?? 0) >= RAIN_INCHES;
  const heat = (day.highF ?? 0) >= HEAT_F;
  const parts: string[] = [];
  if (rain) parts.push(`${day.rainChance ?? '?'}% chance of rain${day.rainInches ? `, ${day.rainInches.toFixed(2)} in` : ''}`);
  if (heat) parts.push(`high of ${Math.round(day.highF!)}°F`);
  return { rain, heat, text: parts.join(' · ') };
}

type Place = { name: string; latitude: number; longitude: number };

function host(kind: 'api' | 'geocoding-api') {
  const key = process.env.OPEN_METEO_API_KEY?.trim();
  return { base: key ? `https://customer-${kind}.open-meteo.com` : `https://${kind}.open-meteo.com`, key: key ? `&apikey=${encodeURIComponent(key)}` : '' };
}

async function getJson(url: string, revalidate: number) {
  const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(5000) } as RequestInit);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

export async function geocodeCity(city: string, state?: string | null): Promise<Place | null> {
  const h = host('geocoding-api');
  const data = await getJson(`${h.base}/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&countryCode=US&format=json${h.key}`, 86400);
  const results = (data?.results ?? []) as { name: string; latitude: number; longitude: number; admin1?: string; admin1_code?: string }[];
  if (!results.length) return null;
  const st = state?.trim().toLowerCase();
  const pick = (st && results.find((r) => r.admin1?.toLowerCase() === st || r.admin1_code?.toLowerCase() === st || STATE_NAMES[st] === r.admin1?.toLowerCase())) || results[0];
  return { name: [pick.name, pick.admin1].filter(Boolean).join(', '), latitude: pick.latitude, longitude: pick.longitude };
}

export async function forecast(place: Place): Promise<DayForecast[]> {
  const q = new URLSearchParams({
    latitude: place.latitude.toFixed(3),
    longitude: place.longitude.toFixed(3),
    daily: 'weather_code,temperature_2m_max,precipitation_probability_max,precipitation_sum',
    temperature_unit: 'fahrenheit',
    precipitation_unit: 'inch',
    timezone: BUSINESS_TIMEZONE,
    forecast_days: '16',
  });
  const h = host('api');
  const data = await getJson(`${h.base}/v1/forecast?${q}${h.key}`, 3 * 3600);
  const d = data?.daily ?? {};
  return ((d.time ?? []) as string[]).map((date, i) => ({
    date,
    highF: d.temperature_2m_max?.[i] ?? null,
    rainChance: d.precipitation_probability_max?.[i] ?? null,
    rainInches: d.precipitation_sum?.[i] ?? null,
    code: d.weather_code?.[i] ?? null,
  }));
}

/** Which city to forecast for this company. */
export async function weatherCity(tenantId: string, bookingIds: string[]): Promise<{ city: string; state: string | null } | null> {
  const [home] = await db.select({ city: crews.homeCity, state: crews.homeState }).from(crews).where(eq(crews.tenantId, tenantId));
  if (home?.city) return { city: home.city, state: home.state };
  if (!bookingIds.length) return null;
  const rows = await db
    .select({ city: addresses.city, state: addresses.state })
    .from(bookings)
    .innerJoin(addresses, eq(addresses.id, bookings.addressId))
    .where(and(eq(bookings.tenantId, tenantId), inArray(bookings.id, bookingIds)));
  const counts = new Map<string, { city: string; state: string | null; n: number }>();
  for (const r of rows) {
    const k = `${r.city}|${r.state}`.toLowerCase();
    counts.set(k, { city: r.city, state: r.state, n: (counts.get(k)?.n ?? 0) + 1 });
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return top ? { city: top.city, state: top.state } : null;
}

export type WeatherWatchDay = DayFlags & { date: string; jobs: { bookingId: string; client: string; addOns: string[] }[] };

/**
 * Days between from and to (inclusive) that have outdoor work and a rain
 * or heat flag. Empty when nothing is flagged — or when Open-Meteo can't
 * be reached, since weather is a hint, never something that breaks the
 * schedule.
 */
export async function weatherWatch(tenantId: string, from: string, to: string): Promise<{ place: string | null; days: WeatherWatchDay[] }> {
  try {
    const week = await db
      .select({ id: bookings.id, clientId: bookings.clientId, slotStart: bookings.slotStart })
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), ne(bookings.status, 'CANCELLED'), eq(bookings.isQuoteVisit, false), gte(bookings.slotStart, `${from}T00:00`), lte(bookings.slotStart, `${to}T23:59`)));
    if (!week.length) return { place: null, days: [] };
    const extras = await db
      .select({ bookingId: bookingAddOns.bookingId, name: bookingAddOns.name, outdoor: addOnServices.outdoor })
      .from(bookingAddOns)
      .innerJoin(addOnServices, eq(addOnServices.id, bookingAddOns.addOnServiceId))
      .where(and(eq(addOnServices.tenantId, tenantId), inArray(bookingAddOns.bookingId, week.map((b) => b.id))));
    const outdoor = extras.filter((e) => isOutdoorAddOn(e.name, e.outdoor));
    if (!outdoor.length) return { place: null, days: [] };

    const city = await weatherCity(tenantId, week.map((b) => b.id));
    if (!city) return { place: null, days: [] };
    const place = await geocodeCity(city.city, city.state);
    if (!place) return { place: null, days: [] };
    const days = await forecast(place);

    const outdoorBookings = week.filter((b) => outdoor.some((o) => o.bookingId === b.id));
    const clients = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, outdoorBookings.map((b) => b.clientId)));
    const result: WeatherWatchDay[] = [];
    for (const day of days) {
      const flags = flagsFor(day);
      if (!flags.rain && !flags.heat) continue;
      const jobs = outdoorBookings
        .filter((b) => b.slotStart.startsWith(day.date))
        .map((b) => ({ bookingId: b.id, client: clients.find((c) => c.id === b.clientId)?.name ?? 'Client', addOns: outdoor.filter((o) => o.bookingId === b.id).map((o) => o.name) }));
      if (jobs.length) result.push({ date: day.date, ...flags, jobs });
    }
    return { place: place.name, days: result };
  } catch (err) {
    console.error('[weather] forecast unavailable', err);
    return { place: null, days: [] };
  }
}

const STATE_NAMES: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut', de: 'delaware',
  fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky',
  la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri',
  mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york',
  nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island',
  sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington',
  wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming', dc: 'district of columbia',
};
