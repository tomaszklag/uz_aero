/**
 * UZ Aero — SummaryGrid (`.summary-grid` z mockupu 03)
 *
 * Dwukolumnowa siatka „klucz nad wartością" do podsumowań tylko-do-odczytu.
 *
 * Czym różni się od `MetricGrid`: metryka to **przyrząd** — własna ramka, wartość 28 px,
 * czytana kątem oka w locie. Tu chodzi o kontrolę danych przed zapisem: sześć pozycji
 * ma zmieścić się naraz, żeby dało się je porównać jednym spojrzeniem, więc pozycje
 * nie mają ramek i siedzą w jednej wspólnej sekcji.
 *
 * `text: true` obniża rozmiar wartości — nazwiska i oznaczenie klienta są dłuższe niż
 * liczby i przy 16 px łamałyby kolumnę (mockup robi dokładnie to samo).
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tone';

export interface SummaryEntry {
  /** Nagłówek pozycji, np. „PIC". */
  key: string;
  value: string;
  /**
   * Krótka JEDNOSTKA tuż za wartością („MH", „UTC"). Tylko coś, co na pewno zmieści się
   * w tej samej linii — kolumna ma połowę szerokości ekranu.
   */
  note?: string;
  /**
   * Wartość drugorzędna w OSOBNEJ linii pod spodem („15:19 LT").
   *
   * Wcześniej czas lokalny dopisywał się do `note` i łamał się w połowie: pod „13:19 UTC"
   * zostawało samotne „LT" wyrzucone do następnej linii (zgłoszenie z urządzenia).
   * Własna linia nie ma jak się rozjechać, a hierarchia zostaje ta sama — LT jest
   * wartością drugorzędną przy meldunku (`CLAUDE.md`).
   */
  sub?: string;
  tone?: Tone;
  /** Wartość tekstowa (nazwisko, klient) zamiast liczbowej — mniejszy stopień. */
  text?: boolean;
}

export interface SummaryGridProps {
  entries: SummaryEntry[];
  style?: ViewStyle;
}

export function SummaryGrid({ entries, style }: SummaryGridProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.grid, style]}>
      {entries.map((entry) => {
        const c = toneColors(theme, entry.tone ?? 'neutral');
        const color = entry.tone == null ? theme.colors.textPrimary : c.accent;

        return (
          <View key={entry.key} style={styles.item}>
            <AppText variant="mono" tone="muted" style={styles.key}>
              {entry.key}
            </AppText>
            <View style={styles.valueRow}>
              <AppText
                variant="mono"
                numberOfLines={1}
                style={{
                  fontFamily: theme.fontFamily.monoBold,
                  fontSize: entry.text === true ? 13 : 16,
                  lineHeight: 20,
                  letterSpacing: 1,
                  color,
                }}
              >
                {entry.value}
              </AppText>
              {entry.note != null && (
                <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.note}>
                  {entry.note}
                </AppText>
              )}
            </View>

            {entry.sub != null && (
              <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.note}>
                {entry.sub}
              </AppText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Dwie kolumny: 50% minus połowa odstępu.
  item: { width: '47.5%', flexGrow: 1, gap: 3 },
  key: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  note: { flexShrink: 1, fontSize: 11, letterSpacing: 0.5 },
});
