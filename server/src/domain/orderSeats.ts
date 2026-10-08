/**
 * Ninerdeck (serwer) - FOTELE ZLECENIA: dozwolone układy, komplet załogi i skutek
 * przestawienia fotela (4.0.0, issue #245; `docs/zlecenia.md` §4.1, §5, §5.2).
 *
 * Fotel dowódcy: ja / szukany. Fotel drugiego pilota: ja / szukany / brak. Czysta funkcja
 * nie wie, co maszyna wymaga - wymóg załogi 2-os. przychodzi argumentem, bo to własność
 * MASZYNY, a nie zlecenia (i baza go nie zna: `order_seats` pilnuje tylko kształtu).
 */

import {
  SEATS,
  soughtSeats,
  type OrderCrew,
  type OrderRefusal,
  type OrderSeats,
  type OrderStatus,
  type Seat,
} from './orders.ts';

/**
 * Układ foteli - odmowa albo `null`.
 *
 * Kolejność sprawdzeń jest kolejnością POWAGI: najpierw „to w ogóle nie jest zlecenie",
 * potem wymóg maszyny. „Ja" w obu fotelach nie ma osobnej reguły: przy dwóch fotelach
 * znaczy dokładnie „żaden nie szuka" (baza trzyma oba warunki w `order_seats`).
 */
export function refuseSeats(seats: OrderSeats, aircraft: { dualRequired: boolean }): OrderRefusal | null {
  if (soughtSeats(seats).length === 0) return 'no_seat_sought';
  if (seats.dual === 'none' && aircraft.dualRequired) return 'dual_required';
  return null;
}

/**
 * Czy zlecenie ma KOMPLET załogi: każdy szukany fotel ma osobę. Fotel „ja" siedzi zawsze
 * (zlecający), a „brak" nie jest szukany - więc pytanie dotyczy wyłącznie szukanych.
 */
export function crewComplete(seats: OrderSeats, crew: OrderCrew): boolean {
  return soughtSeats(seats).every((seat) => crew[seat] != null);
}

/** Szukane fotele, w których jeszcze nikt nie siedzi. */
export function openSeats(seats: OrderSeats, crew: OrderCrew): Seat[] {
  return soughtSeats(seats).filter((seat) => crew[seat] == null);
}

/**
 * Stan żywego zlecenia wynikający z załogi: komplet = `filled`, inaczej `open`.
 * Stanów końcowych nie rusza - odwołane i wygasłe nie wracają przez przydział.
 */
export function statusFor(current: OrderStatus, seats: OrderSeats, crew: OrderCrew): OrderStatus {
  if (current === 'cancelled' || current === 'expired') return current;
  return crewComplete(seats, crew) ? 'filled' : 'open';
}

/** Kto traci fotel przy przestawieniu układu foteli (§5.2: dostaje „Przydział cofnięty"). */
export interface SeatLoss {
  seat: Seat;
  pilotId: string;
}

/**
 * Załoga PO zmianie układu foteli (edycja zlecenia, §5.2).
 *
 * - fotel przestawiony na „ja" dostaje zlecającego; ktoś, kto w nim siedział, go traci;
 * - fotel przestawiony na „brak" zostaje pusty; osoba w nim siedząca go traci;
 * - fotel przestawiony z „ja" na szukany zostaje pusty - zlecający z niego wstaje, a fotel
 *   wraca do szukania wśród adresatów.
 *
 * Zlecający nigdy nie „traci fotela" w sensie wiadomości: sam przestawia układ, więc
 * wiadomość o tym byłaby wiadomością do samego siebie (reguła „sprawca nie budzi sam
 * siebie").
 */
export function crewForSeats(
  before: { seats: OrderSeats; crew: OrderCrew },
  after: OrderSeats,
  authorId: string,
): { crew: OrderCrew; lost: SeatLoss[] } {
  const crew: OrderCrew = { ...before.crew };
  const lost: SeatLoss[] = [];
  for (const seat of SEATS) {
    const was = before.seats[seat];
    const now = after[seat];
    if (was === now) continue;
    const sitting = before.crew[seat];
    if (sitting != null && sitting !== authorId) lost.push({ seat, pilotId: sitting });
    crew[seat] = now === 'self' ? authorId : null;
  }
  return { crew, lost };
}
