/**
 * UZ Aero - Caption (`.takeover-hint`, `.actions-reason`, `.start-engine-hint`)
 *
 * Wyśrodkowany podpis pod kontrolką: mono 9 px, WERSALIKI, ton przygaszony.
 *
 * Mockupy używają go wszędzie tam, gdzie przycisk albo siatka wymaga jednego zdania
 * wyjaśnienia - „co się stanie po kliknięciu" albo „dlaczego jest zablokowane".
 * Bez tego wzorca każdy ekran wpisywałby własny `fontSize`/`letterSpacing` i po
 * kilku ekranach ten sam podpis miałby trzy różne rozmiary.
 *
 * Czym różni się od `InlineNote`: tam jest kolorowe pudełko z ikoną, przypis do
 * sąsiadującej WARTOŚCI. Tu nie ma tła ani ikony - to podpis do AKCJI, ma być
 * czytelny i nie podnosić własnej rangi ponad przycisk, pod którym stoi.
 */

import React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';

import { AppText, type AppTextTone } from '../foundation/AppText';

export interface CaptionProps {
  text: string;
  /** Domyślnie `muted`; `amber` dla powodu blokady. */
  tone?: AppTextTone;
  style?: TextStyle;
}

export function Caption({ text, tone = 'muted', style }: CaptionProps) {
  return (
    <AppText variant="mono" tone={tone} style={[styles.caption, style]}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  // `line-height: 1.6` z mockupu - podpis bywa dwuwierszowy i ciasny interlinia
  // zlewałaby go w blok.
  caption: { fontSize: 9, lineHeight: 15, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
});
