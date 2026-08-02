/**
 * UZ Aero — panel: kolejka ponowień eksportu (`A11`).
 *
 * Kolejka jest ZŁĄCZENIEM dwóch zawężeń serwera, więc przypadki dotyczą tego, czego
 * serwer o niej nie wie: porządku, deduplikacji i liczników plakietek. Treść wiersza
 * (stan, nazwa karty, „czy warto ponawiać") pochodzi z `exportsRows` i ma testy tam —
 * powtarzanie ich tutaj utrwaliłoby DRUGĄ definicję tego samego.
 */

import { describe, expect, it } from 'vitest';

import type { ExportListItemDto, ExportPageDto } from '../../api/dto';
import {
  queueCounts,
  queueEmpty,
  queueLabels,
  queueRows,
  queueTruncationNotice,
} from './retryQueue';

const NOW = Date.UTC(2026, 6, 31, 14, 22);

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
 * Strona monitora tak, jak zwraca ją serwer: `matched` opisuje CAŁE zawężenie, `items`
 * to okno przycięte `limit`-em. Rozjazd między nimi jest sednem tych przypadków.
 */
const page = (items: ExportListItemDto[], matched = items.length): ExportPageDto =>
  ({
    items,
    counts: { ...EMPTY_COUNTS, total: matched },
    matched,
    truncated: matched > items.length,
  }) as ExportPageDto;

const item = (over: Partial<ExportListItemDto>): ExportListItemDto => ({
  sessionUuid: 'sess-1',
  tab: '2026-07-29_SP-KLM',
  day: '2026-07-29',
  dutyStart: Date.UTC(2026, 6, 29, 8, 0),
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
});

const failed = item({ sessionUuid: 'sess-bez-karty' });
const blocked = item({
  sessionUuid: 'sess-flaga',
  state: 'blocked',
  blockingFlagIds: [1046],
});

describe('złączenie dwóch zawężeń serwera', () => {
  it('najpierw to, co DA SIĘ ponowić — potem to, co odbije się o flagę', () => {
    // Odwrotna kolejność stawiałaby na górze wiersze z wyszarzonym przyciskiem, czyli
    // listę zaczynałby rząd rzeczy, których zrobić nie można.
    const rows = queueRows([failed], [blocked], NOW);
    expect(rows.map((r) => r.sessionUuid)).toEqual(['sess-bez-karty', 'sess-flaga']);
    expect(rows[0]!.canRetry).toBe(true);
    expect(rows[1]!.canRetry).toBe(false);
    expect(rows[1]!.retryReason).toContain('1046');
    expect(rows[1]!.flagHref).toBe('/flagi/1046');
  });

  it('ten sam dzień w obu odpowiedziach wchodzi RAZ', () => {
    // Dwa żądania to dwie chwile: dzień, którego flagę rozstrzygnięto między nimi,
    // wjechałby do listy dwa razy, z dwoma różnymi stanami.
    const rows = queueRows([item({ sessionUuid: 'sess-x' })], [item({ sessionUuid: 'sess-x' })], NOW);
    expect(rows).toHaveLength(1);
  });

  it('zachowuje kolejność serwera WEWNĄTRZ każdej grupy', () => {
    const rows = queueRows(
      [item({ sessionUuid: 'b' }), item({ sessionUuid: 'a' })],
      [],
      NOW,
    );
    expect(rows.map((r) => r.sessionUuid)).toEqual(['b', 'a']);
  });

  it('wiersz prowadzi do karty na `A05`, nie do drugiego, własnego widoku', () => {
    expect(queueRows([failed], [], NOW)[0]!.href).toBe('/eksporty/sess-bez-karty');
  });
});

describe('liczniki i plakietki', () => {
  it('rozdziela „bez karty" od „zablokowane flagą" — to dwie różne sprawy', () => {
    const rows = queueRows([failed], [blocked], NOW);
    expect(queueCounts(page([failed]), page([blocked]), rows.length)).toEqual({
      total: 2,
      failed: 1,
      blocked: 1,
      shown: 2,
      truncated: false,
    });

    const labels = queueLabels(queueCounts(page([failed]), page([blocked]), rows.length));
    expect(labels.map((l) => l.text)).toEqual(['1 bez karty', '1 zablokowana flagą']);
    expect(labels.map((l) => l.tone)).toEqual(['red', 'amber']);
  });

  it('pusta kolejka dostaje plakietkę ZIELONĄ — brak pozycji nie jest awarią', () => {
    expect(queueLabels(queueCounts(page([]), page([]), 0))).toEqual([
      { text: 'kolejka pusta', tone: 'green' },
    ]);
  });

  it('LICZY Z SERWERA, nie z listy po obcięciu — 137 dni bez karty to „137", nie „50"', () => {
    // ══ WADA, KTÓRA TO WYMUSIŁA ══
    // Liczniki powstawały z tablicy WIERSZY, czyli z sumy dwóch stron już przyciętych
    // `QUEUE_LIMIT`-em. Klub ze 137 dniami bez karty widział plakietkę „50", tabelę na
    // 50 wierszy i ani słowa o 87 schowanych — a `A05` na to samo pytanie odpowiadał
    // „137". Dwa ekrany, jedna baza, dwie liczby.
    const window = Array.from({ length: 50 }, (_, i) => item({ sessionUuid: `s-${i}` }));
    const counts = queueCounts(page(window, 137), page([blocked]), 51)!;

    expect(counts.failed).toBe(137);
    expect(counts.total).toBe(138);
    expect(counts.shown).toBe(51);
    expect(counts.truncated).toBe(true);
    expect(queueLabels(counts)[0]!.text).toBe('137 bez kart');
  });

  it('OBCIĘCIE jest widoczne — lista przycięta po cichu wygląda na komplet', () => {
    const counts = queueCounts(page(Array.from({ length: 50 }, (_, i) => item({ sessionUuid: `s-${i}` })), 137), page([]), 50)!;
    const notice = queueTruncationNotice(counts, 50)!;

    expect(notice).toContain('50 z 137');
    expect(notice).toContain('87 dni poza listą');
    // Zdanie ma powiedzieć, gdzie iść po resztę — inaczej jest samą złą wiadomością.
    expect(notice).toContain('monitorze eksportu');
  });

  it('kolejka mieszcząca się w limicie NIE dostaje zdania o obcięciu', () => {
    const counts = queueCounts(page([failed]), page([blocked]), 2);
    expect(queueTruncationNotice(counts, 50)).toBeNull();
  });

  it('BRAK ODCZYTU to nie jest pusta kolejka — plakietka mówi „brak odczytu"', () => {
    // Zielone „kolejka pusta" w trakcie pobierania wygląda dokładnie jak odpowiedź,
    // na którą się czeka — a jest jej brakiem. Ta sama reguła, co kreski zamiast zer.
    expect(queueCounts(undefined, page([]), 0)).toBeNull();
    expect(queueCounts(page([]), undefined, 0)).toBeNull();
    expect(queueLabels(null)).toEqual([{ text: 'brak odczytu', tone: 'dim' }]);
    expect(queueTruncationNotice(null, 50)).toBeNull();
  });

  it('stan pusty jest POTWIERDZENIEM i mówi, kiedy pozycje się pojawiają', () => {
    expect(queueEmpty().title).toContain('KARTĘ');
    expect(queueEmpty().note).toContain('pojawiają się same');
  });
});
