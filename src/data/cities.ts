import type { CityCode, CityInfo, LatLng } from '@/types';
import { haversineKm } from '@/engine/geo';

export const CITIES: Record<CityCode, CityInfo> = {
  SG: {
    code: 'SG',
    name: 'Singapore',
    center: { lat: 1.2841, lng: 103.8515 }, // Raffles Place
    currency: 'S$',
    timezone: 'Asia/Singapore',
  },
  MO: {
    code: 'MO',
    name: 'Macau',
    center: { lat: 22.1935, lng: 113.5398 }, // Senado Square
    currency: 'MOP',
    timezone: 'Asia/Macau',
  },
};

export const CITY_LIST = Object.values(CITIES);

/** Nearest supported city to a point; undefined if nothing within 80 km. */
export function nearestCity(p: LatLng): CityInfo | undefined {
  let best: CityInfo | undefined;
  let bestKm = 80;
  for (const c of CITY_LIST) {
    const km = haversineKm(p, c.center);
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}
