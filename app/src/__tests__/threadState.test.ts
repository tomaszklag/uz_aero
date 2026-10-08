/**
 * Ninerdeck - testy STANU OTWARTEJ ROZMOWY (`logic/threadState.ts`; epik Z-C #247).
 *
 * Pod obserwacją: ta sama wiadomość z ramki i z odpowiedzi na wysyłkę staje raz, odczyt
 * z ramki podmienia chwilę uczestnika, a odświeżenie pierwszej strony nie odcina starszych
 * stron, które pilot już dociągnął.
 */

import type { RemoteThreadMessage, RemoteThreadPage } from '../application';
import { unionMessages, upsertMessage, withFirstPage, withOlderPage, withRead } from '../ui/screens/logic/threadState';

const m = (id: string, at: string, body = id): RemoteThreadMessage => ({ id, authorId: 'MZI', body, createdAt: at });

const page = (over: Partial<RemoteThreadPage> = {}): RemoteThreadPage => ({
  role: 'participant',
  closed: null,
  threadId: 't-1',
  participants: [],
  messages: [],
  next: null,
  ...over,
});

describe('stan rozmowy', () => {
  it('ta sama wiadomość dwiema drogami staje raz - wygrywa nowsza wersja', () => {
    const list = upsertMessage([m('a', '2026-10-02T10:00:00Z'), m('b', '2026-10-02T10:05:00Z')], m('b', '2026-10-02T10:05:00Z', 'nowa'));
    expect(list.map((x) => `${x.id}:${x.body}`)).toEqual(['a:a', 'b:nowa']);
    expect(unionMessages([m('a', '1')], [m('a', '1', 'druga'), m('c', '2')]).map((x) => x.body)).toEqual(['druga', 'c']);
  });

  it('odczyt z ramki podmienia chwilę uczestnika albo go dopisuje', () => {
    const before = [{ pilotId: 'MZI', lastReadAt: '2026-10-02T07:00:00Z' }];
    expect(withRead(before, 'MZI', '2026-10-02T07:41:00Z')).toEqual([{ pilotId: 'MZI', lastReadAt: '2026-10-02T07:41:00Z' }]);
    expect(withRead(before, 'AKO', '2026-10-02T07:40:00Z')).toHaveLength(2);
  });

  it('pierwsza strona bez wcześniejszego stanu - wprost z serwera', () => {
    const next = { beforeAt: '2026-10-01T19:00:00Z', beforeId: 'x' };
    const state = withFirstPage(undefined, page({ messages: [m('a', '2026-10-02T10:00:00Z')], next }));
    expect([state.messages.length, state.next]).toEqual([1, next]);
  });

  it('odświeżenie pierwszej strony NIE odcina dociągniętych starszych stron', () => {
    const olderCursor = { beforeAt: '2026-09-30T08:00:00Z', beforeId: 'o1' };
    const firstCursor = { beforeAt: '2026-10-01T19:00:00Z', beforeId: 'f1' };
    let state = withFirstPage(undefined, page({ messages: [m('f1', '2026-10-01T19:00:00Z')], next: firstCursor }));
    state = withOlderPage(state, { messages: [m('o1', '2026-09-30T08:00:00Z')], next: olderCursor });
    // Łącze wróciło - ta sama pierwsza strona plus nowa wiadomość.
    state = withFirstPage(state, page({ messages: [m('f1', '2026-10-01T19:00:00Z'), m('n1', '2026-10-02T07:31:00Z')], next: firstCursor }));
    expect(state.messages.map((x) => x.id).sort()).toEqual(['f1', 'n1', 'o1']);
    expect(state.next).toEqual(olderCursor);
  });

  it('bez dociągniętych starszych stron kursor idzie z nowej pierwszej strony; stan rozmowy też', () => {
    const cursor = { beforeAt: '2026-10-01T19:00:00Z', beforeId: 'f1' };
    const state = withFirstPage(
      withFirstPage(undefined, page({ messages: [m('f1', '2026-10-01T19:00:00Z')] })),
      page({ closed: 'thread_closed', messages: [m('f1', '2026-10-01T19:00:00Z')], next: cursor }),
    );
    expect([state.next, state.closed]).toEqual([cursor, 'thread_closed']);
  });
});
