import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { formatWindow } from '@/engine/hours';
import { DEALS, venueById } from '@/data/seed';
import { timingLabel } from '@/ui/DealCard';
import { useFeed } from '@/ui/FeedContext';
import { colors, DEAL_TYPE_LABEL, MODE_LABEL } from '@/ui/theme';

export default function DealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { feed, mode } = useFeed();
  const ranked = feed.deals.find((r) => r.deal.id === id);
  const deal = ranked?.deal ?? DEALS.find((d) => d.id === id);
  const venue = ranked?.venue ?? (deal ? venueById(deal.venueId) : undefined);

  if (!deal || !venue) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Deal not found.</Text>
      </View>
    );
  }

  const { lat, lng } = venue.location;
  const modeParam = mode === 'WALK' ? 'walking' : mode === 'TRANSIT' ? 'transit' : 'driving';
  const directionsUrl =
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` +
    `&destination_place_id=${venue.placeId ?? ''}&travelmode=${modeParam}`;
  const appleUrl = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=${mode === 'WALK' ? 'w' : mode === 'TRANSIT' ? 'r' : 'd'}`;
  const t = ranked ? timingLabel(ranked, feed.now) : undefined;
  const cur = feed.city.currency;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: venue.name }} />
      <Text style={styles.type}>{DEAL_TYPE_LABEL[deal.type]}</Text>
      <Text style={styles.h1}>{deal.title}</Text>
      <Text style={styles.body}>{deal.description}</Text>

      {ranked && (
        <View style={styles.card}>
          <Row k="Status" v={t?.text ?? ''} strong />
          <Row k="Score" v={`${ranked.score} / 100`} />
          <Row k="Travel" v={`${ranked.travel.minutes} min by ${MODE_LABEL[ranked.travel.mode].toLowerCase()} · ${ranked.travel.distanceKm} km (${ranked.travel.source === 'google-routes' ? 'Google' : 'estimate'})`} />
          <Row k="Venue" v={`${ranked.opening.openNow ? 'Open' : 'Closed'} (${ranked.opening.source === 'google-places' ? 'Google' : 'seed hours'})`} />
          <Row k="Why" v={ranked.reasons.join(' · ')} />
        </View>
      )}

      <Section title="Deal times">
        {deal.windows.map((w, i) => (
          <Text key={i} style={styles.body}>{formatWindow(w)}</Text>
        ))}
        {deal.price !== undefined && (
          <Text style={styles.body}>
            {cur}{deal.price}{deal.originalPrice ? ` (regular ${cur}${deal.originalPrice})` : ''}
          </Text>
        )}
        {deal.discountPct !== undefined && deal.price === undefined && <Text style={styles.body}>{deal.discountPct}% off</Text>}
      </Section>

      <Section title="Venue">
        <Text style={styles.body}>{venue.address}</Text>
        <Text style={styles.body}>{venue.cuisine}{venue.outdoor ? ' · outdoor seating' : ''}</Text>
        {venue.hours.map((w, i) => (
          <Text key={i} style={styles.muted}>{formatWindow(w)}</Text>
        ))}
      </Section>

      <Section title="Source">
        <Text style={styles.muted}>
          {deal.confidence >= 0.9 ? "Confirmed from the venue's own listing" : 'Not confirmed — check with the venue before you go'} · last checked {deal.lastVerified}
        </Text>
        <Pressable onPress={() => Linking.openURL(deal.sourceUrl)}>
          <Text style={styles.link}>{deal.sourceUrl}</Text>
        </Pressable>
      </Section>

      <Pressable style={styles.primary} onPress={() => Linking.openURL(directionsUrl)}>
        <Text style={styles.primaryText}>Directions in Google Maps</Text>
      </Pressable>
      {Platform.OS === 'ios' && (
        <Pressable style={styles.secondary} onPress={() => Linking.openURL(appleUrl)}>
          <Text style={styles.secondaryText}>Open in Apple Maps</Text>
        </Pressable>
      )}
      {venue.website && (
        <Pressable style={styles.secondary} onPress={() => Linking.openURL(venue.website!)}>
          <Text style={styles.secondaryText}>Venue website</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={[styles.rowVal, strong && { fontWeight: '700', color: colors.ink }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  type: { color: colors.inkMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  h1: { fontSize: 22, fontWeight: '800', color: colors.ink, marginTop: 4 },
  h2: { fontSize: 14, fontWeight: '800', color: colors.ink, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  body: { color: colors.ink, fontSize: 15, marginTop: 6, lineHeight: 21 },
  muted: { color: colors.inkMuted, fontSize: 13, marginTop: 4 },
  link: { color: '#1D4ED8', fontSize: 13, marginTop: 4 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, marginTop: 16 },
  row: { flexDirection: 'row', paddingVertical: 4 },
  rowKey: { width: 64, color: colors.inkMuted, fontSize: 13, fontWeight: '700' },
  rowVal: { flex: 1, color: colors.inkMuted, fontSize: 13 },
  primary: { marginTop: 24, backgroundColor: colors.brand, borderRadius: 12, padding: 14, alignItems: 'center' },
  primaryText: { color: colors.brandText, fontWeight: '800', fontSize: 15 },
  secondary: { marginTop: 10, backgroundColor: colors.chip, borderRadius: 12, padding: 14, alignItems: 'center' },
  secondaryText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});
