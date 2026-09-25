/**
 * Ninerdeck (serwer) - PODGLĄD PILOTA I SAMOLOTU przy decyzji o rezerwacji
 * (3.1.0, issue #206; makiety `26a`/`26b` telefonu i K6/K6a panelu;
 * `docs/rezerwacje.md` §9.4 i §10).
 *
 * Akceptujący pyta „komu zatwierdzam" i „czym poleci" - i ma dostać na to DOKŁADNIE
 * ten sam komplet faktów w panelu i w telefonie (uwaga właściciela 2026-09-23: decyzję
 * podejmuje też mechanik, który panelu nie otwiera). Dlatego rachunek stoi tu, w jednym
 * miejscu, a obie powierzchnie dostają jego wynik gotowy: druga kopia liczb w panelu
 * byłaby pierwszym miejscem, w którym ta sama sprawa rozstrzygałaby się inaczej
 * w zależności od tego, kto akurat siedzi przy biurku.
 *
 * ══ TO SĄ NOWE PYTANIA DO ISTNIEJĄCYCH WIERSZY, NIE NOWE DANE ══
 * Wszystko liczy się z projekcji sesji (operacje mają pilota, maszynę, czas blokowy
 * i liczbę lotów) oraz z zajętości kalendarza. Żadnej nowej tabeli, żadnej kolumny.
 *
 * ══ CZEGO TU NIE MA I CZEMU ══
 * Licencji, badań ani uprawnień na typ - system ich NIE ZNA (decyzja właściciela
 * 2026-09-23: osobny epik). Podgląd odpowiada nalotem i historią lotów, a pustych
 * wierszy „Badania -" nie rysuje: na ekranie decyzji czytałyby się jak stwierdzenie
 * o stanie dokumentów, a byłyby stwierdzeniem o brakującym module.
 *
 * Moduł jest CZYSTY: dostaje wiersze i „teraz", nie zna SQL-a ani zegara.
 */

import type { BookingRecord, SessionRow } from '../application/common/ports.ts';

/** Ile ostatnich lotów pokazuje karta „Ostatnie loty" - makiety rysują trzy, sufit pięć. */
export const RECENT_LIMIT = 5;
/** Ile najbliższych terminów - tyle samo, z tego samego powodu. */
export const UPCOMING_LIMIT = 5;

const DAY_MS = 86_400_000;
/** Okna nalotu z makiet 26A/K6: „Ostatnie 30 dni" i „Ostatnie 90 dni". */
export const FLYING_WINDOWS_DAYS = { short: 30, long: 90 } as const;

/** Trójka Loty · Blok · Lot - w tym produkcie STAŁA; podgląd nie wymyśla własnej. */
export interface Flying {
  flights: number;
  blockMs: number;
  flightMs: number;
}

export interface OnAircraft extends Flying {
  /** Ile operacji tego pilota na TYM egzemplarzu. */
  operations: number;
  /** Chwila ostatniej z nich; `null` = nigdy na tej maszynie nie latał. */
  lastAt: number | null;
}

export interface PilotFacts {
  /** Ostatnia operacja Z LOTEM w klubie, na dowolnej maszynie. */
  lastFlightAt: number | null;
  onAircraft: OnAircraft;
  last30: Flying;
  last90: Flying;
  total: Flying;
  /** Najnowsze pierwsze, do `RECENT_LIMIT`. */
  recent: SessionRow[];
}

export interface AircraftLast30 {
  /** Liczba RÓŻNYCH dób (klubu) z przynajmniej jedną operacją. */
  daysWithFlights: number;
  takeoffs: number;
  blockMs: number;
  flightMs: number;
}

export interface AircraftFacts {
  lastFlightAt: number | null;
  last30: AircraftLast30;
  recent: SessionRow[];
}

export interface UpcomingBooking {
  booking: BookingRecord;
  /** Rozpatrywana sprawa - wiersz „· ta sprawa" na liście. */
  thisCase: boolean;
  /**
   * Nachodzi na rozpatrywany termin. Dla PILOTA to jest rzecz, której baza nie
   * wyklucza - ograniczenie pilnuje EGZEMPLARZA, nie człowieka - więc odpowiedź należy
   * do tego, kto zatwierdza. Dla maszyny wychodzi zawsze `false` (nakładkę odbiłaby
   * baza), ale liczy się tą samą regułą, żeby oba podglądy miały jeden kształt.
   */
  overlaps: boolean;
}

/**
 * Chwila operacji: uruchomienie silnika, awaryjnie przejęcie - ta sama kotwica, którą
 * telefon liczy dobę operacji (`sessionDay`). Wiersz bez obu nie ma kiedy się wydarzył
 * i nie wchodzi do żadnego rachunku.
 */
export function operationAt(row: SessionRow): number | null {
  return row.engineStartAt ?? row.claimTime;
}

/**
 * Operacja, która LICZY SIĘ jako doświadczenie: nieunieważniona i z biegiem silnika
 * albo lotem. Zapis bez biegu ze zmienionym odczytem jest operacją w sensie issue #75
 * (dostaje numer i sygnaturę), ale nalotu nie daje - a o nalot pyta ten ekran.
 */
export function flew(row: SessionRow): boolean {
  return row.status !== 'voided' && (row.blockMs > 0 || row.flightsCount > 0);
}

const EMPTY: Flying = { flights: 0, blockMs: 0, flightMs: 0 };

