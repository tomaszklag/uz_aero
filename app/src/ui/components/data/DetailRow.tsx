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
 *
 * ══ WIERSZ, KTÓRY PROWADZI W GŁĄB (`a.kv` z 23F i 26) ══
 * Szewron stoi za wartością i W SPOCZYNKU - na dotyku nie ma kursora, więc kształt musi
 * być widoczny od razu (inaczej niż `.go` w panelu). Cel to cały wiersz, nie strzałka.
 * Przy tym samym ekranie szewron mają WYŁĄCZNIE wiersze, które gdzieś prowadzą - inaczej
 * oko uczy się pomijać prawą krawędź karty.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface DetailRowProps {
  label: string;
  value: string;
  /** Rozwinięcie wartości - druga linia pod nią. */
  sub?: string | null;
  /**
   * Rozwinięcie w TEJ SAMEJ linii, po separatorze („SP-AXA · C172", „Jakub Wrona · JWR" -
   * `.cell-sub` z 26): przy wartości krótkiej, którą rozwinięcie tylko podpisuje.
   */
  subInline?: boolean;
  /** Wartość maszynowa (znak, kod, godziny) - krój cyfr. */
  mono?: boolean;
  /** Linia pod wierszem - każdy wiersz karty poza ostatnim (`.kv:last-child`). */
  divider?: boolean;
  /** Wiersz prowadzący w głąb: rozmowa (23F), podgląd samolotu i pilota (26). */
  onPress?: () => void;
  /** Etykieta dostępności celu („Podgląd pilota Jakub Wrona"); domyślnie para etykieta - wartość. */
  pressLabel?: string;
}

export function DetailRow({
  label,
  value,
  sub = null,
  subInline = false,
  mono = false,
  divider = false,
  onPress,
  pressLabel,
}: DetailRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const hasSub = sub != null && sub !== '';
  const valueStyle = mono ? s.valueMono : s.value;

  const content = (
    <>
      <AppText variant="mono" style={s.label}>
        {label}
      </AppText>
      <View style={s.body}>
        <AppText variant={mono ? 'mono' : 'body'} style={valueStyle}>
          {value}
          {hasSub && subInline && (
            <AppText variant="mono" style={s.subInline}>
              {` · ${sub}`}
            </AppText>
          )}
        </AppText>
        {hasSub && !subInline && (
          <AppText variant="mono" style={s.sub}>
            {sub}
          </AppText>
        )}
      </View>
    </>
  );

  if (onPress == null) return <View style={[s.row, divider && s.divider]}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={pressLabel ?? `${label}: ${value}`}
      style={({ pressed }) => [s.row, divider && s.divider, pressed && s.pressed]}
    >
      {content}
      <Icon name="more" size={14} color={theme.colors.textMuted} style={s.chevron} />
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, paddingVertical: 11, paddingHorizontal: 13 },
    divider: { borderBottomWidth: t.borderWidth, borderBottomColor: t.colors.border },
    // `a.kv:hover` z makiety - na dotyku jest nim chwila wciśnięcia.
    pressed: { backgroundColor: t.colors.surfaceRaised },
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
    // Krój i stopień `.cell-sub`; wysokość linii zostaje po wartości, w której stoi.
    subInline: { fontSize: 9, letterSpacing: 0.5, color: t.colors.textMuted },
    chevron: { alignSelf: 'center' },
  });
