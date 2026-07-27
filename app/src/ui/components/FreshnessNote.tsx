/**
 * UZ Aero — FreshnessNote (`.fresh-note` z mockupu 02a)
 *
 * Adnotacja wieku danych z serwera. §4.8 i `CLAUDE.md` dzielą takie wartości na trzy stany:
 *
 *  • `live`  — dane na żywo, **bez żadnej adnotacji** (cisza to informacja: jest świeżo);
 *  • `cache` — z ostatniej synchronizacji: „Ostatnie pobrane · 21 JUN 17:30", amber;
 *  • `brak`  — nie mamy nic: „Brak danych — wpisz z licznika", amber.
 *
 * Komponent istnieje po to, żeby tej reguły nie dało się zapomnieć: każde miejsce
 * pokazujące wartość z serwera przyjmuje `state` i samo wyświetla właściwą adnotację,
 * zamiast improwizować własny tekst na każdym ekranie.
 *
 * Uwaga z mockupu: świeżość i łączność to **dwie różne osie**. `brak` zdarza się też
 * online (nowy samolot we flocie), dlatego ten komponent nie mówi nic o sieci —
 * od tego jest `SyncChip`.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { toneColors } from './tone';

export type Freshness = 'live' | 'cache' | 'brak';

export interface FreshnessNoteProps {
  state: Freshness;
  /** Czas ostatniej synchronizacji — pokazywany przy `cache`. */
  syncedAt?: string | null;
  /** Tekst dla `brak`; domyślnie wersja z mockupu. */
  missingLabel?: string;
  style?: ViewStyle;
}

export function FreshnessNote({
  state,
  syncedAt,
  missingLabel = 'Brak danych — wpisz z licznika',
  style,
}: FreshnessNoteProps) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

  if (state === 'live') return null;

  const label =
    state === 'cache'
      ? syncedAt != null
        ? `Ostatnie pobrane · ${syncedAt}`
        : 'Ostatnie pobrane · z cache'
      : missingLabel;

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.dot, { backgroundColor: amber.accent }]} />
      <AppText variant="mono" tone="amber" style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5, flexShrink: 0 },
  label: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
});
