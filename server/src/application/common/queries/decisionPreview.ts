/**
 * Ninerdeck (serwer) - PODGLĄD PILOTA I SAMOLOTU przy decyzji (3.1.0, issue #206).
 *
 * JEDNO zapytanie dla OBU powierzchni: szuflada w panelu (K6/K6a) i ekrany 26A/26B
 * w telefonie czytają ten sam widok, a rachunek robi `domain/decisionPreview.ts`.
 * Tu składa się wyłącznie to, czego rachunek nie zna: wiersze z bazy, strefę klubu,
 * konfigurację floty i ostatni odczyt liczników.
 *
 * ══ KTO MOŻE PATRZEĆ, ROZSTRZYGA TRASA ══
 * Zapytanie pyta o klub i o sprawę; o zdolność (`reservations.approve` albo
 * `reservations.manage`) pyta trasa, bo to ona zna aktora. Cudza sprawa i sprawa
 * spoza klubu oddają `null` - trasa mówi wtedy 404, nie 403 (epik C).
 *
 * ══ OSOBA NA SPRAWIE, NIE DOWOLNA ══
 * Podgląd pilota otwiera się WYŁĄCZNIE dla osoby stojącej na rozpatrywanej
 * rezerwacji (PIC albo Dual). Inaczej ta trasa byłaby wyszukiwarką nalotu każdego
 * członka klubu dla każdego, kto ma jedną zdolność - a pyta o cudze loty.
 */

import type { ReferenceAircraft } from '@ninerdeck/domain';

import { clubDays, safeZone, type ClubDay } from '../../../domain/clubTime.ts';
import {
  aircraftFacts,
  pilotFacts,
  upcomingOf,
  type AircraftFacts,
  type PilotFacts,
  type UpcomingBooking,
} from '../../../domain/decisionPreview.ts';
import { pickHandover, type HandoverPick } from '../aircraftStateView.ts';
import type {
  AircraftReadingsPort,
  AircraftSeed,
  BookingRecord,
  BookingsPort,
  Clock,
  ClubSettingsPort,
  Database,
  PilotsPort,
  ReferencePort,
  SessionsProjectionPort,
} from '../ports.ts';
import { MAX_WINDOW_DAYS } from './bookings.ts';

const DAY_MS = 86_400_000;

export interface UpcomingView extends UpcomingBooking {
  /** Doba klubu początku terminu - telefon liczy godziny odejmowaniem (§6.1). */
  day: ClubDay;
}

export interface PilotPreview {
  timezone: string;
  booking: BookingRecord;
  pilot: {
    id: string;
    /** Kod i nazwisko z członkostwa w klubie sprawy; `null` = osoby nie ma na liście klubu. */
    code: string | null;
    name: string | null;
    /** Od kiedy w klubie: chwila przyjęcia, a przed 2.0.0 - założenia członkostwa. */
    memberSince: number | null;
  };
  facts: PilotFacts;
  upcoming: UpcomingView[];
}

export interface AircraftPreview {
  timezone: string;
  booking: BookingRecord;
  aircraft: ReferenceAircraft;
  /** Ostatni odczyt liczników ze ŹRÓDŁEM - jak przekazanie na 02A i karta w panelu. */
  counters: HandoverPick | null;
  facts: AircraftFacts;
  upcoming: UpcomingView[];
}

