/**
 * Ninerdeck - panel: SIATKA KALENDARZA (moduł Kalendarz, `docs/rezerwacje.md` §10).
 *
 * ══ PANEL PATRZY SZERZEJ NIŻ TELEFON I TO JEST CAŁA RÓŻNICA ══
 * Na telefonie osią kalendarza jest JEDNA DOBA całej floty („czym polecę dzisiaj"),
 * tutaj maszyny × DNI („kto ma zaplanowane loty, kiedy wcisnąć przegląd, czy da się
 * zwolnić maszynę na wyjazd"). Ta sama zajętość, dwa pytania, dwa kadry.
 *
 * ══ ZAJĘTOŚĆ TRAFIA DO KAŻDEJ DOBY, KTÓREJ DOTYKA ══
 * Wyłączenie z użytku na trzy dni ma stać w trzech kolumnach, a nie tylko w tej, w której
 * się zaczyna - inaczej środa wyglądałaby na wolną, choć maszyna stoi w serwisie. Stąd
 * przynależność liczy się NAKŁADANIEM na dobę, nie jej początkiem.
 *
 * ══ MASZYNY WYŁĄCZONE ZE SŁUŻBY ZOSTAJĄ W SIATCE ══
 * Reguła zwijania z R-A: zwijamy to, czego administrator NIE SZUKA, wchodząc na ekran -
 * a „czemu nie ma czym latać" jest dokładnie tym, po co się tu wchodzi. Wiersz takiej
 * maszyny jest wyciszony, nie schowany.
 */

import type { BookingDto, CalendarDayDto } from '../../api/dto';
import { cellLabel, type PersonLookup } from './bookingLabels';

/** Maszyna w siatce - tyle, ile trzeba, żeby narysować lewą kolumnę. */
export interface CalendarAircraft {
  id: string;
  reg: string;
  type: string;
  inService: boolean;
}

/** Jedna zajętość w komórce, gotowa do narysowania. */
export interface CalendarItem {
  id: string;
  kind: BookingDto['kind'];
  status: BookingDto['status'];
  /** Napis na pasku: skrócone nazwisko pilota albo powód wyłączenia z użytku. */
  label: string;
  startsAt: number;
  endsAt: number;
  /** Zajętość zaczęła się PRZED tą dobą - pasek jest jej ciągiem dalszym. */
  continues: boolean;
}

export interface CalendarCell {
  date: string;
  items: CalendarItem[];
}

export interface CalendarRow {
  aircraft: CalendarAircraft;
  cells: CalendarCell[];
}

export interface GridInput {
  days: readonly CalendarDayDto[];
  aircraft: readonly CalendarAircraft[];
  bookings: readonly BookingDto[];
  /** Członek klubu z identyfikatora; `null` = nie ma go w cache członków. */
  person: PersonLookup;
}

/**
 * Wiersze siatki w kolejności floty, z zajętościami rozłożonymi na doby.
 *
 * Kolejność zajętości w komórce jest kolejnością CZASU, nie przypadkiem odpowiedzi:
 * dwa paski w jednej dobie czyta się od rana, jak wszystko inne w tej aplikacji.
 */
export function buildCalendarGrid(input: GridInput): CalendarRow[] {
  const byAircraft = new Map<string, BookingDto[]>();
  for (const booking of input.bookings) {
    const list = byAircraft.get(booking.aircraftId);
    if (list == null) byAircraft.set(booking.aircraftId, [booking]);
    else list.push(booking);
  }

  return input.aircraft.map((aircraft) => ({
    aircraft,
    cells: input.days.map((day) => ({
      date: day.date,
      items: itemsIn(byAircraft.get(aircraft.id) ?? [], day, input.person),
    })),
  }));
}

function itemsIn(
  bookings: readonly BookingDto[],
  day: CalendarDayDto,
  person: PersonLookup,
): CalendarItem[] {
  const from = Date.parse(day.startsAt);
  const to = Date.parse(day.endsAt);

  return bookings
    .map((booking) => ({
      booking,
      startsAt: Date.parse(booking.startsAt),
      endsAt: Date.parse(booking.endsAt),
    }))
    // Granice PÓŁOTWARTE, jak wszędzie w rezerwacjach: rezerwacja kończąca się
    // dokładnie o północy należy do doby, która się wtedy kończy, a nie do obu.
    .filter((b) => b.startsAt < to && b.endsAt > from)
    .sort((a, b) => a.startsAt - b.startsAt)
    .map(({ booking, startsAt, endsAt }) => ({
      id: booking.id,
      kind: booking.kind,
      status: booking.status,
      label: cellLabel(booking, person),
      startsAt,
      endsAt,
      continues: startsAt < from,
    }));
}

/**
 * Czy w siatce stoi cokolwiek. Pusta flota i flota bez rezerwacji to DWA różne stany
 * i ekran mówi o nich co innego: bez maszyn nie ma czego rezerwować, bez rezerwacji -
 * kalendarz jest po prostu wolny.
 */
export const hasAnyItem = (rows: readonly CalendarRow[]): boolean =>
  rows.some((row) => row.cells.some((cell) => cell.items.length > 0));
