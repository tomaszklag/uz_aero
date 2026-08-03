/**
 * UZ Aero — panel: ODPOWIEDŹ PULPITU jako dane testowe (`GET /admin/api/dashboard`).
 *
 * Jeden scenariusz obsługujący wszystkie warianty ekranu, bo wszystkie muszą być
 * widoczne NARAZ — inaczej test świeżości sprawdzałby jeden stan zamiast trzech:
 *
 *  • `SP-ABC` — w powietrzu, telefon zsynchronizowany przed chwilą  → wiersz `flying`,
 *  • `SP-KLM` — dzień otwarty, telefon milczy od 47 minut           → wiersz `stale`,
 *  • `SP-XYZ` — dzień otwarty, silnik wyłączony, sync świeży        → wiersz bez modyfikatora,
 *  • `SP-DEF` — wolny, po `day_close` z wczoraj                     → wiersz `free`.
 *
 * Kolejka „wymaga uwagi" niesie sprawę BLOKUJĄCĄ arkusz (flaga) i sprawę STARSZĄ,
 * ale nieblokującą (dzień bez `day_close`) — po to, żeby porządek dało się sprawdzić
 * w obie strony, a nie tylko przy jednej pozycji.
 *
 * Funkcja, a nie stała: każdy test dostaje ŚWIEŻĄ kopię i wolno mu ją popsuć na swój
 * scenariusz (cisza, brak odczytów, zerowy napływ). Współdzielony obiekt zamieniłby
 * kolejność testów w ukrytą zależność.
 */

import type { DashboardDto } from '../../src/api/dto';

/** Chwila „teraz" wg zegara SERWERA — wszystkie wieki liczą się względem niej. */
export const NOW = Date.UTC(2026, 6, 31, 14, 22, 0);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const iso = (ms: number): string => new Date(ms).toISOString();

