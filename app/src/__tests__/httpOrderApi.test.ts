/**
 * Ninerdeck - testy ADAPTERA HTTP ZLECEŃ (`infrastructure/api/httpOrderApi.ts`; 4.0.0,
 * epik Z-C #247).
 *
 * Pod obserwacją: ścieżki i ciała żądań (kontrakt z `orderEndpoints.ts` serwera), odmowa
 * zapisu jako WYNIK z treścią (`slot_taken` z kolizją), `401` i odpowiedź bez kodu jako
 * WYJĄTEK (inaczej `authorizedFetch` nie odświeżyłby tokenu, a awaria wyglądałaby jak
 * odmowa reguły), wynik odpowiedzi adresata z kartą obok, strona rozmowy z kursorem parą
 * i awaria sieci jako wyjątek transportu.
 */

import { ServerRejectedError, ServerUnreachableError } from '../application/ports';
import type { RemoteOrderCard } from '../application/ports';
import { HttpOrderApi } from '../infrastructure/api/httpOrderApi';
import { HttpTransport } from '../infrastructure/api/httpTransport';

const BASE = 'https://app.test';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const empty = (status: number): Response => new Response(null, { status });

const CARD: RemoteOrderCard = {
  timezone: 'Europe/Warsaw',
  day: { date: '2026-10-03', startsAt: '2026-10-02T22:00:00.000Z', endsAt: '2026-10-03T22:00:00.000Z' },
  order: {
    id: 'o1',
    status: 'open',
    revision: 1,
    createdBy: 'p9',
    seats: { pic: 'sought', dual: 'self' },
    addressing: 'per_seat',
    editedAt: null,
    createdAt: '2026-10-01T16:40:00.000Z',
    closedAt: null,
    closedBy: null,
    closeReason: null,
  },
  booking: {
    id: 'b1',
    aircraftId: 'a1',
    status: 'confirmed',
    startsAt: '2026-10-03T07:00:00.000Z',
    endsAt: '2026-10-03T11:00:00.000Z',
    operation: 'ferry',
    fromIcao: 'EPKK',
    toIcao: 'EPRZ',
    plannedAirMin: 90,
    plannedFuelL: null,
    note: null,
    pilotId: null,
    dualId: 'p9',
  },
  viewer: { leads: false, recipient: null },
  lastEdit: null,
  lastTermChange: null,
  myConflicts: [],
  recipients: null,
  history: null,
};

/** Zaprogramowane odpowiedzi `fetch` po kolei; każde wywołanie trafia do `calls`. */
function harness(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    calls.push({
      url: String(input),
      method: String(init?.method),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body == null ? undefined : JSON.parse(String(init.body)),
    });
    const next = responses.shift();
    if (next == null) throw new Error('test: brak zaprogramowanej odpowiedzi');
    if (next instanceof Error) throw next;
    return next;
  });
  return { api: new HttpOrderApi(new HttpTransport(BASE, 'Android 14 · Pixel 7')), calls };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('odczyty', () => {
  it('licznik, połowy listy, karta i grupy - ścieżki z kontraktu serwera, pod tokenem', async () => {
    const { api, calls } = harness([
      json(200, { awaitingAnswer: 2, seekingCrew: 1, canCreate: true, canManage: false }),
      json(200, { timezone: 'Europe/Warsaw', items: [] }),
      json(200, CARD),
      json(200, { groups: [{ id: 'g1', name: 'Piloci An-2', memberIds: ['p1'], createdAt: 'x', updatedAt: 'y' }] }),
    ]);

    expect(await api.getOrderSummary('jwt')).toEqual({ awaitingAnswer: 2, seekingCrew: 1, canCreate: true, canManage: false });
    expect(await api.getOrders('jwt', 'managed')).toEqual({ timezone: 'Europe/Warsaw', items: [] });
    expect(await api.getOrder('jwt', 'o/1')).toEqual(CARD);
    expect(await api.getGroups('jwt')).toEqual([{ id: 'g1', name: 'Piloci An-2', memberIds: ['p1'], createdAt: 'x', updatedAt: 'y' }]);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${BASE}/orders/summary`,
      `GET ${BASE}/orders?box=managed`,
      `GET ${BASE}/orders/o%2F1`,
      `GET ${BASE}/groups`,
    ]);
    expect(calls[0]!.headers).toMatchObject({ authorization: 'Bearer jwt', 'x-ninerdeck-device': 'Android 14 · Pixel 7' });
  });

  it('odmowa odczytu to wyjątek z kodem - `authorizedFetch` zwinie go do „nie wiem"', async () => {
    const { api } = harness([json(403, { error: 'forbidden' })]);
    await expect(api.getOrders('jwt', 'managed')).rejects.toEqual(new ServerRejectedError(403, 'forbidden'));
  });

  it('awaria sieci to wyjątek transportu, nie odmowa', async () => {
    const { api } = harness([new TypeError('Network request failed')]);
    await expect(api.getOrderSummary('jwt')).rejects.toBeInstanceOf(ServerUnreachableError);
  });

  it('strona rozmowy: kursor PARĄ w adresie, bez kursora - sama ścieżka', async () => {
    const page = { role: 'participant', closed: null, threadId: 't1', participants: [], messages: [], next: null };
    const { api, calls } = harness([json(200, page), json(200, page)]);

    await api.getThread('jwt', 'o1', 'p2');
    await api.getThread('jwt', 'o1', 'p2', {
      limit: 50,
      before: { beforeAt: '2026-10-02T21:40:00.000Z', beforeId: 'm9' },
    });
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/orders/o1/threads/p2/messages`,
      `${BASE}/orders/o1/threads/p2/messages?limit=50&beforeAt=2026-10-02T21%3A40%3A00.000Z&beforeId=m9`,
    ]);
  });
});

