/**
 * Ninerdeck - czy aplikacja jest NA WIERZCHU (4.0.0, kanał klubu, epik KK-C #246).
 *
 * Jedyny reaktywny odczyt `AppState` w aplikacji: łącze kanału stoi wyłącznie na wierzchu,
 * bo w tle wiadomości przychodzą pushem (K4). Co liczy się jako wierzch, mówi czysta
 * reguła `isForegroundState` - z testem; tu jest tylko nasłuch.
 */

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { isForegroundState } from '../../application/live/linkRule';

export function useAppForeground(): boolean {
  const [foreground, setForeground] = useState(() => isForegroundState(AppState.currentState));

  useEffect(() => {
    // Stan mógł się zmienić między pierwszym renderem a podpięciem nasłuchu.
    setForeground(isForegroundState(AppState.currentState));
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(isForegroundState(state));
    });
    return () => subscription.remove();
  }, []);

  return foreground;
}
