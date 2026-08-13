/**
 * UZ Aero — GroupLabel (`.group-lbl` z mockupów 12 i 01)
 *
 * Mikro-etykieta mono w wersalikach nad grupą kart: „Możesz jeszcze poprawić",
 * „Zamknięte", „Log dnia". Nie jest nagłówkiem karty (ten mieszka w `Card`) ani
 * tytułem ekranu — opisuje sąsiadującą LISTĘ, nie pojedynczy pojemnik.
 *
 * Osobny komponent od issue #42: obie listy kafelków sesji stoją pod taką etykietą,
 * a kopia w każdym ekranie z osobna była dokładnie tym drobnym dryfem (raz `micro`,
 * raz własny rozmiar), który każe potem zgadywać, czy różnica coś znaczy.
 */

import React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';

import { AppText } from '../foundation/AppText';

export interface GroupLabelProps {
  text: string;
  style?: TextStyle;
}

export function GroupLabel({ text, style }: GroupLabelProps) {
  return (
    <AppText variant="micro" tone="muted" style={[styles.label, style]}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  /** `.group-lbl`: etykieta stoi tuż nad kartami, wcięta o szerokość ich obrysu. */
  label: { paddingHorizontal: 2 },
});
