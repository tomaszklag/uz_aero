/**
 * Ninerdeck - OŚ FLOTY kalendarza: maszyny × godziny (21, rezerwacje 3.0.0).
 *
 * Pytanie ze zgłoszenia #145 brzmi „który samolot jest wolny i kiedy", więc osią
 * porównania są MASZYNY jednej doby, a nie tydzień jednej maszyny. Ten moduł zamienia
 * zajętości w POZYCJE - procent od lewej i szerokość - i nic poza tym nie rysuje.
 *
 * ══ OKNO OSI TO DOBA LOTNA, NIE DOBA KALENDARZOWA ══
 * 24 godziny ściśnięte do szerokości telefonu robią z każdego lotu kreskę, a o trzeciej
 * w nocy nikt nie lata. Granice liczy `flightDayWindow` z `@ninerdeck/domain` - ten sam
 * kod, którym serwer liczy okno dla sugestii slotów, więc siatka i propozycje mówią
 * o tym samym dniu. Bez lotniska macierzystego schodzi do okna domyślnego i jest to
 * widoczne w `windowBasis` - ekran ma umieć przemilczeć „doba lotna", gdy jej nie liczył.
 *
 * ══ REZERWACJA WYSTAJĄCA POZA OKNO ROZCIĄGA JE, WYŁĄCZENIE Z UŻYTKU - NIE ══
 * To nie jest niekonsekwencja, tylko dwa różne byty. Wyłączenie z użytku opisuje MASZYNĘ
 * („w serwisie") i zwykle obejmuje całą dobę albo więcej - rozciąganie osi do jego granic
 * zgniotłoby godziny lotne do paska, a przycięcie niczego nie gubi, bo maszyna jest
 * niedostępna także w widocznym oknie. Rezerwacja opisuje CZYJŚ PLAN i ukrycie jej
 * znaczyłoby ukrycie realnej kolizji przed kimś, kto właśnie szuka wolnego terminu.
 */

import { airfieldByIcao, flightDayWindow, type DayWindow } from '@ninerdeck/domain';
import { shortName } from '@ninerdeck/format';

import type { ReferenceAircraft } from '../../../domain';

import { bookingsOnDay, type CalendarBooking } from './calendarData';
import { clubAtHour, clubHour, type ClubDayBounds } from './clubClock';

/** Ton paska - kolor i kształt niosą, CZYJA to zajętość i co z nią wolno zrobić. */
export type BarTone = 'mine' | 'pending' | 'other' | 'block';

export interface CalendarBar {
  bookingId: string;
  /** Procent szerokości ścieżki, od lewej krawędzi okna. */
  leftPct: number;
  widthPct: number;
  label: string;
  tone: BarTone;
}

export interface FleetRow {
  aircraftId: string;
  reg: string;
  type: string;
  bars: CalendarBar[];
}

/** Podpis skali stojący POD osią, na swoim procencie - nie w równych odstępach. */
export interface ScaleMark {
  pct: number;
  text: string;
}

export interface FleetGrid {
  /** Granice okna - te same, w których liczą się procenty pasków. */
  from: number;
  to: number;
  windowBasis: DayWindow['basis'];
  /** Linie pełnych godzin (procenty) i te z nich, pod którymi stoi podpis. */
  hourTicks: number[];
  majorTicks: number[];
  scale: ScaleMark[];
  /** Pozycja linii „teraz"; `null` = inna doba albo chwila poza oknem. */
  nowPct: number | null;
  rows: FleetRow[];
  /** Tony obecne na osi - legenda opisuje to, co widać, i nic ponadto. */
  legend: BarTone[];
}

export interface FleetGridInput {
  day: ClubDayBounds;
  /** Maszyny PO zawężeniu filtrem, w kolejności wyświetlania. */
  aircraft: readonly ReferenceAircraft[];
  bookings: readonly CalendarBooking[];
  /** Lotnisko macierzyste klubu (ICAO); `null` = okno domyślne. */
  homeIcao: string | null;
  pilotId: string;
  /** Kod pilota z cache floty - `usePilotCode`. */
  codeOf: (id: string | null) => string | null;
  /** Imię i nazwisko z cache floty; `null` = pilot spoza cache'u. */
  nameOf: (id: string | null) => string | null;
  now: number;
}