describe('zapisy zlecenia', () => {
  it('nowe zlecenie: ciało szkicu idzie w całości, sukces niesie świeżą kartę', async () => {
    const { api, calls } = harness([json(201, CARD)]);
    const draft = {
      id: 'o1',
      aircraftId: 'a1',
      startsAt: '2026-10-03T07:00:00.000Z',
      endsAt: '2026-10-03T11:00:00.000Z',
      operation: 'ferry',
      seats: { pic: 'sought' as const, dual: 'self' as const },
      audience: { kind: 'per_seat' as const, pic: { pilotIds: ['p1'], groupIds: [] }, dual: null },
    };

    expect(await api.createOrder('jwt', draft)).toEqual({ ok: true, card: CARD });
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${BASE}/orders`, body: draft });
    expect(calls[0]!.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer jwt' });
  });

  it('odmowa reguły to WYNIK - przy `slot_taken` z kolidującą zajętością i chwilą jej powstania', async () => {
    const taken = {
      id: 'b7',
      aircraftId: 'a1',
      kind: 'flight',
      status: 'confirmed',
      startsAt: '2026-10-03T08:00:00.000Z',
      endsAt: '2026-10-03T09:00:00.000Z',
      pilotId: 'p5',
      blockReason: null,
      order: null,
    };
    const { api } = harness([
      json(409, { error: 'slot_taken', taken, takenAt: '2026-10-01T16:37:00.000Z' }),
      json(400, { error: 'dual_required' }),
    ]);

    expect(await api.patchOrder('jwt', 'o1', { startsAt: '2026-10-03T08:00:00.000Z' })).toEqual({
      ok: false,
      refusal: 'slot_taken',
      taken,
      takenAt: Date.parse('2026-10-01T16:37:00.000Z'),
    });
    expect(await api.patchOrder('jwt', 'o1', { seats: { pic: 'sought', dual: 'none' } })).toEqual({
      ok: false,
      refusal: 'dual_required',
      taken: null,
      takenAt: null,
    });
  });

  it('`401` i odpowiedź bez kodu to WYJĄTEK - wygasły token nie udaje odmowy reguły', async () => {
    const { api } = harness([
      json(401, { error: 'unauthorized' }),
      new Response('<html>502</html>', { status: 502 }),
      json(200, { cos: 'innego' }),
    ]);

    await expect(api.cancelOrder('jwt', 'o1', null)).rejects.toEqual(new ServerRejectedError(401, 'unauthorized'));
    await expect(api.cancelOrder('jwt', 'o1', null)).rejects.toEqual(new ServerRejectedError(502, 'http_502'));
    // Sukces bez karty też nie jest wynikiem, który ekran umie pokazać.
    await expect(api.cancelOrder('jwt', 'o1', null)).rejects.toEqual(new ServerRejectedError(200, 'http_200'));
  });

  it('powód opcjonalny: bez niego ciało jest puste, z nim - jedno pole', async () => {
    const { api, calls } = harness([json(200, CARD), json(200, CARD), json(200, CARD), json(200, CARD), json(200, CARD)]);

    await api.cancelOrder('jwt', 'o1', null);
    await api.cancelOrder('jwt', 'o1', 'Maszyna idzie do serwisu.');
    await api.unassignOrderSeat('jwt', 'o1', { seat: 'dual', reason: null });
    await api.withdrawFromOrder('jwt', 'o1', 'Mam dyżur.');
    await api.assignOrderSeat('jwt', 'o1', { pilotId: 'p2', seat: 'pic' });

    expect(calls.map((c) => [c.method, c.url.slice(BASE.length), c.body])).toEqual([
      ['POST', '/orders/o1/cancel', {}],
      ['POST', '/orders/o1/cancel', { reason: 'Maszyna idzie do serwisu.' }],
      ['POST', '/orders/o1/unassign', { seat: 'dual' }],
      ['POST', '/orders/o1/withdraw', { reason: 'Mam dyżur.' }],
      ['POST', '/orders/o1/assign', { pilotId: 'p2', seat: 'pic' }],
    ]);
  });
});

describe('adresat', () => {
  it('odpowiedź: wynik o stanie z kartą obok - także „fotel już zajęty" jest wynikiem, nie błędem', async () => {
    const { api, calls } = harness([
      json(200, { outcome: { kind: 'seat_filled' }, card: CARD }),
      json(200, { outcome: { kind: 'declined' }, card: null }),
    ]);

    expect(await api.answerOrder('jwt', 'o1', { answer: 'yes', reason: null })).toEqual({
      ok: true,
      outcome: { kind: 'seat_filled' },
      card: CARD,
    });
    expect(await api.answerOrder('jwt', 'o1', { answer: 'no', reason: 'Mam dyżur.' })).toEqual({
      ok: true,
      outcome: { kind: 'declined' },
      card: null,
    });
    expect(calls.map((c) => c.body)).toEqual([{ answer: 'yes' }, { answer: 'no', reason: 'Mam dyżur.' }]);
  });

  it('odmowa odpowiedzi to wynik z kodem, `401` - wyjątek', async () => {
    const { api } = harness([json(403, { error: 'not_recipient' }), json(401, { error: 'unauthorized' })]);
    expect(await api.answerOrder('jwt', 'o1', { answer: 'yes', reason: null })).toEqual({
      ok: false,
      refusal: 'not_recipient',
    });
    await expect(api.answerOrder('jwt', 'o1', { answer: 'yes', reason: null })).rejects.toBeInstanceOf(ServerRejectedError);
  });

  it('odczyt karty: `204` przechodzi, odmowa jest wyjątkiem', async () => {
    const { api, calls } = harness([empty(204), json(403, { error: 'not_recipient' })]);
    await expect(api.markOrderSeen('jwt', 'o1')).resolves.toBeUndefined();
    await expect(api.markOrderSeen('jwt', 'o1')).rejects.toEqual(new ServerRejectedError(403, 'not_recipient'));
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${BASE}/orders/o1/seen`, body: undefined });
  });
});

describe('rozmowa', () => {
  it('wiadomość: zapisana wraca w kształcie REST, zamknięta rozmowa jest odmową z kodem', async () => {
    const message = { id: 'm1', authorId: 'p2', body: 'Mogę od 10.', createdAt: '2026-10-02T21:40:00.000Z' };
    const { api, calls } = harness([json(201, { message }), json(409, { error: 'thread_closed' })]);

    expect(await api.sendThreadMessage('jwt', 'o1', 'p2', { id: 'm1', body: 'Mogę od 10.' })).toEqual({ ok: true, message });
    expect(await api.sendThreadMessage('jwt', 'o1', 'p2', { id: 'm2', body: 'Halo?' })).toEqual({
      ok: false,
      refusal: 'thread_closed',
    });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/orders/o1/threads/p2/messages`,
      body: { id: 'm1', body: 'Mogę od 10.' },
    });
  });

  it('odczyt rozmowy: `204` przechodzi', async () => {
    const { api, calls } = harness([empty(204)]);
    await expect(api.markThreadRead('jwt', 'o1', 'p2')).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${BASE}/orders/o1/threads/p2/read` });
  });
});
