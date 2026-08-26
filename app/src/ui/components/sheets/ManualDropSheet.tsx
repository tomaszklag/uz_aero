/**
 * UZ Aero — arkusz zrzutu wpisu ręcznego (sekcja „Zrzuty" na kroku 3, mockup 15B).
 *
 * NIE jest to `DropSheet` z kokpitu i to nie jest duplikat: tamten arkusz potwierdza
 * zrzut, który dzieje się TERAZ (czas z zegara, wysokość z GPS, skład z załadunku),
 * ten opisuje zrzut z PRZESZŁOŚCI — czas i wysokość pilot przepisuje z kartki, więc
 * obie wielkości są tu POLAMI. Skład pozostaje opcjonalny (`null` = „niepodany",
 * nie zero) — dokładnie jak w 05E i jak w domenie.
 */

import React, { useEffect, useState } from 'react';

import type { JumperCounts } from '../../../domain';
import { timeUtc } from '../../format';
import { CounterRow } from '../input/CounterRow';
import { Stepper } from '../input/Stepper';
import { TimeStepper } from '../input/TimeStepper';
import { Field } from '../input/Field';
import { IconAction } from '../data/IconAction';
import { Sheet } from './Sheet';

/** Zrzut w edycji: czas + skład + wysokość (null = nieznana — uczciwiej niż zgadywana). */
export interface ManualDropValue {
  at: number;
  jumpers: JumperCounts | null;
  altitudeFt: number | null;
}

export interface ManualDropSheetProps {
  visible: boolean;
  /** „ZRZUT 1", „DODAJ ZRZUT". */
  title: string;
  value: ManualDropValue;
  min?: number;
  max?: number;
  onDelete?: () => void;
  onConfirm: (value: ManualDropValue) => void;
  onCancel: () => void;
}

const EMPTY: JumperCounts = { tandem: 0, aff: 0, solo: 0 };

/** Krok wysokości: setka stóp to podziałka, w której mówi się o wysokości zrzutu. */
const ALT_STEP_FT = 100;
const ALT_BIG_STEP_FT = 1000;

export function ManualDropSheet({
  visible,
  title,
  value,
  min,
  max,
  onDelete,
  onConfirm,
  onCancel,
}: ManualDropSheetProps) {
  const [at, setAt] = useState(value.at);
  const [jumpers, setJumpers] = useState<JumperCounts>(value.jumpers ?? EMPTY);
  const [altitudeFt, setAltitudeFt] = useState<number>(value.altitudeFt ?? 0);

  useEffect(() => {
    if (visible) {
      setAt(value.at);
      setJumpers(value.jumpers ?? EMPTY);
      setAltitudeFt(value.altitudeFt ?? 0);
    }
    // `value` poza zależnościami — patrz `FlightTimesSheet`: przeładowanie w trakcie
    // edycji cofałoby zmiany pilota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      title={title}
      confirmLabel="ZAPISZ"
      onConfirm={() =>
        onConfirm({
          at,
          // Suma 0 = „skład niepodany" (`null`), nie zero — ta sama normalizacja,
          // którą robi komenda zrzutu na żywo (`declaredJumpers`).
          jumpers: jumpers.tandem + jumpers.aff + jumpers.solo > 0 ? jumpers : null,
          // Zero stóp nie jest wysokością zrzutu — traktujemy jak „nie podano".
          altitudeFt: altitudeFt > 0 ? altitudeFt : null,
        })
      }
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
        label="Czas zrzutu (UTC)"
        value={at}
        onChange={setAt}
        format={timeUtc}
        originalTime={value.at}
        origin="wpisu"
        {...(min != null ? { min } : {})}
        {...(max != null ? { max } : {})}
      />

      <CounterRow
        label="Tandem"
        value={jumpers.tandem}
        onChange={(n) => setJumpers((j) => ({ ...j, tandem: n }))}
      />
      <CounterRow
        label="AFF"
        hint="z instruktorem"
        value={jumpers.aff}
        onChange={(n) => setJumpers((j) => ({ ...j, aff: n }))}
      />
      <CounterRow
        label="Solo"
        value={jumpers.solo}
        onChange={(n) => setJumpers((j) => ({ ...j, solo: n }))}
      />

      {/* Wysokość z kartki — 0 znaczy „nie podano" i tak wraca do wołającego. */}
      <Field label="Wysokość zrzutu (ft) — opcjonalnie">
        <Stepper
          value={altitudeFt}
          onChange={setAltitudeFt}
          step={ALT_STEP_FT}
          bigStep={ALT_BIG_STEP_FT}
          stepLabel="100 ft"
          bigStepLabel="1000 ft"
          min={0}
          format={(v) => (v > 0 ? String(v) : '—')}
          edit={{
            toText: (v) => (v > 0 ? String(v) : ''),
            parse: (text) => {
              const n = Number(text.replace(/\D/g, ''));
              return Number.isFinite(n) ? n : null;
            },
            keyboardType: 'number-pad',
            maxLength: 5,
            label: 'Wysokość zrzutu w stopach',
          }}
        />
      </Field>
    </Sheet>
  );
}
