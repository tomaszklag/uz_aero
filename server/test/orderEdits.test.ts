/**
 * Ninerdeck (serwer) - edycja zlecenia: pogodzenie adresatów z nowym planem i opis zmiany
 * (#245, `docs/zlecenia.md` §5.1, §5.2, §6.2).
 *
 * Najważniejsza własność: ZMIANA NIE JEST PONOWNYM WYSŁANIEM. Dopisanie adresatów trafia
 * wyłącznie do dopisanych, a nowy członek grupy wysłanej wczoraj czeka na „Wyślij ponownie".
 */

import { describe, expect, it } from 'vitest';

import type { PlannedRecipient } from '../src/domain/orderAddressing.ts';
import {
  fieldChanges,
  reconcileRecipients,
  type ExistingRecipient,
  type OrderFields,
} from '../src/domain/orderEdits.ts';

const planned = (pilotId: string, patch: Partial<PlannedRecipient> = {}): PlannedRecipient => ({
  pilotId,
  seat: 'pic',
  namedSeat: null,
  direct: false,
  viaGroupId: 'g-instr',
  ...patch,
});

const row = (pilotId: string, patch: Partial<ExistingRecipient> = {}): ExistingRecipient => ({
  ...planned(pilotId),
  removed: false,
  ...patch,
});

describe('pogodzenie adresatów z planem po zmianie', () => {
  it('dopisany wchodzi, nowy członek grupy bez „Wyślij ponownie" - nie', () => {
    const result = reconcileRecipients(
      [row('JWR')],
      [planned('JWR'), planned('ANN', { viaGroupId: null }), planned('NEW')],
      (pilotId) => pilotId === 'ANN',
    );
    expect(result.added.map((p) => p.pilotId)).toEqual(['ANN']);
    expect(result.updated).toEqual([]);
  });

  it('dopisanie drugiej osoby na fotel imienny robi z niego fotel „kilku osób" - plan się zmienia', () => {
    const result = reconcileRecipients(
      [row('JWR', { direct: true, viaGroupId: null })],
      [planned('JWR', { viaGroupId: null }), planned('ANN', { viaGroupId: null })],
      () => true,
    );
    expect(result.updated).toEqual([planned('JWR', { viaGroupId: null })]);
    expect(result.added.map((p) => p.pilotId)).toEqual(['ANN']);
  });

  it('odebrany nie wraca, nawet gdy plan go niesie (pkt 29)', () => {
    const result = reconcileRecipients([row('JWR', { removed: true })], [planned('JWR')], () => true);
    expect(result).toEqual({ added: [], updated: [], restored: [] });
  });

  it('fotel przestawiony na „brak" USYPIA jego adresatów - wiersz zostaje, jak był (decyzja 2026-09-29)', () => {
    const result = reconcileRecipients(
      [row('JWR', { seat: 'dual' }), row('ANN', { seat: null })],
      // Plan liczy się z samych szukanych foteli: JWR (drugi pilot) w nim nie ma, a ANN stoi
      // już tylko na liście dowódcy - termin do potwierdzenia staje się zgłoszeniem na
      // jedyny szukany fotel.
      [planned('ANN', { seat: 'pic' })],
      () => false,
    );
    expect(result).toEqual({ added: [], updated: [planned('ANN', { seat: 'pic' })], restored: [] });
  });

  it('wypadnięcie z grupy po wysłaniu NIE odbiera zlecenia - wiersz jest zapisem', () => {
    const result = reconcileRecipients([row('JWR')], [], () => true);
    expect(result).toEqual({ added: [], updated: [], restored: [] });
  });

  it('odebrany wraca WYŁĄCZNIE jawnie wskazany - jak nowy, z planem z tej zmiany (decyzja 2026-09-29)', () => {
    const result = reconcileRecipients(
      [row('JWR', { removed: true }), row('ANN', { removed: true })],
      [planned('JWR', { viaGroupId: null }), planned('ANN')],
      () => true,
      (pilotId) => pilotId === 'JWR',
    );
    expect(result).toEqual({ added: [], updated: [], restored: [planned('JWR', { viaGroupId: null })] });
  });
});

describe('opis zmiany - „Edytowane · maszyna SP-AXA → SP-KLM"', () => {
  const base: OrderFields = {
    aircraftId: 'SP-AXA',
    startsAt: Date.parse('2026-10-03T09:00:00Z'),
    endsAt: Date.parse('2026-10-03T11:00:00Z'),
    operation: 'przelot',
    fromIcao: 'EPKK',
    toIcao: 'EPRJ',
    plannedAirMin: 90,
    plannedFuelL: null,
    note: null,
    seats: { pic: 'sought', dual: 'none' },
  };

  it('bez zmian - pusty opis', () => {
    expect(fieldChanges(base, { ...base })).toEqual({});
  });

  it('termin jedzie parą, w napisach ISO; reszta pól osobno', () => {
    const after: OrderFields = {
      ...base,
      startsAt: Date.parse('2026-10-03T10:00:00Z'),
      endsAt: Date.parse('2026-10-03T12:00:00Z'),
      aircraftId: 'SP-KLM',
      toIcao: 'EPWA',
      seats: { pic: 'sought', dual: 'sought' },
    };
    expect(fieldChanges(base, after)).toEqual({
      term: {
        from: { startsAt: '2026-10-03T09:00:00.000Z', endsAt: '2026-10-03T11:00:00.000Z' },
        to: { startsAt: '2026-10-03T10:00:00.000Z', endsAt: '2026-10-03T12:00:00.000Z' },
      },
      aircraft: { from: 'SP-AXA', to: 'SP-KLM' },
      route: { from: { fromIcao: 'EPKK', toIcao: 'EPRJ' }, to: { fromIcao: 'EPKK', toIcao: 'EPWA' } },
      seats: { from: { pic: 'sought', dual: 'none' }, to: { pic: 'sought', dual: 'sought' } },
    });
  });

  it('opis i plan lotu to zwykłe pola - bez terminu nie ma nowej wersji', () => {
    const changes = fieldChanges(base, { ...base, note: 'Weź dokumenty', plannedAirMin: 60 });
    expect(Object.keys(changes)).toEqual(['plannedAirMin', 'note']);
    expect('term' in changes).toBe(false);
  });
});
