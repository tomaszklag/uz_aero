/**
 * Szuflada prowadzącego - zestaw z makiety `zlecenia-szczegoly`: zlecenie B (skoki SP-ANA,
 * sobota 3 października 09:00-13:00), dowódca imiennie Jakub Wrona, drugi pilot z grupy
 * „Piloci An-2". Marta Zięba patrzy w piątek 2 października o 21:45 czasu klubu.
 */

import { describe, expect, it } from 'vitest';

import type { OrderCardDto, OrderLeaderRecipientDto } from '../../api/dto';
import type { Person } from '../calendar/bookingLabels';
import { leaderCard, type LeaderCardInput } from './leaderCard';

const NOW = Date.parse('2026-10-02T19:45:00Z');

const PEOPLE: Record<string, Person> = {
  mzi: { name: 'Marta Zięba', code: 'MZI' },
  jwr: { name: 'Jakub Wrona', code: 'JWR' },
  akw: { name: 'Anna Kowal', code: 'AKW' },
  bno: { name: 'Barbara Nowak', code: 'BNO' },
  eso: { name: 'Ewa Sowa', code: 'ESO' },
  ako: { name: 'Adam Kowalski', code: 'AKO' },
  pli: { name: 'Piotr Lis', code: 'PLI' },
  pwi: { name: 'Paweł Wilk', code: 'PWI' },
};

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
    timezone: 'Europe/Warsaw',
    day: { date: '2026-10-03', startsAt: '2026-10-02T22:00:00Z', endsAt: '2026-10-03T22:00:00Z' },
    order: {
      id: 'B',
      status: 'open',
      revision: 1,
      createdBy: 'mzi',
      seats: { pic: 'sought', dual: 'sought' },
      addressing: 'per_seat',
      editedAt: '2026-10-02T05:10:00Z',
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
      recipient('jwr', { seat: 'pic', namedSeat: 'pic', direct: true, viaGroupId: null, seen: true, seenAt: '2026-10-02T06:15:00Z' }),
      recipient('pli', { answer: 'no', answerReason: 'W sobotę mam egzamin w Mielcu.', answeredAt: '2026-10-01T17:48:00Z', seen: true }),
      recipient('ako'),
      recipient('eso', { seen: true, seenAt: '2026-10-01T18:05:00Z', editUnseen: true }),
      recipient('bno', { answer: 'yes', answeredAt: '2026-10-02T19:30:00Z', seen: true }),
      recipient('akw', { answer: 'yes', answeredAt: '2026-10-01T17:10:00Z', seen: true, unread: 1 }),
    ],
    history: [
      { id: 'h1', actorId: 'mzi', kind: 'created', payload: { audience: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2' }, at: '2026-10-01T16:40:00Z' },
      { id: 'h2', actorId: 'mzi', kind: 'resent', payload: { added: [], reminded: ['a', 'b', 'c', 'd'] }, at: '2026-10-01T19:05:00Z' },
      { id: 'h3', actorId: 'pwi', kind: 'edited', payload: { changes: { plannedAirMin: { from: 120, to: 180 } } }, at: '2026-10-02T05:10:00Z' },
    ],
    ...over,
  };
}

const input = (c: OrderCardDto, viewerId = 'mzi'): LeaderCardInput => ({
  card: c,
  now: NOW,
  viewerId,
  person: (id) => PEOPLE[id] ?? null,
  aircraft: (id) => (id === 'ana' ? { reg: 'SP-ANA', type: 'AN-2' } : id === 'axa' ? { reg: 'SP-AXA', type: 'C172' } : null),
});

describe('nagłówek szuflady', () => {
  it('maszyna i dzień w tytule; stan, godziny czasu klubu, długość i „jutro"', () => {
    const vm = leaderCard(input(card()))!;
    expect(vm.title).toBe('SP-ANA · sobota 3 października');
    expect(vm.pill).toEqual({ text: 'Szuka załogi', tone: 'blue' });
    expect(vm.sub).toBe('09:00 → 13:00 czasu klubu · 4 h · jutro');
    expect(vm.closed).toBe(false);
  });

  it('zlecenie odwołane mówi, czym było, zamiast ile trwa', () => {
    const vm = leaderCard(input(card({}, { status: 'cancelled', closeReason: 'Serwis.' })))!;
    expect(vm.pill).toEqual({ text: 'Odwołane', tone: 'dim' });
    expect(vm.sub).toBe('09:00 → 13:00 czasu klubu · skoki EPKP');
    expect(vm.closed).toBe(true);
    expect(vm.cancellable).toBe(false);
    expect(vm.resend).toBeNull();
  });
});

