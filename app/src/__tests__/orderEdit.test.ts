/**
 * Ninerdeck - testy EDYCJI ZLECENIA (`logic/orderEdit.ts`; epik Z-C #247; ramki edycji
 * makiet 31 i 31B; `docs/zlecenia.md` §5.1, §5.2).
 *
 * Pod obserwacją: szkic odtworzony z karty (listy foteli puste - niosą tylko dopisanych),
 * różnica na drut (sama zmiana, dopisani wyłącznie przy szukanych fotelach), ostrzeżenie
 * o zmianie terminu z poprzednim terminem, ostrzeżenie o osobie tracącej przydział,
 * bramka „ZAPISZ ZMIANY" i zdanie o skutku liczące wyłącznie NOWE osoby.
 */

import {
  draftOfOrder,
  editStep3Gate,
  editSummary,
  orderChanges,
  seatLossNote,
  sentPeople,
  sentViaGroup,
  termWarning,
} from '../ui/screens/logic/orderEdit';
import { multiSheetVm } from '../ui/screens/logic/orderFormAddressees';
import { withList, withSeatState, type AudienceContext, type OrderDraft } from '../ui/screens/logic/orderForm';
import { orderDay } from '../ui/screens/logic/orderFormat';
import { booking, card, localMs, order, PEOPLE, recipient, SATURDAY } from './support/orderFixtures';

const AN2 = { dualRequired: true };

/** Zlecenie B oczami prowadzącej: dowódca imiennie (Jakub Wrona), drugi pilot z grupy. */
const leaderCard = (over: Parameters<typeof card>[0] = {}) =>
  card({
    viewer: { leads: true, recipient: null },
    recipients: [
      recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null }),
      recipient('AKW'),
      recipient('BNO'),
      recipient('ESO'),
      recipient('AKO'),
      recipient('PLI'),
      recipient('PWL', { viaGroupId: null, removed: true, removedAt: '2026-10-02T17:00:00.000Z' }),
    ],
    ...over,
  });

const ctx: AudienceContext = {
  me: 'MZI',
  groups: new Map([
    ['g-an2', ['AKW', 'AKO', 'PLI', 'BNO', 'ESO']],
    ['g-inst', ['PWL', 'MZI', 'JWR', 'KRZ']],
  ]),
  isActive: () => true,
};

const day = orderDay(SATURDAY)!;
const baseOf = (c = leaderCard()): OrderDraft => draftOfOrder(c)!;
const moved = (d: OrderDraft, startHhmm: string): OrderDraft => ({ ...d, startsAt: localMs(0, startHhmm) });

describe('szkic z karty prowadzącego', () => {
  it('termin, treść i fotele; listy foteli puste - niosą tylko dopisanych', () => {
    const d = baseOf();
    expect(d).toMatchObject({
      date: '2026-10-03',
      aircraftId: 'ac-ana',
      startsAt: localMs(0, '09:00'),
      endsAt: localMs(0, '13:00'),
      operation: 'skoki',
      departureIcao: 'EPKP',
      seats: { pic: 'sought', dual: 'sought' },
      shared: false,
    });
    expect(d.pic.list).toEqual({ pilotIds: [], groupIds: [] });
  });

  it('wysłani: bez odebranych; grupa liczy osoby, do których naprawdę poszła', () => {
    const c = leaderCard();
    expect([...sentPeople(c)].sort()).toEqual(['AKO', 'AKW', 'BNO', 'ESO', 'JWR', 'PLI']);
    expect(sentViaGroup(c, 'g-an2')).toBe(5);
  });
});

describe('różnica na drut', () => {
  it('bez zmian - nic', () => {
    expect(orderChanges(baseOf(), baseOf(), AN2)).toBeNull();
  });

  it('zmiana terminu, fotela i dopisani przy szukanym fotelu', () => {
    let d = moved(baseOf(), '10:00');
    d = withList(d, 'dual', { pilotIds: ['PWL'], groupIds: [] });
    expect(orderChanges(d, baseOf(), AN2)).toEqual({
      startsAt: new Date(localMs(0, '10:00')).toISOString(),
      addRecipients: [{ seat: 'dual', list: { pilotIds: ['PWL'], groupIds: [] } }],
    });
    const self = withSeatState(withList(baseOf(), 'pic', { pilotIds: ['KRZ'], groupIds: [] }), 'pic', 'self', AN2);
    // Dopisani przy fotelu, którego zlecenie już nie szuka, nie jadą - serwer odmówiłby.
    expect(orderChanges(self, baseOf(), AN2)).toEqual({ seats: { pic: 'self', dual: 'sought' } });
  });

  it('wspólna lista - dopisani jadą bez fotela', () => {
    const c = leaderCard({ order: order({ addressing: 'shared' }) });
    const d = { ...baseOf(c), sharedExtra: { pilotIds: ['KRZ'], groupIds: [] } };
    expect(orderChanges(d, baseOf(c), AN2)).toEqual({ addRecipients: [{ seat: null, list: { pilotIds: ['KRZ'], groupIds: [] } }] });
  });
});

