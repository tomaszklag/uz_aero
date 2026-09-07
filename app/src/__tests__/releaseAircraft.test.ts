/**
 * UZ Aero - model widoku ekranu 09B/09C „Zdaj samolot".
 *
 * Test pilnuje czterech rzeczy, na których stoi ten ekran: rozpoznania wariantu
 * (są wzloty czy nie), podpowiedzi liczonych z wartości WPISYWANEJ (projekcja nie zna
 * ich przed `day_close`), rozliczenia sesji i - przede wszystkim - blokady zapisu.
 * Odczyt jest tu WYMAGANY (§3.6) i to jest jedyne miejsce w nowym flow, gdzie tak jest.
 */

import {
  RELEASE_CTA,
  buildRelease,
  consumedL,
  finalFuelHint,
  finalMhHint,
  releaseBlocker,
  releasePayload,
} from '../ui/screens/logic/releaseAircraft';
import { emptySessionState } from '../domain';
import type { ConsumptionNorm, Event, EventPayloadMap, EventType, Leg, SessionState } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0);

const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
};

let seq = 0;

function ev<K extends EventType>(type: K, time: string, payload: EventPayloadMap[K]): Event {
  return {
    uuid: `e-${++seq}-${type}`,
    sessionUuid: 's-klm',
    aircraftId: 'SP-KLM',
    picId: 'tmk',
    dualId: null,
    type,
    payload,
    deviceTime: at(time),
    gpsTime: at(time),
    schemaVersion: 2,
    syncedAt: null,
  } as Event;
}

let legSeq = 0;

function leg(from: string, to: string, over: Partial<Leg> = {}): Leg {
  return {
    index: ++legSeq,
    startedAt: at(from),
    stoppedAt: at(to),
    durationMs: at(to) - at(from),
    ...over,
  };
}

/** Sesja z mockupu 09B: SP-KLM, jeden bieg 13:40 → 15:10 z lotem 13:47 → 15:08. */
function session(over: Partial<SessionState> = {}): SessionState {
  return {
    ...emptySessionState(),
    sessionUuid: 's-klm',
    aircraftId: 'SP-KLM',
    sessionPicId: 'tmk',
    operation: 'ferry',
    mhFormat: 'hhmm',
    claimedAt: at('13:35'),
    mh: { start: 1239.65, end: null, deltaH: null },
    fuel: { startL: 96, addedL: 0, endL: null, consumedL: null, lastReadingL: 96 },
    legs: [leg('13:40', '15:10')],
    flights: [
      {
        index: 1,
        method: 'auto',
        takeoffAt: at('13:47'),
        landingAt: at('15:08'),
        durationMs: at('15:08') - at('13:47'),
        takeoffUuid: 't-1',
        landingUuid: 'l-1',
      },
    ],
    blockTimeMs: at('15:10') - at('13:40'),
    flightTimeMs: at('15:08') - at('13:47'),
    ...over,
  };
}

/** Norma SP-KLM z mockupu 09B: pasmo 20–24 L/h. */
const norm = (over: Partial<ConsumptionNorm> = {}): ConsumptionNorm => ({
  windowDays: 90,
  blockLPerHLow: 20,
  blockLPerHHigh: 24,
  blockLPerH: 22,
  airLPerH: 26,
  groundLPerH: 11,
  litersPerFlight: 30,
  fuelRatioLow: 0.9,
  fuelRatioHigh: 1.1,
  mh: null,
  intervals: 40,
  engineMs: 90 * 3_600_000,
  computedAt: at('12:00'),
  ...over,
});

beforeEach(() => {
  seq = 0;
  legSeq = 0;
});

