/**
 * Ninerdeck - WEJŚCIE W LOT Z REZERWACJI (#162 F8).
 *
 * „ROZPOCZNIJ LOT" na Pulpicie wypełnia kroki przejęcia tym, co pilot zaplanował -
 * maszyną, zadaniem, trasą i drugim pilotem. Nie ma osobnego przycisku przy karcie
 * rezerwacji: „ROZPOCZNIJ LOT" ma w tej aplikacji JEDNO miejsce i jeden wygląd przez
 * cały dzień (issue #42), a rezerwacja zmienia wyłącznie to, czym wypełni się krok 1.
 *
 * ══ REZERWACJA NIGDY NIE WARUNKUJE LOTU ══
 * (§2.3, decyzja właściciela). Brak rezerwacji, brak zasięgu, cudzy termin - żadne
 * z tego nie blokuje startu. Ten moduł odpowiada wyłącznie na pytanie „czym wypełnić
 * formularz", a odpowiedź `null` znaczy „niczym", nie „nie wolno".
 *
 * ══ WYPEŁNIAMY TYLKO TERMIN, KTÓRY DZIEJE SIĘ TERAZ ══
 * Rezerwacja na przyszły weekend jest planem, a nie opisem lotu, do którego pilot
 * właśnie siada - podstawiona wyglądałaby jak wpis (ta sama reguła, przez którą
 * tapnięcie w wolne pasmo kalendarza nie ustawia terminu). Okno sięga GODZINY przed
 * początkiem, bo tyle trwa dojazd, przegląd i tankowanie, i całego terminu do jego
 * końca: pilot spóźniony na własną rezerwację dalej lata z niej.
 */

import type { OperationType } from '../../../domain';

import type { CalendarBooking } from './calendarData';
import { operationTypeOf } from './operations';

/** Ile przed początkiem terminu rezerwacja zaczyna wypełniać formularz. */
export const CLAIM_LEAD_MS = 60 * 60_000;

export interface ClaimSeed {
  reservationId: string;
  aircraftId: string;
  /** `null` = rodzaj spoza tego wydania - krok 2 pyta o niego jak zwykle. */
  operation: OperationType | null;
  departureIcao: string;
  arrivalIcao: string;
  dualId: string | null;
  notes: string | null;
}

/** Czym wypełnić przejęcie; `null` = niczym (brak rezerwacji albo jest za wcześnie). */
export function claimSeed(booking: CalendarBooking | null, now: number): ClaimSeed | null {
  if (booking == null) return null;
  if (booking.kind !== 'flight') return null;
  if (now < booking.startsAt - CLAIM_LEAD_MS || now >= booking.endsAt) return null;

  return {
    reservationId: booking.id,
    aircraftId: booking.aircraftId,
    operation: operationTypeOf(booking.operation),
    departureIcao: booking.fromIcao ?? '',
    arrivalIcao: booking.toIcao ?? '',
    dualId: booking.dualId,
    notes: booking.note,
  };
}
