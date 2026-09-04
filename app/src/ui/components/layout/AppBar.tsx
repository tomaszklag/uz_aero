/**
 * UZ Aero - AppBar
 *
 * Górny pasek kontekstu, wspólny dla ekranów dnia lotnego (.app-bar / .compact-bar
 * w mockupach): po lewej samolot i trasa, po prawej wskaźnik łączności i akcje.
 *
 * Samolot jest wyróżniony kolorem, bo to jedyna informacja, która musi być czytelna
 * jednym spojrzeniem - pilot lata kilkoma maszynami i pomyłka kosztuje rozjazd danych.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';

export interface AppBarProps {
  /**
   * Tytuł paska: SYGNATURA operacji („SP-AXA/2026-09-01/AKO/1"), a gdy operacja
   * numeru jeszcze nie ma (przed uruchomieniem silnika) - sam znak samolotu.
   * Sygnatura ZASTĘPUJE znak, bo się od niego zaczyna (issue #68, reguła z DayCard);
   * surowego identyfikatora maszyny tu nie podajemy nigdy (uwaga z urządzenia,
   * 2026-09-02: nagłówek kokpitu pokazywał guid z panelu).
   */
  aircraft?: string | null;
  /** Druga linia: trasa i operacja (np. „EPKK → EPWA · SKOKI"). */
  subtitle?: string | null;
  /**
   * Prawa strona - `SyncChip`, plakietka stanu i akcje paska.
   *
   * `onSettings` (koło zębate `.settings-btn` z mockupów kokpitu) USUNIĘTE przy
   * issue #82: ustawienia mają odtąd JEDNO wejście, na „Mój dzień", a w miejscu
   * zębatki w kokpicie stoi `ThemeToggle`. Nowej akcji nie dokładamy tu propem -
   * pasek przyjmuje ją przez `right`, bo tylko wołający wie, co obok czego stoi.
   */
  right?: React.ReactNode;
  /** Kompaktowy wariant dla trybu w locie (mniej pionowego miejsca). */
  compact?: boolean;
  style?: ViewStyle;
}

export function AppBar({
  aircraft,
  subtitle,
  right,
  compact = false,
  style,
}: AppBarProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingHorizontal: theme.spacing.md,
          paddingVertical: compact ? theme.spacing.xs : theme.spacing.sm,
          borderBottomWidth: theme.borderWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: compact ? theme.colors.surface : 'transparent',
        },
        style,
      ]}
    >
      <View style={styles.left}>
        {/* Sygnatura dostaje węższy odstęp międzyliterowy niż goły znak (reguła
            z DayCard): 23 znaki przy ls 1,5 rozpychały pasek i spychały chipy.
            Bez `numberOfLines` - identyfikator ucięty wielokropkiem przestaje
            identyfikować, więc w skrajnym wypadku ma się zawinąć, nie zniknąć. */}
        <AppText
          variant="mono"
          tone="green"
          style={[styles.aircraft, (aircraft?.length ?? 0) > 8 && styles.signature]}
        >
          {aircraft ?? '-'}
        </AppText>
        {subtitle != null && (
          // Druga linia niesie kody ICAO, a te wg `CLAUDE.md` należą do JetBrains Mono
          // - nie do Archivo. Mockup `.route-line`: mono 11 px / ls 1.
          <AppText variant="mono" tone="muted" style={styles.subtitle}>
            {subtitle}
          </AppText>
        )}
      </View>

      <View style={styles.right}>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: { flexShrink: 1, gap: 2 },
  aircraft: { letterSpacing: 1.5 },
  signature: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  subtitle: { fontSize: 11, lineHeight: 15, letterSpacing: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
});
