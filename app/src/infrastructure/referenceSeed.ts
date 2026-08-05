/**
 * UZ Aero — dane referencyjne floty (dane PIERWSZEGO URUCHOMIENIA).
 *
 * Od M3 cache referencyjny wypełnia serwer (`GET /reference` przez
 * `application/sync/referenceSync.ts` — z ETagiem i bramą wieku). Seed pokrywa jedynie
 * okno między instalacją a pierwszym udanym kontaktem z serwerem (oraz pracę bez
 * backendu w dev/StyleGuide) — po pierwszym odświeżeniu każdy wiersz nadpisuje upsert
 * prawdą serwera.
 *
 * Dlaczego to jest w INFRASTRUKTURZE, a nie w domenie: to namiastka źródła zewnętrznego,
 * dokładnie jak adapter HTTP, który ją wypiera. Domena nie może zależeć od tego, że
 * akurat dziś flota bierze się z tablicy w kodzie.
 *
 * Seed jest **idempotentny** i NIE nadpisuje danych z serwera: wstawiamy go tylko wtedy,
 * gdy cache jest pusty. Inaczej po pierwszym syncu kasowalibyśmy prawdę serwera przy
 * każdym starcie aplikacji.
 *
 * Flota i konfiguracje pochodzą z `docs/design-notes.md` (sekcja „Placeholdery").
 */

import type { EventsRepo } from '../application/eventsRepo';
import type { ReferenceAircraft, ReferencePilot } from '../domain';

type SeedAircraft = Omit<ReferenceAircraft, 'fetchedAt'>;
type SeedPilot = Omit<ReferencePilot, 'fetchedAt'>;

/**
 * Przekazanie dla SP-AXA — scenariusz z mockupu 02a (paliwo 150 L, licznik 1234:30,
 * poprzednik i jego historia). Bez tego ekran odczytów pokazywałby wyłącznie wariant
 * „brak danych", więc nie dałoby się zobaczyć ani osi czasu, ani adnotacji świeżości.
 *
 * Liczby są spójne arytmetycznie (mockup ma je poglądowe): 140 L +45 = 185 L,
 * po locie 1 h 30 min zostaje 150 L (35 L → ok. 23 L/h), licznik 1233:00 → 1234:30.
 */
const HANDOVER_DAY = Date.UTC(2026, 5, 21); // 21 czerwca 2026
const at = (h: number, m: number): number => HANDOVER_DAY + (h * 60 + m) * 60_000;

/** Flota scenariusza — konfiguracje zgodne z §5.4 (pojemność, format MH, wymóg Duala). */
const AIRCRAFT: SeedAircraft[] = [
  {
    id: 'SP-AXA',
    reg: 'SP-AXA',
    type: 'Cessna 182',
    year: 2019,
    capacityL: 330,
    mhFormat: 'hhmm',
    dualRequired: false,
    serviceStatus: 'active',
    claimPicId: null,
    claimSince: null,
    handover: {
      reading: { fuelL: 150, mh: 1234.5 }, // 1234:30 w formacie hh:mm
      byPilotId: 'AKO',
      at: at(17, 30),
      trail: [
        {
          kind: 'refuel',
          at: at(9, 15),
          pilotId: null,
          fuelDeltaL: 45,
          fuelAfterL: 185,
          mhAfter: null,
          durationMs: null,
        },
        {
          kind: 'duty_start',
          at: at(7, 0),
          pilotId: 'AKO',
          fuelDeltaL: null,
          fuelAfterL: null,
          mhAfter: 1233,
          durationMs: null,
        },
        {
          kind: 'flight',
          at: at(16, 0),
          pilotId: 'AKO',
          fuelDeltaL: null,
          fuelAfterL: 150,
          mhAfter: 1234.5,
          durationMs: 90 * 60_000,
        },
      ],
    },
    // Norma zużycia przychodzi WYŁĄCZNIE z serwera (analityka `A10a`) — seed pierwszego
    // uruchomienia jej nie zmyśla. Do pierwszego synca ekrany po prostu nie pokazują
    // porównania z normą, zamiast pokazywać wymyśloną liczbę.
    consumption: null,
  },
  {
    // Zajęty przez innego pilota — scenariusz przejęcia (02) i podglądu read-only (04b).
    id: 'SP-FGK',
    reg: 'SP-FGK',
    type: 'Cessna 182',
    year: 2017,
    capacityL: 330,
    mhFormat: 'hhmm',
    dualRequired: false,
    serviceStatus: 'active',
    claimPicId: 'KRZ',
    claimSince: null,
    handover: null,
    consumption: null,
  },
  {
    // An-2 wymaga załogi dwuosobowej — blokuje przejście dalej bez Duala.
    id: 'SP-ANK',
    reg: 'SP-ANK',
    type: 'Antonov An-2',
    year: 1984,
    capacityL: 1700,
    mhFormat: 'hhmm',
    dualRequired: true,
    serviceStatus: 'active',
    claimPicId: null,
    claimSince: null,
    handover: null,
    consumption: null,
  },
  {
    // Wyłączony ze służby — widoczny, ale niedostępny do wyboru.
    id: 'SP-KWA',
    reg: 'SP-KWA',
    type: 'Cessna 172',
    year: 2021,
    capacityL: 200,
    mhFormat: 'decimal',
    dualRequired: false,
    serviceStatus: 'disabled',
    claimPicId: null,
    claimSince: null,
    handover: null,
    consumption: null,
  },
];

const PILOTS: SeedPilot[] = [
  { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz', active: true },
  { id: 'AKO', code: 'AKO', name: 'Anna Kowalska', active: true },
  { id: 'PWI', code: 'PWI', name: 'Piotr Wiśniewski', active: true },
  { id: 'JSE', code: 'JSE', name: 'Jan Serafin', active: true },
  { id: 'KRZ', code: 'KRZ', name: 'Krzysztof Zieliński', active: true },
];

/**
 * Wypełnia cache referencyjny, jeśli jest pusty.
 * Zwraca `true`, gdy dane zostały wstawione (przydatne w logach i testach).
 */
export async function seedReferenceIfEmpty(repo: EventsRepo): Promise<boolean> {
  const existing = await repo.getAircraft();
  if (existing.length > 0) return false;

  await repo.upsertReference({ aircraft: AIRCRAFT, pilots: PILOTS });
  return true;
}
