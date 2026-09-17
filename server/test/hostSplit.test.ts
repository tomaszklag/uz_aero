/**
 * Ninerdeck (serwer) - rozdział hostów (`http/hostSplit.ts`, issue #124).
 *
 * Dwie domeny wskazujące na jedną usługę same niczego nie rozdzielają - dopiero serwer
 * odmawia panelu na hoście strony i strony na hoście panelu. Testowana jest DECYZJA
 * (czysta tabela z docblocku) i jej skutek na prawdziwym serwerze z nagłówkiem `Host`:
 * to, czego na danym hoście ma nie być, odpowiada 404 albo przekierowaniem - nigdy
 * plikiem HTML, bo właśnie plik HTML na cudzym origin jest luką, którą rozdział zamyka.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  decideHostSplit,
  hostSplitFrom,
  routeKindOf,
  type HostSplit,
  type RouteKind,
} from '../src/http/hostSplit.ts';
import { testHarness } from './helpers.ts';

const SITE = 'https://ninerdeck.pl';
const APP = 'https://app.ninerdeck.pl';

const split = (): HostSplit => {
  const s = hostSplitFrom(SITE, APP);
  if (s == null) throw new Error('konfiguracja testu: rozdział ma być włączony');
  return s;
};

/** Namiastka `site/dist` - jak w `siteStatic.test.ts`. */
function fakeSite(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ninerdeck-site-dist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>NINERDECK</title>');
  writeFileSync(join(dir, 'site.css'), 'body{}');
  mkdirSync(join(dir, 'dokumentacja', 'instalacja'), { recursive: true });
  writeFileSync(
    join(dir, 'dokumentacja', 'instalacja', 'index.html'),
    '<!doctype html><title>Instalacja</title>',
  );
  return dir;
}

/** Namiastka `admin/dist` - treść, po której poznamy, że panel POSZEDŁ na zły host. */
function fakePanel(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ninerdeck-admin-dist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>NINERDECK panel</title>');
  return dir;
}

const onHost = (host: string) => ({ host });

describe('rozdział hostów - konfiguracja z env', () => {
  it('bez PUBLIC_SITE_URL rozdziału nie ma - jeden host, jak w dev', () => {
    expect(hostSplitFrom(undefined, APP)).toBeNull();
    expect(hostSplitFrom(undefined, undefined)).toBeNull();
  });

  it('PUBLIC_SITE_URL bez PUBLIC_BASE_URL to odmowa startu, nie połowiczny rozdział', () => {
    expect(() => hostSplitFrom(SITE, undefined)).toThrow(/PUBLIC_BASE_URL/);
  });

  it('ten sam host po obu stronach to odmowa startu', () => {
    expect(() => hostSplitFrom('https://ninerdeck.pl', 'https://NINERDECK.pl/')).toThrow(
      /ten sam host/,
    );
  });

  it('adresy tracą końcowy ukośnik, a host strony jest małymi literami', () => {
    expect(hostSplitFrom('https://Ninerdeck.pl/', `${APP}/`)).toEqual({
      siteUrl: 'https://Ninerdeck.pl',
      appUrl: APP,
      siteHost: 'ninerdeck.pl',
    });
  });
});

describe('rozdział hostów - rodzaj trasy z WZORCA routera, nie ze ścieżki', () => {
  it('rozpoznaje stronę, panel, sondę i API', () => {
    expect(routeKindOf('/*')).toBe('site');
    expect(routeKindOf('/admin')).toBe('panel');
    expect(routeKindOf('/admin/*')).toBe('panel');
    expect(routeKindOf('/health')).toBe('health');
    // `/admin/api/...` zaczyna się od `/admin/`, a jest API - dlatego wzorzec, nie prefiks.
    expect(routeKindOf('/admin/api/me')).toBe('api');
    expect(routeKindOf('/reference')).toBe('api');
    expect(routeKindOf('/sheets/:slug/:tab')).toBe('api');
    // Router nic nie dopasował (handler 404) - jak API: 404 zostaje 404 na każdym hoście.
    expect(routeKindOf(undefined)).toBe('api');
  });
});

