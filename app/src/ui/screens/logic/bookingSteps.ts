/**
 * Ninerdeck - BRAMKI DWÓCH KROKÓW REZERWACJI (22, 22A).
 *
 * Powód, dla którego nie da się przejść dalej, stoi WEWNĄTRZ przycisku (issue #55) -
 * nie w banerze pod listą wyboru. Pilot napotyka blokadę przy przycisku i tam szuka
 * odpowiedzi; jeden wyjątek od tej reguły kosztuje więcej niż powtórzenie, którego
 * miał oszczędzić.
 *
 * ══ KOLEJNOŚĆ SPRAWDZEŃ JEST KOLEJNOŚCIĄ CZYNNOŚCI ══
 * Przycisk pokazuje JEDNO zdanie, więc pierwsze musi być tym, które pilot ma zrobić
 * teraz - a nie najpoważniejszym z brakujących. Stąd „wybierz samolot" przed „ustaw
 * godziny": bez maszyny godziny nie mają czego zająć.
 *
 * ══ CZEGO TU NIE MA ══
 * Sprawdzenia, czy slot jest wolny NA SERWERZE. Rezerwacja jest przedmiotem konkurencji
 * i rozstrzyga ją baza (`EXCLUDE USING gist`), a nie formularz - lokalnie wiemy tylko
 * tyle, ile przyszło w ostatniej odpowiedzi. Kolizja WIDOCZNA w tej odpowiedzi jest
 * blokadą, bo pilot patrzy na ten sam pasek; kolizja, która powstała minutę temu
 * u kolegi, wróci jako `409 slot_taken` z treścią (§5.1).
 */

/**
 * Długości mówimy PO LUDZKU („2 h", „30 min"), a nie zegarowo („2:00"): to są odcinki
 * czasu w zdaniu, nie odczyty licznika. `relativeAge` bierze CZAS TRWANIA w ms i tak
 * jest opisana - jej nazwa mówi o pierwszym wołającym, nie o ograniczeniu.
 *
 * Wyjątkiem jest PLAN LOTU: pilot wpisał go w h:mm i tą samą postacią ma go zobaczyć
 * w podpisie („1:30", bez zera wiodącego) - inaczej formularz odpowiada inną liczbą,
 * niż dostał.
 */
import { duration, relativeAge } from '@ninerdeck/format';

import type { ReferenceAircraft } from '../../../domain';
import type { BookingDraft } from '../../store/bookingDraft';

import type { CalendarBooking } from './calendarData';
import { clubHhmm, type ClubDayBounds } from './clubClock';
import { dualRequirementBlocker } from './dualRequirement';
import { operationLabel } from './operations';

export interface Step1Input {
  draft: BookingDraft;
  /** Maszyna wskazana w szkicu; `null` = jeszcze nie wybrano albo nie ma jej w cache. */
  aircraft: ReferenceAircraft | null;
  /** Zajętości wybranej doby - WSZYSTKIE maszyny, filtrujemy sami. */
  bookings: readonly CalendarBooking[];
  now: number;
}

/**
 * Powód blokady „DALEJ" na kroku 1; `null` = można iść dalej.
 */
export function step1Blocker(input: Step1Input): string | null {
  const { draft, aircraft, now } = input;

  if (draft.date == null) return 'Wybierz dzień rezerwacji.';
  if (draft.aircraftId == null) return 'Wybierz samolot.';
  if (draft.startsAt == null || draft.endsAt == null) return 'Ustaw godziny rezerwacji.';

  if (draft.endsAt <= draft.startsAt) {
    // Zdanie mówi o SKUTKU, nie o nazwach pól: „od" i „do" są w mianowniku, a odmiany
    // nie da się wyprowadzić regułą (ta sama decyzja, co w arkuszu czasów wpisu ręcznego).
    return 'Koniec rezerwacji wypada przed jej początkiem.';
  }

  // Reguła terminu stoi na jego KOŃCU, nie początku (serwer, epik R-B): rezerwacja
  // zaczynająca się kwadrans temu jest normalna - pilot bierze maszynę TERAZ i wpisuje,
  // do której godziny.
  if (draft.endsAt <= now) return 'Ten termin już minął.';

  const clash = overlapping(input);
  if (clash != null) {
    const reg = aircraft?.reg ?? 'Ta maszyna';
    return clash.kind === 'block'
      ? `${reg} jest w tych godzinach wyłączona z użytku.`
      : `${reg} jest w tych godzinach zajęta.`;
  }

  return null;
}

/** Zajętość TEJ maszyny nachodząca na wybrany termin; `null` = termin wolny. */
export function overlapping(input: Step1Input): CalendarBooking | null {
  const { draft } = input;
  if (draft.aircraftId == null || draft.startsAt == null || draft.endsAt == null) return null;

  return (
    input.bookings.find(
      (b) =>
        b.aircraftId === draft.aircraftId &&
        // Zetknięcie co do minuty NIE jest nakładką - ta sama klamra `[)`, którą
        // wyklucza baza i którą liczy się styk operacji w rejestrze.
        b.startsAt < draft.endsAt! &&
        b.endsAt > draft.startsAt!,
    ) ?? null
  );
}

export interface Step2Input {
  draft: BookingDraft;
  aircraft: ReferenceAircraft | null;
  /** Operacja jednoplacowa pyta o JEDNO lotnisko (issue #13). */
  singleField: boolean;
}

