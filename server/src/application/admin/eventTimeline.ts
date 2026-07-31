/**
 * UZ Aero (serwer) — surowy strumień → oś zdarzeń karty dnia (`A02a`).
 *
 * Oś pokazuje rejestr TAKI, JAKI JEST: append-only, ze zdarzeniami unieważnionymi
 * włącznie. Ukrycie ich byłoby najgorszą możliwą uprzejmością — to właśnie te wiersze
 * tłumaczą, dlaczego liczby dnia różnią się od tego, co zapisał telefon.
 *
 * **Adnotacje (`voided`, `correctedTime`) wyliczamy PORÓWNANIEM z wynikiem
 * `applyCorrections`, a nie własnym czytaniem korekt.** Reguła „gdy jedno zdarzenie ma
 * kilka korekt, wygrywa ostatnia" (razem z przypadkiem `void` → `retime`, który
 * przywraca zdarzenie do życia) mieszka w domenie i ma tam mieć JEDNĄ implementację.
 * Druga kopia w panelu rozjechałaby się przy pierwszej zmianie reguły — i to w miejscu,
 * które istnieje po to, żeby pokazywać prawdę o rejestrze.
 *
 * Czysta funkcja: testowana bez bazy, jak `sessionRow.ts`.
 */

import { applyCorrections, type Event } from '@uzaero/domain';

import type { AdminTimelineEntry } from './contracts/sessions.ts';

/** Czas zdarzenia w tej samej konwencji, co domena: GPS przed zegarem telefonu. */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

export function eventTimeline(raw: Event[]): AdminTimelineEntry[] {
  const effective = new Map(applyCorrections(raw).map((e) => [e.uuid, e]));

  // Porządek CHRONOLOGICZNY, tą samą regułą co `projectSession` (czas zdarzenia,
  // GPS przed zegarem telefonu, sort stabilny). Bez tego oś brała kolejność z bazy —
  // a ta sortuje po `received_at`, które dla CAŁEJ paczki jest identyczne, bo `now()`
  // w Postgresie zwraca czas rozpoczęcia transakcji. Rozstrzygał więc `uuid`, czyli
  // w produkcji przypadek. Dzień wysłany jednym rzutem po locie bez zasięgu — czyli
  // norma, nie wyjątek — wracał w kolejności losowej.
  const ordered = [...raw].sort((a, b) => at(a) - at(b));

  return ordered.map((event) => {
    // Same korekty zostają na osi jako zwykłe wpisy (A02a liczy je: „84 zdarzenia,
    // w tym 1 korekta”). `applyCorrections` ich nie zwraca, więc pytanie o ich
    // unieważnienie w ogóle nie ma sensu — poprawia się fakt, nie poprawkę.
    if (event.type === 'event_correction') {
      return { event, voided: false, correctedTime: null };
    }

    const after = effective.get(event.uuid);
    if (after == null) return { event, voided: true, correctedTime: null };

    const corrected = at(after);
    return { event, voided: false, correctedTime: corrected === at(event) ? null : corrected };
  });
}
