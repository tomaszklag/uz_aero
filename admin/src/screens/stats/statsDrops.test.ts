/**
 * UZ Aero - panel: strona przychodowa · zrzuty.
 *
 * Trzy stany sekcji (ok / stale / empty) i uczciwość średniej wysokości: liczby
 * przychodzą z serwera, a przypis mówi, ILE zrzutów nie weszło do średniej.
 */

import { describe, expect, it } from 'vitest';

import { statsFixture } from '../../../test/fixtures/stats';
import { dropsView } from './statsDrops';

describe('dropsView - dane kompletne', () => {
  const data = statsFixture();
  const view = dropsView(data.drops, data.operations);

  it('kafle mockupu: wyniesienia, skoczkowie, średnia wysokość, skoczkowie/h', () => {
    expect(view.state).toBe('ok');
    expect(view.tiles.map((t) => [t.key, t.value])).toEqual([
      ['lifts', '178'],
      ['jumpers', '962'],
      ['altitude', '12 840'],
      ['per-hour', '13.5'],
    ]);
    expect(view.tiles[0]!.note).toBe('Zdarzeń `drop` · 8,5 na dzień lotny.');
    expect(view.tiles[1]!.note).toBe('Średnio 5,4 na wyniesienie.');
    expect(view.tiles[3]!.note).toBe('962 skoczków / 71:24 czasu lotu.');
  });

  it('średnia mówi, że 7 zrzutów bez wysokości NIE weszło do średniej', () => {
    // Dokładnie zdanie z mockupu - razem z odmianą („7 … nie wchodzi").
    expect(view.tiles[2]!.note).toBe(
      'Z 171 zrzutów, które miały fix GPS - 7 bez wysokości nie wchodzi do średniej.',
    );
  });

  it('licznik zrzutów Z fixem przychodzi z serwera, nie z odejmowania panelu', () => {
    // `lifts − dropsWithoutAltitude` to arytmetyka panelu odtwarzająca liczbę, którą
    // serwer MA (`drop_alt_count`). Fixture celowo niesie INNĄ wartość, żeby złapać
    // moduł liczący po swojemu.
    const data = statsFixture();
    data.drops.dropsWithAltitude = 170;
    const view = dropsView(data.drops, data.operations);
    expect(view.tiles[2]!.note).toContain('Z 170 zrzutów');
  });

  it('plakietki nagłówka: zakres operacji i jednostki z liczbą dni', () => {
    expect(view.pills).toEqual([
      { key: 'scope', label: 'operacja SKOKI', tone: 'blue' },
      { key: 'units', label: 'SP-KLM · 21 dni', tone: 'dim' },
    ]);
  });

  it('wstęga typów: udziały w skoczkach, segment zerowy ZNIKA', () => {
    expect(view.ribbon.map((s) => s.label)).toEqual(['TANDEM 421', 'AFF 168', 'SOLO 373']);
    expect(view.ribbon[0]!.width).toBe('43.8%');

    const data = statsFixture();
    data.drops.aff = 0;
    data.drops.jumpers = 794;
    const withoutAff = dropsView(data.drops, data.operations);
    expect(withoutAff.ribbon.map((s) => s.label)).toEqual(['TANDEM 421', 'SOLO 373']);
  });

  it('tabela klientów z wierszem RAZEM; brak wskazania klienta jest NAZWANY', () => {
    expect(view.clients.map((row) => row.client)).toEqual([
      'SKY CAMP',
      'STREFA RADOM',
      'RAZEM',
    ]);
    expect(view.clients[0]).toMatchObject({ lifts: '124', jumpers: '682', avgAltitude: '12 900 ft' });

    const data = statsFixture();
    data.drops.clients[0]!.client = null;
    const anonymous = dropsView(data.drops, data.operations);
    expect(anonymous.clients[0]!.client).toBe('bez wskazania klienta');
  });
});

describe('dropsView - niewiedza i pustka', () => {
  it('wiersze sprzed kolumn statystyk: kafle „-", ZERO tabeli klientów, baner z powodem', () => {
    const data = statsFixture();
    data.drops.staleRows = 2;
    data.drops.lifts = null;
    data.drops.jumpers = null;
    data.drops.avgAltitudeFt = null;
    data.drops.clients = [];

    const view = dropsView(data.drops, data.operations);
    expect(view.state).toBe('stale');
    for (const tile of view.tiles) expect(tile.value).toBe('-');
    expect(view.ribbon).toEqual([]);
    expect(view.clients).toEqual([]);
    expect(view.note).toContain('kolumn statystyk');
    expect(view.note).toContain('twierdziłyby, że nikt nie skakał');
    // Licznik stale obejmuje TAKŻE dni bez rodzaju operacji (każdy MÓGŁ być skokowy)
    // - zdanie stanu musi nazwać oba powody, nie tylko kolumny statystyk.
    expect(view.note).toContain('MÓGŁ być skokowy');
  });

  it('zakres bez dni SKOKI: stan pusty z wyjaśnieniem, nie awaria', () => {
    const data = statsFixture();
    data.drops = { ...data.drops, sessions: 0, lifts: 0, jumpers: 0, clients: [] };
    const view = dropsView(data.drops, data.operations);
    expect(view.state).toBe('empty');
    expect(view.note).toContain('nie ma zamkniętych dni operacji SKOKI');
  });
});
