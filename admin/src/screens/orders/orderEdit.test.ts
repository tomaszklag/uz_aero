/**
 * Edycja i powielenie zlecenia - zlecenie B z makiet: Marta Zięba (MZI) zleca skoki SP-ANA,
 * sobota 3 października 09:00-13:00 czasu klubu; dowódca imiennie Jakub Wrona, drugi pilot
 * z grupy „Piloci An-2" (Adam, Anna, Barbara). Patrzymy w czwartek 1 października.
 */

import { describe, expect, it } from 'vitest';

import type { DirectoryMemberDto, GroupDto, OrderCardDto, OrderLeaderRecipientDto } from '../../api/dto';
import {
  draftOfOrder,
  duplicateDraft,
  editNote,
  editStep3Blocker,
  listsOf,
  orderPatchOf,
  seatLossNote,
  sentOf,
  termShift,
} from './orderEdit';
import { addressOptions, audienceContext, toggleEntry, withSeatState, type FormAircraft } from './orderForm';

const TZ = 'Europe/Warsaw';
const NOW = Date.parse('2026-10-01T16:55:00Z');
const ANA: FormAircraft = { reg: 'SP-ANA', dualRequired: true };

const member = (id: string, name: string): DirectoryMemberDto => ({ id, code: id.toUpperCase(), name, active: true });
const MEMBERS = [
  member('ako', 'Adam Kowalski'),
  member('akw', 'Anna Kowal'),
  member('bno', 'Barbara Nowak'),
  member('jwr', 'Jakub Wrona'),
  member('mzi', 'Marta Zięba'),
  member('pwi', 'Paweł Wilk'),
];
const GROUPS: GroupDto[] = [{ id: 'g-an2', name: 'Piloci An-2', memberIds: ['ako', 'akw', 'bno', 'pwi'], createdAt: '', updatedAt: '' }];
const CTX = audienceContext('mzi', MEMBERS, GROUPS);

const recipient = (pilotId: string, over: Partial<OrderLeaderRecipientDto> = {}): OrderLeaderRecipientDto => ({
  pilotId,
  seat: 'dual',
  namedSeat: null,
  direct: false,
  viaGroupId: 'g-an2',
  answer: null,
  previousAnswer: null,
  answerReason: null,
  answeredAt: null,
  seen: false,
  seenAt: null,
  lastSeenAt: null,
  editUnseen: false,
  inPlay: true,
  staleReason: null,
  assignedSeat: null,
  removed: false,
  removedAt: null,
  conflict: null,
  threadId: null,
  unread: 0,
  ...over,
});

function card(over: Partial<OrderCardDto> = {}, order: Partial<OrderCardDto['order']> = {}, booking: Partial<OrderCardDto['booking']> = {}): OrderCardDto {
  return {
    timezone: TZ,
    day: { date: '2026-10-03', startsAt: '2026-10-02T22:00:00Z', endsAt: '2026-10-03T22:00:00Z' },
    order: {
      id: 'B',
      status: 'open',
      revision: 1,
      createdBy: 'mzi',
      seats: { pic: 'sought', dual: 'sought' },
      addressing: 'per_seat',
      editedAt: null,
      createdAt: '2026-10-01T16:40:00Z',
      closedAt: null,
      closedBy: null,
      closeReason: null,
      audienceLabel: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2',
      ...order,
    },
    booking: {
      id: 'b-B',
      aircraftId: 'ana',
      status: 'confirmed',
      startsAt: '2026-10-03T07:00:00Z',
      endsAt: '2026-10-03T11:00:00Z',
      operation: 'skoki',
      fromIcao: 'EPKP',
      toIcao: 'EPKP',
      plannedAirMin: 120,
      plannedFuelL: 600,
      note: 'Sobotni dzień skokowy.',
      pilotId: null,
      dualId: null,
      ...booking,
    },
    viewer: { leads: true, recipient: null },
    lastEdit: null,
    lastTermChange: null,
    myConflicts: [],
    recipients: [
      recipient('jwr', { seat: 'pic', direct: true, viaGroupId: null }),
      recipient('ako'),
      recipient('akw'),
      recipient('bno'),
      recipient('pwi', { removed: true, removedAt: '2026-10-01T18:00:00Z' }),
    ],
    history: [],
    ...over,
  };
}

