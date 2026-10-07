/**
 * Ninerdeck - testy HISTORII ZMIAN ZLECENIA (`logic/orderHistory.ts`; epik Z-C #247;
 * makiety 32, 32A, 32B).
 *
 * Pod obserwacją: najnowsze na górze, nazwisko sprawcy po prawej (zegar bez nazwiska),
 * „Utworzone" z etykietą adresowania z serwera (decyzja właściciela 2026-10-06),
 * „Przyjęcie" kontra „Przydział", powody jako cytat i rodzaj nieznany bez wywrotki.
 */

import type { RemoteOrderHistoryEntry } from '../application';
import type { ChangePart } from '../ui/screens/logic/orderChanges';
import { orderDay } from '../ui/screens/logic/orderFormat';
import { orderHistoryRows } from '../ui/screens/logic/orderHistory';
import { local, localMs, nameOf, regOf, SATURDAY } from './support/orderFixtures';

const flat = (parts: readonly ChangePart[]): string => parts.map((p) => (p.strong ? `[${p.text}]` : p.text)).join('');

const entry = (id: string, at: string, kind: string, payload: Record<string, unknown>, actorId: string | null = 'MZI'): RemoteOrderHistoryEntry => ({
  id,
  actorId,
  kind,
  payload,
  at,
});

function rows(history: RemoteOrderHistoryEntry[], pilotId = 'MZI') {
  return orderHistoryRows({ history, day: orderDay(SATURDAY)!, now: localMs(0, '16:22'), pilotId, nameOf, regOf }).map((r) => ({
    when: r.when,
    what: flat(r.what),
    reason: r.reason,
    who: r.who,
  }));
}

describe('historia zmian u prowadzącego', () => {
  it('zlecenie B z ramki „odwołane" (32): najnowsze na górze, nazwiska działających', () => {
    const history = [
      entry('h1', local(-1, '18:40'), 'created', { audience: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2', recipients: 6 }),
      entry('h2', local(-1, '21:05'), 'resent', { added: [], reminded: ['AKO', 'ESO', 'BNO', 'JWR'] }),
      entry('h3', local(0, '07:10'), 'edited', { changes: { plannedAirMin: { from: 120, to: 180 } } }, 'PWL'),
      entry('h4', local(0, '16:20'), 'cancelled', { reason: 'Maszyna idzie do serwisu, skoki przenosimy na przyszłą sobotę.' }),
    ];
    expect(rows(history)).toEqual([
      {
        when: 'dziś 16:20',
        what: '[Odwołanie]',
        reason: 'Maszyna idzie do serwisu, skoki przenosimy na przyszłą sobotę.',
        who: 'Ty',
      },
      { when: 'dziś 07:10', what: '[Plan lotu] 2:00 → 3:00', reason: null, who: 'Paweł Wilk' },
      { when: 'wcz. 21:05', what: '[Wysłano ponownie] · przypomnienie dla 4 osób', reason: null, who: 'Ty' },
      {
        when: 'wcz. 18:40',
        what: '[Utworzone] · dowódca: Jakub Wrona · drugi pilot: Piloci An-2',
        reason: null,
        who: 'Ty',
      },
    ]);
  });

  it('obsadzenie fotela: „Przyjęcie" pisze osoba z fotela imiennego, „Przydział" - prowadzący (32B)', () => {
    const history = [
      entry('h1', local(0, '07:05'), 'assigned', { seat: 'pic', pilotId: 'JWR', via: 'answer' }, 'JWR'),
      entry('h2', local(0, '07:12'), 'assigned', { seat: 'dual', pilotId: 'AKW', via: 'leader' }),
    ];
    expect(rows(history)).toEqual([
      { when: 'dziś 07:12', what: '[Przydział] · drugi pilot: Anna Kowal', reason: null, who: 'Ty' },
      { when: 'dziś 07:05', what: '[Przyjęcie] · dowódca', reason: null, who: 'Jakub Wrona' },
    ]);
  });

  it('czerwień niesie WYŁĄCZNIE odwołanie - jedyny wpis, który coś kasuje (32, ramka 2)', () => {
    const history = [
      entry('h1', local(-1, '18:40'), 'created', { audience: 'wspólna lista: Piloci An-2' }),
      entry('h2', local(0, '07:10'), 'recipients_removed', { pilotIds: ['AKO'], reason: 'Inny lot.' }),
      entry('h3', local(0, '16:20'), 'cancelled', {}),
    ];
    const marks = orderHistoryRows({ history, day: orderDay(SATURDAY)!, now: localMs(0, '16:22'), pilotId: 'MZI', nameOf, regOf }).map(
      (r) => r.void,
    );
    expect(marks).toEqual([true, false, false]);
  });

  it('wygaśnięcie robi zegar - wpis bez nazwiska', () => {
    expect(rows([entry('h1', local(0, '09:00'), 'expired', {}, null)])).toEqual([
      { when: 'dziś 09:00', what: '[Wygasło]', reason: null, who: null },
    ]);
  });

  it('cofnięcia, rezygnacje i odebrania niosą powód jako cytat', () => {
    const history = [
      entry('h1', local(0, '08:00'), 'withdrawn', { seat: 'dual', pilotId: 'AKW', reason: 'Mam dyżur.' }, 'AKW'),
      entry('h2', local(0, '08:10'), 'unassigned', { seat: 'pic', pilotId: 'JWR', reason: null, via: 'leader' }),
      entry('h3', local(0, '08:20'), 'recipients_removed', { pilotIds: ['AKO'], reason: 'W tym czasie masz przelot.' }),
    ];
    expect(rows(history)).toEqual([
      { when: 'dziś 08:20', what: '[Zlecenie cofnięte] · Adam Kowalski', reason: 'W tym czasie masz przelot.', who: 'Ty' },
      { when: 'dziś 08:10', what: '[Cofnięty przydział] · dowódca: Jakub Wrona', reason: null, who: 'Ty' },
      { when: 'dziś 08:00', what: '[Rezygnacja] · drugi pilot', reason: 'Mam dyżur.', who: 'Anna Kowal' },
    ]);
  });

  it('dopisanie i ponowne wysłanie liczą osoby; trzy i więcej - liczbą, nie listą nazwisk', () => {
    const history = [
      entry('h1', local(0, '10:00'), 'recipients_added', { pilotIds: ['ESO', 'PLI'] }),
      entry('h2', local(0, '10:05'), 'recipients_added', { pilotIds: ['ESO', 'PLI', 'BNO'] }),
      entry('h3', local(0, '10:10'), 'resent', { added: ['BNO', 'PLI'], reminded: ['AKO'] }),
    ];
    expect(rows(history).map((r) => r.what)).toEqual([
      '[Wysłano ponownie] · 2 nowe osoby, przypomnienie dla 1 osoby',
      '[Nowi adresaci] · 3 osoby',
      '[Nowi adresaci] · Ewa Sowa, Piotr Lis',
    ]);
  });

  it('rodzaj nieznany temu wydaniu czyta się jako „Zmiana" - historia nie gubi wpisów', () => {
    expect(rows([entry('h1', local(0, '11:00'), 'cos_nowego', { x: 1 })])).toEqual([
      { when: 'dziś 11:00', what: '[Zmiana]', reason: null, who: 'Ty' },
    ]);
  });
});
