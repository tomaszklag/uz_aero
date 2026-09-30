/**
 * Ninerdeck (serwer) - ROZDZIELNIK POWIADOMIEŃ: ramka albo push (4.0.0,
 * `docs/kanal-klubu.md` K4; epik Z-E #246).
 *
 * Wiadomość w skrzynce idzie po commicie DWIEMA drogami i nigdy obiema do jednego
 * urządzenia: połączenia osoby W KLUBIE WIADOMOŚCI dostają ramkę `notification`, a push -
 * wyłącznie urządzenia, których sesja logowania nie jest połączona w tym klubie.
 * Scenariusze idą prawdziwymi trasami (rezerwacja z prośbą o zgodę, rozmowa zlecenia) na
 * prawdziwej bazie i prawdziwym rejestrze połączeń; atrapą jest wyłącznie dostawca push.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { NotificationDraft } from '../src/application/common/notify/bookingNotices.ts';
import { Notifier } from '../src/application/common/notify/notifier.ts';
import type { ClubSettingsPort, LiveFrame } from '../src/application/common/ports.ts';
import { LiveRegistry } from '../src/infrastructure/live/liveRegistry.ts';
import { PgNotificationsRepo } from '../src/infrastructure/pg/common/notificationsRepo.ts';
import { PgPushTokensRepo } from '../src/infrastructure/pg/common/pushTokensRepo.ts';
import { FakePush } from './fakePush.ts';
import { testHarness } from './helpers.ts';
import { connectLive, sendFrame, type Frame } from './liveClients.ts';
import { bearer, grant, login, panelSession, type Harness } from './routeClients.ts';
import { ORG_A, ORG_B } from './testWorld.ts';

const TERAZ = Date.UTC(2026, 5, 22, 8, 0, 0);
const JUTRO = TERAZ + 86_400_000;
const H = 3_600_000;
const iso = (t: number): string => new Date(t).toISOString();

let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${(seq += 1)}`;

const itemOf = (frame: Frame) => frame.item as { id: string; kind: string };

/** Jedyna osoba kroku „Mechanik" - każda rezerwacja kogoś innego prosi ją o zgodę. */
async function withApprover(pilotId: string): Promise<Harness> {
  const h = await testHarness();
  await grant(h, pilotId, 'reservations.approve');
  const admin = await panelSession(h.app, 'AKO');
  const res = await h.app.inject({
    method: 'PUT',
    url: '/admin/api/approval-steps',
    headers: admin,
    payload: { steps: [{ label: 'Mechanik', memberIds: [pilotId] }] },
  });
  expect(res.statusCode, res.body).toBe(200);
  return h;
}

/** Rezerwacja na jutro - rodzi prośbę o zgodę do osoby kroku. */
async function book(h: Harness, who: string): Promise<void> {
  const token = await login(h.app, who);
  const res = await h.app.inject({
    method: 'POST',
    url: '/bookings',
    headers: bearer(token),
    payload: {
      id: nextId('rez'),
      aircraftId: 'SP-AXA',
      startsAt: iso(JUTRO + 8 * H),
      endsAt: iso(JUTRO + 10 * H),
      operation: 'skoki',
    },
  });
  expect(res.statusCode, res.body).toBe(201);
}

/** Token push przypięty do sesji logowania, którą niesie `token` - tak jak robi to telefon. */
async function registerDevice(h: Harness, token: string, device: string): Promise<void> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/me/push-token',
    headers: bearer(token),
    payload: { token: device },
  });
  expect(res.statusCode, res.body).toBe(204);
}

async function phoneLive(h: Harness, token: string) {
  const { ws, inbox } = await connectLive(h.app, '/live');
  sendFrame(ws, { type: 'auth', token });
  await inbox.waitFor((f) => f.type === 'hello');
  return { ws, inbox };
}

