/**
 * Ninerdeck (serwer) - KARTA MASZYNY: stan „teraz" i serie wykresów (3.2.0, issue #205;
 * makieta `27-samolot`; `docs/obserwowanie-samolotu.md` §6.3, §6.4).
 *
 * Moduł jest CZYSTY: dostaje wiersze projekcji, zajętości kalendarza, odczyty
 * administratora, tankowania ze strumieni i „teraz" - nie zna SQL-a ani zegara.
 * Rachunek stoi tu, a nie w aplikacji, z tego samego powodu, co podgląd przy decyzji:
 * druga kopia w telefonie byłaby pierwszym miejscem, w którym wykres pokazałby co
 * innego niż karta liczników obok.
 *
 * ══ STAN TERAZ - PIERWSZEŃSTWO OD GÓRY (§6.3) ══
 * wycofana → w locie → przejęta → po locie → wyłączona z użytku → zarezerwowana → wolna.
 * Operacja W TOKU jest już dziś źródłem przekazania (`pickHandover`: `open_session`),
 * więc rachunek nie wprowadza drugiej definicji zajętości. Stan z rejestru jest stanem
 * WG OSTATNIEGO ZAPISU, KTÓRY DOTARŁ (§2.3) - o tym mówi osobne pole karty, nie ten moduł.
 *
 * ══ SERIE: CO POKAZAŁY PRZYRZĄDY, BEZ NORMY I WERDYKTU (§6.4) ══
 * Punkt = odczyt z rejestru (przejęcie, zdanie), tankowanie (stan PO dolewce) albo wpis
 * administratora - każdy ze ŹRÓDŁEM, bo podpis kursora ma je nazwać. Cofnięcie licznika
 * rysuje się takie, jakie jest: wykres nie poprawia rejestru. Brak danych to brak
 * punktu, nie zero (issue #69).
 */

import type { ServiceStatus } from '@ninerdeck/domain';

import type { AdminReading, BookingRecord, SessionRow } from '../application/common/ports.ts';
import { holdsSlot, type BookingKind } from './bookings.ts';

/** Ile dni wstecz sięgają wykresy karty (§6.4). */
export const SERIES_WINDOW_DAYS = 90;
/** Ile operacji na stronę historii - jak strona skrzynki. */
export const HISTORY_PAGE_SIZE = 30;

export type AircraftNow =
  | { kind: 'retired' }
  | ({ kind: 'flying'; since: number } & HeldCrew)
  | ({ kind: 'claimed'; since: number | null } & HeldCrew)
  | ({ kind: 'after_flight'; since: number } & HeldCrew)
  | { kind: 'blocked'; bookingId: string; reason: string | null; until: number }
  | { kind: 'booked'; bookingId: string; pilotId: string | null; startsAt: number; endsAt: number }
  | { kind: 'free'; next: { bookingId: string; kind: BookingKind; startsAt: number } | null };

/**
 * Operacja W TOKU na herosie karty: kto ją ma, a obok - CO robi i SKĄD (makieta 27:
 * „A. Kowalski · skoki · EPBK"). Zadanie i lotnisko startu pochodzą z tego samego
 * wiersza projekcji, co załoga; telefon nie ma jak ich dociągnąć osobno, bo cudzej
 * operacji nie ma u siebie (§2.2).
 */
export interface HeldCrew {
  sessionUuid: string;
  pilotId: string;
  dualId: string | null;
  operation: string | null;
  departureIcao: string | null;
}

export interface AircraftNowInput {
  serviceStatus: ServiceStatus;
  /** Operacje maszyny (dowolny status - rachunek sam wybiera te w toku). */
  sessions: readonly SessionRow[];
  /** Zajętości obejmujące „teraz" i późniejsze; wcześniejsze nie szkodzą. */
  bookings: readonly BookingRecord[];
  now: number;
}

/**
 * Operacja W TOKU, która trzyma maszynę - przy kilku (nakładka, którą serwer flaguje,
 * ale nie odrzuca) ta ostatnio przejęta: to jej pilot ma dziś maszynę w rękach.
 */
function heldBy(sessions: readonly SessionRow[]): SessionRow | null {
  const active = sessions
    .filter((s) => s.status === 'active')
    .sort((a, b) => (b.claimTime ?? 0) - (a.claimTime ?? 0) || a.sessionUuid.localeCompare(b.sessionUuid));
  return active[0] ?? null;
}

