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
      {cells.map((cell) => {
        const c = toneColors(theme, cell.tone ?? 'neutral');
        const valueColor = cell.stale
          ? theme.colors.textMuted
          : cell.tone == null
            ? theme.colors.textPrimary
            : c.accent;

        return (
          <View
            key={cell.label}
            style={[
              styles.cell,
              { backgroundColor: cell.tint === true ? c.muted : theme.colors.surface },
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  // Dwie kolumny; 49.9% zostawia miejsce na włosową linię między nimi.
  cell: { width: '49.9%', flexGrow: 1, gap: 4, paddingHorizontal: 14, paddingVertical: 12 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  unit: { fontSize: 11, letterSpacing: 1 },
  staleValue: { letterSpacing: 4 },
  note: { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
});
