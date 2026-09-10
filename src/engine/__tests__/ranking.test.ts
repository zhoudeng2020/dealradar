import { describe, expect, it } from 'vitest';
import { rankDeal, sortRanked, timingScore, valueScore, weatherPenalty } from '../ranking';
import { estimateTravel } from '../geo';
import type { Deal, OpeningStatus, RankingContext, Venue, WeatherNow } from '@/types';

const venue: Venue = {
  id: 'v1',
  name: 'Test Bar',
  city: 'SG',
  location: { lat: 1.2871, lng: 103.8497 },
  address: 'x',
  cuisine: 'bar',
  hours: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '11:00', end: '00:00' }],
  outdoor: true,
};

const baseDeal: Deal = {
  id: 'd1',
  venueId: 'v1',
  type: 'happy_hour',
  title: '1-for-1',
  description: '',
  discountPct: 50,
  windows: [{ days: [1, 2, 3, 4, 5], start: '17:00', end: '20:00' }],
  sourceUrl: 'x',
  lastVerified: '2026-09-01',
  confidence: 1,
};

const open: OpeningStatus = { openNow: true, source: 'seed' };
const fri = (h: number, m = 0) => new Date(2026, 8, 11, h, m);
const ctx = (over: Partial<RankingContext> = {}): RankingContext => ({
  now: fri(17, 30),
  weather: null,
  mode: 'WALK',
  horizonMin: 120,
  ...over,
});

describe('valueScore', () => {
  it('scales with discount and derives from prices', () => {
    expect(valueScore(baseDeal).score).toBeCloseTo((50 / 70) * 40);
    expect(valueScore({ ...baseDeal, discountPct: undefined, price: 12, originalPrice: 19 }).label).toBe('37% saving');
    expect(valueScore({ ...baseDeal, discountPct: undefined }).score).toBe(20);
  });
});

describe('timingScore', () => {
  it('marks unreachable when deal ends before arrival', () => {
    const r = timingScore({ state: 'active', endsInMin: 20 }, 15);
    expect(r.reachable).toBe(false);
  });
  it('gives full marks with an hour left after arrival', () => {
    expect(timingScore({ state: 'active', endsInMin: 120 }, 10).score).toBe(30);
  });
  it('scores upcoming lower than active', () => {
    const up = timingScore({ state: 'upcoming', startsInMin: 30, endsInMin: 210 }, 10).score;
    const act = timingScore({ state: 'active', endsInMin: 180 }, 10).score;
    expect(up).toBeLessThan(act);
    expect(up).toBeGreaterThan(0);
  });
});

describe('weatherPenalty', () => {
  const rain: WeatherNow = { temperatureC: 27, precipitationMm: 3, rainProbabilityPct: 90, code: 61, summary: 'Rain', source: 'fallback' };
  it('penalises outdoor venues and walking in rain', () => {
    const t = { mode: 'WALK' as const, minutes: 20, distanceKm: 1.5, source: 'estimate' as const };
    const p = weatherPenalty(rain, venue, t);
    expect(p.penalty).toBeGreaterThan(8);
    expect(p.note).toContain('rain');
  });
  it('does not penalise indoor venues reached by car', () => {
    const t = { mode: 'DRIVE' as const, minutes: 20, distanceKm: 5, source: 'estimate' as const };
    expect(weatherPenalty(rain, { ...venue, outdoor: false }, t).penalty).toBe(0);
  });
});

describe('rankDeal + sortRanked', () => {
  const near = { lat: 1.2875, lng: 103.85 };
  const far = { lat: 1.32, lng: 103.9 };

  it('closer identical deal ranks higher', () => {
    const a = rankDeal(baseDeal, venue, estimateTravel(near, venue.location, 'WALK'), open, ctx());
    const b = rankDeal(baseDeal, venue, estimateTravel(far, venue.location, 'WALK'), open, ctx());
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('active deal beats upcoming deal, unreachable sinks to the bottom', () => {
    const travel = estimateTravel(near, venue.location, 'WALK');
    const active = rankDeal(baseDeal, venue, travel, open, ctx());
    const upcoming = rankDeal(
      { ...baseDeal, id: 'd2', windows: [{ days: [5], start: '18:30', end: '21:00' }] },
      venue, travel, open, ctx(),
    );
    const unreachable = rankDeal(baseDeal, venue, estimateTravel(far, venue.location, 'WALK'), open, ctx({ now: fri(19, 50) }));
    const sorted = sortRanked([unreachable, upcoming, active]);
    expect(sorted.map((r) => r.deal.id === 'd2' ? 'upcoming' : r.reachable ? 'active' : 'unreachable'))
      .toEqual(['active', 'upcoming', 'unreachable']);
  });

  it('live "closed" status makes an active deal unreachable', () => {
    const r = rankDeal(baseDeal, venue, estimateTravel(near, venue.location, 'WALK'), { openNow: false, source: 'google-places' }, ctx());
    expect(r.reachable).toBe(false);
    expect(r.reasons).toContain('venue reported closed');
  });

  it('lower confidence lowers the score', () => {
    const t = estimateTravel(near, venue.location, 'WALK');
    const sure = rankDeal(baseDeal, venue, t, open, ctx()).score;
    const unsure = rankDeal({ ...baseDeal, confidence: 0.5 }, venue, t, open, ctx()).score;
    expect(unsure).toBeLessThan(sure);
  });
});