describe('rozdział hostów - decyzja', () => {
  const s = split();
  const decide = (hostname: string, route: RouteKind, method: string, url: string) =>
    decideHostSplit(s, { hostname, method, url, route });

  it('host strony: strona przechodzi, panel odsyła na host aplikacji, API nie istnieje', () => {
    expect(decide('ninerdeck.pl', 'site', 'GET', '/pobierz/')).toEqual({ kind: 'pass' });
    expect(decide('ninerdeck.pl', 'panel', 'GET', '/admin/')).toEqual({
      kind: 'redirect',
      location: `${APP}/admin/`,
    });
    expect(decide('ninerdeck.pl', 'panel', 'HEAD', '/admin')).toEqual({
      kind: 'redirect',
      location: `${APP}/admin`,
    });
    expect(decide('ninerdeck.pl', 'api', 'GET', '/admin/api/me')).toEqual({ kind: 'not_found' });
    expect(decide('ninerdeck.pl', 'api', 'POST', '/events')).toEqual({ kind: 'not_found' });
  });

  it('inny host: panel i API przechodzą, strona odsyła na swój host', () => {
    expect(decide('app.ninerdeck.pl', 'site', 'GET', '/')).toEqual({
      kind: 'redirect',
      location: `${SITE}/`,
    });
    expect(decide('x.up.railway.app', 'site', 'GET', '/dokumentacja/')).toEqual({
      kind: 'redirect',
      location: `${SITE}/dokumentacja/`,
    });
    expect(decide('localhost', 'panel', 'GET', '/admin/')).toEqual({ kind: 'pass' });
    expect(decide('app.ninerdeck.pl', 'api', 'POST', '/events')).toEqual({ kind: 'pass' });
  });

  it('`/health` przechodzi na każdym hoście - sonda hostingu nie zna własnej domeny', () => {
    expect(decide('ninerdeck.pl', 'health', 'GET', '/health')).toEqual({ kind: 'pass' });
    expect(decide('app.ninerdeck.pl', 'health', 'GET', '/health')).toEqual({ kind: 'pass' });
    expect(decide('', 'health', 'GET', '/health')).toEqual({ kind: 'pass' });
  });

  it('przekierowanie jest nawigacją: inna metoda na trasę strony przechodzi do routera', () => {
    expect(decide('app.ninerdeck.pl', 'site', 'POST', '/')).toEqual({ kind: 'pass' });
  });

  it('host porównuje się bez rozróżniania wielkości liter', () => {
    expect(decide('NinerDeck.PL', 'site', 'GET', '/')).toEqual({ kind: 'pass' });
    expect(decide('NinerDeck.PL', 'api', 'GET', '/reference')).toEqual({ kind: 'not_found' });
  });

  it('przekierowanie niesie ścieżkę razem z zapytaniem', () => {
    expect(decide('ninerdeck.pl', 'panel', 'GET', '/admin/?powrot=1')).toEqual({
      kind: 'redirect',
      location: `${APP}/admin/?powrot=1`,
    });
    expect(decide('app.ninerdeck.pl', 'site', 'GET', '/pobierz/?src=qr')).toEqual({
      kind: 'redirect',
      location: `${SITE}/pobierz/?src=qr`,
    });
  });
});

