/**
 * Ninerdeck (serwer) - KANAŁ KLUBU PRZY ODEBRANIU DOSTĘPU (4.0.0, `docs/kanal-klubu.md`
 * §3.1; epik Z-E #246).
 *
 * Brama sprawdza połączenie raz, przy nawiązaniu. Każda decyzja, która odbiera dostęp
 * w REST, zamyka więc sama połączenia, których dotyczy - ramką `bye` z powodem:
 *  - `session_revoked` - wylogowanie (telefon, panel, własne urządzenie z `#/konto`),
 *    „Wyloguj to urządzenie" i „Wyloguj wszędzie w tym klubie" z karty członka, zmiana
 *    hasła (poza bieżącą sesją) i reset z linku (wszystkie sesje);
 *  - `membership_disabled` - wyłączone członkostwo i wyłączony klub;
 *  - `token_expired` - termin tokenu, którym połączenie otwarto.
 * Zmiana zakresu uprawnień połączenia nie zamyka, tylko przestawia jego zdolności.
 * Połączenia spoza zakresu decyzji zostają otwarte - to jest druga połowa każdego testu.
 */

import { describe, expect, it } from 'vitest';

import { untilExpiry } from '../src/http/routes/common/liveConnection.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { tokenIn } from './fakeMail.ts';
import { panelLive, phoneLive, type LiveInbox } from './liveClients.ts';
import { bearer, login, panelSession, type Harness } from './routeClients.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B } from './testWorld.ts';

/** Nowe hasło przechodzące politykę (12+ znaków, bez nazwiska i adresu osoby). */
const NEW_PASSWORD = 'zielone-pole-szybowcow-7';

/** Sesja logowania z tokenu (claim `sid`) - token krótkiego życia musi wskazać żywą sesję. */
function sidOf(token: string): string {
  const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { sid: string };
  return claims.sid;
}

/** PWI w drugim klubie - przełączenie klubu daje tokeny Bety i drugą sesję. */
async function pwiInBeta(h: Harness) {
  const switched = await h.app.inject({
    method: 'POST',
    url: '/auth/switch',
    headers: bearer(await login(h.app, 'PWI')),
    payload: { orgId: ORG_B },
  });
  expect(switched.statusCode, switched.body).toBe(200);
  return phoneLive(h, 'PWI', switched.json().token as string);
}

async function bye(inbox: LiveInbox): Promise<string> {
  const frame = await inbox.waitFor((f) => f.type === 'bye');
  await inbox.closed;
  return frame.reason as string;
}

/** Połączenie żyje: rejestr wciąż je zna, a pożegnania nie było. */
function stillOpen(h: Harness, orgId: string, pilotId: string, inbox: LiveInbox): void {
  expect(h.liveRegistry.isConnected(orgId, pilotId)).toBe(true);
  expect(inbox.frames.some((f) => f.type === 'bye')).toBe(false);
}

async function adminPanel(h: Harness, who = 'AKO') {
  const session = await panelSession(h.app, who);
  return (method: 'POST' | 'DELETE' | 'PATCH' | 'PUT', url: string, payload?: object) =>
    h.app.inject({ method, url: `/admin/api${url}`, headers: session, ...(payload === undefined ? {} : { payload }) });
}

