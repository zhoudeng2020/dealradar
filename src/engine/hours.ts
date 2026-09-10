import type { DealTiming, TimeWindow, Weekday } from '@/types';

const DAY_MIN = 24 * 60;

export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Bad time "${s}" (expected HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) throw new Error(`Bad time "${s}"`);
  return h * 60 + min;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function weekday(d: Date): Weekday {
  return d.getDay() as Weekday;
}

/**
 * For a given local "now", returns the minutes until the window ends if it is
 * currently active, or null. Handles windows that cross midnight (end < start):
 * such a window on day D is active on D from start→24:00 and on D+1 from 00:00→end.
 */
export function activeRemaining(w: TimeWindow, now: Date): number | null {
  const start = parseHHMM(w.start);
  const end = parseHHMM(w.end);
  const t = minutesOfDay(now);
  const today = weekday(now);
  const yesterday = ((today + 6) % 7) as Weekday;

  if (end > start) {
    if (w.days.includes(today) && t >= start && t < end) return end - t;
    return null;
  }
  // crosses midnight
  if (w.days.includes(today) && t >= start) return DAY_MIN - t + end;
  if (w.days.includes(yesterday) && t < end) return end - t;
  return null;
}

/** Minutes until the window next starts (within `horizonMin`), and its length. */
export function nextStart(
  w: TimeWindow,
  now: Date,
  horizonMin: number,
): { startsInMin: number; lengthMin: number } | null {
  const start = parseHHMM(w.start);
  const end = parseHHMM(w.end);
  const length = end > start ? end - start : DAY_MIN - start + end;
  const t = minutesOfDay(now);
  const today = weekday(now);

  for (let offset = 0; offset <= 7; offset++) {
    const day = ((today + offset) % 7) as Weekday;
    if (!w.days.includes(day)) continue;
    const startsIn = offset * DAY_MIN + start - t;
    if (startsIn <= 0) continue;
    if (startsIn > horizonMin) return null;
    return { startsInMin: startsIn, lengthMin: length };
  }
  return null;
}

export function isOpenAt(windows: TimeWindow[], now: Date): boolean {
  return windows.some((w) => activeRemaining(w, now) !== null);
}

/** Minutes until the venue closes (if open) or opens (if closed, within 24h). */
export function minutesToChange(windows: TimeWindow[], now: Date): number | undefined {
  const remaining = windows
    .map((w) => activeRemaining(w, now))
    .filter((x): x is number => x !== null);
  if (remaining.length) return Math.max(...remaining);
  const next = windows
    .map((w) => nextStart(w, now, DAY_MIN))
    .filter((x): x is { startsInMin: number; lengthMin: number } => x !== null);
  if (next.length) return Math.min(...next.map((n) => n.startsInMin));
  return undefined;
}

export function dealTiming(windows: TimeWindow[], now: Date, horizonMin: number): DealTiming {
  let best: DealTiming = { state: 'inactive' };
  for (const w of windows) {
    const rem = activeRemaining(w, now);
    if (rem !== null) {
      if (best.state !== 'active' || rem > best.endsInMin) best = { state: 'active', endsInMin: rem };
      continue;
    }
    if (best.state === 'active') continue;
    const n = nextStart(w, now, horizonMin);
    if (n && (best.state !== 'upcoming' || n.startsInMin < best.startsInMin)) {
      best = { state: 'upcoming', startsInMin: n.startsInMin, endsInMin: n.startsInMin + n.lengthMin };
    }
  }
  return best;
}

/** Earliest upcoming start across windows within 7 days, e.g. for "Later today 17:00" labels. */
export function nextWindowStart(windows: TimeWindow[], now: Date): { startsInMin: number; window: TimeWindow } | null {
  let best: { startsInMin: number; window: TimeWindow } | null = null;
  for (const w of windows) {
    const n = nextStart(w, now, 8 * DAY_MIN);
    if (n && (!best || n.startsInMin < best.startsInMin)) best = { startsInMin: n.startsInMin, window: w };
  }
  return best;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Later today 17:00" / "Tomorrow 12:00" / "Fri 17:00". */
export function formatNextStart(windows: TimeWindow[], now: Date): string | null {
  const n = nextWindowStart(windows, now);
  if (!n) return null;
  const at = new Date(now.getTime() + n.startsInMin * 60_000);
  const dayDiff = Math.round((startOfDay(at).getTime() - startOfDay(now).getTime()) / (DAY_MIN * 60_000));
  const when = dayDiff === 0 ? 'Later today' : dayDiff === 1 ? 'Tomorrow' : DAY_NAMES[at.getDay()];
  return `${when} ${n.window.start}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function formatDays(days: Weekday[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Daily';
  const weekdays: Weekday[] = [1, 2, 3, 4, 5];
  if (sorted.length === 5 && weekdays.every((d) => sorted.includes(d))) return 'Mon–Fri';
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return 'Sat–Sun';
  // contiguous run?
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_NAMES[d]).join(', ');
}

export function formatWindow(w: TimeWindow): string {
  return `${formatDays(w.days)} ${w.start}–${w.end}`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
