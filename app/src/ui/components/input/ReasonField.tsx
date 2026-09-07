/**
 * UZ Aero - ReasonField: powód korekty (issue #43, arkusze `design/10e`–`10g`).
 *
 * Jedno pole, OPCJONALNE, w każdym arkuszu korekty. Wymagane byłoby tarciem w polu -
 * pilot poprawia literówkę w minucie, a nie pisze uzasadnienia do protokołu - ale gdy
 * powód jest, administrator patrzący na zmieniony odczyt paliwa nie musi dzwonić i pytać.
 * Trafia do historii zmian (`10i`) i na oś zdarzeń w panelu.
 *
 * Osobny komponent, a nie `TextField` z ręcznie przepisaną etykietą w trzech arkuszach:
 * napis „opcjonalnie" i przykład w podpowiedzi to jest właśnie ta rzecz, która rozjeżdża
 * się przy pierwszej zmianie, jeśli stoi w trzech miejscach.
 */

import React from 'react';

import { TextField } from './Field';

export interface ReasonFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  /** Przykład dopasowany do arkusza („GPS wykrył lądowanie za późno"). */
  placeholder?: string;
}

export function ReasonField({ value, onChangeText, placeholder }: ReasonFieldProps) {
  return (
    <TextField
      label="Powód"
      tag={{ label: 'opcjonalne' }}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder ?? 'np. GPS wykrył zdarzenie za późno'}
      // Jedna linia: to jest przypis do liczby, nie notatka do dnia (ta ma własne
      // miejsce na 02e). Wielolinijkowe pole zapraszałoby do pisania akapitu, którego
      // nikt potem nie przeczyta w wierszu historii.
      multiline={false}
      maxLength={200}
      returnKeyType="done"
    />
  );
}
