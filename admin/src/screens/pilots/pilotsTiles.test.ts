/**
 * UZ Aero — panel: kafle i karta „Rola w panelu" na `A06`.
 *
 * Najważniejszy przypadek w tym pliku: **brak odpowiedzi daje „—", nigdy zera.**
 * Zero jest twierdzeniem o świecie („klub nie ma ani jednego aktywnego konta"),
 * a brak odpowiedzi nim nie jest.
 */

import { describe, expect, it } from 'vitest';

import type { PilotCountsDto } from '../../api/dto';
import {
  monthLabel,
  panelRoleCount,
  pilotTiles,
  roleSplit,
  roleSplitCaption,
} from './pilotsTiles';

const counts: PilotCountsDto = {
  total: 10,
  active: 8,
  inactive: 2,
  admin: 1,
  trainingLead: 1,
  pilot: 8,
  flyingDays: 59,
};

describe('kafle', () => {
  it('pokazują liczby serwera, z „8 / 10" jako wartość i dopisek', () => {
    const tiles = pilotTiles(counts, 'LIP 2026');
    expect(tiles.map((t) => [t.label, t.value, t.unit])).toEqual([
      ['Konta aktywne', '8', '/ 10'],
      ['Z rolą panelu', '2', undefined],
      ['Nieaktywne', '2', undefined],
      ['Dni lotne · LIP 2026', '59', undefined],
    ]);
  });

  it('bez odpowiedzi serwera — wszędzie „—", nigdzie zero', () => {
    for (const tile of pilotTiles(null, 'LIP 2026')) {
      expect(tile.value).toBe('—');
      expect(tile.unit).toBeUndefined();
    }
  });

  it('podpis „z rolą panelu" odmienia liczebniki — WSZYSTKIE TRZY formy', () => {
    const one = pilotTiles(counts, 'LIP 2026')[1];
    expect(one?.note).toBe('1 administrator · 1 szef wyszkolenia.');

    // 2–4 to mianownik liczby mnogiej („administratorzy"), nie dopełniacz. Test do
    // 2026-08-01 utrwalał tu formę błędną („3 administratorów"), więc pilnował wady.
    const few = pilotTiles({ ...counts, admin: 3, trainingLead: 2 }, 'LIP 2026')[1];
    expect(few?.note).toBe('3 administratorzy · 2 szefowie wyszkolenia.');

    // …a 5+ dopiero dopełniacz.
    const many = pilotTiles({ ...counts, admin: 5, trainingLead: 12 }, 'LIP 2026')[1];
    expect(many?.note).toBe('5 administratorów · 12 szefów wyszkolenia.');
  });

  it('kafle MÓWIĄ, że opisują cały klub — bo chipy obok już tak nie robią', () => {
    // Odkąd chipy filtra respektują wyszukiwanie (`pilotsChips.ts`), kafel i chip
    // pokazują na jednym ekranie dwie różne liczby o tej samej rzeczy. Kafel bez
    // adnotacji wyglądałby wtedy jak liczba, która się zacięła.
    const tiles = pilotTiles(counts, 'LIP 2026');
    expect(tiles[0]?.note).toContain('Po całym klubie');
    expect(tiles[2]?.note).toContain('Po całym klubie');
  });

  it('kafel dni bierze liczbę SESJI z serwera, nie sumę kolumny', () => {
    // Suma kolumny „Dni lotne" z wierszy liczy dzień szkolny dwa razy (PIC + Dual),
    // więc byłaby liczbą osobodni. Serwer podaje dni.
    expect(pilotTiles({ ...counts, flyingDays: 59 }, 'LIP 2026')[3]?.value).toBe('59');
  });
});

describe('ile kont ma wejście do panelu', () => {
  it('sumuje administratorów i szefów wyszkolenia — poza `.tsx`', () => {
    expect(panelRoleCount(counts)).toBe(2);
    expect(panelRoleCount({ ...counts, admin: 0, trainingLead: 0 })).toBe(0);
  });
});

describe('karta „Rola w panelu"', () => {
  it('rozbija te same liczby po rolach', () => {
    expect(roleSplit(counts)).toEqual([
      { label: 'Administrator', value: '1', tone: 'blue' },
      { label: 'Szef wyszkolenia', value: '1', tone: 'blue' },
      { label: 'Bez dostępu do panelu', value: '8' },
    ]);
  });

  it('bez odpowiedzi — myślniki, także w podpisie', () => {
    expect(roleSplit(null).map((r) => r.value)).toEqual(['—', '—', '—']);
    expect(roleSplitCaption(null)).toBe('— z — kont');
  });

  it('podpis mówi, ilu z ilu ma wejście do panelu', () => {
    expect(roleSplitCaption(counts)).toBe('2 z 10 kont');
  });
});

describe('etykieta okna dni lotnych', () => {
  it('pełny miesiąc dostaje krótką nazwę', () => {
    expect(monthLabel('2026-07-01', '2026-07-31')).toBe('LIP 2026');
    expect(monthLabel('2026-02-01', '2026-02-28')).toBe('LUT 2026');
  });

  it('okno NIEPEŁNE pokazuje zakres — „LIP 2026" nad pięcioma dniami byłoby fałszem', () => {
    expect(monthLabel('2026-07-01', '2026-07-05')).toBe('2026-07-01 → 2026-07-05');
    expect(monthLabel('2026-06-15', '2026-07-14')).toBe('2026-06-15 → 2026-07-14');
  });

  it('brak okna albo śmieci w polu → neutralne „okno serwera", bez wywracania ekranu', () => {
    expect(monthLabel(undefined, undefined)).toBe('okno serwera');
    expect(monthLabel('nie-data', '2026-07-31')).toBe('okno serwera');
  });
});
