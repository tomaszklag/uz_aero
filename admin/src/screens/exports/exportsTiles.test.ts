/**
 * UZ Aero - panel: kafle, chipy i stan pusty monitora eksportu.
 *
 * Własność, dla której ten plik istnieje: **brak odpowiedzi to „-", nigdy „0"**. Zero
 * jest twierdzeniem o świecie („w tym zakresie nie ma ani jednej karty"), a nieudane
 * albo trwające żądanie nim nie jest - a kafel z zerem obok banera o błędzie kłamie
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

  it('bez odpowiedzi pokazują „-", nie zero', () => {
    expect(exportTiles(undefined).map((t) => t.value)).toEqual(['-', '-', '-', '-']);
  });

  it('kafel „Błąd regeneracji" z mockupu zastąpił „Bez karty" - i to jest treść, nie nazwa', () => {
    // Licznika prób ani treści błędu nie ma z czego policzyć: nieudany eksport nie
    // zostawia wiersza w żadnej tabeli. To, co da się policzyć uczciwie, to SKUTEK
    // tych awarii - dni zamknięte bez karty.
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

  it('bez odpowiedzi chipy nie mają liczb - a nie mają zer', () => {
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
    // limit. Na ekranie nie było o tym ani zdania - lista przycięta po cichu wygląda
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

  it('mówi o SESJACH i o tym, że decyzja produktowa ZAPADŁA', () => {
    // ODWRÓCENIE zdania z 2026-08-01 („decyzja produktowa jest otwarta"). Decyzja
    // zapadła 2026-08-07: karta jest DOBĄ SAMOLOTU, a zmiana poranna i popołudniowa są
    // jej wierszami - więc nadpisywanie zniknęło z konstrukcji. Baner ma dziś dwie
    // treści: normalną (sesja wycięta z karty flagą) i alarmową (dwie sesje tej samej
    // doby znów budują dwie karty). Bez tego rozróżnienia byłby opisem wady, której
    // już nie ma.
    const note = overwrittenNotice({ ...counts, overwritten: 2 })!;

    expect(note).toContain('2 sesje mają karty nadpisane');
    expect(note).toContain('DOBĄ SAMOLOTU');
    expect(note).toContain('aircraft_overlap');
    expect(note).toContain('usterka do zgłoszenia');
    expect(note).toContain('append-only');
    expect(note).toContain('4.7');
    // Zdanie o otwartej decyzji ma ZNIKNĄĆ - inaczej panel opisuje nieaktualny świat.
    expect(note).not.toContain('otwarta decyzja produktowa');
  });

  it('odmienia jedną nadpisaną kartę poprawnie', () => {
    expect(overwrittenNotice({ ...counts, overwritten: 1 })).toContain('1 sesja ma kartę');
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
