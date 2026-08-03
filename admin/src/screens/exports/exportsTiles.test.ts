/**
 * UZ Aero — panel: kafle, chipy i stan pusty monitora eksportu.
 *
 * Własność, dla której ten plik istnieje: **brak odpowiedzi to „—", nigdy „0"**. Zero
 * jest twierdzeniem o świecie („w tym zakresie nie ma ani jednej karty"), a nieudane
 * albo trwające żądanie nim nie jest — a kafel z zerem obok banera o błędzie kłamie
 * najbardziej przekonująco.
 */

import { describe, expect, it } from 'vitest';

import type { ExportCountsDto } from '../../api/dto';
import {
  exportsEmpty,
  exportChips,
  exportTiles,
  overwrittenNotice,
  truncationNotice,
} from './exportsTiles';

const counts: ExportCountsDto = {
  total: 8,
  current: 3,
  blocked: 2,
  missing: 1,
  waiting: 2,
  impossible: 0,
  revised: 2,
  overwritten: 0,
};

describe('kafle monitora eksportu', () => {
  it('przepisują liczby serwera, nie sumują wierszy', () => {
    const tiles = exportTiles(counts);

    expect(tiles.map((t) => t.value)).toEqual(['3', '2', '2', '1']);
    expect(tiles.map((t) => t.label)).toEqual([
      'Karty w arkuszu',
      'Rewizje > 1',
      'Zablokowane flagą',
      'Bez karty',
    ]);
  });

  it('bez odpowiedzi pokazują „—", nie zero', () => {
    expect(exportTiles(undefined).map((t) => t.value)).toEqual(['—', '—', '—', '—']);
  });

  it('kafel „Błąd regeneracji" z mockupu zastąpił „Bez karty" — i to jest treść, nie nazwa', () => {
    // Licznika prób ani treści błędu nie ma z czego policzyć: nieudany eksport nie
    // zostawia wiersza w żadnej tabeli. To, co da się policzyć uczciwie, to SKUTEK
    // tych awarii — dni zamknięte bez karty.
    const tile = exportTiles(counts).at(-1)!;
    expect(tile.label).toBe('Bez karty');
    expect(tile.note).toContain('eksport nie doszedł');
  });
});

describe('chipy filtra', () => {
  it('każdy chip niesie liczbę z serwera i zdanie o tym, co zawęża', () => {
    const chips = exportChips(counts);

    expect(chips.map((c) => c.scope)).toEqual([
      'all',
      'current',
      'revised',
      'blocked',
      'missing',
      'waiting',
      'impossible',
    ]);
    expect(chips[0]).toMatchObject({ label: 'Wszystkie', count: 8 });
    expect(chips.every((chip) => chip.title.length > 0)).toBe(true);
  });

  it('bez odpowiedzi chipy nie mają liczb — a nie mają zer', () => {
    expect(exportChips(undefined).every((chip) => chip.count === undefined)).toBe(true);
  });
});

describe('baner obcięcia listy', () => {
  it('milczy, dopóki lista nie jest przycięta', () => {
    expect(truncationNotice({ shown: 8, matched: 8, truncated: false })).toBeNull();
  });

  it('mówi ile widać, ilu nie widać i że liczniki opisują CAŁY zakres', () => {
    // Wada, którą ten przypadek zamyka: `EXPORTS_PAGE_LIMIT` nie było używane nigdzie,
    // a jego docblock obiecywał, że „ekran mówi o tym wprost", gdy zakres przekroczy
    // limit. Na ekranie nie było o tym ani zdania — lista przycięta po cichu wygląda
    // na komplet, więc odpowiedź „każdy dzień ma arkusz" brzmiała jak prawdziwa.
    const note = truncationNotice({ shown: 200, matched: 431, truncated: true })!;

    expect(note).toContain('200 z 431');
    expect(note).toContain('231 dni');
    expect(note).toContain('200 wierszy');
    expect(note).toContain('CAŁY zakres');
  });

  it('odmienia jeden ukryty dzień poprawnie', () => {
    expect(truncationNotice({ shown: 200, matched: 201, truncated: true })).toContain('1 dzień');
  });
});

describe('baner nadpisanych kart', () => {
  it('milczy, gdy żadna karta nie została nadpisana', () => {
    expect(overwrittenNotice(counts)).toBeNull();
    expect(overwrittenNotice(undefined)).toBeNull();
  });

  it('nazywa PRZYCZYNĘ i mówi wprost, że decyzja produktowa jest otwarta', () => {
    // Wada, którą ten przypadek zamyka: dwie zamknięte zmiany na jednym samolocie tego
    // samego dnia budują kartę o tej samej nazwie, więc druga nadpisuje pierwszą —
    // a monitor raportował obie jako „W arkuszu". Poprawki po stronie panelu nie ma:
    // konwencja nazw jest lustrem ekranu 11 telefonu i częścią §4.7.
    const note = overwrittenNotice({ ...counts, overwritten: 2 })!;

    expect(note).toContain('2 dni ma karty nadpisane');
    expect(note).toContain('exported_sheets');
    expect(note).toContain('append-only');
    expect(note).toContain('decyzja produktowa');
    expect(note).toContain('4.7');
  });

  it('odmienia jedną nadpisaną kartę poprawnie', () => {
    expect(overwrittenNotice({ ...counts, overwritten: 1 })).toContain('1 dzień ma kartę');
  });
});

describe('stan pusty', () => {
  it('rozróżnia „nikt nie latał" od „to zawężenie nic nie łapie"', () => {
    expect(exportsEmpty(false).title).toContain('ŻADEN DZIEŃ');
    expect(exportsEmpty(false).note).toContain('day_close');

    expect(exportsEmpty(true).title).toContain('ZAWĘŻENIU');
    // Drugi przypadek wymaga podpowiedzi, jak z niego wyjść.
    expect(exportsEmpty(true).note).toContain('Zdejmij chip');
  });
});
