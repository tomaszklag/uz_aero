/**
 * Formularz zlecenia - zestaw z makiety `zlecenia-nowe` (ZL2, ZL2b, ZL2c): Marta Zięba
 * (MZI) zleca skoki SP-ANA (wymaga załogi dwuosobowej), sobota 3 października 09:00-13:00
 * czasu klubu; dowódca imiennie Jakub Wrona, drugi pilot z grupy „Piloci An-2".
 * Marta należy do grupy „Instruktorzy" - jako zlecająca nie jest adresatem nawet przez nią.
 */

import { describe, expect, it } from 'vitest';

import type { DirectoryMemberDto, GroupDto } from '../../api/dto';
import {
  addressOptions,
  audienceContext,
  audienceNote,
  emptyOrderForm,
  orderAudienceOf,
  orderCreateBody,
  orderFormDirty,
  orderStep2Blocker,
  orderStep3Blocker,
  peopleOf,
  personChoices,
  seatHint,
  seatsOf,
  seatStates,
  sharedHint,
  toggleEntry,
  withMode,
  withPerson,
  withSeatState,
  withShared,
  type FormAircraft,
  type OrderFormDraft,
} from './orderForm';

const TZ = 'Europe/Warsaw';
const ANA: FormAircraft = { reg: 'SP-ANA', dualRequired: true };
const BKL: FormAircraft = { reg: 'SP-BKL', dualRequired: false };

const member = (id: string, name: string, active = true): DirectoryMemberDto => ({ id, code: id.toUpperCase(), name, active });
const MEMBERS: DirectoryMemberDto[] = [
  member('ako', 'Adam Kowalski'),
  member('akw', 'Anna Kowal'),
  member('bno', 'Barbara Nowak'),
  member('eso', 'Ewa Sowa'),
  member('jwr', 'Jakub Wrona'),
  member('mzi', 'Marta Zięba'),
  member('pli', 'Piotr Lis'),
  member('pwi', 'Paweł Wilk'),
  member('old', 'Olgierd Dawny', false),
];
const group = (id: string, name: string, memberIds: string[]): GroupDto => ({ id, name, memberIds, createdAt: '', updatedAt: '' });
const GROUPS: GroupDto[] = [
  group('g-an2', 'Piloci An-2', ['ako', 'akw', 'bno', 'eso', 'pli', 'old']),
  group('g-ins', 'Instruktorzy', ['mzi', 'jwr', 'bno', 'pwi']),
];
const CTX = audienceContext('mzi', MEMBERS, GROUPS);
const groupName = (id: string): string => GROUPS.find((g) => g.id === id)?.name ?? '';

/** Szkic z makiety ZL2: kroki 1-2 wypełnione, dowódca imiennie JWR, drugi pilot - grupa. */
function zl2(): OrderFormDraft {
  let d: OrderFormDraft = {
    ...emptyOrderForm({ aircraftId: 'ana', date: '2026-10-03' }),
    from: '09:00',
    to: '13:00',
    operation: 'skoki',
    fromIcao: 'EPKP',
    plannedAir: '2:00',
    plannedFuel: '600',
    note: 'Sobotni dzień skokowy.',
  };
  d = withPerson(d, 'pic', 'jwr');
  d = toggleEntry(d, 'dual', { kind: 'group', id: 'g-an2' }, ANA);
  return d;
}

