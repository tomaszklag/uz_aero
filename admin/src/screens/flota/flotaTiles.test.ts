/**
 * UZ Aero — panel: kafle, chipy i karta progów floty (`A07`).
 *
 * Dwie własności, których złamanie widać dopiero na ekranie: kafel opisuje FLOTĘ,
 * a chip — to, co człowiek zobaczy po kliknięciu. Trzecia: brak odpowiedzi serwera
 * daje „—", nigdy zero.
 */

import { describe, expect, it } from 'vitest';

import type { AircraftListItemDto, FleetCountsDto } from '../../api/dto';
import { fleetChips, fleetTiles, toleranceRows } from './flotaTiles';

const NOW = Date.UTC(2026, 6, 31, 14, 22, 0);
const HOUR = 60 * 60_000;

const dto = (over: Partial<AircraftListItemDto> = {}): AircraftListItemDto => ({
  id: 'ac-1',
  reg: 'SP-AXA',
  type: 'Cessna 182',
  year: 2019,
  capacityL: 330,
  fuelToleranceL: 16.5,
  mhFormat: 'hhmm',
  dualRequired: false,
  serviceStatus: 'active',
  updatedAt: '2026-07-30T18:41:00.000Z',
  claim: null,
  reading: null,
  lastEventAt: null,
  openSessions: 0,
  openFlags: 0,
  ...over,
});

const counts: FleetCountsDto = { total: 5, active: 4, disabled: 1, claimed: 1 };

const labelled = (label: string, tiles: ReturnType<typeof fleetTiles>) => {
  const tile = tiles.find((t) => t.label === label);
  if (tile == null) throw new Error(`brak kafla „${label}"`);
  return tile;
};

describe('kafle floty', () => {
  it('„W służbie" pokazuje ile z ilu — obie liczby z serwera', () => {
    const tile = labelled('W służbie', fleetTiles(counts, [], NOW));
    expect(tile.value).toBe('4');
    expect(tile.unit).toBe('/ 5');
  });

  it('bez odpowiedzi serwera kafel mówi „—", a NIE zero', () => {
    // Zero jest twierdzeniem „klub nie ma ani jednego samolotu w służbie" — a to
    // zdanie tuż obok banera o błędzie byłoby po prostu nieprawdą.
    const tiles = fleetTiles(null, [], NOW);
    expect(tiles.map((t) => t.value)).toEqual(['—', '—', '—', '—']);
  });

  it('kafel claimu wypisuje jednostkę z nazwiska, gdy jest jedna', () => {
    const items = [
      dto({
        claim: {
          sessionUuid: 's',
          picId: 'TMK',
          picCode: 'TMK',
          picName: 'Tomasz Małkiewicz',
          since: Date.UTC(2026, 6, 31, 7, 58),
        },
      }),
    ];
    expect(labelled('Z aktywnym claimem', fleetTiles(counts, items, NOW)).note).toBe(
      'SP-AXA · Tomasz Małkiewicz od 07:58 UTC.',
    );
  });

  it('przy kilku zajętych jednostkach wypisuje same rejestracje', () => {
    const claim = {
      sessionUuid: 's',
      picId: 'TMK',
      picCode: 'TMK',
      picName: 'Tomasz Małkiewicz',
      since: null,
    };
    const items = [dto({ claim }), dto({ id: 'ac-2', reg: 'SP-FGK', claim })];
    expect(labelled('Z aktywnym claimem', fleetTiles(counts, items, NOW)).note).toBe(
      'SP-AXA · SP-FGK — dni w toku.',
    );
  });

  it('„Najstarszy odczyt" wybiera jednostkę, której telefon milczy najdłużej', () => {
    const items = [
      dto({ id: 'a', reg: 'SP-AXA', lastEventAt: new Date(NOW - 3 * HOUR).toISOString() }),
      dto({ id: 'b', reg: 'SP-DEF', lastEventAt: new Date(NOW - 50 * HOUR).toISOString() }),
    ];
    const tile = labelled('Najstarszy odczyt', fleetTiles(counts, items, NOW));
    expect(tile.value).toBe('2 dni 2 h');
    expect(tile.note).toContain('SP-DEF');
  });

  it('jednostki BEZ ani jednego zdarzenia są pomijane — to inny stan niż „dawno"', () => {
    const items = [
      dto({ id: 'a', reg: 'SP-NOWY', lastEventAt: null }),
      dto({ id: 'b', reg: 'SP-DEF', lastEventAt: new Date(NOW - HOUR).toISOString() }),
    ];
    expect(labelled('Najstarszy odczyt', fleetTiles(counts, items, NOW)).note).toContain('SP-DEF');
  });

  it('gdy żadna jednostka nic nie przysłała — kafel przyznaje się do braku', () => {
    const tile = labelled('Najstarszy odczyt', fleetTiles(counts, [dto()], NOW));
    expect(tile.value).toBe('—');
    expect(tile.note).toContain('nie przysłała');
  });
});

describe('chipy', () => {
  it('cztery zawężenia z mockupu, w tej samej kolejności', () => {
    expect(fleetChips(counts).map((c) => c.scope)).toEqual([
      'all',
      'active',
      'disabled',
      'claimed',
    ]);
  });

  it('bez liczb z serwera chip zostaje etykietą, a nie kłamie zerem', () => {
    expect(fleetChips(null).every((c) => c.count === null)).toBe(true);
  });

  it('liczby biorą się z `scopes`, czyli z zawężenia wyszukiwaniem', () => {
    expect(fleetChips({ total: 1, active: 1, disabled: 0, claimed: 0 })).toEqual([
      { scope: 'all', label: 'Wszystkie', count: 1 },
      { scope: 'active', label: 'W służbie', count: 1 },
      { scope: 'disabled', label: 'Wyłączone', count: 0 },
      { scope: 'claimed', label: 'Z claimem', count: 0 },
    ]);
  });
});

describe('karta „Progi zależne od pojemności"', () => {
  it('wypisuje jednostki W SŁUŻBIE z progiem policzonym przez serwer', () => {
    const items = [
      dto({ id: 'a', reg: 'SP-AXA', capacityL: 330, fuelToleranceL: 16.5 }),
      dto({ id: 'b', reg: 'SP-ANK', capacityL: 1700, fuelToleranceL: 85 }),
    ];
    expect(toleranceRows(items)).toEqual([
      { id: 'a', label: 'SP-AXA · 330 L', value: '±16.5 L' },
      { id: 'b', label: 'SP-ANK · 1700 L', value: '±85.0 L' },
    ]);
  });

  it('pomija jednostki wyłączone — nie wygenerują już żadnego zdarzenia', () => {
    const items = [dto({ id: 'a' }), dto({ id: 'b', reg: 'SP-KWA', serviceStatus: 'disabled' })];
    expect(toleranceRows(items).map((r) => r.id)).toEqual(['a']);
  });
});
