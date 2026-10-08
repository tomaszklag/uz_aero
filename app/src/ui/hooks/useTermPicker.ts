/**
 * Ninerdeck - KROK „TERMIN I MASZYNA" formularzy terminu: rezerwacji (22) i zlecenia (31).
 *
 * Zlecenie jest rezerwacją, która szuka załogi (`docs/zlecenia.md` §2.1, §14.4), więc jego
 * krok 1 jest krokiem 1 rezerwacji 1:1: te same chipy dni, te same karty maszyn z paskiem
 * zajętości, te same sugestie godzin i ta sama para Od/Do. Ten hook liczy wszystko, co ten
 * krok pokazuje, a `screens/TermStep.tsx` to rysuje - formularze różnią się wyłącznie
 * tym, co robią z wybranym terminem.
 *
 * ══ CAŁY KROK WYMAGA SIECI ══
 * Zajętości floty przychodzą z serwera przy każdym wejściu i z kanałem klubu (§2.2) -
 * `data: null` znaczy „nie wiem" i formularz mówi to wprost.
 *
 * ══ TERMIN POPRAWIANY NIE ZDERZA SIĘ SAM ZE SOBĄ ══
 * Poprawka rezerwacji i edycja zlecenia zaczynają od terminu, który stoi już w kalendarzu.
 * `except` wyjmuje go z zajętości - inaczej karta maszyny pokazywałaby go jako cudzy pasek,
 * a bramka kroku blokowałaby „DALEJ", zanim pilot cokolwiek ruszy.
 */

import { useMemo, useState } from 'react';

import type { ReferenceAircraft } from '../../domain';
import { buildAircraftOptions, type AircraftOptionVm } from '../screens/logic/aircraftAvailability';
import { bookingsExcept, type TermDraft } from '../screens/logic/bookingSteps';
import { bookingsOnDay, type CalendarBooking, type CalendarData } from '../screens/logic/calendarData';
import { defaultDay } from '../screens/logic/calendarDays';
import { buildFleetGrid, type FleetGrid } from '../screens/logic/calendarGrid';
import type { ClubDayBounds } from '../screens/logic/clubClock';
import { buildSlotChips, type SlotChipVm } from '../screens/logic/slotChips';
import { useCalendar } from './useCalendar';
import { useFleet } from './useFleet';
import { useSlotSuggestions } from './useSlotSuggestions';

export interface TermPickerInput {
  term: TermDraft;
  /**
   * Godzina, w którą pilot wycelował na osi kalendarza - ŻYCZENIE, nie termin. Podstawiona
   * jako początek wyglądałaby jak wpisana (issue #62), więc jedzie do sugestii, które
   * premiują sloty blisko niej.
   */
  preferredAt: number | null;
  /** Kotwica okna kalendarza na start; bez niej - `preferredAt`, a bez obu - dziś. */
  anchor?: number | null;
  /** Sugestie pytają serwer wyłącznie wtedy, gdy krok terminu jest na ekranie. */
  active: boolean;
  /** Termin, który formularz poprawia; `null` = nowy. */
  except: string | null;
  now: number;
  pilotId: string;
  nameOf: (id: string | null) => string | null;
}

export interface TermPicker {
  /** `undefined` = pytanie w toku, `null` = nie wiadomo (brak sieci). */
  data: CalendarData | null | undefined;
  /** Data spoza okna przestawia kotwicę - następna odpowiedź przyniesie doby wokół niej. */
  setAnchor: (at: number) => void;
  selected: string | null;
  day: ClubDayBounds | null;
  /** Zajętości wybranej doby - bez poprawianego terminu. */
  onDay: CalendarBooking[];
  grid: FleetGrid | null;
  fleet: ReferenceAircraft[];
  aircraft: ReferenceAircraft | null;
  options: AircraftOptionVm[];
  /** Długość ustawionego terminu w minutach; `null` = jeszcze bez godzin. */
  minutes: number | null;
  chips: SlotChipVm[];
}

export function useTermPicker(input: TermPickerInput): TermPicker {
  const { term, preferredAt, active, except, now, pilotId, nameOf } = input;
  const { aircraft: fleet } = useFleet();

  const [anchor, setAnchor] = useState<number | null>(input.anchor ?? preferredAt);
  const { data } = useCalendar(anchor);

  const bookings = useMemo(() => (data == null ? [] : bookingsExcept(data.bookings, except)), [data, except]);

  // ── doba ──────────────────────────────────────────────────────────────────
  const selected = useMemo(() => {
    if (data == null) return null;
    if (term.date != null && data.days.some((d) => d.date === term.date)) return term.date;
    return defaultDay(data.days, anchor ?? now);
  }, [data, term.date, anchor, now]);

  const day = data?.days.find((d) => d.date === selected) ?? null;
  const onDay = useMemo(() => (day == null ? [] : bookingsOnDay(bookings, day)), [bookings, day]);

  // Okno osi - to samo, w którym liczą się procenty pasków w kalendarzu. Bierzemy je
  // z `buildFleetGrid`, żeby karta samolotu i zakładka Kalendarz nie rysowały tej samej
  // doby w dwóch różnych skalach.
  const grid = useMemo(
    () =>
      data == null || day == null
        ? null
        : buildFleetGrid({
            day,
            aircraft: fleet,
            bookings,
            homeIcao: data.homeIcao,
            pilotId,
            codeOf: () => null,
            nameOf: () => null,
            now,
          }),
    [data, day, fleet, bookings, pilotId, now],
  );

  const aircraft = fleet.find((a) => a.id === term.aircraftId) ?? null;
  const options = useMemo(
    () =>
      day == null || grid == null
        ? []
        : buildAircraftOptions({ aircraft: fleet, bookings: onDay, day, window: { from: grid.from, to: grid.to } }),
    [fleet, onDay, day, grid],
  );

  // ── sugestie godzin ───────────────────────────────────────────────────────
  const minutes =
    term.startsAt != null && term.endsAt != null && term.endsAt > term.startsAt
      ? Math.round((term.endsAt - term.startsAt) / 60_000)
      : null;

  const { data: slots } = useSlotSuggestions({
    aircraftId: term.aircraftId,
    day: day == null ? null : (day.startsAt + day.endsAt) / 2,
    // Bez ustawionego terminu proponujemy dwie godziny - tyle trwa typowy lot klubowy,
    // a sugestia bez długości nie miałaby czego zaproponować.
    minutes: minutes ?? 120,
    preferredAt,
    enabled: active,
  });

  const chips = useMemo(
    () =>
      day == null || grid == null || slots == null
        ? []
        : buildSlotChips({
            slots: slots.suggestions,
            busy: onDay.filter((b) => b.aircraftId === term.aircraftId),
            day,
            window: { from: grid.from, to: grid.to },
            startsAt: term.startsAt,
            endsAt: term.endsAt,
            nameOf,
          }),
    [slots, onDay, day, grid, term.aircraftId, term.startsAt, term.endsAt, nameOf],
  );

  return { data, setAnchor, selected, day, onDay, grid, fleet, aircraft, options, minutes, chips };
}
