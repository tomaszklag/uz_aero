/**
 * Szuflada zajętości ze zleceniem (K2c) - zlecenie B z makiet: skoki SP-ANA w sobotę
 * 3 października 09:00-13:00, Marta Zięba (MZI) zleca; dowódca imiennie Jakub Wrona, drugi
 * pilot z grupy „Piloci An-2". Patrzymy w piątek 2 października wieczorem.
 */

import { describe, expect, it } from 'vitest';

import type { BookingDto, OrderCardDto, OrderLeaderRecipientDto } from '../../api/dto';
import { leaderCard } from '../orders/leaderCard';
import { recipientPill } from '../orders/recipientCard';
import type { Person } from './bookingLabels';
import { leaderPill, leaderRows, orderBookingRole, orderPeriodOf, resignNote, seatedRows, seekingWho } from './orderBooking';

const NOW = Date.parse('2026-10-02T19:45:00Z');
const PEOPLE: Record<string, Person> = {
  mzi: { name: 'Marta Zięba', code: 'MZI' },
  jwr: { name: 'Jakub Wrona', code: 'JWR' },
  akw: { name: 'Anna Kowal', code: 'AKW' },
  bno: { name: 'Barbara Nowak', code: 'BNO' },
  ako: { name: 'Adam Kowalski', code: 'AKO' },
};
const person = (id: string): Person | null => PEOPLE[id] ?? null;

const booking = (over: Partial<BookingDto> = {}): BookingDto =>
  ({
    id: 'b-B',
    aircraftId: 'ana',
    kind: 'flight',
    status: 'confirmed',
    startsAt: '2026-10-03T07:00:00Z',
    endsAt: '2026-10-03T11:00:00Z',
    pilotId: null,
    dualId: null,
    blockReason: null,
    order: { seeking: ['pic', 'dual'], id: 'B', createdBy: 'mzi' },
    ...over,
  }) as BookingDto;

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

function card(order: Partial<OrderCardDto['order']> = {}, b: Partial<OrderCardDto['booking']> = {}, over: Partial<OrderCardDto> = {}): OrderCardDto {
  return {
    timezone: 'Europe/Warsaw',
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
      plannedAirMin: 180,
      plannedFuelL: 600,
      note: null,
      pilotId: null,
      dualId: null,
      ...b,
    },
    viewer: { leads: true, recipient: null },
    lastEdit: null,
    lastTermChange: null,
    myConflicts: [],
    recipients: [
      recipient('jwr', { seat: 'pic', namedSeat: 'pic', direct: true, viaGroupId: null, seen: true, seenAt: '2026-10-02T06:15:00Z' }),
      recipient('ako'),
      recipient('bno', { answer: 'yes', answeredAt: '2026-10-02T19:30:00Z', seen: true }),
      recipient('akw', { answer: 'yes', answeredAt: '2026-10-01T17:10:00Z', seen: true }),
    ],
    history: [],
    ...over,
  };
}

const vmOf = (c: OrderCardDto, viewerId = 'pwi') =>
  leaderCard({ card: c, now: NOW, viewerId, person, aircraft: () => ({ reg: 'SP-ANA', type: 'AN-2' }) })!;

describe('kim jest patrzący', () => {
  it('autor prowadzi - także siedząc w swoim fotelu „ja"', () => {
    expect(orderBookingRole(booking(), 'mzi', false)).toBe('leader');
    expect(orderBookingRole(booking({ pilotId: 'mzi', order: { seeking: ['dual'], id: 'B', createdBy: 'mzi' } }), 'mzi', false)).toBe('leader');
  });

  it('osoba w fotelu patrzy na swój lot - także drugi pilot i także z „Cudzymi rezerwacjami"', () => {
    const b = booking({ pilotId: 'jwr', order: { seeking: ['dual'], id: 'B', createdBy: 'mzi' } });
    expect(orderBookingRole(b, 'jwr', true)).toBe('seated');
    expect(orderBookingRole(booking({ dualId: 'akw', order: { seeking: ['pic'], id: 'B', createdBy: 'mzi' } }), 'akw', false)).toBe('seated');
  });

  it('„Cudze rezerwacje" prowadzą każde zlecenie - adresat dostaje drzwi do karty', () => {
    expect(orderBookingRole(booking(), 'pwi', true)).toBe('leader');
    expect(orderBookingRole(booking(), 'ako', false)).toBe('recipient');
  });

  it('członek spoza adresatów nie dostaje identyfikatora zlecenia - i nic więcej', () => {
    expect(orderBookingRole(booking({ order: { seeking: ['pic', 'dual'] } }), 'pwi', false)).toBe('outsider');
  });

  it('zlecenie obsadzone w komplecie jest dla adresata i dla obcego zwykłą zajętością', () => {
    const filled = { pilotId: 'jwr', dualId: 'akw' };
    expect(orderBookingRole(booking({ ...filled, order: { seeking: [] } }), 'pwi', false)).toBeNull();
    expect(orderBookingRole(booking({ ...filled, order: { seeking: [], id: 'B', createdBy: 'mzi' } }), 'ako', false)).toBeNull();
    // Prowadzący prowadzi dalej - jego „odwołaj" jest odwołaniem zlecenia.
    expect(orderBookingRole(booking({ ...filled, order: { seeking: [], id: 'B', createdBy: 'mzi' } }), 'mzi', false)).toBe('leader');
  });

  it('zwykła rezerwacja i wyłączenie z użytku nie są zleceniem', () => {
    expect(orderBookingRole(booking({ order: null }), 'mzi', true)).toBeNull();
    expect(orderBookingRole(booking({ kind: 'block' }), 'mzi', true)).toBeNull();
  });
});

