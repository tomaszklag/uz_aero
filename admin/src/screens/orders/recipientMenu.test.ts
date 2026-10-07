/**
 * Menu ⋯ przy adresacie (ZL3b) - zestaw zlecenia B z makiety: dowódca imiennie Jakub Wrona,
 * drugi pilot z grupy „Piloci An-2" (Anna, Barbara, Adam, Ewa, Piotr), zleca Marta Zięba.
 */

import { describe, expect, it } from 'vitest';

import type { DirectoryMemberDto, OrderCardDto, OrderLeaderRecipientDto } from '../../api/dto';
import type { CrewSeatVm, LeaderRowVm } from './leaderCard';
import { confirmCopy, crewMenu, rowMenu, swapHint, swapOptions } from './recipientMenu';

const member = (id: string, name: string, code: string, active = true): DirectoryMemberDto => ({ id, name, code, active });

const MEMBERS: DirectoryMemberDto[] = [
  member('mzi', 'Marta Zięba', 'MZI'),
  member('jwr', 'Jakub Wrona', 'JWR'),
  member('akw', 'Anna Kowal', 'AKW'),
  member('bno', 'Barbara Nowak', 'BNO'),
  member('ako', 'Adam Kowalski', 'AKO'),
  member('eso', 'Ewa Sowa', 'ESO'),
  member('pli', 'Piotr Lis', 'PLI'),
  member('pwi', 'Paweł Wilk', 'PWI'),
  member('kkr', 'Karol Kruk', 'KKR', false),
];

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

const cardWith = (recipients: OrderLeaderRecipientDto[], crew: { pilotId?: string | null; dualId?: string | null } = {}): OrderCardDto =>
  ({
    order: { createdBy: 'mzi' },
    booking: { pilotId: crew.pilotId ?? null, dualId: crew.dualId ?? null },
    recipients,
  }) as unknown as OrderCardDto;

const B = cardWith([
  recipient('jwr', { seat: 'pic', direct: true, viaGroupId: null }),
  recipient('akw'),
  recipient('bno'),
  recipient('ako'),
  recipient('eso'),
  recipient('pli'),
]);

const row = (over: Partial<LeaderRowVm>): LeaderRowVm => ({
  pilotId: 'jwr',
  name: 'Jakub Wrona',
  code: 'JWR',
  status: [],
  warn: [],
  also: null,
  reason: null,
  picks: [],
  menu: { swapSeat: 'pic' },
  muted: false,
  thread: 'write',
  unread: false,
  ...over,
});

describe('pozycje menu - tylko to, co dla wiersza możliwe', () => {
  it('fotel imienny: „Zamień osobę" i „Odbierz zlecenie", najcięższa niżej', () => {
    expect(rowMenu(row({})).map((e) => [e.label, e.danger, e.action])).toEqual([
      ['Zamień osobę', false, { kind: 'swap', pilotId: 'jwr', seat: 'pic' }],
      ['Odbierz zlecenie', true, { kind: 'remove', pilotId: 'jwr' }],
    ]);
  });

  it('grupa i wspólna lista: samo „Odbierz zlecenie" - nie ma jednej osoby do podmiany', () => {
    expect(rowMenu(row({ pilotId: 'eso', menu: { swapSeat: null } })).map((e) => e.label)).toEqual(['Odbierz zlecenie']);
  });

  it('zlecenie zamknięte i wiersz zwinięty - bez „⋯"', () => {
    expect(rowMenu(row({ menu: null }))).toEqual([]);
  });

  it('osoba w fotelu: samo „Cofnij przydział"; fotel szukany i „ja" bez menu', () => {
    const seated: CrewSeatVm = { seat: 'dual', label: 'Drugi pilot', pilotId: 'akw', asking: false, name: 'Anna Kowal', code: 'AKW', status: [], unassignable: true, thread: 'write', unread: false };
    expect(crewMenu(seated).map((e) => [e.label, e.action])).toEqual([['Cofnij przydział', { kind: 'unassign', pilotId: 'akw', seat: 'dual' }]]);
    expect(crewMenu({ ...seated, pilotId: null, name: null, unassignable: false })).toEqual([]);
    expect(crewMenu({ ...seated, unassignable: false })).toEqual([]);
  });
});

