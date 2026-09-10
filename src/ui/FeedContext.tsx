import React, { createContext, useContext, useMemo, useState } from 'react';
import type { CityCode, DealType, TravelMode } from '@/types';
import { useDealFeed, type FeedResult } from '@/hooks/useDealFeed';

export interface TimePreset {
  label: string;
  /** Returns the Date to simulate, or undefined for real time. */
  at: () => Date | undefined;
}

const todayAt = (h: number, m: number) => () => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const nextWeekdayAt = (weekday: number, h: number, m: number) => () => {
  const d = new Date();
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  d.setHours(h, m, 0, 0);
  return d;
};

export const TIME_PRESETS: TimePreset[] = [
  { label: 'Now', at: () => undefined },
  { label: 'Today 08:30', at: todayAt(8, 30) },
  { label: 'Today 12:30', at: todayAt(12, 30) },
  { label: 'Today 17:30', at: todayAt(17, 30) },
  { label: 'Sat 10:30', at: nextWeekdayAt(6, 10, 30) },
  { label: 'Fri 21:30', at: nextWeekdayAt(5, 21, 30) },
];

interface FeedSettings {
  mode: TravelMode;
  types: DealType[];
  timePreset: number;
  cityOverride?: CityCode;
  setMode: (m: TravelMode) => void;
  toggleType: (t: DealType) => void;
  clearTypes: () => void;
  setTimePreset: (i: number) => void;
  setCityOverride: (c?: CityCode) => void;
}

const Ctx = createContext<(FeedSettings & { feed: FeedResult }) | null>(null);

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<TravelMode>('WALK');
  const [types, setTypes] = useState<DealType[]>([]);
  const [timePreset, setTimePreset] = useState(0);
  const [cityOverride, setCityOverride] = useState<CityCode>();

  const simulatedNow = useMemo(() => TIME_PRESETS[timePreset].at(), [timePreset]);

  const feed = useDealFeed({ mode, types, simulatedNow, cityOverride, horizonMin: 120 });

  const toggleType = (t: DealType) =>
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const clearTypes = () => setTypes([]);

  const value = useMemo(
    () => ({ mode, types, timePreset, cityOverride, setMode, toggleType, clearTypes, setTimePreset, setCityOverride, feed }),
    [mode, types, timePreset, cityOverride, feed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFeed() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFeed must be used inside FeedProvider');
  return v;
}
