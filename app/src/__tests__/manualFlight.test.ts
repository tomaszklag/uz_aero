/**
 * UZ Aero — logika ekranu 15 „Lot ręczny" (wpis całej sesji po fakcie).
 *
 * Testy pilnują trzech rzeczy: kompletności (sesja bez któregokolwiek czasu albo
 * odczytu nie ma prawa powstać), kolejności czasów i źródła odczytu początkowego
 * (przekazanie z cache, a przy jego braku — uczciwa niewiedza zamiast liczby z sufitu).
 */

import {
  initialReadingFor,
  manualFlightBlocker,
  timesFromEntry,
} from '../ui/screens/logic/manualFlight';
import type { ReferenceAircraft } from '../domain';

const T0 = Date.UTC(2026, 7, 10, 9, 0, 0);
const min = (m: number): number => T0 + m * 60_000;

const TIMES = {
  engineStart: min(0),
  takeoff: min(6),
  landing: min(49),
  engineStop: min(54),
};
const READING = { fuelL: 98, mh: 1307.25 };

describe('timesFromEntry — arkusz oddaje pola opcjonalne, ekran 15 wymaga kompletu', () => {
  it('komplet czasów przechodzi w czasy sesji', () => {
    expect(
      timesFromEntry({ offBlock: min(0), takeoff: min(6), landing: min(49), onBlock: min(54) }),
    ).toEqual(TIMES);
  });

  it('brak któregokolwiek czasu = null — częściowy wpis to sprawa 08, nie 15', () => {
    expect(timesFromEntry({ offBlock: min(0), takeoff: min(6), landing: min(49) })).toBeNull();
    expect(timesFromEntry({})).toBeNull();
  });
});

describe('manualFlightBlocker — blokada z powodem przy przycisku', () => {
  it('komplet danych odblokowuje zapis', () => {
    expect(manualFlightBlocker('SP-AXA', TIMES, READING)).toBeNull();
  });

  it('brak samolotu, czasów albo odczytu — konkretny powód, nie ogólnik', () => {
    expect(manualFlightBlocker(null, TIMES, READING)).toContain('samolot');
    expect(manualFlightBlocker('SP-AXA', null, READING)).toContain('komplet czasów');
    expect(manualFlightBlocker('SP-AXA', TIMES, { fuelL: null, mh: 1307 })).toContain('odczyt');
    expect(manualFlightBlocker('SP-AXA', TIMES, { fuelL: 98, mh: null })).toContain('odczyt');
  });

  it('zła kolejność czasów jest zatrzymana PRZED zapisem', () => {
    expect(
      manualFlightBlocker('SP-AXA', { ...TIMES, landing: min(5) }, READING),
    ).toContain('kolejności');
    expect(
      manualFlightBlocker('SP-AXA', { ...TIMES, engineStop: min(20) }, READING),
    ).toContain('kolejności');
  });

  it('start równy uruchomieniu i lądowanie równe zatrzymaniu są legalne', () => {
    // Pilot spisuje z papieru zaokrąglone minuty — zrównanie krawędzi to nie błąd.
    expect(
      manualFlightBlocker(
        'SP-AXA',
        { engineStart: min(0), takeoff: min(0), landing: min(54), engineStop: min(54) },
        READING,
      ),
    ).toBeNull();
  });
});

describe('initialReadingFor — początek łańcucha MH', () => {
  const aircraft = (handover: ReferenceAircraft['handover']): ReferenceAircraft => ({
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
    handover,
    consumption: null,
    fetchedAt: T0,
  });

  it('bierze ostatnie przekazanie z cache referencyjnego', () => {
    const withHandover = aircraft({
      reading: { fuelL: 121, mh: 1306.35 },
      byPilotId: 'AKO',
      at: min(-600),
      trail: [],
    });

    expect(initialReadingFor(withHandover, READING)).toEqual({ fuelL: 121, mh: 1306.35 });
  });

  it('bez przekazania w cache: odczyt końcowy — uczciwa niewiedza zamiast liczby z sufitu', () => {
    expect(initialReadingFor(aircraft(null), READING)).toEqual(READING);
    expect(initialReadingFor(null, READING)).toEqual(READING);
  });
});
