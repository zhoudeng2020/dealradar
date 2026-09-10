import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from './theme';

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.active, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.text, active && styles.activeText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.chip,
    marginRight: 8,
  },
  active: { backgroundColor: colors.chipActive },
  text: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  activeText: { color: colors.chipActiveText },
});
