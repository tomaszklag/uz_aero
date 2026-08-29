/**
 * UZ Aero - szkic wpisu ręcznego → OŚ SESJI (issue #62 pkt 8, 9 i 10; mockup `15b`).
 *
 * ══ DLACZEGO OŚ, A NIE DWIE LISTY ══
 * Do issue #62 krok 3 pokazywał dwie płaskie listy obok siebie: „Loty" i „Zrzuty".
 * Zgłoszenie z urządzenia trafiło w sedno: „na jednym biegu silnika wykonałem kilka
 * zrzutów w kilku lotach" - a formularz nie miał jak pokazać, który zrzut należy do
 * którego lotu.
 *
 * Nie dlatego, że model tego nie wie. Zrzut NIE MA pola z numerem lotu
 * (`DropPayload` niesie sam `dropNumber`) i mieć nie musi: przynależność jest
 * ZAWIERANIEM SIĘ W CZASIE i tak definiuje ją domena - `DROP_ON_GROUND`
 * (`rules/consistency.ts`) pyta dokładnie o to, czy zrzut wypadł w oknie któregoś
 * lotu. Oś kokpitu i oś rozliczenia wyrażają to samo POZYCJĄ wiersza. Wiedział więc
 * model, milczał ekran - i to ekran trzeba było naprawić.
 *
 * Stąd ten moduł: składa z płaskiego szkicu te same wiersze, które `buildSessionAxis`
 * składa z rejestru. Jedna rzecz ma w tej aplikacji jeden kształt, a wpis ręczny
 * opisuje TEN SAM bieg silnika, co zapis automatyczny - tylko z kartki.
 *
 * ══ OSI NIE MA, DOPÓKI NIE MA BIEGU SILNIKA ══
 * Sesja JEST biegiem silnika, więc lot bez niego nie ma w czym się zawierać. Dopóki
 * pilot nie wpisze obu godzin, `buildManualFlightAxis` zwraca pustą oś, a ekran nie
 * pokazuje ani jej, ani wiersza „DODAJ LOT" (issue #62 pkt 10). To BRAK AKCJI,
 * nie wyszarzony przycisk: wyszarzony obiecywałby czynność, którą reguły i tak
 * odrzucą (ta sama zasada, co brak „EDYTUJ DANE" w podglądzie 10B i brak „DALEJ"
 * przy pustej flocie na 02G).
 *
 * Zero Reacta, zero zegara systemowego - wejściem jest szkic, wyjściem wiersze.
 */

import { duration, landingsCount, timeUtc } from '../../format';
import type { SessionAxisFootItem, SessionAxisRow } from '../../components/data/SessionAxis';
import type {
  ManualFlightDraft,
  ManualFlightDropDraft,
  ManualFlightLegDraft,
} from './manualFlight';
import { sortedFlights } from './manualFlight';

/**
 * Co otwiera tapnięcie w wiersz - ekran nie parsuje `id` samodzielnie.
 *
 * Cel niesie KONKRETNY KONIEC pary (issue #62, trzecia tura z urządzenia): „skoro
 * klikam w konkretną pozycję, to wiem, że tylko to chcę edytować". Tapnięcie w START
 * otwierało arkusz z parą start + lądowanie, czyli dawało do ręki kontrolkę, o którą
 * nikt nie prosił, i kazało szukać wzrokiem tej właściwej. Drugi koniec zostaje
 * w arkuszu jako wiersz odniesienia - patrz `FlightTimesField.readOnly`.
 */
export type ManualAxisTarget =
  | { kind: 'engine'; field: 'start' | 'stop' }
  | { kind: 'flight'; id: string; field: 'takeoff' | 'landing' }
  | { kind: 'drop'; id: string };

export interface ManualFlightAxis {
  rows: SessionAxisRow[];
  foot: SessionAxisFootItem[];
}

/** Identyfikatory wierszy - jedno miejsce, żeby budowanie i czytanie się nie rozjechało. */
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
 * Granice DOMKNIĘTE po obu stronach - tak samo, jak liczy je `DROP_ON_GROUND`
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
 * Godzina startowa NOWEGO zrzutu - środek PIERWSZEGO lotu, który jeszcze zrzutu nie ma.
 *
 * Do issue #62 nowy zrzut lądował zawsze w połowie OSTATNIEGO lotu, więc na dniu
 * skokowym wszystkie trafiały do tego samego - a pilot i tak dopisuje je po kolei.
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
 * Do issue #62 nowy lot dostawał „10 minut po ostatnim lądowaniu, 30 minut długości" -
 * liczby wzięte znikąd, które trzeba było potem poprawiać dwoma arkuszami. Oś ma dwa
 * końce i to one są naturalnymi granicami lotu: PIERWSZY lot dostaje cały bieg silnika
 * (przy sesji z jednym lotem - najczęstszej - jest to od razu wartość właściwa),
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

