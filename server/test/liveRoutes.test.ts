/**
 * Ninerdeck (serwer) - WEJŚCIA KANAŁU KLUBU: `GET /live` (telefon) i `GET /admin/api/live`
 * (panel) - 4.0.0, `docs/kanal-klubu.md` §3.1, §3.2, §5; epik Z-E #246.
 *
 * Połączenia idą przez `injectWS` wtyczki - w pamięci, bez portu. Najważniejsze własności:
 * telefon dowodzi tożsamości PIERWSZĄ ramką i tą samą bramą, co REST; panel - ciasteczkiem
 * i ścisłym `Origin`, a odmowa pada zwykłą odpowiedzią HTTP przed przejściem na WebSocket;
 * od klienta przechodzi wyłącznie `ping`/`pong` (nieznany typ ignorowany, zły kształt,
 * binarna, za duża i za częsta ramka zamykają połączenie); dwa cykle pingu bez odpowiedzi
 * zamykają połączenie; koniec połączenia zdejmuje je z rejestru.
 */

import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';

import { hostSplitFrom } from '../src/http/hostSplit.ts';
import { testHarness } from './helpers.ts';
import { connectLive, listen, sendFrame, waitUntil, type Frame } from './liveClients.ts';
import { login, panelSession, type Harness } from './routeClients.ts';
import { ORG_A } from './testWorld.ts';

const ORIGIN = 'http://ninerdeck.test';

const send = sendFrame;
const connect = (h: Harness, path: string, headers: Record<string, string> = {}) => connectLive(h.app, path, headers);

/** Telefon po uwierzytelnieniu - połączenie z powitaniem w ręku. */
async function phoneLive(h: Harness, who: string) {
  const token = await login(h.app, who);
  const { ws, inbox } = await connect(h, '/live');
  send(ws, { type: 'auth', token });
  const hello = await inbox.waitFor((f) => f.type === 'hello');
  return { ws, inbox, hello, token };
}

async function panelLive(h: Harness, who: string, headers: Record<string, string> = {}) {
  const session = await panelSession(h.app, who);
  return connect(h, '/admin/api/live', { cookie: session.cookie ?? '', origin: ORIGIN, ...headers });
}

