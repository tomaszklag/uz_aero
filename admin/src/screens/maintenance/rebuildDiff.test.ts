/**
 * UZ Aero — panel: różnice projekcji → wiersze tabeli (`A11`).
 *
 * Najważniejsze dwa przypadki: **milisekundy nie trafiają na ekran surowe** (mockup
 * pokazuje `05:41`, nie `20460000`) i **sesja bez wiersza projekcji daje JEDEN wiersz**,
 * a nie kilkanaście udających, że rozjechało się wszystko naraz.
 */

import { describe, expect, it } from 'vitest';

import type { ProjectionRowDiffDto, RebuildReportDto } from '../../api/dto';
import {
  DIFF_ROW_LIMIT,
  diffCaption,
  diffNotice,
  diffRows,
  diffValueHeaders,
  fieldValue,
} from './rebuildDiff';

const report = (over: Partial<RebuildReportDto> = {}): RebuildReportDto => ({
  mode: 'dry_run',
  sessions: 3,
  rowsDiffering: 0,
  fieldsDiffering: 0,
  written: 0,
  remaining: 0,
  diffs: [],
  ...over,
});

/** Sesja rozjechana w `fields` polach — materiał na dowolnie długą tabelę. */
const diffOf = (i: number, fields: number): ProjectionRowDiffDto => ({
  sessionUuid: `sess-${String(i).padStart(4, '0')}`,
  aircraftId: 'SP-KLM',
  day: '2026-06-24',
  missing: false,
  fields: Array.from({ length: fields }, (_, f) => ({
    field: `pole${f}`,
    stored: f,
    computed: f + 1,
  })),
});

describe('formatowanie wartości pola projekcji', () => {
  it('czas blokowy i lotu jadą jako HH:MM, nie jako milisekundy', () => {
    // `20460000` w komórce tabeli jest technicznie prawdziwe i praktycznie nieczytelne —
    // a mockup pokazuje dokładnie ten sam zapis, co ekran 10 telefonu i karta arkusza.
    expect(fieldValue('blockMs', (5 * 60 + 41) * 60_000)).toBe('05:41');
    expect(fieldValue('flightMs', 62 * 60_000)).toBe('01:02');
  });

  it('stempel czasu jest datą UTC, a zwykła liczba zostaje liczbą', () => {
    expect(fieldValue('claimTime', Date.UTC(2026, 5, 24, 8, 0))).toContain('24 JUN');
    expect(fieldValue('flightsCount', 6)).toBe('6');
  });

  it('`null` to KRESKA, nigdy zero ani „null"', () => {
    // Zero jest twierdzeniem o świecie („nie było ani jednego lotu"), brak wartości nim
    // nie jest — a `null` wypisany dosłownie wygląda jak usterka panelu.
    expect(fieldValue('flightsCount', null)).toBe('—');
    expect(fieldValue('blockMs', null)).toBe('—');
    expect(fieldValue('operation', undefined)).toBe('—');
  });

  it('wartość spoza spodziewanego kształtu jedzie DOSŁOWNIE, zamiast wywalić ekran', () => {
    // Narzędzie diagnostyczne, które wywraca się na własnej zawartości, przestaje być
    // narzędziem dokładnie wtedy, gdy jest potrzebne.
    expect(fieldValue('operation', 'skoki')).toBe('skoki');
    expect(fieldValue('blockMs', 'nie-liczba')).toBe('nie-liczba');
    expect(fieldValue('cokolwiek', { a: 1 })).toBe('{"a":1}');
  });
});

