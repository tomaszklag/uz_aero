/**
 * Ninerdeck - testy FORMULARZA ZLECENIA, krok 3 (`logic/orderForm.ts`; epik Z-C #247;
 * makiety 31B, 31C; `docs/zlecenia.md` §4, §14.4, pkt 37-39, 47, 48).
 *
 * Pod obserwacją: fotele z trzema stanami („Ja" najwyżej w jednym, stan domyślny z wymogu
 * maszyny), sposób adresowania pamiętany osobno, przełącznik „Wspólna lista", który nie
 * gubi wyboru, adresowanie na drut, zdanie o skutku nad przyciskiem (trzy ramki makiety),
 * podpis przy osobie wskazanej imiennie i bramka „WYŚLIJ ZLECENIE".
 */

import {
  audienceSummary,
  emptyOrderDraft,
  orderAudienceOf,
  orderDraftDirty,
  seatHint,
  seatsOf,
  sharedListOf,
  step3Gate,
  withList,
  withMode,
  withoutEntry,
  withPerson,
  withSeatState,
  withShared,
  withSharedList,
  type AudienceContext,
  type OrderDraft,
} from '../ui/screens/logic/orderForm';

const AN2 = { dualRequired: true };
const C172 = { dualRequired: false };

/** Grupa „Piloci An-2" (5 osób) i „Instruktorzy" - świat makiet Z-A. */
const GROUPS = new Map<string, string[]>([
  ['g-an2', ['AKW', 'AKO', 'PLI', 'BNO', 'ESO']],
  ['g-inst', ['PWL', 'MZI', 'JWR']],
]);

const ctx: AudienceContext & { groupName: (id: string) => string } = {
  me: 'MZI',
  groups: GROUPS,
  isActive: (id) => id !== 'OFF',
  groupName: (id) => (id === 'g-an2' ? 'Piloci An-2' : 'Instruktorzy'),
};

const text = (parts: { text: string }[] | null): string | null => (parts == null ? null : parts.map((p) => p.text).join(''));

/** Ramka 1 makiety 31B: dowódca imiennie (Jakub Wrona), drugi pilot z grupy „Piloci An-2". */
function frameOne(): OrderDraft {
  let d = emptyOrderDraft();
  d = withPerson(d, 'pic', 'JWR');
  d = withList(d, 'dual', { pilotIds: [], groupIds: ['g-an2'] });
  return d;
}

describe('fotele (§4.1)', () => {
  it('domyślnie szuka dowódcy, a drugi fotel szuka tylko przy wymogu załogi dwuosobowej', () => {
    expect(seatsOf(emptyOrderDraft(), C172)).toEqual({ pic: 'sought', dual: 'none' });
    expect(seatsOf(emptyOrderDraft(), AN2)).toEqual({ pic: 'sought', dual: 'sought' });
  });

  it('„Ja" stoi najwyżej w jednym fotelu - drugi wraca do szukania', () => {
    let d = withSeatState(emptyOrderDraft(), 'pic', 'self', AN2);
    expect(d.seats).toEqual({ pic: 'self', dual: 'sought' });
    d = withSeatState(d, 'dual', 'self', AN2);
    expect(d.seats).toEqual({ pic: 'sought', dual: 'self' });
  });

  it('dowódca nie ma stanu „brak"', () => {
    const d = emptyOrderDraft();
    expect(withSeatState(d, 'pic', 'none', C172)).toBe(d);
  });
});

describe('sposób adresowania', () => {
  it('przełączenie „Osoba" ↔ „Grupa" nie gubi wyboru', () => {
    let d = withPerson(emptyOrderDraft(), 'pic', 'JWR');
    d = withMode(d, 'pic', 'group');
    expect(d.pic.list).toEqual({ pilotIds: ['JWR'], groupIds: [] });
    d = withList(d, 'pic', { pilotIds: ['JWR'], groupIds: ['g-inst'] });
    d = withMode(d, 'pic', 'person');
    expect(d.pic.person).toBe('JWR');
    // Lista grupy zostaje w pamięci - powrót do „Grupa" pokazuje ją z powrotem.
    expect(withMode(d, 'pic', 'group').pic.list.groupIds).toEqual(['g-inst']);
  });

  it('lista z jedną osobą staje się wskazaniem imiennym', () => {
    let d = withList(emptyOrderDraft(), 'dual', { pilotIds: ['ESO'], groupIds: [] });
    d = withMode(d, 'dual', 'person');
    expect(d.dual).toMatchObject({ mode: 'person', person: 'ESO' });
  });
});

