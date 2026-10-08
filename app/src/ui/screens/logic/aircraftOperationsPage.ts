/**
 * Ninerdeck - STRONY HISTORII OPERACJI SAMOLOTU na karcie 27 (`GET /aircraft/:id/operations`;
 * obserwowanie 3.2.0, `docs/obserwowanie-samolotu.md` §6; kanał klubu 4.0.0, KK-C #246).
 *
 * Historia idzie stronami (kursor parą, jak skrzynka): pierwsza przy wejściu, kolejne pod
 * „Pokaż starsze". Od kanału klubu dochodzi trzeci przypadek - ŚWIEŻA PIERWSZA STRONA po
 * sygnale `aircraft:<id>` (operacja zdana, wycofana, nowa) - i ona nie ma prawa zwinąć
 * listy, którą pilot właśnie doładował:
 *  - świeża strona zastępuje to, co obejmuje: nowe operacje wchodzą na górę, wycofane
 *    z niej znikają;
 *  - doładowany ogon ZA ostatnim wierszem świeżej strony zostaje razem ze swoim
 *    kursorem, więc „Pokaż starsze" ciągnie dalej od miejsca, w którym pilot skończył;
 *  - strona bez kursora to CAŁA historia, a strona bez punktu styku z doładowaną
 *    (ogrom nowych operacji naraz) - nowa lista od początku.
 */

import type { RemoteAircraftOperation, RemoteAircraftOperations } from '../../../application/ports';

export interface OperationsData {
  total: number;
  items: RemoteAircraftOperation[];
  /** Ile operacji zostało ZA tym, co już wczytano - wiersz „Pokaż starsze". */
  remaining: number;
  next: RemoteAircraftOperations['next'];
}

/** Kolejna strona doklejona za tym, co już wczytano. */
export function operationsPage(wire: RemoteAircraftOperations, before: RemoteAircraftOperation[]): OperationsData {
  return withItems(wire.total, [...before, ...wire.items], wire.next);
}

/** Świeża pierwsza strona wobec tego, co już wczytano - patrz nagłówek pliku. */
export function mergeFirstPage(
  fresh: RemoteAircraftOperations,
  loaded: OperationsData | null | undefined,
): OperationsData {
  const last = fresh.items[fresh.items.length - 1];
  if (loaded == null || fresh.next == null || last == null) return operationsPage(fresh, []);

  const seam = loaded.items.findIndex((item) => item.sessionUuid === last.sessionUuid);
  const tail = seam < 0 ? [] : loaded.items.slice(seam + 1);
  return withItems(fresh.total, [...fresh.items, ...tail], tail.length > 0 ? loaded.next : fresh.next);
}

function withItems(
  total: number,
  items: RemoteAircraftOperation[],
  next: RemoteAircraftOperations['next'],
): OperationsData {
  return { total, items, remaining: Math.max(0, total - items.length), next };
}
