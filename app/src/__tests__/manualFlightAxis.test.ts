/**
 * UZ Aero - test osi wpisu ręcznego (issue #62 pkt 8, 9 i 10).
 *
 * Trzy rzeczy, o które prosiło zgłoszenie z urządzenia, i wszystkie trzy da się
 * sprawdzić bez urządzenia - bo są kształtem danych, nie rysunkiem:
 *  • zrzut należy do KONKRETNEGO lotu i widać do którego (pkt 9),
 *  • nowy lot dziedziczy godziny biegu silnika (pkt 8),
 *  • bez biegu silnika osi NIE MA, więc nie ma też czego do niej dodać (pkt 10).
 */

import {
  buildManualFlightAxis,
  flightNumberAt,
  manualAxisTarget,
  nextDropAt,
  nextFlightTimes,
  previousDrop,
} from '../ui/screens/logic/manualFlightAxis';
import { emptyManualFlightDraft, type ManualFlightDraft } from '../ui/screens/logic/manualFlight';

const DAY = Date.UTC(2026, 7, 16);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

/** Bieg 09:42 → 11:18 z trzema lotami - dzień skokowy z mockupu 15B. */
function jumpDayDraft(): ManualFlightDraft {
  return {
    ...emptyManualFlightDraft(DAY),
    operation: 'skoki',
    engineStart: at(9, 42),
    engineStop: at(11, 18),
    flights: [
      { id: 'f1', takeoff: at(9, 48), landing: at(10, 14) },
      { id: 'f2', takeoff: at(10, 26), landing: at(10, 52) },
      { id: 'f3', takeoff: at(11, 0), landing: at(11, 14) },
    ],
  };
}

