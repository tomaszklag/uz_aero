/**
 * Ninerdeck - test zegara klubu (rezerwacje 3.0.0, `logic/clubClock.ts`).
 *
 * Godzina ścienna liczy się ODEJMOWANIEM od początku doby, bez `Intl` i bez tablicy
 * stref - to jest cały powód, dla którego kontrakt `GET /bookings` oddaje granice dób.
 */

import {
  clubAtHour,
  clubDayAt,
  clubHhmm,
  clubHour,
  clubHours,
  type ClubDayBounds,
} from '../ui/screens/logic/clubClock';

const HOUR = 3_600_000;

/** Doba klubu w strefie +02:00: północ lokalna to 22:00 UTC dnia poprzedniego. */
const day: ClubDayBounds = {
  date: '2026-09-19',
  startsAt: Date.parse('2026-09-18T22:00:00Z'),
  endsAt: Date.parse('2026-09-19T22:00:00Z'),
};

describe('zegar klubu', () => {
  it('godzina ścienna liczy się od początku doby, nie z UTC', () => {
    // 07:30 czasu klubu to 05:30 UTC - bez tej różnicy cała siatka stałaby o dwie
    // godziny obok.
    const at = Date.parse('2026-09-19T05:30:00Z');
    expect(clubHour(at, day)).toBe(7);
    expect(clubHhmm(at, day)).toBe('07:30');
    expect(clubHours(at, day)).toBeCloseTo(7.5);
  });

  it('północ klubu to „00:00", a nie godzina z zegara UTC', () => {
    expect(clubHhmm(day.startsAt, day)).toBe('00:00');
  });

  it('minuty nie kłamią przy godzinie niepełnej', () => {
    expect(clubHhmm(day.startsAt + 9 * HOUR + 7 * 60_000, day)).toBe('09:07');
  });

  it('`clubAtHour` jest odwrotnością `clubHour`', () => {
    const at = clubAtHour(day, 14);
    expect(clubHour(at, day)).toBe(14);
    expect(clubHhmm(at, day)).toBe('14:00');
  });

  describe('doba zawierająca chwilę', () => {
    const next: ClubDayBounds = {
      date: '2026-09-20',
      startsAt: day.endsAt,
      endsAt: day.endsAt + 24 * HOUR,
    };

    it('granica należy do doby PÓŹNIEJSZEJ - ta sama, którą baza wyklucza nakładki', () => {
      expect(clubDayAt([day, next], day.endsAt)?.date).toBe('2026-09-20');
      expect(clubDayAt([day, next], day.endsAt - 1)?.date).toBe('2026-09-19');
    });

    it('chwila poza oknem nie należy do żadnej doby', () => {
      expect(clubDayAt([day, next], day.startsAt - 1)).toBeNull();
    });
  });
});
