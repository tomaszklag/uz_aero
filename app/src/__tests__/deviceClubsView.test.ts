/**
 * Ninerdeck - klub urządzenia na ekranach logowania (`ui/screens/logic/deviceClubs.ts`;
 * 2.1.0, issue #135 E4/E6/E10).
 *
 * Adapter magazynu ma własny test (`deviceClubsStore.test.ts`) - tu chodzi wyłącznie
 * o decyzje EKRANU: kiedy mówi o klubie, od czego zaczyna i jak nazywa chwilę.
 */

import type { DeviceClubsRecord } from '../application/ports';
import {
  canChangeClub,
  deviceClubPill,
  deviceClubRows,
  signedOutStart,
} from '../ui/screens/logic/deviceClubs';

const ALFA = { id: 'org-a', name: 'Aeroklub Alfa', lastLoginAt: '2026-09-18T07:50:00.000Z' };
const BETA = { id: 'org-b', name: 'Aeroklub Beta', lastLoginAt: '2026-09-12T16:20:00.000Z' };

const NOW = Date.parse('2026-09-18T09:41:00.000Z');

const record = (clubs: DeviceClubsRecord['clubs'], activeId: string | null): DeviceClubsRecord => ({
  clubs,
  activeId,
});

describe('deviceClubPill', () => {
  it('JEDEN klub: ekran MILCZY - nazwa przy każdym logowaniu niczego nie odróżnia', () => {
    expect(deviceClubPill(record([ALFA], ALFA.id))).toBeNull();
  });

  it('świeże urządzenie też milczy - kod pilota nie ma czego wskazać, działa adres', () => {
    expect(deviceClubPill(record([], null))).toBeNull();
    expect(deviceClubPill(null)).toBeNull();
  });

  it('KILKA klubów: nazwa BIEŻĄCEGO, bo to w nim rozwiąże się kod pilota', () => {
    expect(deviceClubPill(record([BETA, ALFA], ALFA.id))).toBe('Aeroklub Alfa');
  });

  it('bez wskazanego bieżącego MILCZY zamiast zgadywać', () => {
    expect(deviceClubPill(record([BETA, ALFA], null))).toBeNull();
  });
});

describe('canChangeClub', () => {
  it('wejście „Zmień klub" istnieje przy więcej niż jednym klubie', () => {
    expect(canChangeClub(record([BETA, ALFA], ALFA.id))).toBe(true);
    expect(canChangeClub(record([ALFA], ALFA.id))).toBe(false);
    expect(canChangeClub(null)).toBe(false);
  });

  it('bez wskazanego bieżącego wejście ZOSTAJE, choć pigułki nie ma', () => {
    // Inaczej jedyna droga do naprawienia tego stanu byłaby zamknięta.
    const broken = record([BETA, ALFA], null);
    expect(deviceClubPill(broken)).toBeNull();
    expect(canChangeClub(broken)).toBe(true);
  });
});

describe('signedOutStart', () => {
  it('urządzenie znające klub startuje od HASŁA - to jest wspólny tablet', () => {
    expect(signedOutStart(record([ALFA], ALFA.id))).toBe('password');
  });

  it('telefon, który nikogo jeszcze nie widział, zaczyna od Google', () => {
    expect(signedOutStart(record([], null))).toBe('google');
    expect(signedOutStart(null)).toBe('google');
  });
});

describe('deviceClubRows', () => {
  it('dzisiejsze logowanie mówi godzinę, starsze - datę', () => {
    const rows = deviceClubRows(record([ALFA, BETA], ALFA.id), NOW);
    expect(rows[0]).toEqual({
      id: ALFA.id,
      name: 'Aeroklub Alfa',
      meta: 'ostatnie logowanie · dziś 07:50',
      active: true,
    });
    expect(rows[1]?.meta).toBe('ostatnie logowanie · 12 WRZ');
    expect(rows[1]?.active).toBe(false);
  });

  it('zachowuje kolejność z magazynu - najświeższy pierwszy, bez własnego sortowania', () => {
    const rows = deviceClubRows(record([BETA, ALFA], ALFA.id), NOW);
    expect(rows.map((r) => r.id)).toEqual([BETA.id, ALFA.id]);
  });

  it('doba liczy się w UTC, jak wszystko w tej aplikacji', () => {
    const justBefore = { ...ALFA, lastLoginAt: '2026-09-17T23:59:00.000Z' };
    expect(deviceClubRows(record([justBefore], null), NOW)[0]?.meta).toBe(
      'ostatnie logowanie · 17 WRZ',
    );
  });

  it('zepsuty stempel daje kreskę, a nie „Invalid Date" na ekranie', () => {
    const broken = { ...ALFA, lastLoginAt: 'nie-data' };
    expect(deviceClubRows(record([broken], null), NOW)[0]?.meta).toBe('ostatnie logowanie · -');
  });
});
