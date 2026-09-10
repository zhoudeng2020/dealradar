import type { OpeningStatus, TimeWindow, Venue, Weekday } from '@/types';
import { isOpenAt, minutesToChange } from '@/engine/hours';
import { GOOGLE_MAPS_KEY, fetchJson, hasGoogleKey } from './config';

/**
 * Google Places API (New).
 * - Place Details gives `currentOpeningHours` (includes holiday exceptions) and `regularOpeningHours`.
 * - Text Search resolves a Place ID for seed venues that do not have one yet.
 * https://developers.google.com/maps/documentation/places/web-service/place-details
 */
interface PlacePeriod {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}
interface PlaceHours {
  openNow?: boolean;
  periods?: PlacePeriod[];
  weekdayDescriptions?: string[];
}
interface PlaceDetails {
  id: string;
  currentOpeningHours?: PlaceHours;
  regularOpeningHours?: PlaceHours;
}
interface TextSearchResponse {
  places?: { id: string; displayName?: { text: string } }[];
}

const HEADERS = () => ({
  'Content-Type': 'application/json',
  'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
});

/** Session cache: placeId → hours, and venueId → placeId. */
const hoursCache = new Map<string, { at: number; hours: TimeWindow[]; openNow?: boolean }>();
const placeIdCache = new Map<string, string>();
const HOURS_TTL_MS = 30 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Convert Places periods into our TimeWindow model (one window per period). */
export function periodsToWindows(periods: PlacePeriod[]): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const p of periods) {
    if (!p.close) {
      // Open 24h: Places encodes this as a single open with no close.
      out.push({ days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00' });
      continue;
    }
    out.push({
      days: [p.open.day as Weekday],
      start: `${pad(p.open.hour)}:${pad(p.open.minute)}`,
      end: `${pad(p.close.hour)}:${pad(p.close.minute)}`,
    });
  }
  return out;
}

export async function resolvePlaceId(venue: Venue): Promise<string | undefined> {
  if (venue.placeId) return venue.placeId;
  const cached = placeIdCache.get(venue.id);
  if (cached) return cached;
  const r = await fetchJson<TextSearchResponse>('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { ...HEADERS(), 'X-Goog-FieldMask': 'places.id,places.displayName' },
    body: JSON.stringify({
      textQuery: `${venue.name} ${venue.address}`,
      locationBias: {
        circle: { center: { latitude: venue.location.lat, longitude: venue.location.lng }, radius: 500 },
      },
      maxResultCount: 1,
    }),
  });
  const id = r.places?.[0]?.id;
  if (id) placeIdCache.set(venue.id, id);
  return id;
}

export async function getOpeningStatus(venue: Venue, now: Date): Promise<OpeningStatus> {
  const seed = (): OpeningStatus => ({
    openNow: isOpenAt(venue.hours, now),
    minutesToChange: minutesToChange(venue.hours, now),
    source: 'seed',
  });
  if (!hasGoogleKey()) return seed();

  try {
    const placeId = await resolvePlaceId(venue);
    if (!placeId) return seed();

    let entry = hoursCache.get(placeId);
    if (!entry || Date.now() - entry.at > HOURS_TTL_MS) {
      const d = await fetchJson<PlaceDetails>(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: { ...HEADERS(), 'X-Goog-FieldMask': 'id,currentOpeningHours,regularOpeningHours' },
      });
      const src = d.currentOpeningHours ?? d.regularOpeningHours;
      if (!src?.periods?.length) return seed();
      entry = { at: Date.now(), hours: periodsToWindows(src.periods), openNow: src.openNow };
      hoursCache.set(placeId, entry);
    }
    // Compute against `now` (which may be a simulated time) rather than trusting openNow blindly.
    const computed = isOpenAt(entry.hours, now);
    return {
      openNow: entry.openNow !== undefined && Math.abs(Date.now() - now.getTime()) < 60_000 ? entry.openNow : computed,
      minutesToChange: minutesToChange(entry.hours, now),
      source: 'google-places',
    };
  } catch (e) {
    console.warn(`[places] ${venue.name}: falling back to seed hours:`, (e as Error).message);
    return seed();
  }
}

/** Fetch opening status for many venues with limited concurrency. */
export async function getOpeningStatuses(venues: Venue[], now: Date, concurrency = 4): Promise<OpeningStatus[]> {
  const out: OpeningStatus[] = new Array(venues.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, venues.length) }, async () => {
    while (i < venues.length) {
      const idx = i++;
      out[idx] = await getOpeningStatus(venues[idx], now);
    }
  });
  await Promise.all(workers);
  return out;
}
