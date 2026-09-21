/**
 * Ninerdeck - szkic rezerwacji (stan UI, nie domena).
 *
 * Dwa kroki (22 → 22A) budują JEDNO żądanie `POST /bookings`. Dopóki pilot nie tapnie
 * „ZAREZERWUJ", nie ma niczego - ani na serwerze, ani w rejestrze - więc szkic żyje
 * w pamięci UI, jak szkic preflightu.
 *
 * ══ TO NIE JEST ZDARZENIE I NIE MA GO W REJESTRZE ══
 * Rezerwacja opisuje ZAMIAR i jest przedmiotem konkurencji dwóch pilotów, więc
 * rozstrzyga ją arbiter po drugiej stronie (§2.1). Rejestr opisuje FAKTY i ma jednego
 * piszącego - wstawienie tam szkicu zamieniłoby „chciałbym w niedzielę" w zapis lotu.
 *
 * ══ KROK 1 PYTA O TERMIN I MASZYNĘ, NIE O ZADANIE ══
 * Odwrotnie niż przejęcie - i to jest decyzja makiety 22. Rezerwacja rozstrzyga, KTO
 * zajmie maszynę w tych godzinach; rodzaj lotu, trasa i paliwo opisują lot i nikomu
 * niczego nie zabierają, więc idą w kroku 2. Preflight ma kolejność odwrotną, bo tam
 * maszyna jest już w ręce, a pytaniem jest „co dziś robimy".
 */

import { create } from 'zustand';

import type { OperationType } from '../../domain';
import { withRouteShape } from '../screens/logic/routeShape';

export interface BookingDraft {
  /** Klucz doby klubu (`RRRR-MM-DD`); `null` = jeszcze nie wybrano. */
  date: string | null;
  aircraftId: string | null;
  /** Granice terminu jako chwile bezwzględne; `null` = nie ustawiono. */
  startsAt: number | null;
  endsAt: number | null;
  /**
   * BEZ wartości podstawionej - wybór ma być świadomy (ta sama reguła, co we wpisie
   * ręcznym). Przejęcie może mieć domyślne „skoki", bo tam podpowiada je pamięć
   * ostatniego dnia; rezerwacja opisuje lot, którego jeszcze nie było.
   */
  operation: OperationType | null;
  departureIcao: string;
  arrivalIcao: string;
  dualId: string | null;
  /** Spodziewany czas w powietrzu (minuty) - PLAN, nie pomiar. */
  plannedAirMin: number | null;
  /** Paliwo do zabrania (L); `null` = pilot nie deklaruje. */
  plannedFuelL: number | null;
  notes: string | null;
}

interface BookingDraftStore extends BookingDraft {
  /** Otwarcie formularza z podstawionym terminem i maszyną (tapnięcie w wolne pasmo). */
  start(seed: { date?: string | null; aircraftId?: string | null; startsAt?: number | null; endsAt?: number | null }): void;
  set<K extends keyof BookingDraft>(key: K, value: BookingDraft[K]): void;
  reset(): void;
}

function initial(): BookingDraft {
  return {
    date: null,
    aircraftId: null,
    startsAt: null,
    endsAt: null,
    operation: null,
    departureIcao: '',
    arrivalIcao: '',
    dualId: null,
    plannedAirMin: null,
    plannedFuelL: null,
    notes: null,
  };
}

export const useBookingDraft = create<BookingDraftStore>((set) => ({
  ...initial(),

  start(seed) {
    // Formularz zaczyna się ZAWSZE od pustego szkicu plus tego, co podała nawigacja.
    // Porzucony formularz wracający z wyborami sprzed godziny czyta się jak podpowiedź
    // (ta sama reguła, co przy rezygnacji z preflightu - issue #55).
    set({
      ...initial(),
      ...(seed.date != null ? { date: seed.date } : {}),
      ...(seed.aircraftId != null ? { aircraftId: seed.aircraftId } : {}),
      ...(seed.startsAt != null ? { startsAt: seed.startsAt } : {}),
      ...(seed.endsAt != null ? { endsAt: seed.endsAt } : {}),
    });
  },

  set(key, value) {
    set((state) => withRouteShape({ ...state, [key]: value }));
  },

  reset() {
    set(initial());
  },
}));

/**
 * Czy szkic niesie cokolwiek, co pilot straci przy wyjściu.
 *
 * Liczone z KLUCZY pustego szkicu, a nie ręczną koniunkcją - nowe pole wchodzi do
 * rachunku samo. Ręczna lista przestałaby być prawdziwa przy pierwszym dopisanym polu
 * i nikt by tego nie zauważył (issue #62, ten sam błąd złapany przy wpisie ręcznym).
 *
 * TERMIN I MASZYNA PODSTAWIONE PRZEZ NAWIGACJĘ NIE LICZĄ SIĘ jako wpis pilota: tapnięcie
 * w wolne pasmo kalendarza wypełnia je samo, a arkusz rezygnacji pytałby wtedy o zgodę
 * na porzucenie czegoś, czego pilot nie napisał.
 */
export function bookingDraftDirty(draft: BookingDraft, seeded: readonly (keyof BookingDraft)[]): boolean {
  const empty = initial();
  return (Object.keys(empty) as (keyof BookingDraft)[])
    .filter((key) => !seeded.includes(key))
    .some((key) => draft[key] !== empty[key]);
}