describe('fotele - karta na szukany fotel', () => {
  const vm = leaderCard(input(card()))!;

  it('dowódca imiennie: jedna osoba, odczytane bez odpowiedzi; drugi pilot nazwą grupy', () => {
    expect(vm.blocks.map((b) => b.title)).toEqual(['Dowódca · imiennie', 'Drugi pilot · Piloci An-2']);
    expect(vm.blocks[0]!.rows).toHaveLength(1);
    expect(vm.blocks[0]!.rows[0]).toMatchObject({
      name: 'Jakub Wrona',
      code: 'JWR',
      status: [{ text: 'Odczytane 08:15 · bez odpowiedzi' }],
      picks: [],
    });
  });

  it('kolejność: mogą (wg zgłoszenia) → odczytane → nieodczytane → odmowy', () => {
    expect(vm.blocks[1]!.rows.map((r) => r.pilotId)).toEqual(['akw', 'bno', 'eso', 'ako', 'pli']);
  });

  it('„Może lecieć" z godziną i „Wybierz"; licznik „2 mogą lecieć" w tytule karty', () => {
    expect(vm.blocks[1]!.count).toBe('2 mogą lecieć');
    expect(vm.blocks[1]!.rows[0]).toMatchObject({
      status: [{ text: 'Może lecieć · wczoraj 19:10', tone: 'ok' }],
      picks: [{ seat: 'dual', label: 'Wybierz' }],
    });
    expect(vm.blocks[1]!.rows[1]!.status).toEqual([{ text: 'Może lecieć · 21:30', tone: 'ok' }]);
  });

  it('zmiana nieodczytana i nieodczytane; odmowa z powodem jako cytatem', () => {
    const [, , eso, ako, pli] = vm.blocks[1]!.rows;
    expect(eso).toMatchObject({ status: [{ text: 'Odczytane wczoraj 20:05' }], warn: ['zmiana z 07:10 nieodczytana'] });
    expect(ako!.status).toEqual([{ text: 'Nieodczytane', tone: 'unread' }]);
    expect(pli).toMatchObject({ status: [{ text: 'Nie może · wczoraj 19:48', tone: 'no' }], reason: '„W sobotę mam egzamin w Mielcu."' });
  });

  it('kolizja z inną rezerwacją tej osoby - bursztyn, nie blokada', () => {
    const c = card({
      recipients: [
        recipient('ako', {
          answer: 'yes',
          answeredAt: '2026-10-02T19:52:00Z',
          conflict: { bookingId: 'b-A', aircraftId: 'axa', startsAt: '2026-10-03T08:00:00Z', endsAt: '2026-10-03T10:00:00Z' },
        }),
      ],
    });
    const row = leaderCard(input(c))!.blocks[1]!.rows[0]!;
    expect(row.warn).toEqual(['w tym czasie ma rezerwację SP-AXA 10:00-12:00']);
    expect(row.picks).toEqual([{ seat: 'dual', label: 'Wybierz' }]);
  });

  it('menu ⋯: zamiana tylko przy fotelu imiennym, przy grupie samo odebranie', () => {
    expect(vm.blocks[0]!.rows[0]!.menu).toEqual({ swapSeat: 'pic' });
    expect(vm.blocks[1]!.rows.map((r) => r.menu)).toEqual(Array(5).fill({ swapSeat: null }));
  });

  it('stopka: przypomnienie dostaną osoby bez odpowiedzi (Jakub, Adam, Ewa)', () => {
    expect(vm.resend).toEqual({ note: 'Przypomnienie dostaną 3 osoby bez odpowiedzi' });
  });
});

