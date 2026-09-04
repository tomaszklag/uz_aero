/**
 * UZ Aero - CO Z MIĘKKICH FLAG TRAFIA NA EKRAN PILOTA (issue #84).
 *
 * Zgłoszenie z urządzenia: „system […] daje ostrzeżenie «Zegar telefonu rozjeżdża się
 * z GPS o 121 s - czasy liczymy z GPS» - nie bardzo wiem, co z tym mogę zrobić. Krzyczy
 * na mnie to ostrzeżenie, ale nie mogę zareagować. Czemu tak się wyświetla i co to
 * znaczy?"
 *
 * ══ DLACZEGO TA FLAGA SCHODZI Z EKRANU ══
 * Bo mówi prawdę, na którą pilot nie ma odpowiedzi. `CLOCK_DRIFT` porównuje zegar
 * telefonu z czasem z satelitów i zapala się, gdy rozjazd przekracza próg. Czasy
 * zdarzeń i tak liczą się Z GPS (`gpsTime ?? deviceTime`), więc zapis jest POPRAWNY -
 * flaga jest wyłącznie sygnałem diagnostycznym dla rejestru i dla panelu.
 * `CLAUDE.md` po issue #72: na ekranie zostaje to, co niesie BLOKADĘ z powodem albo
 * INSTRUKCJĘ do wykonania. „Zegar ci się rozjeżdża" nie jest ani jednym, ani drugim -
 * a bursztynowy baner nad kokpitem uczy pomijać miejsce, w którym pojawiają się
 * ostrzeżenia, na które reagować TRZEBA.
 *
 * ══ CZEGO TA FUNKCJA NIE ROBI ══
 * Nie rusza domeny ani rejestru. Reguła zostaje na swoim miejscu (§4.5), zdarzenie
 * dalej niesie oba stemple, a serwer liczy flagę `clock_drift` przy ingeście własnym
 * kodem (`server/src/domain/clockDrift.ts`) - administrator widzi ją w panelu tak samo
 * jak dotąd. Zmienia się WYŁĄCZNIE to, komu ją pokazujemy.
 *
 * Lista jest jawna i zamknięta z rozmysłem: domyślną odpowiedzią zostaje „pokaż".
 * Filtr, który sam decyduje, co jest „mało ważne", po cichu zjadłby ostrzeżenie
 * wprowadzone za pół roku - a §6 pkt 3 nie zna cichego błędu.
 */

import type { RuleViolation } from '../../../domain';

/**
 * Miękkie flagi, które są sygnałem DLA REJESTRU, nie dla pilota: opisują stan
 * urządzenia albo zapisu, którego pilot nie może naprawić przy samolocie.
 */
const DIAGNOSTIC: ReadonlySet<string> = new Set(['CLOCK_DRIFT']);

/**
 * Ostrzeżenia, które wolno pokazać pilotowi.
 *
 * Zwraca tę samą tablicę, gdy nie ma czego odsiewać - to najczęstszy przypadek, a nowa
 * tablica przy każdym renderze kokpitu budziłaby porównania referencji bez powodu.
 */
export function pilotWarnings(all: readonly RuleViolation[]): readonly RuleViolation[] {
  return all.some((w) => DIAGNOSTIC.has(w.code))
    ? all.filter((w) => !DIAGNOSTIC.has(w.code))
    : all;
}
