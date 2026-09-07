/**
 * UZ Aero - fokus pola wpisu w arkuszu, Z klawiaturą (issue #58 pkt 7/8).
 *
 * Dlaczego drabinka prób i dlaczego rusza dopiero, gdy okno modala JEST pokazane
 * ORAZ pole JEST zamontowane - historia trzech tur zgłoszenia w docblockach
 * `keyboardFocus.ts`. Tu jest tylko zegar i RN: hook oddaje `inputRef` (callback
 * ref do zawieszenia na `TextInput`) i `onShow` do podania RAMIE arkusza
 * (`Sheet`/`SheetSurface` → `Modal.onShow`). KAŻDY arkusz z polem wpisu idzie tą
 * drogą - kolejna ręczna kopia `focus()` w `onShow` odtworzy któryś z błędów,
 * które ten hook właśnie zdejmuje.
 *
 * Sprzątanie: zamknięcie arkusza odmontowuje dzieci modala, więc callback ref
 * dostaje `null` - to gasi bramkę (`shown` wraca na start) i kasuje wiszące
 * ponowienia, żeby nie celowały w pole, którego już nie ma.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, type TextInput } from 'react-native';

import { RETRY_DELAYS_MS, focusStep, shouldStartLadder } from './keyboardFocus';

export function useSheetInputFocus(): {
  inputRef: (input: TextInput | null) => void;
  onShow: () => void;
} {
  const input = useRef<TextInput | null>(null);
  const shown = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /*
   * KLAWIATURA ODWOŁUJE DRABINKĘ W CHWILI, W KTÓREJ WYJDZIE (uwaga z urządzenia,
   * 2026-08-29). Do tej pory ponowienia pytały o `Keyboard.isVisible()` dopiero
   * w swoim terminie - a między `focus()` a `keyboardDidShow` mija cała animacja
   * wysunięcia, więc rung wypadający w środku tej animacji widział jeszcze fałsz
   * i robił `blur()` + `focus()`: chował klawiaturę, którą sam przed chwilą wywołał.
   *
   * Sygnał zdarzeniowy jest tu właściwą odpowiedzią, bo pyta o TO SAMO co
   * `Keyboard.isVisible()`, tylko w momencie, w którym odpowiedź się zmienia,
   * zamiast w z góry wybranej chwili. Odstępy rungów są drugą połową tej poprawki:
   * stoją za `KEYBOARD_SHOW_MS`, żeby przy wolniejszym urządzeniu nie wyprzedziły
   * zdarzenia, które ma je skasować.
   */
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', clearTimers);
    return () => shown.remove();
  }, [clearTimers]);

  const attempt = useCallback((round: number) => {
    const field = input.current;
    if (field == null) return;
    const step = focusStep(round, Keyboard.isVisible());
    if (step === 'stop') return;
    if (step === 'refocus') field.blur();
    field.focus();
  }, []);

  /** Start drabinki - woła je PÓŹNIEJSZE z dwóch zdarzeń (patrz `shouldStartLadder`). */
  const startLadder = useCallback(() => {
    clearTimers();
    attempt(0);
    RETRY_DELAYS_MS.forEach((delay, i) => {
      timers.current.push(setTimeout(() => attempt(i + 1), delay));
    });
  }, [attempt, clearTimers]);

  const inputRef = useCallback(
    (field: TextInput | null) => {
      input.current = field;
      if (field == null) {
        // Zamknięcie arkusza: bramka wraca na start, wiszące ponowienia giną.
        shown.current = false;
        clearTimers();
        return;
      }
      if (shouldStartLadder(shown.current, true)) startLadder();
    },
    [clearTimers, startLadder],
  );

  const onShow = useCallback(() => {
    shown.current = true;
    if (shouldStartLadder(true, input.current != null)) startLadder();
  }, [startLadder]);

  return { inputRef, onShow };
}
