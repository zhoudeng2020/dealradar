import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WeatherNow } from '@/types';
import { colors } from './theme';

export function WeatherBar({ weather }: { weather: WeatherNow | null }) {
  if (!weather) return null;
  const raining = weather.precipitationMm >= 0.5 || weather.rainProbabilityPct >= 60;
  const hot = weather.temperatureC >= 33;
  let hint = 'Good conditions — outdoor and walking deals ranked normally.';
  if (raining) hint = 'Rain likely — indoor venues and short trips ranked higher.';
  else if (hot) hint = 'Hot — long walks ranked lower; consider transit.';
  return (
    <View style={[styles.bar, raining && styles.rain]}>
      <Text style={styles.main}>
        {Math.round(weather.temperatureC)}°C · {weather.summary} · rain {weather.rainProbabilityPct}%
      </Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#E8F1FB',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  rain: { backgroundColor: '#FDECEC' },
  main: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  hint: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
});
