/**
 * Runtime validation for a deal catalogue.
 *
 * This exists because once the data is fetched rather than compiled in, a bad
 * publish reaches every user immediately with no App Store review in the way.
 * A feed that fails these checks is rejected and the app falls back to the
 * bundled seed, so the worst case is stale data rather than broken data.
 *
 * The checks mirror src/engine/__tests__/data.test.ts deliberately: what the
 * build refuses to ship, the client refuses to display.
 */
import type { Deal, TimeWindow, Venue } from '@/types';

export interface Catalogue {
  venues: Venue[];
  deals: Deal[];
}

export interface Validation {
  ok: boolean;
  errors: string[];
}

const DEAL_TYPES = new Set(['breakfast', 'brunch', 'lunch', 'happy_hour', 'dinner', 'late_night']);
const TIME = /^([01]\d|2[0-4]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ERRORS = 25;

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** [start, end] in minutes, end pushed past midnight when the window wraps. */
function span(w: TimeWindow): [number, number] {
  const start = toMin(w.start);
  let end = toMin(w.end);
  if (end <= start) end += 24 * 60;
  return [start, end];
}

function windowOk(w: unknown): w is TimeWindow {
  const c = w as TimeWindow;
  return (
    !!c &&
    Array.isArray(c.days) &&
    c.days.length > 0 &&
    c.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    typeof c.start === 'string' && TIME.test(c.start) &&
    typeof c.end === 'string' && TIME.test(c.end)
  );
}

function inCity(v: Venue): boolean {
  const { lat, lng } = v.location ?? ({} as Venue['location']);
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  return v.city === 'SG'
    ? lat > 1.2 && lat < 1.5 && lng > 103.6 && lng < 104.1
    : lat > 22.1 && lat < 22.25 && lng > 113.5 && lng < 113.65;
}

export function validateCatalogue(cat: Catalogue): Validation {
  const errors: string[] = [];
  const add = (msg: string) => {
    if (errors.length < MAX_ERRORS) errors.push(msg);
  };

  if (!Array.isArray(cat?.venues) || cat.venues.length === 0) {
    return { ok: false, errors: ['no venues in feed'] };
  }
  if (!Array.isArray(cat?.deals) || cat.deals.length === 0) {
    return { ok: false, errors: ['no deals in feed'] };
  }

  const byId = new Map<string, Venue>();
  for (const v of cat.venues) {
    if (!v?.id || typeof v.id !== 'string') { add('venue with no id'); continue; }
    if (byId.has(v.id)) add(`duplicate venue id ${v.id}`);
    if (!v.name) add(`${v.id}: no name`);
    if (v.city !== 'SG' && v.city !== 'MO') add(`${v.id}: unknown city ${String(v.city)}`);
    if (!inCity(v)) add(`${v.id}: coordinates outside ${String(v.city)}`);
    if (!Array.isArray(v.hours) || v.hours.length === 0) add(`${v.id}: no opening hours`);
    else if (!v.hours.every(windowOk)) add(`${v.id}: malformed opening hours`);
    byId.set(v.id, v);
  }

  const seenDeal = new Set<string>();
  for (const d of cat.deals) {
    if (!d?.id || typeof d.id !== 'string') { add('deal with no id'); continue; }
    if (seenDeal.has(d.id)) add(`duplicate deal id ${d.id}`);
    seenDeal.add(d.id);

    const venue = byId.get(d.venueId);
    if (!venue) { add(`${d.id}: venue ${d.venueId} not in feed`); continue; }
    if (!DEAL_TYPES.has(d.type)) add(`${d.id}: unknown type ${String(d.type)}`);
    if (!d.title) add(`${d.id}: no title`);
    if (typeof d.sourceUrl !== 'string' || !/^https?:\/\//.test(d.sourceUrl)) add(`${d.id}: no source url`);
    if (typeof d.confidence !== 'number' || d.confidence <= 0 || d.confidence > 1) add(`${d.id}: bad confidence`);
    if (d.price != null && d.originalPrice != null && d.price >= d.originalPrice) {
      add(`${d.id}: price ${d.price} not below original ${d.originalPrice}`);
    }
    for (const key of ['validFrom', 'validUntil'] as const) {
      const val = d[key];
      if (val != null && !DATE.test(val)) add(`${d.id}: ${key} is not an ISO date`);
    }
    if (d.validFrom && d.validUntil && d.validFrom > d.validUntil) {
      add(`${d.id}: starts ${d.validFrom} after it ends ${d.validUntil}`);
    }

    if (!Array.isArray(d.windows) || d.windows.length === 0) { add(`${d.id}: no windows`); continue; }
    if (!d.windows.every(windowOk)) { add(`${d.id}: malformed windows`); continue; }
    if (!Array.isArray(venue.hours) || !venue.hours.every(windowOk)) continue;

    // A deal must be claimable: its window has to sit inside the venue's hours.
    for (const w of d.windows) {
      const [dealStart, dealEnd] = span(w);
      const impossible = w.days.find((day) =>
        !venue.hours.some((h) => {
          if (!h.days.includes(day)) return false;
          const [openAt, closeAt] = span(h);
          if (closeAt - openAt >= 24 * 60) return true; // open around the clock
          return dealStart >= openAt && dealEnd <= closeAt;
        }),
      );
      if (impossible !== undefined) {
        add(`${d.id}: day ${impossible} ${w.start}-${w.end} is outside ${venue.name}'s hours`);
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