export class DecisionPreviewQueries {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingsPort,
    private readonly sessions: SessionsProjectionPort,
    private readonly pilots: PilotsPort,
    private readonly reference: ReferencePort,
    private readonly readings: AircraftReadingsPort,
    private readonly clubs: ClubSettingsPort,
    private readonly clock: Clock,
  ) {}

  async pilot(orgId: string, bookingId: string, pilotId: string): Promise<PilotPreview | null> {
    const base = await this.base(orgId, bookingId);
    if (base == null) return null;
    const { booking, timezone } = base;
    if (booking.pilotId !== pilotId && booking.dualId !== pilotId) return null;

    const now = this.clock.now().getTime();
    const [rows, membership, snapshot, plans] = await Promise.all([
      this.sessions.listByCrew(this.db, orgId, pilotId),
      this.pilots.membership(pilotId, orgId),
      this.reference.snapshot(orgId),
      this.bookings.list(this.db, orgId, { ...this.horizon(now, booking), pilotId }),
    ]);
    const person = snapshot.pilots.find((p) => p.id === pilotId) ?? null;

    return {
      timezone,
      booking,
      pilot: {
        id: pilotId,
        code: person?.code ?? membership?.code ?? null,
        name: person?.name ?? null,
        memberSince: (membership?.decidedAt ?? membership?.createdAt)?.getTime() ?? null,
      },
      facts: pilotFacts(rows, booking.aircraftId, now),
      upcoming: this.withDays(timezone, upcomingOf(plans, booking, now)),
    };
  }

  async aircraft(orgId: string, bookingId: string): Promise<AircraftPreview | null> {
    const base = await this.base(orgId, bookingId);
    if (base == null) return null;
    const { booking, timezone } = base;
    const aircraftId = booking.aircraftId;

    const now = this.clock.now().getTime();
    const [rows, snapshot, override, plans] = await Promise.all([
      this.sessions.listByAircraft(this.db, orgId, aircraftId),
      this.reference.snapshot(orgId),
      this.readings.latest(this.db, orgId, aircraftId),
      this.bookings.list(this.db, orgId, { ...this.horizon(now, booking), aircraftId }),
    ]);
    const aircraft = snapshot.aircraft.find((a) => a.id === aircraftId);
    // Maszyna, której flota nie zna, nie ma czym się podpisać - a rezerwacja na nią
    // i tak nie mogła powstać (`aircraft_not_found`). Cisza zamiast półpustej karty.
    if (aircraft == null) return null;

    const seed: AircraftSeed | null = snapshot.initial.get(aircraftId) ?? null;
    return {
      timezone,
      booking,
      aircraft,
      counters: pickHandover(rows, seed, override),
      facts: aircraftFacts(rows, now, (at) => dayKey(timezone, at)),
      upcoming: this.withDays(timezone, upcomingOf(plans, booking, now)),
    };
  }

  private async base(
    orgId: string,
    bookingId: string,
  ): Promise<{ booking: BookingRecord; timezone: string } | null> {
    const settings = await this.clubs.calendar(this.db, orgId);
    if (settings == null) return null;
    const booking = await this.bookings.byId(this.db, orgId, bookingId);
    if (booking == null) return null;
    return { booking, timezone: safeZone(settings.timezone) };
  }

  /**
   * Okno „najbliższych terminów": od teraz po sufit okna kalendarza, ALE nigdy krócej
   * niż do końca rozpatrywanej sprawy - sprawa jest na liście zawsze (`upcomingOf`),
   * więc musi mieć jak się w niej znaleźć także wtedy, gdy stoi za dwa miesiące.
   */
  private horizon(now: number, booking: BookingRecord): { from: number; to: number } {
    return { from: now, to: Math.max(now + MAX_WINDOW_DAYS * DAY_MS, booking.endsAt + 1) };
  }

  private withDays(timezone: string, rows: UpcomingBooking[]): UpcomingView[] {
    const out: UpcomingView[] = [];
    for (const row of rows) {
      const day = clubDays(timezone, row.booking.startsAt, row.booking.startsAt + 1, 1)[0];
      if (day != null) out.push({ ...row, day });
    }
    return out;
  }
}

/** Klucz doby klubu dla chwili - „dni z lotami" liczy różne DOBY, nie różne daty UTC. */
function dayKey(timezone: string, at: number): string {
  return clubDays(timezone, at, at + 1, 1)[0]?.date ?? new Date(at).toISOString().slice(0, 10);
}
