/**
 * Ninerdeck (serwer) - TRASY zleceń, rozmów i grup (4.0.0, issue #245; `docs/zlecenia.md`
 * §13, §13.1).
 *
 * Reguły zleceń mają testy na poziomie komend (`orderCommands`, `orderEdit`,
 * `orderResponses`, `orderThreads`, `memberGroups`) - tu sprawdzamy to, co dokłada
 * warstwa HTTP: bramy obu powierzchni, odmowy przełożone na kody, KSZTAŁT PER WIDZ
 * (adresat nie dostaje nic o innych adresatach, kolizja pokazuje cudzy termin tak, jak
 * widzi go pytający) i nagłówek CSRF panelu. Telefon i panel rejestrują jedną tablicę
 * punktów końcowych, więc scenariusze wspólne jadą w pętli po prefiksach.
 */

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';
import { grant, login, panel, panelSession, phone, type Send } from './routeClients.ts';

const H = 3_600_000;
/** Termin zleceń: środa 24 czerwca 2026, 10:00-12:00 UTC (zegar świata: poniedziałek 08:00). */
const STARTS = Date.UTC(2026, 5, 24, 10, 0, 0);
const iso = (t: number): string => new Date(t).toISOString();

function draft(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'o-1',
    aircraftId: 'SP-AXA',
    startsAt: iso(STARTS),
    endsAt: iso(STARTS + 2 * H),
    operation: 'przelot',
    fromIcao: 'EPKK',
    toIcao: 'EPWA',
    note: 'lot zlecony',
    seats: { pic: 'sought', dual: 'none' },
    audience: { kind: 'per_seat', pic: { pilotIds: ['PWI', 'KRZ'], groupIds: [] }, dual: null },
    ...over,
  };
}

