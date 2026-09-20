/**
 * Where the catalogue comes from.
 *
 * The app ships with a bundled seed so it works offline and on first launch with
 * no network. When EXPO_PUBLIC_DEALS_FEED_URL is set, it also tries a hosted
 * feed, which lets data be published without an app release or an EAS update.
 *
 * The bundled seed is never removed. It is the floor: any failure to fetch, a
 * schema we do not understand, or a feed that fails validation all fall back to
 * it. Stale data beats broken data.
 */
import type { Deal, Venue } from '@/types';
import { DEALS, VENUES } from '@/data/seed';
import { validateCatalogue } from '@/data/validate';
import { DEALS_FEED_URL, fetchJson } from '@/providers/config';

/** Bump when the feed's shape changes incompatibly. Older apps ignore newer feeds. */
export const FEED_SCHEMA = 1;

interface RemoteFeed {
  schema: number;
  generatedAt?: string;
  venues: Venue[];
  deals: Deal[];
}

export interface LoadedCatalogue {
  venues: Venue[];
  deals: Deal[];
  source: 'remote' | 'bundled';
  /** When the feed was generated, if it came from the feed. */
  generatedAt?: string;
  /** Why the feed was not used, when it was tried and rejected. */
  fallbackReason?: string;
}

let cached: LoadedCatalogue | null = null;

const bundled = (fallbackReason?: string): LoadedCatalogue => ({
  venues: VENUES,
  deals: DEALS,
  source: 'bundled',
  fallbackReason,
});

/**
 * Resolve the catalogue, preferring the hosted feed. Cached for the session;
 * pass force to re-fetch (pull to refresh).
 */
export async function loadCatalogue(force = false): Promise<LoadedCatalogue> {
  if (cached && !force) return cached;
  if (!DEALS_FEED_URL) {
    cached = bundled();
    return cached;
  }
  try {
    const raw = await fetchJson<RemoteFeed>(`${DEALS_FEED_URL}?t=${Date.now()}`);
    if (raw?.schema !== FEED_SCHEMA) {
      throw new Error(`feed schema ${String(raw?.schema)}, app expects ${FEED_SCHEMA}`);
    }
    const check = validateCatalogue({ venues: raw.venues, deals: raw.deals });
    if (!check.ok) {
      throw new Error(`failed validation: ${check.errors.slice(0, 3).join('; ')}`);
    }
    cached = {
      venues: raw.venues,
      deals: raw.deals,
      source: 'remote',
      generatedAt: raw.generatedAt,
    };
  } catch (e) {
    cached = bundled((e as Error).message);
  }
  return cached;
}
