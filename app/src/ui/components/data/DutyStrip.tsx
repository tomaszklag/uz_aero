/**
 * UZ Aero — DutyStrip (`.duty-strip` z mockupu 04)
 *
 * Pasek czasu służby: ikona zegara, licznik od meldunku i godzina meldunku po prawej.
 *
 * Stoi osobno, a nie w siatce metryk, bo odpowiada na inne pytanie niż liczniki dnia.
 * Block time i liczba lotów mówią, ile zrobiono; duty time mówi, ile **wolno jeszcze
 * latać** — to jedyna wartość na ekranie związana z limitem czasu pracy, więc ma nie
 * ginąć wśród statystyk.
 *
 * Czas meldunku w UTC, LT jako wartość drugorzędna (`CLAUDE.md`).
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';

export interface DutyStripProps {
  /** Sformatowany licznik od meldunku („04:34"). */
  elapsed: string;
  /** Prawa strona: „Meldunek 08:00 UTC · 10:00 LT". */
  since?: string;
  label?: string;
  style?: ViewStyle;
}

export function DutyStrip({ elapsed, since, label = 'Duty Time', style }: DutyStripProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');

  return (
    <View
      style={[
        styles.strip,
        {
          gap: theme.spacing.sm,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      <View style={styles.left}>
        <Icon name="clock" size={16} color={blue.accent} />
        <View>
          <AppText variant="mono" tone="muted" style={styles.label}>
            {label}
          </AppText>
          <AppText variant="mono" style={styles.value}>
            {elapsed}
          </AppText>
        </View>
      </View>

      {since != null && (
        <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.since}>
          {since}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  value: { fontSize: 16, lineHeight: 20, letterSpacing: 2 },
  since: { flexShrink: 1, fontSize: 10, letterSpacing: 0.5 },
});
