/**
 * UZ Aero (serwer) — porównanie wiersza projekcji z przeliczeniem ze strumienia.
 *
 * Czysta funkcja (wzorzec `application/sessionRow.ts`), bo to jest sedno przebudowy:
 * raport różnic musi dać się przetestować na dwóch wierszach, bez bazy i bez CLI.
 *
 * Porównujemy POLE PO POLU, a nie „czy wiersze są równe": administrator ma zobaczyć,
 * że rozjechał się `flights_count`, a nie że „coś się nie zgadza" (A11 pokazuje
 * dokładnie taką tabelę: sesja · pole · wartość w `sessions` · wartość z przeliczenia).
 */

import type { ProjectionFieldDiff } from '../contracts/maintenance.ts';
import type { SessionRow } from '../../common/ports.ts';

/**
 * Nazwy pól bierzemy z PRZELICZONEGO wiersza (`Object.keys`), a nie z listy zapisanej
 * na sztywno. Powód jest praktyczny: nowa kolumna projekcji (jak `operation` i `client`
 * przy liście dni) ma wejść do porównania sama, bez pamiętania o drugim miejscu — inaczej
 * pierwsza przebudowa po migracji zameldowałaby „zero różnic" właśnie dla tych pól,
 * dla których migracja się odbyła.
 */
export function projectionDiff(stored: SessionRow, computed: SessionRow): ProjectionFieldDiff[] {
  const out: ProjectionFieldDiff[] = [];

  for (const field of Object.keys(computed) as (keyof SessionRow)[]) {
    const a = stored[field];
    const b = computed[field];
    // Wartości projekcji są skalarne (napisy, liczby, null) — `Object.is` odróżnia
    // też `0` od `-0` i traktuje `NaN` jako równe sobie, co przy liczbach z bazy
    // jest zachowaniem, którego chcemy: `NaN` w kolumnie to osobna patologia,
    // a nie różnica do zaraportowania przy każdym przebiegu.
    if (!Object.is(a, b)) out.push({ field, stored: a, computed: b });
  }

  return out;
}
