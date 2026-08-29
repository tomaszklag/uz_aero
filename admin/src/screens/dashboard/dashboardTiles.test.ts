/**
 * UZ Aero - panel: testy kafli pulpitu (`A01`, `A01a`).
 *
 * Dwie własności, na których stoi zaufanie do całego ekranu:
 *  1. **`null` to „nie wiemy", nigdy `0`** - „0 otwartych flag" przy awarii pobrania
 *     to najgorszy możliwy komunikat w narzędziu nadzoru, bo wygląda jak dobra
 *     wiadomość;
 *  2. **każdy kafel ma dokąd prowadzić**, a jego liczba jest obietnicą „tyle wierszy
 *     tam zobaczysz" - czyli cel przejścia zawęża listę dokładnie tak, jak policzony
 *     jest kafel.
 */

import { describe, expect, it } from 'vitest';

import { dashboardFixture } from '../../../test/fixtures/dashboard';
import { dashboardTiles } from './dashboardTiles';

const byKey = (key: string, data: Parameters<typeof dashboardTiles>[0]) => {
  const tile = dashboardTiles(data).find((t) => t.key === key);
  if (tile == null) throw new Error(`brak kafla ${key}`);
  return tile;
};

describe('brak odpowiedzi z serwera', () => {
  it('WSZYSTKIE cztery kafle mówią „-", żaden nie mówi zera', () => {
    const tiles = dashboardTiles(null);
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.value).toBe('-');
      expect(tile.note).toBe('Nie wiadomo - pulpit się nie pobrał.');
      // Jednostka bez liczby byłaby „- / 5", czyli twierdzeniem o flocie przy braku
      // wiedzy o niej.
      expect(tile.unit).toBeUndefined();
    }
  });

  it('przejścia ZOSTAJĄ czynne - lista docelowa może się pobrać, choć pulpit nie', () => {
    for (const tile of dashboardTiles(null)) {
      expect(tile.to.startsWith('/')).toBe(true);
    }
  });
});

describe('kafel jest przejściem, więc jego liczba jest obietnicą', () => {
  const data = dashboardFixture();

  it('samoloty w ruchu prowadzą do floty zawężonej do zajętych', () => {
    const tile = byKey('ruch', data);
    expect(tile.value).toBe('3');
    expect(tile.unit).toBe('/ 4');
    expect(tile.to).toBe('/flota?zakres=claimed');
  });

  it('dni otwarte prowadzą do listy dni z chipem „Otwarte"', () => {
    const tile = byKey('dni', data);
    expect(tile.value).toBe('3');
    expect(tile.to).toBe('/dni?stan=open');
    // Przypis mówi o tym, co WYMAGA UWAGI, a nie powtarza liczby.
    expect(tile.note).toContain('1 bez `day_close` dłużej niż doba');
  });

  it('flagi otwarte prowadzą do skrzynki w stanie domyślnym (czyli otwartych)', () => {
    const tile = byKey('flagi', data);
    expect(tile.value).toBe('2');
    expect(tile.tone).toBe('amber');
    expect(tile.to).toBe('/flagi');
    expect(tile.note).toContain('trzyma kartę dnia poza arkuszem');
  });

  it('eksport z awarią prowadzi tam, gdzie awarie WIDAĆ, a nie do pełnej listy', () => {
    const tile = byKey('eksport', data);
    expect(tile.value).toBe('1');
    expect(tile.unit).toBe('błąd');
    expect(tile.tone).toBe('red');
    expect(tile.to).toBe('/eksporty?stan=missing');
  });
});

describe('zero NIE jest awarią i nie ma prawa świecić ostrzegawczo', () => {
  it('zero flag jest zielone, nie bursztynowe (`A03b`)', () => {
    const data = dashboardFixture();
    data.counts.openFlags = 0;
    data.attention.flags = [];

    const tile = byKey('flagi', data);
    expect(tile.value).toBe('0');
    expect(tile.tone).toBe('green');
    expect(tile.note).toBe('Skrzynka pusta. Historia rozwiązanych zostaje.');
  });

  it('komplet kart w arkuszu daje kafel SŁOWNY, nie czerwone zero', () => {
    // Mockup `A01a` pisze tu „wszystko aktualne" - liczba w czerwieni przy zerowej
    // awarii byłaby fałszywym alarmem na ekranie, który ma alarmować.
    const data = dashboardFixture();
    data.counts.exports = {
      total: 3,
      current: 3,
      blocked: 0,
      missing: 0,
      waiting: 0,
      impossible: 0,
      revised: 0,
      overwritten: 0,
    };

    const tile = byKey('eksport', data);
    expect(tile.value).toBe('wszystko aktualne');
    expect(tile.tone).toBe('green');
    expect(tile.note).toContain('3 z 3');
    expect(tile.to).toBe('/eksporty');
  });

  it('same karty ZABLOKOWANE flagą to bursztyn, nie czerwień - to nie jest awaria', () => {
    const data = dashboardFixture();
    data.counts.exports = {
      total: 4,
      current: 3,
      blocked: 1,
      missing: 0,
      waiting: 0,
      impossible: 0,
      revised: 0,
      overwritten: 0,
    };

    const tile = byKey('eksport', data);
    expect(tile.tone).toBe('amber');
    expect(tile.value).toBe('1');
    expect(tile.note).toContain('Rozstrzygnięcie ją odblokuje');
  });

  it('dzień otwarty od rana NIE jest zaległością i przypis to mówi', () => {
    const data = dashboardFixture();
    data.attention.staleOpenDays = [];
    expect(byKey('dni', data).note).toBe('Wszystkie z dzisiaj - to normalna praca, nie zaległość.');
  });
});