describe('fotele - stan domyślny i „Ja"', () => {
  it('domyślnie szuka dowódcy, a drugiego pilota tylko przy wymogu załogi 2-os.', () => {
    const empty = emptyOrderForm();
    expect(seatsOf(empty, ANA)).toEqual({ pic: 'sought', dual: 'sought' });
    expect(seatsOf(empty, BKL)).toEqual({ pic: 'sought', dual: 'none' });
  });

  it('„Ja" stoi w jednym fotelu - karta w drugim jest zablokowana z powodem', () => {
    const d = withSeatState(emptyOrderForm(), 'pic', 'self', BKL);
    expect(seatStates(d, 'dual', BKL).map((s) => [s.name, s.desc, s.selected, s.disabled])).toEqual([
      ['Ja', 'Jesteś w fotelu dowódcy', false, true],
      ['Szukam', 'Wyślesz zlecenie', false, false],
      ['Brak', 'Lot bez drugiego pilota', true, false],
    ]);
    // Dowódca nie ma „Brak" - lot bez dowódcy nie istnieje.
    expect(seatStates(d, 'pic', BKL).map((s) => s.state)).toEqual(['self', 'sought']);
    expect(withSeatState(d, 'pic', 'none', BKL)).toBe(d);
  });

  it('„Brak" przy maszynie z wymogiem załogi: zablokowane, powód w karcie i w przycisku', () => {
    const d = { ...zl2(), seats: { pic: 'sought' as const, dual: 'none' as const } };
    expect(seatStates(d, 'dual', ANA)[2]).toEqual({
      state: 'none',
      name: 'Brak',
      desc: 'SP-ANA wymaga załogi dwuosobowej',
      selected: true,
      disabled: true,
    });
    expect(orderStep3Blocker(d, ANA)).toEqual({ reason: 'SP-ANA wymaga załogi dwuosobowej.' });
  });

  it('wspólna lista: „Szukam" mówi, skąd przyjdzie osoba', () => {
    expect(seatStates(withShared(zl2(), true, ANA), 'pic', ANA)[1]?.desc).toBe('Z listy niżej');
  });
});

describe('sposób adresowania nie gubi wyboru', () => {
  it('osoba wskazana imiennie przechodzi na listę grupy i z powrotem', () => {
    const group = withMode(zl2(), 'pic', 'group');
    expect(group.pic.list).toEqual({ pilotIds: ['jwr'], groupIds: [] });
    expect(withMode(group, 'pic', 'person').pic.person).toBe('jwr');
  });

  it('pusty wybór osoby z `<select>` zdejmuje osobę', () => {
    expect(withPerson(zl2(), 'pic', '').pic.person).toBeNull();
  });
});

describe('rozwinięcie grup jak na serwerze', () => {
  it('bez zlecającego i bez nieaktywnych; osoba liczona raz', () => {
    const people = peopleOf({ pilotIds: ['bno'], groupIds: ['g-ins', 'g-an2'] }, CTX)!;
    expect([...people.keys()].sort()).toEqual(['ako', 'akw', 'bno', 'eso', 'jwr', 'pli', 'pwi']);
    // Wskazanie imienne wygrywa z grupą.
    expect(people.get('bno')).toEqual({ named: true, viaGroupId: 'g-ins' });
  });

  it('grupy niewczytane - nie wiadomo', () => {
    expect(peopleOf({ pilotIds: [], groupIds: ['g-an2'] }, audienceContext('mzi', MEMBERS, null))).toBeNull();
  });

  it('stopka: „Trafi do 6 osób" - imiennie Jakub i pięć osób z grupy', () => {
    expect(audienceNote(zl2(), ANA, CTX)).toBe('Trafi do 6 osób');
  });

  it('jedna osoba - dopełniacz liczby pojedynczej; pusta lista - stopka milczy', () => {
    let d = withSeatState(emptyOrderForm(), 'pic', 'self', BKL);
    d = withSeatState(d, 'dual', 'sought', BKL);
    expect(audienceNote(d, BKL, CTX)).toBeNull();
    d = withPerson(d, 'dual', 'eso');
    expect(audienceNote(d, BKL, CTX)).toBe('Trafi do 1 osoby');
  });
});

