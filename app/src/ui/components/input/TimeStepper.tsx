/**
 * UZ Aero — KONTROLKA CZASU ZDARZENIA (mockupy `design/10e`, `10f`, `10g`, `10h`, `05f`).
 *
 * ══ JEDNA CZYNNOŚĆ, JEDEN KSZTAŁT ══
 * Ustawienie godziny zdarza się w pięciu arkuszach — korekta czasu na osi, korekta
 * odczytu przy przejęciu, korekta zrzutu, dopisanie brakującego wpisu i wpis ręczny
 * z kokpitu — i do issue #43 każdy składał ją sobie sam. Efekt po pięciu kopiach był
 * dokładnie taki, jakiego można się spodziewać (zgłoszenia z urządzenia, 2026-08-14):
 * jedna nie pozwalała wpisać godziny, druga miała zbędny rząd ±10 min, trzecia pisała
 * na przycisku „+60000", a KAŻDA miała inny kolor ramki — bursztyn, błękit, zieleń —
 * choć wszystkie robiły to samo.
 *
 * ══ CO KONTROLKA USTALA RAZ DLA WSZYSTKICH ══
 *  • **jeden wygląd** — ton NEUTRALNY, bez parametru. Kolor akcentu niósł tu informację
 *    o niczym: ton arkusza, nie stan wartości. Ta sama czynność ma wyglądać tak samo;
 *  • **krok to MINUTA** i tylko ona — dalszy skok wpisuje się z klawiatury, a nie
 *    odklikuje dziesiątkami tapnięć;
 *  • **godzinę da się WPISAĆ** (tapnięcie w wartość): maska stawia dwukropek, a dzień
 *    bierze się z poprawianego zdarzenia (`timeStepperEdit`);
 *  • **podpis pojawia się TYLKO przy zmianie** (`timeShiftHint`), a miejsce na niego
 *    jest zarezerwowane — zdanie wskakuje bez przesuwania reszty arkusza.
 *
 * Arkusz podaje wyłącznie to, co go naprawdę różni: etykietę pola, granice i stopkę.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Field } from './Field';
import { Stepper } from './Stepper';
import { timeShiftHint } from './timeShiftHint';
import { timeStepperEdit } from './timeStepperEdit';

/** Krok kontrolki: jedna minuta w milisekundach. */
const MINUTE = 60_000;

export interface TimeStepperProps {
  /** Etykieta pola — „Czas zdarzenia (UTC)", „Czas zrzutu (UTC)". */
  label?: string;
  value: number;
  onChange: (next: number) => void;
  /** Jak wypisać godzinę (zwykle `timeUtc`) — ta sama funkcja zasila pole wpisu. */
  format: (t: number) => string;
  /**
   * Wartość sprzed edycji. Podana — pod kontrolką pojawia się podpis „zmiana o +2 min",
   * ale dopiero PO zmianie. Pominięta (dopisywany wpis) — nie ma względem czego mierzyć.
   */
  originalTime?: number;
  /** Skąd wzięła się wartość pierwotna („odczytu GPS", „wpisu") — do podpisu. */
  origin?: string;
  min?: number;
  max?: number;
  /**
   * Dopisek POD kontrolką — czas lokalny, „3 min temu". Rzeczy, które mówią coś o TEJ
   * godzinie, a nie o przesunięciu; arkusz kokpitu (05f) potrzebuje obu naraz.
   */
  footer?: React.ReactNode;
}

export function TimeStepper({
  label = 'Czas zdarzenia (UTC)',
  value,
  onChange,
  format,
  originalTime,
  origin,
  min,
  max,
  footer,
}: TimeStepperProps) {
  const { theme } = useTheme();
  const shift = originalTime == null ? null : timeShiftHint(value, originalTime, format, origin);

  return (
    <Field label={label}>
      <Stepper
        value={value}
        onChange={onChange}
        step={MINUTE}
        /* Bez tej nazwy przycisk pisał „+60000" — czas trzymamy w milisekundach. */
        stepLabel="1 min"
        min={min}
        max={max}
        format={format}
        edit={timeStepperEdit(value, format, label)}
        tone="neutral"
      />

      {/*
        Miejsce na podpis jest ZAREZERWOWANE, choć podpis bywa pusty: bez tego pierwsze
        tapnięcie w ±1 min przesuwało wszystko poniżej o jedną linijkę, a przy zerowaniu
        zmiany wszystko wracało (uwaga z urządzenia). Arkusz ma stać w miejscu.
      */}
      {originalTime != null && (
        <View style={styles.shift}>
          {shift != null && (
            <AppText variant="mono" tone="amber" style={styles.shiftText}>
              {shift}
            </AppText>
          )}
        </View>
      )}

      {footer}
    </Field>
  );
}

const styles = StyleSheet.create({
  // Wysokość JEDNEJ linii podpisu — tyle, ile zajmuje `shiftText`.
  shift: { minHeight: 13, justifyContent: 'center' },
  shiftText: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
});
