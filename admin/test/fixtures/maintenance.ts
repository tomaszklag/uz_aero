/**
 * UZ Aero — panel: odpowiedzi tras `/admin/api/maintenance/*` do testu renderu (`A11`).
 *
 * Scenariusz jest ten z mockupu: dwie sesje różniące się od przeliczenia (jedna w dwóch
 * polach), 37 martwych tokenów obok 15 żywych, jeden dzień bez karty i jeden zablokowany
 * flagą. Fixture są FUNKCJAMI, żeby każdy przypadek dostał własną kopię i mógł ją popsuć
 * bez wpływu na sąsiadów.
 */

import type {
  ExportListItemDto,
  ExportPageDto,
  RebuildReportDto,
  RefreshTokenScanDto,
  SchemaStateDto,
} from '../../src/api/dto';

export function rebuildFixture(): RebuildReportDto {
  return {
    mode: 'dry_run',
    sessions: 1291,
    rowsDiffering: 2,
    fieldsDiffering: 3,
    written: 0,
    remaining: 0,
    diffs: [
      {
        sessionUuid: '9f21aaaa-bbbb-cccc-dddd-eeeeeeeec04e',
        aircraftId: 'SP-KLM',
        day: '2026-07-24',
        missing: false,
        fields: [
          { field: 'flightsCount', stored: 6, computed: 7 },
          { field: 'blockMs', stored: (5 * 60 + 41) * 60_000, computed: (5 * 60 + 58) * 60_000 },
        ],
      },
      {
        sessionUuid: 'a4d0aaaa-bbbb-cccc-dddd-eeeeeeee7b13',
        aircraftId: 'SP-XYZ',
        day: '2026-07-24',
        missing: false,
        fields: [{ field: 'flightMs', stored: 62 * 60_000, computed: 65 * 60_000 }],
      },
    ],
  };
}

/**
 * Raport z UDANEGO ZAPISU tych samych dwóch wierszy — ten sam kształt, inny `mode`.
 *
 * Istnieje, bo to jest stan, w którym ekran przez chwilę kłamał najgłośniej: baner wołał
 * „to incydent, ustal przyczynę", tabela pokazywała różnice, które właśnie zniknęły,
 * a przycisk wracał czynny z etykietą „Nadpisz 2 wiersze".
 */
export function writtenFixture(): RebuildReportDto {
  return { ...rebuildFixture(), mode: 'write', written: 2 };
}

/** Zapis CZĘŚCIOWY: limit przebiegu ruszył 200 sesji z 1291, reszta czeka. */
export function partialWriteFixture(): RebuildReportDto {
  return {
    ...rebuildFixture(),
    mode: 'write',
    rowsDiffering: 1291,
    written: 200,
    remaining: 1091,
  };
}

export function tokensFixture(): RefreshTokenScanDto {
  return {
    total: 52,
    expired: 37,
    valid: 15,
    oldestExpiredAt: '2026-03-12T03:41:00.000Z',
    newestExpiredAt: '2026-07-28T09:02:00.000Z',
    at: '2026-07-31T14:22:00.000Z',
    ttlDays: 90,
  };
}

export function schemaFixture(): SchemaStateDto {
  return {
    schemaVersion: 3,
    applied: 3,
    pending: 0,
    lastAppliedAt: '2026-07-29T05:02:00.000Z',
    migrations: [
      {
        version: 1,
        title: 'Fundament: pilots, aircraft, refresh_tokens, events',
        appliedAt: '2026-05-12T10:00:00.000Z',
        applied: true,
      },
      {
        version: 2,
        title: 'Projekcje serwera: sessions i flags',
        appliedAt: '2026-05-12T10:00:01.000Z',
        applied: true,
      },
      {
        version: 3,
        title: 'Motyw jako preferencja pilota: pilots.theme + theme_updated_at',
        appliedAt: '2026-07-29T05:02:00.000Z',
        applied: true,
      },
    ],
  };
}

function exportItem(over: Partial<ExportListItemDto>): ExportListItemDto {
  return {
    sessionUuid: 'sess-bez-karty',
    tab: '2026-07-29_SP-KLM',
    day: '2026-07-29',
    claimedAt: Date.UTC(2026, 6, 29, 8, 0),
    aircraftId: 'ac-klm',
    reg: 'SP-KLM',
    aircraftType: 'Cessna 208 Caravan',
    picId: 'AWR',
    picCode: 'AWR',
    picName: 'Anna Wrzosek',
    sessionStatus: 'closed',
    state: 'missing',
    revision: null,
    exportedAt: null,
    sheetUrl: null,
    blockingFlagIds: [],
    updatedAt: new Date(Date.UTC(2026, 6, 29, 18, 0)).toISOString(),
    overwrittenBy: null,
    ...over,
  };
}

const EMPTY_COUNTS = {
  total: 0,
  current: 0,
  blocked: 0,
  missing: 0,
  waiting: 0,
  impossible: 0,
  revised: 0,
  overwritten: 0,
};

/**
 * Strona monitora zawężona przez SERWER do jednego stanu — tak wchodzi do kolejki.
 *
 * `matched` jest osobnym parametrem, bo to właśnie rozjazd `matched` ↔ `items.length`
 * jest treścią: serwer liczy dopasowania POZA `limit`-em, a lista jest oknem.
 */
export function queuePage(items: ExportListItemDto[], matched = items.length): ExportPageDto {
  return {
    items,
    counts: { ...EMPTY_COUNTS, total: matched },
    matched,
    truncated: matched > items.length,
  } as ExportPageDto;
}

/** Dzień zamknięty, którego karta nie powstała — ponowienie ma sens. */
export function failedExport(): ExportListItemDto {
  return exportItem({});
}

/** Dzień zablokowany otwartą flagą — ponowienie odbije się o tę samą bramkę. */
export function blockedExport(): ExportListItemDto {
  return exportItem({
    sessionUuid: 'sess-flaga',
    tab: '2026-07-30_SP-KLM',
    day: '2026-07-30',
    claimedAt: Date.UTC(2026, 6, 30, 8, 0),
    state: 'blocked',
    blockingFlagIds: [1046],
  });
}
