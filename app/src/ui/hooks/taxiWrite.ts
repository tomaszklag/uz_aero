/**
 * UZ Aero — co zrobić z KOŁOWANIEM wykrytym przez automat (issue #30).
 *
 * Kołowanie jest jedyną detekcją zapisywaną NATYCHMIAST, bez okna „COFNIJ" (§1
 * `docs/algorytm-detekcji.md`): nie wyznacza żadnego czasu rozliczeniowego, więc pytanie
 * „czy na pewno?" byłoby samym szumem. Ta natychmiastowość ma jednak trzy zderzenia
 * z rejestrem i wszystkie trzy rozstrzyga ta tablica — dlatego stoi w osobnym module
 * z testem, a nie w `if`-ach spoiny.
 *
 * 1. **Para „landing → taxi" w oknie „COFNIJ"** (§7.4) — po lądowaniu automat emituje
 *    kołowanie na NASTĘPNYM fixie, ale zdarzenia `landing` jeszcze nie ma: leży
 *    w toaście z odliczaniem. Rejestr mówi więc „w powietrzu" i twardo odrzuca
 *    kołowanie (`ALREADY_IN_FLIGHT`). Tak powstawał czerwony baner „Nie zapisano —
 *    samolot jest w powietrzu" za zdarzenie, którego pilot nie wywołał (issue #30).
 *    Odpowiedź: **`hold`** — kołowanie czeka na rozstrzygnięcie okna. Wjedzie po
 *    lądowaniu, a jeśli pilot lądowanie cofnie, zniknie razem z nim: nie było
 *    lądowania, to i dobiegu nie było.
 * 2. **Odrodzony detektor** (powrót na ekran, restart aplikacji) emituje kołowanie,
 *    które w rejestrze już jest — **`skip`**, po cichu (decyzja 2026-08-04).
 * 3. **Rozjazd faz poza oknem** — rejestr mówi „w locie", automat „na ziemi".
 *    Prostuje to `syncDetectorPhase` przy następnym fixie, więc tutaj zostaje
 *    **`skip`**: zapis i tak odbiłby się o regułę.
 */

export type TaxiWrite = 'write' | 'hold' | 'skip';

export interface TaxiWriteInput {
  /**
   * Trwa okno „COFNIJ" albo zapis zdarzenia, które je zamknęło — czyli rejestr
   * z rozmysłem nie wie jeszcze o starcie/lądowaniu, które automat już widział.
   */
  settling: boolean;
  /** Rejestr: kołowanie już otwarte (zamknie je dopiero start albo wyłączenie silnika). */
  recordedTaxiing: boolean;
  /** Rejestr: samolot w powietrzu. */
  recordedInFlight: boolean;
}

/**
 * Kolejność warunków jest częścią odpowiedzi:
 *  • duplikat odsiewamy PRZED oknem — wstrzymanie tylko odroczyłoby to samo `skip`,
 *    a po starcie dopisałoby kołowanie już zamknięte;
 *  • okno rozpatrujemy PRZED stanem „w locie" — bo to właśnie ono jest powodem,
 *    dla którego rejestr wciąż mówi „w locie" (przypadek 1 w nagłówku).
 */
export function taxiWrite(input: TaxiWriteInput): TaxiWrite {
  if (input.recordedTaxiing) return 'skip';
  if (input.settling) return 'hold';
  if (input.recordedInFlight) return 'skip';
  return 'write';
}
