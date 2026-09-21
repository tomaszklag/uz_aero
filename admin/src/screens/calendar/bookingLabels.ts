/**
 * Ninerdeck - panel: NAPISY JEDNEJ ZAJĘTOŚCI (moduł Kalendarz, issue #160).
 *
 * Osobno od `calendarGrid.ts`, bo to dwie różne odpowiedzialności: tamten moduł rozkłada
 * zajętości na doby, ten nazywa je po polsku. Osobno od widoku, bo panel nie liczy
 * w komórce tabeli - reguła `architecture.test.ts` („arytmetyka NIE mieszka w widoku").
 *
 * ══ CZŁOWIEK MA NAZWISKO, MASZYNA MA KOD ══
 * Pasek siatki niesie SKRÓCONE NAZWISKO („J. Nowak"), a nie kod - kolumna ma 88 px, więc
 * i tak nie zmieści się nic dłuższego, a nazwisko czyta administrator bez zaglądania do
 * listy członków. Kod stoi przy nazwisku w szufladzie, w `cell-sub mono`: tam jest
 * wartością maszynową i tam ma odróżniać dwóch Nowaków.
 */

import { duration, shortName } from '@ninerdeck/format';

import type { BookingDto } from '../../api/dto';
import { NONE } from '../common/values';

/** Członek klubu rozwiązany z identyfikatora; `null` = nie ma go w cache członków. */
export interface Person {
  name: string;
  code: string;
}

export type PersonLookup = (pilotId: string) => Person | null;

/** Powody wyłączenia z użytku - rejestr mówi po angielsku, panel po polsku. */
const BLOCK_LABEL: Readonly<Record<string, string>> = {
  maintenance: 'Przegląd',
  defect: 'Usterka',
  other: 'Wyłączona',
};

/**
 * Rodzaje operacji - rejestr mówi po angielsku (`ferry` to identyfikator, nie napis).
 * Wartość nieznana wraca SOBĄ, bo panel starszy niż aplikacja nie ma prawa zgubić
 * zadania, którego jeszcze nie zna.
 */
const OPERATION: Readonly<Record<string, string>> = {
  skoki: 'Skoki',
  ferry: 'Przelot',
  egzamin: 'Egzamin',
  techniczny: 'Lot techniczny',
  inne: 'Inne',
};

export const operationLabel = (operation: string | null): string =>
  operation == null ? NONE : (OPERATION[operation] ?? operation);

export const blockReasonLabel = (reason: string | null): string =>
  BLOCK_LABEL[reason ?? 'other'] ?? BLOCK_LABEL.other!;

/**
 * Napis na pasku siatki.
 *
 * Przy WYŁĄCZENIU Z UŻYTKU wygrywa notatka („Przegląd 100 h"), bo powód z katalogu ma
 * trzy wartości i przy czterech maszynach w serwisie wszystkie wyglądałyby tak samo.
 * Pusta notatka wraca do nazwy z katalogu - pasek bez napisu byłby plamką bez znaczenia.
 */
export function cellLabel(booking: BookingDto, person: PersonLookup): string {
  if (booking.kind === 'block') {
    const note = booking.note?.trim() ?? '';
    return note === '' ? blockReasonLabel(booking.blockReason) : note;
  }
  if (booking.pilotId == null) return NONE;
  const who = person(booking.pilotId);
  // Brak w cache członków (pilot świeżo dodany, lista jeszcze nie doszła) daje kreskę,
  // nigdy surowego identyfikatora: `7c1e5a9b-…` nie mówi nic nikomu.
  return who == null ? NONE : shortName(who.name);
}

/**
 * Długość zajętości w podtytule szufladzi: „2 h", „2,5 h".
 *
 * Godziny dziesiętne, a nie „H:MM" z `duration` - i to nie jest niekonsekwencja wobec
 * reszty aplikacji. Czas blokowy jest POMIAREM i zapisuje się go `6:39`; długość terminu
 * jest UMOWĄ między ludźmi („weź maszynę na dwie godziny"), a takich nikt nie wypowiada
 * w minutach.
 */
export function hoursLabel(ms: number): string {
  const hours = Math.max(0, ms) / 3_600_000;
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')} h`;
}

/**
 * Tytuł i podtytuł szuflady jednej zajętości.
 *
 ══ TERMIN PRZEZ KILKA DÓB MUSI TO POWIEDZIEĆ W NAGŁÓWKU ══
 * Przegląd biegnie zwykle trzy dni, a nagłówek „środa, 23 września" z podtytułem
 * „06:00 → 18:00" opisywał go jako dwunastogodzinne okno w środę - czyli sam sobie
 * przeczył o dwie linijki niżej, przy „60 h". Makiety tego stanu nie rysują (pokazują
 * lot w jednej dobie), więc reguła jest tu decyzją: przy jednej dobie nagłówek nazywa
 * ją z dnia tygodnia, a przy kilku - podaje zakres dat, a godziny dostają przy sobie
 * swoje dni.
 *
 * Godziny rysuje strefa KLUBU, nie przeglądarki: kalendarz jest wspólnym zasobem,
 * więc „09:00" ma znaczyć to samo administratorowi przy biurku i pilotowi na lotnisku.
 */
