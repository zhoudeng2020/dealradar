import type {
  Deal,
  DealTiming,
  OpeningStatus,
  RankedDeal,
  RankingContext,
  TravelEstimate,
  Venue,
  WeatherNow,
} from '@/types';
import { dealTiming } from './hours';

/**
 * Score model (0–100), designed so that "best deal near me, right now" wins:
 *
 *   value    0–40  how much you save
 *   timing   0–30  active now beats "starts soon"; ending too soon is penalised
 *   travel   0–20  door-to-door minutes for the chosen mode
 *   weather  -15–0 rain/heat penalties for walking and outdoor venues
 *   confidence      multiplier on value; an unconfirmed deal keeps only 15-100% of its value points
 *
 * Deals you cannot reach before they end are marked unreachable and sink to the bottom.
 */

export const WEIGHTS = { value: 40, timing: 30, travel: 20 } as const;

export function valueScore(deal: Deal): { score: number; label: string } {
  let pct: number | undefined = deal.discountPct;
  if (pct === undefined && deal.price !== undefined && deal.originalPrice && deal.originalPrice > 0) {
    pct = Math.round((1 - deal.price / deal.originalPrice) * 100);
  }
  if (pct === undefined) {
    // No quantifiable saving (e.g. "free flow", "1-for-1 not priced"): assume a solid mid value.
    return { score: WEIGHTS.value * 0.5, label: 'Unpriced offer' };
  }
  const clamped = Math.max(0, Math.min(70, pct));
  return { score: (clamped / 70) * WEIGHTS.value, label: `${pct}% saving` };
}

export function timingScore(t: DealTiming, travelMin: number): { score: number; reachable: boolean; label: string } {
  if (t.state === 'inactive') return { score: 0, reachable: false, label: 'Not on today' };
  if (t.state === 'active') {
    const left = t.endsInMin - travelMin;
    if (left < 10) return { score: 0, reachable: false, label: 'Ends before you arrive' };
    // full marks with ≥60 min left after arrival, tapering below that
    const s = WEIGHTS.timing * Math.min(1, left / 60);
    return { score: s, reachable: true, label: `Active — ${Math.round(t.endsInMin)} min left` };
  }
  // upcoming: better the sooner it starts, but not if it starts before you can arrive… that's fine, you just wait
  const left = t.endsInMin - Math.max(t.startsInMin, travelMin);
  if (left < 10) return { score: 0, reachable: false, label: 'Ends before you arrive' };
  const soon = Math.max(0, 1 - t.startsInMin / 120); // 120-min horizon
  return { score: WEIGHTS.timing * 0.7 * soon, reachable: true, label: `Starts in ${t.startsInMin} min` };
}

export function travelScore(travel: TravelEstimate): number {
  // 20 pts at ≤5 min, linearly down to 0 at 45 min.
  const m = travel.minutes;
  if (m <= 5) return WEIGHTS.travel;
  if (m >= 45) return 0;
  return WEIGHTS.travel * (1 - (m - 5) / 40);
}

export function weatherPenalty(
  weather: WeatherNow | null,
  venue: Venue,
  travel: TravelEstimate,
): { penalty: number; note?: string } {
  if (!weather) return { penalty: 0 };
  const raining = weather.precipitationMm >= 0.5 || weather.rainProbabilityPct >= 60;
  const hot = weather.temperatureC >= 33;
  let penalty = 0;
  const notes: string[] = [];

  if (raining) {
    if (venue.outdoor) {
      penalty += 8;
      notes.push('outdoor seating in rain');
    }
    if (travel.mode === 'WALK') {
      penalty += Math.min(7, travel.minutes / 3); // long walk in rain
      notes.push('walking in rain');
    }
  }
  if (hot && travel.mode === 'WALK' && travel.minutes > 10) {
    penalty += Math.min(5, (travel.minutes - 10) / 4);
    notes.push(`hot walk (${Math.round(weather.temperatureC)}°C)`);
  }
  return { penalty: Math.min(15, penalty), note: notes.length ? notes.join(', ') : undefined };
}

export function rankDeal(
  deal: Deal,
  venue: Venue,
  travel: TravelEstimate,
  opening: OpeningStatus,
  ctx: RankingContext,
): RankedDeal {
  const reasons: string[] = [];
  const timing = dealTiming(deal.windows, ctx.now, ctx.horizonMin);

  const v = valueScore(deal);
  const valuePts = v.score * (0.15 + 0.85 * deal.confidence);
  reasons.push(`${v.label}${deal.confidence < 0.9 ? ' (not confirmed)' : ''}`);

  const t = timingScore(timing, travel.minutes);
  reasons.push(t.label);

  const tr = travelScore(travel);
  reasons.push(`${travel.minutes} min by ${travel.mode.toLowerCase()}`);

  const w = weatherPenalty(ctx.weather, venue, travel);
  if (w.note) reasons.push(`weather: ${w.note}`);

  let reachable = t.reachable;
  // Venue closed at the time you'd arrive (live Places data) overrides the deal window.
  if (!opening.openNow && timing.state === 'active') {
    reachable = false;
    reasons.push('venue reported closed');
  }

  let score = valuePts + t.score + tr - w.penalty;
  if (!reachable) score = Math.min(score, 15) * 0.5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { deal, venue, timing, travel, opening, score, reasons, reachable };
}

export function sortRanked(list: RankedDeal[]): RankedDeal[] {
  return [...list].sort((a, b) => {
    if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.travel.minutes - b.travel.minutes;
  });
}
