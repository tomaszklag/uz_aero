/**
 * UZ Aero — panel: KATALOG RODZAJÓW OPERACJI (moduł CZYSTY).
 *
 * **Dlaczego `Record<OperationType, …>`, a nie tablica** — dokładnie ten sam powód,
 * co przy `flagTypes.ts`: panelowi wolno importować z `@uzaero/domain` wyłącznie TYPY
 * (§5.1), więc listy `OPERATION_TYPES` nie może wziąć wprost. Mapa indeksowana typem
 * domenowym rozwiązuje to bez wyjątku od reguły — dopisanie szóstej operacji w domenie
 * **wywala kompilację tego pliku**, bo `Record` wymaga kompletu kluczy. Lista przepisana
 * ręcznie jako tablica rozjechałaby się po cichu i filtr zgubiłby jedną operację.
 *
 * Kolejność kluczy jest kolejnością chipów w `A02-dni.html` (Skoki · Egzamin · Przelot ·
 * Techniczny · Inne) i stąd bierze ją `OPERATION_ORDER` — nie z domeny, bo tam
 * porządek katalogu odpowiada na inne pytanie niż porządek pasków filtrów.
 */

import type { OperationType } from '@uzaero/domain';

import type { PillTone } from '../../ui/components/Pill';

export interface OperationMeta {
  /** Napis na chipie filtra — zdanie po polsku, wielką literą. */
  label: string;
  /** Napis na plakietce w tabeli — wersaliki, jak w mockupie. */
  badge: string;
  /**
   * Ton plakietki. Niebieski niesie WYŁĄCZNIE operacja zarobkowa (skoki), bo tylko ona
   * ma stronę przychodową i tylko jej wiersz czyta się razem z kolumną klienta.
   * Reszta jest neutralna — kolor per operacja zamieniłby tabelę w tęczę, w której
   * nic już nie znaczy niczego.
   */
  tone: PillTone;
}

export const OPERATION_META: Record<OperationType, OperationMeta> = {
  skoki: { label: 'Skoki', badge: 'SKOKI', tone: 'blue' },
  egzamin: { label: 'Egzamin', badge: 'EGZAMIN', tone: 'dim' },
  // Klucz `ferry` zostaje — to identyfikator z rejestru i z kolumny `sessions.operation`.
  // Napis jest polski, bo pilot wybiera „Przelot" (issue #13), a administrator ogląda
  // te same dni: dwie nazwy tej samej operacji w jednym produkcie to zaproszenie do
  // pytania „czym się różni ferry od przelotu".
  ferry: { label: 'Przelot', badge: 'PRZELOT', tone: 'dim' },
  techniczny: { label: 'Techniczny', badge: 'TECHNICZNY', tone: 'dim' },
  inne: { label: 'Inne', badge: 'INNE', tone: 'dim' },
};

/** Kolejność chipów operacji w pasku filtrów — jak w `A02-dni.html`. */
export const OPERATION_ORDER = Object.keys(OPERATION_META) as OperationType[];

/** Strażnik wartości z ADRESU: `?operacja=lot-w-kosmos` ma dać brak filtra, nie awarię. */
export function isOperationType(value: string | null): value is OperationType {
  return value != null && Object.hasOwn(OPERATION_META, value);
}
