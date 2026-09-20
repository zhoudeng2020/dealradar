// Core domain types for DealRadar.

export type CityCode = 'SG' | 'MO';

export interface CityInfo {
  code: CityCode;
  name: string;
  /** Default centre used when location is unavailable. */
  center: LatLng;
  currency: string;
  timezone: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type DealType =
  | 'breakfast'
  | 'brunch'
  | 'lunch'
  | 'happy_hour'
  | 'dinner'
  | 'late_night'
  | 'other';

export type TravelMode = 'WALK' | 'TRANSIT' | 'DRIVE';

/** 0 = Sunday … 6 = Saturday (matches JS Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A recurring weekly window. Times are local "HH:MM". end < start means it crosses midnight. */
export interface TimeWindow {
  days: Weekday[];
  start: string;
  end: string;
}

export interface Venue {
  id: string;
  name: string;
  city: CityCode;
  location: LatLng;
  address: string;
  cuisine: string;
  /** Google Place ID if known — enables live opening hours. */
  placeId?: string;
  /** Seed opening hours, used when live hours are unavailable. */
  hours: TimeWindow[];
  /** True if the seating is mainly outdoors (weather-sensitive). */
  outdoor: boolean;
  website?: string;
}

export interface Deal {
  id: string;
  venueId: string;
  type: DealType;
  title: string;
  description: string;
  /** Deal price in local currency, if it is a fixed-price offer. */
  price?: number;
  /** Regular price, to compute savings. */
  originalPrice?: number;
  /** Explicit discount percentage (e.g. 50 for "50% off"). */
  discountPct?: number;
  windows: TimeWindow[];
  /** ISO date before which the deal should not be shown. Set for dated events
   *  (race weeks, festival menus) so they do not surface weeks early. */
  validFrom?: string;
  /** ISO date after which the deal should not be shown. Inclusive of that day. */
  validUntil?: string;
  sourceUrl: string;
  /**
   * Verbatim snippet from sourceUrl that this record was built from.
   * Lets the refresh job confirm a deal still holds without a human, and
   * makes an unsourceable claim obvious. Required for anything the
   * extraction pipeline produces.
   */
  evidence?: string;
  /** ISO date the deal was last checked by a human or the extraction pipeline. */
  lastVerified: string;
  /** 0–1. Curated = 1.0, AI-extracted unverified = ~0.6. */
  confidence: number;
}

export interface WeatherNow {
  temperatureC: number;
  /** mm in the current hour. */
  precipitationMm: number;
  /** 0–100 probability of rain in the next ~2 hours. */
  rainProbabilityPct: number;
  /** WMO weather code. */
  code: number;
  summary: string;
  source: 'open-meteo' | 'fallback';
}

export interface TravelEstimate {
  mode: TravelMode;
  minutes: number;
  distanceKm: number;
  source: 'google-routes' | 'estimate';
}

export interface OpeningStatus {
  openNow: boolean;
  /** Minutes until the venue closes (if open) or opens (if closed). Undefined if unknown. */
  minutesToChange?: number;
  source: 'google-places' | 'seed';
}

export type DealTiming =
  | { state: 'active'; endsInMin: number }
  | { state: 'upcoming'; startsInMin: number; endsInMin: number }
  | { state: 'inactive' };

export interface RankedDeal {
  deal: Deal;
  venue: Venue;
  timing: DealTiming;
  travel: TravelEstimate;
  opening: OpeningStatus;
  /** 0–100 overall score. */
  score: number;
  /** Human-readable explanation of the score components. */
  reasons: string[];
  /** Whether the user can realistically get there before the deal ends. */
  reachable: boolean;
}

export interface RankingContext {
  now: Date;
  weather: WeatherNow | null;
  mode: TravelMode;
  /** Look-ahead horizon for upcoming deals, in minutes. */
  horizonMin: number;
}
