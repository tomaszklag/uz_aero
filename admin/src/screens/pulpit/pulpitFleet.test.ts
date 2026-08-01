/**
 * UZ Aero — panel: testy wierszy „Flota teraz" (`A01`).
 *
 * Cztery własności, których złamanie jest usterką produktu, a nie kosmetyką ekranu:
 *  1. plakietka fazy lotu pochodzi ze STANU SILNIKA, a nie z istnienia claimu;
 *  2. milczący telefon wygrywa nad fazą lotu — „w locie" przy syncu sprzed godziny
 *     nie jest wiedzą o locie;
 *  3. brak odczytu to „—", nigdy zero;
 *  4. jednostka WOLNA nie świeci na bursztyn od samego wieku odczytu.
 */

import { describe, expect, it } from 'vitest';

import type { DashboardAircraftDto, EngineStateDto } from '../../api/dto';
import {
  OPEN_DAY_STALE_AFTER_MS,
  fleetNowRows,
  freshValClass,
  rowClass,
} from './pulpitFleet';

const NOW = Date.UTC(2026, 6, 31, 14, 22, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const engine = (over: Partial<EngineStateDto> = {}): EngineStateDto => ({
  sessionUuid: 'sess-1',
  engineRunning: false,
  inFlight: false,
  flightsCount: 0,
  openTakeoffAt: null,
  engineStoppedAt: null,
  lastEventAt: NOW - 10 * MINUTE,
  dutyStart: NOW - 6 * HOUR,
  departureIcao: 'EPMO',
  dualId: null,
  dualName: null,
  eventCount: 12,
  ...over,
});

function row(over: {
  engine?: EngineStateDto | null;
  lastEventAt?: string | null;
  serviceStatus?: 'active' | 'disabled';
  reading?: DashboardAircraftDto['aircraft']['reading'];
}): DashboardAircraftDto {
  return {
    aircraft: {
      id: 'ac-1',
      reg: 'SP-ABC',
      type: 'Cessna 182',
      year: 2019,
      capacityL: 330,
      fuelToleranceL: 16.5,
      mhFormat: 'decimal',
      dualRequired: false,
      serviceStatus: over.serviceStatus ?? 'active',
      updatedAt: new Date(NOW - 30 * DAY).toISOString(),
      claim:
        over.engine == null
          ? null
          : {
              sessionUuid: over.engine.sessionUuid,
              picId: 'TMK',
              picCode: 'TMK',
              picName: 'Tomasz Małkiewicz',
              since: over.engine.dutyStart,
            },
      reading:
        over.reading === undefined
          ? {
              mh: 1284.6,
              fuelL: 96,
              at: NOW - 8 * HOUR,
              byPilotId: 'TMK',
              byPilotName: 'Tomasz Małkiewicz',
              source: 'handover',
            }
          : over.reading,
      lastEventAt:
        over.lastEventAt === undefined ? new Date(NOW - 2 * MINUTE).toISOString() : over.lastEventAt,
      openSessions: over.engine == null ? 0 : 1,
      openFlags: 0,
    },
    engine: over.engine ?? null,
  };
}

const one = (dto: DashboardAircraftDto) => fleetNowRows([dto], NOW)[0]!;

describe('plakietka fazy lotu pochodzi ze stanu SILNIKA', () => {
  it('w powietrzu → „W locie" z pulsem, numer lotu i czas startu', () => {
    // Tego `A02` i `A07` nie umiały powiedzieć: projekcja `sessions` nie niesie stanu
    // silnika, więc obie mówią „Zajęty". Pulpit dostaje projekcję strumienia.
    const view = one(
      row({
        engine: engine({ engineRunning: true, inFlight: true, flightsCount: 4, openTakeoffAt: NOW - 11 * MINUTE }),
      }),
    );

    expect(view.badge).toEqual({ text: 'W locie', tone: 'green', live: true });
    expect(view.mood).toBe('flying');
    expect(view.rowClass).toBe('fleet-row flying');
    expect(view.freshNote).toBe('lot 4 · T/O 14:11');
  });

  it('silnik pracuje, ale samolot na ziemi → osobna plakietka, nie „W locie"', () => {
    const view = one(row({ engine: engine({ engineRunning: true, inFlight: false, flightsCount: 1 }) }));
    expect(view.badge.text).toBe('Silnik pracuje');
    expect(view.mood).toBe('flying');
  });

  it('silnik wyłączony przy otwartym dniu → „Na ziemi" z godziną wyłączenia', () => {
    const view = one(
      row({ engine: engine({ flightsCount: 2, engineStoppedAt: NOW - 18 * MINUTE }) }),
    );
    expect(view.badge).toEqual({ text: 'Na ziemi', tone: 'blue' });
    expect(view.rowClass).toBe('fleet-row');
    expect(view.freshNote).toBe('silnik OFF 14:04');
  });

  it('brak otwartej sesji → „Wolny", NIGDY zgadywane „na ziemi"', () => {
    // `engine: null` znaczy „nie ma otwartej sesji", a nie „silnik nie pracuje".
    const view = one(row({ engine: null }));
    expect(view.badge).toEqual({ text: 'Wolny', tone: 'dim' });
    expect(view.rowClass).toBe('fleet-row free');
  });

  it('jednostka wyłączona ze służby ma własny stan, nie „Wolny"', () => {
    // „Wolny" znaczyłoby, że ktoś ją może wziąć — a nie może, bo nie ma jej na liście.
    const view = one(row({ engine: null, serviceStatus: 'disabled' }));
    expect(view.badge).toEqual({ text: 'Poza służbą', tone: 'dim' });
    expect(view.freshNote).toBe('historia zostaje');
  });
});

describe('milczący telefon WYGRYWA nad fazą lotu', () => {
  it('„w locie" przy syncu starszym niż próg → wiersz `stale` i „Dane w drodze"', () => {
    // Cytat z SZABLON.html: „»w locie« przy syncu sprzed 47 minut to nie jest wiedza
    // o locie, tylko ostatnia znana pozycja".
    const view = one(
      row({
        engine: engine({ engineRunning: true, inFlight: true, flightsCount: 3 }),
        lastEventAt: new Date(NOW - OPEN_DAY_STALE_AFTER_MS - MINUTE).toISOString(),
      }),
    );

    expect(view.mood).toBe('stale');
    expect(view.rowClass).toBe('fleet-row stale');
    expect(view.badge).toEqual({ text: 'Dane w drodze', tone: 'amber' });
    expect(view.freshness).toBe('stale');
    expect(view.freshClass).toBe('fresh-val amber');
  });

  it('sync dokładnie NA progu jest jeszcze świeży — granica jest ostra', () => {
    const view = one(
      row({
        engine: engine({ inFlight: true, engineRunning: true }),
        lastEventAt: new Date(NOW - OPEN_DAY_STALE_AFTER_MS).toISOString(),
      }),
    );
    expect(view.mood).toBe('flying');
    expect(view.freshness).toBe('fresh');
  });

  it('otwarty claim BEZ ani jednego zdarzenia mówi to wprost', () => {
    // Warunek „cisza podejrzana" z `A01a` — z projekcji `sessions` niewidoczny.
    const view = one(row({ engine: engine({ eventCount: 0 }), lastEventAt: null }));
    expect(view.freshNote).toBe('claim bez ani jednego zdarzenia');
    expect(view.freshText).toBe('brak zdarzeń w rejestrze');
    expect(view.freshness).toBe('none');
    expect(view.freshClass).toBe('fresh-val dim');
  });
});

describe('brak danych to „—", nigdy zero', () => {
  it('jednostka bez odczytu nie pokazuje ani `0 L`, ani `0.0`', () => {
    // `0 L` byłoby twierdzeniem o pustym zbiorniku, a brak odczytu nim nie jest.
    const view = one(row({ engine: null, reading: null }));
    expect(view.mh).toBe('—');
    expect(view.fuel).toBe('—');
    expect(view.since).toBe('nigdy nie przejmowany');
    expect(view.freshNote).toBe('brak danych z telefonu');
  });

  it('odczyt formatuje się WEDŁUG konfiguracji jednostki, nie na sztywno', () => {
    const decimal = one(row({ engine: null }));
    expect(decimal.mh).toBe('1284.6');

    const dto = row({ engine: null });
    dto.aircraft.mhFormat = 'hhmm';
    expect(fleetNowRows([dto], NOW)[0]!.mh).toBe('1284:36');
  });
});

describe('wiek odczytu przy jednostce WOLNEJ nie jest ostrzeżeniem', () => {
  it('stary sync po `day_close` zostaje przygaszony, a nie bursztynowy', () => {
    // Mockup A01a mówi to wprost: „przy zamkniętym dniu liczniki po prostu stoją,
    // a stara wartość jest tak samo prawdziwa jak wczoraj. Amber pojawia się dopiero
    // wtedy, gdy stary odczyt należy do sesji, która wciąż jest otwarta".
    const view = one(row({ engine: null, lastEventAt: new Date(NOW - 3 * DAY).toISOString() }));
    expect(view.freshness).toBe('none');
    expect(view.freshClass).toBe('fresh-val dim');
    expect(view.freshText).toContain('przekazanie');
    expect(view.freshNote).toBe('z day_close');
  });

  it('odczyt z OTWARTEJ sesji poprzednika jest podpisany inaczej', () => {
    const dto = row({ engine: null });
    dto.aircraft.reading = {
      mh: 900,
      fuelL: 60,
      at: NOW - 2 * HOUR,
      byPilotId: 'KRZ',
      byPilotName: 'Krzysztof Zieliński',
      source: 'open_session',
    };
    expect(fleetNowRows([dto], NOW)[0]!.freshNote).toBe('z otwartej sesji');
  });
});

describe('opis dnia i przejście wiersza', () => {
  it('linia opisu składa claim, duty, lotnisko i drugiego pilota', () => {
    const view = one(
      row({
        engine: engine({
          engineRunning: true,
          inFlight: true,
          dutyStart: NOW - 6 * HOUR - 24 * MINUTE,
          departureIcao: 'EPMO',
          dualId: 'MBK',
          dualName: 'Marek Bąk',
        }),
      }),
    );
    expect(view.since).toBe('claim 07:58 · duty 6:24 · EPMO · dual: Marek Bąk');
  });

  it('sesja bez preflightu NIE UDAJE duty startu', () => {
    // Dzień bez `preflight_confirm` nie ma daty ani duty startu — liczenie „duty 0:00"
    // byłoby wymyśleniem wielkości, której nie ma.
    const view = one(row({ engine: engine({ dutyStart: null, departureIcao: null }) }));
    expect(view.since).toBe('claim bez preflightu');
  });

  it('wiersz z otwartym dniem prowadzi na KARTĘ DNIA, wolny — do szuflady jednostki', () => {
    expect(one(row({ engine: engine({ sessionUuid: 'sess-7' }) })).to).toBe('/dni/sess-7');
    expect(one(row({ engine: null })).to).toBe('/flota/ac-1');
  });
});

describe('klasy CSS są PEŁNYMI literałami', () => {
  it('nazwa klasy nie powstaje przez sklejenie — cztery nastroje, cztery napisy', () => {
    // Wada, przed którą to broni: `A07` wypisywał `fresh-stale`, czyli klasę, której
    // nie definiuje żaden arkusz. Stany były policzone i niewidoczne.
    expect(rowClass('flying')).toBe('fleet-row flying');
    expect(rowClass('ground')).toBe('fleet-row');
    expect(rowClass('stale')).toBe('fleet-row stale');
    expect(rowClass('free')).toBe('fleet-row free');

    expect(freshValClass('fresh')).toBe('fresh-val');
    expect(freshValClass('stale')).toBe('fresh-val amber');
    expect(freshValClass('none')).toBe('fresh-val dim');
  });
});
