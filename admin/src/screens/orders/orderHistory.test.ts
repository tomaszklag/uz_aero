import { describe, expect, it } from 'vitest';

import type { OrderHistoryEntryDto } from '../../api/dto';
import type { Person } from '../calendar/bookingLabels';
import { orderHistoryRows, type HistoryContext } from './orderHistory';

const PEOPLE: Record<string, Person> = {
  mzi: { name: 'Marta Zięba', code: 'MZI' },
  akw: { name: 'Anna Kowal', code: 'AKW' },
  eso: { name: 'Ewa Sowa', code: 'ESO' },
  pli: { name: 'Piotr Lis', code: 'PLI' },
};

const CTX: HistoryContext = {
  timezone: 'Europe/Warsaw',
  now: Date.parse('2026-10-02T19:45:00Z'),
  viewerId: 'mzi',
  person: (id) => PEOPLE[id] ?? null,
  regOf: (id) => (id === 'axa' ? 'SP-AXA' : id === 'klm' ? 'SP-KLM' : null),
  termAt: Date.parse('2026-10-03T07:00:00Z'),
};

const entry = (kind: string, payload: Record<string, unknown>, actorId: string | null = 'mzi'): OrderHistoryEntryDto => ({
  id: kind,
  actorId,
  kind,
  payload,
  at: '2026-10-02T14:20:00Z',
});

const rows = (...entries: OrderHistoryEntryDto[]) => orderHistoryRows(entries, CTX);

describe('historia zmian zlecenia - słowa jak w telefonie', () => {
  it('przydział, przyjęcie, cofnięcie i rezygnacja nazywają fotel i osobę', () => {
    expect(
      rows(
        entry('assigned', { seat: 'dual', pilotId: 'akw', via: 'leader' }),
        entry('assigned', { seat: 'pic', pilotId: 'akw', via: 'answer' }, 'akw'),
        entry('unassigned', { seat: 'dual', pilotId: 'akw', reason: 'Inny pilot.' }),
        entry('withdrawn', { seat: 'dual', reason: '' }, 'akw'),
      ).map((r) => [r.verdict, r.reason, r.who]),
    ).toEqual([
      ['Rezygnacja · drugi pilot', null, 'Anna Kowal'],
      ['Cofnięty przydział · drugi pilot: Anna Kowal', 'Inny pilot.', 'Ty'],
      ['Przyjęcie · dowódca', null, 'Anna Kowal'],
      ['Przydział · drugi pilot: Anna Kowal', null, 'Ty'],
    ]);
  });

  it('adresaci: dwie osoby nazwiskami, więcej - liczbą', () => {
    expect(rows(entry('recipients_added', { pilotIds: ['eso', 'pli'] }))[0]!.verdict).toBe('Nowi adresaci · Ewa Sowa, Piotr Lis');
    expect(rows(entry('recipients_removed', { pilotIds: ['eso', 'pli', 'akw'] }))[0]!.verdict).toBe('Usunięcie z adresatów · 3 osoby');
  });

  it('odwołanie jest wpisem niszczącym; wygaśnięcie robi zegar, bez nazwiska', () => {
    const [expired, cancelled] = rows(entry('cancelled', { reason: 'Serwis.' }), entry('expired', {}, null));
    expect(cancelled).toMatchObject({ verdict: 'Odwołanie', reason: 'Serwis.', void: true, who: 'Ty' });
    expect(expired).toMatchObject({ verdict: 'Wygasło · bez kompletu załogi', who: null, void: false });
  });

  it('edycja: pary „było → jest" w stałej kolejności pól; termin z innej doby z datą', () => {
    const [row] = rows(
      entry('edited', {
        changes: {
          note: { from: 'a', to: 'b' },
          aircraft: { from: 'axa', to: 'klm' },
          term: {
            from: { startsAt: '2026-10-04T07:00:00Z', endsAt: '2026-10-04T09:00:00Z' },
            to: { startsAt: '2026-10-03T08:00:00Z', endsAt: '2026-10-03T10:00:00Z' },
          },
          seats: { from: { pic: 'sought', dual: 'sought' }, to: { pic: 'sought', dual: 'none' } },
        },
      }),
    );
    expect(row!.verdict).toBeNull();
    expect(row!.changes).toEqual([
      { field: 'termin', from: 'niedziela 4 PAŹ 09:00-11:00', to: '10:00-12:00' },
      { field: 'maszyna', from: 'SP-AXA', to: 'SP-KLM' },
      { field: 'opis', from: null, to: null },
      { field: 'drugi pilot', from: 'szukany', to: 'brak' },
    ]);
  });

  it('rodzaj nieznany temu wydaniu - ogólna „Zmiana", nie znika', () => {
    expect(rows(entry('cos_nowego', {}))[0]!.verdict).toBe('Zmiana');
  });
});
