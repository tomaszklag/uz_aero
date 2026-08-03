/**
 * UZ Aero — DayCard (`.day-card` z mockupu 12)
 *
 * Karta dnia w historii: data display + samolot, rząd statystyk, stopka z tagami.
 * Wariant `editable` (dzień w oknie korekty) jest niebieski, klikalny w całości
 * i ma pod stopką pas „OTWÓRZ I POPRAW" — kolor informacyjny (blue = informacja,
 * nie akcja główna), bo korekta to opcja, a nie następny krok procedury.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { fontFamily } from '../../theme/tokens';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';

export interface DayCardProps {
  /** „22 JUNE 2026". */
  date: string;
  /** Znak samolotu („SP-AXA"). */
  aircraft: string;
  /** Rząd statystyk (Loty / Block / Duty / Skoczków). */
  stats: { k: string; v: string }[];
  /** Stopka: tagi stanu (wysyłka, okno) i ewentualny przypis. */
  foot: React.ReactNode;
  /** Dzień w oknie korekty — niebieska ramka + pas akcji. */
  editable?: boolean;
  /** Etykieta pasa akcji (tylko `editable`). */
  ctaLabel?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export function DayCard({
  date,
  aircraft,
  stats,
  foot,
  editable = false,
  ctaLabel,
  onPress,
  style,
}: DayCardProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');

  return (
    <Pressable
      accessibilityRole={onPress != null ? 'button' : undefined}
      disabled={onPress == null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: editable ? blue.muted : theme.colors.surface,
          borderColor: editable ? (pressed ? blue.accent : blue.border) : theme.colors.border,
          borderWidth: theme.borderWidth,
          borderRadius: theme.radius.btn,
          opacity: pressed && onPress != null ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View style={styles.top}>
        <AppText variant="display" style={styles.date}>
          {date}
        </AppText>
        <AppText variant="mono" style={[styles.aircraft, { color: theme.colors.green }]}>
          {aircraft}
        </AppText>
      </View>

      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.k} style={styles.stat}>
            <AppText variant="label" tone="muted" style={styles.statK}>
              {stat.k}
            </AppText>
            <AppText variant="mono" tone="secondary" style={styles.statV}>
              {stat.v}
            </AppText>
          </View>
        ))}
      </View>

      <View style={[styles.foot, { borderTopColor: theme.colors.border, borderTopWidth: theme.borderWidth }]}>
        {foot}
      </View>

      {editable && ctaLabel != null && (
        <View
          style={[
            styles.cta,
            { backgroundColor: blue.muted, borderColor: blue.border, borderWidth: theme.borderWidth },
          ]}
        >
          <Icon name="edit" size={15} color={blue.accent} />
          <AppText variant="display" style={[styles.ctaLabel, { color: blue.accent }]}>
            {ctaLabel}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 13, paddingHorizontal: 14, gap: 9 },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  date: { fontSize: 21, lineHeight: 22, letterSpacing: 1.5 },
  aircraft: { fontSize: 11, letterSpacing: 1.5 },
  stats: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  stat: { gap: 2 },
  statK: { fontSize: 8, letterSpacing: 1.5 },
  statV: { fontSize: 13, fontFamily: fontFamily.monoBold },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 11,
  },
  ctaLabel: { fontSize: 16, letterSpacing: 2 },
});
