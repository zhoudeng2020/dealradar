import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RankedDeal } from '@/types';
import { formatMinutes, formatNextStart } from '@/engine/hours';
import { colors, DEAL_TYPE_LABEL, MODE_LABEL } from './theme';

export function timingLabel(r: RankedDeal, now: Date): { text: string; tone: 'good' | 'warn' | 'muted' } {
  if (!r.reachable) {
    if (r.timing.state === 'inactive') return { text: formatNextStart(r.deal.windows, now) ?? 'Not on today', tone: 'muted' };
    if (!r.opening.openNow && r.timing.state === 'active') return { text: 'Venue closed', tone: 'warn' };
    return { text: 'Ends before you arrive', tone: 'warn' };
  }
  if (r.timing.state === 'active') return { text: `On now · ${formatMinutes(r.timing.endsInMin)} left`, tone: 'good' };
  if (r.timing.state === 'upcoming') return { text: `Starts in ${formatMinutes(r.timing.startsInMin)}`, tone: 'muted' };
  return { text: 'Not on today', tone: 'muted' };
}

export function DealCard({ item, currency, now, onPress }: { item: RankedDeal; currency: string; now: Date; onPress: () => void }) {
  const t = timingLabel(item, now);
  const toneColor = t.tone === 'good' ? colors.good : t.tone === 'warn' ? colors.warn : colors.inkMuted;
  const price =
    item.deal.price !== undefined
      ? `${currency}${item.deal.price}${item.deal.originalPrice ? `  (was ${currency}${item.deal.originalPrice})` : ''}`
      : item.deal.discountPct
        ? `${item.deal.discountPct}% off`
        : undefined;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, !item.reachable && styles.dim, pressed && { opacity: 0.85 }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.type}>{DEAL_TYPE_LABEL[item.deal.type]} · {item.venue.name}</Text>
          <Text style={styles.title}>{item.deal.title}</Text>
        </View>
        <View style={styles.score}>
          <Text style={styles.scoreNum}>{item.score}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={[styles.metaText, { color: toneColor, fontWeight: '700' }]}>{t.text}</Text>
        <Text style={styles.metaText}>
          {item.travel.minutes} min {MODE_LABEL[item.travel.mode].toLowerCase()} · {item.travel.distanceKm} km
        </Text>
        {price && <Text style={styles.metaText}>{price}</Text>}
      </View>
      {item.deal.confidence < 0.9 && <Text style={styles.unverified}>Not confirmed — check with the venue</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dim: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  type: { color: colors.inkMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  title: { color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 2 },
  score: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  scoreNum: { color: colors.brandText, fontWeight: '800', fontSize: 15 },
  meta: { marginTop: 8, gap: 2 },
  metaText: { color: colors.inkMuted, fontSize: 13 },
  unverified: { marginTop: 6, color: colors.accent, fontSize: 11, fontWeight: '600' },
});
