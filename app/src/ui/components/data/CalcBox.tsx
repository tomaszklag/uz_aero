/**
 * UZ Aero - CalcBox (`.calc-box` z mockupu 06)
 *
 * Tonowane pudełko z rozpisanym RACHUNKIEM: kilka wierszy „skąd to wiemy", linia,
 * wyróżniony wiersz wyniku i przypis mówiący, co z tym wynikiem zrobić.
 *
 * Dlaczego osobny komponent, a nie `StatGrid`: siatka bilansowa odpowiada na
 * pytanie „co zapiszę" (klucz nad wartością, komórki równorzędne).
 * Tutaj wiersze są **przesłankami**, a nie danymi do zapisu - jeden z nich jest
 * wnioskiem i musi się wyróżniać, a całość niesie zastrzeżenie („punkt kontrolny,
 * zweryfikuj z dokumentacją"). Wartości z CalcBox-a nie trafiają wprost do rejestru:
 * to szacunek pomocniczy, obliczony z odczytów, a nie zmierzony.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface CalcRow {
  label: string;
  value: string;
}

export interface CalcBoxProps {
  /** Nagłówek rachunku, np. „Kalkulacja zużycia". */
  title: string;
  /** Przesłanki - po jednej w wierszu. */
  rows: CalcRow[];
  /** Wniosek: po linii, wartość wyróżniona akcentem. */
  total?: CalcRow | null;
  /** Przypis pod rachunkiem - co pilot ma z tym zrobić. */
  note?: string | null;
  tone?: Tone;
  style?: ViewStyle;
}

export function CalcBox({ title, rows, total, note, tone = 'amber', style }: CalcBoxProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      style={[
        {
          gap: 7,
          padding: 14,
          borderRadius: theme.radius.btn,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <AppText variant="mono" style={[styles.title, { color: c.accent }]}>
        {title}
      </AppText>

      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <AppText variant="body" tone="secondary" style={styles.rowLabel}>
            {row.label}
          </AppText>
          <AppText variant="mono" tone="secondary" style={styles.rowValue}>
            {row.value}
          </AppText>
        </View>
      ))}

      {total != null && (
        <>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.row}>
            <AppText variant="body" tone="secondary" style={styles.rowLabel}>
              {total.label}
            </AppText>
            <AppText
              variant="mono"
              style={{
                fontFamily: theme.fontFamily.monoBold,
                fontSize: 15,
                lineHeight: 20,
                letterSpacing: 0.5,
                color: c.accent,
              }}
            >
              {total.value}
            </AppText>
          </View>
        </>
      )}

      {note != null && (
        <AppText variant="body" tone="muted" style={styles.note}>
          {note}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 9, letterSpacing: 2, lineHeight: 13, textTransform: 'uppercase', opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  rowLabel: { flexShrink: 1, fontSize: 12, lineHeight: 17 },
  rowValue: { fontSize: 13, letterSpacing: 0.5, lineHeight: 18 },
  // Linia oddzielająca przesłanki od wniosku (`.calc-divider`) - cieńsza od obramowania
  // pudełka, bo dzieli treść wewnątrz, a nie odgradza od reszty ekranu.
  divider: { height: 1, marginVertical: 2, opacity: 0.4 },
  note: { fontSize: 10, lineHeight: 14 },
});