describe('kanał klubu - wylogowania zamykają połączenie sesji', () => {
  it('„Wyloguj to urządzenie" z karty członka: `bye session_revoked`, inni zostają', async () => {
    const h = await testHarness();
    const pwi = await phoneLive(h, 'PWI');
    const krz = await phoneLive(h, 'KRZ');

    const res = await (await adminPanel(h))('DELETE', `/pilots/PWI/sessions/${pwi.hello.session as string}`);
    expect(res.statusCode, res.body).toBeLessThan(300);
    expect(await bye(pwi.inbox)).toBe('session_revoked');
    stillOpen(h, ORG_A, 'KRZ', krz.inbox);
    krz.ws.close();
  });

  it('„Wyloguj wszędzie w tym klubie": każde urządzenie członka w klubie - i tylko w nim', async () => {
    const h = await testHarness();
    const phone = await phoneLive(h, 'PWI');
    const tablet = await phoneLive(h, 'PWI');
    const beta = await pwiInBeta(h);
    const krz = await phoneLive(h, 'KRZ');

    const res = await (await adminPanel(h))('POST', '/pilots/PWI/sessions/revoke-all');
    expect(res.statusCode, res.body).toBe(200);
    expect(await bye(phone.inbox)).toBe('session_revoked');
    expect(await bye(tablet.inbox)).toBe('session_revoked');
    stillOpen(h, ORG_B, 'PWI', beta.inbox);
    stillOpen(h, ORG_A, 'KRZ', krz.inbox);
    krz.ws.close();
    beta.ws.close();
  });

  it('wylogowanie telefonu (`POST /auth/logout`) zamyka połączenie tego telefonu', async () => {
    const h = await testHarness();
    const signed = await h.app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor('PWI') } });
    const { token, refreshToken } = signed.json() as { token: string; refreshToken: string };
    const phone = await phoneLive(h, 'PWI', token);
    const tablet = await phoneLive(h, 'PWI');

    const res = await h.app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken } });
    expect(res.statusCode, res.body).toBeLessThan(300);
    expect(await bye(phone.inbox)).toBe('session_revoked');
    stillOpen(h, ORG_A, 'PWI', tablet.inbox);
    tablet.ws.close();
  });

  it('własne urządzenie wyłączone z `#/konto` i wylogowanie panelu', async () => {
    const h = await testHarness();
    const phone = await phoneLive(h, 'AKO');
    const session = await panelSession(h.app, 'AKO');
    const panel = await panelLive(h, 'AKO');
    await panel.inbox.waitFor((f) => f.type === 'hello');

    const own = await h.app.inject({
      method: 'DELETE',
      url: `/admin/api/me/sessions/${phone.hello.session as string}`,
      headers: session,
    });
    expect(own.statusCode, own.body).toBeLessThan(300);
    expect(await bye(phone.inbox)).toBe('session_revoked');
    stillOpen(h, ORG_A, 'AKO', panel.inbox);

    const cookie = (await panelSession(h.app, 'AKO')).cookie!;
    const second = await panelLive(h, 'AKO', { cookie });
    await second.inbox.waitFor((f) => f.type === 'hello');
    const out = await h.app.inject({
      method: 'POST',
      url: '/admin/api/auth/logout',
      headers: { cookie, ...ADMIN_CSRF_HEADERS },
    });
    expect(out.statusCode, out.body).toBeLessThan(300);
    expect(await bye(second.inbox)).toBe('session_revoked');
    stillOpen(h, ORG_A, 'AKO', panel.inbox);
    panel.ws.close();
  });
});

describe('kanał klubu - hasło', () => {
  it('zmiana hasła wylogowuje POZOSTAŁE urządzenia - to, z którego ją zrobiono, zostaje', async () => {
    const h = await testHarness();
    const current = await phoneLive(h, 'PWI');
    const other = await phoneLive(h, 'PWI');

    const res = await h.app.inject({
      method: 'PUT',
      url: '/me/password',
      headers: bearer(current.token),
      payload: { next: NEW_PASSWORD },
    });
    expect(res.statusCode, res.body).toBe(204);
    expect(await bye(other.inbox)).toBe('session_revoked');
    stillOpen(h, ORG_A, 'PWI', current.inbox);
    current.ws.close();
  });

  it('reset z linku gasi wszystkie urządzenia osoby - także w drugim klubie', async () => {
    const h = await testHarness();
    const phone = await phoneLive(h, 'PWI');
    const panel = await panelLive(h, 'AKO');
    await panel.inbox.waitFor((f) => f.type === 'hello');
    const beta = await pwiInBeta(h);

    await h.passwords.forgot('piotr@ninerdeck.pl', null);
    const link = tokenIn(h.mail.lastTo('piotr@ninerdeck.pl')!);
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token: link, password: NEW_PASSWORD },
    });
    expect(res.statusCode, res.body).toBe(204);
    expect(await bye(phone.inbox)).toBe('session_revoked');
    expect(await bye(beta.inbox)).toBe('session_revoked');
    stillOpen(h, ORG_A, 'AKO', panel.inbox);
    panel.ws.close();
  });
});

