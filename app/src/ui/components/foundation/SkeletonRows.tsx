/**
 * UZ Aero - SKELETON LISTY: n plamek w geometrii wierszy, które za chwilę przyjdą.
 *
 * Najczęstszy kształt czekania w tej aplikacji - karta dnia w historii (12), pozycja
 * floty na 02, wiersz diagnostyki w ustawieniach. Ekran podaje wysokość wiersza
 * i ich liczbę; liczba mówi o KSZTAŁCIE listy, nie o jej długości (tej nikt jeszcze
 * nie zna), więc podaje się tyle, ile mieści się bez przewijania.
 *
 * Tu mieszka komunikat dla czytnika ekranu: „Ładowanie" pada RAZ, na blok, bo pojedyncze
 * plamki są dla dostępności niewidzialne (`Skeleton`). Ekran, który składa własną
 * geometrię z gołych plamek, ma obowiązek zrobić to samo na swoim kontenerze.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Skeleton } from './Skeleton';

export interface SkeletonRowsProps {
  /** Ile wierszy - tyle, ile widać bez przewijania. */
  rows?: number;
  /** Wysokość jednego wiersza w pikselach docelowego komponentu. */
  height?: number;
  radius?: number;
  /** Odstęp między wierszami; domyślnie taki jak w listach kart. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonRows({
  rows = 3,
  height = 44,
  radius = 12,
  gap = 11,
  style,
}: SkeletonRowsProps) {
  return (
    <View accessible accessibilityLabel="Ładowanie" style={[styles.column, { gap }, style]}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius={radius} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flexDirection: 'column' },
});
