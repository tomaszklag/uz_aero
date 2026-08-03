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
 * **`adminCorrected` przychodzi z ZEWNĄTRZ tej funkcji** (zbiór uuid-ów korekt
 * zapisanych przez panel), bo ze strumienia zdarzeń nie da się go wyliczyć: korekta
 * administratora i korekta pilota z okna 24 h mają identyczny kształt, a różni je
 * kolumna serwera `events.source_device`, której `Event` nie zna i znać nie powinien
 * (`application/admin/ports.ts` → `EventsAdminPort.adminCorrectionUuids`).
 *
 * Czysta funkcja: testowana bez bazy, jak `sessionRow.ts`.
 */

import { applyCorrections, type Event } from '@uzaero/domain';

import type { AdminTimelineEntry } from '../contracts/sessions.ts';

/** Czas zdarzenia w tej samej konwencji, co domena: GPS przed zegarem telefonu. */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

export function eventTimeline(
  raw: Event[],
  /** Uuidy zdarzeń `event_correction` zapisanych PRZEZ PANEL; puste = same korekty pilota. */
  adminCorrectionUuids: ReadonlySet<string>,
): AdminTimelineEntry[] {
  const effective = new Map(applyCorrections(raw).map((e) => [e.uuid, e]));

  /**
   * Uuidy zdarzeń, które ruszyła korekta ADMINISTRATORA — niezależnie od tego, czy
   * ostatecznie wygrała. Wpis `event.correct` w dzienniku wskazuje na zdarzenie
   * POPRAWIANE (`targetId`), więc dziennik ma dla takiego celu treść nawet wtedy, gdy
   * późniejsza korekta odwróciła skutek. Pytamy o istnienie śladu, nie o wynik.
   */
  const adminCorrected = new Set<string>();
  for (const e of raw) {
    if (e.type === 'event_correction' && adminCorrectionUuids.has(e.uuid)) {
      adminCorrected.add(e.payload.targetUuid);
    }
  }

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
      return { event, voided: false, correctedTime: null, adminCorrected: false };
    }

    const byAdmin = adminCorrected.has(event.uuid);

    const after = effective.get(event.uuid);
    if (after == null) return { event, voided: true, correctedTime: null, adminCorrected: byAdmin };

    const corrected = at(after);
    return {
      event,
      voided: false,
      correctedTime: corrected === at(event) ? null : corrected,
      adminCorrected: byAdmin,
    };
  });
}
