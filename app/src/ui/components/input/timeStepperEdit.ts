/**
 * UZ Aero - wpis GODZINY z klawiatury w `Stepper` (zgłoszenie z urządzenia, 2026-08-14).
 *
 * Steppery czasu stoją w trzech arkuszach (korekta odczytu, korekta zrzutu, dopisanie
 * wpisu) i wszystkie potrzebują tej samej umowy: maska stawiająca dwukropek, parser
 * wiążący godzinę z DNIEM poprawianego zdarzenia i klawiatura numeryczna. Napisana
 * osobno w każdym z nich rozjechałaby się przy pierwszej zmianie maski.
 *
 * ══ DLACZEGO DZIEŃ Z WARTOŚCI, A NIE Z „TERAZ" ══
 * Pilot wpisuje godzinę, nie datę - poprawia zdarzenie, które już się wydarzyło, więc
 * datę bierzemy z wartości sprzed edycji (`parseTimeUtcOnDay`). Godzina spod północy
 * wyląduje przez to na dniu zdarzenia; o tym, czy taka wartość jest dopuszczalna,
 * orzekają granice `min`/`max` steppera, a nie parser.
 */

import { maskTimeUtcInput, parseTimeUtcOnDay } from '../../format';
import type { StepperEdit } from './Stepper';

export function timeStepperEdit(
  reference: number,
  format: (t: number) => string,
  label = 'Czas zdarzenia (UTC)',
): StepperEdit {
  return {
    toText: format,
    mask: maskTimeUtcInput,
    parse: (text) => parseTimeUtcOnDay(text, reference),
    // Klawiatura numeryczna: dwukropek stawia maska, więc pilot wbija same cyfry.
    keyboardType: 'number-pad',
    // „HH:MM" - pięć znaków z dwukropkiem, który maska dokłada sama.
    maxLength: 5,
    label,
  };
}
