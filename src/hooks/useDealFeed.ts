import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CityCode, CityInfo, DealType, LatLng, RankedDeal, TravelMode, WeatherNow } from '@/types';
import { CITIES, nearestCity } from '@/data/cities';
import { DEALS, VENUES } from '@/data/seed';
import { rankDeal, sortRanked } from '@/engine/ranking';
import { getTravelTimes } from '@/providers/routes';
import { getOpeningStatuses } from '@/providers/places';
import { FALLBACK_WEATHER, getWeather } from '@/providers/weather';
import { hasGoogleKey } from '@/providers/config';
import { useLocation } from './useLocation';

export interface FeedOptions {
  mode: TravelMode;
  /** Empty = all types. */
  types: DealType[];
  /** Override "now" for demos/testing. */
  simulatedNow?: Date;
  /** Force a city (demo mode); location is then taken as that city's centre unless you are actually there. */
  cityOverride?: CityCode;
  horizonMin: number;
}

export interface FeedResult {
  loading: boolean;
  error?: string;
  city: CityInfo;
  origin: LatLng;
  originSource: 'device' | 'city-centre';
  weather: WeatherNow | null;
  deals: RankedDeal[];
  liveHours: boolean;
  liveRoutes: boolean;
  /** The effective "now" the feed was ranked against (real or simulated). */
  now: Date;
  updatedAt?: Date;
  refresh: () => void;
}

export function useDealFeed(opts: FeedOptions): FeedResult {
  const loc = useLocation();
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [deals, setDeals] = useState<RankedDeal[]>([]);
  const [liveRoutes, setLiveRoutes] = useState(false);
  const [liveHours, setLiveHours] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [rankedAt, setRankedAt] = useState<Date>(() => opts.simulatedNow ?? new Date());
  const run = useRef(0);

  // Resolve city + origin.
  const { city, origin, originSource } = useMemo(() => {
    const devicePoint = loc.status === 'ok' ? loc.point : undefined;
    const detected = devicePoint ? nearestCity(devicePoint) : undefined;
    const c = opts.cityOverride ? CITIES[opts.cityOverride] : (detected ?? CITIES.SG);
    const inCity = devicePoint && detected?.code === c.code;
    return inCity
      ? { city: c, origin: devicePoint!, originSource: 'device' as const }
      : { city: c, origin: c.center, originSource: 'city-centre' as const };
  }, [loc.status, loc.status === 'ok' ? loc.point.lat : 0, loc.status === 'ok' ? loc.point.lng : 0, opts.cityOverride]);

  const typesKey = opts.types.join(',');
  const nowMs = opts.simulatedNow?.getTime();

  useEffect(() => {
    if (loc.status === 'loading') return;
    const id = ++run.current;
    setLoading(true);
    setError(undefined);

    (async () => {
      const now = opts.simulatedNow ?? new Date();
      const venues = VENUES.filter((v) => v.city === city.code);
      const venueIdx = new Map(venues.map((v, i) => [v.id, i]));
      const candidates = DEALS.filter(
        (d) =>
          venueIdx.has(d.venueId) &&
          (opts.types.length === 0 || opts.types.includes(d.type)) &&
          (!d.validUntil || new Date(d.validUntil) >= now),
      );

      const [w, travel, opening] = await Promise.all([
        getWeather(origin).catch(() => FALLBACK_WEATHER),
        getTravelTimes(origin, venues.map((v) => v.location), opts.mode),
        getOpeningStatuses(venues, now),
      ]);
      if (id !== run.current) return;

      const ranked = candidates.map((d) => {
        const i = venueIdx.get(d.venueId)!;
        return rankDeal(d, venues[i], travel[i], opening[i], {
          now,
          weather: w,
          mode: opts.mode,
          horizonMin: opts.horizonMin,
        });
      });

      setWeather(w);
      setRankedAt(now);
      setDeals(sortRanked(ranked));
      setLiveRoutes(travel.some((t) => t.source === 'google-routes'));
      setLiveHours(opening.some((o) => o.source === 'google-places'));
      setUpdatedAt(new Date());
      setLoading(false);
    })().catch((e) => {
      if (id !== run.current) return;
      setError((e as Error).message);
      setLoading(false);
    });
  }, [loc.status, city.code, origin.lat, origin.lng, opts.mode, typesKey, nowMs, opts.horizonMin, tick]);

  const refresh = useCallback(() => {
    loc.refresh();
    setTick((t) => t + 1);
  }, [loc.refresh]);

  return {
    loading: loading || loc.status === 'loading',
    error,
    city,
    origin,
    originSource,
    weather,
    deals,
    liveHours: liveHours && hasGoogleKey(),
    liveRoutes,
    now: rankedAt,
    updatedAt,
    refresh,
  };
}
