import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import type { LatLng } from '@/types';

export type LocationState =
  | { status: 'loading' }
  | { status: 'ok'; point: LatLng }
  | { status: 'denied' }
  | { status: 'error'; message: string };

/** Device location (when-in-use). Denied / unavailable → caller falls back to city centre. */
export function useLocation(): LocationState & { refresh: () => void } {
  const [state, setState] = useState<LocationState>({ status: 'loading' });

  const refresh = useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          if (!cancelled) setState({ status: 'denied' });
          return;
        }
        const last = await Location.getLastKnownPositionAsync();
        if (last && !cancelled) {
          setState({ status: 'ok', point: { lat: last.coords.latitude, lng: last.coords.longitude } });
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setState({ status: 'ok', point: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refresh(), [refresh]);

  return { ...state, refresh };
}
