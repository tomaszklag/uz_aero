/**
 * UZ Aero (serwer) — zapytanie `GET /me/task-suggestions` (issue #14, ekran 02e).
 *
 * Preflight pyta o dwie rzeczy naraz, bo wypełnia się je w jednym miejscu i w jednej
 * chwili: czym pilot oznaczał klienta i co wpisywał w notatce dnia. Dwa endpointy
 * oznaczałyby dwa żądania na jedno wejście na ekran — a to jest ekran otwierany
 * w terenie, na łączu, które bywa jednym paskiem zasięgu.
 *
 * Podpowiedzi są WYGODĄ, nie regułą: pusta historia (nowy klub, pierwszy dzień
 * pilota) daje puste tablice i status 200. 404 mówiłoby „zasobu nie ma", a zasób
 * jest — po prostu historia jeszcze nic nie zawiera.
 */

import type { OperationType } from '@uzaero/domain';

import type { Database } from '../../common/ports.ts';
import type { TaskSuggestionsPort } from '../ports.ts';

/**
 * Twardy limit obu list. Podpowiedź ma skrócić wpisywanie, a nie zastąpić klawiaturę:
 * lista dłuższa niż ekran przestaje być podpowiedzią i staje się wyszukiwarką, której
 * ten ekran nie ma. Jedna liczba dla obu list, bo obie renderują się tym samym
 * komponentem — dwie różne byłyby różnicą bez powodu.
 */
export const TASK_SUGGESTION_LIMIT = 20;

/** Kształt „na drucie" — stemple jako ISO 8601 UTC, jak wszędzie w kontrakcie §4.6. */
export interface TaskSuggestionsView {
  clients: { value: string; operation: OperationType | null; lastUsedAt: string }[];
  notes: { value: string; lastUsedAt: string }[];
}

export class TaskSuggestionQueries {
  constructor(
    private readonly db: Database,
    private readonly suggestions: TaskSuggestionsPort,
  ) {}

  /**
   * `picId` pochodzi WYŁĄCZNIE z tokenu (trasa `/me/*`) — pilot nie ma jak zapytać
   * o cudze notatki, bo nie ma gdzie podać cudzej tożsamości.
   */
  async get(picId: string): Promise<TaskSuggestionsView> {
    const [clients, notes] = await Promise.all([
      this.suggestions.clients(this.db, TASK_SUGGESTION_LIMIT),
      this.suggestions.notes(this.db, picId, TASK_SUGGESTION_LIMIT),
    ]);

    return {
      clients: clients.map((c) => ({
        value: c.value,
        operation: c.operation,
        lastUsedAt: c.lastUsedAt.toISOString(),
      })),
      notes: notes.map((n) => ({ value: n.value, lastUsedAt: n.lastUsedAt.toISOString() })),
    };
  }
}