describe('wspólna lista (pkt 47, 48)', () => {
  it('włączona pokazuje sumę list szukanych foteli, wyłączona przywraca podział', () => {
    const d = frameOne();
    const on = withShared(d, true, AN2);
    expect(sharedListOf(on, seatsOf(on, AN2))).toEqual({ pilotIds: ['JWR'], groupIds: ['g-an2'] });
    const off = withShared(on, false, AN2);
    expect(off.pic).toEqual(d.pic);
    expect(off.dual).toEqual(d.dual);
  });

  it('dopisany w trakcie staje przy OBU szukanych fotelach; „Osoba" przechodzi na listę', () => {
    let d = withShared(frameOne(), true, AN2);
    d = withSharedList(d, { pilotIds: ['JWR', 'PWL'], groupIds: ['g-an2'] }, AN2);
    expect(d.sharedExtra).toEqual({ pilotIds: ['PWL'], groupIds: [] });
    const off = withShared(d, false, AN2);
    expect(off.pic).toMatchObject({ mode: 'group', list: { pilotIds: ['JWR', 'PWL'], groupIds: [] } });
    expect(off.dual.list).toEqual({ pilotIds: ['PWL'], groupIds: ['g-an2'] });
    expect(off.sharedExtra).toEqual({ pilotIds: [], groupIds: [] });
  });

  it('skreślony z listy wspólnej znika też z list foteli', () => {
    let d = withShared(frameOne(), true, AN2);
    d = withoutEntry(d, 'shared', { kind: 'person', id: 'JWR' }, AN2);
    const off = withShared(d, false, AN2);
    expect(off.pic.person).toBeNull();
    expect(off.dual.list.groupIds).toEqual(['g-an2']);
  });
});

describe('adresowanie na drut', () => {
  it('per fotel - lista fotela, którego zlecenie nie szuka, nie jedzie', () => {
    const d = withSeatState(frameOne(), 'pic', 'self', AN2);
    expect(orderAudienceOf(d, AN2)).toEqual({
      kind: 'per_seat',
      pic: null,
      dual: { pilotIds: [], groupIds: ['g-an2'] },
    });
  });

  it('wspólna lista - jedna lista dla szukanych foteli', () => {
    expect(orderAudienceOf(withShared(frameOne(), true, AN2), AN2)).toEqual({
      kind: 'shared',
      list: { pilotIds: ['JWR'], groupIds: ['g-an2'] },
    });
  });
});