export function aircraftNow(input: AircraftNowInput): AircraftNow {
  if (input.serviceStatus !== 'active') return { kind: 'retired' };

  const held = heldBy(input.sessions);
  if (held != null) {
    const crew: HeldCrew = {
      sessionUuid: held.sessionUuid,
      pilotId: held.picId,
      dualId: held.dualId,
      operation: held.operation,
      departureIcao: held.departureIcao,
    };
    if (held.engineStartAt != null && held.engineStopAt == null) {
      return { kind: 'flying', ...crew, since: held.engineStartAt };
    }
    if (held.engineStartAt == null) return { kind: 'claimed', ...crew, since: held.claimTime };
    return { kind: 'after_flight', ...crew, since: held.engineStopAt ?? held.engineStartAt };
  }

  const live = input.bookings.filter((b) => holdsSlot(b.status));
  const covering = (b: BookingRecord): boolean => b.startsAt <= input.now && b.endsAt > input.now;
  const block = live.find((b) => b.kind === 'block' && covering(b));
  if (block != null) return { kind: 'blocked', bookingId: block.id, reason: block.blockReason, until: block.endsAt };

  // Zarezerwowana = POTWIERDZONA rezerwacja obejmująca „teraz". Czekająca na zgodę
  // trzyma slot, ale nikt jej jeszcze nie może odebrać - i zaraz wygaśnie (§11.5).
  const booked = live.find((b) => b.kind === 'flight' && b.status === 'confirmed' && covering(b));
  if (booked != null) {
    return { kind: 'booked', bookingId: booked.id, pilotId: booked.pilotId, startsAt: booked.startsAt, endsAt: booked.endsAt };
  }

  const upcoming = live
    .filter((b) => b.startsAt > input.now)
    .sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id))[0];
  return {
    kind: 'free',
    next: upcoming == null ? null : { bookingId: upcoming.id, kind: upcoming.kind, startsAt: upcoming.startsAt },
  };
}

/* ── serie wykresów ─────────────────────────────────────────────────────────── */

export type SeriesSource = 'claim' | 'release' | 'refuel' | 'admin';

export interface SeriesPoint {
  at: number;
  value: number;
  source: SeriesSource;
  /** Operacja, z której pochodzi punkt; `null` przy wpisie administratora. */
  sessionUuid: string | null;
  /** Kto zapisał: pilot operacji, tankujący albo administrator. */
  pilotId: string | null;
}

/** Tankowanie ze strumienia operacji - stan PO dolewce (`RefuelPayload.afterL`). */
export interface RefuelPoint {
  at: number;
  afterL: number;
  sessionUuid: string;
  pilotId: string | null;
}

/**
 * Porządek punktów o tej samej chwili: zdanie poprzednika przed przejęciem następcy
 * (tak czyta się przekazanie), wpis administratora między nimi, tankowanie po przejęciu.
 */
const RANK: Record<SeriesSource, number> = { release: 0, admin: 1, claim: 2, refuel: 3 };

function sorted(points: SeriesPoint[]): SeriesPoint[] {
  return points.sort(
    (a, b) =>
      a.at - b.at ||
      RANK[a.source] - RANK[b.source] ||
      (a.sessionUuid ?? '').localeCompare(b.sessionUuid ?? ''),
  );
}

/** Operacje, które wchodzą do serii: nieunieważnione i zahaczające o okno. */
function inWindow(sessions: readonly SessionRow[], since: number): SessionRow[] {
  return sessions.filter(
    (s) => s.status !== 'voided' && ((s.closeTime ?? s.claimTime ?? -Infinity) >= since),
  );
}

function readingPoints(
  sessions: readonly SessionRow[],
  readings: readonly AdminReading[],
  since: number,
  pick: { start: (s: SessionRow) => number | null; end: (s: SessionRow) => number | null; admin: (r: AdminReading) => number },
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const s of inWindow(sessions, since)) {
    const start = pick.start(s);
    if (s.claimTime != null && s.claimTime >= since && start != null) {
      out.push({ at: s.claimTime, value: start, source: 'claim', sessionUuid: s.sessionUuid, pilotId: s.picId });
    }
    const end = pick.end(s);
    // Odczyt końcowy istnieje wyłącznie przy ZDANIU przez pilota - zakończenie z panelu
    // odczytów nie ma (issue #81) i wiersz niesie wtedy `null`.
    if (s.status === 'closed' && s.closeTime != null && s.closeTime >= since && end != null) {
      out.push({ at: s.closeTime, value: end, source: 'release', sessionUuid: s.sessionUuid, pilotId: s.picId });
    }
  }
  for (const r of readings) {
    if (r.at >= since) out.push({ at: r.at, value: pick.admin(r), source: 'admin', sessionUuid: null, pilotId: r.byPilotId });
  }
  return sorted(out);
}

/** Licznik motogodzin w czasie: przejęcie, zdanie, wpis administratora. */
export function mhSeries(
  sessions: readonly SessionRow[],
  readings: readonly AdminReading[],
  since: number,
): SeriesPoint[] {
  return readingPoints(sessions, readings, since, {
    start: (s) => s.mhStart,
    end: (s) => s.mhEnd,
    admin: (r) => r.mh,
  });
}

/**
 * Poziom paliwa w czasie: przejęcie, tankowania (stan po dolewce), zdanie, wpis
 * administratora. Między zdaniem a następnym przejęciem rejestr o maszynie milczy -
 * aplikacja rysuje tam przerywaną kreskę po samych źródłach punktów, więc ten moduł
 * niczego nie „domyka".
 */
export function fuelSeries(
  sessions: readonly SessionRow[],
  refuels: readonly RefuelPoint[],
  readings: readonly AdminReading[],
  since: number,
): SeriesPoint[] {
  const points = readingPoints(sessions, readings, since, {
    start: (s) => s.fuelStartL,
    end: (s) => s.fuelEndL,
    admin: (r) => r.fuelL,
  });
  for (const r of refuels) {
    if (r.at >= since) {
      points.push({ at: r.at, value: r.afterL, source: 'refuel', sessionUuid: r.sessionUuid, pilotId: r.pilotId });
    }
  }
  return sorted(points);
}
