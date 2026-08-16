/**
 * UZ Aero — StatGrid (`.fuel-grid-2x2` / `.fuel-cell` z mockupu 10)
 *
 * Siatka bilansowa: dwie kolumny komórek „etykieta → wielka liczba → jednostka",
 * rozdzielonych włosową linią i dociągniętych do krawędzi karty.
 *
 * Czym różni się od `ParamGrid` (05): tam wartość jest odczytem przyrządu
 * — cyfry mono, jednostka w tej samej linii, bo liczba może się zmienić w każdej sekundzie
 * i musi być czytelna kątem oka. Tutaj wartości są **zamknięte**: to bilans dnia, który
 * pilot przepisuje do dokumentów. Stąd krój display i jednostka słowem („litrów",
 * „wyniesień") pod liczbą — nazwana jednostka zdejmuje pytanie „litry czy galony".
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface StatCell {
  label: string;
  value: string;
  /** Jednostka słowem pod wartością („litrów", „łącznie"). */
  unit?: string;
  /** Ton wartości: paliwo = amber, zrzuty = blue. */
  tone?: Tone;
}

export interface StatGridProps {
  cells: StatCell[];
  /**
   * Bez teł i linii — dla siatki osadzonej na tonowanej karcie (mockup 08 `.fuel-card`:
   * komórki leżą wprost na amber, linie i „pudełka" psułyby jednolitą powierzchnię).
   */
  flat?: boolean;
  /**
   * Liczba kolumn; 08 kładzie trzy stany paliwa w jednym rzędzie, a statystyki śladu
   * (14, issue #47) cztery liczby prędkości i pionu — tam wartości są krótkie
   * („118", „+1 240"), więc mieszczą się bez łamania.
   */
  columns?: 2 | 3 | 4;
  style?: ViewStyle;
}

export function StatGrid({ cells, flat = false, columns = 2, style }: StatGridProps) {
  const { theme } = useTheme();
  // `flexBasis` ZAUWAŻALNIE mniejsze niż pełny podział (45% zamiast 49,9%), bo luz musi
  // pomieścić 1-pikselowy `gap`: przy 49,9% zapas wynosił 0,2% szerokości rodzica, czyli
  // na telefonie ~0,7 px — MNIEJ niż odstęp — i druga komórka spadała do nowego wiersza
  // (zgłoszenie z urządzenia przy issue #23: „Blok" i „Loty" jedno pod drugim).
  // `flexGrow` dociąga komórki z powrotem do pełnej szerokości rzędu.
  const cellBasis = columns === 4 ? '22%' : columns === 3 ? '30%' : '45%';

  return (
    <View
      style={[
        styles.grid,
        {
          // Tło prześwituje przez 1-pikselowe odstępy jako linie między komórkami.
          backgroundColor: flat ? 'transparent' : theme.colors.border,
        },
        style,
      ]}
    >
      {cells.map((cell) => {
        const c = toneColors(theme, cell.tone ?? 'neutral');
        const valueColor = cell.tone == null ? theme.colors.textPrimary : c.accent;

        return (
          <View
            key={cell.label}
            style={[
              styles.cell,
              { flexBasis: cellBasis, backgroundColor: flat ? 'transparent' : theme.colors.surface },
            ]}
          >
            <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.label}>
              {cell.label}
            </AppText>
            <AppText variant="display" style={[styles.value, { color: valueColor }]}>
              {cell.value}
            </AppText>
            {cell.unit != null && (
              <AppText variant="mono" tone="secondary" numberOfLines={1} style={styles.unit}>
                {cell.unit}
              </AppText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  // Baza szerokości ustawiana dynamicznie (`cellBasis` — 2 albo 3 kolumny).
  cell: { flexGrow: 1, gap: 3, paddingHorizontal: 12, paddingVertical: 10 },
  label: { fontSize: 8, lineHeight: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  value: { fontSize: 24, lineHeight: 26, letterSpacing: 1 },
  unit: { fontSize: 9, lineHeight: 13, letterSpacing: 0.5 },
});