describe('listy kart kroku 3 (ZL2, dalsza część)', () => {
  const options = (d: OrderFormDraft, query = '') =>
    addressOptions({ draft: d, target: 'dual', aircraft: ANA, members: MEMBERS, groups: GROUPS, ctx: CTX, query });

  it('grupy nad osobami, z liczbą osób, które naprawdę dostaną zlecenie', () => {
    expect(options(zl2()).groups.map((g) => [g.name, g.desc, g.selected])).toEqual([
      ['Piloci An-2', '5 osób', true],
      // Marta w grupie się nie liczy - zlecająca nie jest adresatem.
      ['Instruktorzy', '3 osoby', false],
    ]);
  });

  it('osoby przez zaznaczoną grupę: zaznaczone i zablokowane; bez zlecającej i wyłączonych', () => {
    const people = options(zl2()).people;
    expect(people.map((p) => p.id)).toEqual(['ako', 'akw', 'bno', 'eso', 'jwr', 'pli', 'pwi']);
    expect(people.find((p) => p.id === 'ako')).toMatchObject({
      desc: 'AKO · przez grupę Piloci An-2',
      selected: true,
      disabled: true,
    });
  });

  it('osoba wskazana imiennie na dowódcę: dostępna, z podpisem o terminie do potwierdzenia', () => {
    expect(options(zl2()).people.find((p) => p.id === 'jwr')).toMatchObject({
      desc: 'JWR · imiennie na fotel dowódcy · po zaznaczeniu termin do potwierdzenia',
      selected: false,
      disabled: false,
    });
    const picked = toggleEntry(zl2(), 'dual', { kind: 'person', id: 'jwr' }, ANA);
    expect(options(picked).people.find((p) => p.id === 'jwr')?.desc).toBe(
      'JWR · imiennie na fotel dowódcy · dostanie termin do potwierdzenia',
    );
  });

  it('wyszukiwarka: nazwa grupy, nazwisko albo kod', () => {
    const found = options(zl2(), 'wil');
    expect(found.groups).toEqual([]);
    expect(found.people.map((p) => p.id)).toEqual(['pwi']);
    expect(options(zl2(), 'an-2').groups.map((g) => g.id)).toEqual(['g-an2']);
    expect(options(zl2(), 'PLI').people.map((p) => p.id)).toEqual(['pli']);
  });

  it('`<select>` osoby: aktywni bez zlecającego', () => {
    expect(personChoices(MEMBERS, 'mzi').map((c) => c.label)).toEqual([
      'Adam Kowalski · AKO',
      'Anna Kowal · AKW',
      'Barbara Nowak · BNO',
      'Ewa Sowa · ESO',
      'Jakub Wrona · JWR',
      'Piotr Lis · PLI',
      'Paweł Wilk · PWI',
    ]);
  });
});

describe('osoba imiennie i w grupie drugiego fotela (pkt 39)', () => {
  it('podpis pod osobą wskazaną imiennie - z nazwą grupy, bez blokady', () => {
    const d = withPerson(zl2(), 'pic', 'ako');
    expect(seatHint(d, 'pic', ANA, CTX, groupName)).toEqual([
      { text: 'Jest też w grupie „Piloci An-2"', strong: true },
      { text: ' · dostanie termin do potwierdzenia, fotel wybierzesz po odpowiedzi.' },
    ]);
    expect(orderStep3Blocker(d, ANA)).toBeNull();
    // Stopka liczy osobę raz.
    expect(audienceNote(d, ANA, CTX)).toBe('Trafi do 5 osób');
  });

  it('osoba spoza listy drugiego fotela - bez podpisu', () => {
    expect(seatHint(zl2(), 'pic', ANA, CTX, groupName)).toBeNull();
  });

  it('ta sama osoba imiennie na oba fotele', () => {
    const d = withPerson(withPerson(zl2(), 'pic', 'eso'), 'dual', 'eso');
    expect(seatHint(d, 'pic', ANA, CTX, groupName)?.[0]?.text).toBe('Jest też imiennie na drugiego pilota');
  });
});

