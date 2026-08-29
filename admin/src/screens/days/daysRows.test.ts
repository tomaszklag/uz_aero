/**
 * UZ Aero - panel: wiersz listy dni (moduł czysty).
 *
 * Testujemy REGUŁY, nie brzmienie napisów. Cztery z nich nie są widoczne w typach:
 *  • mapowanie NIE MA PRAWA przestawić kolejności (porządek należy do serwera),
 *  • motogodziny formatuje się WEDŁUG FORMATU LICZNIKA TEGO SAMOLOTU,
 *  • otwarta sesja pokazuje „-" w odczytach końcowych i niczego nie ekstrapoluje,
 *  • dwie zmiany tej samej maszyny w jednej dobie muszą dać się ODRÓŻNIĆ (§3.6a).
 */

import { describe, expect, it } from 'vitest';

import type { SessionListItemDto } from '../../api/dto';
import { dayRows } from './daysRows';

const NOW = Date.UTC(2026, 6, 31, 14, 22);
const minutesAgo = (m: number): string => new Date(NOW - m * 60_000).toISOString();

function day(over: Partial<SessionListItemDto> = {}): SessionListItemDto {
  return {
    sessionUuid: '7c1e5a9b-3d42-4f08-b6e1-9a2d0c5f83b4',
    aircraftId: 'SP-KLM',
    reg: 'SP-KLM',
    aircraftType: 'Cessna 208 Caravan',
    mhFormat: 'decimal',
    picId: 'AWR',
    picCode: 'AWR',
    picName: 'Anna Wrzosek',
    dualId: null,
    dualCode: null,
    dualName: null,
    status: 'closed',
    operation: 'skoki',
    client: 'SKY CAMP',
    claimedAt: Date.UTC(2026, 6, 30, 5, 45),
    closeTime: Date.UTC(2026, 6, 30, 13, 22),
    blockMs: (5 * 60 + 53) * 60_000,
    flightMs: (3 * 60 + 35) * 60_000,
    flightsCount: 9,
    mhStart: 3902.1,
    mhEnd: 3907.8,
    fuelStartL: 780,
    fuelEndL: 153,
    openFlags: [],
    exportRevision: 2,
    updatedAt: minutesAgo(24),
    ...over,
  };
}

describe('dayRows - porządek', () => {
  it('NIE SORTUJE - oddaje wiersze w kolejności, w której przyszły z serwera', () => {
    // Porządek jest własnością `ORDER BY` serwera i kursora keyset, który opisuje
    // pozycję w TYM porządku. Przesortowanie na kliencie przestawiłoby wiersze
    // wewnątrz przypadkowego wycinka, bo lista jest sklejona z kolejnych stron.
    const items = [
      day({ sessionUuid: 'b', claimedAt: Date.UTC(2026, 6, 28) }),
      day({ sessionUuid: 'a', claimedAt: Date.UTC(2026, 6, 31) }),
      day({ sessionUuid: 'c', claimedAt: null }),
    ];

    expect(dayRows(items, NOW).map((row) => row.sessionUuid)).toEqual(['b', 'a', 'c']);
  });
});

