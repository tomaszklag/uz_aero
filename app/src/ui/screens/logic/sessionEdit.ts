/**
 * UZ Aero — logika TRYBU EDYCJI sesji (issue #43, mockupy `design/10d`–`10h`).
 *
 * Ekran 10 ma dwa stany: odczyt i edycję. Ten moduł odpowiada na wszystkie pytania,
 * które w edycji trzeba rozstrzygnąć, i robi to POZA JSX — bo każde z nich ma regułę,
 * a reguła w widoku jest regułą, której nikt nie przetestuje:
 *
 *  • KTÓRY arkusz otworzyć — zależy od typu zdarzenia, nie od wyglądu wiersza;
 *  • CO da się dopisać — zależy od rodzaju operacji (zrzut istnieje tylko w dniu
 *    skokowym, issue #19);
 *  • KTÓRY wiersz jest podejrzany — wynik `sessionInconsistencies` trzeba przypiąć
 *    do konkretnego punktu osi, inaczej baner mówi „coś jest nie tak" i tyle.
 *
 * Napisy są tutaj, a nie w domenie: domena zwraca KODY (`DROP_ON_GROUND`), bo ten sam
 * kod czyta panel administratora po angielsku i eksport arkusza. Skrót przy wierszu osi
 * („na ziemi — sprawdź czas") jest sprawą tego ekranu.
 */

import type { Event, EventType, OperationType, RuleViolation } from '../../../domain';
import { isJumpOperation } from '../../../domain';
import type { AxisRow } from './sessionAxis';

/**
 * Adres faktów o CAŁEJ sesji — notatki i drugiego pilota (issue #43).
 *
 * Oba mieszkają w payloadzie `preflight_confirm`, bo nie są zdarzeniami w czasie: nie
 * stoją na osi i nie mają własnej godziny. Dual musiał tam trafić, bo w nagłówkach
 * zdarzeń zostaje tożsamość z chwili zapisu, a nagłówka nie da się poprawić bez łamania
 * append-only.
 *
 * `null` = sesja bez preflightu w strumieniu, czyli nie ma czego adresować.
 */
export function preflightUuid(events: readonly Event[]): string | null {
  return events.find((e) => e.type === 'preflight_confirm')?.uuid ?? null;
}

/** Który arkusz korekty otworzyć dla danego celu. */
export type EditSheet = 'time' | 'reading' | 'drop';

/** Cel korekty: zdarzenie ze strumienia plus decyzja, czym się je poprawia. */
export interface EditTarget {
  event: Event;
  sheet: EditSheet;
  /** Nazwa w nagłówku arkusza („Lądowanie · lot 1", „Zdanie samolotu"). */
  label: string;
}

/**
 * Typ zdarzenia → arkusz.
 *
 * `preflight_confirm` i `day_close` mają arkusz ODCZYTU, bo w nich poprawia się liczby,
 * a nie godzinę (domena odrzuca na nich `retime`/`void`). `drop` ma własny, bo obok
 * czasu niesie skład. Reszta faktów operacyjnych to czysty czas.
 */
const SHEET_BY_TYPE: Partial<Record<EventType, EditSheet>> = {
  preflight_confirm: 'reading',
  day_close: 'reading',
  drop: 'drop',
};

/** Nazwy zdarzeń w nagłówku arkusza — słownik ekranu, nie rejestru. */
const EVENT_LABEL: Partial<Record<EventType, string>> = {
  preflight_confirm: 'Przejęcie samolotu',
  day_close: 'Zdanie samolotu',
  engine_start: 'Uruchomienie silnika',
  engine_stop: 'Wyłączenie silnika',
  taxi: 'Kołowanie',
  takeoff: 'Start',
  landing: 'Lądowanie',
  drop: 'Zrzut',
  boarding: 'Załadunek',
  refuel: 'Tankowanie',
  oil_add: 'Dolewka oleju',
  manual_log_entry: 'Wpis ręczny',
};

/**
 * Wiersz osi → cel korekty.
 *
 * `null` znaczy „tego wiersza nie da się poprawić" i jest stanem NORMALNYM: sesja
 * odtworzona z serwera bez `preflight_confirm` ma przejęcie na osi (z projekcji), ale
 * nie ma czego adresować. Ekran zostawia wtedy pusty ołówek zamiast otwierać arkusz,
 * który nie miałby na czym pracować.
 */
export function editTargetFor(row: AxisRow, events: readonly Event[]): EditTarget | null {
  if (row.targetUuid == null) return null;
  const event = events.find((e) => e.uuid === row.targetUuid);
  if (event == null || event.type === 'event_correction') return null;

  return {
    event,
    sheet: SHEET_BY_TYPE[event.type] ?? 'time',
    label: labelFor(event, events),
  };
}

/**
 * Nazwa celu z kontekstem: „Lądowanie · lot 1", „Zrzut 2".
 *
 * Numer lotu liczymy po strumieniu, a nie z wiersza osi, bo arkusz otwiera się też
 * z innych miejsc (kokpit) i musi umieć nazwać cel sam.
 */
function labelFor(event: Event, events: readonly Event[]): string {
  const base = EVENT_LABEL[event.type] ?? 'Zdarzenie';
  if (event.type === 'drop') return `${base} ${event.payload.dropNumber}`;
  if (event.type !== 'takeoff' && event.type !== 'landing') return base;

  const flight = flightNumberOf(events, event);
  return flight == null ? base : `${base} · lot ${flight}`;
}

