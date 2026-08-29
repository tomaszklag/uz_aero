/**
 * UZ Aero (serwer) - strona ODCZYTU rejestru zdarzeń (`A04`).
 *
 * Scenariusz, dla którego ten ekran istnieje: liczby się nie zgadzają i trzeba
 * odpowiedzieć na pytanie „skąd się wzięła ta wartość", „co dokładnie przyszło
 * z telefonu" albo „czy to zdarzenie w ogóle dotarło". Wszystkie inne zapytania panelu
 * czytają PROJEKCJE - to jedno czyta surowy rejestr.
 *
 * Klasa jest cienka celowo. Porządek, filtrowanie i liczniki są własnością PORTU
 * (indeks i `ORDER BY`), złożenie wiersza - czystej funkcji. Tutaj zostają dokładnie
 * dwie rzeczy:
 *
 *  • nieczytelny kursor jest wariantem WYNIKU, a nie wyjątkiem (wzorzec
 *    `AdminSessionQueries.list`): kursor przychodzi z zewnątrz, więc jego uszkodzenie
 *    to 400, a nie 500;
 *  • **próg `CLOCK_DRIFT` wchodzi tu z domeny** (`CLOCK_DRIFT_MS`) i jedzie do SQL-a
 *    parametrem. Wpisany w zapytanie byłby drugą definicją tolerancji obok tej, którą
 *    liczy flagę przy ingescie - a wtedy kafel „rozjazd zegarów" i skrzynka flag
 *    mówiłyby o dwóch różnych progach pod jedną nazwą.
 */

import { CLOCK_DRIFT_MS } from '@uzaero/domain';

import type { Database } from '../../common/ports.ts';
import type { AdminEventsPage } from '../contracts/events.ts';
import { eventEntries } from '../mappers/eventEntry.ts';
import type { AdminEventsReadPort, EventListFilter } from '../ports.ts';

export type EventListOutcome =
  | { ok: true; page: AdminEventsPage }
  | { ok: false; reason: 'bad_cursor' };

export class AdminEventQueries {
  constructor(
    private readonly db: Database,
    private readonly events: AdminEventsReadPort,
  ) {}

  async list(filter: EventListFilter): Promise<EventListOutcome> {
    const result = await this.events.list(this.db, filter, CLOCK_DRIFT_MS);
    if (result == null) return { ok: false, reason: 'bad_cursor' };

    return {
      ok: true,
      page: {
        items: eventEntries(result.items, result.corrections),
        nextCursor: result.nextCursor,
        counts: result.counts,
      },
    };
  }
}