describe('kogo szuka', () => {
  it('dopełniaczem, oba fotele razem', () => {
    expect(seekingWho(['pic', 'dual'])).toBe('dowódcy i drugiego pilota');
    expect(seekingWho(['dual'])).toBe('drugiego pilota');
    expect(seekingWho([])).toBeNull();
  });

  it('obsadzony fotel stoi nazwiskiem - pusty nie dostaje kreski', () => {
    expect(seatedRows(booking({ pilotId: 'jwr', order: { seeking: ['dual'] } }), person)).toEqual([
      { label: 'Dowódca', value: 'Jakub Wrona', sub: 'JWR' },
    ]);
    expect(seatedRows(booking(), person)).toEqual([]);
  });
});

describe('skrót prowadzącego', () => {
  it('treść, fotel po fotelu bez nazwisk adresatów, na końcu kto zleca', () => {
    const c = card();
    expect(leaderRows(vmOf(c), c, person, 'pwi')).toEqual([
      { label: 'Zadanie', value: 'Skoki', sub: null },
      { label: 'Lotnisko', value: 'EPKP', sub: null },
      { label: 'Plan lotu', value: '3:00 · paliwo 600 L', sub: null },
      { label: 'Dowódca', value: 'szukany', sub: 'imiennie · bez odpowiedzi' },
      { label: 'Drugi pilot', value: 'szukany', sub: 'Piloci An-2 · 2 mogą lecieć' },
      { label: 'Zleca', value: 'Marta Zięba', sub: 'MZI · wysłane wczoraj 18:40' },
    ]);
  });

  it('obsadzony fotel mówi kto; fotel „ja" dopowiada, że to osoba zlecająca', () => {
    const c = card({ seats: { pic: 'self', dual: 'sought' } }, { pilotId: 'mzi' });
    const rows = leaderRows(vmOf(c, 'mzi'), c, person, 'mzi');
    expect(rows.find((r) => r.label === 'Dowódca')).toEqual({ label: 'Dowódca', value: 'Ty', sub: 'osoba zlecająca' });
    const other = leaderRows(vmOf(c), c, person, 'pwi');
    expect(other.find((r) => r.label === 'Dowódca')).toEqual({ label: 'Dowódca', value: 'Marta Zięba', sub: 'MZI · osoba zlecająca' });
  });

  it('wszystkie odmowy i wspólna lista mówią to słowami', () => {
    const c = card(
      { addressing: 'shared', audienceLabel: 'wspólna lista: Piloci An-2' },
      {},
      { recipients: [recipient('ako', { seat: null, answer: 'no' }), recipient('bno', { seat: null, answer: 'no' })] },
    );
    const rows = leaderRows(vmOf(c), c, person, 'pwi');
    expect(rows.filter((r) => r.value === 'szukany').map((r) => r.sub)).toEqual([
      'wspólna lista · Piloci An-2 · wszyscy odmówili',
      'wspólna lista · Piloci An-2 · wszyscy odmówili',
    ]);
  });

  it('plakietka w podtytule: kogo brakuje albo komplet; zamknięty termin jej nie ma', () => {
    expect(leaderPill(booking())).toEqual({ text: 'Szuka załogi', tone: 'blue' });
    expect(leaderPill(booking({ order: { seeking: ['dual'], id: 'B', createdBy: 'mzi' } }))).toEqual({ text: 'Szuka drugiego pilota', tone: 'blue' });
    expect(leaderPill(booking({ order: { seeking: [], id: 'B', createdBy: 'mzi' } }))).toEqual({ text: 'Komplet załogi', tone: 'green' });
    expect(leaderPill(booking({ status: 'cancelled' }))).toBeNull();
  });

  it('fotel „brak" nie ma wiersza', () => {
    const c = card({ seats: { pic: 'sought', dual: 'none' } });
    expect(leaderRows(vmOf(c), c, person, 'pwi').map((r) => r.label)).not.toContain('Drugi pilot');
  });
});

describe('adresat, okres i rezygnacja', () => {
  it('plakietka adresata mówi „Twoją" - szuflada jest o rezerwacji, nie o moim zleceniu', () => {
    const me = card({}, {}, { viewer: { leads: false, recipient: { ...recipient('ako'), previousAnswerAt: null, previousAnswerReason: null, removeReason: null, lastUnreadAt: null } } });
    expect(recipientPill(me, 'Czeka na Twoją odpowiedź')).toEqual({ text: 'Czeka na Twoją odpowiedź', tone: 'blue' });
    expect(recipientPill(card())).toBeNull();
  });

  it('„Otwórz zlecenie" ląduje nad połową, w której zlecenie stoi', () => {
    expect(orderPeriodOf(booking(), NOW)).toBe('upcoming');
    expect(orderPeriodOf(booking(), Date.parse('2026-10-03T11:00:00Z'))).toBe('past');
  });

  it('rezygnacja mówi, kto dostanie wiadomość i co z terminem', () => {
    expect(resignNote(booking({ pilotId: 'jwr' }), person)).toBe(
      'Fotel znów będzie do obsadzenia, a Marta Zięba dostanie wiadomość. Termin zostaje zajęty.',
    );
  });
});