export function drawerHeading(booking: BookingDto, reg: string, timezone: string): DrawerHeading {
  const od = new Date(booking.startsAt);
  const doo = new Date(booking.endsAt);
  const rodzaj = booking.kind === 'block' ? 'wyłączenie z użytku' : 'rezerwacja pilota';
  const ile = hoursLabel(doo.getTime() - od.getTime());
  const jednaDoba = dzien(od, timezone) === dzien(doo, timezone);

  const czas = jednaDoba
    ? `${godzina(od, timezone)} → ${godzina(doo, timezone)}`
    : `${stempel(od, timezone)} → ${stempel(doo, timezone)}`;

  return {
    title: `${reg} · ${jednaDoba ? dobaZDniem(od, timezone) : zakresDat(od, doo, timezone)}`,
    sub: `${czas} czasu klubu · ${ile} · ${rodzaj}`,
  };
}

export interface DrawerHeading {
  title: string;
  sub: string;
}

const fmt = (timezone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('pl-PL', { ...options, timeZone: timezone || undefined });

/** Data w strefie klubu jako `RRRR-MM-DD` - do porównania dób, nie do czytania. */
const dzien = (at: Date, tz: string): string =>
  fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

export const godzina = (at: Date, tz: string): string =>
  fmt(tz, { hour: '2-digit', minute: '2-digit' }).format(at);

export const stempel = (at: Date, tz: string): string =>
  fmt(tz, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(at);

const dobaZDniem = (at: Date, tz: string): string =>
  fmt(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(at);

/**
 * „23-25 września" w jednym miesiącu, „30 września - 2 października" na przełomie:
 * miesiąc powtarzany po obu stronach czyta się jak dwie osobne daty, a nie jak zakres.
 *
 * Nazwa miesiąca bierze się z CZĘŚCI sformatowanej daty, nigdy z `{ month: 'long' }`
 * osobno: samo pole daje MIANOWNIK („wrzesień"), a w dacie potrzebny jest dopełniacz
 * („23 września"). Odmiany nie da się dopisać regułą, więc pyta się o nią `Intl`.
 */
function zakresDat(od: Date, doo: Date, tz: string): string {
  const dzienIMiesiac = fmt(tz, { day: 'numeric', month: 'long' });
  const miesiacOd = czesc(dzienIMiesiac, od, 'month');
  const miesiacDo = czesc(dzienIMiesiac, doo, 'month');
  const dzienOd = czesc(dzienIMiesiac, od, 'day');
  return miesiacOd === miesiacDo
    ? `${dzienOd}-${dzienIMiesiac.format(doo)}`
    : `${dzienIMiesiac.format(od)} - ${dzienIMiesiac.format(doo)}`;
}

const czesc = (f: Intl.DateTimeFormat, at: Date, typ: Intl.DateTimeFormatPartTypes): string =>
  f.formatToParts(at).find((p) => p.type === typ)?.value ?? '';

/**
 * Pochodzenie zajętości: „przez pilota, z aplikacji" albo „z panelu".
 *
 * Makieta odpowiada tu na SKĄD, nie na KTO - i to jest lepsze pytanie: administrator
 * patrzy na cudzy termin i chce wiedzieć, czy założył go pilot sam, czy ktoś z biurka.
 * Przy okazji omija ODMIANĘ nazwiska: „przez Tomasz Malkiewicz" jest błędem, a odmiany
 * nie da się wyprowadzić regułą (ta sama granica, przez którą blokady arkuszy mówią
 * o skutku zamiast wołać nazwy pól po imieniu). Kto - mówi KOD, który się nie odmienia.
 */
export function originLabel(booking: BookingDto, person: PersonLookup): string {
  if (booking.pilotId != null && booking.createdBy === booking.pilotId) return 'przez pilota, z aplikacji';
  const kto = person(booking.createdBy);
  return kto == null ? 'z panelu' : `z panelu · ${kto.code}`;
}

/**
 * Plan lotu z rezerwacji: „1:30 · paliwo 120 L". Oba człony są opcjonalne, bo pilot
 * deklaruje je, gdy chce - pusty napis znaczy, że wiersza w szufladzie nie ma wcale.
 */
export function plannedLabel(booking: BookingDto): string {
  const parts: string[] = [];
  if (booking.plannedAirMin != null) parts.push(duration(booking.plannedAirMin * 60_000));
  if (booking.plannedFuelL != null) parts.push(`paliwo ${booking.plannedFuelL} L`);
  return parts.join(' · ');
}
