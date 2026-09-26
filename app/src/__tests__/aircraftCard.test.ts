/**
 * Ninerdeck - testy KARTY MASZYNY (obserwowanie 3.2.0, ekran 27; §6.3).
 *
 * Pod obserwacją: siedem zdań herosa i ich ton, „wg zapisów, które dotarły do …",
 * własny termin z szewronem, cudza operacja bez, odczyty z kreską zamiast zera,
 * „zgodnie z rezerwacją" liczone z listy terminów.
 */

import type { RemoteAircraftCard, RemoteAircraftOperation, RemoteAircraftUpcoming } from '../application';
import {
  aircraftCardVm,
  historyLabel,
  operationRows,
  readingsLine,
  untilLabel,
  upcomingLabel,
  watchVm,
} from '../ui/screens/logic/aircraftCard';

const H = 3_600_000;
const DAY = 24 * H;
// Piątek 25 września 2026, 09:54 UTC (11:54 czasu klubu, UTC+2).
const NOW = Date.UTC(2026, 8, 25, 9, 54);
const iso = (t: number): string => new Date(t).toISOString();

/** Doba klubu, której północ lokalna to `startsAt` (22:00 UTC dnia poprzedniego). */
const dayAt = (startsAt: number) => ({
  date: new Date(startsAt + 2 * H).toISOString().slice(0, 10),
  startsAt: iso(startsAt),
  endsAt: iso(startsAt + DAY),
});
const TODAY = Date.parse('2026-09-24T22:00:00Z');

const NAMES: Record<string, string> = { ako: 'Adam Kowalski', jwr: 'Jakub Wrona', mzi: 'Marta Zięba' };
const opts = { now: NOW, pilotId: 'me', nameOf: (id: string) => NAMES[id] ?? null };

function upcoming(over: Partial<RemoteAircraftUpcoming> = {}): RemoteAircraftUpcoming {
  return {
    id: 'b1',
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: iso(TODAY + 8 * H),
    endsAt: iso(TODAY + 12 * H),
    pilotId: 'ako',
    blockReason: null,
    day: dayAt(TODAY),
    ...over,
  };
}

function card(over: Partial<RemoteAircraftCard> = {}): RemoteAircraftCard {
  return {
    timezone: 'Europe/Warsaw',
    aircraft: { id: 'a1', reg: 'SP-AXA', type: 'Cessna 172', serviceStatus: 'active', capacityL: 180, mhFormat: 'hhmm', oilMinL: 6 },
    now: { kind: 'free', next: null },
    lastRecordAt: iso(NOW - 14 * 60_000),
    counters: { mh: 1236.5, fuelL: 168, oilL: 8.2, at: iso(Date.UTC(2026, 8, 25, 8, 4)), source: 'open_session', byPilotId: 'ako', enteredBy: null },
    lastFlightAt: iso(NOW - 2 * H),
    last30: { daysWithFlights: 11, takeoffs: 38, blockMs: (26 * 60 + 15) * 60_000, flightMs: (21 * 60 + 40) * 60_000 },
    last90: { daysWithFlights: 29, takeoffs: 104, blockMs: (38 * 60 + 10) * 60_000, flightMs: (31 * 60 + 5) * 60_000 },
    upcoming: [],
    series: { mh: [], fuel: [] },
    watching: true,
    viewer: { watch: true },
    ...over,
  };
}

