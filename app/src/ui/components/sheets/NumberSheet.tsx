/**
 * Ninerdeck - ARKUSZ JEDNEJ LICZBY.
 *
 * Kontrolka `Stepper` w ramie arkusza i nic poza tym: tytuł, etykieta, przyciski ±,
 * wpis z klawiatury, wiersze odniesienia. Powstał dla planu rezerwacji (22A: czas lotu
 * i paliwo do zabrania), gdzie dwa osobne pliki różniłyby się WYŁĄCZNIE napisami -
 * a arkusz odczytu (`ReadingSheet`) nie pasuje, bo niesie ze sobą cały świat paliwa
 * i licznika: szlak przekazania, ostrzeżenia ciągłości, pojemność zbiorników.
 *
 * ══ JEDEN ARKUSZ, JEDNO PYTANIE ══
 * Czas lotu i paliwo otwierają się osobno (issue #62: „arkusz ma tyle kontrolek, ile
 * pytań"), choć stoją w jednym rzędzie formularza. Wspólny arkusz z dwiema kontrolkami
 * dawałby pilotowi kontrolkę, o którą nie prosił.
 *
 * ══ REZYGNACJA Z WARTOŚCI TO „×" W LINII TYTUŁU ══
 * Pole opcjonalne (paliwo do zabrania) trzeba dać się opróżnić, a „ZAPISZ" z pustą
 * kontrolką jest zablokowany. Krzyżyk stoi więc tam, gdzie w arkuszach korekty stoi
 * kosz: dostępny, nie eksponowany. Kosz zostaje przy ODEJMOWANIU z rejestru i dlatego
 * jest czerwony - tu nic nie znika, pilot tylko przestaje deklarować liczbę.
 */

import React, { useEffect, useState } from 'react';

import { Field } from '../input/Field';
import { IconAction } from '../data/IconAction';
import { Stepper, type StepperEdit } from '../input/Stepper';
import { Sheet, type SheetRow } from './Sheet';

export interface NumberSheetProps {
  visible: boolean;
  title: string;
  /** Etykieta nad kontrolką; pomiń, gdy powtarzałaby tytuł (issue #62). */
  label?: string;
  value: number | null;
  /** Wartość → napis (godziny jako „1:30", litry jako „120"). */
  format: (value: number) => string;
  /** Wpis z klawiatury - bez niego dalszy skok trzeba odklikać. */
  edit: StepperEdit;
  step: number;
  stepLabel: string;
  bigStep?: number;
  bigStepLabel?: string;
  min?: number;
  max?: number;
  unit?: string;
  placeholder?: string;
  /** Podpis pod kontrolką - do czego ta liczba służy. */
  hint?: string;
  rows?: SheetRow[];
  /** Pole OPCJONALNE - w linii tytułu staje „×", który je opróżnia i zamyka arkusz. */
  onClear?: () => void;
  onSave: (value: number) => void;
  onCancel: () => void;
}

export function NumberSheet({
  visible,
  title,
  label,
  value,
  format,
  edit,
  step,
  stepLabel,
  bigStep,
  bigStepLabel,
  min,
  max,
  unit,
  placeholder,
  hint,
  rows,
  onClear,
  onSave,
  onCancel,
}: NumberSheetProps) {
  const [draft, setDraft] = useState<number | null>(null);

  // Szkic bierze się ze stanu przy KAŻDYM otwarciu: arkusz zamknięty „ANULUJ" nie ma
  // prawa wrócić z liczbą z poprzedniego razu.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const control = (
    <Stepper
      value={draft}
      onChange={setDraft}
      format={format}
      edit={edit}
      step={step}
      stepLabel={stepLabel}
      {...(bigStep != null ? { bigStep } : {})}
      {...(bigStepLabel != null ? { bigStepLabel } : {})}
      {...(min != null ? { min } : {})}
      {...(max != null ? { max } : {})}
      {...(unit != null ? { unit } : {})}
      {...(placeholder != null ? { placeholder } : {})}
      {...(hint != null ? { hint } : {})}
    />
  );

  return (
    <Sheet
      visible={visible}
      title={title}
      {...(rows != null ? { rows } : {})}
      {...(onClear != null && value != null
        ? {
            headerAction: (
              <IconAction name="clear" accessibilityLabel="Wyczyść wartość" onPress={onClear} />
            ),
          }
        : {})}
      confirmLabel="ZAPISZ"
      // Pusta wartość blokuje BEZ zdania - widać ją z kontrolki nad przyciskiem
      // (wąski wyjątek reguły issue #55).
      confirmDisabled={draft == null}
      onConfirm={() => {
        if (draft != null) onSave(draft);
      }}
      onCancel={onCancel}
    >
      {label != null ? <Field label={label}>{control}</Field> : control}
    </Sheet>
  );
}
