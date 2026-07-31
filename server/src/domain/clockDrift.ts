/**
 * UZ Aero (serwer) — flaga rozjazdu zegarów (§4.5 `clock_drift`).
 *
 * Każde zdarzenie niesie DWA zegary: `deviceTime` (telefon) i `gpsTime` (z fixa, `null`
 * gdy brak). Projekcja liczy czasy z GPS, gdy tylko jest — ale gdy telefon rozjeżdża
 * się z GPS, warto to zapisać, bo tłumaczy późniejsze dziwactwa w danych: zdarzenia
 * bez fixa (zapis ręczny, kołowanie w hangarze) dostają wtedy stempel z przestawionego
 * zegara i nic już tego nie prostuje.
 *
 * **Dlaczego to w ogóle powstało.** §4.5 obiecywała tę flagę od początku, ale do
 * 2026-07-31 istniała wyłącznie jako lokalne ostrzeżenie w telefonie (`checkClocks`
 * w `packages/domain/src/rules/sessionRules.ts`) — pilot widział komunikat, a serwer
 * nie wiedział o niczym, więc po fakcie nie dało się tego zobaczyć nigdzie. Decyzja
 * 2026-07-31: kod dogania dokumentację. Próg jest WSPÓLNY z telefonem
 * (`CLOCK_DRIFT_MS`), żeby obie strony mówiły to samo.
 *
 * Flaga jest JEDNA na sesję, nie jedna na zdarzenie: przestawiony zegar to własność
 * telefonu na czas dnia, a nie pojedynczego zapisu — dwadzieścia flag opisujących
 * ten sam przestawiony zegar nauczyłoby wyłącznie ignorowania skrzynki.
 */

import { CLOCK_DRIFT_MS, type Event, type FlagType } from '@uzaero/domain';

export interface DriftFlag {
  type: Extract<FlagType, 'clock_drift'>;
  sessionUuids: string[];
  details: Record<string, number | string>;
}

/**
 * Zwraca flagę, gdy NAJWIĘKSZY rozjazd w sesji przekracza próg. `null` = w porządku
 * albo nie ma czego porównać (żadne zdarzenie nie miało fixa).
 *
 * Raportujemy maksimum, nie średnią: średnia rozmyłaby jeden ostry rozjazd w serii
 * poprawnych odczytów, a to właśnie ten jeden tłumaczy błędny stempel.
 */
export function clockDriftFlag(
  sessionUuid: string,
  events: readonly Event[],
): DriftFlag | null {
  let worst: { drift: number; event: Event } | null = null;
  let compared = 0;

  for (const event of events) {
    if (event.gpsTime == null) continue;
    compared += 1;
    const drift = Math.abs(event.deviceTime - event.gpsTime);
    if (worst == null || drift > worst.drift) worst = { drift, event };
  }

  if (worst == null || worst.drift <= CLOCK_DRIFT_MS) return null;

  return {
    type: 'clock_drift',
    sessionUuids: [sessionUuid],
    details: {
      maxDriftMs: worst.drift,
      maxDriftSec: Math.round(worst.drift / 1000),
      thresholdMs: CLOCK_DRIFT_MS,
      // Który zapis był najgorszy — bez tego administrator ma flagę bez tropu.
      eventUuid: worst.event.uuid,
      eventType: worst.event.type,
      comparedEvents: compared,
    },
  };
}
