import type { LatLng, WeatherNow } from '@/types';
import { fetchJson } from './config';

/** Open-Meteo: free, no key, global coverage. https://open-meteo.com/en/docs */
interface OpenMeteoResponse {
  current: { time: string; temperature_2m: number; precipitation: number; weather_code: number };
  hourly: { time: string[]; precipitation_probability: number[] };
}

const WMO: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  80: 'Showers',
  81: 'Showers',
  82: 'Violent showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail',
};

export function describeWmo(code: number): string {
  return WMO[code] ?? 'Unsettled';
}

export async function getWeather(p: LatLng): Promise<WeatherNow> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(4)}&longitude=${p.lng.toFixed(4)}` +
    `&current=temperature_2m,precipitation,weather_code&hourly=precipitation_probability&forecast_days=1&timezone=auto`;
  const r = await fetchJson<OpenMeteoResponse>(url);
  // Rain probability over the next ~2 hours: take the max of the current hour and the next two.
  const idx = r.hourly.time.findIndex((t) => t >= r.current.time.slice(0, 13));
  const start = idx < 0 ? 0 : idx;
  const window = r.hourly.precipitation_probability.slice(start, start + 3);
  const rainProbabilityPct = window.length ? Math.max(...window) : 0;
  return {
    temperatureC: r.current.temperature_2m,
    precipitationMm: r.current.precipitation,
    rainProbabilityPct,
    code: r.current.weather_code,
    summary: describeWmo(r.current.weather_code),
    source: 'open-meteo',
  };
}

/** Used when the weather service is unreachable — tropical default, no penalties. */
export const FALLBACK_WEATHER: WeatherNow = {
  temperatureC: 30,
  precipitationMm: 0,
  rainProbabilityPct: 20,
  code: 2,
  summary: 'Partly cloudy (offline default)',
  source: 'fallback',
};
