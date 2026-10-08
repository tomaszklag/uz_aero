/**
 * Ninerdeck - testy „POWIEL" (`logic/orderDuplicate.ts`; epik Z-C #247; makiety 32, 31).
 *
 * Pod obserwacją: ta sama treść z pustymi godzinami; doba zostaje wyłącznie, dopóki się
 * nie skończyła; adresaci składani z listy rozwiniętej (osoba bez grupy = imiennie, termin
 * do potwierdzenia = obie listy); odebranych nie przepisujemy; „ja" cudzego zlecenia staje
 * się fotelem szukanym.
 */

import { duplicateSeed } from '../ui/screens/logic/orderDuplicate';
import { card, localMs, order, recipient } from './support/orderFixtures';

const leaderCard = (over: Parameters<typeof card>[0] = {}) =>
  card({
    viewer: { leads: true, recipient: null },
    recipients: [
      recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null }),
      recipient('AKW'),
      recipient('BNO'),
      // Odebrany, wskazany imiennie - przepisany pojawiłby się na liście drugiego pilota.
      recipient('PWL', { viaGroupId: null, removed: true, removedAt: '2026-10-02T17:00:00.000Z' }),
    ],
    ...over,
  });

describe('Powiel', () => {
  it('treść przechodzi, godziny nie; doba przed końcem zostaje', () => {
    const seed = duplicateSeed({ card: leaderCard(), viewerId: 'MZI', now: localMs(-1, '19:00') });
    expect(seed.draft).toMatchObject({
      aircraftId: 'ac-ana',
      date: '2026-10-03',
      operation: 'skoki',
      departureIcao: 'EPKP',
      arrivalIcao: 'EPKP',
      plannedAirMin: 180,
      plannedFuelL: 600,
      seats: { pic: 'sought', dual: 'sought' },
    });
    expect(seed.draft.startsAt).toBeUndefined();
    expect(seed.draft.endsAt).toBeUndefined();
    expect(seed.anchor).not.toBeNull();
  });

  it('doba, która się skończyła, nie przechodzi - formularz zacznie od dziś', () => {
    const seed = duplicateSeed({ card: leaderCard(), viewerId: 'MZI', now: localMs(1, '08:00') });
    expect(seed.draft.date).toBeNull();
    expect(seed.anchor).toBeNull();
  });

  it('adresaci: osoba bez grupy imiennie, grupa jako grupa, odebranych nie ma', () => {
    const seed = duplicateSeed({ card: leaderCard(), viewerId: 'MZI', now: localMs(-1, '19:00') });
    expect(seed.draft.pic).toEqual({ mode: 'person', person: 'JWR', list: { pilotIds: [], groupIds: [] } });
    expect(seed.draft.dual).toEqual({ mode: 'group', person: null, list: { pilotIds: [], groupIds: ['g-an2'] } });
  });

  it('termin do potwierdzenia: imiennie na swój fotel, grupa na drugi', () => {
    const seed = duplicateSeed({
      card: leaderCard({
        recipients: [
          recipient('AKO', { seat: null, namedSeat: 'pic', viaGroupId: 'g-an2' }),
          recipient('AKW'),
        ],
      }),
      viewerId: 'MZI',
      now: localMs(-1, '19:00'),
    });
    expect(seed.draft.pic).toMatchObject({ mode: 'person', person: 'AKO' });
    expect(seed.draft.dual?.list).toEqual({ pilotIds: [], groupIds: ['g-an2'] });
  });

  it('wspólna lista - całość czeka w dopisanych', () => {
    const seed = duplicateSeed({
      card: leaderCard({
        order: order({ addressing: 'shared' }),
        recipients: [recipient('JWR', { seat: null, viaGroupId: null }), recipient('AKW', { seat: null })],
      }),
      viewerId: 'MZI',
      now: localMs(-1, '19:00'),
    });
    expect(seed.draft.shared).toBe(true);
    expect(seed.draft.sharedExtra).toEqual({ pilotIds: ['JWR'], groupIds: ['g-an2'] });
  });

  it('„ja" cudzego zlecenia staje się fotelem szukanym', () => {
    const seed = duplicateSeed({
      card: leaderCard({ order: order({ seats: { pic: 'self', dual: 'sought' } }) }),
      viewerId: 'KRZ',
      now: localMs(-1, '19:00'),
    });
    expect(seed.draft.seats).toEqual({ pic: 'sought', dual: 'sought' });
    expect(duplicateSeed({
      card: leaderCard({ order: order({ seats: { pic: 'self', dual: 'sought' } }) }),
      viewerId: 'MZI',
      now: localMs(-1, '19:00'),
    }).draft.seats).toEqual({ pic: 'self', dual: 'sought' });
  });
});
