/**
 * Ninerdeck - testy ARKUSZA ADRESATA NA KARCIE PROWADZĄCEGO (`logic/orderRecipientMenu.ts`;
 * epik Z-C #247; makieta 32D).
 *
 * Pod obserwacją: nagłówek mówi, kim osoba jest w zleceniu („Dowódca · imiennie · JWR"),
 * autor pisze, a koordynator czyta (bez wątku - nic), „ZAMIEŃ OSOBĘ" wyłącznie przy
 * fotelu imiennym, a osoba w fotelu ma jedną drogę - cofnięcie przydziału.
 */

import type { RemoteOrderCard } from '../application';
import { leaderCardVm } from '../ui/screens/logic/orderLeaderCard';
import { recipientMenuVm } from '../ui/screens/logic/orderRecipientMenu';
import type { ChangePart } from '../ui/screens/logic/orderChanges';
import { aircraftOf, airfieldName, booking, card, codeOf, local, localMs, nameOf, order, recipient, regOf } from './support/orderFixtures';

const flat = (parts: readonly ChangePart[]): string => parts.map((p) => (p.strong ? `[${p.text}]` : p.text)).join('');

const zlecenieB = (over: Partial<RemoteOrderCard> = {}): RemoteOrderCard =>
  card({
    order: order({ createdBy: 'MZI', audienceLabel: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2' }),
    viewer: { leads: true, recipient: null },
    recipients: [
      recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null, seen: true, seenAt: local(-1, '08:15') }),
      recipient('AKW', { answer: 'yes', answeredAt: local(-2, '19:10'), seen: true, threadId: 't-akw', unread: 1 }),
    ],
    ...over,
  });

function leader(c: RemoteOrderCard, viewer: string) {
  const vm = leaderCardVm({ card: c, now: localMs(-1, '21:41'), pilotId: viewer, canCreate: true, nameOf, codeOf, aircraft: aircraftOf(c.booking.aircraftId), airfieldName, regOf });
  if (vm == null) throw new Error('karta nie do narysowania');
  return vm;
}

describe('32D - arkusz adresata', () => {
  const c = zlecenieB();
  const v = leader(c, 'MZI');
  const [pic, dual] = v.blocks;

  it('fotel imienny: nagłówek z fotelem, „imiennie" i kodem; status z wiersza; trzy drogi', () => {
    const menu = recipientMenuVm({ card: c, source: { kind: 'row', row: pic!.rows[0]!, block: 'pic' }, viewerId: 'MZI', nameOf, codeOf });
    expect(menu).toMatchObject({
      pilotId: 'JWR',
      title: 'Jakub Wrona',
      role: 'Dowódca · imiennie · JWR',
      state: 'Odczytane 08:15 · bez odpowiedzi',
      thread: { title: 'Napisz wiadomość', sub: 'Rozmowa · Jakub Wrona', readOnly: false },
      action: { kind: 'remove', swapSeat: 'pic' },
    });
    expect(flat(menu!.note)).toBe('[Jakub Wrona] dostanie wiadomość „Zlecenie nie jest już do Ciebie". Rozmowa zostaje do odczytu.');
  });

  it('adresat z grupy: nazwa grupy zamiast „imiennie", bez zamiany osoby', () => {
    const menu = recipientMenuVm({ card: c, source: { kind: 'row', row: dual!.rows[0]!, block: 'dual' }, viewerId: 'MZI', nameOf, codeOf });
    expect(menu).toMatchObject({ role: 'Drugi pilot · Piloci An-2 · AKW', action: { kind: 'remove', swapSeat: null } });
    expect(flat(menu!.note)).toBe('[Anna Kowal] dostanie wiadomość „Zlecenie nie jest już do Ciebie". Rozmowa zostaje do odczytu.');
  });

  it('koordynator prowadzący cudze zlecenie czyta rozmowę; bez wątku - nie ma czego otworzyć', () => {
    const asManager = leader(c, 'PWL');
    const withThread = recipientMenuVm({ card: c, source: { kind: 'row', row: asManager.blocks[1]!.rows[0]!, block: 'dual' }, viewerId: 'PWL', nameOf, codeOf });
    expect(withThread?.thread).toEqual({ title: 'Rozmowa · Anna Kowal', sub: 'do odczytu', readOnly: true });
    const without = recipientMenuVm({ card: c, source: { kind: 'row', row: asManager.blocks[0]!.rows[0]!, block: 'pic' }, viewerId: 'PWL', nameOf, codeOf });
    expect(without?.thread).toBeNull();
  });

  it('osoba w fotelu: jedna droga - cofnięcie przydziału, z godziną przydziału w statusie', () => {
    const full = zlecenieB({
      order: order({ status: 'filled', createdBy: 'MZI', audienceLabel: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2' }),
      booking: booking({ pilotId: 'JWR', dualId: 'AKW' }),
      history: [{ id: 'h1', actorId: 'MZI', kind: 'assigned', payload: { seat: 'dual', pilotId: 'AKW', via: 'leader' }, at: local(-1, '22:12') }],
    });
    const seat = leader(full, 'MZI').crew!.find((s) => s.pilotId === 'AKW')!;
    const menu = recipientMenuVm({ card: full, source: { kind: 'crew', crew: seat }, viewerId: 'MZI', nameOf, codeOf });
    expect(menu).toMatchObject({
      role: 'Drugi pilot · Piloci An-2 · AKW',
      state: 'Leci · przydział 22:12',
      action: { kind: 'unassign', seat: 'dual' },
    });
    expect(flat(menu!.note)).toBe('[Anna Kowal] dostanie wiadomość, że przydział cofnięto - fotel znów będzie do obsadzenia, a zgłoszenia pozostałych nadal się liczą.');
  });

  it('fotel „ja" i fotel szukany nie mają menu', () => {
    const seat = { seat: 'pic' as const, label: 'Dowódca', pilotId: null, name: null, code: null, status: [], asking: true, menu: false, thread: null, unread: false };
    expect(recipientMenuVm({ card: c, source: { kind: 'crew', crew: seat }, viewerId: 'MZI', nameOf, codeOf })).toBeNull();
  });
});
