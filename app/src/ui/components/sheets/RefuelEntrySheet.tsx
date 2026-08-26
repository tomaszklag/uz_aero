/**
 * UZ Aero — arkusz dolewki wpisu ręcznego (sekcja „Paliwo · Dolewki" na kroku 4,
 * mockup 15C).
 *
 * Pilot podaje CZAS, „ile dolano" i „stan po dolaniu" — stan przed liczy się z tej
 * pary (`beforeL = afterL − addedL`), bo trójka `RefuelPayload` musi się domykać
 * z definicji; trzecie ręczne pole byłoby zaproszeniem do trójki, która się nie
 * sumuje. Wiersz „Stan przed" pokazujemy wyliczony, żeby pilot mógł go porównać
 * z kartką.
 *
 * Dolewka wpisu ręcznego może być tylko PRZED uruchomieniem albo PO wyłączeniu
 * silnika (dolewa się przy zatrzymanym śmigle) — ale tego NIE pilnuje ten arkusz:
 * granice zna krok 4 i mówi o nich blokadą przy „ZAPISZ LOT"
 * (`manualFlightStepBlocker`), z godziną konkretnej dolewki.
 */

import React, { useEffect, useState } from 'react';

import { litres, parseLitres, timeUtc } from '../../format';
import { Field } from '../input/Field';
import { Stepper } from '../input/Stepper';
import { TimeStepper } from '../input/TimeStepper';
import { IconAction } from '../data/IconAction';
import { Sheet } from './Sheet';

export interface RefuelEntryValue {
  at: number;
  addedL: number;
  afterL: number;
}

export interface RefuelEntrySheetProps {
  visible: boolean;
  /** „DOLEWKA 1", „DODAJ DOLEWKĘ". */
  title: string;
  value: RefuelEntryValue;
  min?: number;
  max?: number;
  onDelete?: () => void;
  onConfirm: (value: RefuelEntryValue) => void;
  onCancel: () => void;
}

/** Umowa wpisu litrów z klawiatury — wspólna dla obu pól. */
const LITRES_EDIT = {
  toText: (v: number) => (v > 0 ? String(Math.round(v)) : ''),
  parse: parseLitres,
  keyboardType: 'number-pad' as const,
  maxLength: 3,
};

export function RefuelEntrySheet({
  visible,
  title,
  value,
  min,
  max,
  onDelete,
  onConfirm,
  onCancel,
}: RefuelEntrySheetProps) {
  const [at, setAt] = useState(value.at);
  const [addedL, setAddedL] = useState(value.addedL);
  const [afterL, setAfterL] = useState(value.afterL);

  useEffect(() => {
    if (visible) {
      setAt(value.at);
      setAddedL(value.addedL);
      setAfterL(value.afterL);
    }
    // `value` poza zależnościami — patrz `FlightTimesSheet`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const beforeL = afterL - addedL;
  const complete = addedL > 0 && afterL >= addedL;

  return (
    <Sheet
      visible={visible}
      title={title}
      rows={[{ label: 'Stan przed (wyliczony)', value: complete ? litres(beforeL) : '—' }]}
      confirmLabel={complete ? 'ZAPISZ' : undefined}
      onConfirm={complete ? () => onConfirm({ at, addedL, afterL }) : undefined}
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
      <TimeStepper
        label="Czas dolewki (UTC)"
        value={at}
        onChange={setAt}
        format={timeUtc}
        originalTime={value.at}
        origin="wpisu"
        {...(min != null ? { min } : {})}
        {...(max != null ? { max } : {})}
      />

      <Field label="Dolano (L)">
        <Stepper
          value={addedL}
          onChange={setAddedL}
          step={1}
          bigStep={10}
          stepLabel="1 L"
          bigStepLabel="10 L"
          min={0}
          tone="amber"
          format={(v) => (v > 0 ? String(Math.round(v)) : '—')}
          edit={{ ...LITRES_EDIT, label: 'Ilość dolana w litrach' }}
        />
      </Field>

      <Field label="Stan po dolaniu (L)">
        <Stepper
          value={afterL}
          onChange={setAfterL}
          step={1}
          bigStep={10}
          stepLabel="1 L"
          bigStepLabel="10 L"
          min={0}
          tone="amber"
          format={(v) => (v > 0 ? String(Math.round(v)) : '—')}
          edit={{ ...LITRES_EDIT, label: 'Stan paliwa po dolaniu w litrach' }}
        />
      </Field>
    </Sheet>
  );
}
