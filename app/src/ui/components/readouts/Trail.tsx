/**
 * UZ Aero - Trail (`.trail` z mockupu 02a)
 *
 * Oś czasu pod wartością przekazania: kropka, tytuł, jedna linia szczegółów, pionowa
 * kreska łącząca kolejne ogniwa.
 *
 * Po co: pilot patrzy na paliwomierz i widzi mniej, niż mówi przekazanie. Bez historii
 * zostaje mu zgadywanie, czy pomylił się w odczycie, czy ktoś jeszcze poleciał.
 * Oś odpowiada na to jednym spojrzeniem - i dlatego jest częścią ekranu odczytów,
 * a nie osobnym „szczegółami" schowanym za tapnięciem.
 *
 * Komponent jest czysto prezentacyjny: dostaje gotowe napisy, bo wyliczenia (średnie
 * zużycie, różnice) należą do warstwy formatowania ekranu.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface TrailRow {
  id: string;
  title: string;
  /** Jedna linia szczegółów, np. „dolano +45 L · w zbiorniku 185 L". */
  meta: string;
  tone?: Tone;
}

export interface TrailProps {
  rows: TrailRow[];
  style?: ViewStyle;
}

export function Trail({ rows, style }: TrailProps) {
  const { theme } = useTheme();

  if (rows.length === 0) return null;

  return (
    <View
      style={[
        {
          borderTopWidth: theme.borderWidth,
          borderTopColor: theme.colors.border,
          paddingTop: 10,
          marginTop: 2,
        },
        style,
      ]}
    >
      {rows.map((row, index) => {
        const c = toneColors(theme, row.tone ?? 'neutral');
        const last = index === rows.length - 1;

        return (
          <View key={row.id} style={[styles.row, { paddingBottom: last ? 0 : 10 }]}>
            {/* Kreska łącząca - biegnie od kropki w dół, poza ostatnim ogniwem. */}
            {!last && (
              <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
            )}

            <View
              style={[
                styles.dot,
                {
                  borderWidth: theme.borderWidth,
                  borderColor: row.tone == null ? theme.colors.borderStrong : c.border,
                  backgroundColor: row.tone == null ? theme.colors.surfaceRaised : c.muted,
                },
              ]}
            />

            <View style={styles.body}>
              <AppText
                variant="body"
                style={{
                  fontSize: 11,
                  lineHeight: 15,
                  color: row.tone == null ? theme.colors.textSecondary : c.accent,
                }}
              >
                {row.title}
              </AppText>
              <AppText variant="mono" tone="muted" style={styles.meta}>
                {row.meta}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, position: 'relative' },
  line: { position: 'absolute', left: 7, top: 16, bottom: 0, width: 1 },
  dot: { width: 15, height: 15, borderRadius: 7.5, flexShrink: 0, marginTop: 1 },
  body: { flex: 1, gap: 2 },
  meta: { fontSize: 9, lineHeight: 13, letterSpacing: 0.5 },
});
