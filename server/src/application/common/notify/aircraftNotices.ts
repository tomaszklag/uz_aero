/**
 * Ninerdeck (serwer) - TREŚCI POWIADOMIEŃ o obserwowanej maszynie (3.2.0, issue #205;
 * `docs/obserwowanie-samolotu.md` §5).
 *
 * Czyste funkcje jak `bookingNotices.ts`: biorą fakty i ADRESATÓW, oddają wiersze
 * skrzynki razem z budzikiem. Zero zapytań, zero zegara - brzmienie sprawdza test.
 *
 * ══ ADRESATÓW LICZY KTOŚ INNY ══
 * Lista osób przychodzi z zewnątrz (`AircraftWatching.audience`): obserwujący
 * z prawem sprawdzonym PRZY WYSYŁCE, BEZ SPRAWCÓW. Tu nie ma jak pomylić kolejności -
 * funkcja dostaje gotowych ludzi i robi po jednej wiadomości dla każdego.
 *
 * ══ PUSH: ZNAK MASZYNY TAK, NAZWISKO I GODZINA NIE ══
 * Budzik ląduje na ekranie blokady, który widzi każdy, kto akurat patrzy na telefon.
 * Znak jest daną KLUBU, nie osoby, więc wolno mu paść w tytule („SP-AXA uruchomiona");
 * kto leci i o której - zostaje w skrzynce. „Za godzinę" jest czasem względnym
 * i niczego o czyimś grafiku nie zdradza.
 *
 * ══ CZAS Z REJESTRU, NIE CHWILA DOTARCIA (§2.3) ══
 * Wiadomość o operacji niesie `at` = chwilę zdarzenia z rejestru; kiedy powstała,
 * mówi `createdAt` wiersza skrzynki. Aplikacja pisze „Uruchomienie 08:12 UTC" i dokłada
 * „· zapis dotarł 09:40", gdy zwłoka jest widoczna. Terminy (1, 2, 5) niosą `startsAt`,
 * więc trasa skrzynki dołoży im dobę klubu jak każdej wiadomości o terminie.
 */

import type { NotificationDraft } from './bookingNotices.ts';

/** Kogo obudzić i jakim znakiem nazwać maszynę - obie rzeczy z jednego odczytu. */
export interface WatchAudience {
  pilotIds: readonly string[];
  reg: string;
}

/** Termin w postaci, w jakiej opisuje go wiadomość. */
export interface WatchedBooking {
  id: string;
  aircraftId: string;
  pilotId: string | null;
  dualId: string | null;
  startsAt: number;
  endsAt: number;
}

/** Przyjęte uruchomienie silnika (§5.3). */
export interface WatchedEngineStart {
  sessionUuid: string;
  aircraftId: string;
  pilotId: string;
  dualId: string | null;
  /** Chwila `engine_start` Z REJESTRU. */
  at: number;
  /** Zadanie operacji (`skoki`, `ferry`…) - skrzynka pisze je obok nazwiska. */
  operation: string | null;
  /** Rezerwacja zrealizowana TĄ operacją - „zgodnie z planem" kontra „poza planem". */
  planned: boolean;
  bookingId: string | null;
}

/** Zdanie maszyny (§5.4) - z odczytami, albo zakończenie z panelu bez nich. */
export interface WatchedRelease {
  sessionUuid: string;
  aircraftId: string;
  pilotId: string;
  dualId: string | null;
  /** Chwila `day_close` z rejestru albo chwila decyzji administratora. */
  at: number;
  engineStartAt: number | null;
  engineStopAt: number | null;
  blockMs: number;
  flights: number;
  /** Odczyty końcowe; `null` przy zakończeniu z panelu - liczby znikąd nie wpisujemy. */
  fuelEndL: number | null;
  mhEnd: number | null;
  /** Powód zdania bez lotu (09C); `null` przy locie albo gdy pilot nie podał. */
  noFlightReason: string | null;
  closedBy: 'pilot' | 'admin';
  /** Powód administratora; `null` przy zdaniu przez pilota. */
  reason: string | null;
}

const iso = (at: number): string => new Date(at).toISOString();
const isoOrNull = (at: number | null): string | null => (at == null ? null : iso(at));

const MINUTE_MS = 60_000;

/**
 * Zdanie budzika o wyprzedzeniu - liczone z TERMINU w chwili wysyłki, nie ze stałej:
 * rezerwacja złożona pół godziny przed startem dostaje „Za 30 min", a nie „Za godzinę".
 */
