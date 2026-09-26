/**
 * Ninerdeck - WatchSwitch (`.switch` z makiet 27 i 13C, obserwowanie 3.2.0).
 *
 * Przełącznik obserwowania maszyny: zielony z gałką po prawej = obserwujesz, szary
 * z gałką po lewej = nie. Rysowany sam (dwa `<View>`), nie natywnym `Switch`: ten ma
 * na Androidzie własne kolory i rozmiar, a tu ma wyglądać jak w makiecie i tak samo
 * w obu motywach.
 *
 * Sam przełącznik NIE łapie dotyku - celem jest wiersz albo karta, w której stoi
 * (karta-przełącznik na 27, wiersz z dwoma celami na 13C). Dzięki temu kciuk trafia
 * w 44 dp, a nie w 24-dp gałkę.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';

export interface WatchSwitchProps {
  on: boolean;
  /** Zapis w toku - gałka przygasa, żeby tapnięcie nie wyglądało na zignorowane. */
  busy?: boolean;
}

export function WatchSwitch({ on, busy = false }: WatchSwitchProps) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="switch"
      accessibilityState={{ checked: on, busy }}
      style={[
        styles.track,
        { backgroundColor: on ? theme.colors.green : theme.colors.borderStrong, opacity: busy ? 0.55 : 1 },
      ]}
    >
      <View
        style={[
          styles.knob,
          on ? { right: 3, backgroundColor: theme.colors.bg } : { left: 3, backgroundColor: theme.colors.textSecondary },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: 42, height: 24, borderRadius: 12, flexShrink: 0 },
  knob: { position: 'absolute', top: 3, width: 18, height: 18, borderRadius: 9 },
});