describe('wspólna lista nie gubi wyboru (pkt 47, 48)', () => {
  it('włączona pokazuje sumę list foteli - wyłączona przywraca podział', () => {
    const on = withShared(zl2(), true, ANA);
    expect(orderAudienceOf(on, ANA)).toEqual({ kind: 'shared', list: { pilotIds: ['jwr'], groupIds: ['g-an2'] } });
    const off = withShared(on, false, ANA);
    expect(orderAudienceOf(off, ANA)).toEqual({
      kind: 'per_seat',
      pic: { pilotIds: ['jwr'], groupIds: [] },
      dual: { pilotIds: [], groupIds: ['g-an2'] },
    });
  });

  it('dopisany w trakcie staje przy OBU fotelach; fotel „Osoba" przechodzi na listę', () => {
    let d = withShared(zl2(), true, ANA);
    d = toggleEntry(d, 'shared', { kind: 'person', id: 'pwi' }, ANA);
    d = withShared(d, false, ANA);
    expect(orderAudienceOf(d, ANA)).toEqual({
      kind: 'per_seat',
      pic: { pilotIds: ['jwr', 'pwi'], groupIds: [] },
      dual: { pilotIds: ['pwi'], groupIds: ['g-an2'] },
    });
    expect(d.pic.mode).toBe('group');
  });

  it('odznaczony na liście wspólnej znika też z list foteli', () => {
    let d = withShared(zl2(), true, ANA);
    d = toggleEntry(d, 'shared', { kind: 'person', id: 'jwr' }, ANA);
    expect(withShared(d, false, ANA).pic.person).toBeNull();
  });

  it('zdanie pod listą mówi, kto przydziela fotele', () => {
    expect(sharedHint({ pic: 'sought', dual: 'sought' })).toBe(
      'Fotele przydzielisz na karcie zlecenia: „Na dowódcę" albo „Na drugiego pilota" przy każdej osobie, która może lecieć.',
    );
    expect(sharedHint({ pic: 'self', dual: 'sought' })).toBe(
      'Fotel przydzielisz na karcie zlecenia: „Na drugiego pilota" przy każdej osobie, która może lecieć.',
    );
  });
});

describe('bramki (ZL2c)', () => {
  it('żaden fotel nie jest szukany - powód w przycisku', () => {
    let d = withSeatState(emptyOrderForm(), 'pic', 'self', BKL);
    d = withSeatState(d, 'dual', 'none', BKL);
    expect(orderStep3Blocker(d, BKL)).toEqual({ reason: 'Ustaw „Szukam" przy co najmniej jednym fotelu.' });
  });

  it('szukany fotel bez adresata - blokada bez zdania', () => {
    expect(orderStep3Blocker(withPerson(zl2(), 'pic', ''), ANA)).toBe('incomplete');
    expect(orderStep3Blocker(zl2(), ANA)).toBeNull();
  });

  it('krok 2 jak w rezerwacji, bez drugiego pilota', () => {
    expect(orderStep2Blocker(zl2())).toBeNull();
    expect(orderStep2Blocker({ ...zl2(), plannedAir: '' })).toBe('incomplete');
    expect(orderStep2Blocker({ ...zl2(), operation: 'ferry' })).toBe('incomplete');
  });
});

describe('szkic i drut', () => {
  it('maszyna i dzień z komórki kalendarza nie liczą się jako wpis - liczy się różnica od szkicu startowego', () => {
    const seeded = emptyOrderForm({ aircraftId: 'ana', date: '2026-10-03' });
    expect(orderFormDirty(seeded, seeded)).toBe(false);
    expect(orderFormDirty({ ...seeded, from: '09:00' }, seeded)).toBe(true);
    expect(orderFormDirty(withSeatState(seeded, 'pic', 'self', ANA), seeded)).toBe(true);
  });

  it('ciało `POST /orders`: skoki bez lądowania, fotele i adresowanie tak, jak widać', () => {
    expect(orderCreateBody(zl2(), 'o-1', TZ, ANA)).toEqual({
      id: 'o-1',
      aircraftId: 'ana',
      startsAt: '2026-10-03T07:00:00.000Z',
      endsAt: '2026-10-03T11:00:00.000Z',
      operation: 'skoki',
      fromIcao: 'EPKP',
      toIcao: null,
      plannedAirMin: 120,
      plannedFuelL: 600,
      note: 'Sobotni dzień skokowy.',
      seats: { pic: 'sought', dual: 'sought' },
      audience: { kind: 'per_seat', pic: { pilotIds: ['jwr'], groupIds: [] }, dual: { pilotIds: [], groupIds: ['g-an2'] } },
    });
  });

  it('fotel, którego zlecenie nie szuka, nie niesie listy - inaczej `seat_not_sought`', () => {
    const d = withSeatState(zl2(), 'pic', 'self', ANA);
    expect(orderCreateBody(d, 'o-1', TZ, ANA)?.audience).toEqual({
      kind: 'per_seat',
      pic: null,
      dual: { pilotIds: [], groupIds: ['g-an2'] },
    });
  });
});