describe('buildRelease - który wariant i co wiemy', () => {
  it('operacja z biegiem to 09B: pasek wyniku, przegląd lotów i godzina przejęcia', () => {
    const vm = buildRelease(session(), at('17:40'))!;

    expect(vm.withoutLeg).toBe(false);
    expect(vm.summary).toEqual({
      flights: '1',
      blockLabel: '1:30',
      flightLabel: '1:21',
      heldAt: '13:35',
    });
    // Przegląd przejęty z dawnego ekranu 09 (2026-08-10): czasy z detekcji do
    // przejrzenia przed zatwierdzeniem logu.
    expect(vm.flightReview.map((r) => [r.key, r.value])).toEqual([
      ['Lot 1', '13:47 → 15:08 · 1:21'],
      ['Silnik', '13:40 → 15:10 · blok 1:30'],
    ]);
  });

  it('operacja bez wzlotu to 09C - z miarą, jak długo samolot był zajęty', () => {
    const vm = buildRelease(session({ legs: [], blockTimeMs: 0, flightTimeMs: 0 }), at('15:35'))!;

    expect(vm.withoutLeg).toBe(true);
    expect(vm.heldLabel).toBe('Trzymany 13:35 → 15:35 · 2:00');
  });

  it('bez zdarzenia przejęcia nie zmyślamy godziny', () => {
    const vm = buildRelease(session({ legs: [], claimedAt: null }), at('15:35'))!;

    expect(vm.summary.heldAt).toBe('-');
    expect(vm.heldLabel).toBeNull();
  });

  it('bez samolotu w ręce nie ma czego zdawać', () => {
    expect(buildRelease(emptySessionState(), at('15:35'))).toBeNull();
  });

  it('podpowiedź startowa bierze OSTATNI znany stan: paliwomierz z tankowań, MH z przejęcia', () => {
    // Po 2026-08-10 wewnątrz sesji nie ma pośrednich odczytów (leg_close znikł) -
    // paliwo zna ostatnią granicę (np. tankowanie), a MH wyłącznie stan z przejęcia.
    const state = session({
      legs: [leg('10:00', '11:00')],
      fuel: { startL: 96, addedL: 0, endL: null, consumedL: null, lastReadingL: 70 },
    });

    expect(buildRelease(state, at('12:00'))!.initial).toEqual({ fuelL: 70, mh: 1239.65 });
  });
});

describe('podpowiedzi pod odczytem końcowym', () => {
  it('paliwo: zużycie liczone z wartości WPISYWANEJ, bo projekcja go jeszcze nie zna', () => {
    expect(session().fuel.consumedL).toBeNull();
    expect(finalFuelHint(session(), 62)).toBe('przy przejęciu 96 L · bez tankowania · zużyte 34 L');
  });

  it('paliwo: tankowanie wchodzi do bilansu', () => {
    const state = session({
      fuel: { startL: 96, addedL: 40, endL: null, consumedL: null, lastReadingL: 130 },
    });

    expect(finalFuelHint(state, 100)).toBe('przy przejęciu 96 L · dolane 40 L · zużyte 36 L');
  });

  it('paliwo: przyrost mówi wprost, że coś się nie zgadza - zamiast ujemnego zużycia', () => {
    expect(finalFuelHint(session(), 120)).toContain('przybyło 24 L - sprawdź odczyt');
  });

  it('motogodziny: Δ i czas bloku obok siebie - inwariant §4.5 do sprawdzenia wzrokiem', () => {
    // 1239.65 → 1241.15 to +1:30, dokładnie tyle, ile czas blokowy.
    expect(finalMhHint(session(), 1241.15)).toBe(
      'format hh:mm · przy przejęciu 1239:39 · Δ +1:30 · blok 1:30',
    );
  });

  it('motogodziny: bez odczytu startowego nie zmyślamy przyrostu', () => {
    const state = session({ mh: { start: null, end: null, deltaH: null } });

    expect(finalMhHint(state, 1241)).toBe(
      'format hh:mm · brak odczytu przy przejęciu - wpisz z licznika',
    );
  });

});

/*
 * Testy `handoverText` i `balanceRows` USUNIĘTE razem z banerem przekazania i kartą
 * „Rozliczenie tego samolotu" (issue #84, uwagi 3 i 4) - uzasadnienie stoi w miejscu
 * po nich w `logic/releaseAircraft.ts`. `consumedL` zostaje: liczy je nadal ekran
 * operacji, a „zero jest wynikiem, brak danych nie jest" to jego cała treść.
 */
describe('zużycie operacji', () => {
  it('zużycie: zero jest wynikiem, brak danych nie jest', () => {
    expect(consumedL(session(), 96)).toBe(0);
    expect(consumedL(session(), null)).toBeNull();
    expect(consumedL(session({ fuel: { ...session().fuel, startL: null } }), 62)).toBeNull();
  });
});

