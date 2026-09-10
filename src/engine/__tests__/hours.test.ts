import { describe, expect, it } from 'vitest';
import { activeRemaining, dealTiming, formatDays, isOpenAt, minutesToChange, nextStart } from '../hours';
import type { TimeWindow } from '@/types';

// 2026-09-11 is a Friday. Dates built with local-time constructor.
const fri = (h: number, m = 0) => new Date(2026, 8, 11, h, m);
const sat = (h: number, m = 0) => new Date(2026, 8, 12, h, m);
const sun = (h: number, m = 0) => new Date(2026, 8, 13, h, m);

const hh: TimeWindow = { days: [1, 2, 3, 4, 5], start: '17:00', end: '20:00' };
const lateNight: TimeWindow = { days: [5, 6], start: '22:00', end: '02:00' };

describe('activeRemaining', () => {
  it('is active inside a same-day window', () => {
    expect(activeRemaining(hh, fri(18, 30))).toBe(90);
  });
  it('is inactive before start, at end, and on excluded days', () => {
    expect(activeRemaining(hh, fri(16, 59))).toBeNull();
    expect(activeRemaining(hh, fri(20, 0))).toBeNull();
    expect(activeRemaining(hh, sat(18, 0))).toBeNull();
  });
  it('handles windows crossing midnight', () => {
    expect(activeRemaining(lateNight, fri(23, 0))).toBe(180); // 23:00 → 02:00
    expect(activeRemaining(lateNight, sat(1, 0))).toBe(60); // Sat 01:00 belongs to Fri window
    expect(activeRemaining(lateNight, sun(1, 0))).toBe(60); // Sun 01:00 belongs to Sat window
    expect(activeRemaining(lateNight, sat(3, 0))).toBeNull();
  });
  it('treats 00:00–24:00 as always open', () => {
    const allDay: TimeWindow = { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00' };
    expect(activeRemaining(allDay, fri(0, 0))).toBe(1440);
    expect(activeRemaining(allDay, fri(23, 59))).toBe(1);
  });
});

describe('nextStart', () => {
  it('finds a start later today within horizon', () => {
    expect(nextStart(hh, fri(16, 0), 120)).toEqual({ startsInMin: 60, lengthMin: 180 });
  });
  it('returns null when outside horizon', () => {
    expect(nextStart(hh, fri(10, 0), 120)).toBeNull();
  });
  it('rolls over to next valid day', () => {
    // Sat 18:00 → next is Mon 17:00 = 2 days − 1h = 2820 min
    expect(nextStart(hh, sat(18, 0), 10000)).toEqual({ startsInMin: 2820, lengthMin: 180 });
  });
});

describe('dealTiming', () => {
  it('prefers active over upcoming', () => {
    const t = dealTiming([hh], fri(17, 30), 120);
    expect(t).toEqual({ state: 'active', endsInMin: 150 });
  });
  it('reports upcoming with end time', () => {
    const t = dealTiming([hh], fri(16, 0), 120);
    expect(t).toEqual({ state: 'upcoming', startsInMin: 60, endsInMin: 240 });
  });
  it('reports inactive', () => {
    expect(dealTiming([hh], sat(12, 0), 120)).toEqual({ state: 'inactive' });
  });
});

describe('venue hours', () => {
  const hours: TimeWindow[] = [
    { days: [1, 2, 3, 4, 5], start: '11:30', end: '01:00' },
    { days: [6, 0], start: '11:30', end: '02:00' },
  ];
  it('isOpenAt across midnight', () => {
    expect(isOpenAt(hours, sat(0, 30))).toBe(true); // Friday night spill-over
    expect(isOpenAt(hours, sat(3, 0))).toBe(false);
    expect(isOpenAt(hours, sat(12, 0))).toBe(true);
  });
  it('minutesToChange gives time to close when open, to open when closed', () => {
    expect(minutesToChange(hours, fri(23, 0))).toBe(120);
    expect(minutesToChange(hours, sat(9, 0))).toBe(150);
  });
});

describe('formatDays', () => {
  it('formats common patterns', () => {
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe('Daily');
    expect(formatDays([1, 2, 3, 4, 5])).toBe('Mon–Fri');
    expect(formatDays([6, 0])).toBe('Sat–Sun');
    expect(formatDays([2, 3, 4, 5])).toBe('Tue–Fri');
    expect(formatDays([1, 3])).toBe('Mon, Wed');
  });
});
