/**
 * UZ Aero — panel: wiersz skrzynki flag (moduł czysty).
 *
 * Testujemy REGUŁY, nie brzmienie napisów. Najważniejsza z nich nie jest widoczna
 * w typach: **mapowanie nie ma prawa przestawić kolejności**, bo porządek skrzynki
 * jest kontraktem serwera („blokujące eksport → najstarsze"), a lista bywa przycięta
 * `LIMIT`-em po stronie bazy.
 */

import { describe, expect, it } from 'vitest';

import type { FlagListItemDto } from '../../api/dto';
import { flagRows, shortUuid, STALE_AGE_MS } from './flagRows';

const NOW = Date.UTC(2026, 6, 31, 14, 22);
const hoursAgo = (h: number): string => new Date(NOW - h * 3_600_000).toISOString();

function flag(over: Partial<FlagListItemDto> = {}): FlagListItemDto {
  return {
    id: 1041,
    type: 'mh_gap',
    status: 'open',
    aircraftId: 'SP-ABC',
    reg: 'SP-ABC',
    aircraftType: 'Cessna 182',
    sessionUuids: ['a3f9c2e0-0000-4000-8000-00000000c210'],
    details: { gapH: 0.4, prevEnd: 1283.2, nextStart: 1283.6 },
    createdAt: hoursAgo(3),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    blocksExport: false,
    ...over,
  };
}

describe('flagRows', () => {
  it('NIE SORTUJE — oddaje wiersze w kolejności, w której przyszły z serwera', () => {
    // Kolejność jest własnością `ORDER BY` (blokujące eksport na górze, potem od
    // najstarszych). Wejście jest tu celowo „nieposortowane po wieku": gdyby ekran
    // sortował po swojemu, młodsza sprawa blokująca spadłaby pod starszą, a karta
    // dnia stojąca poza arkuszem czekałaby na dole listy.
    const items = [
      flag({ id: 1046, type: 'session_overlap', blocksExport: true, createdAt: hoursAgo(32) }),
      flag({ id: 1041, createdAt: hoursAgo(75) }),
      flag({ id: 1054, createdAt: hoursAgo(2) }),
    ];

    expect(flagRows(items, NOW).map((row) => row.id)).toEqual([1046, 1041, 1054]);
  });

  it('kolumna „Skutek" bierze WYŁĄCZNIE `blocksExport` z serwera', () => {
    // Nie odtwarzamy warunku „session_overlap blokuje" po stronie panelu: predykat
    // pochodzi z bramki eksportera i tylko tam ma prawo mieszkać. Panel mówiący
    // „blokuje", gdy eksporter przepuszcza, byłby rozjazdem niewidocznym z żadnej
    // ze stron osobno.
    const blocking = flagRows([flag({ type: 'session_overlap', blocksExport: true })], NOW)[0]!;
    expect(blocking.effect).toEqual({ tone: 'red', text: 'Blokuje kartę', dot: true });

    // Ten sam TYP, ale rozwiązany — serwer mówi `blocksExport: false` i to wygrywa.
    const resolved = flagRows(
      [flag({ type: 'session_overlap', status: 'resolved', blocksExport: false, resolvedAt: hoursAgo(1) })],
      NOW,
    )[0]!;
    expect(resolved.effect.tone).toBe('green');

    const plain = flagRows([flag()], NOW)[0]!;
    expect(plain.effect.tone).toBe('dim');
  });

  it('wiek jest WZGLĘDNY i liczy się do rozstrzygnięcia, nie do „teraz"', () => {
    const open = flagRows([flag({ createdAt: hoursAgo(6) })], NOW)[0]!;
    expect(open.age.text).toBe('6 h');

    // Sprawa zamknięta godzinę po wykryciu „leżała godzinę" — i tyle ma pokazywać
    // tydzień później, bo pytanie brzmi „ile leżała", a nie „ile ma lat".
    const closed = flagRows(
      [flag({ status: 'resolved', createdAt: hoursAgo(100), resolvedAt: hoursAgo(99) })],
      NOW,
    )[0]!;
    expect(closed.age.text).toBe('1 h');
    expect(closed.age.stale).toBe(false);
  });

  it('wyróżnia wiek dopiero od progu i tylko dla spraw OTWARTYCH', () => {
    const justUnder = flagRows([flag({ createdAt: new Date(NOW - STALE_AGE_MS + 60_000).toISOString() })], NOW)[0]!;
    const justOver = flagRows([flag({ createdAt: new Date(NOW - STALE_AGE_MS).toISOString() })], NOW)[0]!;

    expect(justUnder.age.stale).toBe(false);
    expect(justOver.age.stale).toBe(true);
  });

  it('rozbieżność `mh_gap` pokazuje oba odczyty i skalę dziury', () => {
    const row = flagRows([flag()], NOW)[0]!;
    expect(row.discrepancy.main).toBe('1283.2 → 1283.6');
    expect(row.discrepancy.sub).toBe('+0.4 h w łańcuchu MH');
  });

  it('cofnięty licznik pokazuje MINUS, choć serwer zapisuje wartość dodatnią', () => {
    const row = flagRows(
      [flag({ type: 'mh_regression', details: { regressionH: 0.8, prevEnd: 1284.9, nextStart: 1284.1 } })],
      NOW,
    )[0]!;
    expect(row.discrepancy.sub).toBe('−0.8 h na liczniku');
  });

  it('brak liczby w `details` daje kreskę, nie „undefined" i nie zero', () => {
    // `details` to `jsonb` — flaga sprzed zmiany detektora może nie mieć pola,
    // a „0.0 h dziury" byłoby zdaniem fałszywym, nie brakiem danych.
    const row = flagRows([flag({ details: {} })], NOW)[0]!;
    expect(row.discrepancy.main).toBe('— → —');
    expect(row.discrepancy.sub).toBe('— w łańcuchu MH');
  });

  it('samolot wyrejestrowany nie gubi wiersza — zostaje identyfikator', () => {
    const row = flagRows([flag({ reg: null, aircraftType: null })], NOW)[0]!;
    expect(row.aircraft.reg).toBe('SP-ABC');
    expect(row.aircraft.type).toBeNull();
  });

  it('skraca UUID-y do rozpoznania, ale nie kaleczy napisów krótkich', () => {
    expect(shortUuid('a3f9c2e0-0000-4000-8000-00000000c210')).toBe('a3f9…c210');
    expect(shortUuid('sess-1')).toBe('sess-1');
  });
});
