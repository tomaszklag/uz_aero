/**
 * Ninerdeck - panel: SŁOWNIK KLUBU → funkcje podpisujące zlecenie (moduł Zlecenia, 4.0.0).
 *
 * Zlecenie niesie identyfikatory (maszyna, zlecający, załoga), a nazwiska i znaki panel
 * bierze ze słownika klubu (`GET /admin/api/directory`) - tego samego, z którego podpisuje
 * kalendarz. Słownik dostaje KAŻDY członek, więc lista zleceń działa także u pilota
 * z pustym zakresem.
 *
 * Moduł czysty, z testem obok: brak wpisu w słowniku to kreska, nigdy surowy identyfikator.
 */

import type { DirectoryDto } from '../../api/dto';
import { personLookup } from '../calendar/directoryLookups';
import type { PersonLookup } from '../calendar/bookingLabels';

export interface OrderAircraft {
  reg: string;
  type: string;
}

export interface OrderLookups {
  person: PersonLookup;
  aircraft: (aircraftId: string) => OrderAircraft | null;
  /** Pełne nazwiska członków - po nich etykieta adresowania odróżnia osobę od grupy. */
  memberNames: ReadonlySet<string>;
}

export function orderLookups(directory: DirectoryDto | undefined): OrderLookups {
  const aircraft = new Map((directory?.aircraft ?? []).map((a) => [a.id, { reg: a.reg, type: a.type }]));
  return {
    person: personLookup(directory),
    aircraft: (aircraftId) => aircraft.get(aircraftId) ?? null,
    memberNames: new Set((directory?.members ?? []).map((m) => m.name)),
  };
}