describe('rozdział hostów - serwer', () => {
  const harness = () =>
    testHarness({ siteDistDir: fakeSite(), adminDistDir: fakePanel(), hostSplit: split() });

  it('host strony podaje stronę, a panel i API na nim NIE ISTNIEJĄ', async () => {
    const { app } = await harness();
    const site = onHost('ninerdeck.pl');

    const index = await app.inject({ method: 'GET', url: '/', headers: site });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('NINERDECK');
    const docs = await app.inject({ method: 'GET', url: '/dokumentacja/instalacja/', headers: site });
    expect(docs.statusCode).toBe(200);

    // Panel: przekierowanie, nie plik - HTML panelu na origin strony jest właśnie tą luką.
    const panel = await app.inject({ method: 'GET', url: '/admin/', headers: site });
    expect(panel.statusCode).toBe(301);
    expect(panel.headers.location).toBe(`${APP}/admin/`);
    expect(panel.body).not.toContain('panel');
    const bare = await app.inject({ method: 'GET', url: '/admin', headers: site });
    expect(bare.statusCode).toBe(301);
    expect(bare.headers.location).toBe(`${APP}/admin`);

    // API: 404, nie 401 - 401 potwierdzałoby, że trasa jest, tylko wymaga logowania.
    const api = await app.inject({ method: 'GET', url: '/admin/api/me', headers: site });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'not_found' });
    const reference = await app.inject({ method: 'GET', url: '/reference', headers: site });
    expect(reference.statusCode).toBe(404);
    const events = await app.inject({ method: 'POST', url: '/events', headers: site, payload: {} });
    expect(events.statusCode).toBe(404);
  });

  it('host aplikacji: panel i API jak dotąd, strona odsyła na swój host', async () => {
    const { app } = await harness();
    const host = onHost('app.ninerdeck.pl');

    const panel = await app.inject({ method: 'GET', url: '/admin/', headers: host });
    expect(panel.statusCode).toBe(200);
    expect(panel.body).toContain('NINERDECK panel');
    // Brama odpowiada swoim 401 - trasa istnieje, tylko wymaga sesji.
    expect((await app.inject({ method: 'GET', url: '/admin/api/me', headers: host })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/reference', headers: host })).statusCode).toBe(401);

    const index = await app.inject({ method: 'GET', url: '/', headers: host });
    expect(index.statusCode).toBe(301);
    expect(index.headers.location).toBe(`${SITE}/`);
    expect(index.body).not.toContain('NINERDECK');
    const download = await app.inject({ method: 'GET', url: '/pobierz/?src=qr', headers: host });
    expect(download.statusCode).toBe(301);
    expect(download.headers.location).toBe(`${SITE}/pobierz/?src=qr`);
    expect((await app.inject({ method: 'GET', url: '/site.css', headers: host })).statusCode).toBe(301);
  });

  it('domena hostingu i localhost liczą się jak host aplikacji', async () => {
    const { app } = await harness();
    for (const host of ['x.up.railway.app', 'localhost:3000', '127.0.0.1']) {
      const panel = await app.inject({ method: 'GET', url: '/admin/', headers: onHost(host) });
      expect(panel.statusCode, host).toBe(200);
      const index = await app.inject({ method: 'GET', url: '/', headers: onHost(host) });
      expect(index.statusCode, host).toBe(301);
      expect(index.headers.location, host).toBe(`${SITE}/`);
    }
  });

  it('`/health` odpowiada na każdym hoście', async () => {
    const { app } = await harness();
    for (const host of ['ninerdeck.pl', 'app.ninerdeck.pl', 'x.up.railway.app']) {
      const health = await app.inject({ method: 'GET', url: '/health', headers: onHost(host) });
      expect(health.statusCode, host).toBe(200);
      expect(health.json()).toEqual({ ok: true });
    }
  });

  it('bez PUBLIC_SITE_URL wszystko stoi pod jednym hostem, jak dotąd', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite(), adminDistDir: fakePanel() });
    expect((await app.inject({ method: 'GET', url: '/', headers: onHost('ninerdeck.pl') })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/admin/', headers: onHost('ninerdeck.pl') })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/', headers: onHost('app.ninerdeck.pl') })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/admin/api/me', headers: onHost('ninerdeck.pl') })).statusCode).toBe(401);
  });
});