describe('kanał klubu - członkostwo, klub i zakres uprawnień', () => {
  it('wyłączone członkostwo: `bye membership_disabled`; ta sama osoba w innym klubie zostaje', async () => {
    const h = await testHarness();
    const alfa = await phoneLive(h, 'PWI');
    const beta = await pwiInBeta(h);

    const res = await (await adminPanel(h))('POST', '/pilots/PWI/active', { active: false });
    expect(res.statusCode, res.body).toBe(200);
    expect(await bye(alfa.inbox)).toBe('membership_disabled');
    stillOpen(h, ORG_B, 'PWI', beta.inbox);
    beta.ws.close();
  });

  it('wyłączony klub: każde połączenie klubu dostaje `bye membership_disabled`, inne kluby nie', async () => {
    const h = await testHarness();
    const ako = await panelLive(h, 'AKO');
    await ako.inbox.waitFor((f) => f.type === 'hello');
    const pwi = await phoneLive(h, 'PWI');
    const bad = await phoneLive(h, 'BAD');

    const res = await (await adminPanel(h, 'ROOT'))('POST', `/organizations/${ORG_A}/active`, { active: false });
    expect(res.statusCode, res.body).toBe(200);
    expect(await bye(ako.inbox)).toBe('membership_disabled');
    expect(await bye(pwi.inbox)).toBe('membership_disabled');
    stillOpen(h, ORG_B, 'BAD', bad.inbox);
    bad.ws.close();
  });

  it('zmiana zakresu: połączenie zostaje, a sygnały do posiadaczy zdolności liczą się od nowa', async () => {
    const h = await testHarness();
    const krz = await phoneLive(h, 'KRZ');
    const admin = await adminPanel(h);
    const watchers = [{ kind: 'capability', capability: 'fleet.watch' }] as const;

    const granted = await admin('PATCH', '/pilots/KRZ', { capabilities: ['fleet.watch'] });
    expect(granted.statusCode, granted.body).toBe(200);
    h.liveRegistry.changed(ORG_A, ['aircraft:SP-AXA'], watchers);
    expect((await krz.inbox.waitFor((f) => f.type === 'changed')).topics).toEqual(['aircraft:SP-AXA']);

    const revoked = await admin('PATCH', '/pilots/KRZ', { capabilities: [] });
    expect(revoked.statusCode, revoked.body).toBe(200);
    h.liveRegistry.changed(ORG_A, ['aircraft:SP-AXB'], watchers);
    h.liveRegistry.changed(ORG_A, ['calendar:2026-06-23'], [{ kind: 'club' }]);
    await krz.inbox.waitFor((f) => f.type === 'changed' && (f.topics as string[])[0] === 'calendar:2026-06-23');
    expect(krz.inbox.frames.filter((f) => f.type === 'changed').map((f) => f.topics)).toEqual([
      ['aircraft:SP-AXA'],
      ['calendar:2026-06-23'],
    ]);
    stillOpen(h, ORG_A, 'KRZ', krz.inbox);
    krz.ws.close();
  });
});

describe('kanał klubu - połączenie nie przeżywa tokenu', () => {
  it('w chwili wygaśnięcia tokenu przychodzi `bye token_expired`', async () => {
    const h = await testHarness();
    // Sesja z prawdziwego logowania, token podpisany na sekundę - brama sprawdza sesję,
    // więc zmyślona by nie przeszła.
    const sid = sidOf(await login(h.app, 'PWI'));
    const shortLived = h.tokens.sign({ pilotId: 'PWI', orgId: ORG_A, code: 'PWI', sessionId: sid }, 1);
    const phone = await phoneLive(h, 'PWI', shortLived);
    const frame = await phone.inbox.waitFor((f) => f.type === 'bye', 3_000);
    expect(frame.reason).toBe('token_expired');
    await phone.inbox.closed;
    expect(h.liveRegistry.isConnected(ORG_A, 'PWI')).toBe(false);
  });

  it('panel tak samo - połączenie kończy się z ciasteczkiem sesji', async () => {
    const h = await testHarness();
    const session = await panelSession(h.app, 'AKO');
    const token = session.cookie!.slice('ninerdeck_admin='.length);
    const shortLived = h.tokens.sign({ pilotId: 'AKO', orgId: ORG_A, code: 'AKO', sessionId: sidOf(token) }, 1);
    const panel = await panelLive(h, 'AKO', { cookie: `ninerdeck_admin=${shortLived}` });
    await panel.inbox.waitFor((f) => f.type === 'hello');
    expect((await panel.inbox.waitFor((f) => f.type === 'bye', 3_000)).reason).toBe('token_expired');
    await panel.inbox.closed;
    expect(h.liveRegistry.isConnected(ORG_A, 'AKO')).toBe(false);
  });

  it('czas życia połączenia: od teraz do terminu, nie mniej niż zero i nie ponad limit zegara', () => {
    const now = new Date(Date.UTC(2026, 5, 22, 8, 0, 0));
    expect(untilExpiry(new Date(now.getTime() + 3_600_000), now)).toBe(3_600_000);
    expect(untilExpiry(new Date(now.getTime() - 5_000), now)).toBe(0);
    expect(untilExpiry(new Date(now.getTime() + 60 * 86_400_000), now)).toBe(2 ** 31 - 1);
  });
});

