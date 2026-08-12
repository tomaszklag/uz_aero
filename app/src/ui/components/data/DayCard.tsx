/**
 * UZ Aero — DayCard (`.day-card` z mockupu 12)
 *
 * Karta SESJI w „Poprzednich dniach": data display + samolot, godziny biegu silnika,
 * rząd statystyk, opcjonalna stopka z tagami i pas akcji.
 *
 * Dwa warianty pasa: `editable` (sesja w oknie korekty) jest niebieski — kolor
 * informacyjny, bo korekta to opcja, a nie następny krok procedury; wariant neutralny
 * to PODGLĄD sesji po oknie (issue #35 pkt 2). Kartę bez pasa też wolno kliknąć, ale
 * pas mówi wprost, co się stanie — bez niego karta wygląda na martwą.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { fontFamily } from '../../theme/tokens';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors } from '../tone';

export interface DayCardProps {
  /** „22 CZERWCA 2026". */
  date: string;
  /** Znak samolotu („SP-AXA"). */
  aircraft: string;
  /** Godziny biegu silnika („08:12 → 10:34 UTC"); `null` = silnik nie ruszył. */
  times?: string | null;
  /** Rząd statystyk (Loty / Blok / Lot). */
  stats: { k: string; v: string }[];
  /** Stopka: tagi stanu i przypisy. Pominięta = karta kończy się na statystykach. */
  foot?: React.ReactNode;
  /** Sesja w oknie korekty — niebieska ramka i niebieski pas akcji. */
  editable?: boolean;
  /** Etykieta pasa akcji; bez niej pasa nie ma. */
  ctaLabel?: string;
  /** Ikona pasa akcji — ołówek dla korekty, oko dla podglądu. */
  ctaIcon?: IconName;
  onPress?: () => void;
  style?: ViewStyle;
}

export function DayCard({
  date,
  aircraft,
  times = null,
  stats,
  foot,
  editable = false,
  ctaLabel,
  ctaIcon = 'edit',
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
          borderColor: editable
            ? pressed
              ? blue.accent
              : blue.border
            : pressed
              ? theme.colors.borderStrong
              : theme.colors.border,
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

      {times != null && (
        <AppText variant="mono" tone="muted" style={styles.times}>
          {times}
        </AppText>
      )}

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

      {/* Stopka tylko wtedy, gdy ma co powiedzieć — pusty pas z kreską nad nim wygląda
          jak treść, która się nie doczytała (issue #35 pkt 3 i 4 zabrały jej oba
          domyślne tagi: „Wysłane" i „Okno minęło"). */}
      {foot != null && (
        <View
          style={[
            styles.foot,
            { borderTopColor: theme.colors.border, borderTopWidth: theme.borderWidth },
          ]}
        >
          {foot}
        </View>
      )}

      {ctaLabel != null && (
        <View
          style={[
            styles.cta,
            {
              backgroundColor: editable ? blue.muted : theme.colors.surfaceRaised,
              borderColor: editable ? blue.border : theme.colors.borderStrong,
              borderWidth: theme.borderWidth,
            },
          ]}
        >
          <Icon
            name={ctaIcon}
            size={15}
            color={editable ? blue.accent : theme.colors.textSecondary}
          />
          <AppText
            variant="display"
            style={[
              styles.ctaLabel,
              { color: editable ? blue.accent : theme.colors.textSecondary },
            ]}
          >
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
  /** `.day-times` — dosunięte do daty ujemnym marginesem, tak jak w mockupie. */
  times: { fontSize: 10, lineHeight: 13, letterSpacing: 0.5, marginTop: -5 },
  stats: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  stat: { gap: 2 },
  statK: { fontSize: 8, letterSpacing: 1.5 },
  statV: { fontSize: 13, fontFamily: fontFamily.monoBold },
  /** Zawijany rząd plakietek: od zera do trzech elementów, więc bez `space-between`. */
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
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
