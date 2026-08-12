/**
 * UZ Aero — SessionHero (`.duty-hero` z mockupu 10 „Rozliczenie samolotu")
 *
 * Wyśrodkowana karta z jedną liczbą podaną wielkim krojem: czas blokowy SESJI, pod nim
 * zakres, z którego powstał („przejęty 08:04 → zdany 11:20 UTC · 2 loty").
 *
 * Bohaterem był tu czas służby, dopóki dzień pilota i sesja samolotu były tym samym.
 * Dziś nie są: dzień pilota to lista sesji na różnych maszynach (issue #23) i mieszka
 * na 01, więc na ekranie rozliczającym JEDEN samolot nie ma czego szukać. Zostaje wielkość, która
 * naprawdę opisuje tę maszynę i którą przepisuje się do dokumentów — czas blokowy.
 * Zakres pod spodem pozwala sprawdzić, czy przejęcie i zdanie mają właściwe godziny.
 *
 * Czym różni się od `ClaimStrip` (04): tam licznik **bieżący** tyka w pasku obok innych
 * przyrządów; tu wartość jest zamknięta i jest bohaterem ekranu podsumowania.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface SessionHeroProps {
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

export function SessionHero({
  label = 'Czas blokowy sesji',
  value,
  range,
  tone = 'green',
  style,
}: SessionHeroProps) {
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
