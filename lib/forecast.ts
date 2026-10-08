import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { addresses, bookings, crews } from '@/db/schema';
import { geocodeAddress } from '@/lib/geocoding';
import { geocodeCity, weatherCity } from '@/lib/weather';

/**
 * The day-by-day forecast on the schedule, from the US National Weather
 * Service (api.weather.gov). Free, no account, no key, and public-domain
 * data — fine for commercial use, unlike most free weather APIs. US only,
 * which is where TrashCan's companies work.
 *
 * NWS gives about seven days ahead in day/night halves; a day we have no
 * forecast for (in the past, or too far out) simply shows nothing.
 *
 * Where: a team's home base, or else the city most of this week's jobs are
 * in. Coordinates are looked up fresh and never stored (lib/geocoding.ts).
 */

export type WeatherKind = 'sun' | 'partly' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind';
export type DayWeather = {
  date: string;
  kind: WeatherKind;
  summary: string;
  highF: number | null;
  lowF: number | null;
  rainChance: number | null;
};

const UA = { 'User-Agent': 'TrashCan scheduling (trashcancrm.com)', Accept: 'application/geo+json' };

function kindOf(text: string): WeatherKind {
  const t = text.toLowerCase();
  if (/thunder|t-storm/.test(t)) return 'storm';
  if (/snow|sleet|ice|flurr|wintry/.test(t)) return 'snow';
  if (/rain|shower|drizzle/.test(t)) return 'rain';
  if (/fog|haze|smoke/.test(t)) return 'fog';
  if (/partly|mostly sunny|mostly clear/.test(t)) return 'partly';
  if (/cloud|overcast/.test(t)) return 'cloud';
  if (/wind|breez|blust/.test(t)) return 'wind';
  return 'sun';
}

async function nwsJson(url: string, revalidate: number) {
  const res = await fetch(url, { headers: UA, next: { revalidate }, signal: AbortSignal.timeout(6000) } as RequestInit);
  if (!res.ok) throw new Error(`NWS ${res.status} ${url}`);
  return res.json();
}

type Period = {
  startTime: string;
  isDaytime: boolean;
  temperature: number | null;
  temperatureUnit: string;
  probabilityOfPrecipitation?: { value: number | null } | null;
  shortForecast: string;
};

export async function nwsDaily(lat: number, lng: number): Promise<DayWeather[]> {
  const point = await nwsJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, 86400);
  const url: string | undefined = point?.properties?.forecast;
  if (!url) return [];
  const data = await nwsJson(url, 3600);
  const periods = (data?.properties?.periods ?? []) as Period[];
  const toF = (p: Period) => (p.temperature == null ? null : p.temperatureUnit === 'C' ? Math.round((p.temperature * 9) / 5 + 32) : p.temperature);

  const byDate = new Map<string, { day?: Period; night?: Period }>();
  for (const p of periods) {
    // startTime carries the forecast office's own offset, so its date part is the local day.
    const date = p.startTime.slice(0, 10);
    const slot = byDate.get(date) ?? {};
    if (p.isDaytime) slot.day = p;
    else slot.night = slot.night ?? p;
    byDate.set(date, slot);
  }
  return [...byDate.entries()].map(([date, { day, night }]) => {
    const main = day ?? night!;
    const chances = [day, night].map((p) => p?.probabilityOfPrecipitation?.value).filter((v): v is number => typeof v === 'number');
    const rain = chances.length ? Math.max(...chances) : null;
    // "Sunny then Slight Chance Rain Showers" at 15% reads as a sunny day.
    const lead = (rain ?? 0) < 40 ? main.shortForecast.split(/ then /i)[0] : main.shortForecast;
    return {
      date,
      kind: kindOf(lead),
      summary: main.shortForecast,
      highF: day ? toF(day) : null,
      lowF: night ? toF(night) : null,
      rainChance: rain,
    };
  });
}

async function placeFor(tenantId: string, bookingIds: string[]): Promise<{ lat: number; lng: number; label: string } | null> {
  const [home] = await db
    .select({ line: crews.homeAddressLine1, city: crews.homeCity, state: crews.homeState, zip: crews.homeZip })
    .from(crews)
    .where(and(eq(crews.tenantId, tenantId), isNotNull(crews.homeCity)));
  if (home?.city) {
    if (home.line) {
      const p = await geocodeAddress(`${home.line}, ${home.city}, ${home.state ?? ''} ${home.zip ?? ''}`);
      if (p) return { ...p, label: [home.city, home.state].filter(Boolean).join(', ') };
    }
  }
  if (bookingIds.length) {
    const [a] = await db
      .select({ line: addresses.line1, city: addresses.city, state: addresses.state, zip: addresses.zip })
      .from(bookings)
      .innerJoin(addresses, eq(addresses.id, bookings.addressId))
      .where(and(eq(bookings.tenantId, tenantId), inArray(bookings.id, bookingIds)));
    if (a?.line) {
      const p = await geocodeAddress(`${a.line}, ${a.city}, ${a.state ?? ''} ${a.zip ?? ''}`);
      if (p) return { ...p, label: [a.city, a.state].filter(Boolean).join(', ') };
    }
  }
  const city = home?.city ? { city: home.city, state: home.state } : await weatherCity(tenantId, bookingIds);
  if (!city) return null;
  const place = await geocodeCity(city.city, city.state);
  return place ? { lat: place.latitude, lng: place.longitude, label: place.name } : null;
}

/** Forecast for each of the given dates that NWS covers. Never throws: weather is a hint. */
export async function weekWeather(tenantId: string, dates: string[], bookingIds: string[]): Promise<{ place: string | null; days: Record<string, DayWeather> }> {
  try {
    const place = await placeFor(tenantId, bookingIds);
    if (!place) return { place: null, days: {} };
    const daily = await nwsDaily(place.lat, place.lng);
    const days: Record<string, DayWeather> = {};
    for (const d of daily) if (dates.includes(d.date)) days[d.date] = d;
    return { place: place.label, days };
  } catch (err) {
    console.error('[forecast] unavailable', err);
    return { place: null, days: {} };
  }
}
