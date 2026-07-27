/**
 * UZ Aero — dane referencyjne floty (ZAŚLEPKA).
 *
 * ⚠️ TYMCZASOWE: docelowo cache referencyjny wypełnia serwer przez `GET /reference`
 * (§4.6, §4.8) i odświeża przy każdym kontakcie z siecią. Do czasu powstania backendu
 * wstawiamy tu flotę scenariusza, żeby preflight miał z czego wybierać.
 *
 * Dlaczego to jest w INFRASTRUKTURZE, a nie w domenie: to namiastka źródła zewnętrznego,
 * dokładnie jak adapter HTTP, który ją zastąpi. Domena nie może zależeć od tego, że
 * akurat dziś flota bierze się z tablicy w kodzie.
 *
 * Seed jest **idempotentny** i NIE nadpisuje świeższych danych z serwera: wstawiamy go
 * tylko wtedy, gdy cache jest pusty. Inaczej po pierwszym syncu kasowalibyśmy prawdę
 * serwera przy każdym starcie aplikacji.
 *
 * Flota i konfiguracje pochodzą z `docs/design-notes.md` (sekcja „Placeholdery").
 */

import type { EventsRepo } from '../application/eventsRepo';
import type { ReferenceAircraft, ReferencePilot } from '../domain';

type SeedAircraft = Omit<ReferenceAircraft, 'fetchedAt'>;
type SeedPilot = Omit<ReferencePilot, 'fetchedAt'>;

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
    handover: null,
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