describe('oś wpisu ręcznego', () => {
  it('OŚ ISTNIEJE od pustego stanu, z końcami bez godziny (issue #62, czwarta tura)', () => {
    // Karta „Bieg silnika" nad osią niosła te same dwie godziny, co pierwszy i ostatni
    // wiersz osi - „nie ma sensu ten input". Końce startują więc z `--:--` i to one
    // są wejściem w ich wpisanie: pusty krok 3 i krok 3 z sesją to ten sam ekran.
    const { rows, foot } = buildManualFlightAxis(emptyManualFlightDraft(DAY), {
      jumpDay: false,
    });

    expect(rows.map((r) => ({ kind: r.kind, time: r.time }))).toEqual([
      { kind: 'engineStart', time: '--:--' },
      { kind: 'engineStop', time: '--:--' },
    ]);
    // Stopka sum czeka na bieg silnika: trójka zer byłaby liczbą o niczym.
    expect(foot).toEqual([]);
  });

  it('jeden koniec biegu też się rysuje - sesja ma dwa i widać, którego brakuje', () => {
    const half = { ...emptyManualFlightDraft(DAY), engineStart: at(9, 42) };
    const { rows, foot } = buildManualFlightAxis(half, { jumpDay: false });

    expect(rows.map((r) => r.time)).toEqual(['09:42', '--:--']);
    expect(foot).toEqual([]);
  });

  it('oś biegnie od uruchomienia do wyłączenia, a loty stoją w środku', () => {
    const { rows, foot } = buildManualFlightAxis(jumpDayDraft(), { jumpDay: false });

    expect(rows[0]).toMatchObject({ kind: 'engineStart', time: '09:42' });
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'engineStop', time: '11:18' });
    // Trzy pary start–lądowanie między końcami.
    expect(rows.filter((r) => r.kind === 'takeoff')).toHaveLength(3);
    expect(rows.filter((r) => r.kind === 'landing')).toHaveLength(3);

    // Numer lotu przy STARCIE, czas lotu przy LĄDOWANIU - prawa krawędź niesie
    // dokładnie jedną rzecz na wiersz (reguła osi z issue #40).
    expect(rows.find((r) => r.id === 'takeoff:f2')).toMatchObject({ flight: 'lot 2' });
    expect(rows.find((r) => r.id === 'landing:f2')).toMatchObject({ duration: '0:26' });

    expect(foot).toEqual([
      { key: 'Loty', value: '3' },
      { key: 'Blok', value: '1:36' },
      { key: 'Czas lotu', value: '1:06', accent: true },
    ]);
  });

  it('zrzut stoi W SWOIM locie i nosi jego numer (pkt 9)', () => {
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      drops: [
        { id: 'd1', at: at(10, 8), jumpers: null, altitudeFt: 4000 },
        { id: 'd2', at: at(10, 46), jumpers: null, altitudeFt: null },
      ],
    };
    const { rows } = buildManualFlightAxis(draft, { jumpDay: true });
    const ids = rows.map((r) => r.id);

    // Kolejność jest CAŁYM mechanizmem przynależności: zrzut wypada między startem
    // a lądowaniem swojego lotu, bo tak wynika z jego godziny.
    expect(ids).toEqual([
      'engine-start',
      'takeoff:f1',
      'drop:d1',
      'landing:f1',
      'takeoff:f2',
      'drop:d2',
      'landing:f2',
      'takeoff:f3',
      'landing:f3',
      'engine-stop',
    ]);

    expect(rows.find((r) => r.id === 'drop:d1')).toMatchObject({ flight: 'lot 1', warned: false });
    expect(rows.find((r) => r.id === 'drop:d2')).toMatchObject({ flight: 'lot 2', warned: false });
  });

  it('zrzut poza każdym lotem jest OZNACZONY, nie ukryty i nie zablokowany', () => {
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      // 10:56 - po lądowaniu lotu 2 (10:52), przed startem lotu 3 (11:00).
      drops: [{ id: 'd9', at: at(10, 56), jumpers: null, altitudeFt: null }],
    };
    const row = buildManualFlightAxis(draft, { jumpDay: true }).rows.find(
      (r) => r.id === 'drop:d9',
    );

    expect(row).toMatchObject({ flight: 'poza lotem', warned: true });
  });

  it('zrzutów nie ma na osi poza dniem skokowym (issue #19)', () => {
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      operation: 'ferry',
      drops: [{ id: 'd1', at: at(10, 8), jumpers: null, altitudeFt: null }],
    };
    const ids = buildManualFlightAxis(draft, { jumpDay: false }).rows.map((r) => r.id);
    expect(ids).not.toContain('drop:d1');
  });

  it('lot startujący W GODZINIE lądowania poprzedniego nie wyprzedza go na osi', () => {
    // Zgłoszenie z urządzenia (czwarta tura): przy równych stemplach kolejność
    // wychodziła „Start (lot 2) → Lądowanie (lot 1)", czyli obraz lotu, który zaczął
    // się przed wylądowaniem poprzedniego. Jednej rangi typu nie da się dobrać -
    // wewnątrz lotu start musi wyprzedzać lądowanie, a MIĘDZY lotami odwrotnie.
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      flights: [
        { id: 'f1', takeoff: at(9, 48), landing: at(10, 14) },
        // Start dokładnie w godzinie lądowania lotu 1 - touch and go z kartki.
        { id: 'f2', takeoff: at(10, 14), landing: at(10, 40) },
      ],
    };

    expect(buildManualFlightAxis(draft, { jumpDay: false }).rows.map((r) => r.id)).toEqual([
      'engine-start',
      'takeoff:f1',
      'landing:f1',
      'takeoff:f2',
      'landing:f2',
      'engine-stop',
    ]);
  });

  it('zrzut na granicy lotu zostaje W NIM, a nie przed jego startem', () => {
    // Druga strona tej samej reguły: wewnątrz lotu porządek jest start → zrzut →
    // lądowanie, także gdy zrzut ma stempel równy któremuś z końców.
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      flights: [{ id: 'f1', takeoff: at(9, 48), landing: at(10, 14) }],
      drops: [
        { id: 'dA', at: at(9, 48), jumpers: null, altitudeFt: null },
        { id: 'dB', at: at(10, 14), jumpers: null, altitudeFt: null },
      ],
    };

    expect(buildManualFlightAxis(draft, { jumpDay: true }).rows.map((r) => r.id)).toEqual([
      'engine-start',
      'takeoff:f1',
      'drop:dA',
      'drop:dB',
      'landing:f1',
      'engine-stop',
    ]);
  });

  it('przynależność liczy się granicami DOMKNIĘTYMI - jak DROP_ON_GROUND w domenie', () => {
    const flights = jumpDayDraft().flights;
    expect(flightNumberAt(flights, at(9, 48))).toBe(1); // dokładnie start
    expect(flightNumberAt(flights, at(10, 14))).toBe(1); // dokładnie lądowanie
    expect(flightNumberAt(flights, at(10, 20))).toBeNull(); // między lotami
    expect(flightNumberAt(flights, at(9, 42))).toBeNull(); // uruchomienie silnika
  });
});

describe('co otwiera tapnięcie w wiersz osi', () => {
  it('niesie KONKRETNY koniec pary, nie samą parę (issue #62, trzecia tura)', () => {
    // „Skoro klikam w konkretną pozycję, to wiem, że tylko to chcę edytować" -
    // tapnięcie w START otwierało arkusz z parą start + lądowanie.
    expect(manualAxisTarget('takeoff:f2')).toEqual({
      kind: 'flight',
      id: 'f2',
      field: 'takeoff',
    });
    expect(manualAxisTarget('landing:f2')).toEqual({
      kind: 'flight',
      id: 'f2',
      field: 'landing',
    });
    expect(manualAxisTarget('engine-start')).toEqual({ kind: 'engine', field: 'start' });
    expect(manualAxisTarget('engine-stop')).toEqual({ kind: 'engine', field: 'stop' });
  });

  it('zrzut nie ma końców - otwiera się w całości', () => {
    expect(manualAxisTarget('drop:d1')).toEqual({ kind: 'drop', id: 'd1' });
  });

  it('wiersz nieznanego rodzaju nie otwiera niczego', () => {
    expect(manualAxisTarget('cokolwiek')).toBeNull();
  });

  it('identyfikatory wierszy osi zgadzają się z tym, co czyta `manualAxisTarget`', () => {
    // Bez tego testu builder i czytnik mogą rozjechać się po cichu: oś rysowałaby
    // wiersze, których tapnięcie nic nie otwiera.
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      drops: [{ id: 'd1', at: at(10, 8), jumpers: null, altitudeFt: null }],
    };
    for (const row of buildManualFlightAxis(draft, { jumpDay: true }).rows) {
      expect(manualAxisTarget(row.id)).not.toBeNull();
    }
  });
});