describe('osoba przy obu fotelach (pkt 38)', () => {
  it('stoi w karcie każdego wolnego fotela z „Wybierz" i dopiskiem „także na …"', () => {
    const c = card({
      recipients: [recipient('ako', { seat: null, namedSeat: 'pic', viaGroupId: null, answer: 'yes', answeredAt: '2026-10-02T19:52:00Z', seen: true })],
    });
    const vm = leaderCard(input(c))!;
    expect(vm.blocks[0]!.rows[0]).toMatchObject({ also: 'także na drugiego pilota', picks: [{ seat: 'pic', label: 'Wybierz' }] });
    expect(vm.blocks[1]!.rows[0]).toMatchObject({ also: 'także na dowódcę', picks: [{ seat: 'dual', label: 'Wybierz' }] });
    // Fotel dalej zaadresowano imiennie (makieta ZL3, ramka „osoba przy obu fotelach"),
    // tylko „tak" tej osoby jest zgłoszeniem, więc karta liczy, ile osób może.
    expect(vm.blocks[0]).toMatchObject({ title: 'Dowódca · imiennie', count: '1 może lecieć' });
    // Zamienić tę osobę da się przy fotelu, na który wskazano ją imiennie - nie przy grupie.
    expect(vm.blocks.map((b) => b.rows[0]!.menu)).toEqual([{ swapSeat: 'pic' }, { swapSeat: null }]);
  });

  it('po odmowie dopisku nie ma - odmowa stoi przy obu fotelach, ale na żaden z nich ta osoba już nie trafi', () => {
    const c = card({
      recipients: [recipient('ako', { seat: null, namedSeat: 'pic', viaGroupId: null, answer: 'no', answeredAt: '2026-10-02T19:52:00Z', seen: true })],
    });
    const rows = leaderCard(input(c))!.blocks.flatMap((b) => b.rows);
    expect(rows.map((r) => [r.pilotId, r.also])).toEqual([
      ['ako', null],
      ['ako', null],
    ]);
  });
});

describe('komplet załogi', () => {
  const c = card(
    {
      history: [
        { id: 'h1', actorId: 'mzi', kind: 'created', payload: {}, at: '2026-10-01T16:40:00Z' },
        { id: 'h2', actorId: 'jwr', kind: 'assigned', payload: { seat: 'pic', pilotId: 'jwr', via: 'answer' }, at: '2026-10-02T20:05:00Z' },
        { id: 'h3', actorId: 'mzi', kind: 'assigned', payload: { seat: 'dual', pilotId: 'akw', via: 'leader' }, at: '2026-10-02T20:12:00Z' },
      ],
    },
    { status: 'filled' },
    { pilotId: 'jwr', dualId: 'akw' },
  );
  const vm = leaderCard(input(c, 'mzi'))!;

  it('karta „Załoga": przyjęte i przydział z godziną; bez kart foteli', () => {
    expect(vm.pill).toEqual({ text: 'Komplet załogi', tone: 'green' });
    expect(vm.blocks).toEqual([]);
    expect(vm.crew).toEqual([
      { seat: 'pic', label: 'Dowódca', pilotId: 'jwr', name: 'Jakub Wrona', code: 'JWR', status: [{ text: 'Leci · przyjęte 22:05', tone: 'ok' }], asking: false, unassignable: true, thread: 'write', unread: false },
      { seat: 'dual', label: 'Drugi pilot', pilotId: 'akw', name: 'Anna Kowal', code: 'AKW', status: [{ text: 'Leci · przydział 22:12', tone: 'ok' }], asking: false, unassignable: true, thread: 'write', unread: true },
    ]);
  });

  it('po odwołaniu karta jest zapisem: bez „Leci", bez zieleni, bez cofania przydziału', () => {
    const cancelled = { ...c, order: { ...c.order, status: 'cancelled' as const }, booking: { ...c.booking, dualId: null } };
    const crew = leaderCard(input(cancelled, 'mzi'))!.crew!;
    expect(crew[0]).toMatchObject({ status: [{ text: 'Przyjęte 22:05' }], unassignable: false });
    const closed = leaderCard(input(cancelled, 'mzi'))!;
    const rows = [...closed.blocks.flatMap((b) => b.rows), ...(closed.others?.rows ?? [])];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.menu == null)).toBe(true);
    // Fotel, którego nikt nie zajął, przestaje być pytaniem ekranu.
    expect(crew[1]).toMatchObject({ pilotId: null, status: [], asking: false });
  });

  it('pozostali adresaci zwinięci, o stopień ciszej i bez „Wybierz"', () => {
    expect(vm.others?.label).toBe('Pozostali adresaci · 4 · zlecenie nieaktualne');
    expect(vm.others?.rows.every((r) => r.muted && r.picks.length === 0 && r.warn.length === 0 && r.menu == null)).toBe(true);
    expect(vm.resend).toBeNull();
    expect(vm.cancellable).toBe(true);
  });
});