function sumFlying(rows: readonly SessionRow[]): Flying {
  return rows.reduce<Flying>(
    (acc, row) => ({
      flights: acc.flights + row.flightsCount,
      blockMs: acc.blockMs + row.blockMs,
      flightMs: acc.flightMs + row.flightMs,
    }),
    EMPTY,
  );
}

interface Dated {
  row: SessionRow;
  at: number;
}

/** Operacje z nalotem i z chwilą, najnowsze pierwsze. */
function flown(rows: readonly SessionRow[]): Dated[] {
  const out: Dated[] = [];
  for (const row of rows) {
    const at = operationAt(row);
    if (at != null && flew(row)) out.push({ row, at });
  }
  return out.sort((a, b) => b.at - a.at || a.row.sessionUuid.localeCompare(b.row.sessionUuid));
}

const since = (dated: readonly Dated[], from: number): SessionRow[] =>
  dated.filter((d) => d.at >= from).map((d) => d.row);

/**
 * Fakty o PILOCIE: doświadczenie na egzemplarzu sprawy PRZED nalotem ogólnym, bo to
 * jest pytanie decyzji („czy zna TĘ maszynę i czy lata regularnie"), potem trzy okna
 * i ostatnie loty. `rows` = operacje tego pilota w klubie (jako PIC albo Dual).
 */
export function pilotFacts(
  rows: readonly SessionRow[],
  aircraftId: string,
  now: number,
): PilotFacts {
  const dated = flown(rows);
  const onThis = dated.filter((d) => d.row.aircraftId === aircraftId);
  return {
    lastFlightAt: dated[0]?.at ?? null,
    onAircraft: {
      operations: onThis.length,
      lastAt: onThis[0]?.at ?? null,
      ...sumFlying(onThis.map((d) => d.row)),
    },
    last30: sumFlying(since(dated, now - FLYING_WINDOWS_DAYS.short * DAY_MS)),
    last90: sumFlying(since(dated, now - FLYING_WINDOWS_DAYS.long * DAY_MS)),
    total: sumFlying(dated.map((d) => d.row)),
    recent: dated.slice(0, RECENT_LIMIT).map((d) => d.row),
  };
}

/**
 * Fakty o MASZYNIE: ostatnie 30 dni (ile dób latała, ile startów, ile silnika
 * i powietrza) i ostatnie loty. `dayKeyOf` tłumaczy chwilę na dobę KLUBU - rachunek
 * jej nie zna, bo strefa jest konfiguracją klubu, a nie własnością wiersza.
 */
export function aircraftFacts(
  rows: readonly SessionRow[],
  now: number,
  dayKeyOf: (at: number) => string,
): AircraftFacts {
  const dated = flown(rows);
  return {
    lastFlightAt: dated[0]?.at ?? null,
    last30: aircraftWindow(rows, now, FLYING_WINDOWS_DAYS.short, dayKeyOf),
    recent: dated.slice(0, RECENT_LIMIT).map((d) => d.row),
  };
}

/**
 * Nalot MASZYNY w oknie ostatnich `days` dni: ile dób latała, ile startów, ile silnika
 * i powietrza. Wydzielone z `aircraftFacts`, bo karta maszyny (obserwowanie samolotu,
 * 3.2.0) pyta o TO SAMO dla 30 i 90 dni - a druga kopia tego rachunku byłaby pierwszym
 * miejscem, w którym podgląd 26B i karta 27 policzyłyby inaczej ten sam miesiąc.
 */
export function aircraftWindow(
  rows: readonly SessionRow[],
  now: number,
  days: number,
  dayKeyOf: (at: number) => string,
): AircraftLast30 {
  const recent = flown(rows).filter((d) => d.at >= now - days * DAY_MS);
  const flying = sumFlying(recent.map((d) => d.row));
  return {
    daysWithFlights: new Set(recent.map((d) => dayKeyOf(d.at))).size,
    // Starty z projekcji, a gdy zapis ich nie policzył (stary strumień) - liczba
    // lotów: każdy lot zaczyna się startem, więc to dolne ograniczenie, nie domysł.
    takeoffs: recent.reduce((n, d) => n + (d.row.takeoffCount ?? d.row.flightsCount), 0),
    blockMs: flying.blockMs,
    flightMs: flying.flightMs,
  };
}

/**
 * Najbliższe terminy: te, które jeszcze trwają albo dopiero nadejdą, w porządku czasu,
 * do `UPCOMING_LIMIT`. ROZPATRYWANA SPRAWA JEST NA LIŚCIE ZAWSZE - to ona jest
 * powodem, dla którego ktoś tu patrzy - więc jeśli stoi dalej niż sufit, wchodzi
 * mimo to (i tak jest chronologicznie ostatnia z pokazanych).
 */
export function upcomingOf(
  bookings: readonly BookingRecord[],
  theCase: BookingRecord,
  now: number,
): UpcomingBooking[] {
  const rows = bookings
    .filter((b) => b.endsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id))
    .map((booking) => ({
      booking,
      thisCase: booking.id === theCase.id,
      overlaps:
        booking.id !== theCase.id &&
        booking.startsAt < theCase.endsAt &&
        booking.endsAt > theCase.startsAt,
    }));
  const head = rows.slice(0, UPCOMING_LIMIT);
  if (head.some((r) => r.thisCase)) return head;
  const own = rows.find((r) => r.thisCase);
  return own == null ? head : [...head, own];
}