describe('szkic odtworzony z karty', () => {
  it('termin czasem klubu, zadanie i plan jak w formularzu; listy foteli tylko na dopisanych', () => {
    const d = draftOfOrder(card());
    expect(d).toMatchObject({
      aircraftId: 'ana',
      date: '2026-10-03',
      from: '09:00',
      to: '13:00',
      operation: 'skoki',
      fromIcao: 'EPKP',
      plannedAir: '2:00',
      plannedFuel: '600',
      note: 'Sobotni dzień skokowy.',
      seats: { pic: 'sought', dual: 'sought' },
      shared: false,
    });
    expect(d.pic).toEqual({ mode: 'group', person: null, list: { pilotIds: [], groupIds: [] } });
  });

  it('bez zmian nie ma czego zapisać', () => {
    const d = draftOfOrder(card());
    expect(orderPatchOf(d, d, TZ, ANA)).toBeNull();
    expect(editNote(null, card(), CTX)).toBeNull();
  });
});

describe('poprawka niesie samą różnicę', () => {
  it('zmiana terminu - sam termin na drucie, wiersz „było → jest" i zdanie o zmianie', () => {
    const base = draftOfOrder(card());
    const d = { ...base, from: '10:00', to: '14:00' };
    const patch = orderPatchOf(d, base, TZ, ANA);
    expect(patch).toEqual({ startsAt: '2026-10-03T08:00:00.000Z', endsAt: '2026-10-03T12:00:00.000Z' });
    expect(termShift(d, base, TZ)).toEqual({ was: '09:00-13:00', now: '10:00-14:00' });
    expect(editNote(patch, card(), CTX)).toBe('Adresaci zobaczą, co zmieniono');
  });

  it('zmiana dnia - doba dochodzi do wiersza „było → jest"', () => {
    const base = draftOfOrder(card());
    expect(termShift({ ...base, date: '2026-10-04' }, base, TZ)).toEqual({
      was: 'sob 3 PAŹ 09:00-13:00',
      now: 'nd 4 PAŹ 09:00-13:00',
    });
  });

  it('dopisanie - zlecenie trafi WYŁĄCZNIE do nowych; odebranego da się dopisać jawnie', () => {
    const base = draftOfOrder(card());
    const d = toggleEntry(base, 'dual', { kind: 'person', id: 'pwi' }, ANA);
    const patch = orderPatchOf(d, base, TZ, ANA);
    expect(patch).toEqual({ addRecipients: [{ seat: 'dual', list: { pilotIds: ['pwi'], groupIds: [] } }] });
    expect(editNote(patch, card(), CTX)).toBe('Trafi do 1 nowej osoby');
    const both = orderPatchOf({ ...d, note: 'Inny opis' }, base, TZ, ANA);
    expect(editNote(both, card(), CTX)).toBe('Trafi do 1 nowej osoby · pozostali zobaczą, co zmieniono');
  });

  it('opis wyczyszczony jedzie jako null; trasa skoków bez lądowania', () => {
    const base = draftOfOrder(card());
    expect(orderPatchOf({ ...base, note: '  ' }, base, TZ, ANA)).toEqual({ note: null });
    expect(orderPatchOf({ ...base, operation: 'ferry', toIcao: 'EPRJ' }, base, TZ, ANA)).toEqual({ operation: 'ferry', toIcao: 'EPRJ' });
  });
});