describe('wartości startowe dopisywanych pozycji', () => {
  it('PIERWSZY lot bierze CAŁY bieg silnika (pkt 8)', () => {
    const draft = { ...emptyManualFlightDraft(DAY), engineStart: at(9, 42), engineStop: at(11, 18) };
    expect(nextFlightTimes(draft)).toEqual({ takeoff: at(9, 42), landing: at(11, 18) });
  });

  it('kolejny lot biegnie od ostatniego lądowania do wyłączenia silnika', () => {
    // Nie „10 minut po ostatnim lądowaniu, 30 minut długości" (tak było do issue #62):
    // te liczby brały się znikąd i trzeba je było poprawiać dwoma arkuszami.
    expect(nextFlightTimes(jumpDayDraft())).toEqual({ takeoff: at(11, 14), landing: at(11, 18) });
  });

  it('bez biegu silnika nowy lot nie ma czego dziedziczyć', () => {
    expect(nextFlightTimes(emptyManualFlightDraft(DAY))).toBeNull();
  });

  it('nowy zrzut ląduje w PIERWSZYM locie, który zrzutu jeszcze nie ma', () => {
    // Do issue #62 każdy nowy zrzut trafiał w połowę OSTATNIEGO lotu, więc na dniu
    // skokowym wszystkie lądowały w tym samym - a pilot dopisuje je po kolei.
    const draft = jumpDayDraft();
    expect(nextDropAt(draft)).toBe(at(10, 1)); // środek lotu 1

    const withFirst: ManualFlightDraft = {
      ...draft,
      drops: [{ id: 'd1', at: at(10, 1), jumpers: null, altitudeFt: null }],
    };
    expect(nextDropAt(withFirst)).toBe(at(10, 39)); // środek lotu 2
  });

  it('gdy każdy lot ma już zrzut, kolejny idzie do ostatniego', () => {
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      drops: [
        { id: 'd1', at: at(10, 1), jumpers: null, altitudeFt: null },
        { id: 'd2', at: at(10, 39), jumpers: null, altitudeFt: null },
        { id: 'd3', at: at(11, 7), jumpers: null, altitudeFt: null },
      ],
    };
    expect(nextDropAt(draft)).toBe(at(11, 7)); // środek lotu 3
  });

  it('bez lotów zrzut nie ma gdzie stanąć', () => {
    const draft = { ...emptyManualFlightDraft(DAY), engineStart: at(9, 42), engineStop: at(11, 18) };
    expect(nextDropAt(draft)).toBeNull();
  });

  it('kolejny zrzut dziedziczy skład i wysokość po poprzednim (czwarta tura)', () => {
    // Dzień skokowy to ta sama maszyna, ten sam klub i zwykle ta sama wysokość
    // wyniesienia lot po locie - wbijanie tych liczb od nowa przy każdym zrzucie
    // było pracą, której formularz miał materiał nie wymagać.
    const first = {
      id: 'd1',
      at: at(10, 1),
      jumpers: { tandem: 2, aff: 0, solo: 1 },
      altitudeFt: 4000,
    };
    const draft: ManualFlightDraft = { ...jumpDayDraft(), drops: [first] };

    // Następny zrzut idzie do lotu 2 (środek 10:39) i bierze wartości z lotu 1.
    expect(previousDrop(draft, at(10, 39))).toEqual(first);
  });

  it('pierwszy zrzut sesji nie ma po kim dziedziczyć', () => {
    expect(previousDrop(jumpDayDraft(), at(10, 1))).toBeNull();
  });

  it('dziedziczy po zrzucie POPRZEDZAJĄCYM, nie po ostatnim w tablicy', () => {
    // Zrzuty wpisuje się w dowolnej kolejności, a poprawka godziny je przestawia -
    // liczy się porządek CZASU, nie kolejność dopisywania.
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      drops: [
        { id: 'late', at: at(11, 7), jumpers: { tandem: 9, aff: 0, solo: 0 }, altitudeFt: 9000 },
        { id: 'early', at: at(10, 1), jumpers: { tandem: 2, aff: 0, solo: 1 }, altitudeFt: 4000 },
      ],
    };

    expect(previousDrop(draft, at(10, 39))?.id).toBe('early');
  });
});