describe('releaseBlocker - odczyt jest tu WYMAGANY (§3.6)', () => {
  it('brak któregokolwiek odczytu blokuje tym samym zdaniem', () => {
    // JEDNO zdanie na oba pola (issue #84): powód blokady jest instrukcją, a nie
    // wykładem o łańcuchu MH - puste pole pilot i tak widzi nad przyciskiem.
    expect(releaseBlocker(session(), { fuelL: null, mh: 1241 })).toBe(
      'Podaj odczyt paliwa i motogodzin.',
    );
    expect(releaseBlocker(session(), { fuelL: 62, mh: null })).toBe(
      'Podaj odczyt paliwa i motogodzin.',
    );
  });

  it('cofnięty licznik jest zatrzymany PRZED zapisem, a nie odrzucony po fakcie', () => {
    expect(releaseBlocker(session(), { fuelL: 62, mh: 1200 })).toBe(
      'Licznik nie może się cofnąć - przy przejęciu 1239:39.',
    );
  });

  it('progiem jest stan przy przejęciu - jedyny znany punkt łańcucha wewnątrz operacji', () => {
    // Ekran musi ostrzegać dokładnie tam, gdzie komenda odmówi. Po 2026-08-10 nie ma
    // pośrednich odczytów per wzlot, więc próg to zawsze odczyt z przejęcia.
    const state = session({ legs: [leg('13:40', '15:10')] });

    expect(releaseBlocker(state, { fuelL: 62, mh: 1239 })).toBe(
      'Licznik nie może się cofnąć - przy przejęciu 1239:39.',
    );
    expect(releaseBlocker(state, { fuelL: 62, mh: 1242 })).toBeNull();
  });

  it('komplet odczytu przepuszcza zapis', () => {
    expect(releaseBlocker(session(), { fuelL: 62, mh: 1241.15 })).toBeNull();
  });

  it('bez odczytu startowego nie blokujemy - nie ma z czym porównać', () => {
    const state = session({ mh: { start: null, end: null, deltaH: null } });

    expect(releaseBlocker(state, { fuelL: 62, mh: 5 })).toBeNull();
  });

  it('09C: bez powodu nie ma zapisu, choć odczyt jest kompletny', () => {
    // Powód jest JEDYNYM pytaniem tego wariantu. Domena przyjęłaby zdarzenie bez niego
    // (miękka flaga), ale pilot stoi przy samolocie i odpowie w sekundę - administrator
    // czytający rejestr tydzień później nie ma już kogo zapytać.
    const empty = session({ legs: [], blockTimeMs: 0, flightTimeMs: 0 });
    const reading = { fuelL: 96, mh: 1239.65 };

    expect(releaseBlocker(empty, reading, null)).toContain('powód');
    expect(releaseBlocker(empty, reading, 'weather')).toBeNull();
  });

  it('operacja ZE WZLOTAMI nie pyta o powód - nie ma o co pytać', () => {
    expect(releaseBlocker(session(), { fuelL: 62, mh: 1241.15 }, null)).toBeNull();
  });
});

describe('payload i napisy zdania (issue #23 - jedna intencja)', () => {
  const reading = { fuelL: 88, mh: 1241.15 };

  it('payload niesie odczyt i powód - klamry służby nie ma w ogóle', () => {
    // `ReleaseIntent` z drugą odnogą „ZAMKNIJ DZIEŃ" (dutyEnd) żył do 2026-08-11
    // i został usunięty razem z klamrą służby (issue #23).
    const payload = releasePayload(reading, null);

    expect(payload).toEqual({ finalReading: reading, noFlightReason: null });
  });

  it('powód 09C jedzie w payloadzie', () => {
    expect(releasePayload(reading, 'weather').noFlightReason).toBe('weather');
  });

  it('komentarz do powodu wchodzi TYLKO z treścią - pusty i sam biały znak to brak klucza', () => {
    // Opcjonalne pole (uwaga z urządzenia, 2026-09-03): „usterka" bez słowa KTÓRA
    // jest dla administratora pytaniem, nie informacją.
    expect(releasePayload(reading, 'malfunction', '  przeciek oleju  ')).toEqual({
      finalReading: reading,
      noFlightReason: 'malfunction',
      noFlightNote: 'przeciek oleju',
    });
    expect('noFlightNote' in releasePayload(reading, 'malfunction', '   ')).toBe(false);
    expect('noFlightNote' in releasePayload(reading, 'malfunction', null)).toBe(false);
  });

  it('CTA mówi, co się zaraz stanie - nie odwrotnie', () => {
    // Zdanie = zatwierdzenie logu operacji (2026-08-10) i napis to zapowiada. Baner
    // „Zdajesz samolot, nie kończysz dnia" odszedł przy issue #84 (uwaga 5): opisywał
    // MODEL, a nie tę operację - pilot zobaczy go w działaniu, wracając na listę dnia.
    expect(RELEASE_CTA).toBe('ZDAJ I ZATWIERDŹ LOG');
  });
});