describe('dayRows - kolumna „Dzień"', () => {
  it('bierze datę z CHWILI PRZEJĘCIA, a podpis niesie CAŁY odcinek sesji', () => {
    expect(dayRows([day()], NOW)[0]!.day).toEqual({
      text: '30 JUL 2026',
      sub: '05:45 → 13:22',
    });

    expect(dayRows([day({ status: 'active', closeTime: null })], NOW)[0]!.day).toEqual({
      text: '30 JUL 2026',
      sub: '05:45 → trwa',
    });
  });

  it('dwie zmiany tej samej maszyny w jednej dobie są ROZRÓŻNIALNE', () => {
    // Po §3.6a to norma, a nie przypadek brzegowy: poranna i popołudniowa mają tę samą
    // rejestrację i tę samą datę w kolumnie „Dzień". Do etapu D podpis niósł sam koniec
    // („zamknięty 13:22"), więc sesja jeszcze trwająca nie mówiła o sobie NIC poza datą.
    const morning = day({
      sessionUuid: 'am',
      claimedAt: Date.UTC(2026, 6, 30, 5, 45),
      closeTime: Date.UTC(2026, 6, 30, 11, 2),
    });
    const afternoon = day({
      sessionUuid: 'pm',
      status: 'active',
      claimedAt: Date.UTC(2026, 6, 30, 12, 8),
      closeTime: null,
    });

    const rows = dayRows([morning, afternoon], NOW);
    expect(rows[0]!.day.text).toBe(rows[1]!.day.text);
    expect(rows[0]!.day.sub).toBe('05:45 → 11:02');
    expect(rows[1]!.day.sub).toBe('12:08 → trwa');
  });

  it('sesja bez claimu NIE MA daty i mówi to wprost', () => {
    // Wywnioskowanie daty z `closeTime` albo z pierwszego zdarzenia byłoby zgadywaniem
    // - i rozjechałoby się z filtrem zakresu, który takich sesji po prostu nie widzi.
    const row = dayRows([day({ claimedAt: null })], NOW)[0]!;
    expect(row.day.text).toBe('-');
    expect(row.day.sub).toContain('bez claimu');
  });
});

describe('dayRows - motogodziny', () => {
  it('formatuje WEDŁUG `mhFormat` samolotu, nie własną konwencją', () => {
    // Ta sama liczba w bazie (godziny dziesiętne), dwa różne liczniki w kabinie.
    const decimal = dayRows([day({ mhFormat: 'decimal', mhStart: 3902.1, mhEnd: 3907.8 })], NOW)[0]!;
    expect(decimal.mh.text).toBe('3902.1 → 3907.8');
    expect(decimal.mh.sub).toBe('licznik dziesiętny');

    const hhmm = dayRows([day({ mhFormat: 'hhmm', mhStart: 645.1, mhEnd: 646.4 })], NOW)[0]!;
    expect(hhmm.mh.text).toBe('645:06 → 646:24');
    expect(hhmm.mh.sub).toBe('licznik hh:mm');
  });

  it('brak formatu przyznaje się do NIEWIEDZY, choć liczbę i tak pokazuje', () => {
    // `motoHours(x, null)` wypisuje dziesiętnie, bo czymś musi. Podpis odróżnia
    // ten przypadek od samolotu z licznikiem dziesiętnym - administrator porównujący
    // wartość z licznikiem ma prawo wiedzieć, który właśnie ogląda.
    const row = dayRows([day({ mhFormat: null })], NOW)[0]!;
    expect(row.mh.sub).toBe('format licznika nieznany');
  });

  it('dzień otwarty ma „-" po strzałce - panel nie ekstrapoluje odczytu końcowego', () => {
    const row = dayRows([day({ status: 'active', mhEnd: null, fuelEndL: null })], NOW)[0]!;
    expect(row.mh.text).toBe('3902.1 → -');
    expect(row.fuel).toBe('780 L → -');
  });
});

