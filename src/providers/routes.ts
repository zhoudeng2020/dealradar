import type { LatLng, TravelEstimate, TravelMode } from '@/types';
import { estimateTravel } from '@/engine/geo';
import { GOOGLE_MAPS_KEY, fetchJson, hasGoogleKey } from './config';

/**
 * Google Routes API — Compute Route Matrix.
 * https://developers.google.com/maps/documentation/routes/compute_route_matrix
 * One request for all venues (max 625 elements); falls back to estimates on any failure.
 */
interface MatrixElement {
  originIndex: number;
  destinationIndex: number;
  duration?: string; // e.g. "1234s"
  distanceMeters?: number;
  condition?: 'ROUTE_EXISTS' | 'ROUTE_NOT_FOUND';
}

const toWaypoint = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });

export async function getTravelTimes(
  origin: LatLng,
  destinations: LatLng[],
  mode: TravelMode,
): Promise<TravelEstimate[]> {
  const fallback = () => destinations.map((d) => estimateTravel(origin, d, mode));
  if (!hasGoogleKey() || destinations.length === 0) return fallback();

  try {
    const body: Record<string, unknown> = {
      origins: [toWaypoint(origin)],
      destinations: destinations.slice(0, 625).map(toWaypoint),
      travelMode: mode,
    };
    if (mode === 'DRIVE') body.routingPreference = 'TRAFFIC_AWARE';

    const elements = await fetchJson<MatrixElement[]>(
      'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
        },
        body: JSON.stringify(body),
      },
    );

    const out = fallback();
    for (const el of elements) {
      if (el.condition !== 'ROUTE_EXISTS' || !el.duration) continue;
      const seconds = Number(el.duration.replace(/s$/, ''));
      if (!Number.isFinite(seconds)) continue;
      out[el.destinationIndex] = {
        mode,
        minutes: Math.max(1, Math.round(seconds / 60)),
        distanceKm: Math.round(((el.distanceMeters ?? 0) / 1000) * 10) / 10,
        source: 'google-routes',
      };
    }
    return out;
  } catch (e) {
    console.warn('[routes] falling back to estimates:', (e as Error).message);
    return fallback();
  }
}
