import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FeedProvider } from '@/ui/FeedContext';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  return (
    <FeedProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.brand },
          headerTintColor: colors.brandText,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'DealRadar' }} />
        <Stack.Screen name="deal/[id]" options={{ title: 'Deal' }} />
      </Stack>
    </FeedProvider>
  );
}