/** Ile najwyżej podpisów zmieści się pod osią na szerokości telefonu. */
const MAX_SCALE_MARKS = 6;
/** Pasek węższy niż to i tak nie da się dotknąć - szerokość podnosimy do progu. */
const MIN_BAR_PCT = 1.6;

export function buildFleetGrid(input: FleetGridInput): FleetGrid {
  const home = airfieldByIcao(input.homeIcao);
  const window = flightDayWindow(
    input.day,
    home == null ? null : { lat: home.lat, lon: home.lon },
  );

  const onDay = bookingsOnDay(input.bookings, input.day);
  const bounds = stretched(window, onDay, input.day);
  const span = bounds.to - bounds.from;

  const rows = input.aircraft.map((ac) => ({
    aircraftId: ac.id,
    reg: ac.reg,
    type: ac.type,
    bars: onDay
      .filter((b) => b.aircraftId === ac.id)
      .filter((b) => b.startsAt < bounds.to && b.endsAt > bounds.from)
      .sort((a, b) => a.startsAt - b.startsAt)
      .map((b) => bar(b, bounds, span, input)),
  }));

  const marks = scaleMarks(bounds, span, input.day);

  const tones = new Set<BarTone>();
  for (const row of rows) for (const b of row.bars) tones.add(b.tone);

  return {
    from: bounds.from,
    to: bounds.to,
    windowBasis: window.basis,
    hourTicks: hourTicks(bounds, span, input.day),
    // Mocniejsza linia stoi DOKŁADNIE pod swoim podpisem - dwa osobne rachunki
    // kotwiczyły się inaczej i rozjeżdżały o godzinę na oknie zaczynającym się
    // w środku godziny (doba lotna 04:02). Krawędzie odpadają: podpis na nich
    // stoi, ale linia zlałaby się z obramowaniem ścieżki.
    majorTicks: marks.filter((m) => m.pct > 0 && m.pct < 100).map((m) => m.pct),
    scale: marks,
    nowPct:
      input.now >= bounds.from && input.now < bounds.to
        ? ((input.now - bounds.from) / span) * 100
        : null,
    rows,
    // Kolejność legendy jest STAŁA, a nie taka, w jakiej tony trafiły się na osi:
    // legenda przestawiająca się przy każdej zmianie doby każe czytać ją od nowa.
    legend: (['mine', 'other', 'block'] as const).filter((t) => tones.has(t)),
  };
}

/** Okno rozciągnięte o rezerwacje wystające poza dobę lotną, przycięte do doby. */
function stretched(
  window: DayWindow,
  onDay: readonly CalendarBooking[],
  day: ClubDayBounds,
): { from: number; to: number } {
  let from = window.from;
  let to = window.to;

  for (const b of onDay) {
    if (b.kind !== 'flight') continue;
    from = Math.min(from, Math.max(day.startsAt, b.startsAt));
    to = Math.max(to, Math.min(day.endsAt, b.endsAt));
  }

  // Okno zdegenerowane (klub polarny, doba o dziwnej długości) zastępujemy dobą:
  // oś o zerowej szerokości nie jest osią, a dzielenie przez nią daje nieskończoności.
  return to > from ? { from, to } : { from: day.startsAt, to: day.endsAt };
}

function bar(
  booking: CalendarBooking,
  bounds: { from: number; to: number },
  span: number,
  input: FleetGridInput,
): CalendarBar {
  const from = Math.max(booking.startsAt, bounds.from);
  const to = Math.min(booking.endsAt, bounds.to);
  const leftPct = ((from - bounds.from) / span) * 100;
  const widthPct = Math.max(MIN_BAR_PCT, ((to - from) / span) * 100);

  return {
    bookingId: booking.id,
    leftPct,
    // Pasek przy prawej krawędzi podniesiony do progu nie ma prawa z niej wyjechać.
    widthPct: Math.min(widthPct, 100 - leftPct),
    label: barLabel(booking, input),
    tone: barTone(booking, input.pilotId),
  };
}