describe('spłaszczenie raportu do wierszy tabeli', () => {
  it('bez raportu nie ma wierszy — ekran nie zgaduje, czego nie policzył', () => {
    expect(diffRows(undefined)).toEqual([]);
    expect(diffRows(report())).toEqual([]);
  });

  it('jedna sesja z dwoma polami daje DWA wiersze z powtórzonym uuid-em', () => {
    const rows = diffRows(
      report({
        rowsDiffering: 1,
        fieldsDiffering: 2,
        diffs: [
          {
            sessionUuid: '9f21aaaa-bbbb-cccc-dddd-eeeeeeeec04e',
            aircraftId: 'SP-KLM',
            day: '2026-06-24',
            missing: false,
            fields: [
              { field: 'flightsCount', stored: 6, computed: 7 },
              { field: 'blockMs', stored: (5 * 60 + 41) * 60_000, computed: (5 * 60 + 58) * 60_000 },
            ],
          },
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      field: 'flightsCount',
      stored: '6',
      computed: '7',
      day: '24 JUN 2026',
      dayHref: '/dni/9f21aaaa-bbbb-cccc-dddd-eeeeeeeec04e',
      missing: false,
    });
    expect(rows[1]).toMatchObject({ field: 'blockMs', stored: '05:41', computed: '05:58' });
    // Klucze wierszy muszą być różne — inaczej React renderuje jeden z dwóch.
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });

  it('sesja BEZ wiersza projekcji daje jeden wiersz nazywający brak', () => {
    const rows = diffRows(
      report({
        rowsDiffering: 1,
        diffs: [
          {
            sessionUuid: 'sess-1',
            aircraftId: 'SP-XYZ',
            day: null,
            missing: true,
            fields: [],
          },
        ],
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      missing: true,
      field: 'CAŁY WIERSZ',
      stored: 'brak w sessions',
      // Sesja bez claimu nie ma dnia i panel mówi to wprost, zamiast wnioskować.
      day: '—',
    });
  });

  it('zachowuje KOLEJNOŚĆ serwera — panel nie sortuje raportu po swojemu', () => {
    const rows = diffRows(
      report({
        diffs: [
          { sessionUuid: 'b', aircraftId: 'SP-B', day: null, missing: true, fields: [] },
          { sessionUuid: 'a', aircraftId: 'SP-A', day: null, missing: true, fields: [] },
        ],
      }),
    );
    expect(rows.map((r) => r.sessionUuid)).toEqual(['b', 'a']);
  });
});

describe('objętość tabeli — bezpiecznik jest, i nie jest cichy', () => {
  it('tabela ma GRANICĘ — bez niej jeden render to tysiące wierszy', () => {
    // ══ SCENARIUSZ, KTÓRY TO WYMUSIŁ ══
    // Zmiana reguły liczenia w wydaniu domeny rozjeżdża KAŻDĄ sesję w bazie, i to
    // w kilku polach naraz. Do audytu szło `slice(0, AUDIT_UUID_LIMIT)`, czyli objętość
    // dziennika była przemyślana — objętość odpowiedzi i tabeli nie była wcale.
    // Ekran, po który sięga się przy awarii, dostawał wtedy tysiące wierszy w jednym
    // renderze.
    const big = report({
      rowsDiffering: 200,
      fieldsDiffering: 1000,
      diffs: Array.from({ length: 200 }, (_, i) => diffOf(i, 5)),
    });

    // Kontrola samego przypadku: materiał NAPRAWDĘ przekracza limit.
    expect(200 * 5).toBeGreaterThan(DIFF_ROW_LIMIT);
    expect(diffRows(big)).toHaveLength(DIFF_ROW_LIMIT);
  });

  it('mówi, ILE pominięto — w obu wymiarach naraz', () => {
    // Dwa niezależne obcięcia: sesje, których nie zmieścił SERWER (`remaining`),
    // i wiersze, których nie zmieściła TABELA. Lista przycięta po cichu wygląda na
    // komplet, więc odpowiedź „projekcja rozjechała się o tyle" brzmi tak samo, jak
    // gdyby była pełna.
    const notice = diffNotice(
      report({
        rowsDiffering: 1291,
        remaining: 1091,
        diffs: Array.from({ length: 200 }, (_, i) => diffOf(i, 5)),
      }),
    )!;

    expect(notice).toContain('200 z 1291');
    expect(notice).toContain('1091');
    expect(notice).toContain(`pierwsze ${DIFF_ROW_LIMIT} z 1000`);
    expect(notice).toContain('CAŁY rejestr');
  });

  it('raport mieszczący się w obu limitach NIE dostaje zdania o obcięciu', () => {
    expect(diffNotice(undefined)).toBeNull();
    expect(diffNotice(report({ rowsDiffering: 2, diffs: [diffOf(1, 2)] }))).toBeNull();
  });
});

describe('podpis i nagłówki tabeli po ZAPISIE', () => {
  it('po nadpisaniu tabela opisuje SKUTEK, a nie różnicę, której już nie ma', () => {
    // Te same wiersze, dwa różne zdania: przed zapisem „co się różni", po zapisie
    // „co zostało nadpisane i z czego na co". Nagłówek „Z przeliczenia" nad wartością,
    // która LEŻY JUŻ W BAZIE, jest fałszem o stanie sprzed kilku sekund.
    expect(diffCaption(report())).toContain('Różnice między projekcją');
    expect(diffValueHeaders(report())).toEqual({
      stored: 'W sessions',
      computed: 'Z przeliczenia',
    });

    const afterWrite = report({ mode: 'write', rowsDiffering: 2, written: 2 });
    expect(diffCaption(afterWrite)).toContain('nadpisane w tym przebiegu');
    expect(diffValueHeaders(afterWrite)).toEqual({
      stored: 'Przed zapisem',
      computed: 'Zapisano',
    });
  });

  it('bez raportu zachowuje się jak porównanie — nagłówki nie znikają z pustej tabeli', () => {
    expect(diffValueHeaders(undefined)).toEqual({
      stored: 'W sessions',
      computed: 'Z przeliczenia',
    });
  });
});