export function soonBody(untilStartMs: number): string {
  if (untilStartMs <= 0) return 'Termin właśnie się zaczyna.';
  const minutes = Math.max(1, Math.round(untilStartMs / MINUTE_MS));
  return minutes >= 55 ? 'Za godzinę.' : `Za ${minutes} min.`;
}

const aboutBooking = (booking: WatchedBooking): Record<string, unknown> => ({
  bookingId: booking.id,
  aircraftId: booking.aircraftId,
  pilotId: booking.pilotId,
  dualId: booking.dualId,
  startsAt: iso(booking.startsAt),
  endsAt: iso(booking.endsAt),
});

function toEach(
  audience: WatchAudience,
  kind: NotificationDraft['kind'],
  payload: Record<string, unknown>,
  push: NotificationDraft['push'],
): NotificationDraft[] {
  return audience.pilotIds.map((pilotId) => ({ pilotId, kind, payload, push }));
}

/** 1. Zbliża się lot - do obserwujących, bez PIC-a i Duala rezerwacji. */
export function aircraftFlightSoon(
  audience: WatchAudience,
  booking: WatchedBooking,
  now: number,
): NotificationDraft[] {
  return toEach(audience, 'aircraft_flight_soon', aboutBooking(booking), {
    title: `Zbliża się lot · ${audience.reg}`,
    body: soonBody(booking.startsAt - now),
  });
}

/**
 * 2. Odwołano albo przesunięto termin, o którym JUŻ przypomniano („co ogłosiłeś, to
 * odwołaj", §5.2). Wiadomość niesie STARY termin; przy przesunięciu także nowy.
 */
export function aircraftFlightCancelled(
  audience: WatchAudience,
  booking: WatchedBooking,
  movedTo: { startsAt: number; endsAt: number } | null,
): NotificationDraft[] {
  return toEach(
    audience,
    'aircraft_flight_cancelled',
    {
      ...aboutBooking(booking),
      movedTo:
        movedTo == null ? null : { startsAt: iso(movedTo.startsAt), endsAt: iso(movedTo.endsAt) },
    },
    {
      title: `Odwołany lot · ${audience.reg}`,
      body: movedTo == null ? 'Termin odwołano.' : 'Termin przesunięto.',
    },
  );
}

/** 3. Uruchomienie silnika - maszyny nie wolno tknąć; bez PIC-a i Duala operacji. */
export function aircraftEngineStarted(
  audience: WatchAudience,
  start: WatchedEngineStart,
): NotificationDraft[] {
  return toEach(
    audience,
    'aircraft_engine_started',
    {
      sessionUuid: start.sessionUuid,
      aircraftId: start.aircraftId,
      pilotId: start.pilotId,
      dualId: start.dualId,
      at: iso(start.at),
      operation: start.operation,
      planned: start.planned,
      bookingId: start.bookingId,
    },
    {
      title: `${audience.reg} uruchomiona`,
      body: start.planned
        ? 'Uruchomienie silnika · zgodnie z planem.'
        : 'Uruchomienie silnika · poza planem.',
    },
  );
}

/** 4. Zdana - z tym, po co mechanik czeka; albo zakończona z panelu, z powodem. */
export function aircraftReleased(
  audience: WatchAudience,
  release: WatchedRelease,
): NotificationDraft[] {
  const body =
    release.closedBy === 'admin'
      ? 'Operację zakończył administrator.'
      : release.flights > 0
        ? 'Wróciła z odczytami.'
        : 'Zdana bez lotu.';
  return toEach(
    audience,
    'aircraft_released',
    {
      sessionUuid: release.sessionUuid,
      aircraftId: release.aircraftId,
      pilotId: release.pilotId,
      dualId: release.dualId,
      at: iso(release.at),
      engineStartAt: isoOrNull(release.engineStartAt),
      engineStopAt: isoOrNull(release.engineStopAt),
      blockMs: release.blockMs,
      flights: release.flights,
      fuelEndL: release.fuelEndL,
      mhEnd: release.mhEnd,
      noFlightReason: release.noFlightReason,
      closedBy: release.closedBy,
      reason: release.reason,
    },
    { title: `${audience.reg} zdana`, body },
  );
}

/** 5. Nikt nie odebrał maszyny - slot wrócił do puli (§5.5). */
export function aircraftNotTaken(
  audience: WatchAudience,
  booking: WatchedBooking,
): NotificationDraft[] {
  return toEach(audience, 'aircraft_not_taken', aboutBooking(booking), {
    title: `Nie odebrano · ${audience.reg}`,
    body: 'Nikt nie odebrał maszyny w terminie.',
  });
}
