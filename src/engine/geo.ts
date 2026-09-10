import type { LatLng, TravelEstimate, TravelMode } from '@/types';

const EARTH_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la = toRad(a.lat);
  const lb = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/**
 * Offline travel-time estimate used when the Routes API is not configured.
 * Straight-line distance × a route detour factor, at a typical urban speed,
 * plus fixed overhead (waiting for transit, parking a car).
 */
const MODE_PARAMS: Record<TravelMode, { kmh: number; detour: number; overheadMin: number }> = {
  WALK: { kmh: 4.5, detour: 1.3, overheadMin: 0 },
  TRANSIT: { kmh: 18, detour: 1.4, overheadMin: 8 },
  DRIVE: { kmh: 25, detour: 1.35, overheadMin: 6 },
};

export function estimateTravel(from: LatLng, to: LatLng, mode: TravelMode): TravelEstimate {
  const p = MODE_PARAMS[mode];
  const straight = haversineKm(from, to);
  const distanceKm = straight * p.detour;
  const minutes = (distanceKm / p.kmh) * 60 + p.overheadMin;
  return { mode, minutes: Math.max(1, Math.round(minutes)), distanceKm: Math.round(distanceKm * 10) / 10, source: 'estimate' };
}