describe('wysłani na listach kart - zablokowani', () => {
  it('osoby, które zlecenie mają, i grupa wysłana na tę listę z liczbą osób', () => {
    const sent = sentOf(card(), 'dual');
    expect([...sent.people].sort()).toEqual(['ako', 'akw', 'bno', 'jwr']);
    expect([...sent.groups]).toEqual([['g-an2', 3]]);
    const options = addressOptions({
      draft: draftOfOrder(card()),
      target: 'dual',
      aircraft: ANA,
      members: MEMBERS,
      groups: GROUPS,
      ctx: CTX,
      query: '',
      sent,
    });
    expect(options.groups[0]).toMatchObject({ desc: 'wysłane · 3 osoby', selected: true, disabled: true });
    expect(options.people.find((p) => p.id === 'ako')).toMatchObject({ desc: 'AKO · ma już zlecenie', selected: true, disabled: true });
    // Odebrany nie ma już zlecenia - da się go dopisać.
    expect(options.people.find((p) => p.id === 'pwi')).toMatchObject({ desc: 'PWI', selected: false, disabled: false });
  });

  it('definicja złożona z adresatów: osoba bez grupy imiennie, grupa jako grupa, odebranych nie ma', () => {
    expect(listsOf(card())).toEqual({
      pic: { pilotIds: ['jwr'], groupIds: [] },
      dual: { pilotIds: [], groupIds: ['g-an2'] },
      shared: { pilotIds: [], groupIds: [] },
    });
  });
});

describe('bramka „Zapisz zmiany" i utrata fotela', () => {
  it('fotel, w którym ktoś siedzi, przestawiony na „Ja" - ostrzeżenie przed zapisem', () => {
    const c = card({}, {}, { dualId: 'akw' });
    const d = withSeatState(draftOfOrder(c), 'dual', 'self', ANA);
    expect(seatLossNote(c, d, 'dual', ANA)).toBe('Osoba przydzielona do tego fotela straci przydział - dostanie wiadomość „Przydział cofnięty".');
    expect(seatLossNote(c, draftOfOrder(c), 'dual', ANA)).toBeNull();
  });

  it('fotel, który zaczyna szukać, potrzebuje dopisanych - bez zdania', () => {
    const c = card({ recipients: [recipient('ako')] }, { seats: { pic: 'self', dual: 'sought' } });
    const d = withSeatState(withSeatState(draftOfOrder(c), 'dual', 'self', ANA), 'pic', 'sought', ANA);
    expect(editStep3Blocker(d, c, ANA)).toBe('incomplete');
    expect(editStep3Blocker(toggleEntry(d, 'pic', { kind: 'person', id: 'jwr' }, ANA), c, ANA)).toBeNull();
    expect(editStep3Blocker(draftOfOrder(c), c, ANA)).toBeNull();
  });
});

describe('powiel zlecenie', () => {
  it('ta sama treść i adresaci, puste godziny, doba zostaje, dopóki się nie skończyła', () => {
    const d = duplicateDraft(card(), 'mzi', NOW);
    expect(d).toMatchObject({ aircraftId: 'ana', date: '2026-10-03', from: '', to: '', operation: 'skoki', note: 'Sobotni dzień skokowy.' });
    expect(d.pic).toEqual({ mode: 'person', person: 'jwr', list: { pilotIds: [], groupIds: [] } });
    expect(d.dual).toEqual({ mode: 'group', person: null, list: { pilotIds: [], groupIds: ['g-an2'] } });
    expect(duplicateDraft(card(), 'mzi', Date.parse('2026-10-05T08:00:00Z')).date).toBe('');
  });

  it('„Ja" cudzego zlecenia to nie ja - fotel autora staje się szukanym', () => {
    const c = card({}, { seats: { pic: 'self', dual: 'sought' } });
    expect(duplicateDraft(c, 'pwi', NOW).seats).toEqual({ pic: 'sought', dual: 'sought' });
    expect(duplicateDraft(c, 'mzi', NOW).seats).toEqual({ pic: 'self', dual: 'sought' });
  });

  it('wspólna lista - całość czeka w dopisanych', () => {
    const c = card({ recipients: [recipient('ako', { seat: null }), recipient('jwr', { seat: null, viaGroupId: null })] }, { addressing: 'shared' });
    expect(duplicateDraft(c, 'mzi', NOW)).toMatchObject({ shared: true, sharedExtra: { pilotIds: ['jwr'], groupIds: ['g-an2'] } });
  });
});
