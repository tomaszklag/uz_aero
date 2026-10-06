/**
 * Ninerdeck - testy LICZB ZLECEŃ (`logic/orderSummary.ts`; epik Z-C #247; makiety 20F, 30).
 *
 * Pod obserwacją: karta „Zlecenia" tylko z treścią i z odmianą, błękit wyłącznie przy
 * „czeka na Twoją odpowiedź", połowa listy na start (pkt 36) i liczby przy segmentach -
 * wyłącznie przy NIEWŁĄCZONYM i wyłącznie dodatnie.
 */

import type { RemoteOrderSummary } from '../application';
import { defaultBox, ordersCardRows, segmentsVm } from '../ui/screens/logic/orderSummary';

const summary = (over: Partial<RemoteOrderSummary> = {}): RemoteOrderSummary => ({
  awaitingAnswer: 0,
  seekingCrew: 0,
  canCreate: false,
  canManage: false,
  ...over,
});

describe('karta „Zlecenia" na Pulpicie (20F)', () => {
  it('liczba w każdym wierszu, błękit tylko przy tym, co pyta Ciebie', () => {
    expect(ordersCardRows(summary({ awaitingAnswer: 2, seekingCrew: 1 }))).toEqual([
      { count: 2, text: 'czekają na Twoją odpowiedź', tone: 'blue' },
      { count: 1, text: 'z prowadzonych szuka załogi', tone: 'neutral' },
    ]);
  });

  it('odmiana: 1 czeka, 2 czekają, 5 czeka', () => {
    expect(ordersCardRows(summary({ awaitingAnswer: 1 }))?.[0]?.text).toBe('czeka na Twoją odpowiedź');
    expect(ordersCardRows(summary({ awaitingAnswer: 5 }))?.[0]?.text).toBe('czeka na Twoją odpowiedź');
    expect(ordersCardRows(summary({ seekingCrew: 3 }))?.[0]?.text).toBe('z prowadzonych szukają załogi');
  });

  it('zero i brak sieci - karty nie ma wcale', () => {
    expect(ordersCardRows(summary())).toBeNull();
    expect(ordersCardRows(null)).toBeNull();
  });
});

describe('połowa listy na start (pkt 36)', () => {
  it('„Do mnie", gdy coś tam czeka; inaczej „Zlecone" - jeśli ta osoba je widzi', () => {
    expect(defaultBox(summary({ awaitingAnswer: 1, canManage: true }))).toBe('inbox');
    expect(defaultBox(summary({ canManage: true }))).toBe('managed');
    expect(defaultBox(summary({ canCreate: true }))).toBe('managed');
    expect(defaultBox(summary())).toBe('inbox');
    expect(defaultBox(null)).toBe('inbox');
  });
});

describe('segmenty listy (30)', () => {
  it('liczba stoi wyłącznie przy niewłączonej połowie i wyłącznie dodatnia', () => {
    const s = summary({ awaitingAnswer: 2, seekingCrew: 1, canCreate: true });
    expect(segmentsVm(s, 'inbox')).toEqual({ shown: true, inboxCount: null, managedCount: 1, newOrder: false });
    expect(segmentsVm(s, 'managed')).toEqual({ shown: true, inboxCount: 2, managedCount: null, newOrder: true });
    expect(segmentsVm(summary({ canManage: true }), 'inbox')).toMatchObject({ inboxCount: null, managedCount: null });
  });

  it('bez prawa zlecania i prowadzenia - jedna połowa, czyli bez segmentu', () => {
    expect(segmentsVm(summary({ awaitingAnswer: 3 }), 'inbox')).toEqual({
      shown: false,
      inboxCount: null,
      managedCount: null,
      newOrder: false,
    });
  });

  it('samo prowadzenie cudzych zleceń nie daje „NOWE ZLECENIE" (§9)', () => {
    expect(segmentsVm(summary({ canManage: true }), 'managed').newOrder).toBe(false);
  });
});
