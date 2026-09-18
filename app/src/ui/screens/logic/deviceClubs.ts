/**
 * Ninerdeck - KLUB URZĄDZENIA na ekranach logowania (2.1.0, D10; makiety `00f`, `00i`).
 *
 * Urządzenie pamięta kluby, z których się na nim logowano - PRZED zalogowaniem to jedyna
 * lista, jaką zna, bo osoby jeszcze nie ma. Kod pilota rozwiązuje się w BIEŻĄCYM z nich.
 *
 * Moduł czysty, bo wszystkie trzy decyzje są produktowe, a nie kosmetyczne: kiedy ekran
 * w ogóle mówi o klubie, od którego ekranu zaczyna urządzenie po wylogowaniu i jak nazwać
 * chwilę ostatniego logowania.
 */

import { dateUtcDayMonth, timeUtc } from '@ninerdeck/format';

import type { DeviceClubsRecord } from '../../../application/ports';

/**
 * Nazwa klubu do PIGUŁKI pod marką na 00F; `null` = ekran o klubie MILCZY.
 *
 * Zna JEDEN klub → cisza: nazwa przy każdym logowaniu na tablecie jednego aeroklubu
 * niczego nie odróżnia (reguła SyncChipa z issue #12), a kod pilota rozwiązuje się
 * w nim po cichu. Świeże urządzenie też milczy - tam kod nie ma czego wskazać i loginem
 * zostaje sam adres; zdanie o tym byłoby opisem budowy aplikacji (issue #72).
 */
export function deviceClubPill(device: DeviceClubsRecord | null): string | null {
  if (!knowsSeveral(device)) return null;
  // Lista dłuższa niż jeden bez wskazanego bieżącego nie powinna się zdarzyć (każdy wpis
  // powstaje razem z ustawieniem go na bieżący), ale gdyby - MILCZYMY zamiast zgadywać:
  // pigułka z nazwą klubu, w którym kod się NIE rozwiąże, byłaby kłamstwem dokładnie tam,
  // gdzie pilot sprawdza, dokąd wpisuje swoje trzy litery.
  return device.clubs.find((c) => c.id === device.activeId)?.name ?? null;
}

/**
 * Czy w stopce 00F stoi „Zmień klub" (wejście na 00I).
 *
 * To NIE jest ten sam warunek, co pigułka, i różnica jest celowa: przy liście bez
 * wskazanego bieżącego pigułki nie ma, ale wejście MUSI być - inaczej jedyna droga
 * do naprawienia tego stanu byłaby zamknięta.
 */
export const canChangeClub = (device: DeviceClubsRecord | null): boolean => knowsSeveral(device);

/** Ekran, od którego zaczyna urządzenie bez profilu (E6). */
export type SignedOutStart = 'google' | 'password';

/**
 * URZĄDZENIE, KTÓRE ZNA KLUB, STARTUJE OD HASŁA.
 *
 * Wspólny tablet w samolocie przechodzi ten ekran kilka razy dziennie - zawsze tą samą
 * drogą, bo Googlem na cudzym urządzeniu nikt się nie loguje (§1). Stawianie mu 00A po
 * drodze kosztowałoby tapnięcie przy każdej zmianie pilota. Telefon osobisty, który
 * jeszcze nikogo nie widział, zaczyna od Google - tam hasła zwykle nie ma.
 *
 * Decyduje SAMA ZNAJOMOŚĆ KLUBU, nie liczba klubów: jeden zapamiętany klub już znaczy
 * „na tym urządzeniu ktoś się logował do klubu", czyli dokładnie przypadek tabletu.
 */
export const signedOutStart = (device: DeviceClubsRecord | null): SignedOutStart =>
  device != null && device.clubs.length > 0 ? 'password' : 'google';

/** Karta klubu na 00I. */
export interface DeviceClubRow {
  id: string;
  name: string;
  /** „ostatnie logowanie · dziś 07:50" albo „… · 12 WRZ". */
  meta: string;
  /** Zielona ramka i ptaszek - klub, w którym rozwiąże się kod pilota. */
  active: boolean;
}

/**
 * Lista kart 00I - w kolejności, w jakiej przyszła z magazynu (najświeższy pierwszy).
 *
 * Chwila ostatniego logowania jest DZISIEJSZA albo nie - i tylko to rozróżnienie ma
 * znaczenie przy wyborze: „dziś 07:50" mówi „to jest ten tablet, na którym pracowaliśmy
 * rano", a starsze wpisy wystarczy odróżnić datą. Doba liczy się w UTC, jak wszystko
 * w tej aplikacji.
 */
export function deviceClubRows(device: DeviceClubsRecord | null, now: number): DeviceClubRow[] {
  if (device == null) return [];
  return device.clubs.map((club) => {
    const at = Date.parse(club.lastLoginAt);
    return {
      id: club.id,
      name: club.name,
      meta: `ostatnie logowanie · ${Number.isNaN(at) ? '-' : when(at, now)}`,
      active: club.id === device.activeId,
    };
  });
}

const knowsSeveral = (device: DeviceClubsRecord | null): device is DeviceClubsRecord =>
  device != null && device.clubs.length >= 2;

const utcDay = (t: number): number => Math.floor(t / 86_400_000);

const when = (at: number, now: number): string =>
  utcDay(at) === utcDay(now) ? `dziś ${timeUtc(at)}` : dateUtcDayMonth(at);
