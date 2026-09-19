/**
 * Ninerdeck (serwer) - DOBY KALENDARZA W STREFIE KLUBU (`domain/clubTime.ts`).
 *
 * Sedno jest w dwóch dniach roku: doba zmiany czasu ma 23 albo 25 godzin i to WŁAŚNIE
 * ona jest powodem, dla którego trasa oddaje granice dób jako chwile, a nie offsety.
 * Jedna liczba offsetu musiałaby w takim dniu skłamać w którejś połowie; granice nie
 * kłamią, bo doba po prostu jest krótsza albo dłuższa.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CLUB_ZONE, clubDate, clubDays, safeZone } from '../src/domain/clubTime.ts';

const H = 3_600_000;
const doba = (day: { startsAt: number; endsAt: number }): number =>
  (day.endsAt - day.startsAt) / H;

describe('doby kalendarza w strefie klubu', () => {
  it('letnia doba w Polsce zaczyna się o 22:00 UTC dnia poprzedniego', () => {
    const day = clubDays(
      'Europe/Warsaw',
      Date.parse('2026-07-04T09:00:00Z'),
      Date.parse('2026-07-04T10:00:00Z'),
    )[0]!;
    expect(day.date).toBe('2026-07-04');
    expect(new Date(day.startsAt).toISOString()).toBe('2026-07-03T22:00:00.000Z');
    expect(doba(day)).toBe(24);
  });

  it('zimowa doba zaczyna się o 23:00 UTC', () => {
    const day = clubDays(
      'Europe/Warsaw',
      Date.parse('2026-12-04T09:00:00Z'),
      Date.parse('2026-12-04T10:00:00Z'),
    )[0]!;
    expect(new Date(day.startsAt).toISOString()).toBe('2026-12-03T23:00:00.000Z');
    expect(doba(day)).toBe(24);
  });

  it('DOBA ZMIANY CZASU MA 23 ALBO 25 GODZIN - i to jest cała odpowiedź na `Intl`', () => {
    // 29 III 2026 - wiosną doba gubi godzinę, 25 X - jesienią zyskuje.
    const wiosna = clubDays(
      'Europe/Warsaw',
      Date.parse('2026-03-29T09:00:00Z'),
      Date.parse('2026-03-29T10:00:00Z'),
    )[0]!;
    expect(wiosna.date).toBe('2026-03-29');
    expect(doba(wiosna)).toBe(23);

    const jesien = clubDays(
      'Europe/Warsaw',
      Date.parse('2026-10-25T09:00:00Z'),
      Date.parse('2026-10-25T10:00:00Z'),
    )[0]!;
    expect(jesien.date).toBe('2026-10-25');
    expect(doba(jesien)).toBe(25);
  });

  it('doby PRZYLEGAJĄ do siebie bez dziury i bez zakładki', () => {
    // Bez tego siatka gubiłaby albo dublowała godzinę na styku - właśnie w dniu zmiany.
    const days = clubDays(
      'Europe/Warsaw',
      Date.parse('2026-03-27T00:00:00Z'),
      Date.parse('2026-04-01T00:00:00Z'),
    );
    expect(days.length).toBeGreaterThan(4);
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i]!.startsAt, days[i]!.date).toBe(days[i - 1]!.endsAt);
    }
  });

  it('okno zaczyna się dobą, w której stoi `from` - także w środku dnia', () => {
    const days = clubDays(
      'Europe/Warsaw',
      Date.parse('2026-07-04T12:00:00Z'),
      Date.parse('2026-07-06T06:00:00Z'),
    );
    expect(days.map((d) => d.date)).toEqual(['2026-07-04', '2026-07-05', '2026-07-06']);
  });

  it('okno jest ograniczone - adres nie zamawia sobie dekady', () => {
    const days = clubDays(
      'Europe/Warsaw',
      Date.parse('2026-01-01T00:00:00Z'),
      Date.parse('2036-01-01T00:00:00Z'),
      31,
    );
    expect(days).toHaveLength(31);
  });

  it('puste okno oddaje pustą listę, a nie dobę-widmo', () => {
    const t = Date.parse('2026-07-04T09:00:00Z');
    expect(clubDays('Europe/Warsaw', t, t)).toEqual([]);
    expect(clubDays('Europe/Warsaw', t, t - H)).toEqual([]);
  });

  it('strefa odległa liczy się tak samo', () => {
    const day = clubDays(
      'America/New_York',
      Date.parse('2026-07-04T12:00:00Z'),
      Date.parse('2026-07-04T13:00:00Z'),
    )[0]!;
    expect(day.date).toBe('2026-07-04');
    expect(new Date(day.startsAt).toISOString()).toBe('2026-07-04T04:00:00.000Z');
  });

  it('data lokalna bierze się ze strefy, nie z UTC', () => {
    // 23:30 czasu klubu w lipcu to 21:30 UTC - dzień w UTC ten sam, ale o 22:30 UTC
    // jest już jutro w Warszawie i siatka musi to wiedzieć.
    expect(clubDate('Europe/Warsaw', Date.parse('2026-07-04T22:30:00Z'))).toBe('2026-07-05');
    expect(clubDate('Europe/Warsaw', Date.parse('2026-07-04T21:30:00Z'))).toBe('2026-07-04');
  });

  it('literówka w konfiguracji klubu NIE blokuje kalendarza', () => {
    expect(safeZone('Europe/Warszawa')).toBe(DEFAULT_CLUB_ZONE);
    expect(safeZone('')).toBe(DEFAULT_CLUB_ZONE);
    expect(safeZone(null)).toBe(DEFAULT_CLUB_ZONE);
    expect(safeZone('America/New_York')).toBe('America/New_York');
  });
});
