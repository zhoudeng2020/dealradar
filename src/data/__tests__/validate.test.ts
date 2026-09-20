import { describe, expect, it } from 'vitest';
import { DEALS, VENUES } from '@/data/seed';
import { validateCatalogue, type Catalogue } from '@/data/validate';

const good = (): Catalogue => ({
  venues: JSON.parse(JSON.stringify(VENUES)),
  deals: JSON.parse(JSON.stringify(DEALS)),
});

/**
 * The validator is the only thing standing between a bad publish and every
 * installed app, so it gets tested on both sides: it must accept what we ship,
 * and reject each way a feed can be wrong.
 */
describe('validateCatalogue', () => {
  it('accepts the catalogue we actually ship', () => {
    const r = validateCatalogue(good());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rejects an empty feed rather than emptying the app', () => {
    expect(validateCatalogue({ venues: [], deals: [] }).ok).toBe(false);
    expect(validateCatalogue({ venues: VENUES, deals: [] }).ok).toBe(false);
  });

  it('rejects a deal pointing at a venue that is not in the feed', () => {
    const c = good();
    c.deals[0].venueId = 'sg-does-not-exist';
    const r = validateCatalogue(c);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('not in feed');
  });

  it('rejects coordinates in the wrong city', () => {
    const c = good();
    c.venues[0].location = { lat: 51.5, lng: -0.12 }; // London
    expect(validateCatalogue(c).ok).toBe(false);
  });

  it('rejects a deal whose window falls outside its venue opening hours', () => {
    const c = good();
    const venue = c.venues.find((v) => c.deals.some((d) => d.venueId === v.id))!;
    venue.hours = [{ days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '23:00' }];
    const r = validateCatalogue(c);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('outside');
  });

  it('rejects a dated deal that starts after it ends', () => {
    const c = good();
    c.deals[0].validFrom = '2026-12-01';
    c.deals[0].validUntil = '2026-11-01';
    expect(validateCatalogue(c).ok).toBe(false);
  });

  it('rejects a saving that is not a saving', () => {
    const c = good();
    c.deals[0].price = 50;
    c.deals[0].originalPrice = 20;
    expect(validateCatalogue(c).ok).toBe(false);
  });

  it('rejects malformed times and unsourced deals', () => {
    const bad = good();
    bad.deals[0].windows = [{ days: [1], start: '25:00', end: '26:00' } as never];
    expect(validateCatalogue(bad).ok).toBe(false);

    const unsourced = good();
    unsourced.deals[0].sourceUrl = 'not-a-url';
    expect(validateCatalogue(unsourced).ok).toBe(false);
  });
});