/**
 * Zrzut POPRZEDZAJĄCY daną chwilę - źródło wartości startowych następnego
 * (issue #62, czwarta tura z urządzenia).
 *
 * Dzień skokowy to ta sama maszyna, ten sam klub i zwykle ta sama wysokość wyniesienia
 * lot po locie. Nowy zrzut zaczynający od zera kazał więc wbijać te same liczby od nowa
 * przy każdym wyniesieniu - a formularz miał je tuż obok. Kopiujemy skład i wysokość;
 * godzina idzie z `nextDropAt`, bo ta akurat jest za każdym razem inna.
 *
 * `null` = nie ma poprzednika (pierwszy zrzut sesji) i wtedy pola startują puste:
 * skład niepodany to `null`, nie zero (issue #21 pkt 5).
 */
export function previousDrop(
  draft: ManualFlightDraft,
  at: number,
): ManualFlightDropDraft | null {
  const earlier = draft.drops.filter((d) => d.at <= at).sort((a, b) => a.at - b.at);
  return earlier.at(-1) ?? null;
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

/** Godzina, której jeszcze nie ma - ten sam placeholder, co w kontrolce czasu. */
const NO_TIME = '--:--';

/**
 * Szkic → wiersze osi.
 *
 * ══ OŚ ISTNIEJE OD PIERWSZEJ SEKUNDY (issue #62, czwarta tura z urządzenia) ══
 * Do tej tury krok 3 miał NAD osią kartę „Bieg silnika" z parą godzin - dokładnie
 * tych samych, które oś rysuje jako swój pierwszy i ostatni wiersz. Zgłoszenie
 * brzmiało: „dubluje się «bieg silnika» z tym, co mam na osi czasu, nie ma sensu ten
 * input". Karta zniknęła, a oś zaczyna się od dwóch końców z `--:--`, które SĄ
 * wejściem w ich wpisanie.
 *
 * Zysk jest większy niż jedna karta mniej: pusty krok 3 i krok 3 z pełną sesją to
 * odtąd TEN SAM ekran w dwóch stanach, a nie dwa różne układy. Reguła „nie da się
 * dodać lotu bez biegu silnika" (pkt 10) zostaje w mocy - pilnuje jej ekran, nie
 * pokazując wiersza „DODAJ LOT", dopóki oba końce nie mają godziny.
 *
 * @param jumpDay dzień skokowy - bez niego zrzutów na osi NIE MA (issue #19: przy
 *   przelocie zrzut nie może się wydarzyć, więc jego brak nie jest brakiem danych).
 */
export function buildManualFlightAxis(
  draft: ManualFlightDraft,
  { jumpDay }: { jumpDay: boolean },
): ManualFlightAxis {
  const flights = sortedFlights(draft);
  const drops = jumpDay ? [...draft.drops].sort((a, b) => a.at - b.at) : [];
  /** Numer zrzutu W CAŁEJ SESJI - liczy się z porządku czasu, nie z gniazda lotu. */
  const dropNumber = new Map(drops.map((d, i) => [d.id, i + 1]));

  const dropRow = (drop: ManualFlightDropDraft): SessionAxisRow => {
    const inFlight = flightNumberAt(flights, drop.at);
    return {
      id: `drop:${drop.id}`,
      kind: 'drop',
      time: timeUtc(drop.at),
      name: `Zrzut ${dropNumber.get(drop.id) ?? 1}`,
      sub: dropSummary(drop),
      /* PRAWA KOLUMNA ODPOWIADA NA TO SAMO PYTANIE, CO PRZY STARCIE: „który to lot".
         Przy zrzucie brzmi ono „do którego lotu on należy" - i to jest odpowiedź
         na zgłoszenie z issue #62 pkt 9. */
      flight: inFlight != null ? `lot ${inFlight}` : 'poza lotem',
      /* Miękka reguła domeny `DROP_ON_GROUND`, pokazana TU, a nie krok dalej:
         ostrzeżenie ma stać tam, gdzie da się je naprawić. NIE blokuje zapisu -
         fakt lotu jest cenniejszy niż kompletność formularza. */
      warned: inFlight == null,
    };
  };

  /**
   * ══ KOLEJNOŚĆ IDZIE LOTAMI, NIE GLOBALNĄ RANGĄ (issue #62, czwarta tura) ══
   * Pierwsza wersja sortowała wszystko jedną parą `(czas, ranga typu)` ze stałą rangą
   * startu przed lądowaniem. Przy locie startującym DOKŁADNIE w godzinie lądowania
   * poprzedniego dawało to kolejność „Start (lot 2) → Lądowanie (lot 1)", czyli obraz
   * lotu, który zaczął się przed wylądowaniem poprzedniego - a to nieprawda.
   *
   * Jednej rangi nie da się dobrać: wewnątrz lotu start musi wyprzedzać lądowanie,
   * a MIĘDZY lotami lądowanie musi wyprzedzać start. Te dwa wymagania są sprzeczne,
   * więc kolejność bierze się stąd, skąd naprawdę wynika: z lotów. Każdy lot wykłada
   * swoje wiersze w komplecie (start → jego zrzuty → lądowanie), a loty idą po sobie
   * w porządku czasu, bo bramka kroku nie pozwala im na siebie zachodzić.
   */
  const middle: SessionAxisRow[] = [];
  for (const [index, flight] of flights.entries()) {
    middle.push({
      id: `takeoff:${flight.id}`,
      kind: 'takeoff',
      time: timeUtc(flight.takeoff),
      name: 'Start',
      flight: `lot ${index + 1}`,
    });
    for (const drop of drops) {
      if (drop.at >= flight.takeoff && drop.at <= flight.landing) middle.push(dropRow(drop));
    }
    /* KRĘGI WIDAĆ PRZY LĄDOWANIU, bo to ono je zamyka i to ono niesie licznik
       (uwaga z urządzenia, 2026-08-29). Nazwa wiersza mówi wprost, że przyziemień
       było więcej niż jedno — inaczej pilot wpisałby liczbę w arkuszu i nie
       zobaczyłby jej nigdzie na osi, czyli nie miałby jak sprawdzić, co zapisuje. */
    const circuits = flight.touchAndGo ?? 0;
    middle.push({
      id: `landing:${flight.id}`,
      kind: 'landing',
      time: timeUtc(flight.landing),
      name: circuits > 0 ? `Lądowanie · ${landingsCount(circuits + 1)}` : 'Lądowanie',
      duration: flight.landing > flight.takeoff ? duration(flight.landing - flight.takeoff) : null,
    });
  }

  /*
   * Zrzuty POZA lotami wchodzą po czasie - za ostatni wiersz, który jeszcze się przed
   * nimi zdarzył. Są z definicji poza każdym oknem lotu, więc nie mają jak zderzyć się
   * o remis z tym, co dzieje się w środku.
   */
  for (const drop of drops) {
    if (flightNumberAt(flights, drop.at) != null) continue;
    const before = middle.filter((row) => rowTime(row, flights, drops) <= drop.at).length;
    middle.splice(before, 0, dropRow(drop));
  }

  const rows: SessionAxisRow[] = [
    {
      id: ENGINE_START,
      kind: 'engineStart',
      time: draft.engineStart != null ? timeUtc(draft.engineStart) : NO_TIME,
      name: 'Uruchomienie',
    },
    ...middle,
    {
      id: ENGINE_STOP,
      kind: 'engineStop',
      time: draft.engineStop != null ? timeUtc(draft.engineStop) : NO_TIME,
      name: 'Wyłączenie',
    },
  ];

  /*
   * Stopka pojawia się dopiero z biegiem silnika: bez niego blok nie ma z czego wyjść,
   * a trójka zer w pustym stanie byłaby liczbą o niczym (reguła „zerowy licznik to szum,
   * nie informacja" z issue #43).
   */
  if (draft.engineStart == null || draft.engineStop == null) return { rows, foot: [] };

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

/** Czas wiersza wyliczony z jego źródła - do wstawiania zrzutów spoza lotów. */
function rowTime(
  row: SessionAxisRow,
  flights: readonly ManualFlightLegDraft[],
  drops: readonly ManualFlightDropDraft[],
): number {
  if (row.id.startsWith('takeoff:')) {
    return flights.find((f) => `takeoff:${f.id}` === row.id)?.takeoff ?? 0;
  }
  if (row.id.startsWith('landing:')) {
    return flights.find((f) => `landing:${f.id}` === row.id)?.landing ?? 0;
  }
  return drops.find((d) => `drop:${d.id}` === row.id)?.at ?? 0;
}
