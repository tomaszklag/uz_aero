/**
 * Ninerdeck - testy LISTY OSÓB W ARKUSZU ADRESATÓW (`logic/orderAddressees.ts`; epik Z-C
 * #247; makiety 31C, 32D).
 *
 * Pod obserwacją: kandydaci na fotel imienny bez osoby zlecającej, wyłączonych, siedzących
 * już w fotelu i tych, którzy już są na liście tego fotela; po nazwisku w polskim porządku;
 * podpis o terminie do potwierdzenia przy osobach z listy drugiego fotela (pkt 37, 39);
 * wyszukiwarka bez wielkości liter i bez ogonków.
 */

import type { RemoteOrderCard } from '../application';
import { filterAddressees, swapCandidates, type Member } from '../ui/screens/logic/orderAddressees';
import { booking, card, order, PEOPLE, recipient } from './support/orderFixtures';

const members: Member[] = [
  ...Object.entries(PEOPLE).map(([id, p]) => ({ id, name: p.name, code: p.code, active: true })),
  { id: 'ZZZ', name: 'Zenon Wyłączony', code: 'ZZZ', active: false },
];

const zlecenieB = (over: Partial<RemoteOrderCard> = {}): RemoteOrderCard =>
  card({
    order: order({ createdBy: 'MZI' }),
    viewer: { leads: true, recipient: null },
    recipients: [
      recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null }),
      recipient('AKW'),
      recipient('BNO'),
      recipient('ESO'),
      recipient('AKO'),
      recipient('PLI'),
    ],
    ...over,
  });

describe('kandydaci na fotel imienny (32D → 31C)', () => {
  it('bez zlecającej, odbieranej i wyłączonych; po nazwisku; podpis przy liście drugiego fotela', () => {
    const list = swapCandidates({ card: zlecenieB(), seat: 'pic', outgoing: 'JWR', members });
    const onDual = 'na liście drugiego pilota · po zaznaczeniu termin do potwierdzenia';
    expect(list.map((o) => [o.name, o.sub])).toEqual([
      ['Anna Kowal', onDual],
      ['Adam Kowalski', onDual],
      ['Piotr Lis', onDual],
      ['Barbara Nowak', onDual],
      ['Ewa Sowa', onDual],
      ['Paweł Wilk', null],
    ]);
  });

  it('osoba w fotelu i osoba już na liście tego fotela nie wracają na listę', () => {
    const c = zlecenieB({
      booking: booking({ dualId: 'AKW' }),
      recipients: [
        recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null }),
        recipient('AKW', { assignedSeat: 'dual' }),
        // Termin do potwierdzenia - już na listach OBU foteli.
        recipient('AKO', { seat: null, namedSeat: 'dual', direct: true }),
      ],
    });
    const ids = swapCandidates({ card: c, seat: 'pic', outgoing: 'JWR', members }).map((o) => o.pilotId);
    expect(ids).not.toContain('AKW');
    expect(ids).not.toContain('AKO');
  });

  it('imiennie na drugim fotelu - podpis bez formy z płcią', () => {
    const c = zlecenieB({ recipients: [recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null }), recipient('ESO', { seat: 'dual', direct: true, viaGroupId: null })] });
    const eso = swapCandidates({ card: c, seat: 'pic', outgoing: 'JWR', members }).find((o) => o.pilotId === 'ESO');
    expect(eso?.sub).toBe('imiennie na drugiego pilota · po zaznaczeniu termin do potwierdzenia');
  });

  it('osoba odebrana wcześniej wraca jak nowa (pkt 51) - bez podpisu', () => {
    const c = zlecenieB({ recipients: [recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null }), recipient('PLI', { removed: true })] });
    const pli = swapCandidates({ card: c, seat: 'pic', outgoing: 'JWR', members }).find((o) => o.pilotId === 'PLI');
    expect(pli?.sub).toBeNull();
  });
});

describe('wyszukiwarka arkusza', () => {
  const list = swapCandidates({ card: zlecenieB(), seat: 'pic', outgoing: 'JWR', members });

  it('od początku wyrazu, bez wielkości liter i bez ogonków; kod też', () => {
    expect(filterAddressees(list, 'kow').map((o) => o.name)).toEqual(['Anna Kowal', 'Adam Kowalski']);
    expect(filterAddressees(list, 'pawel').map((o) => o.name)).toEqual(['Paweł Wilk']);
    expect(filterAddressees(list, 'PLI').map((o) => o.name)).toEqual(['Piotr Lis']);
    expect(filterAddressees(list, 'anna ko').map((o) => o.name)).toEqual(['Anna Kowal']);
  });

  it('pusty wpis oddaje całą listę; środek wyrazu nie pasuje', () => {
    expect(filterAddressees(list, '  ')).toHaveLength(list.length);
    expect(filterAddressees(list, 'owal')).toEqual([]);
  });
});