/** Numer lotu, do którego należy start albo lądowanie; `null` poza lotami. */
function flightNumberOf(events: readonly Event[], target: Event): number | null {
  const at = (e: Event): number => e.gpsTime ?? e.deviceTime;
  let flights = 0;
  for (const e of [...events].sort((a, b) => at(a) - at(b))) {
    if (e.type === 'takeoff') flights += 1;
    if (e.uuid === target.uuid) return Math.max(1, flights);
  }
  return null;
}

/**
 * Skróty niespójności przy wierszu osi.
 *
 * Pełne zdanie stoi w banerze nad osią — przy wierszu musi zmieścić się w jednej linii
 * podpisu, więc mówi tylko, CZEGO dotyczy problem. Kod bez skrótu (np. dołożony później
 * w domenie) po prostu nie oznacza wiersza: lepszy brak podpisu niż podpis „nieznany
 * problem", który niczego nie kwalifikuje.
 */
const ISSUE_HINT: Record<string, string> = {
  FLIGHT_WITHOUT_LANDING: 'lot bez lądowania — dopisz je',
  ZERO_LENGTH_FLIGHT: 'lądowanie nie później niż start',
  EVENT_OUTSIDE_RUN: 'poza pracą silnika — sprawdź czas',
  DROP_ON_GROUND: 'na ziemi — sprawdź czas',
  MH_REGRESSION: 'licznik niższy niż przy przejęciu',
  MH_DELTA_MISMATCH: 'przyrost licznika ponad czas pracy silnika',
  FUEL_OVER_CAPACITY: 'odczyt ponad pojemność zbiorników',
  FUEL_INCREASE_WITHOUT_REFUEL: 'więcej paliwa, niż mogło zostać',
};

/** Niespójności przypięte do uuid zdarzenia — po jednym skrócie na wiersz. */
export function issueHints(issues: readonly RuleViolation[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const issue of issues) {
    const uuid = issue.details?.uuid;
    const hint = ISSUE_HINT[issue.code];
    if (typeof uuid !== 'string' || hint == null || out.has(uuid)) continue;
    out.set(uuid, hint);
  }
  return out;
}

/**
 * Nakłada niespójności na wiersze osi: kropka amber i podpis mówiący, co jest nie tak.
 *
 * Podpis ZASTĘPUJE dotychczasowy (skład zrzutu, odczyty) — nie dokleja się do niego.
 * Wiersz ma jedną linię opisu i w chwili, gdy coś się nie zgadza, ważniejsze jest to,
 * co się nie zgadza, niż to, ile skoczków wyszło.
 *
 * Niespójności BEZ adresu (np. rachunek paliwa całej sesji) nie oznaczają żadnego
 * wiersza — zostają w banerze, gdzie mówią o sesji jako całości.
 */
export function withIssues(rows: AxisRow[], issues: readonly RuleViolation[]): AxisRow[] {
  if (issues.length === 0) return rows;
  const hints = issueHints(issues);
  if (hints.size === 0) return rows;

  return rows.map((row) => {
    const hint = row.targetUuid != null ? hints.get(row.targetUuid) : undefined;
    return hint == null ? row : { ...row, sub: hint, warned: true };
  });
}

/** Typ zdarzenia, które wolno dopisać w trybie edycji (arkusz 10H). */
export interface AddableType {
  type: Extract<
    EventType,
    'takeoff' | 'landing' | 'taxi' | 'drop' | 'boarding' | 'refuel' | 'oil_add'
  >;
  label: string;
}

/**
 * Co wolno dopisać do sesji.
 *
 * Lista to KOMPLET faktów operacyjnych, czyli dokładnie te typy, które domena uznaje za
 * korygowalne. Nie ma tu klamry silnika (`engine_start`/`engine_stop`): sesja ma jeden
 * bieg (`SESSION_ALREADY_RAN`), więc dopisanie drugiego łamałoby model, a czas istniejącej
 * klamry poprawia się ołówkiem. Nie ma też przejęcia ani zdania — te tworzą sesję.
 *
 * Zrzut i załadunek istnieją WYŁĄCZNIE w dniu skokowym (issue #19): przy przelocie czy
 * egzaminie ich po prostu nie ma. To brak akcji, nie blokada z powodem — `drop` nie może
 * się tam wydarzyć.
 */
export function addableTypes(operation: OperationType | null): AddableType[] {
  const base: AddableType[] = [
    { type: 'takeoff', label: 'Start' },
    { type: 'landing', label: 'Lądowanie' },
    { type: 'taxi', label: 'Kołowanie' },
  ];
  const jump: AddableType[] =
    operation != null && isJumpOperation(operation)
      ? [
          { type: 'drop', label: 'Zrzut' },
          { type: 'boarding', label: 'Załadunek' },
        ]
      : [];
  return [
    ...base,
    ...jump,
    { type: 'refuel', label: 'Tankowanie' },
    // Dolewka oleju (issue #60): `amend`-a świadomie nie ma (parytet z refuel), więc
    // dopisanie jest jedyną drogą naprawy po unieważnieniu błędnej dolewki po zdaniu.
    { type: 'oil_add', label: 'Dolewka oleju' },
  ];
}