describe('trasy zleceń - telefon', () => {
  it('zlecający zakłada zlecenie; powtórka tym samym uuidem wraca 200 z tym samym zleceniem', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));

    const created = await ako('POST', '/orders', draft());
    expect(created.statusCode, created.body).toBe(201);
    const card = created.json();
    expect(card.order).toMatchObject({ id: 'o-1', status: 'open', revision: 1, createdBy: 'AKO', addressing: 'per_seat' });
    expect(card.booking).toMatchObject({ aircraftId: 'SP-AXA', pilotId: null, dualId: null, note: 'lot zlecony' });
    expect(card.day.date).toBe('2026-06-24');
    // Prowadzący widzi adresowanie i listę - to jego karta (32).
    expect(card.viewer.leads).toBe(true);
    expect(typeof card.order.audienceLabel).toBe('string');
    expect((card.recipients as { pilotId: string }[]).map((r) => r.pilotId).sort()).toEqual(['KRZ', 'PWI']);

    // Ponowione żądanie (słabe łącze): `200`, bo nic nie powstało, i to samo zlecenie.
    const again = await ako('POST', '/orders', draft());
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().order.id).toBe('o-1');
    const { rows } = await h.db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM flight_orders`);
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('adresat nie dostaje NIC o innych adresatach - ani listy, ani etykiety adresowania (§13.1)', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const pwi = phone(h.app, await login(h.app, 'PWI'));
    const jse = phone(h.app, await login(h.app, 'JSE'));
    expect((await ako('POST', '/orders', draft())).statusCode).toBe(201);

    const card = await pwi('GET', '/orders/o-1');
    expect(card.statusCode, card.body).toBe(200);
    expect(card.json().viewer.leads).toBe(false);
    expect(card.json().viewer.recipient).toMatchObject({ seat: 'pic', answer: null, inPlay: true });
    expect(card.json().recipients).toBeNull();
    expect(card.json().history).toBeNull();
    expect(card.json().order.audienceLabel).toBeUndefined();
    // Drugi adresat nie pada nigdzie - ani kodem, ani nazwiskiem.
    expect(card.body).not.toContain('KRZ');
    expect(card.body).not.toContain('Zieliński');

    const inbox = await pwi('GET', '/orders');
    expect(inbox.statusCode).toBe(200);
    expect((inbox.json().items as { order: { id: string } }[]).map((i) => i.order.id)).toEqual(['o-1']);
    expect(inbox.json().items[0].progress).toBeNull();
    expect(inbox.body).not.toContain('KRZ');

    // Rozmowy innego adresata też nie ma - dla PWI jest nieistniejąca, nie „zabroniona".
    expect((await pwi('GET', '/orders/o-1/threads/KRZ/messages')).statusCode).toBe(404);
    // „Zlecone" nie istnieje dla kogoś, kto nie zleca i nie prowadzi.
    expect((await pwi('GET', '/orders?box=managed')).statusCode).toBe(403);
    // Członek klubu spoza adresatów: zlecenia nie ma.
    expect((await jse('GET', '/orders/o-1')).statusCode).toBe(404);
  });

  it('bez „Zlecania lotów" nie ma wysyłania ani grup; bez tokenu - 401; zły kształt - 400', async () => {
    const h = await testHarness();
    const pwi = phone(h.app, await login(h.app, 'PWI'));
    const refused = await pwi('POST', '/orders', draft());
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: 'not_leader' });
    expect((await pwi('GET', '/groups')).statusCode).toBe(403);

    expect((await h.app.inject({ method: 'GET', url: '/orders' })).statusCode).toBe(401);
    const ako = phone(h.app, await login(h.app, 'AKO'));
    expect((await ako('POST', '/orders', { ...draft(), seats: { pic: 'nikt' } })).statusCode).toBe(400);
    expect((await ako('GET', '/orders?box=wszystko')).statusCode).toBe(400);
    expect((await ako('GET', '/orders/nie-ma')).statusCode).toBe(404);
  });

  it('imiennie, JEDYNY adresat fotela: „tak" obsadza fotel od razu (§4.3)', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const pwi = phone(h.app, await login(h.app, 'PWI'));
    const only = { kind: 'per_seat', pic: { pilotIds: ['PWI'], groupIds: [] }, dual: null };
    expect((await ako('POST', '/orders', draft({ audience: only }))).statusCode).toBe(201);

    const yes = await pwi('POST', '/orders/o-1/answer', { answer: 'yes' });
    expect(yes.statusCode, yes.body).toBe(200);
    expect(yes.json().outcome).toEqual({ kind: 'assigned', seat: 'pic' });
    expect(yes.json().card.booking.pilotId).toBe('PWI');
    expect(yes.json().card.viewer.recipient.assignedSeat).toBe('pic');
    expect(yes.json().card.order.status).toBe('filled');
  });

  it('zgłoszenia i przydział: odmowy mają kody, „tak" na zajęty fotel jest odpowiedzią 200', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const krz = phone(h.app, await login(h.app, 'KRZ'));
    const jse = phone(h.app, await login(h.app, 'JSE'));
    // Kilka osób na jeden fotel - „tak" jest ZGŁOSZENIEM, fotel wybiera prowadzący.
    const list = { kind: 'per_seat', pic: { pilotIds: ['KRZ', 'JSE'], groupIds: [] }, dual: null };
    expect((await ako('POST', '/orders', draft({ audience: list }))).statusCode).toBe(201);

    const volunteered = await krz('POST', '/orders/o-1/answer', { answer: 'yes' });
    expect(volunteered.statusCode, volunteered.body).toBe(200);
    expect(volunteered.json().outcome).toEqual({ kind: 'volunteered' });
    expect(volunteered.json().card.booking.pilotId).toBeNull();

    // Adresat nie prowadzi zlecenia.
    const notLeader = await krz('POST', '/orders/o-1/assign', { pilotId: 'KRZ', seat: 'pic' });
    expect(notLeader.statusCode).toBe(403);
    expect(notLeader.json()).toEqual({ error: 'not_leader' });
    // Przydział bez zgłoszenia - odmowa stanem.
    const notVolunteered = await ako('POST', '/orders/o-1/assign', { pilotId: 'JSE', seat: 'pic' });
    expect(notVolunteered.statusCode).toBe(409);
    expect(notVolunteered.json()).toEqual({ error: 'not_volunteered' });

    const assigned = await ako('POST', '/orders/o-1/assign', { pilotId: 'KRZ', seat: 'pic' });
    expect(assigned.statusCode, assigned.body).toBe(200);
    expect(assigned.json().booking.pilotId).toBe('KRZ');
    // „Tak" na fotel, który zdążył zająć ktoś inny, to stan zlecenia, nie awaria (§20 Z3).
    const late = await jse('POST', '/orders/o-1/answer', { answer: 'yes' });
    expect(late.statusCode, late.body).toBe(200);
    expect(late.json().outcome).toEqual({ kind: 'seat_filled' });

    const unassigned = await ako('POST', '/orders/o-1/unassign', { seat: 'pic' });
    expect(unassigned.statusCode, unassigned.body).toBe(200);
    expect(unassigned.json().booking.pilotId).toBeNull();
    // Rezygnacja kogoś, kto w fotelu już nie siedzi - odmowa stanem.
    const withdraw = await krz('POST', '/orders/o-1/withdraw', {});
    expect(withdraw.statusCode).toBe(409);
    expect(withdraw.json()).toEqual({ error: 'not_assigned' });
  });

  it('odwołanie oddaje kartę ze stanem; drugie odwołanie to odmowa stanem', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    expect((await ako('POST', '/orders', draft())).statusCode).toBe(201);

    const cancelled = await ako('POST', '/orders/o-1/cancel', { reason: 'pogoda' });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(cancelled.json().order).toMatchObject({ status: 'cancelled', closeReason: 'pogoda', closedBy: 'AKO' });
    const twice = await ako('POST', '/orders/o-1/cancel', {});
    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toEqual({ error: 'order_closed' });
  });

  it('rozmowa: wiadomość, powtórka, strona z kursorem PARĄ, odczyt', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const pwi = phone(h.app, await login(h.app, 'PWI'));
    const krz = phone(h.app, await login(h.app, 'KRZ'));
    expect((await ako('POST', '/orders', draft())).statusCode).toBe(201);

    const first = await ako('POST', '/orders/o-1/threads/PWI/messages', { id: 'm-1', body: 'Dasz radę w środę?' });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().message).toMatchObject({ id: 'm-1', authorId: 'AKO', body: 'Dasz radę w środę?' });
    // Ponowione żądanie tym samym uuidem - ta sama wiadomość, bez drugiego wiersza.
    expect((await ako('POST', '/orders/o-1/threads/PWI/messages', { id: 'm-1', body: 'Dasz radę w środę?' })).statusCode).toBe(200);
    h.clock.advance(60_000);
    expect((await pwi('POST', '/orders/o-1/threads/PWI/messages', { id: 'm-2', body: 'Tak.' })).statusCode).toBe(201);
    // Pusta po obcięciu spacji - odmowa treścią.
    const blank = await pwi('POST', '/orders/o-1/threads/PWI/messages', { id: 'm-3', body: '   ' });
    expect(blank.statusCode).toBe(400);
    expect(blank.json()).toEqual({ error: 'message_invalid' });
    // Kanał klubu dostaje ramkę wiadomości (rozsyłanie w Z-E) - jeden sygnał na zapis.
    expect(h.live.signals.filter((s) => s.kind === 'message')).toHaveLength(2);

    const page1 = await pwi('GET', '/orders/o-1/threads/PWI/messages?limit=1');
    expect(page1.statusCode, page1.body).toBe(200);
    expect(page1.json().role).toBe('participant');
    expect(page1.json().messages).toHaveLength(1);
    const next = page1.json().next as { beforeAt: string; beforeId: string };
    expect(next).not.toBeNull();
    const page2 = await pwi(
      'GET',
      `/orders/o-1/threads/PWI/messages?limit=1&beforeAt=${encodeURIComponent(next.beforeAt)}&beforeId=${next.beforeId}`,
    );
    expect(page2.statusCode, page2.body).toBe(200);
    expect(page2.json().next).toBeNull();
    const ids = [...page1.json().messages, ...page2.json().messages].map((m: { id: string }) => m.id).sort();
    expect(ids).toEqual(['m-1', 'm-2']);
    // Połowa kursora to błąd żądania, nie „od początku".
    expect((await pwi('GET', `/orders/o-1/threads/PWI/messages?beforeId=${next.beforeId}`)).statusCode).toBe(400);

    expect((await pwi('POST', '/orders/o-1/threads/PWI/read')).statusCode).toBe(204);
    // Cudza rozmowa (KRZ pisze do wątku PWI): nie istnieje.
    expect((await krz('POST', '/orders/o-1/threads/PWI/messages', { id: 'm-4', body: 'hej' })).statusCode).toBe(404);
    expect((await krz('POST', '/orders/o-1/threads/PWI/read')).statusCode).toBe(404);
  });
});

describe('kolizja terminu - cudzy termin w kształcie PYTAJĄCEGO, na obu powierzchniach', () => {
  it('409 slot_taken niesie zajętość i wiek; notatkę cudzej rezerwacji widzi wyłącznie akceptujący', async () => {
    const h = await testHarness();
    const krz = phone(h.app, await login(h.app, 'KRZ'));
    const booked = await krz('POST', '/bookings', {
      id: 'b-krz',
      aircraftId: 'SP-AXA',
      startsAt: iso(STARTS),
      endsAt: iso(STARTS + 2 * H),
      operation: 'skoki',
      note: 'notatka KRZ',
    });
    expect(booked.statusCode, booked.body).toBe(201);

    // JSE zleca loty, ale cudzych terminów w komplecie nie ogląda.
    await grant(h, 'JSE', 'orders.create');
    const surfaces: [string, Send][] = [
      ['telefon', phone(h.app, await login(h.app, 'JSE'))],
      ['panel', panel(h.app, await panelSession(h.app, 'JSE'))],
    ];
    for (const [label, send] of surfaces) {
      const res = await send('POST', '/orders', draft());
      expect(res.statusCode, `${label}: ${res.body}`).toBe(409);
      expect(res.json().error, label).toBe('slot_taken');
      expect(res.json().taken, label).toMatchObject({ id: 'b-krz', pilotId: 'KRZ' });
      expect(res.json().taken.note, label).toBeUndefined();
      expect(Number.isFinite(Date.parse(res.json().takenAt)), label).toBe(true);
    }

    // Akceptujący (komplet administratora) widzi ten sam termin w całości.
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const full = await ako('POST', '/orders', draft());
    expect(full.statusCode).toBe(409);
    expect(full.json().taken.note).toBe('notatka KRZ');
  });
});

describe('trasy zleceń - panel', () => {
  it('te same punkty pod /admin/api; zapis bez nagłówka CSRF odbija się, zanim dotknie zlecenia', async () => {
    const h = await testHarness();
    const session = await panelSession(h.app, 'AKO');
    const ako = panel(h.app, session);

    const { 'x-ninerdeck-admin': _csrf, ...cookieOnly } = session;
    const noCsrf = await h.app.inject({ method: 'POST', url: '/admin/api/orders', headers: cookieOnly, payload: draft() });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json()).toEqual({ error: 'csrf_header_required' });
    const { rows } = await h.db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM flight_orders`);
    expect(Number(rows[0]!.n)).toBe(0);

    const created = await ako('POST', '/orders', draft());
    expect(created.statusCode, created.body).toBe(201);
    expect((await ako('GET', '/orders?box=managed')).json().items).toHaveLength(1);
    const summary = await ako('GET', '/orders/summary');
    expect(summary.json()).toEqual({ awaitingAnswer: 0, seekingCrew: 1, canCreate: true, canManage: true });

    // Członek z pustym zakresem (panel dla wszystkich, #216): „Do mnie" i własna karta adresata.
    const pwi = panel(h.app, await panelSession(h.app, 'PWI'));
    const inbox = await pwi('GET', '/orders');
    expect(inbox.statusCode, inbox.body).toBe(200);
    expect(inbox.json().items).toHaveLength(1);
    const card = await pwi('GET', '/orders/o-1');
    expect(card.json().viewer.leads).toBe(false);
    expect(card.json().recipients).toBeNull();
    expect((await pwi('POST', '/orders/o-1/seen')).statusCode).toBe(204);
  });

  it('grupy: zapis z „Zarządzaniem kontami", odczyt z podglądem klubu albo zlecaniem lotów', async () => {
    const h = await testHarness();
    const ako = panel(h.app, await panelSession(h.app, 'AKO'));

    const created = await ako('POST', '/groups', { id: 'g-1', name: 'Instruktorzy', memberIds: ['PWI', 'KRZ'] });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ id: 'g-1', name: 'Instruktorzy', memberIds: ['KRZ', 'PWI'] });
    // Powtórka tym samym uuidem - `200`, ta sama grupa.
    expect((await ako('POST', '/groups', { id: 'g-1', name: 'Instruktorzy', memberIds: [] })).statusCode).toBe(200);
    const taken = await ako('POST', '/groups', { id: 'g-2', name: 'INSTRUKTORZY', memberIds: [] });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'name_taken' });

    const renamed = await ako('PATCH', '/groups/g-1', { name: 'Instruktorzy An-2' });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(renamed.json().name).toBe('Instruktorzy An-2');
    expect((await ako('PATCH', '/groups/nie-ma', { name: 'X' })).statusCode).toBe(404);

    // Pilot bez podglądu klubu i bez zlecania: grup nie ogląda ani nie zmienia.
    const pwi = panel(h.app, await panelSession(h.app, 'PWI'));
    expect((await pwi('GET', '/groups')).statusCode).toBe(403);
    expect((await pwi('POST', '/groups', { id: 'g-3', name: 'Moja', memberIds: [] })).statusCode).toBe(403);
    // Instruktor ze „Zlecaniem lotów" wybiera z nich adresatów - w panelu i w telefonie.
    await grant(h, 'JSE', 'orders.create');
    const jsePanel = await panel(h.app, await panelSession(h.app, 'JSE'))('GET', '/groups');
    expect(jsePanel.statusCode, jsePanel.body).toBe(200);
    expect((jsePanel.json().groups as { id: string }[]).map((g) => g.id)).toEqual(['g-1']);
    const jsePhone = await phone(h.app, await login(h.app, 'JSE'))('GET', '/groups');
    expect(jsePhone.statusCode).toBe(200);

    expect((await ako('DELETE', '/groups/g-1')).statusCode).toBe(204);
    expect((await ako('DELETE', '/groups/g-1')).statusCode).toBe(404);
  });
});
