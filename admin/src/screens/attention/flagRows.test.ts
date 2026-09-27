import { describe, expect, it } from 'vitest';

import type { FlagDto } from '../../api/dto';
import { flagRow, sessionRoleLabels } from './flagRows';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 7, 12, 0);

const flag = (patch: Partial<FlagDto>): FlagDto => ({
  id: 1052,
  type: 'fuel_mismatch',
  status: 'open',
  aircraftId: 'SP-AXA',
  reg: 'SP-AXA',
  aircraftType: null,
  mhFormat: 'hhmm',
  sessionUuids: ['a', 'b'],
  sessions: [
    { sessionUuid: 'a', signature: 'SP-AXA/2026-09-01/AKO/1', aircraftId: 'SP-AXA', reg: 'SP-AXA', picId: 'AKO', picCode: 'AKO', picName: 'Adam Kowalski', status: 'closed', claimedAt: null, closeTime: null, tab: null },
    { sessionUuid: 'b', signature: null, aircraftId: 'SP-AXA', reg: 'SP-AXA', picId: 'AKW', picCode: 'AKW', picName: null, status: 'active', claimedAt: null, closeTime: null, tab: null },
  ],
  details: { diffL: 56, handoverL: 92, readingL: 148, toleranceL: 10 },
  createdAt: new Date(NOW - 5 * 24 * HOUR).toISOString(),
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
  blocksExport: false,
  ...patch,
});

const person = (id: string) => (id === 'BNO' ? { name: 'Barbara Nowak', code: 'BNO' } : null);

describe('wiersz skrzynki', () => {
  it('operacje jako linki na poziom 3, sygnatura albo znak, „w toku" po stanie', () => {
    const row = flagRow(flag({}), NOW, 24 * HOUR, person);
    expect(row.sessions).toEqual([
      { uuid: 'a', name: 'SP-AXA/2026-09-01/AKO/1', to: '/dziennik/SP-AXA/a', active: false },
      { uuid: 'b', name: 'SP-AXA', to: '/dziennik/SP-AXA/b', active: true },
    ]);
    expect(row).toMatchObject({ label: 'Rozjazd paliwa', reg: 'SP-AXA', age: '5 dni', old: true, resolved: false });
  });

  it('archiwum: nazwisko rozstrzygającego ze słownika, bez wpisu - kod z odpowiedzi', () => {
    const closed = flag({ status: 'resolved', resolvedBy: 'BNO', resolvedAt: '2026-09-04T08:12:00.000Z', resolutionNote: 'Lot bez aplikacji - dopisany.' });
    expect(flagRow(closed, NOW, 24 * HOUR, person)).toMatchObject({ resolved: true, resolvedBy: 'B. Nowak', resolvedAt: '4 WRZ 08:12 UTC', note: 'Lot bez aplikacji - dopisany.' });
    expect(flagRow(flag({ status: 'resolved', resolvedBy: 'XYZ' }), NOW, 24 * HOUR, person).resolvedBy).toBe('XYZ');
  });

  it('role operacji w karcie: łańcuch = oddanie i przejęcie, nakładka = w toku i zdana', () => {
    expect(sessionRoleLabels(flag({}))).toEqual(['Oddanie samolotu', 'Przejęcie']);
    expect(sessionRoleLabels(flag({ type: 'aircraft_overlap' }))).toEqual(['Operacja zdana', 'Operacja w toku']);
  });
});
