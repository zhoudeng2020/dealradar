/**
 * Runtime configuration. Keys come from EXPO_PUBLIC_* env vars (see .env.example).
 * The app works without any keys: it falls back to seed hours and estimated travel times.
 */
export const GOOGLE_MAPS_KEY: string = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '').trim();

export const hasGoogleKey = () => GOOGLE_MAPS_KEY.length > 0;

/**
 * Hosted deal catalogue. Leave unset to run purely on the bundled seed.
 * Any https URL returning the feed JSON will do - a file in a public repo
 * is enough; no server is required.
 */
export const DEALS_FEED_URL: string = (process.env.EXPO_PUBLIC_DEALS_FEED_URL ?? '').trim();

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
