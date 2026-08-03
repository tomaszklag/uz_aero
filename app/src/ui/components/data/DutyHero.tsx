/**
 * UZ Aero — DutyHero (`.duty-hero` z mockupu 10)
 *
 * Wyśrodkowana karta z jedną liczbą podaną wielkim krojem: czas służby dnia, pod nim
 * zakres, z którego powstał.
 *
 * Dlaczego ta wartość, a nie block time, dostaje 52 px: block time mówi, ile zrobiono,
 * duty time mówi, ile **wolno było** — to jedyna liczba na tym ekranie związana z limitem
 * czasu pracy, a jednocześnie pierwsza, którą przepisuje się do dokumentów. Zakres pod
 * spodem jest tu dlatego, że sam licznik nie pozwala sprawdzić, czy meldunek i zamknięcie
 * mają właściwe godziny.
 *
 * Czym różni się od `DutyStrip` (04): tam licznik **bieżący** tyka w pasku obok innych
 * przyrządów; tu wartość jest zamknięta i jest bohaterem ekranu podsumowania.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface DutyHeroProps {
  /** Etykieta nad wartością. */
  label?: string;
  /** Wartość główna („08:45"). */
  value: string;
  /** Zakres pod wartością („08:00 UTC → 16:45 UTC"). */
  range?: string;
  /** Ton paska akcentu u góry karty. */
  tone?: Tone;
  style?: ViewStyle;
}

export function DutyHero({
  label = 'Czas służby',
  value,
  range,
  tone = 'green',
  style,
}: DutyHeroProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      style={[
        styles.hero,
        {
          paddingHorizontal: 14,
          paddingVertical: theme.spacing.lg,
          borderRadius: theme.radius.lg,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      {/* Mockup ma tu gradient „transparent → akcent → transparent". Bez dodatkowej
          biblioteki gradientów (a `expo-linear-gradient` to kolejna zależność natywna)
          zostaje pełna kreska w tonie akcentu — ta sama rola, jeden kolor mniej. */}
      <View style={[styles.accent, { backgroundColor: c.accent }]} />

      <AppText variant="mono" tone="muted" style={styles.label}>
        {label}
      </AppText>
      <AppText variant="display" style={styles.value}>
        {value}
      </AppText>
      {range != null && (
        <AppText variant="mono" tone="secondary" style={styles.range}>
          {range}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 4, overflow: 'hidden' },
  accent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  label: { fontSize: 8, lineHeight: 12, letterSpacing: 2.5, textTransform: 'uppercase' },
  value: { fontSize: 52, lineHeight: 54, letterSpacing: 3 },
  range: { fontSize: 11, lineHeight: 16, letterSpacing: 1 },
});
