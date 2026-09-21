/**
 * Ninerdeck - KARTA REZERWACJI (`design/23`, #162 F7).
 *
 * ══ BOHATEREM EKRANU JEST TERMIN ══
 * To on jest przedmiotem rezerwacji - maszyna, zadanie i trasa tylko go opisują.
 * Dlatego godziny stoją wielkim składem na górze, a wszystko inne jest wierszem karty.
 *
 * ══ PLAN TO NIE FAKT ══
 * Czas lotu, paliwo i notatka opisują PRZYSZŁOŚĆ, której rejestr nie zna. Po locie
 * mają swoje faktyczne odpowiedniki na ekranie operacji (10) i to TAMTE wchodzą do
 * rozliczenia. Karty „plan kontra fakt" tu nie ma i nie będzie: rezerwacja zamyka się
 * w chwili, w której zaczyna się operacja.
 *
 * ══ CO WOLNO, LICZY SIĘ TU, A NIE W JSX ══
 * Odwołać da się WŁASNĄ rezerwację, która jeszcze się nie skończyła i nie jest
 * zamknięta; poprawić - własną, która się jeszcze nie zaczęła. Rozdzielenie jest
 * celowe: termin, który już trwa, można oddać (pilot nie poleci), ale przesuwanie
 * go wstecz opisywałoby przeszłość.
 */

import { duration, litres, relativeAge } from '@ninerdeck/format';

import type { CalendarBooking } from './calendarData';
import { clubHhmm, type ClubDayBounds } from './clubClock';
import { dayHeading } from './calendarHeading';
import { operationLabelOf } from './operations';

export interface BookingDetailsInput {
  booking: CalendarBooking;
  day: ClubDayBounds;
  now: number;
  /** Ten pilot - cudza rezerwacja nie ma ani odwołania, ani poprawki. */
  pilotId: string;
  /** Znak i typ maszyny z cache floty; `null` = poza cache'em. */
  aircraft: { reg: string; type: string | null } | null;
  /** Imię i nazwisko drugiego pilota; `null` = poza cache'em albo lot bez Duala. */
  dualName: string | null;
  dualCode: string | null;
  /** Nazwa lotniska po kodzie ICAO - rozwinięcie skrótu, nie druga informacja. */
  airfieldName: (icao: string) => string | null;
}

export interface BookingDetailRow {
  label: string;
  value: string;
  sub: string | null;
}

export interface BookingDetailsVm {
  /** „Sobota 19 września" - czas klubu, jak cała siatka. */
  date: string;
  /** Stan rezerwacji: „Potwierdzona", „Odwołana", „Slot zwolniony". */
  badge: string;
  /** „09:00 → 11:00". */
  hours: string;
  /** „2 h" - długość terminu, nie planowany czas lotu. */
  length: string;
  /** „ZA 1 H 15 MIN", „TRWA"; `null` = termin minął albo rezerwacja zamknięta. */
  countdown: string | null;
  /** Co rezerwujesz: maszyna, zadanie, trasa, drugi pilot. */
  what: BookingDetailRow[];
  /** Plan lotu; pusta lista = pilot nie podał nic i sekcji nie ma. */
  plan: BookingDetailRow[];
  canCancel: boolean;
  canEdit: boolean;
}

const STATUS: Readonly<Record<string, string>> = {
  confirmed: 'Potwierdzona',
  pending: 'Czeka na zgodę',
  rejected: 'Odrzucona',
  cancelled: 'Odwołana',
  released: 'Slot zwolniony',
};

export function bookingDetails(input: BookingDetailsInput): BookingDetailsVm {
  const b = input.booking;
  const mine = b.pilotId === input.pilotId;
  const open = b.status === 'confirmed' || b.status === 'pending';

  return {
    date: dayHeading(input.day),
    // Stan nieznany temu wydaniu jedzie SUROWY: nowszy serwer dokłada statusy
    // (3.1.0 - zgoda i odrzucenie), a „nieznany" mówiłby pilotowi mniej niż kod.
    badge: STATUS[b.status] ?? b.status,
    hours: `${clubHhmm(b.startsAt, input.day)} → ${clubHhmm(b.endsAt, input.day)}`,
    length: relativeAge(b.endsAt - b.startsAt),
    countdown: countdown(b, input.now, open),
    what: whatRows(input),
    plan: planRows(b),
    canCancel: mine && open && b.endsAt > input.now,
    canEdit: mine && open && b.startsAt > input.now,
  };
}

function countdown(b: CalendarBooking, now: number, open: boolean): string | null {
  if (!open) return null;
  // Termin, który TRWA, nie dostaje liczby: odliczanie do przeszłości nie znaczy nic,
  // a „minęło 20 min" jest zdaniem o locie, nie o rezerwacji.
  if (now >= b.startsAt) return now < b.endsAt ? 'TRWA' : null;
  return `ZA ${relativeAge(b.startsAt - now)}`.toUpperCase();
}

function whatRows(input: BookingDetailsInput): BookingDetailRow[] {
  const b = input.booking;
  const rows: BookingDetailRow[] = [
    {
      label: 'Samolot',
      value: input.aircraft?.reg ?? b.aircraftId,
      sub: input.aircraft?.type ?? null,
    },
  ];

  // Rodzaj nieznany temu wydaniu nie dostaje wiersza: „ferry" na karcie byłoby
  // napisem z wnętrza bazy pokazanym pilotowi (`operationLabelOf`).
  const zadanie = operationLabelOf(b.operation);
  if (zadanie != null) {
    rows.push({ label: 'Zadanie', value: zadanie, sub: null });
  }

  const route = routeRow(input);
  if (route != null) rows.push(route);

  if (b.dualId != null) {
    rows.push({
      label: 'Drugi pilot',
      value: input.dualCode ?? b.dualId,
      sub: input.dualName,
    });
  }

  return rows;
}

function routeRow(input: BookingDetailsInput): BookingDetailRow | null {
  const { fromIcao, toIcao } = input.booking;
  if (fromIcao == null && toIcao == null) return null;

  // Skoki startują i lądują na tym samym placu, więc para powtarzałaby kod dwa razy
  // (issue #13 - reguła mieszka w domenie, a tu widać jej skutek).
  const same = fromIcao != null && toIcao != null && fromIcao === toIcao;
  if (same || toIcao == null) {
    const icao = fromIcao ?? toIcao!;
    return { label: 'Lotnisko', value: icao, sub: input.airfieldName(icao) };
  }
  if (fromIcao == null) {
    return { label: 'Lądowanie', value: toIcao, sub: input.airfieldName(toIcao) };
  }

  const from = input.airfieldName(fromIcao);
  const to = input.airfieldName(toIcao);
  return {
    label: 'Trasa',
    value: `${fromIcao} → ${toIcao}`,
    // Rozwinięcie jest parą albo go nie ma: jedna znana nazwa obok surowego kodu
    // wyglądałaby na brak danych po drugiej stronie strzałki.
    sub: from != null && to != null ? `${from} → ${to}` : null,
  };
}

function planRows(b: CalendarBooking): BookingDetailRow[] {
  const rows: BookingDetailRow[] = [];

  if (b.plannedAirMin != null) {
    rows.push({ label: 'Czas lotu', value: duration(b.plannedAirMin * 60_000), sub: null });
  }
  if (b.plannedFuelL != null) {
    rows.push({ label: 'Paliwo', value: litres(b.plannedFuelL), sub: 'do zabrania' });
  }
  if (b.note != null && b.note.trim() !== '') {
    rows.push({ label: 'Notatka', value: b.note.trim(), sub: null });
  }

  return rows;
}