describe('zdanie nad „WYŚLIJ ZLECENIE" (31B)', () => {
  it('ramka 1: imiennie + grupa', () => {
    expect(text(audienceSummary(frameOne(), AN2, ctx))).toBe(
      'Zlecenie trafi do 6 osób. Dowódcę obsadzi odpowiedź osoby wskazanej imiennie, drugiego pilota wybierzesz spośród zgłoszonych.',
    );
  });

  it('ramka 2: wspólna lista - osoba liczy się raz', () => {
    const d = withList(withShared(emptyOrderDraft(), true, AN2), 'dual', { pilotIds: [], groupIds: ['g-an2'] });
    expect(text(audienceSummary(d, AN2, ctx))).toBe(
      'Zlecenie trafi do 5 osób. Adresaci potwierdzą termin, a fotele przydzielisz spośród zgłoszonych.',
    );
  });

  it('ramka 3: osoba wskazana imiennie jest też w grupie drugiego fotela', () => {
    const d = withPerson(frameOne(), 'pic', 'AKO');
    expect(text(audienceSummary(d, AN2, ctx))).toBe(
      'Zlecenie trafi do 5 osób. Oba fotele wybierzesz spośród zgłoszonych - osoba wskazana imiennie jest też w grupie drugiego pilota.',
    );
  });

  it('jeden szukany fotel; zlecający i nieaktywni nie liczą się do adresatów', () => {
    let d = withSeatState(emptyOrderDraft(), 'pic', 'self', AN2);
    d = withList(d, 'dual', { pilotIds: ['OFF'], groupIds: ['g-inst'] });
    expect(text(audienceSummary(d, AN2, ctx))).toBe(
      'Zlecenie trafi do 2 osób. Drugiego pilota wybierzesz spośród zgłoszonych.',
    );
  });

  it('jedna osoba - „do 1 osoby", fotel obsadzi jej odpowiedź', () => {
    const d = withPerson(emptyOrderDraft(), 'pic', 'JWR');
    expect(text(audienceSummary(d, C172, ctx))).toBe(
      'Zlecenie trafi do 1 osoby. Dowódcę obsadzi odpowiedź osoby wskazanej imiennie.',
    );
  });

  it('bez grup w pamięci - samo „kto obsadzi", bez liczby', () => {
    expect(text(audienceSummary(frameOne(), AN2, { ...ctx, groups: null }))).toBe(
      'Dowódcę obsadzi odpowiedź osoby wskazanej imiennie, drugiego pilota wybierzesz spośród zgłoszonych.',
    );
  });

  it('pusta lista szukanego fotela - zdania nie ma (przycisk i tak stoi)', () => {
    expect(audienceSummary(withPerson(frameOne(), 'pic', null), AN2, ctx)).toBeNull();
  });
});

describe('podpis przy osobie wskazanej imiennie (pkt 39)', () => {
  it('jest też w grupie drugiego fotela', () => {
    expect(text(seatHint(withPerson(frameOne(), 'pic', 'AKO'), 'pic', AN2, ctx))).toBe(
      'Jest też w grupie „Piloci An-2" - dostanie termin do potwierdzenia, fotel wybierzesz po odpowiedzi.',
    );
  });

  it('jest też imiennie na drugim fotelu', () => {
    const d = withPerson(withPerson(emptyOrderDraft(), 'pic', 'JWR'), 'dual', 'JWR');
    expect(text(seatHint(d, 'pic', AN2, ctx))).toBe(
      'Jest też imiennie na drugiego pilota - dostanie termin do potwierdzenia, fotel wybierzesz po odpowiedzi.',
    );
  });

  it('bez warunku - bez podpisu', () => {
    expect(seatHint(frameOne(), 'pic', AN2, ctx)).toBeNull();
  });
});

describe('bramka „WYŚLIJ ZLECENIE"', () => {
  it('kolejność powagi: bez szukanego fotela, wymóg maszyny, pusta lista bez zdania', () => {
    let d = withSeatState(emptyOrderDraft(), 'pic', 'self', C172);
    expect(step3Gate(d, C172)).toEqual({ reason: 'Ustaw „Szukam" przy co najmniej jednym fotelu.' });

    d = withSeatState(withSeatState(emptyOrderDraft(), 'dual', 'none', C172), 'pic', 'sought', C172);
    d = withPerson(d, 'pic', 'JWR');
    expect(step3Gate(d, C172)).toBeNull();
    expect(step3Gate(d, AN2)).toEqual({
      reason: 'Wybierz drugiego pilota - ten samolot wymaga załogi dwuosobowej.',
    });

    expect(step3Gate(emptyOrderDraft(), C172)).toEqual({ reason: null });
    expect(step3Gate(frameOne(), AN2)).toBeNull();
  });
});

describe('szkic do porzucenia', () => {
  it('pola podstawione przez nawigację nie liczą się jako wpis', () => {
    const seeded = { ...emptyOrderDraft(), aircraftId: 'ac-ana', date: '2026-10-03' };
    expect(orderDraftDirty(seeded, ['aircraftId', 'date'])).toBe(false);
    expect(orderDraftDirty(withPerson(seeded, 'pic', 'JWR'), ['aircraftId', 'date'])).toBe(true);
  });
});
