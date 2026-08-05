/**
 * UZ Aero — panel: kafle i karty karty dnia (moduł czysty).
 *
 * Najważniejsza reguła tego pliku nie jest widoczna w typach: **dzień otwarty pokazuje
 * „—" i nic poza tym.** Sesja bez `day_close` nie ma odczytów końcowych, więc nie ma
 * zużycia paliwa, delty motogodzin ani czasu służby — a panel nie ekstrapoluje ich ani
 * z ostatniego odczytu, ani z tempa dnia, ani z „teraz".
 */

import type { SessionState } from '@uzaero/domain';
import { describe, expect, it } from 'vitest';

import type { SessionListItemDto, TimelineEntryDto } from '../../api/dto';
import { dayTiles, dropRows, fuelRows, mhRows, sessionRows } from './daySummary';

const DAY = Date.UTC(2026, 6, 30);
const NOW = Date.UTC(2026, 6, 31, 14, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

/** Dzień kanoniczny z `A02a`: trzy cykle silnika, dziewięć lotów, zamknięty. */
function closedState(over: Partial<SessionState> = {}): SessionState {
  return {
    sessionUuid: 'sess-1',
    aircraftId: 'SP-KLM',
    picId: 'AWR',
    dualId: null,
    sessionPicId: 'AWR',
    operation: 'skoki',
    departureIcao: 'EPRA',
    arrivalIcao: 'EPRA',
    client: 'SKY CAMP',
    mhFormat: 'decimal',
    dutyStart: at(5, 45),
    dutyEnd: at(13, 20),
    engineRunning: false,
    inFlight: false,
    // Doszło do `SessionState` razem z detekcją kołowania — dzień zamknięty nie kołuje.
    taxiing: false,
    openEngineStartAt: null,
    openTakeoffAt: null,
    engineRuns: [
      { startedAt: at(6, 31), stoppedAt: at(8, 41), durationMs: (2 * 60 + 10) * 60_000 },
      { startedAt: at(9, 12), stoppedAt: at(11, 38), durationMs: (2 * 60 + 26) * 60_000 },
      { startedAt: at(11, 56), stoppedAt: at(13, 13), durationMs: (60 + 17) * 60_000 },
    ],
    blockTimeMs: (5 * 60 + 53) * 60_000,
    flights: [],
    flightTimeMs: (3 * 60 + 35) * 60_000,
    takeoffCount: 9,
    landingCount: 9,
    fuel: { startL: 780, addedL: 379, endL: 153, consumedL: 1006, lastReadingL: 153 },
    mh: { start: 3902.1, end: 3907.8, deltaH: 5.7 },
    drops: {
      count: 9,
      jumpers: { tandem: 21, aff: 9, solo: 17 },
      totalJumpers: 47,
      // Osiem z dziewięciu zrzutów miało fix — średnia liczy się WYŁĄCZNIE z nich.
      altitudeSumFt: 102850,
      altitudeFixCount: 8,
      avgAltitudeFt: 12856.25,
    },
    closed: true,
    closedAt: at(13, 22),
    eventCount: 82,
    eventIndex: {},
    lastEventAt: at(13, 22),
    ...over,
  };
}

/** Ten sam dzień PRZED zamknięciem: brak odczytów końcowych, jeden cykl trwa. */
const openState = (): SessionState =>
  closedState({
    dutyEnd: null,
    engineRunning: true,
    openEngineStartAt: at(11, 56),
    fuel: { startL: 780, addedL: 379, endL: null, consumedL: null, lastReadingL: 788 },
    mh: { start: 3902.1, end: null, deltaH: null },
    closed: false,
    closedAt: null,
  });

const session = (over: Partial<SessionListItemDto> = {}): SessionListItemDto =>
  ({
    sessionUuid: 'sess-1',
    reg: 'SP-KLM',
    aircraftId: 'SP-KLM',
    mhFormat: 'decimal',
    exportRevision: 2,
    updatedAt: new Date(NOW - 24 * 60_000).toISOString(),
    ...over,
  }) as unknown as SessionListItemDto;

const tile = (state: SessionState, label: string, mhFormat: 'decimal' | 'hhmm' | null = 'decimal') =>
  dayTiles(state, mhFormat).find((t) => t.label === label)!;

const row = (rows: { label: string; value: string }[], label: string) =>
  rows.find((r) => r.label === label)!;

describe('dayTiles — dzień zamknięty', () => {
  it('przepisuje liczby projekcji, formatując je z wiodącym zerem', () => {
    expect(tile(closedState(), 'Czas blokowy').value).toBe('05:53');
    expect(tile(closedState(), 'Czas lotu').value).toBe('03:35');
  });

  it('czas służby to UPŁYW między meldunkiem a przekazaniem', () => {
    // `SessionState` nie ma pola `dutyMs`, bo duty nie wchodzi do żadnego bilansu.
    // Odjęcie dwóch stempli jest tego samego rodzaju działaniem, co wiek sprawy
    // w skrzynce flag — prezentacją, nie drugą wersją liczby dnia.
    const duty = tile(closedState(), 'Czas służby (duty)');
    expect(duty.value).toBe('07:35');
    expect(duty.note).toContain('05:45:00 → 13:20:00 UTC');
  });

  it('bilans startów i lądowań ma TON, bo to on jest treścią kafla', () => {
    expect(tile(closedState(), 'Starty / lądowania')).toMatchObject({ value: '9 / 9', tone: 'green' });

    const broken = tile(closedState({ landingCount: 8 }), 'Starty / lądowania');
    expect(broken).toMatchObject({ value: '9 / 8', tone: 'amber' });
    expect(broken.note).toContain('NIE domyka');
  });

  it('liczy cykle silnika po polsku i wyróżnia cykl TRWAJĄCY', () => {
    expect(tile(closedState(), 'Czas blokowy').note).toContain('3 cykle silnika');
    // Cykl otwarty nie wchodzi do sumy — projekcja liczy tylko zamknięte.
    expect(tile(openState(), 'Czas blokowy').note).toContain('+ 1 trwający (nie wchodzi do sumy)');
  });
});

describe('dayTiles — DZIEŃ OTWARTY: „—" i nic poza tym', () => {
  it('paliwo zużyte, delta MH i czas służby są puste, a przypis mówi co je wypełni', () => {
    const open = openState();

    expect(tile(open, 'Paliwo zużyte').value).toBe('—');
    expect(tile(open, 'Paliwo zużyte').note).toContain('day_close');

    expect(tile(open, 'Δ motogodzin').value).toBe('—');
    expect(tile(open, 'Δ motogodzin').note).toContain('odczytu końcowego');

    const duty = tile(open, 'Czas służby (duty)');
    expect(duty.value).toBe('—');
    expect(duty.note).toContain('koniec poda');
  });

  it('to, co JUŻ dotarło, pokazuje normalnie — otwarty ≠ niekompletny', () => {
    // Sumy dnia otwartego są prawdziwe: opisują to, co przyszło. Ukrycie ich byłoby
    // drugim rodzajem kłamstwa, obok ekstrapolacji.
    expect(tile(openState(), 'Czas blokowy').value).toBe('05:53');
    expect(tile(openState(), 'Starty / lądowania').value).toBe('9 / 9');
  });

  it('NIE ma kafla „Średnie zużycie" — projekcja nie liczy tej wielkości', () => {
    // Policzenie go w panelu (zużycie ÷ czas blokowy) byłoby pierwszą liczbą
    // na ekranie, której serwer nigdy nie wysłał.
    expect(dayTiles(closedState(), 'decimal').map((t) => t.label)).not.toContain('Średnie zużycie');
  });
});

describe('dayTiles — motogodziny wg formatu licznika', () => {
  it('delta idzie w formacie TEGO samolotu, a jednostka za nią', () => {
    const decimal = tile(closedState(), 'Δ motogodzin', 'decimal');
    expect(decimal.value).toBe('5.7');
    expect(decimal.unit).toBe('h');

    // Przy liczniku hh:mm delta czyta się „5:42" i dopisek „h" byłby wtedy szumem.
    const hhmm = tile(closedState(), 'Δ motogodzin', 'hhmm');
    expect(hhmm.value).toBe('5:42');
    expect(hhmm.unit).toBeUndefined();
  });
});

describe('mhRows', () => {
  it('formatuje odczyty licznika wg `mhFormat`, nie własną konwencją', () => {
    const rows = mhRows(closedState({ mh: { start: 645.1, end: 646.4, deltaH: 1.3 } }), 'hhmm');
    expect(row(rows, 'Początek').value).toBe('645:06');
    expect(row(rows, 'Koniec').value).toBe('646:24');
    expect(row(rows, 'Format licznika').value).toBe('hh:mm');
  });

  it('brak formatu PRZYZNAJE SIĘ do niewiedzy, choć liczbę pokazuje', () => {
    const rows = mhRows(closedState(), null);
    expect(row(rows, 'Początek').value).toBe('3902.1');
    expect(row(rows, 'Format licznika').value).toContain('nieznany');
  });

  it('dzień otwarty ma pusty koniec i pustą deltę', () => {
    const rows = mhRows(openState(), 'decimal');
    expect(row(rows, 'Koniec').value).toBe('—');
    expect(row(rows, 'Delta').value).toBe('—');
  });
});

describe('fuelRows', () => {
  it('dzień zamknięty domyka bilans, otwarty — nie', () => {
    expect(row(fuelRows(closedState()), 'Zużyte').value).toBe('1006 L');
    expect(row(fuelRows(openState()), 'Zużyte').value).toBe('—');
    // Ostatni odczyt ŻYJE w trakcie dnia (np. po tankowaniu) i to nie to samo,
    // co odczyt końcowy z przekazania.
    expect(row(fuelRows(openState()), 'Ostatni odczyt').value).toBe('788 L');
    expect(row(fuelRows(openState()), 'Końcowe').value).toBe('—');
  });
});

describe('dropRows', () => {
  it('średnią wysokość zaokrągla do pełnych stóp — GPS nie ma tam ułamków', () => {
    expect(row(dropRows(closedState()), 'Śr. wysokość').value).toBe('12856');
  });

  it('brak wysokości w ogóle (żaden zrzut jej nie miał) to „—", nie zero', () => {
    const state = closedState({
      drops: {
        count: 2,
        jumpers: { tandem: 1, aff: 0, solo: 1 },
        totalJumpers: 2,
        altitudeSumFt: 0,
        altitudeFixCount: 0,
        avgAltitudeFt: null,
      },
    });
    expect(row(dropRows(state), 'Śr. wysokość').value).toBe('—');
  });
});

describe('sessionRows', () => {
  const timeline: TimelineEntryDto[] = [];

  it('dzień otwarty nie udaje zamknięcia i nie ma karty arkusza', () => {
    const rows = sessionRows(session({ exportRevision: null }), openState(), timeline, NOW);
    expect(row(rows, 'Zamknięcie').value).toBe('dzień trwa');
    expect(row(rows, 'Karta arkusza').value).toBe('brak');
    // Wiek zamknięcia nie istnieje, dopóki nie ma zamknięcia.
    expect(rows.some((r) => r.label === 'Zamknięty przed')).toBe(false);
  });

  it('dzień zamknięty podaje stempel UTC i WIEK, ale nie odlicza okna korekty', () => {
    // Próg doby jest wartością domeny (`rules/tolerances.ts`), a panelowi wolno
    // importować z domeny wyłącznie typy — kopia progu tutaj rozjechałaby się po cichu
    // z regułą, którą serwer naprawdę egzekwuje przy zapisie.
    const rows = sessionRows(session(), closedState(), timeline, NOW);
    expect(row(rows, 'Zamknięcie').value).toBe('30 JUL 2026 13:22:00');
    expect(row(rows, 'Zamknięty przed').value).toBe('1 dzień 1 h');
    expect(row(rows, 'Karta arkusza').value).toBe('rewizja 2');
  });

  it('nieczytelny stempel paczki mówi „—" zamiast „NaN"', () => {
    const rows = sessionRows(session({ updatedAt: 'nie-data' }), closedState(), timeline, NOW);
    expect(row(rows, 'Ostatnia paczka').value).toBe('—');
  });
});