describe('ostrzeżenia', () => {
  it('zmiana terminu mówi, jaki był; inny dzień dostaje datę', () => {
    expect(termWarning(baseOf(), baseOf(), day)).toBeNull();
    expect(termWarning(moved(baseOf(), '10:00'), baseOf(), day)).toBe(
      'Zmieniasz termin (było 09:00 → 13:00) - adresaci odpowiedzą od nowa, obsadzone fotele zostają.',
    );
    const otherDay = { ...baseOf(), date: '2026-10-04', startsAt: localMs(1, '09:00'), endsAt: localMs(1, '13:00') };
    expect(termWarning(otherDay, baseOf(), day)).toBe(
      'Zmieniasz termin (było sob 3 PAŹ 09:00 → 13:00) - adresaci odpowiedzą od nowa, obsadzone fotele zostają.',
    );
  });

  it('fotel z osobą przydzieloną przestawiony na „Ja" albo „Brak"', () => {
    const c = leaderCard({ booking: booking({ dualId: 'AKW' }) });
    const d = withSeatState(baseOf(c), 'dual', 'self', AN2);
    expect(seatLossNote(c, d, 'dual', AN2)).toBe(
      'Osoba przydzielona do tego fotela straci przydział - dostanie wiadomość „Przydział cofnięty".',
    );
    expect(seatLossNote(c, baseOf(c), 'dual', AN2)).toBeNull();
    // Zlecający w fotelu „Ja" sam przestawia układ - wiadomości do siebie nie ma.
    const C172 = { dualRequired: false };
    const own = leaderCard({ order: order({ seats: { pic: 'sought', dual: 'self' } }), booking: booking({ dualId: 'MZI' }) });
    expect(seatLossNote(own, withSeatState(baseOf(own), 'dual', 'none', C172), 'dual', C172)).toBeNull();
  });
});

describe('bramka „ZAPISZ ZMIANY"', () => {
  it('szukany fotel ma adresatów wysłanych albo dopisanych', () => {
    const c = leaderCard();
    expect(editStep3Gate(baseOf(c), c, AN2)).toBeNull();
    // Dowódca „Ja" - fotel nie ma adresatów; drugi pilot szukany grupą.
    const own = leaderCard({
      order: order({ seats: { pic: 'self', dual: 'sought' } }),
      recipients: [recipient('AKW'), recipient('BNO')],
    });
    const vacated = withSeatState(baseOf(own), 'pic', 'sought', AN2);
    expect(editStep3Gate(vacated, own, AN2)).toEqual({ reason: null });
    expect(editStep3Gate(withList(vacated, 'pic', { pilotIds: ['KRZ'], groupIds: [] }), own, AN2)).toBeNull();
    expect(editStep3Gate(withSeatState(baseOf(c), 'dual', 'none', AN2), c, AN2)).toEqual({
      reason: 'Wybierz drugiego pilota - ten samolot wymaga załogi dwuosobowej.',
    });
  });
});

describe('zdanie nad „ZAPISZ ZMIANY"', () => {
  const text = (parts: { text: string }[] | null) => (parts == null ? null : parts.map((p) => p.text).join(''));

  it('nowi adresaci i zmiana terminu (ramka 4 makiety 31B)', () => {
    const d = withList(moved(baseOf(), '10:00'), 'dual', { pilotIds: ['PWL'], groupIds: [] });
    expect(text(editSummary(d, baseOf(), leaderCard(), AN2, ctx))).toBe(
      'Zlecenie trafi do 1 nowej osoby. Pozostali adresaci dostaną wiadomość o zmianie.',
    );
  });

  it('grupa liczy wyłącznie tych, którzy zlecenia jeszcze nie mają', () => {
    const d = withList(baseOf(), 'pic', { pilotIds: [], groupIds: ['g-inst'] });
    // Instruktorzy: PWL (odebrany - wraca), MZI (zlecająca), JWR (już ma), KRZ.
    expect(text(editSummary(d, baseOf(), leaderCard(), AN2, ctx))).toBe('Zlecenie trafi do 2 nowych osób.');
  });

  it('sama zmiana treści; bez zmian - bez zdania', () => {
    expect(text(editSummary({ ...baseOf(), notes: 'Inny opis' }, baseOf(), leaderCard(), AN2, ctx))).toBe(
      'Adresaci dostaną wiadomość o zmianie.',
    );
    expect(editSummary(baseOf(), baseOf(), leaderCard(), AN2, ctx)).toBeNull();
  });
});

describe('arkusz dopisania w edycji', () => {
  it('osoby, które zlecenie już mają, nie stoją na liście i nie liczą się do „GOTOWE · N"', () => {
    const members = Object.entries(PEOPLE).map(([id, p]) => ({ id, name: p.name, code: p.code, active: true }));
    const vm = multiSheetVm({
      selection: { pilotIds: [], groupIds: ['g-an2'] },
      groups: [{ id: 'g-an2', name: 'Piloci An-2', memberIds: ['AKW', 'AKO', 'PLI', 'BNO', 'ESO'], createdAt: '', updatedAt: '' }],
      members,
      me: 'MZI',
      other: null,
      exclude: sentPeople(leaderCard()),
    });
    expect(vm.persons.map((p) => p.pilotId)).toEqual(['PWL']);
    expect(vm.total).toBe(0);
  });
});
