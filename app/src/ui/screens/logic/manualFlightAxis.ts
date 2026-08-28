/**
 * UZ Aero — szkic wpisu ręcznego → OŚ SESJI (issue #62 pkt 8, 9 i 10; mockup `15b`).
 *
 * ══ DLACZEGO OŚ, A NIE DWIE LISTY ══
 * Do issue #62 krok 3 pokazywał dwie płaskie listy obok siebie: „Loty" i „Zrzuty".
 * Zgłoszenie z urządzenia trafiło w sedno: „na jednym biegu silnika wykonałem kilka
 * zrzutów w kilku lotach" — a formularz nie miał jak pokazać, który zrzut należy do
 * którego lotu.
 *
 * Nie dlatego, że model tego nie wie. Zrzut NIE MA pola z numerem lotu
 * (`DropPayload` niesie sam `dropNumber`) i mieć nie musi: przynależność jest
 * ZAWIERANIEM SIĘ W CZASIE i tak definiuje ją domena — `DROP_ON_GROUND`
 * (`rules/consistency.ts`) pyta dokładnie o to, czy zrzut wypadł w oknie któregoś
 * lotu. Oś kokpitu i oś rozliczenia wyrażają to samo POZYCJĄ wiersza. Wiedział więc
 * model, milczał ekran — i to ekran trzeba było naprawić.
 *
 * Stąd ten moduł: składa z płaskiego szkicu te same wiersze, które `buildSessionAxis`
 * składa z rejestru. Jedna rzecz ma w tej aplikacji jeden kształt, a wpis ręczny
 * opisuje TEN SAM bieg silnika, co zapis automatyczny — tylko z kartki.
 *
 * ══ OSI NIE MA, DOPÓKI NIE MA BIEGU SILNIKA ══
 * Sesja JEST biegiem silnika, więc lot bez niego nie ma w czym się zawierać. Dopóki
 * pilot nie wpisze obu godzin, `buildManualFlightAxis` zwraca pustą oś, a ekran nie
 * pokazuje ani jej, ani wiersza „DODAJ LOT" (issue #62 pkt 10). To BRAK AKCJI,
 * nie wyszarzony przycisk: wyszarzony obiecywałby czynność, którą reguły i tak
 * odrzucą (ta sama zasada, co brak „EDYTUJ DANE" w podglądzie 10B i brak „DALEJ"
 * przy pustej flocie na 02G).
 *
 * Zero Reacta, zero zegara systemowego — wejściem jest szkic, wyjściem wiersze.
 */

import { duration, timeUtc } from '../../format';
import type { SessionAxisFootItem, SessionAxisRow } from '../../components/data/SessionAxis';
import type {
  ManualFlightDraft,
  ManualFlightDropDraft,
  ManualFlightLegDraft,
} from './manualFlight';
import { sortedFlights } from './manualFlight';

/**
 * Co otwiera tapnięcie w wiersz — ekran nie parsuje `id` samodzielnie.
 *
 * Cel niesie KONKRETNY KONIEC pary (issue #62, trzecia tura z urządzenia): „skoro
 * klikam w konkretną pozycję, to wiem, że tylko to chcę edytować". Tapnięcie w START
 * otwierało arkusz z parą start + lądowanie, czyli dawało do ręki kontrolkę, o którą
 * nikt nie prosił, i kazało szukać wzrokiem tej właściwej. Drugi koniec zostaje
 * w arkuszu jako wiersz odniesienia — patrz `FlightTimesField.readOnly`.
 */
export type ManualAxisTarget =
  | { kind: 'engine'; field: 'start' | 'stop' }
  | { kind: 'flight'; id: string; field: 'takeoff' | 'landing' }
  | { kind: 'drop'; id: string };

export interface ManualFlightAxis {
  rows: SessionAxisRow[];
  foot: SessionAxisFootItem[];
}

/** Identyfikatory wierszy — jedno miejsce, żeby budowanie i czytanie się nie rozjechało. */
const ENGINE_START = 'engine-start';
const ENGINE_STOP = 'engine-stop';

/**
 * Wiersz osi → co otworzyć. `null` = wiersz bez arkusza (dziś takiego nie ma, ale
 * `SessionAxis` woła `onCorrect` dla każdego wiersza, więc odmowa musi być możliwa).
 */