export function dashboardFixture(): DashboardDto {
  return {
    at: iso(NOW),
    correctionWindowMs: DAY,
    counts: {
      aircraftTotal: 4,
      aircraftActive: 4,
      aircraftClaimed: 3,
      openDays: 3,
      openFlags: 2,
      exports: {
        total: 9,
        current: 7,
        blocked: 1,
        missing: 1,
        waiting: 0,
        impossible: 0,
        revised: 2,
        overwritten: 0,
      },
    },

    fleet: [
      aircraft({
        id: 'ac-air',
        reg: 'SP-ABC',
        type: 'Cessna 182',
        lastEventAt: iso(NOW - 2 * MINUTE),
        claimSince: NOW - 6 * HOUR - 24 * MINUTE,
        engine: {
          sessionUuid: 'sess-air',
          engineRunning: true,
          inFlight: true,
          flightsCount: 4,
          openTakeoffAt: NOW - 11 * MINUTE,
          engineStoppedAt: null,
          lastEventAt: NOW - 11 * MINUTE,
          dutyStart: NOW - 6 * HOUR - 24 * MINUTE,
          departureIcao: 'EPMO',
          dualId: null,
          dualName: null,
          eventCount: 42,
        },
      }),
      aircraft({
        id: 'ac-stale',
        reg: 'SP-KLM',
        type: 'Cessna 208 Caravan',
        // Telefon milczy od 47 minut — ponad próg `OPEN_DAY_STALE_AFTER_MS`.
        lastEventAt: iso(NOW - 47 * MINUTE),
        claimSince: NOW - 7 * HOUR - 42 * MINUTE,
        engine: {
          sessionUuid: 'sess-stale',
          engineRunning: true,
          inFlight: true,
          flightsCount: 3,
          openTakeoffAt: NOW - 52 * MINUTE,
          engineStoppedAt: null,
          lastEventAt: NOW - 47 * MINUTE,
          dutyStart: NOW - 7 * HOUR - 42 * MINUTE,
          departureIcao: 'EPRA',
          dualId: 'MBK',
          dualName: 'Marek Bąk',
          eventCount: 34,
        },
      }),
      aircraft({
        id: 'ac-ground',
        reg: 'SP-XYZ',
        type: 'Aero AT-3',
        lastEventAt: iso(NOW - 6 * MINUTE),
        claimSince: NOW - 5 * HOUR - 10 * MINUTE,
        engine: {
          sessionUuid: 'sess-ground',
          engineRunning: false,
          inFlight: false,
          flightsCount: 2,
          openTakeoffAt: null,
          engineStoppedAt: NOW - 18 * MINUTE,
          lastEventAt: NOW - 6 * MINUTE,
          dutyStart: NOW - 5 * HOUR - 10 * MINUTE,
          departureIcao: 'EPBC',
          dualId: null,
          dualName: null,
          eventCount: 27,
        },
      }),
      aircraft({
        id: 'ac-free',
        reg: 'SP-DEF',
        type: 'Aero AT-3',
        lastEventAt: iso(NOW - DAY + 3 * HOUR),
        claimSince: null,
        engine: null,
      }),
    ],

    attention: {
      flags: [
        {
          id: 1046,
          type: 'session_overlap',
          status: 'open',
          aircraftId: 'ac-stale',
          reg: 'SP-KLM',
          aircraftType: 'Cessna 208 Caravan',
          sessionUuids: ['sess-stale', 'sess-other'],
          details: {},
          createdAt: iso(NOW - 2 * DAY),
          resolvedAt: null,
          resolvedBy: null,
          resolutionNote: null,
          // Sprawa BLOKUJĄCA arkusz — mimo że młodsza od dnia niżej, idzie na górę.
          blocksExport: true,
        },
      ],
      failedExports: [],
      staleOpenDays: [
        {
          sessionUuid: 'sess-stale',
          aircraftId: 'ac-stale',
          reg: 'SP-KLM',
          aircraftType: 'Cessna 208 Caravan',
          mhFormat: 'decimal',
          picId: 'AWR',
          picCode: 'AWR',
          picName: 'Anna Wrzosek',
          dualId: null,
          dualCode: null,
          dualName: null,
          status: 'active',
          operation: 'skoki',
          client: null,
          dutyStart: NOW - 3 * DAY,
          closeTime: null,
          blockMs: 4 * HOUR,
          flightMs: 3 * HOUR,
          flightsCount: 5,
          mhStart: 3900,
          mhEnd: null,
          fuelStartL: 260,
          fuelEndL: null,
          openFlags: ['session_overlap'],
          exportRevision: null,
          updatedAt: iso(NOW - 47 * MINUTE),
        },
      ],
    },

    inflow: {
      fromMs: NOW - 12 * HOUR,
      toMs: NOW,
      bucketMs: HOUR,
      // Dwa puste słupki w środku — cisza, która NIE znaczy „nikt nie latał".
      buckets: [12, 21, 35, 26, 44, 32, 0, 0, 19, 39, 28, 24],
    },

    recent: [
      {
        uuid: 'ev-1',
        sessionUuid: 'sess-air',
        aircraftId: 'ac-air',
        reg: 'SP-ABC',
        type: 'takeoff',
        eventTime: NOW - 2 * MINUTE,
        receivedAt: iso(NOW - 2 * MINUTE),
        picId: 'TMK',
        picCode: 'TMK',
        picName: 'Tomasz Małkiewicz',
      },
      {
        uuid: 'ev-2',
        sessionUuid: 'sess-ground',
        aircraftId: 'ac-ground',
        reg: 'SP-XYZ',
        type: 'engine_stop',
        eventTime: NOW - 18 * MINUTE,
        // Paczka z zaległego outboxu: zdarzenie sprzed 18 minut, przyjęte 6 minut temu.
        receivedAt: iso(NOW - 6 * MINUTE),
        picId: 'PCZ',
        picCode: 'PCZ',
        picName: 'Piotr Czarnecki',
      },
    ],

    today: {
      day: '2026-07-31',
      fromMs: Date.UTC(2026, 6, 31),
      toMs: Date.UTC(2026, 6, 31) + DAY - 1,
      sessions: 3,
      aircraft: 3,
      flights: 17,
      blockMs: 9 * HOUR + 47 * MINUTE,
      eventsAccepted: 184,
    },

    lastFlyingDay: {
      day: '2026-07-31',
      fromMs: Date.UTC(2026, 6, 31),
      toMs: Date.UTC(2026, 6, 31) + DAY - 1,
      sessions: 3,
      aircraft: 3,
      flights: 17,
      blockMs: 9 * HOUR + 47 * MINUTE,
      eventsAccepted: 184,
    },
  };
}

interface AircraftOptions {
  id: string;
  reg: string;
  type: string;
  lastEventAt: string | null;
  claimSince: number | null;
  engine: DashboardDto['fleet'][number]['engine'];
}

function aircraft(o: AircraftOptions): DashboardDto['fleet'][number] {
  return {
    aircraft: {
      id: o.id,
      reg: o.reg,
      type: o.type,
      year: 2019,
      capacityL: 330,
      fuelToleranceL: 16.5,
      mhFormat: 'decimal',
      dualRequired: false,
      serviceStatus: 'active',
      updatedAt: iso(NOW - 30 * DAY),
      claim:
        o.engine == null
          ? null
          : {
              sessionUuid: o.engine.sessionUuid,
              picId: 'TMK',
              picCode: 'TMK',
              picName: 'Tomasz Małkiewicz',
              since: o.claimSince,
            },
      reading: {
        mh: 1284.6,
        fuelL: 96,
        at: NOW - 8 * HOUR,
        byPilotId: 'TMK',
        byPilotName: 'Tomasz Małkiewicz',
        source: o.engine == null ? 'handover' : 'open_session',
      },
      lastEventAt: o.lastEventAt,
      openSessions: o.engine == null ? 0 : 1,
      openFlags: 0,
    },
    engine: o.engine,
  };
}