describe('rozdzielnik powiadomień - ramka albo push (K4)', () => {
  it('sesja połączona w klubie wiadomości dostaje ramkę, a jej urządzenie - żadnego pusha', async () => {
    const h = await withApprover('KRZ');
    const krz = await login(h.app, 'KRZ');
    await registerDevice(h, krz, 'ExponentPushToken[KRZ-telefon]');
    const { ws, inbox } = await phoneLive(h, krz);

    await book(h, 'PWI');
    const frame = await inbox.waitFor((f) => f.type === 'notification');
    expect(frame).toMatchObject({ v: 1, org: ORG_A, unread: 1, item: { kind: 'approval_requested', readAt: null } });
    expect(h.push.to('ExponentPushToken[KRZ-telefon]')).toEqual([]);

    // Ramka niesie DOKŁADNIE to, co odczyt skrzynki - baner i wiersz listy to jedna rzecz.
    const rest = (await h.app.inject({ method: 'GET', url: '/me/notifications', headers: bearer(krz) })).json();
    expect(frame.item).toEqual(rest.items[0]);
    expect(frame.unread).toBe(rest.unread);
    ws.close();
  });

  it('bez połączenia wiadomość idzie pushem, jak przed 4.0.0', async () => {
    const h = await withApprover('KRZ');
    const krz = await login(h.app, 'KRZ');
    await registerDevice(h, krz, 'ExponentPushToken[KRZ-telefon]');

    await book(h, 'PWI');
    const sent = h.push.to('ExponentPushToken[KRZ-telefon]');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.data).toEqual({ kind: 'approval_requested', orgId: ORG_A, bookingId: expect.any(String), aircraftId: 'SP-AXA' });
  });

  it('dwa urządzenia jednej osoby: połączone dostaje ramkę, drugie - push', async () => {
    const h = await withApprover('KRZ');
    const phone = await login(h.app, 'KRZ');
    const tablet = await login(h.app, 'KRZ');
    await registerDevice(h, phone, 'ExponentPushToken[KRZ-telefon]');
    await registerDevice(h, tablet, 'ExponentPushToken[KRZ-tablet]');
    const { ws, inbox } = await phoneLive(h, phone);

    await book(h, 'PWI');
    await inbox.waitFor((f) => f.type === 'notification');
    expect(h.push.to('ExponentPushToken[KRZ-telefon]')).toEqual([]);
    expect(h.push.to('ExponentPushToken[KRZ-tablet]')).toHaveLength(1);
    ws.close();
  });

  it('osoba połączona w INNYM klubie dostaje push, a jej łącze - żadnej ramki', async () => {
    // PWI jest w Alfie i w Becie. Telefon pracuje w Becie; prośba o zgodę przychodzi
    // z Alfy - łącze niesie wyłącznie dane klubu, którym się uwierzytelniło, więc wiadomość
    // idzie pushem, jak w 3.1.0.
    const h = await withApprover('PWI');
    const inAlfa = await login(h.app, 'PWI');
    const switched = await h.app.inject({
      method: 'POST',
      url: '/auth/switch',
      headers: bearer(inAlfa),
      payload: { orgId: ORG_B },
    });
    expect(switched.statusCode, switched.body).toBe(200);
    const inBeta = switched.json().token as string;
    await registerDevice(h, inBeta, 'ExponentPushToken[PWI]');
    const { ws, inbox } = await phoneLive(h, inBeta);

    await book(h, 'JSE');
    expect(h.push.to('ExponentPushToken[PWI]')).toHaveLength(1);

    // Strażnik kolejności: ramka wysłana PO rezerwacji dochodzi, a przed nią nie ma nic -
    // gdyby ramka o wiadomości z Alfy wyszła, przyszłaby pierwsza.
    const sentinel: LiveFrame = { v: 1, type: 'test-sentinel', org: ORG_B };
    expect(h.liveRegistry.sendToPerson(ORG_B, 'PWI', sentinel)).toBe(1);
    await inbox.waitFor((f) => f.type === 'test-sentinel');
    expect(inbox.frames.filter((f) => f.type === 'notification')).toEqual([]);
    ws.close();
  });

  it('rozmowa odświeża jeden wiersz skrzynki - ramka niesie JEGO identyfikator, nie nowy', async () => {
    const h = await testHarness();
    const ako = await login(h.app, 'AKO');
    const orderId = nextId('zl');
    const created = await h.app.inject({
      method: 'POST',
      url: '/orders',
      headers: bearer(ako),
      payload: {
        id: orderId,
        aircraftId: 'SP-AXA',
        startsAt: iso(TERAZ + 10 * 86_400_000),
        endsAt: iso(TERAZ + 10 * 86_400_000 + 2 * H),
        operation: 'przelot',
        note: 'przelot na przegląd',
        seats: { pic: 'sought', dual: 'none' },
        audience: { kind: 'per_seat', pic: { pilotIds: ['PWI'], groupIds: [] }, dual: null },
      },
    });
    expect(created.statusCode, created.body).toBe(201);

    const pwi = await login(h.app, 'PWI');
    const { ws, inbox } = await phoneLive(h, pwi);
    const send = (body: string) =>
      h.app.inject({
        method: 'POST',
        url: `/orders/${orderId}/threads/PWI/messages`,
        headers: bearer(ako),
        payload: { id: nextId('msg'), body },
      });

    expect((await send('Dasz radę o dziewiątej?')).statusCode).toBe(201);
    const first = await inbox.waitFor((f) => f.type === 'notification' && itemOf(f).kind === 'order_message');
    expect((await send('Albo o dziesiątej.')).statusCode).toBe(201);
    const second = await inbox.waitFor(
      (f) => f.type === 'notification' && f !== first && itemOf(f).kind === 'order_message',
    );

    expect(itemOf(second).id).toBe(itemOf(first).id);
    // Jeden nieprzeczytany wiersz na wątek - licznik skrzynki nie rośnie z każdą wiadomością.
    expect(second.unread).toBe(first.unread);
    ws.close();
  });
});