/** Powód blokady „ZAREZERWUJ" na kroku 2; `null` = można zapisać. */
export function step2Blocker(input: Step2Input): string | null {
  const { draft } = input;

  if (draft.operation == null) return 'Wybierz rodzaj operacji.';

  if (draft.departureIcao.trim() === '') {
    return input.singleField ? 'Wybierz lotnisko.' : 'Wybierz lotnisko startu.';
  }
  if (!input.singleField && draft.arrivalIcao.trim() === '') return 'Wybierz lotnisko lądowania.';

  const dual = dualRequirementBlocker(input.aircraft, draft.dualId);
  if (dual != null) return dual;

  // Czas lotu nie ma plakietki „opcjonalne", więc bramka go egzekwuje - pole bez
  // plakietki obiecuje wymóg (issue #58). Plan jest też jedyną liczbą, z której
  // formularz umie powiedzieć, ile ze slotu zostaje na obsługę.
  if (draft.plannedAirMin == null) return 'Podaj planowany czas lotu.';

  return null;
}

/**
 * Napis przycisku zapisu: „ZAREZERWUJ 11:00 → 13:00", a w poprawce „ZAPISZ 11:00 → 13:00".
 *
 * Przycisk mówi, CO SIĘ STANIE, a nie „zapisz": rezerwacja jest ustaleniem z innymi
 * ludźmi, więc pilot ma widzieć termin w chwili potwierdzania. Bez godzin zostaje sam
 * czasownik - blokada i tak stoi wyżej.
 *
 * Czasownik różni się w POPRAWCE, bo różni się skutek: „zarezerwuj" nad terminem,
 * który już stoi w kalendarzu, obiecywałoby drugą rezerwację.
 */
export function confirmLabel(
  draft: BookingDraft,
  day: ClubDayBounds | null,
  editing = false,
): string {
  const verb = editing ? 'ZAPISZ' : 'ZAREZERWUJ';
  if (draft.startsAt == null || draft.endsAt == null || day == null) return verb;
  return `${verb} ${clubHhmm(draft.startsAt, day)} → ${clubHhmm(draft.endsAt, day)}`;
}

/**
 * Podpis pod godzinami na kroku 1: „2 h · SP-AXA wolna w tych godzinach".
 *
 * Długość terminu jest tu treścią, a nie ozdobą: pilot ustawia dwie godziny osobno
 * i bez tej liczby musiałby je odejmować w głowie. Drugi człon odpowiada na pytanie,
 * które zadaje sobie zaraz potem - czy to w ogóle da się zarezerwować.
 */
export function slotNote(input: Step1Input): string | null {
  const { draft, aircraft } = input;
  if (draft.startsAt == null || draft.endsAt == null || draft.endsAt <= draft.startsAt) return null;

  const length = relativeAge(draft.endsAt - draft.startsAt);
  if (aircraft == null) return length;

  const clash = overlapping(input);
  if (clash == null) return `${length} · ${aircraft.reg} wolna w tych godzinach`;
  return clash.kind === 'block'
    ? `${length} · ${aircraft.reg} wyłączona z użytku`
    : `${length} · ${aircraft.reg} zajęta w tych godzinach`;
}

/**
 * Podpis pod planem lotu na kroku 2: „Slot 2 h · plan lotu 1:30 zostawia 30 min na obsługę".
 *
 * Rachunek, którego formularz ma pilotowi oszczędzić. Plan DŁUŻSZY niż termin nie jest
 * blokadą, tylko sprzecznością do zauważenia - pilot może chcieć skrócić lot albo
 * wydłużyć rezerwację, a to jego decyzja; bursztyn mówi, że coś się nie zgadza.
 */
export interface PlanNote {
  text: string;
  tone: 'muted' | 'amber';
}

export function planNote(draft: BookingDraft): PlanNote | null {
  if (draft.startsAt == null || draft.endsAt == null || draft.plannedAirMin == null) return null;

  const slot = draft.endsAt - draft.startsAt;
  if (slot <= 0) return null;

  const plan = draft.plannedAirMin * 60_000;
  const rest = slot - plan;

  if (rest < 0) {
    return {
      text: `Slot ${relativeAge(slot)} · plan lotu ${duration(plan)} nie mieści się w rezerwacji`,
      tone: 'amber',
    };
  }
  return {
    text: `Slot ${relativeAge(slot)} · plan lotu ${duration(plan)} zostawia ${relativeAge(rest)} na obsługę`,
    tone: 'muted',
  };
}

/** Podtytuł kroku 2: „Nd 20 WRZ · 11:00 → 13:00 · SP-AXA" - co pilot już ustalił. */
export function step2Subtitle(
  draft: BookingDraft,
  day: ClubDayBounds | null,
  aircraft: ReferenceAircraft | null,
  dayLabel: string,
): string {
  const parts: string[] = [dayLabel];
  if (day != null && draft.startsAt != null && draft.endsAt != null) {
    parts.push(`${clubHhmm(draft.startsAt, day)} → ${clubHhmm(draft.endsAt, day)}`);
  }
  if (aircraft != null) parts.push(aircraft.reg);
  return parts.filter((p) => p !== '').join(' · ');
}

/** Nazwa zadania do arkusza rezygnacji - wiersze mówią, CO pilot straci. */
export function operationNote(draft: BookingDraft): string | null {
  return draft.operation == null ? null : operationLabel(draft.operation);
}
