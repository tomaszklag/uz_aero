/**
 * UZ Aero — StatusChip
 *
 * Uogólniony „pill" z mockupów: kropka + etykieta mono UPPERCASE w danym tonie.
 * Obsługuje wszystkie chipy poza wskaźnikiem łączności (ten ma własny `SyncChip`,
 * bo jest jedynym globalnym wskaźnikiem sieci i nie wolno go mnożyć):
 *   GROUND · SILNIK WYŁĄCZONY · RUNNING · PIC: KRZ od 07:10 · dane z cache · auto GPS
 *
 * `pulse` zapala kropkę na stałe (stan żywy) — animację dokładamy dopiero tam, gdzie
 * naprawdę pomaga; w kokpicie migotanie rozprasza.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface StatusChipProps {
  label: string;
  tone?: Tone;
  /** Kropka-wskaźnik po lewej (domyślnie tak). */
  dot?: boolean;
  /** Wypełnienie tłem tonu (domyślnie tak); false = sam kontur. */
  filled?: boolean;
  /** Opis dla czytnika — domyślnie czytana jest sama etykieta. */
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function StatusChip({
  label,
  tone = 'neutral',
  dot = true,
  filled = true,
  accessibilityLabel,
  style,
}: StatusChipProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.chip,
        {
          // Kanon pilla z mockupów (`.sync-chip`, `.running-badge`): padding 3×9,
          // odstęp 5. Wcześniejsze paddingi z tokenów (xs/md) pochodziły z usuniętego
          // `.ground-chip` i rozjeżdżały wysokość SYNC i RUNNING w jednym wierszu.
          gap: 5,
          paddingHorizontal: 9,
          paddingVertical: 3,
          borderRadius: theme.radius.pill,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: filled ? c.muted : 'transparent',
        },
        style,
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
      {/* Chipy w mockupach (`.running-badge`, `.sync-chip`) to mono 9 px / WERSALIKI —
          wariant `label` (Archivo 13 px) psuł ten język. `lineHeight` podany jawnie,
          bo odziedziczona wysokość linii tokenu mono rozpychała pill w pionie. */}
      <AppText variant="mono" style={[styles.label, { color: c.accent }]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 9, lineHeight: 13, letterSpacing: 1.5, textTransform: 'uppercase' },
});