describe('rozdzielnik - zapis i awaria', () => {
  const draft = (pilotId: string): NotificationDraft => ({
    pilotId,
    kind: 'approval_requested',
    payload: { bookingId: 'rez-x', aircraftId: 'SP-AXA' },
    push: { title: 'Prośba o zgodę', body: 'Otwórz skrzynkę.' },
  });

  it('zapis oddaje wyłącznie wiadomości, które trafiły do skrzynki - adresat spoza klubu nie dostaje nic', async () => {
    const h = await testHarness();
    const notifier = new Notifier(
      h.db,
      new PgNotificationsRepo(),
      new PgPushTokensRepo(h.clock),
      new FakePush(),
      new LiveRegistry(),
      { calendar: async () => ({ timezone: 'Europe/Warsaw', homeIcao: null }) },
      randomUUID,
    );
    const at = h.clock.now();
    // BAD należy wyłącznie do Bety - wiadomość z Alfy do niej nie ma wiersza, więc nie ma
    // też o czym dzwonić.
    const recorded = await h.db.transaction((tx) => notifier.record(tx, ORG_A, [draft('KRZ'), draft('BAD')], at));
    expect(recorded.map((n) => n.pilotId)).toEqual(['KRZ']);
    expect(recorded[0]!.createdAt).toBe(at.getTime());
    const { rows } = await h.db.query<{ id: string }>(`SELECT id FROM notifications WHERE pilot_id = 'KRZ'`);
    expect(rows.map((r) => r.id)).toEqual([recorded[0]!.id]);
  });

  it('ramka nie wyszła (awaria odczytu przed wysyłką) - push dzwoni także do połączonego urządzenia', async () => {
    const h = await testHarness();
    const krz = await login(h.app, 'KRZ');
    await registerDevice(h, krz, 'ExponentPushToken[KRZ-telefon]');
    const { rows } = await h.db.query<{ session_id: string }>(
      `SELECT session_id FROM push_tokens WHERE token = 'ExponentPushToken[KRZ-telefon]'`,
    );
    const live = new LiveRegistry();
    const frames: LiveFrame[] = [];
    live.attach(
      { orgId: ORG_A, pilotId: 'KRZ', sessionId: rows[0]!.session_id, surface: 'mobile', capabilities: [] },
      { send: (frame) => frames.push(frame), close: () => undefined },
    );
    const broken: ClubSettingsPort = {
      calendar: async () => {
        throw new Error('baza nie odpowiada');
      },
    };
    const push = new FakePush();
    const notifier = new Notifier(
      h.db,
      new PgNotificationsRepo(),
      new PgPushTokensRepo(h.clock),
      push,
      live,
      broken,
      randomUUID,
    );
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const recorded = await h.db.transaction((tx) => notifier.record(tx, ORG_A, [draft('KRZ')], h.clock.now()));
      await notifier.wake(ORG_A, recorded);
      expect(quiet).toHaveBeenCalled();
    } finally {
      quiet.mockRestore();
    }
    // Dwa sygnały o jednej wiadomości są lepsze niż cisza.
    expect(frames).toEqual([]);
    expect(push.to('ExponentPushToken[KRZ-telefon]')).toHaveLength(1);
  });
});