describe('dayRows - kolumna „Stan"', () => {
  it('otwarta flaga wygrywa z KAŻDYM innym stanem, także z „wyeksportowany"', () => {
    // Dzień z rozbieżnością jest sprawą dla człowieka niezależnie od tego, czy karta
    // poszła do arkusza.
    const row = dayRows([day({ openFlags: ['mh_gap', 'clock_drift'], exportRevision: 1 })], NOW)[0]!;

    expect(row.state).toEqual({
      tone: 'amber',
      text: '2 flagi',
      dot: true,
      sub: 'mh_gap · clock_drift',
    });
    expect(row.flagged).toBe(true);
  });

  it('odmienia liczbę flag po polsku', () => {
    const of = (n: number) =>
      dayRows([day({ openFlags: Array.from({ length: n }, () => 'mh_gap' as const) })], NOW)[0]!.state
        .text;

    expect(of(1)).toBe('1 flaga');
    expect(of(2)).toBe('2 flagi');
    expect(of(5)).toBe('5 flag');
  });

  it('sesja bez `day_close` to „Samolot zajęty", NIGDY „W locie" ani „Dzień otwarty"', () => {
    // Dwa osobne sprostowania w jednym napisie. Projekcja niesie `status`, nie niesie
    // „silnik pracuje", więc „W locie" kłamałoby o maszynie stojącej na płycie. A po
    // §3.6a otwarta jest SESJA jednej maszyny, nie dzień: ten sam pilot może w tej
    // samej służbie zdać ją i wziąć następną.
    const row = dayRows([day({ status: 'active', closeTime: null, exportRevision: null })], NOW)[0]!;

    expect(row.state.text).toBe('Samolot zajęty');
    expect(row.state.tone).toBe('blue');
    // Świeżość podana WZGLĘDNIE - administrator ocenia, czy dane są aktualne,
    // a nie o której dotarły.
    expect(row.state.sub).toBe('dane w drodze · sync 24 min temu');
  });

  it('stempel syncu nie do odczytania mówi to wprost zamiast „NaN"', () => {
    const row = dayRows([day({ status: 'active', updatedAt: 'nie-data' })], NOW)[0]!;
    expect(row.state.sub).toBe('dane w drodze · czas ostatniego syncu nieznany');
  });

  it('sesja zdana rozróżnia kartę arkusza od jej braku', () => {
    expect(dayRows([day({ exportRevision: 2 })], NOW)[0]!.state).toEqual({
      tone: 'green',
      text: 'Wyeksportowany',
      dot: false,
      sub: 'rewizja 2',
    });

    expect(dayRows([day({ exportRevision: null })], NOW)[0]!.state).toMatchObject({
      tone: 'dim',
      text: 'Samolot zdany',
      sub: 'bez karty arkusza',
    });
  });
});

describe('dayRows - reszta kolumn', () => {
  it('czasy dnia mają WIODĄCE ZERO, tak jak karta arkusza tego samego dnia', () => {
    // Kolumna „Blok" i wyeksportowana karta opisują tę samą wielkość; różnica zapisu
    // („2:14" vs „02:14") byłaby rozjazdem widocznym na sąsiednich ekranach.
    const row = dayRows([day({ blockMs: 2 * 3_600_000 + 14 * 60_000, flightMs: 46 * 60_000 })], NOW)[0]!;
    expect(row.block).toBe('02:14');
    expect(row.flight).toBe('00:46');
  });

  it('załoga: PIC z nazwiska, pod nim kod i skrócony Dual', () => {
    const row = dayRows([day({ dualId: 'KNO', dualCode: 'KNO', dualName: 'Karolina Nowak' })], NOW)[0]!;
    expect(row.crew).toEqual({ pic: 'Anna Wrzosek', sub: 'AWR · dual: K. Nowak' });

    expect(dayRows([day()], NOW)[0]!.crew.sub).toBe('AWR · dual: -');
  });

  it('samolot spoza rejestru floty zostaje widoczny z identyfikatorem zamiast rejestracji', () => {
    // `LEFT JOIN` po stronie serwera jest celowy: sesja samolotu, który zniknął
    // z `aircraft`, ma zostać na liście, a nie wypaść z niej po cichu.
    const row = dayRows([day({ reg: null, aircraftType: null })], NOW)[0]!;
    expect(row.aircraft).toEqual({ reg: 'SP-KLM', type: null });
  });

  it('sesja bez zadeklarowanej operacji nie dostaje plakietki „inne"', () => {
    // Brak `preflight_confirm` znaczy „pilot nie powiedział", a nie „operacja inna".
    expect(dayRows([day({ operation: null })], NOW)[0]!.operation).toBeNull();
    expect(dayRows([day({ operation: 'skoki' })], NOW)[0]!.operation).toEqual({
      tone: 'blue',
      badge: 'SKOKI',
      client: 'SKY CAMP',
    });
  });
});
