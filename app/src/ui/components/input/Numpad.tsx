/**
 * UZ Aero — Numpad (`.numpad` z mockupu 00)
 *
 * Klawiatura PIN: siatka 3×4, przyciski 58 px (rękawice), cyfry mono. Dolny rząd:
 * pusty slot-duch (w mockupie biometria — opcja odłożona, patrz docblock ekranu),
 * zero, kasowanie. Własna klawiatura zamiast systemowej, bo systemowa zasłania pół
 * ekranu i nie trzyma języka wizualnego kokpitu.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { fontFamily } from '../../theme/tokens';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface NumpadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

const ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export function Numpad({ onDigit, onBackspace, disabled = false, style }: NumpadProps) {
  const { theme } = useTheme();

  const key = (content: React.ReactNode, onPress: (() => void) | null, ghost = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || onPress == null}
      onPress={onPress ?? undefined}
      style={({ pressed }) => [
        styles.key,
        {
          borderRadius: theme.radius.btn,
          borderWidth: theme.borderWidth,
          borderColor: ghost ? 'transparent' : pressed ? theme.colors.greenBorder : theme.colors.border,
          backgroundColor: ghost
            ? 'transparent'
            : pressed
              ? theme.colors.greenMuted
              : theme.colors.surface,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );

  const digit = (d: string) =>
    key(
      <AppText variant="mono" style={styles.digit}>
        {d}
      </AppText>,
      () => onDigit(d),
    );

  return (
    <View style={[styles.pad, style]}>
      {ROWS.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map((d) => (
            <React.Fragment key={d}>{digit(d)}</React.Fragment>
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {/* Slot biometrii z mockupu — celowo pusty do czasu decyzji o expo-local-authentication. */}
        <View style={styles.key} />
        {digit('0')}
        {key(<Icon name="back" size={20} color={theme.colors.textMuted} />, onBackspace, true)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 12 },
  row: { flexDirection: 'row', gap: 18, justifyContent: 'center' },
  key: { width: 78, height: 58, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 20, fontFamily: fontFamily.monoMedium },
});