describe('hero - siedem zdań', () => {
  it('w locie: pilot, zadanie i lotnisko, czas silnika zegarem, „zgodnie z rezerwacją" z listy terminów', () => {
    const vm = aircraftCardVm(
      card({
        // Uruchomienie 08:12 UTC = 10:12 czasu klubu, w środku rezerwacji 08-12 klubu.
        now: { kind: 'flying', sessionUuid: 's1', pilotId: 'ako', dualId: null, operation: 'skoki', departureIcao: 'EPBK', since: iso(Date.UTC(2026, 8, 25, 8, 12)) },
        upcoming: [upcoming()],
      }),
      opts,
    );
    expect(vm.hero).toMatchObject({
      tone: 'green',
      badge: 'W locie',
      main: 'A. Kowalski',
      small: 'skoki · EPBK',
      zone: 'uruchomienie',
      zoneValue: '08:12 UTC',
      count: '1:42 SILNIKA',
      after: '· zgodnie z rezerwacją 08-12',
      note: 'wg zapisów, które dotarły do 09:40 UTC',
    });
  });

  it('w locie BEZ rezerwacji pilota na tę godzinę - „poza planem"', () => {
    const vm = aircraftCardVm(
      card({
        now: { kind: 'flying', sessionUuid: 's1', pilotId: 'jwr', dualId: null, operation: null, departureIcao: null, since: iso(TODAY + 8 * H) },
        upcoming: [upcoming()],
      }),
      opts,
    );
    expect(vm.hero.after).toBe('· poza planem');
    expect(vm.hero.small).toBeNull();
  });

  it('wolna: „Stoi w hangarze" od ostatniego odczytu, następny termin i ostatni zapis pod kreską', () => {
    const vm = aircraftCardVm(
      card({
        now: { kind: 'free', next: { bookingId: 'b2', kind: 'flight', startsAt: iso(TODAY + 14 * H) } },
        counters: { mh: 1236.5, fuelL: 168, oilL: null, at: iso(Date.UTC(2026, 8, 24, 18, 20)), source: 'handover', byPilotId: 'me', enteredBy: null },
        upcoming: [upcoming({ id: 'b2', pilotId: 'me', startsAt: iso(TODAY + 14 * H), endsAt: iso(TODAY + 16 * H) })],
        watching: false,
      }),
      opts,
    );
    expect(vm.hero).toMatchObject({
      tone: 'off',
      badge: 'Wolna',
      badgeTone: 'dim',
      main: 'Stoi w hangarze',
      small: 'od wczoraj 18:20',
      zone: 'następny termin',
      zoneValue: 'dziś 14:00-16:00 · Ty',
      count: null,
      note: 'ostatni zapis: zdanie samolotu, wczoraj 18:20 UTC',
    });
    expect(vm.watch).toEqual({ on: false, title: 'Obserwuj', sub: 'Powiadomienia o lotach tej maszyny.' });
  });

  it('wyłączona z użytku: powód po polsku, koniec czasem klubu, „ZA 4 DNI"', () => {
    const start = TODAY + 4 * DAY;
    const vm = aircraftCardVm(
      card({
        now: { kind: 'blocked', bookingId: 'blk', reason: 'maintenance', until: iso(start + 3 * DAY + 18 * H) },
        upcoming: [upcoming({ id: 'blk', kind: 'block', pilotId: null, blockReason: 'maintenance', startsAt: iso(start), endsAt: iso(start + 3 * DAY + 18 * H), day: dayAt(start) })],
      }),
      { ...opts, now: start + 2 * H },
    );
    expect(vm.hero).toMatchObject({
      tone: 'amber',
      badge: 'Wyłączona z użytku',
      main: 'Przegląd',
      small: '29 WRZ - 02 PAŹ',
      zone: 'wraca',
      zoneValue: '02 PAŹ 18:00 czasu klubu',
      count: 'ZA 3 DNI',
    });
  });

  it('zarezerwowana i wycofana; przejęta bez uruchomienia i po locie mówią swoimi etykietami', () => {
    const booked = aircraftCardVm(
      card({ now: { kind: 'booked', bookingId: 'b1', pilotId: 'ako', startsAt: iso(TODAY + 8 * H), endsAt: iso(TODAY + 12 * H) }, upcoming: [upcoming()] }),
      opts,
    ).hero;
    // Godziny CZASEM KLUBU (UTC+2): 06:00-10:00 UTC to 08:00-12:00.
    expect(booked).toMatchObject({ tone: 'blue', badge: 'Zarezerwowana', main: 'A. Kowalski', small: '08:00-12:00', count: 'DO 12:00' });

    expect(aircraftCardVm(card({ now: { kind: 'retired' } }), opts).hero).toMatchObject({ tone: 'off', main: 'Wycofana z użytku' });

    const claimed = aircraftCardVm(
      card({ now: { kind: 'claimed', sessionUuid: 's1', pilotId: 'ako', dualId: null, operation: 'ferry', departureIcao: null, since: iso(NOW - 12 * 60_000) } }),
      opts,
    ).hero;
    expect(claimed).toMatchObject({ badge: 'Przejęta', zone: 'przejęcie', small: 'przelot', count: null });

    const after = aircraftCardVm(
      card({ now: { kind: 'after_flight', sessionUuid: 's1', pilotId: 'ako', dualId: null, operation: null, departureIcao: null, since: iso(NOW - 25 * 60_000) } }),
      opts,
    ).hero;
    expect(after).toMatchObject({ badge: 'Po locie', zone: 'wyłączenie', count: '0:25 BEZ ZDANIA' });
  });

  it('pusty rejestr mówi to wprost zamiast udawać godzinę', () => {
    expect(aircraftCardVm(card({ lastRecordAt: null, counters: null }), opts).hero.note).toBe('rejestr tej maszyny jest jeszcze pusty');
  });

  it('„ZA …" liczy dni, potem godziny, potem minuty; termin miniony to brak licznika', () => {
    expect(untilLabel(NOW + 4 * DAY + H, NOW)).toBe('ZA 4 DNI');
    expect(untilLabel(NOW + DAY, NOW)).toBe('ZA 1 DZIEŃ');
    expect(untilLabel(NOW + 3 * H, NOW)).toBe('ZA 3 H');
    expect(untilLabel(NOW + 25 * 60_000, NOW)).toBe('ZA 25 MIN');
    expect(untilLabel(NOW - 1, NOW)).toBeNull();
  });
});