describe('kanał klubu - telefon (`GET /live`)', () => {
  it('pierwsza ramka `auth` → powitanie, sygnał klubu dochodzi, ping dostaje pong', async () => {
    const h = await testHarness();
    const { ws, inbox, hello } = await phoneLive(h, 'AKO');
    expect(hello).toMatchObject({ v: 1, session: expect.any(String), serverTime: expect.any(String) });
    expect([...h.liveRegistry.connectedSessions(ORG_A, 'AKO')]).toEqual([hello.session]);

    h.liveRegistry.changed(ORG_A, ['calendar:2026-06-24'], [{ kind: 'club' }]);
    expect(await inbox.waitFor((f) => f.type === 'changed')).toEqual({
      v: 1,
      type: 'changed',
      org: ORG_A,
      topics: ['calendar:2026-06-24'],
    });

    send(ws, { type: 'ping' });
    await inbox.waitFor((f) => f.type === 'pong');
    ws.close();
  });

  it('koniec połączenia zdejmuje je z rejestru - na PRAWDZIWYM gnieździe', async () => {
    // Na prawdziwym porcie, bo w połączeniu `injectWS` (strumienie w pamięci) gniazdo
    // serwera dostaje `end`, ale nigdy `close` - i odłączenie czekałoby na 30-sekundowy
    // limit zamykania biblioteki `ws`. W sieci `close` przychodzi zaraz po `end`.
    const h = await testHarness();
    const token = await login(h.app, 'AKO');
    const address = await h.app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const ws = new WebSocket(`${address.replace(/^http/, 'ws')}/live`);
      const inbox = listen(ws);
      await new Promise((resolve) => ws.once('open', resolve));
      send(ws, { type: 'auth', token });
      await inbox.waitFor((f) => f.type === 'hello');
      expect(h.liveRegistry.connectedSessions(ORG_A, 'AKO').size).toBe(1);

      ws.close();
      await inbox.closed;
      await waitUntil(() => h.liveRegistry.connectedSessions(ORG_A, 'AKO').size === 0);
    } finally {
      await h.app.close();
    }
  });

  it('token, który nie przechodzi bramy, dostaje `bye token_expired` - jak 401 z REST', async () => {
    const h = await testHarness();
    const { ws, inbox } = await connect(h, '/live');
    send(ws, { type: 'auth', token: 'nie-token' });
    expect(await inbox.waitFor((f) => f.type === 'bye')).toEqual({ v: 1, type: 'bye', reason: 'token_expired' });
    expect((await inbox.closed).code).toBe(1000);
  });

  it('bez `auth` w terminie, albo z inną pierwszą ramką - zamknięcie za naruszenie protokołu', async () => {
    const h = await testHarness({ liveTiming: { authTimeoutMs: 50 } });
    const silent = await connect(h, '/live');
    expect((await silent.inbox.closed).code).toBe(1008);

    const wrong = await connect(h, '/live');
    send(wrong.ws, { type: 'ping' });
    expect(await wrong.inbox.closed).toEqual({ code: 1008, reason: 'auth_required' });
  });

  it('nieznany typ ramki jest ignorowany; zły kształt zamyka połączenie', async () => {
    const h = await testHarness();
    const { ws, inbox } = await phoneLive(h, 'AKO');
    send(ws, { type: 'subscribe', topics: ['calendar:*'] });
    h.liveRegistry.changed(ORG_A, ['attention'], [{ kind: 'club' }]);
    await inbox.waitFor((f) => f.type === 'changed');

    ws.send('to nie jest JSON');
    expect(await inbox.closed).toEqual({ code: 1008, reason: 'bad_frame' });
  });

  it('za częste ramki i za duża ramka zamykają połączenie', async () => {
    const h = await testHarness({ liveTiming: { rate: { frames: 3, windowMs: 10_000 }, maxPayload: 512 } });
    const first = await phoneLive(h, 'AKO');
    for (let i = 0; i < 4; i += 1) send(first.ws, { type: 'ping' });
    expect(await first.inbox.closed).toEqual({ code: 1008, reason: 'too_fast' });

    const second = await phoneLive(h, 'PWI');
    send(second.ws, { type: 'ping', pad: 'x'.repeat(2_000) });
    expect((await second.inbox.closed).code).toBe(1009);
  });

  it('ping serwera: klient, który odpowiada, zostaje; milczący wypada po dwóch cyklach', async () => {
    const h = await testHarness({ liveTiming: { pingIntervalMs: 30 } });
    const alive = await phoneLive(h, 'AKO');
    alive.ws.on('message', (data) => {
      if ((JSON.parse(String(data)) as Frame).type === 'ping') send(alive.ws, { type: 'pong' });
    });
    const silent = await phoneLive(h, 'PWI');

    await silent.inbox.waitFor((f) => f.type === 'ping');
    expect((await silent.inbox.closed).code).toBe(1006);
    expect(alive.ws.readyState).toBe(alive.ws.OPEN);
    alive.ws.close();
  });

  it('na hoście strony kanału nie ma - 404 przed przejściem na WebSocket', async () => {
    const h = await testHarness({ hostSplit: hostSplitFrom('https://ninerdeck.pl', 'https://app.ninerdeck.pl')! });
    await h.app.ready();
    await expect(h.app.injectWS('/live', { headers: { host: 'ninerdeck.pl' } })).rejects.toThrow(/404/);
    const onApp = await h.app.injectWS('/live', { headers: { host: 'app.ninerdeck.pl' } });
    onApp.close();
  });
});

describe('kanał klubu - panel (`GET /admin/api/live`)', () => {
  it('ciasteczko sesji i właściwy `Origin` → powitanie; sygnał do posiadaczy zdolności dochodzi', async () => {
    const h = await testHarness();
    const { ws, inbox } = await panelLive(h, 'AKO');
    await inbox.waitFor((f) => f.type === 'hello');

    h.liveRegistry.changed(ORG_A, ['attention'], [{ kind: 'capability', capability: 'panel.access' }]);
    expect((await inbox.waitFor((f) => f.type === 'changed')).topics).toEqual(['attention']);
    ws.close();
  });

  it('obcy albo brakujący `Origin` - 403; bez sesji i z sesją platformową - 401', async () => {
    const h = await testHarness();
    await expect(panelLive(h, 'AKO', { origin: 'https://obca.strona' })).rejects.toThrow(/403/);
    await expect(
      (async () => {
        const session = await panelSession(h.app, 'AKO');
        return h.app.injectWS('/admin/api/live', { headers: { cookie: session.cookie } });
      })(),
    ).rejects.toThrow(/403/);
    await expect(h.app.injectWS('/admin/api/live', { headers: { origin: ORIGIN } })).rejects.toThrow(/401/);
    // Superadministrator nie ma klubu, więc kanału klubu też nie (K3).
    await expect(panelLive(h, 'ROOT')).rejects.toThrow(/401/);
  });
});
