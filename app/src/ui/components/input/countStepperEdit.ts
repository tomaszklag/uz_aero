/**
 * UZ Aero — WPIS Z KLAWIATURY DLA LICZNIKA CAŁKOWITEGO (`Stepper`, uwaga z urządzenia
 * 2026-08-29: kręgi w locie ręcznym).
 *
 * Odpowiednik `timeStepperEdit` dla liczby sztuk. Osobny plik z tego samego powodu:
 * `edit` jest kontraktem między kontrolką a tym, co się w nią wpisuje, a każdy arkusz
 * składający go sobie sam kończył się pięcioma różnymi maskami tej samej rzeczy
 * (historia przy `TimeStepper`).
 *
 * ══ DLACZEGO KLAWIATURA, SKORO SĄ ± ══
 * Bo ± jest dobre dla poprawki o jeden, a nie dla wpisania dwunastu kręgów — dokładnie
 * ta sama reguła, przez którą godzinę da się WPISAĆ zamiast odklikiwać minutami.
 * Kontrolka i tak otworzy klawiaturę sama tylko nad pustą wartością
 * (`stepperOpensForTyping`), a licznik startuje od zera, nie od pustki.
 */

import type { StepperEdit } from './Stepper';

/**
 * @param label do czytnika ekranu — co właściwie się liczy („Touch and go").
 */
export function countStepperEdit(label: string): StepperEdit {
  return {
    toText: (value) => String(value),
    // Same cyfry: minus i kropka nie mają tu znaczenia, a wpuszczone psułyby parse.
    mask: (text) => text.replace(/\D/g, '').slice(0, 2),
    parse: (text) => {
      const digits = text.replace(/\D/g, '');
      if (digits.length === 0) return null;
      const n = Number(digits);
      return Number.isFinite(n) ? n : null;
    },
    keyboardType: 'number-pad',
    maxLength: 2,
    label,
  };
}
