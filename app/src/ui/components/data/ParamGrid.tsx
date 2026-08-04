/**
 * UZ Aero — ParamGrid (`.param-grid` z mockupu 05)
 *
 * Siatka 2×2 parametrów GPS w locie: prędkość po ziemi, wysokość, paliwo, czas lotu.
 * Komórki stykają się i są rozdzielone włosową linią, a nie osobnymi ramkami — dzięki
 * temu czyta się je jak jeden przyrząd, a nie cztery kafelki.
 *
 * Czym różni się od `MetricGrid`: tam kafelki mają własne ramki i zawijają się dla
 * dowolnej liczby pozycji (liczniki dnia na ziemi). Tutaj układ jest sztywny 2×2, bo
 * w locie te cztery wartości stoją zawsze w tych samych miejscach — pilot sięga po nie
 * pamięcią mięśniową, nie wzrokiem.
 *
 * `tint` delikatnie podbija tło komórki (paliwo amber, czas lotu green), tak jak
 * `.param-cell.amber-bg` / `.green-bg` w mockupie.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface ParamCell {
  label: string;
  value: string;
  unit?: string;
  /** Ton wartości i jednostki. */
  tone?: Tone;
  /** Przygaszone tło w tonie komórki. */
  tint?: boolean;
  /**
   * Czujnik martwy (mockup 05g `.param-value.stale`): wartość przygaszona — „— —"
   * ma wyglądać jak brak odczytu, nie jak odczyt zerowy.
   */
  stale?: boolean;
  /** Przypis pod wartością (`.param-stale-note`): skąd wartość / od kiedy jej brak. */
  note?: string;
}

export interface ParamGridProps {
  cells: ParamCell[];
  style?: ViewStyle;
}

export function ParamGrid({ cells, style }: ParamGridProps) {
  const { theme } = useTheme();

  // Pary jako jawne wiersze z komórkami `flex: 1` — NIE `width: '49.9%'` + zawijanie:
  // 2 × 49.9% plus 1 px odstępu na linię to ponad 100% przy szerokościach telefonów
  // (< 500 pt), więc siatka składała się w pion 1×4.
  const pairs: ParamCell[][] = [];
  for (let i = 0; i < cells.length; i += 2) pairs.push(cells.slice(i, i + 2));

  return (
    <View
      style={[
        styles.grid,
        {
          // Tło prześwituje przez odstępy jako włosowe linie między komórkami.
          backgroundColor: theme.colors.border,
          borderTopWidth: theme.borderWidth,
          borderBottomWidth: theme.borderWidth,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {pairs.map((pair) => (
        <View key={pair[0]!.label} style={styles.gridRow}>
          {pair.map((cell) => (
            <Cell key={cell.label} cell={cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Cell({ cell }: { cell: ParamCell }) {
  const { theme } = useTheme();
  const c = toneColors(theme, cell.tone ?? 'neutral');
  const valueColor = cell.stale
    ? theme.colors.textMuted
    : cell.tone == null
      ? theme.colors.textPrimary
      : c.accent;

  return (
    <View
      style={[
        styles.cell,
        {
          // `.amber-bg`/`.green-bg` z mockupu 05 to akcent w 4% alfy — szept
          // przyrządu. `c.muted` (12%) robił z komórek kolorowe plakietki.
          // Akcenty wszystkich pięciu motywów są 6-cyfrowym hexem, więc
          // dosztukowanie kanału alfa „0A" (10/255 ≈ 0.04) jest bezpieczne.
          backgroundColor: cell.tint === true ? `${c.accent}0A` : theme.colors.surface,
        },
      ]}
    >
      <AppText variant="paramLabel" tone="muted">
        {cell.label}
      </AppText>
      <View style={styles.valueRow}>
        <AppText
          variant="param"
          style={[{ color: valueColor }, cell.stale ? styles.staleValue : null]}
        >
          {cell.value}
        </AppText>
        {cell.unit != null && (
          <AppText
            variant="mono"
            style={[
              styles.unit,
              {
                color: cell.stale
                  ? theme.colors.textMuted
                  : cell.tone == null
                    ? theme.colors.textSecondary
                    : c.accent,
              },
            ]}
          >
            {cell.unit}
          </AppText>
        )}
      </View>
      {cell.note != null && (
        <AppText
          variant="mono"
          // Nota martwej komórki jest czerwona (alarm czujnika); żywej — muted
          // (sam kontekst źródła). Dokładnie `.param-stale-note` z 05g.
          style={[styles.note, { color: cell.stale ? theme.colors.red : theme.colors.textMuted }]}
        >
          {cell.note}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Kolumna wierszy; tło kontenera prześwituje przez 1 px odstępy jako włosowe linie.
  grid: { gap: 1 },
  gridRow: { flexDirection: 'row', gap: 1 },
  // `flex: 1` w jawnym wierszu — obie komórki dzielą szerokość po równo niezależnie
  // od szerokości ekranu i skali czcionki (wady wariantu `width: %` — patrz wyżej).
  cell: { flex: 1, gap: 4, paddingHorizontal: 14, paddingVertical: 12 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  unit: { fontSize: 11, letterSpacing: 1 },
  staleValue: { letterSpacing: 4 },
  note: { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
});