/**
 * Napis na pasku.
 *
 * WŁASNA rezerwacja niesie KOD pilota, cudza - skrócone nazwisko, i to jest wierne
 * makiecie 21. Powód jest praktyczny: własne paski bywają wąskie (godzina to ~7%
 * szerokości ekranu), a kod jest najkrótszą nazwą, jaką aplikacja daje pilotowi -
 * tą samą, którą pisze w sygnaturze operacji i w składzie załogi. Przy cudzej
 * rezerwacji nazwisko odpowiada na pytanie „kogo zapytać o zamianę", a kod tego
 * nie robi: kodów kolegów nikt nie pamięta.
 */
function barLabel(booking: CalendarBooking, input: FleetGridInput): string {
  if (booking.kind === 'block') return booking.blockReason ?? 'Wyłączony z użytku';

  if (booking.pilotId === input.pilotId) {
    return input.codeOf(booking.pilotId) ?? 'Twoja';
  }

  const name = input.nameOf(booking.pilotId);
  if (name != null) return shortName(name);
  // Pilot spoza cache'u floty - kod jest wtedy jedyną nazwą, jaka została.
  return input.codeOf(booking.pilotId) ?? 'Zajęte';
}

function barTone(booking: CalendarBooking, pilotId: string): BarTone {
  if (booking.kind === 'block') return 'block';
  if (booking.pilotId !== pilotId) return 'other';
  // Czeka na akceptację (3.1.0) - ten sam ton, inny KSZTAŁT ramki. Stan przejściowy
  // odróżnia się kształtem, nie samym kolorem.
  return booking.status === 'pending' ? 'pending' : 'mine';
}

/**
 * Pozycje pełnych godzin ściennych wewnątrz okna, bez krawędzi.
 *
 * Linie są ODCZYTEM, nie ozdobą: bez nich paska „gdzieś koło południa" nie da się
 * przeczytać co do godziny. Krawędzi nie rysujemy - tam stoi obramowanie ścieżki.
 */
function hourTicks(
  bounds: { from: number; to: number },
  span: number,
  day: ClubDayBounds,
): number[] {
  const marks: number[] = [];

  for (let h = clubHour(bounds.from, day) + 1; ; h += 1) {
    const at = clubAtHour(day, h);
    if (at >= bounds.to) break;
    marks.push(((at - bounds.from) / span) * 100);
  }
  return marks;
}

/** Co ile godzin stoi mocniejsza linia - tak, żeby zostało ich kilka, a nie kilkanaście. */
function majorStep(span: number): number {
  return Math.max(1, Math.ceil(span / 3_600_000 / MAX_SCALE_MARKS));
}

/**
 * Podpisy godzin - WYŁĄCZNIE pełne godziny, każda na swoim procencie.
 *
 * Krawędzi okna nie podpisujemy i to jest decyzja: doba lotna zaczyna się o 04:02,
 * więc podpis brzegu musiałby być w formacie hh:mm i stałby w jednym rzędzie
 * z godzinami pisanymi dwiema cyframi - dwa formaty w jednej skali czyta się gorzej
 * niż niepodpisany brzeg, który i tak nazywa nagłówek doby.
 *
 * Odstępy NIE SĄ równe (makieta rysuje `space-between` na oknie 06-21, gdzie akurat
 * wychodzą równe): na oknie z efemeryd każda godzina stoi tam, gdzie naprawdę wypada.
 */
function scaleMarks(
  bounds: { from: number; to: number },
  span: number,
  day: ClubDayBounds,
): ScaleMark[] {
  const step = majorStep(span);
  const first = Math.ceil(clubHour(bounds.from, day) / step) * step;
  const marks: ScaleMark[] = [];

  for (let h = first; ; h += step) {
    const at = clubAtHour(day, h);
    // Klamra DOMKNIĘTA: na oknie domyślnym krawędzie wypadają dokładnie o 06 i 21,
    // a to są godziny niosące treść - makieta podpisuje je obie.
    if (at > bounds.to) break;
    if (at >= bounds.from) marks.push({ pct: ((at - bounds.from) / span) * 100, text: pad(h) });
  }
  return marks;
}

function pad(hour: number): string {
  return hour < 10 ? `0${hour}` : String(hour);
}
