/**
 * UZ Aero — KONTROLKA CZASU ZDARZENIA (mockupy `design/10e`, `10f`, `10g`, `10h`).
 *
 * ══ JEDNA CZYNNOŚĆ, JEDEN KSZTAŁT ══
 * Ustawienie godziny zdarzenia zdarza się w czterech arkuszach — korekta czasu na osi,
 * korekta odczytu przy przejęciu, korekta zrzutu i dopisanie brakującego wpisu — i do
 * issue #43 każdy składał ją sobie sam. Efekt był dokładnie taki, jakiego można się
 * spodziewać po czterech kopiach (zgłoszenie z urządzenia, 2026-08-14): jeden arkusz
 * miał własną parę przycisków bez wpisu z klawiatury, drugi rząd ±10 min, którego nikt
 * nie potrzebował, a trzeci wypisywał na przyciskach „+60000", bo krok jest w
 * milisekundach i nikt nie nazwał go po ludzku.
 *
 * ══ CO KONTROLKA USTALA RAZ DLA WSZYSTKICH ══
 *  • **krok to MINUTA** i tylko ona — dalszy skok wpisuje się z klawiatury, a nie
 *    dziesiątkami tapnięć;
 *  • **godzinę da się WPISAĆ** (tapnięcie w wartość): maska stawia dwukropek,
 *    a dzień bierze się z poprawianego zdarzenia (`timeStepperEdit`);
 *  • **podpis mówi, o ile przesunięto** względem wartości pierwotnej (`timeShiftHint`).
 *
 * Arkusz podaje wyłącznie to, co go naprawdę różni: etykietę pola, granice i ton.
 */

import React from 'react';

import { Field } from './Field';
import { Stepper } from './Stepper';
import { timeShiftHint } from './timeShiftHint';
import { timeStepperEdit } from './timeStepperEdit';
import type { Tone } from '../tone';

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
   * Wartość sprzed edycji. Podana — pod kontrolką staje podpis „zmiana o +2 min".
   * Pominięta (dopisywany wpis) — nie ma względem czego mierzyć przesunięcia.
   */
  originalTime?: number;
  /** Skąd wzięła się wartość pierwotna („odczytu GPS", „wpisu") — do podpisu. */
  origin?: string;
  min?: number;
  max?: number;
  tone?: Tone;
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
  tone = 'amber',
  footer,
}: TimeStepperProps) {
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
        hint={originalTime == null ? undefined : timeShiftHint(value, originalTime, format, origin)}
        tone={tone}
      />
      {footer}
    </Field>
  );
}
