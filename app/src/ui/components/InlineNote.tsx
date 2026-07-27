/**
 * UZ Aero — InlineNote (`.certified-row` / `.none-box` z mockupu 02a)
 *
 * Zwięzła adnotacja w kolorowym pudełku: ikona + jedna–trzy linie tekstu mono 10 px.
 *
 * Czym różni się od `Banner`: baner ma tytuł, tekst body 14 px i miejsce w taksonomii
 * (`status` / `warning` / `edu`) — to komunikat o stanie ekranu. `InlineNote` jest
 * przypisem do sąsiadującej wartości („Poświadczył J. Kowalski · 21 JUNE 17:30").
 * Użycie banera w tej roli rozpychałoby ekran i podnosiło rangę informacji ponad to,
 * co niesie.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tone';

export interface InlineNoteProps {
  icon: IconName;
  text: string;
  tone?: Tone;
  style?: ViewStyle;
}

export function InlineNote({ icon, text, tone = 'green', style }: InlineNoteProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      style={[
        styles.box,
        {
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: theme.radius.sm,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <Icon name={icon} size={13} color={c.accent} style={styles.icon} />
      <AppText variant="mono" style={{ flex: 1, fontSize: 10, lineHeight: 15, color: c.accent }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start' },
  icon: { marginTop: 1 },
});
