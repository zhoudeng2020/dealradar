/**
 * Runtime configuration. Keys come from EXPO_PUBLIC_* env vars (see .env.example).
 * The app works without any keys: it falls back to seed hours and estimated travel times.
 */
export const GOOGLE_MAPS_KEY: string = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '').trim();

export const hasGoogleKey = () => GOOGLE_MAPS_KEY.length > 0;

/**
 * Hosted deal catalogue.
 *
 * Defaulted rather than env-only on purpose: the URL is public, it is the same
 * for every build, and an EXPO_PUBLIC_* var is inlined at bundle time - so a
 * build made on EAS, where .env is not uploaded, would silently ship with no
 * feed and quietly run on the bundled seed forever. A default cannot go missing.
 *
 * Set EXPO_PUBLIC_DEALS_FEED_URL to point a build at a different feed (a staging
 * copy, a fork), or to the empty string to pin a build to the bundled seed.
 */
const DEFAULT_DEALS_FEED_URL = 'https://zhoudeng2020.github.io/dealradar/feed/deals.json';

export const DEALS_FEED_URL: string = (
  process.env.EXPO_PUBLIC_DEALS_FEED_URL ?? DEFAULT_DEALS_FEED_URL
).trim();

export const TIMEOUT_MS = 8000;

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${url.split('?')[0]}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