export function manualAxisTarget(rowId: string): ManualAxisTarget | null {
  if (rowId === ENGINE_START) return { kind: 'engine', field: 'start' };
  if (rowId === ENGINE_STOP) return { kind: 'engine', field: 'stop' };
  if (rowId.startsWith('takeoff:')) {
    return { kind: 'flight', id: rowId.slice('takeoff:'.length), field: 'takeoff' };
  }
  if (rowId.startsWith('landing:')) {
    return { kind: 'flight', id: rowId.slice('landing:'.length), field: 'landing' };
  }
  if (rowId.startsWith('drop:')) return { kind: 'drop', id: rowId.slice('drop:'.length) };
  return null;
}

/**
 * Numer lotu (1-based), w którym mieści się dana chwila; `null` = poza każdym lotem.
 *
 * Granice DOMKNIĘTE po obu stronach — tak samo, jak liczy je `DROP_ON_GROUND`
 * w domenie. Zrzut w sekundzie startu jest dziwny, ale nie jest „na ziemi", a dwie
 * różne odpowiedzi na to samo pytanie w domenie i na ekranie byłyby gorsze niż
 * jedna dyskusyjna.
 */
export function flightNumberAt(
  flights: readonly ManualFlightLegDraft[],
  at: number,
): number | null {
  const index = flights.findIndex((f) => at >= f.takeoff && at <= f.landing);
  return index < 0 ? null : index + 1;
}

/**
 * Godzina startowa NOWEGO zrzutu — środek PIERWSZEGO lotu, który jeszcze zrzutu nie ma.
 *
 * Do issue #62 nowy zrzut lądował zawsze w połowie OSTATNIEGO lotu, więc na dniu
 * skokowym wszystkie trafiały do tego samego — a pilot i tak dopisuje je po kolei.
 * Dzień skokowy to zwykle jedno wyniesienie na lot, więc „pierwszy lot bez zrzutu"
 * trafia w intencję bez ani jednego dodatkowego pytania; kto potrzebuje dwóch
 * w jednym locie, poprawi godzinę w arkuszu.
 *
 * `null` = nie ma lotów, w których zrzut mógłby się znaleźć.
 */
export function nextDropAt(draft: ManualFlightDraft): number | null {
  const flights = sortedFlights(draft);
  if (flights.length === 0) return null;
  const free =
    flights.find((f) => !draft.drops.some((d) => d.at >= f.takeoff && d.at <= f.landing)) ??
    flights[flights.length - 1]!;
  return free.takeoff + Math.round((free.landing - free.takeoff) / 2);
}

/**
 * Godziny startowe NOWEGO lotu (issue #62 pkt 8).
 *
 * Do issue #62 nowy lot dostawał „10 minut po ostatnim lądowaniu, 30 minut długości" —
 * liczby wzięte znikąd, które trzeba było potem poprawiać dwoma arkuszami. Oś ma dwa
 * końce i to one są naturalnymi granicami lotu: PIERWSZY lot dostaje cały bieg silnika
 * (przy sesji z jednym lotem — najczęstszej — jest to od razu wartość właściwa),
 * a każdy kolejny biegnie od ostatniego lądowania do wyłączenia silnika, bo tyle
 * miejsca zostało.
 *
 * `null` = biegu silnika nie ma, więc nie ma czego dziedziczyć (i nie ma wtedy osi).
 */
export function nextFlightTimes(
  draft: ManualFlightDraft,
): { takeoff: number; landing: number } | null {
  if (draft.engineStart == null || draft.engineStop == null) return null;
  const last = sortedFlights(draft).at(-1);
  const takeoff = last != null ? last.landing : draft.engineStart;
  return { takeoff, landing: draft.engineStop };
}

/** Skład zrzutu w drugiej linii wiersza: „2 tandem · 1 solo · 4000 ft". */
export function dropSummary(drop: Pick<ManualFlightDropDraft, 'jumpers' | 'altitudeFt'>): string {
  const parts: string[] = [];
  if (drop.jumpers == null) {
    // `null` znaczy „skład niepodany", nigdy „zero skoczków" (issue #21 pkt 5).
    parts.push('skład niepodany');
  } else {
    if (drop.jumpers.tandem > 0) parts.push(`${drop.jumpers.tandem} tandem`);
    if (drop.jumpers.aff > 0) parts.push(`${drop.jumpers.aff} AFF`);
    if (drop.jumpers.solo > 0) parts.push(`${drop.jumpers.solo} solo`);
  }
  if (drop.altitudeFt != null) parts.push(`${drop.altitudeFt} ft`);
  return parts.join(' · ');
}

