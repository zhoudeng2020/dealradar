import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CityCode, CityInfo, DealType, LatLng, RankedDeal, TravelMode, WeatherNow } from '@/types';
import { CITIES, nearestCity } from '@/data/cities';
import { loadCatalogue, type LoadedCatalogue } from '@/data/feed';
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
  /** Whether the catalogue came from the hosted feed or the bundled seed. */
  dataSource: LoadedCatalogue['source'];
  /** When the hosted feed was generated, if it was used. */
  dataGeneratedAt?: string;
  /** Why the hosted feed was not used, when it was tried and rejected. */
  dataFallbackReason?: string;
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
  const [catalogue, setCatalogue] = useState<Pick<LoadedCatalogue, 'source' | 'generatedAt' | 'fallbackReason'>>(
    { source: 'bundled' },
  );
  const run = useRef(0);
  // Set by refresh() so pull-to-refresh re-fetches rather than reusing the session cache.
  const forceReload = useRef(false);

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
      const force = forceReload.current;
      forceReload.current = false;
      const cat = await loadCatalogue(force);
      const venues = cat.venues.filter((v) => v.city === city.code);
      const venueIdx = new Map(venues.map((v, i) => [v.id, i]));
      // Compare as local calendar dates, so a deal runs for the whole of its first
      // and last day. Date objects would parse the ISO date as UTC midnight and cut
      // eight hours off each end in SGT/MOT.
      const pad = (n: number) => `${n}`.padStart(2, '0');
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const candidates = cat.deals.filter(
        (d) =>
          venueIdx.has(d.venueId) &&
          (opts.types.length === 0 || opts.types.includes(d.type)) &&
          (!d.validFrom || d.validFrom <= today) &&
          (!d.validUntil || d.validUntil >= today),
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

      setCatalogue({ source: cat.source, generatedAt: cat.generatedAt, fallbackReason: cat.fallbackReason });
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
    forceReload.current = true;
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
    dataSource: catalogue.source,
    dataGeneratedAt: catalogue.generatedAt,
    dataFallbackReason: catalogue.fallbackReason,
    now: rankedAt,
    updatedAt,
    refresh,
  };
}
