/**
 * Ninerdeck - ToggleRow (`.toggle-row` z makiety 31B; zlecenia 4.0.0).
 *
 * Karta-przełącznik: tytuł, podpis i przełącznik po prawej. Kształt 1:1 z przełącznikami
 * obserwowania (13C) - sam przełącznik to `WatchSwitch`, jedyny taki rysunek w aplikacji.
 * Celem dotyku jest CAŁA karta, nie 24-dp gałka.
 *
 * Podpis NIE zmienia się ze stanem: opis przełącznika jest jego właściwością, a skutek
 * bieżącego wyboru mówi zdanie przy przycisku, którym się go zatwierdza (31B).
 *
 * ZABLOKOWANY (`locked`, edycja zlecenia - ramka 4 makiety 31B): przełącznik zostaje, bo
 * mówi, jaki stan jest, ale przygaszony, z kłódką i bez celu dotyku. Podpis podaje
 * wtedy wołający - przygaszony BEZ zdania byłby przyciskiem, który nic nie robi (§6 pkt 3).
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { WatchSwitch } from '../settings/WatchSwitch';

export interface ToggleRowProps {
  title: string;
  sub: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  /** Stan do odczytu - kłódka, przygaszony przełącznik, bez celu dotyku. */
  locked?: boolean;
}

export function ToggleRow({ title, sub, on, onToggle, locked = false }: ToggleRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: locked }}
      accessibilityLabel={title}
      accessibilityHint={sub}
      disabled={locked}
      onPress={() => onToggle(!on)}
      style={({ pressed }) => [s.row, pressed && !locked && s.pressed]}
    >
      <View style={s.body}>
        <AppText variant="body" style={s.title}>
          {title}
        </AppText>
        <AppText variant="mono" style={s.sub}>
          {sub}
        </AppText>
      </View>
      {locked && <Icon name="lock" size={13} color={theme.colors.textMuted} />}
      <View style={locked && s.dim}>
        <WatchSwitch on={on} />
      </View>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 13,
      borderRadius: 14,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    pressed: { opacity: 0.8 },
    dim: { opacity: 0.4 },
    body: { flex: 1, minWidth: 0, gap: 2 },
    title: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 13, lineHeight: 17, color: t.colors.textPrimary },
    sub: { fontSize: 9, lineHeight: 13, letterSpacing: 0.5, color: t.colors.textMuted },
  });