describe('liczniki, terminy, sumy', () => {
  it('liczniki ze źródłem i podpisem osoby; olej z przecinkiem; brak = kreska', () => {
    const vm = aircraftCardVm(card(), opts);
    expect(vm.title).toBe('SP-AXA');
    expect(vm.sub).toBe('Cessna 172 · w użytku · zbiornik 180 L');
    expect(vm.counters.map((r) => [r.label, r.value, r.sub])).toEqual([
      ['Motogodziny', '1236:30', null],
      ['Paliwo', '168 L', '· zbiornik 180 L'],
      ['Olej', '8,2 L', '· minimum 6,0 L'],
      ['Odczyt z', '25 WRZ 08:04', 'operacja w toku, A. Kowalski'],
    ]);
    expect(aircraftCardVm(card({ counters: null }), opts).counters.map((r) => r.value)).toEqual(['—', '—', '—', '—']);
  });

  it('terminy: trwający „· trwa", własny z szewronem i „potwierdzona", wyłączenie bursztynem, dalszy datą', () => {
    const vm = aircraftCardVm(
      card({
        upcoming: [
          upcoming(),
          upcoming({ id: 'b2', pilotId: 'me', startsAt: iso(TODAY + DAY + 14 * H), endsAt: iso(TODAY + DAY + 16 * H), day: dayAt(TODAY + DAY) }),
          upcoming({ id: 'b3', pilotId: 'mzi', startsAt: iso(TODAY + 2 * DAY + 7.5 * H), endsAt: iso(TODAY + 2 * DAY + 9 * H), day: dayAt(TODAY + 2 * DAY) }),
          upcoming({ id: 'blk', kind: 'block', pilotId: null, blockReason: 'maintenance', startsAt: iso(TODAY + 4 * DAY), endsAt: iso(TODAY + 7 * DAY + 18 * H), day: dayAt(TODAY + 4 * DAY) }),
        ],
      }),
      opts,
    );
    expect(vm.upcoming.map((r) => [r.label, r.value, r.sub, r.bookingId, r.tone ?? null])).toEqual([
      ['Dziś 08-12', 'Adam Kowalski', '· trwa', null, null],
      ['Jutro 14-16', 'Ty', '· potwierdzona', 'b2', null],
      ['27 WRZ 07:30', 'Marta Zięba', null, null, null],
      ['29 WRZ - 02 PAŹ', 'Wyłączona z użytku', 'przegląd', null, 'amber'],
    ]);
    expect(upcomingLabel(upcoming({ status: 'pending' }), NOW)).toBe('Dziś 08-12');
  });

  it('sumy okien - ta sama trójka, co 26B, plus 90 dni', () => {
    const vm = aircraftCardVm(card(), opts);
    expect(vm.sums).toEqual([
      { label: '30 dni', line1: '11 dni z lotami · 38 startów', line2: '26:15 silnika · 21:40 lotu' },
      { label: '90 dni', line1: '29 dni z lotami · 104 starty', line2: '38:10 silnika · 31:05 lotu' },
    ]);
  });

  it('przełącznik: włączony wymienia pięć zdarzeń, wyłączony mówi jednym słowem, co zrobi tapnięcie', () => {
    expect(watchVm(true).title).toBe('Obserwujesz');
    expect(watchVm(true).sub).toContain('nieodebrana rezerwacja');
    expect(watchVm(false).title).toBe('Obserwuj');
  });
});