/**
 * Szkic → wiersze osi. Pusta oś (`rows: []`) znaczy „biegu silnika jeszcze nie ma";
 * ekran nie rysuje wtedy ani osi, ani wejść dopisania.
 *
 * @param jumpDay dzień skokowy — bez niego zrzutów na osi NIE MA (issue #19: przy
 *   przelocie zrzut nie może się wydarzyć, więc jego brak nie jest brakiem danych).
 */
export function buildManualFlightAxis(
  draft: ManualFlightDraft,
  { jumpDay }: { jumpDay: boolean },
): ManualFlightAxis {
  if (draft.engineStart == null || draft.engineStop == null) return { rows: [], foot: [] };

  const flights = sortedFlights(draft);
  const drops = jumpDay ? [...draft.drops].sort((a, b) => a.at - b.at) : [];

  const rows: SessionAxisRow[] = [
    {
      id: ENGINE_START,
      kind: 'engineStart',
      time: timeUtc(draft.engineStart),
      name: 'Uruchomienie',
    },
  ];

  /**
   * Zdarzenia lotów i zrzutów w JEDNYM porządku czasu — to jest cały mechanizm
   * przynależności: zrzut wypadający w oknie lotu stanie między jego startem
   * a lądowaniem, bo tak wynika z jego godziny.
   *
   * Przy równym stemplu start wygrywa z lądowaniem, a zrzut stoi po starcie
   * i przed lądowaniem — czyli tam, gdzie mógł się wydarzyć.
   */
  const middle: { at: number; rank: number; row: SessionAxisRow }[] = [];

  flights.forEach((flight, index) => {
    middle.push({
      at: flight.takeoff,
      rank: 0,
      row: {
        id: `takeoff:${flight.id}`,
        kind: 'takeoff',
        time: timeUtc(flight.takeoff),
        name: 'Start',
        flight: `lot ${index + 1}`,
      },
    });
    middle.push({
      at: flight.landing,
      rank: 2,
      row: {
        id: `landing:${flight.id}`,
        kind: 'landing',
        time: timeUtc(flight.landing),
        name: 'Lądowanie',
        duration: flight.landing > flight.takeoff ? duration(flight.landing - flight.takeoff) : null,
      },
    });
  });

  drops.forEach((drop, index) => {
    const inFlight = flightNumberAt(flights, drop.at);
    middle.push({
      at: drop.at,
      rank: 1,
      row: {
        id: `drop:${drop.id}`,
        kind: 'drop',
        time: timeUtc(drop.at),
        name: `Zrzut ${index + 1}`,
        sub: dropSummary(drop),
        /* PRAWA KOLUMNA ODPOWIADA NA TO SAMO PYTANIE, CO PRZY STARCIE: „który to lot".
           Przy zrzucie brzmi ono „do którego lotu on należy" — i to jest odpowiedź
           na zgłoszenie z issue #62 pkt 9. */
        flight: inFlight != null ? `lot ${inFlight}` : 'poza lotem',
        /* Miękka reguła domeny `DROP_ON_GROUND`, pokazana TU, a nie krok dalej:
           ostrzeżenie ma stać tam, gdzie da się je naprawić. NIE blokuje zapisu —
           fakt lotu jest cenniejszy niż kompletność formularza. */
        warned: inFlight == null,
      },
    });
  });

  middle.sort((a, b) => a.at - b.at || a.rank - b.rank);
  rows.push(...middle.map((m) => m.row));

  rows.push({
    id: ENGINE_STOP,
    kind: 'engineStop',
    time: timeUtc(draft.engineStop),
    name: 'Wyłączenie',
  });

  const airborne = flights.reduce((sum, f) => sum + Math.max(0, f.landing - f.takeoff), 0);
  return {
    rows,
    // Ta sama trójka, co na kafelku sesji i w stopce rozliczenia (issue #42).
    foot: [
      { key: 'Loty', value: String(flights.length) },
      { key: 'Blok', value: duration(draft.engineStop - draft.engineStart) },
      { key: 'Czas lotu', value: duration(airborne), accent: true },
    ],
  };
}
