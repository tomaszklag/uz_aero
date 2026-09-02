import { describe, expect, it } from 'vitest';

import type { SessionListItemDto } from '../../api/dto';
import { operationLabel, routeNote, sessionRow } from './sessionRows';

const DAY = Date.UTC(2026, 7, 12);
const at = (h: number, m: number): number => DAY + h * 3600_000 + m * 60_000;

const session: SessionListItemDto = {
  sessionUuid: 's-1',
  signature: 'SP-KLM/2026-08-12/TMK/1',
  aircraftId: 'a-1',
  reg: 'SP-KLM',
  aircraftType: 'Cessna 182',
  mhFormat: 'decimal',
  picId: 'p-1',
  picCode: 'TMK',
  picName: 'Tomasz Małkiewicz',
  dualCode: null,
  dualName: null,
  status: 'closed',
  operation: 'ferry',
  client: null,
  claimedAt: at(7, 50),
  closeTime: at(16, 45),
  engineStartAt: at(8, 42),
  engineStopAt: at(10, 22),
  firstTakeoffAt: at(9, 1),
  lastLandingAt: at(10, 14),
  departureIcao: 'EPKK',
  arrivalIcao: 'EPBA',
  blockMs: 100 * 60_000,
  flightMs: 73 * 60_000,
  flightsCount: 3,
  takeoffCount: 3,
  landingCount: 3,
  mhStart: 1284.6,
  mhEnd: 1286.1,
  fuelStartL: 112,
  fuelAddedL: 40,
  fuelEndL: 98,
  oilLevelL: 10.2,
  oilAddedL: 1,
  oilAfterL: 11.2,
  manualEntry: false,
  updatedAt: '2026-08-12T16:45:00.000Z',
};

describe('pary w jednej komórce', () => {
  it('bieg silnika niesie godziny, a druga linia mówi JAK DŁUGO', () => {
    const row = sessionRow(session);
    expect(row.engine).toEqual({ from: '08:42', to: '10:22', note: '1:40' });
  });

  it('lot niesie godziny, a druga linia mówi DOKĄD', () => {
    expect(sessionRow(session).flight).toEqual({ from: '09:01', to: '10:14', note: 'EPKK → EPBA' });
  });

  it('paliwo: para przed/po, a dolewka dopiero w drugiej linii', () => {
    expect(sessionRow(session).fuel).toEqual({ from: '112 L', to: '98 L', note: 'dolano 40 L' });
  });

  it('bez dolewki druga linia MILCZY - brak zdarzenia to nie brak danych', () => {
    // Skutek uboczny jest korzystny: dni z tankowaniem widać na pierwszy rzut oka.
    expect(sessionRow({ ...session, fuelAddedL: 0 }).fuel.note).toBeNull();
    expect(sessionRow({ ...session, fuelAddedL: null }).fuel.note).toBeNull();
  });
});

describe('brak odczytu zostaje brakiem', () => {
  it('kreska stoi PRZY strzałce, więc widać, którego odczytu brakuje', () => {
    const open = sessionRow({ ...session, fuelEndL: null, mhEnd: null });
    expect(open.fuel.from).toBe('112 L');
    expect(open.fuel.to).toBe('-');
    expect(open.moto.to).toBe('-');
  });

  it('operacja OTWARTA mówi „w toku", a nie kreską', () => {
    // To nie jest brak odczytu, tylko fakt, że jeszcze nie nastąpił.
    const open = sessionRow({ ...session, status: 'active', engineStopAt: null });
    expect(open.engine.to).toBe('w toku');
  });

  it('operacja BEZ LOTU nie dostaje trasy - opisywałaby lot, którego nie było', () => {
    const noFlight = sessionRow({
      ...session,
      firstTakeoffAt: null,
      lastLandingAt: null,
      flightsCount: 0,
    });
    expect(noFlight.flight.note).toBeNull();
    expect(noFlight.flight.from).toBe('-');
    expect(noFlight.flights).toBe('0');
  });
});

describe('olej', () => {
  it('NIE MA pary - po locie oleju się nie mierzy', () => {
    const row = sessionRow(session);
    expect(row.oil).toBe('11,2 L');
    expect(row.oilNote).toBe('10,2 L + 1,0 L');
  });

  it('stan do lotu bierzemy z SERWERA, nie dodajemy dwóch liczb', () => {
    // Dolewka bez pomiaru poziomu nie zna, więc domena oddaje wtedy brak. Gdyby panel
    // liczył `pomiar + dolewka`, pokazałby w tym wypadku liczbę wziętą znikąd.
    const blind = sessionRow({ ...session, oilLevelL: null, oilAfterL: null, oilAddedL: 1 });
    expect(blind.oil).toBe('-');
  });

  it('bez dolewki druga linia milczy', () => {
    expect(sessionRow({ ...session, oilAddedL: null }).oilNote).toBeNull();
  });
});

describe('trasa', () => {
  it('operacja na JEDNYM placu pokazuje lotnisko RAZ, bez strzałki', () => {
    // Druga kopia tego samego kodu nie odpowiada na żadne pytanie.
    expect(routeNote('EPKK', null)).toBe('EPKK');
    expect(routeNote('EPKK', 'EPKK')).toBe('EPKK');
  });

  it('bez żadnego lotniska nie ma czego napisać', () => {
    expect(routeNote(null, null)).toBeNull();
  });
});

describe('reszta wiersza', () => {
  it('rodzaj operacji mówi po polsku, nie identyfikatorem rejestru', () => {
    expect(operationLabel('ferry')).toBe('Przelot');
    expect(operationLabel('techniczny')).toBe('Lot tech.');
    expect(operationLabel(null)).toBe('—');
  });

  it('nazwisko skraca się tak samo, jak w aplikacji pilota', () => {
    expect(sessionRow(session).pic).toBe('T. Małkiewicz');
  });

  it('plakietka RĘCZNIE dotyczy całego wiersza, a unieważnienie go przekreśla', () => {
    expect(sessionRow({ ...session, manualEntry: true }).manual).toBe(true);
    expect(sessionRow({ ...session, status: 'voided' }).voided).toBe(true);
    expect(sessionRow(session).manual).toBe(false);
  });
});
