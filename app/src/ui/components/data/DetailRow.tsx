/**
 * Ninerdeck - DetailRow (`.kv` z makiet 23, 26, 28, 32): wiersz danych karty.
 *
 * Etykieta w STAŁEJ kolumnie 96 px po lewej, wartość obok i do lewej, a pod nią
 * rozwinięcie skrótu („Cessna 172 · C172" pod znakiem, nazwa lotniska pod kodem ICAO).
 * Kolumna etykiet trzyma wartości jednej karty w jednej linii pionowej - oko czyta je
 * w dół jak formularz, a nie skacze od krawędzi do krawędzi.
 *
 * Czym różni się od `KeyValueRow`: tamten dociąga wartość do PRAWEJ i jest odczytem
 * przyrządu (diagnostyka, liczniki). Ten opisuje rzecz słowami - zadanie, opis, osobę -
 * a zdanie wyrównane do prawej czyta się źle, gdy zawija się w dwie linie.
 *
 * `mono` = wartość maszynowa (znak, kod ICAO, godziny) - krój cyfr, jak `.kv-v .mono`.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';

export interface DetailRowProps {
  label: string;
  value: string;
  /** Rozwinięcie wartości - druga linia pod nią. */
  sub?: string | null;
  /** Wartość maszynowa (znak, kod, godziny) - krój cyfr. */
  mono?: boolean;
  /** Linia pod wierszem - każdy wiersz karty poza ostatnim (`.kv:last-child`). */
  divider?: boolean;
}

export function DetailRow({ label, value, sub = null, mono = false, divider = false }: DetailRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={[s.row, divider && s.divider]}>
      <AppText variant="mono" style={s.label}>
        {label}
      </AppText>
      <View style={s.body}>
        <AppText variant={mono ? 'mono' : 'body'} style={mono ? s.valueMono : s.value}>
          {value}
        </AppText>
        {sub != null && sub !== '' && (
          <AppText variant="mono" style={s.sub}>
            {sub}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, paddingVertical: 11, paddingHorizontal: 13 },
    divider: { borderBottomWidth: t.borderWidth, borderBottomColor: t.colors.border },
    label: {
      width: 96,
      paddingTop: 2,
      fontSize: 8.5,
      lineHeight: 12,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: t.colors.textMuted,
    },
    body: { flex: 1, minWidth: 0, gap: 2 },
    value: { fontSize: 13, lineHeight: 18, color: t.colors.textPrimary },
    valueMono: { fontSize: 12.5, lineHeight: 18, letterSpacing: 1, color: t.colors.textPrimary },
    sub: { fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.colors.textMuted },
  });
