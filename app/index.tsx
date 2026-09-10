import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DealType, TravelMode } from '@/types';
import { CITY_LIST } from '@/data/cities';
import { Chip } from '@/ui/Chip';
import { DealCard } from '@/ui/DealCard';
import { WeatherBar } from '@/ui/WeatherBar';
import { TIME_PRESETS, useFeed } from '@/ui/FeedContext';
import { colors, DEAL_TYPE_LABEL, MODE_LABEL } from '@/ui/theme';

const TYPES: DealType[] = ['breakfast', 'brunch', 'lunch', 'happy_hour', 'dinner', 'late_night'];
const MODES: TravelMode[] = ['WALK', 'TRANSIT', 'DRIVE'];

export default function Home() {
  const router = useRouter();
  const { feed, mode, setMode, types, toggleType, clearTypes, timePreset, setTimePreset, cityOverride, setCityOverride } = useFeed();

  const header = (
    <View>
      <View style={styles.headerBlock}>
        <Text style={styles.h1}>Best deals near you</Text>
        <Text style={styles.sub}>
          {feed.city.name} · {feed.originSource === 'device' ? 'your location' : `${feed.city.name} centre (demo)`}
          {feed.liveHours ? ' · live hours' : ' · seed hours'}
          {feed.liveRoutes ? ' · Google travel times' : ' · estimated travel'}
        </Text>
      </View>

      <WeatherBar weather={feed.weather} />

      <ChipRow label="Deal">
        <Chip label="All" active={types.length === 0} onPress={clearTypes} />
        {TYPES.map((t) => (
          <Chip key={t} label={DEAL_TYPE_LABEL[t]} active={types.includes(t)} onPress={() => toggleType(t)} />
        ))}
      </ChipRow>
      <ChipRow label="Get there">
        {MODES.map((m) => (
          <Chip key={m} label={MODE_LABEL[m]} active={mode === m} onPress={() => setMode(m)} />
        ))}
      </ChipRow>
      <ChipRow label="Time">
        {TIME_PRESETS.map((p, i) => (
          <Chip key={p.label} label={p.label} active={timePreset === i} onPress={() => setTimePreset(i)} />
        ))}
      </ChipRow>
      <ChipRow label="City">
        <Chip label="Auto" active={!cityOverride} onPress={() => setCityOverride(undefined)} />
        {CITY_LIST.map((c) => (
          <Chip key={c.code} label={c.name} active={cityOverride === c.code} onPress={() => setCityOverride(c.code)} />
        ))}
      </ChipRow>

      {feed.error && <Text style={styles.error}>{feed.error}</Text>}
      {feed.loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.sub}>Checking hours, travel time and weather…</Text>
        </View>
      )}
      {!feed.loading && feed.deals.length === 0 && <Text style={styles.empty}>No deals match these filters.</Text>}
    </View>
  );

  return (
    <FlatList
      data={feed.deals}
      keyExtractor={(r) => r.deal.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <DealCard item={item} currency={feed.city.currency} now={feed.now} onPress={() => router.push(`/deal/${item.deal.id}`)} />
      )}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={feed.refresh} />}
    />
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.chipRow}>
      <Text style={styles.chipLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  h1: { fontSize: 24, fontWeight: '800', color: colors.ink },
  sub: { color: colors.inkMuted, fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, marginBottom: 8 },
  chipLabel: { width: 62, color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  loading: { padding: 24, alignItems: 'center', gap: 8 },
  empty: { padding: 24, textAlign: 'center', color: colors.inkMuted },
  error: { marginHorizontal: 16, color: colors.warn, fontSize: 12 },
});
