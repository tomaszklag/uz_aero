/**
 * UZ Aero — arkusz czasów wpisu ręcznego (mockup `design/15d-reczny-czas-arkusz.html`).
 *
 * Jedno wejście do KAŻDEJ godziny wpisu ręcznego: bieg silnika (para uruchomienie →
 * wyłączenie) i lot (para start → lądowanie). Kontrolką jest `TimeStepper` — ta sama,
 * co w korektach (10E) i kokpicie (05F): krok ±1 min, tapnięcie w wartość otwiera
 * klawiaturę numeryczną. `ManualEntrySheet` (komponent po skasowanym ekranie 08,
 * z krokiem 10 minut i bez wpisu z klawiatury) został skasowany razem z tą przebudową.
 *
 * Usunięcie lotu jest KOSZEM w linii tytułu (`Sheet.headerAction`), nie czerwonym
 * przyciskiem pod akcjami — intencją wchodzącego jest poprawka, nie kasowanie
 * (reguła z issue #43).
 */

import React, { useEffect, useState } from 'react';

import { duration, timeUtc } from '../../format';
import { IconAction } from '../data/IconAction';
import { TimeStepper } from '../input/TimeStepper';
import { Sheet } from './Sheet';

/** Jedno pole czasu arkusza — klucz wraca w `onConfirm` z nową wartością. */
export interface FlightTimesField {
  key: string;
  /** „Uruchomienie", „Start", „Lądowanie". */
  label: string;
  value: number;
}

export interface FlightTimesSheetProps {
  visible: boolean;
  /** „BIEG SILNIKA", „LOT 2", „DODAJ LOT". */
  title: string;
  /** Wiersz mono pod tytułem — „Lot 2 · 16 SIE · czasy UTC". */
  subtitle?: string;
  /** Jedno albo dwa pola; przy dwóch arkusz sam liczy wiersz czasu trwania. */
  fields: FlightTimesField[];
  /** Podpis wiersza trwania („Czas lotu", „Blok"). */
  durationLabel?: string;
  /** Granice doby wpisu — stepper nie wyjdzie poza dzień lotu. */
  min?: number;
  max?: number;
  /** Obecność włącza kosz w linii tytułu (usuwany lot); brak = pary nie da się usunąć. */
  onDelete?: () => void;
  onConfirm: (values: Record<string, number>) => void;
  onCancel: () => void;
}

export function FlightTimesSheet({
  visible,
  title,
  subtitle,
  fields,
  durationLabel = 'Czas trwania',
  min,
  max,
  onDelete,
  onConfirm,
  onCancel,
}: FlightTimesSheetProps) {
  const [values, setValues] = useState<Record<string, number>>({});

  // Każde otwarcie startuje od wartości pól — arkusz nie pamięta poprzedniej edycji.
  useEffect(() => {
    if (visible) {
      setValues(Object.fromEntries(fields.map((f) => [f.key, f.value])));
    }
    // `fields` świadomie poza zależnościami: rodzic odtwarza tablicę przy każdym
    // renderze, a przeładowanie wartości w trakcie edycji cofałoby zmiany pilota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resolved = fields.map((f) => ({ ...f, current: values[f.key] ?? f.value }));
  const pairDuration =
    resolved.length === 2 ? resolved[1]!.current - resolved[0]!.current : null;

  return (
    <Sheet
      visible={visible}
      title={title}
      rows={[
        ...(subtitle != null ? [{ label: subtitle, value: '' }] : []),
        ...(pairDuration != null
          ? [{ label: durationLabel, value: pairDuration > 0 ? duration(pairDuration) : '—' }]
          : []),
      ]}
      confirmLabel="ZAPISZ"
      onConfirm={() => onConfirm(values)}
      onCancel={onCancel}
      headerAction={
        onDelete != null ? (
          <IconAction
            name="trash"
            tone="red"
            accessibilityLabel={`Usuń — ${title}`}
            onPress={onDelete}
          />
        ) : undefined
      }
    >
      {resolved.map((f) => (
        <TimeStepper
          key={f.key}
          label={f.label}
          value={f.current}
          onChange={(next) => setValues((v) => ({ ...v, [f.key]: next }))}
          format={timeUtc}
          originalTime={f.value}
          origin="wpisu"
          {...(min != null ? { min } : {})}
          {...(max != null ? { max } : {})}
        />
      ))}
    </Sheet>
  );
}