describe('pytanie w miejscu wiersza - słowa z makiety', () => {
  it('odebranie zlecenia', () => {
    expect(confirmCopy({ kind: 'remove', pilotId: 'eso' }, 'Ewa Sowa')).toEqual({
      question: 'Odebrać zlecenie: Ewa Sowa?',
      hint: 'Dostanie wiadomość „Zlecenie nieaktualne". Rozmowa zostanie do odczytu.',
      placeholder: 'Np. fotel obsadzamy z innej grupy',
      confirm: 'Odbierz zlecenie',
    });
  });

  it('cofnięcie przydziału nazywa fotel, który wraca do szukania', () => {
    const copy = confirmCopy({ kind: 'unassign', pilotId: 'akw', seat: 'dual' }, 'Anna Kowal');
    expect([copy.question, copy.hint, copy.confirm]).toEqual([
      'Cofnąć przydział: Anna Kowal?',
      'Fotel drugiego pilota wróci do szukania, a Anna Kowal dostanie wiadomość „Przydział cofnięty". Zgłoszenia pozostałych osób dalej się liczą.',
      'Cofnij przydział',
    ]);
  });
});

describe('„Zamień na" - reguła telefonu', () => {
  it('bez zlecającej, wychodzącego i nieaktywnych; osoby z listy drugiego fotela z dopiskiem', () => {
    const options = swapOptions({ card: B, seat: 'pic', outgoing: 'jwr', members: MEMBERS });
    expect(options.map((o) => [o.label, o.bothSeats])).toEqual([
      ['Adam Kowalski · AKO · na liście drugiego pilota', true],
      ['Anna Kowal · AKW · na liście drugiego pilota', true],
      ['Barbara Nowak · BNO · na liście drugiego pilota', true],
      ['Ewa Sowa · ESO · na liście drugiego pilota', true],
      ['Paweł Wilk · PWI', false],
      ['Piotr Lis · PLI · na liście drugiego pilota', true],
    ]);
  });

  it('osoba już w fotelu albo z terminem do potwierdzenia nie jest kandydatem tego fotela', () => {
    const c = cardWith([recipient('jwr', { seat: 'pic', direct: true, viaGroupId: null }), recipient('ako', { seat: null, namedSeat: 'dual' })], { dualId: 'akw' });
    const ids = swapOptions({ card: c, seat: 'pic', outgoing: 'jwr', members: MEMBERS }).map((o) => o.value);
    expect(ids).not.toContain('akw');
    expect(ids).not.toContain('ako');
  });

  it('wskazany imiennie na drugi fotel - opcja mówi „imiennie"', () => {
    const c = cardWith([recipient('jwr', { seat: 'pic', direct: true, viaGroupId: null }), recipient('eso', { seat: 'dual', direct: true, viaGroupId: null })]);
    const eso = swapOptions({ card: c, seat: 'pic', outgoing: 'jwr', members: MEMBERS }).find((o) => o.value === 'eso');
    expect(eso?.label).toBe('Ewa Sowa · ESO · imiennie na drugiego pilota');
  });

  it('odebrany wcześniej wraca jako zwykły kandydat - dopisanie imienne przywraca mu zlecenie', () => {
    const c = cardWith([recipient('jwr', { seat: 'pic', direct: true, viaGroupId: null }), recipient('pli', { removed: true })]);
    const pli = swapOptions({ card: c, seat: 'pic', outgoing: 'jwr', members: MEMBERS }).find((o) => o.value === 'pli');
    expect(pli).toEqual({ value: 'pli', label: 'Piotr Lis · PLI', bothSeats: false });
  });
});

describe('zdanie pod polami zamiany', () => {
  it('bez wyboru mówi o stronie wychodzącej', () => {
    expect(swapHint('Jakub Wrona', null, 'pic')).toBe('Jakub Wrona dostanie wiadomość „Zlecenie nieaktualne".');
  });

  it('z wyborem - co dostanie każda ze stron (makieta)', () => {
    expect(swapHint('Jakub Wrona', { name: 'Paweł Wilk', bothSeats: false }, 'pic')).toBe(
      'Jakub Wrona dostanie wiadomość „Zlecenie nieaktualne", a Paweł Wilk - to zlecenie z propozycją fotela dowódcy.',
    );
  });

  it('osoba z listy drugiego fotela zostaje przy obu z terminem do potwierdzenia (pkt 37, 39)', () => {
    expect(swapHint('Jakub Wrona', { name: 'Anna Kowal', bothSeats: true }, 'pic')).toBe(
      'Jakub Wrona dostanie wiadomość „Zlecenie nieaktualne". Anna Kowal ma już to zlecenie - zostanie przy obu fotelach z terminem do potwierdzenia.',
    );
  });
});
