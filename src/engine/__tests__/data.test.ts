import { describe, expect, it } from 'vitest';
import { DEALS, VENUES } from '@/data/seed';
import type { TimeWindow } from '@/types';

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Window as [start, end] in minutes, with the end pushed past midnight when it wraps. */
function span(w: TimeWindow): [number, number] {
  const start = toMin(w.start);
  let end = toMin(w.end);
  if (end <= start) end += 24 * 60;
  return [start, end];
}

const byId = new Map(VENUES.map((v) => [v.id, v]));

describe('seed data integrity', () => {
  it('has unique venue and deal ids', () => {
    expect(new Set(VENUES.map((v) => v.id)).size).toBe(VENUES.length);
    expect(new Set(DEALS.map((d) => d.id)).size).toBe(DEALS.length);
  });

  it('has no deal pointing at a missing venue', () => {
    expect(DEALS.filter((d) => !byId.has(d.venueId)).map((d) => d.id)).toEqual([]);
  });

  it('places every venue inside its city', () => {
    const stray = VENUES.filter(({ city, location: { lat, lng } }) =>
      city === 'SG'
        ? !(lat > 1.2 && lat < 1.5 && lng > 103.6 && lng < 104.1)
        : !(lat > 22.1 && lat < 22.25 && lng > 113.5 && lng < 113.65),
    ).map((v) => `${v.id} (${v.location.lat}, ${v.location.lng})`);
    expect(stray).toEqual([]);
  });

  /**
   * Catches the worst bug in this domain: an offer a user cannot possibly claim,
   * because its window falls outside the venue's opening hours. It happens when
   * hours are corrected and the deals hanging off them are not — which shipped
   * twice before this test existed.
   */
  it('never advertises a deal outside its venue opening hours', () => {
    const impossible: string[] = [];
    for (const deal of DEALS) {
      const venue = byId.get(deal.venueId);
      if (!venue) continue;
      for (const w of deal.windows) {
        const [dealStart, dealEnd] = span(w);
        for (const day of w.days) {
          const fits = venue.hours.some((h) => {
            if (!h.days.includes(day)) return false;
            const [openAt, closeAt] = span(h);
            if (closeAt - openAt >= 24 * 60) return true; // open around the clock
            return dealStart >= openAt && dealEnd <= closeAt;
          });
          if (fits) continue;
          impossible.push(`${deal.id} on day ${day}, ${w.start}-${w.end}, at ${venue.name}`);
          break;
        }
      }
    }
    expect(impossible).toEqual([]);
  });

  it('keeps confidence in range and every deal sourced', () => {
    for (const d of DEALS) {
      expect(d.confidence, d.id).toBeGreaterThan(0);
      expect(d.confidence, d.id).toBeLessThanOrEqual(1);
      expect(d.sourceUrl, d.id).toMatch(/^https?:\/\//);
      expect(d.windows.length, d.id).toBeGreaterThan(0);
    }
  });

  it('never prices a deal at or above the price it claims to beat', () => {
    const wrong = DEALS
      .filter((d) => d.price != null && d.originalPrice != null && d.price >= d.originalPrice)
      .map((d) => d.id);
    expect(wrong).toEqual([]);
  });
});
