/**
 * UZ Aero - panel: treść całej skrzynki (moduł czysty).
 *
 * Dwie decyzje: co powiedzieć, gdy na liście stoją sprawy trzymające karty dnia,
 * i co powiedzieć zamiast listy, gdy nie ma jej wcale.
 */

import { describe, expect, it } from 'vitest';

import type { FlagListItemDto } from '../../api/dto';
import { DEFAULT_FLAG_FILTER } from './flagFilters';
import { blockingFlags, inboxEmpty } from './flagInbox';

const flag = (over: Partial<FlagListItemDto>): FlagListItemDto => ({
  id: 1,
  type: 'mh_gap',
  status: 'open',
  aircraftId: 'SP-ABC',
  reg: 'SP-ABC',
  aircraftType: null,
  sessionUuids: [],
  details: {},
  createdAt: '2026-07-31T00:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
  blocksExport: false,
  ...over,
});

describe('blockingFlags', () => {
  it('wymienia NUMERY spraw z ekranu, zamiast cokolwiek sumować', () => {
    // Lista bywa zawężona filtrem i przycięta limitem, więc policzenie z niej
    // „ile flag blokuje eksport" dałoby liczbę, której serwer nigdy nie wysłał.
    const items = [
      flag({ id: 1043, blocksExport: true, reg: 'SP-XYZ' }),
      flag({ id: 1041 }),
      flag({ id: 1046, blocksExport: true, reg: null, aircraftId: 'SP-KLM' }),
    ];

    expect(blockingFlags(items)).toEqual([
      { id: 1043, reg: 'SP-XYZ' },
      { id: 1046, reg: 'SP-KLM' },
    ]);
  });

  it('brak spraw blokujących daje pustą listę - baner ma wtedy zniknąć', () => {
    expect(blockingFlags([flag({ id: 1 })])).toEqual([]);
  });
});

describe('inboxEmpty', () => {
  it('pusta skrzynka otwartych spraw to wiadomość o STANIE KLUBU', () => {
    const empty = inboxEmpty(DEFAULT_FLAG_FILTER);
    expect(empty.title).toBe('BRAK OTWARTYCH FLAG');
    expect(empty.note).toMatch(/wypracować/);
  });

  it('pusty wynik ZAWĘŻENIA mówi o zapytaniu, nie o stanie klubu', () => {
    // Jeden napis na oba przypadki kazałby administratorowi zgadywać, czy widzi
    // dobrą wiadomość, czy własną literówkę.
    const empty = inboxEmpty({ ...DEFAULT_FLAG_FILTER, type: 'clock_drift' });
    expect(empty.title).toBe('NIC W TYM FILTRZE');
    expect(empty.note).toMatch(/zawężona/);
  });

  it('brak rozwiązanych spraw ma własny komunikat', () => {
    const empty = inboxEmpty({ ...DEFAULT_FLAG_FILTER, status: 'resolved' });
    expect(empty.title).toBe('BRAK ROZWIĄZANYCH FLAG');
    expect(empty.note).toMatch(/nie znika z bazy/);
  });
});
