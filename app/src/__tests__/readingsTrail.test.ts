/**
 * UZ Aero - test szlaku odczytu w arkuszach wpisu ręcznego (issue #84 pkt 1, 2 i 4).
 *
 * Moduł nic nie liczy, więc testujemy dokładnie to, co może się zepsuć po cichu:
 * WYBÓR SĄSIADA (pole „zastane" pyta o poprzednika, „po locie" o następcę - zamiana
 * miejscami dałaby zdanie prawdziwe gramatycznie i fałszywe rzeczowo) oraz MILCZENIE
 * przy braku odpowiedzi serwera, bo to jest normalny stan offline, nie awaria.
 */

import { fuelChainTrail, mhChainTrail } from '../ui/screens/logic/readingsTrail';
import type { RemoteReadingsChain, RemoteReadingsChainLink } from '../application';

const before: RemoteReadingsChainLink = {
  sessionUuid: 'rano',
  picId: 'ako',
  at: Date.UTC(2026, 7, 16, 9, 0),
  fuelL: 140,
  mh: 1232.4,
};

const after: RemoteReadingsChainLink = {
  sessionUuid: 'wieczor',
  picId: 'tmk',
  at: Date.UTC(2026, 7, 16, 17, 30),
  fuelL: 96,
  mh: 1234.9,
};

const chain: RemoteReadingsChain = { before, after, oil: null };

describe('szlak paliwa', () => {
  it('pole „zastane" opowiada o POPRZEDNIM locie', () => {
    const rows = fuelChainTrail(chain, 'found');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toContain('Poprzedni lot');
    expect(rows[0]!.title).toContain('AKO');
    expect(rows[0]!.meta).toContain('140');
  });

  it('pole „po locie" opowiada o NASTĘPNYM locie', () => {
    const rows = fuelChainTrail(chain, 'after');

    expect(rows[0]!.title).toContain('Następny lot');
    expect(rows[0]!.title).toContain('TMK');
    expect(rows[0]!.meta).toContain('96');
  });

  it('bez odpowiedzi serwera arkusz milczy - to jest normalny stan offline', () => {
    expect(fuelChainTrail(null, 'found')).toEqual([]);
    expect(fuelChainTrail(undefined, 'after')).toEqual([]);
    expect(fuelChainTrail({ before: null, after: null, oil: null }, 'found')).toEqual([]);
  });
});

describe('szlak motogodzin', () => {
  it('bierze licznik z tego samego sąsiada, co paliwo', () => {
    expect(mhChainTrail(chain, 'before', 'decimal')[0]!.meta).toContain('1232');
    expect(mhChainTrail(chain, 'after', 'decimal')[0]!.meta).toContain('1234');
  });

  it('pisze licznik w formacie tej maszyny', () => {
    const hhmm = mhChainTrail(chain, 'before', 'hhmm')[0]!.meta;

    expect(hhmm).toContain(':');
  });

  it('brak sąsiada z danej strony nie rysuje ogniwa drugiej strony', () => {
    const onlyBefore: RemoteReadingsChain = { before, after: null, oil: null };

    expect(mhChainTrail(onlyBefore, 'before', 'decimal')).toHaveLength(1);
    expect(mhChainTrail(onlyBefore, 'after', 'decimal')).toEqual([]);
  });
});