describe('rozmowa z adresatem (ZL4)', () => {
  const rows = (vm: ReturnType<typeof leaderCard>) => [...(vm?.blocks.flatMap((b) => b.rows) ?? []), ...(vm?.others?.rows ?? [])];

  it('autor pisze z każdym adresatem - także zanim ktokolwiek napisał; kropka przy nieprzeczytanej', () => {
    const vm = leaderCard(input(card()))!;
    expect(rows(vm).every((r) => r.thread === 'write')).toBe(true);
    expect(rows(vm).filter((r) => r.unread).map((r) => r.pilotId)).toEqual(['akw']);
  });

  it('prowadzący inny niż autor czyta wyłącznie rozmowy, które powstały', () => {
    const c = card({
      recipients: [recipient('jwr', { threadId: 't-jwr' }), recipient('ako')],
    });
    const vm = leaderCard(input(c, 'pwi'))!;
    expect(rows(vm).map((r) => [r.pilotId, r.thread])).toEqual([
      ['jwr', 'read'],
      ['ako', null],
    ]);
  });

  it('rozmowa z wiadomościami zostaje też przy zwiniętych adresatach - do odczytu dla autora', () => {
    const vm = leaderCard(input(card({}, {}, { pilotId: 'jwr', dualId: 'akw' })))!;
    expect(vm.others?.rows.every((r) => r.thread === 'write')).toBe(true);
  });
});

describe('wspólna lista', () => {
  it('karta listy z nazwą grupy, „Na drugiego pilota" tylko dla fotela, który szuka', () => {
    const c = card(
      { recipients: [recipient('akw', { seat: null, answer: 'yes', answeredAt: '2026-10-01T17:10:00Z', seen: true })] },
      { addressing: 'shared', audienceLabel: 'wspólna lista: Piloci An-2' },
      { pilotId: 'bno' },
    );
    const vm = leaderCard(input(c))!;
    expect(vm.crew?.map((s) => [s.label, s.name, s.status[0]?.text])).toEqual([
      ['Dowódca', 'Barbara Nowak', 'Leci'],
      ['Drugi pilot', null, 'przydziel z listy niżej'],
    ]);
    expect(vm.blocks[0]).toMatchObject({ title: 'Wspólna lista · Piloci An-2', count: '1 może lecieć' });
    expect(vm.blocks[0]!.rows[0]!.picks).toEqual([{ seat: 'dual', label: 'Na drugiego pilota' }]);
  });
});

describe('karta „Zlecenie" i historia', () => {
  const vm = leaderCard(input(card()))!;

  it('zadanie, lotnisko (sam kod), plan, opis i kto zleca', () => {
    expect(vm.details).toEqual([
      { label: 'Zadanie', value: 'Skoki', sub: null },
      { label: 'Lotnisko', value: 'EPKP', sub: null },
      { label: 'Plan lotu', value: '3:00 · paliwo 600 L', sub: null },
      { label: 'Opis', value: 'Sobotni dzień skokowy.', sub: null },
      { label: 'Zleca', value: 'Ty', sub: 'wysłane wczoraj 18:40' },
    ]);
  });

  it('cudze zlecenie: zleca nazwisko z kodem', () => {
    const other = leaderCard(input(card({}, { createdBy: 'pwi' })))!;
    expect(other.details.at(-1)).toEqual({ label: 'Zleca', value: 'Paweł Wilk', sub: 'PWI · wysłane wczoraj 18:40' });
  });

  it('historia od najnowszej, z nazwiskami; utworzenie jest kotwicą', () => {
    expect(vm.history.map((h) => [h.when, h.verdict, h.changes, h.who, h.origin])).toEqual([
      ['dziś · 07:10', null, [{ field: 'plan lotu', from: '2:00', to: '3:00' }], 'Paweł Wilk', false],
      ['wczoraj · 21:05', 'Wysłano ponownie · przypomnienie dla 4 osób', [], 'Ty', false],
      ['wczoraj · 18:40', 'Utworzone · dowódca: Jakub Wrona · drugi pilot: Piloci An-2', [], 'Ty', true],
    ]);
  });
});
