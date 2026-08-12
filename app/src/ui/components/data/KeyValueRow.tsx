/**
 * UZ Aero — KeyValueRow (`.diag-row` z 13-ustawienia, `.row` karty „Dane dnia" z 11a)
 *
 * Wiersz „klucz — wartość": etykieta po lewej, wartość mono dociągnięta do prawej,
 * wyrównanie po linii bazowej. Jeden komponent zamiast wierszy kopiowanych po
 * ekranach (wcześniej lokalne `DiagRow` w SettingsScreen i `LocalRow` w SyncScreen).
 *
 * Dwa kroje etykiety — bo dokładnie tyle mają mockupy, nie więcej:
 *  - `micro` (`.diag-key`/`.diag-val`, 13): etykieta-mikro w wersalikach, wartość
 *    11 px; klucz nie kurczy się nigdy (mockup: `flex-shrink:0`), kurczy się wartość.
 *  - `mono` (`.row`/`.row-val`, 11a): obie strony mono 10 px bez wersalików; tu
 *    kurczy się etykieta, bo wartość jest odczytem, który musi zostać w całości.
 *
 * `divider` = linia pod wierszem + pionowy oddech 7 px (`.diag-row`); wiersze z 11a
 * idą bez niego — odstępy rozdaje rodzic (gap). Kolor wartości przez `valueTone`
 * (statusy diagnostyki: green/red), domyślnie secondary jak `.row-val`.
 *
 * `value: null` = wartość jeszcze się CZYTA i w jej miejscu stoi plamka (issue #33).
 * To nie to samo, co brak danych: brak mówi się wprost napisem („—", „brak danych —
 * wpisz z licznika"), bo jest odpowiedzią, a nie oczekiwaniem. Wiersz, który do czasu
 * odczytu w ogóle nie istnieje, przepycha resztę sekcji w chwili, gdy dane dojdą —
 * i to jest dokładnie ten skok, którego wzorzec ma nie dopuszczać.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText, type AppTextTone } from '../foundation/AppText';
import { Skeleton } from '../foundation/Skeleton';

export interface KeyValueRowProps {
  label: string;
  /** `null` = jeszcze czytamy; wiersz rysuje plamkę zamiast wartości. */
  value: string | null;
  /** Szerokość plamki — tyle, ile zwykle zajmuje wartość tego wiersza. */
  pendingWidth?: number;
  /** Krój etykiety: 'micro' (9 px, wersaliki — 13) / 'mono' (10 px — 11a).
   *  Rozmiar wartości idzie w parze: 11 px przy `micro`, 10 px przy `mono`. */
  labelVariant?: 'micro' | 'mono';
  /** Ton wartości (np. green/red dla statusu diagnostyki); domyślnie secondary. */
  valueTone?: AppTextTone;
  /** Linia pod wierszem + paddingVertical 7 (`.diag-row`). */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function KeyValueRow({
  label,
  value,
  pendingWidth = 96,
  labelVariant = 'micro',
  valueTone = 'secondary',
  divider = false,
  style,
}: KeyValueRowProps) {
  const { theme } = useTheme();
  const micro = labelVariant === 'micro';

  return (
    <View
      style={[
        styles.row,
        divider && {
          paddingVertical: 7,
          borderBottomWidth: theme.borderWidth,
          borderBottomColor: theme.colors.border,
        },
        style,
      ]}
    >
      {micro ? (
        <AppText variant="micro" tone="muted">
          {label}
        </AppText>
      ) : (
        <AppText variant="mono" tone="muted" style={styles.monoLabel}>
          {label}
        </AppText>
      )}
      {value == null ? (
        // Wysokość plamki = wysokość wartości, którą zastąpi: 11 px przy `micro`,
        // 10 px przy `mono`. Wiersz ma się nie drgnąć, gdy odczyt dojdzie.
        <Skeleton width={pendingWidth} height={micro ? 11 : 10} />
      ) : (
        <AppText variant="mono" tone={valueTone} style={micro ? styles.microValue : styles.monoValue}>
          {value}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  // `.diag-val` — wartość do prawej; przy ciasnocie kurczy się ona, nie klucz.
  microValue: { fontSize: 11, textAlign: 'right', flexShrink: 1 },
  // `.row` (11a) — 10 px po obu stronach; kurczy się etykieta, odczyt zostaje cały.
  monoLabel: { fontSize: 10, flexShrink: 1 },
  monoValue: { fontSize: 10, textAlign: 'right' },
});