describe('historia', () => {
  const op = (over: Partial<RemoteAircraftOperation> = {}): RemoteAircraftOperation => ({
    sessionUuid: 'op1',
    at: iso(NOW - 2 * DAY + 4 * H + 8 * 60_000),
    pilotId: 'me',
    dualId: null,
    operation: 'ferry',
    status: 'closed',
    manualEntry: false,
    flights: 1,
    blockMs: 116 * 60_000,
    flightMs: 91 * 60_000,
    mhStart: 1234.8,
    mhEnd: 1236.5,
    fuelStartL: 128,
    fuelEndL: 168,
    fuelAddedL: 96,
    ...over,
  });

  it('zamknięta operacja: godziny od-do, kto i co, odczyty z obu stron, własna ma szewron', () => {
    const [row] = operationRows([op()], 'hhmm', opts);
    expect(row).toEqual({
      sessionUuid: 'op1',
      hours: '23 WRZ 14:02-15:58',
      who: 'Ty · Przelot',
      readings: '1234:48 → 1236:30 · 128 → 168 L · +96 L',
      nums: ['1', '1:56', '1:31'],
      mine: true,
    });
  });

  it('operacja w toku: „DZIŚ 08:12 →", „w toku" i kreski zamiast odczytów końcowych; cudza bez szewronu', () => {
    const [row] = operationRows(
      [op({ sessionUuid: 'live', at: iso(Date.UTC(2026, 8, 25, 8, 12)), pilotId: 'ako', operation: 'skoki', status: 'active', flights: 3, blockMs: 102 * 60_000, flightMs: 65 * 60_000, mhStart: 1236.5, mhEnd: null, fuelStartL: 168, fuelEndL: null, fuelAddedL: null })],
      'hhmm',
      opts,
    );
    expect(row).toMatchObject({ hours: 'DZIŚ 08:12 →', who: 'w toku · A. Kowalski · Skoki', readings: '1236:30 → — · 168 → — L', nums: ['3', '1:42', '1:05'], mine: false });
    expect(readingsLine(op({ mhStart: null, fuelStartL: null, fuelAddedL: 0 }), 'hhmm')).toBe('— → 1236:30 · — → 168 L');
  });

  it('podpis sekcji odmienia liczbę operacji', () => {
    expect(historyLabel(218)).toBe('218 operacji · UTC');
    expect(historyLabel(3)).toBe('3 operacje · UTC');
    expect(historyLabel(1)).toBe('1 operacja · UTC');
  });
});
