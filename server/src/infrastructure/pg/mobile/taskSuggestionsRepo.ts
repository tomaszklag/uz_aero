/**
 * UZ Aero (serwer) - adapter podpowiedzi do zadania dnia (`TaskSuggestionsPort`).
 *
 * Czyta WYŁĄCZNIE kolumny projekcji `sessions` (`client`, `notes`, `operation`) -
 * rejestru `events` nie dotyka ani jednym zapytaniem. To ta sama reguła, co przy
 * listach panelu: agreguj wartości projekcji, nigdy nie odtwarzaj projekcji SQL-em.
 *
 * ══ SKĄD BIERZE SIĘ „NAJNOWSZE" ══
 * Znacznik dnia niesie `claim_time`, czyli chwilę PRZEJĘCIA samolotu (decyzja 2026-08-07).
 * Po tej migracji ma go każda sesja, bo `session_claim` jest pierwszym zdarzeniem
 * każdej z nich (§4.4) - `COALESCE` na `updated_at` zostaje jako zabezpieczenie dla
 * rejestru niekompletnego (import, awaria), a nie jako gałąź obsługująca normalny dzień,
 * którym była do 2026-08-07 (kolumna niosła wtedy opcjonalny meldunek).
 * Sięgnięcie po `events.received_at` dałoby to samo dokładniej i kosztem złączenia
 * z rejestrem przy każdym otwarciu preflightu - cena nieproporcjonalna do różnicy.
 *
 * ══ DLACZEGO `DISTINCT ON` DLA KLIENTÓW, A `MAX` DLA NOTATEK ══
 * Obie listy są deduplikacją po wartości z porządkiem „najnowsze pierwsze", ale klient
 * niesie ze sobą RODZAJ OPERACJI z najnowszej swojej sesji - a `MAX(znacznik)` mówi
 * tylko, KIEDY to było, nie CZYM. `DISTINCT ON` wybiera cały wiersz zwycięzcy jednym
 * przejściem; grupowanie wymagałoby drugiego złączenia po tej samej tabeli.
 * Notatka nie ma takiego towarzysza, więc zostaje przy prostszym `GROUP BY` + `MAX`.
 */

import { isOperationType } from '@uzaero/domain';

import type { Queryable } from '../../../application/common/ports.ts';
import type {
  ClientSuggestion,
  TaskSuggestion,
  TaskSuggestionsPort,
} from '../../../application/mobile/ports.ts';

/**
 * Znacznik dnia sesji: przejęcie, a gdy go nie ma - stempel projekcji. Wyrażenie stoi
 * w stałej, bo powtarza się w `SELECT` i w `ORDER BY` (PostgreSQL nie pozwala użyć
 * aliasu w `ORDER BY` gałęzi `DISTINCT ON`), a dwie ręcznie zsynchronizowane kopie
 * porządku to dokładnie ten rodzaj rozjazdu, którego nie widać w wyniku.
 */
const LAST_USED = 'COALESCE(to_timestamp(s.claim_time / 1000.0), s.updated_at)';

interface SuggestionDbRow {
  value: string;
  last_used_at: Date | string;
}

interface ClientSuggestionDbRow extends SuggestionDbRow {
  operation: string | null;
}

export class PgTaskSuggestionsRepo implements TaskSuggestionsPort {
  async clients(db: Queryable, limit: number): Promise<ClientSuggestion[]> {
    const { rows } = await db.query<ClientSuggestionDbRow>(
      `SELECT value, operation, last_used_at
         FROM (
           SELECT DISTINCT ON (s.client)
                  s.client        AS value,
                  s.operation     AS operation,
                  ${LAST_USED}    AS last_used_at
             FROM sessions s
            WHERE s.client IS NOT NULL AND btrim(s.client) <> ''
            ORDER BY s.client, ${LAST_USED} DESC, s.session_uuid DESC
         ) newest
        ORDER BY last_used_at DESC, value ASC
        LIMIT $1`,
      [limit],
    );

    return rows.map((r) => {
      // Wartość spoza katalogu rzuca, a nie jest po cichu zerowana - ten sam argument,
      // co w `toSessionRow`: pilnuje jej `sessions_operation_known` w bazie, więc inna
      // wartość znaczy, że ktoś zdjął ograniczenie albo grzebał ręcznie.
      if (r.operation != null && !isOperationType(r.operation)) {
        throw new Error(`Nieznany rodzaj operacji w bazie: ${r.operation} (klient ${r.value})`);
      }
      return { value: r.value, operation: r.operation, lastUsedAt: new Date(r.last_used_at) };
    });
  }

  async notes(db: Queryable, picId: string, limit: number): Promise<TaskSuggestion[]> {
    const { rows } = await db.query<SuggestionDbRow>(
      `SELECT s.notes AS value, MAX(${LAST_USED}) AS last_used_at
         FROM sessions s
        WHERE s.pic_id = $1 AND s.notes IS NOT NULL AND btrim(s.notes) <> ''
        GROUP BY s.notes
        ORDER BY last_used_at DESC, s.notes ASC
        LIMIT $2`,
      [picId, limit],
    );

    // `pg` zwraca TIMESTAMPTZ jako Date, PGlite potrafi jako string - normalizujemy.
    return rows.map((r) => ({ value: r.value, lastUsedAt: new Date(r.last_used_at) }));
  }
}
