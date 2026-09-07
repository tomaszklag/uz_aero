/**
 * UZ Aero (serwer) - strona publiczna pod `/` (`http/routes/site/staticSite.ts`).
 *
 * Testowane są DECYZJE, nie wtyczka. Najważniejsza jest ostatnia grupa: strona rejestruje
 * wildcard na `/`, więc gdyby wygrywał z panelem albo z API, żądanie `/admin/api/...`
 * wracałoby jako PLIK HTML - tryb awarii, przed którym ostrzega docblock `adminRoute.ts`
 * i którego z odpowiedzi 200 nie widać na pierwszy rzut oka.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';

/** Namiastka `site/dist` - kształt wyniku `npm run site`. */
function fakeSite(): string {
  const dir = mkdtempSync(join(tmpdir(), 'uzaero-site-dist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>UZ AERO</title>');
  writeFileSync(join(dir, 'site.css'), 'body{}');
  mkdirSync(join(dir, 'dokumentacja', 'instalacja'), { recursive: true });
  writeFileSync(join(dir, 'dokumentacja', 'index.html'), '<!doctype html><title>Podręcznik</title>');
  writeFileSync(
    join(dir, 'dokumentacja', 'instalacja', 'index.html'),
    '<!doctype html><title>Instalacja</title>',
  );
  return dir;
}

/** Namiastka `admin/dist` - żeby dało się sprawdzić, że wildcard strony jej nie zjada. */
function fakePanel(): string {
  const dir = mkdtempSync(join(tmpdir(), 'uzaero-admin-dist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>UZ AERO panel</title>');
  return dir;
}

describe('strona publiczna', () => {
  it('serwuje landing pod `/` i pliki obok niego', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite() });

    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('UZ AERO');

    const css = await app.inject({ method: 'GET', url: '/site.css' });
    expect(css.statusCode).toBe(200);
  });

  it('strony podręcznika są katalogami; adres bez ukośnika prowadzi do środka', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite() });

    const page = await app.inject({ method: 'GET', url: '/dokumentacja/instalacja/' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Instalacja');

    // `redirect: true` - adres podręcznika człowiek wpisuje z ręki albo dostaje
    // w wiadomości bez końcowego znaku.
    const noSlash = await app.inject({ method: 'GET', url: '/dokumentacja' });
    expect(noSlash.statusCode).toBe(301);
    expect(noSlash.headers.location).toBe('/dokumentacja/');
  });

  it('nagłówki: CSP strony (fonty Google) i `no-cache` na wszystkim', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite() });

    const index = await app.inject({ method: 'GET', url: '/' });
    const csp = String(index.headers['content-security-policy']);
    // Makiety mają skrypty w treści pliku, a strona bierze kroje pisma z Google Fonts -
    // panel nie robi ani jednego, ani drugiego i ma swoją, ostrzejszą politykę.
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain('https://fonts.gstatic.com');
    // Same-origin `<iframe>` z żywymi ekranami: 'none' zablokowałoby własne makiety.
    expect(csp).toContain("frame-ancestors 'self'");

    // Nazwy plików strony nie są hashowane, więc treść pod nimi zmienia się z wydaniem.
    expect(index.headers['cache-control']).toBe('no-cache');
    const css = await app.inject({ method: 'GET', url: '/site.css' });
    expect(css.headers['cache-control']).toBe('no-cache');
  });

  it('wildcard `/` NIE przesłania panelu, API ani `/health`', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite(), adminDistDir: fakePanel() });

    const panel = await app.inject({ method: 'GET', url: '/admin/' });
    expect(panel.statusCode).toBe(200);
    expect(panel.body).toContain('UZ AERO panel');

    const redirect = await app.inject({ method: 'GET', url: '/admin' });
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe('/admin/');

    // Bez tokenu brama musi odpowiedzieć swoim 401 - nie plikiem i nie 404 plików.
    const api = await app.inject({ method: 'GET', url: '/admin/api/me' });
    expect(api.statusCode).toBe(401);

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });
  });

  it('bez fallbacku SPA: nieznany adres to 404, nie landing', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite() });

    // Landing pod nieistniejącym adresem udawałby, że wszystko jest w porządku -
    // strona jest zbiorem plików, nie aplikacją z własnym routingiem.
    expect((await app.inject({ method: 'GET', url: '/nie-ma-takiej-strony' })).statusCode).toBe(404);
  });

  it('brak katalogu strony (dev bez `npm run site`) nie przewraca serwera', async () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'uzaero-site-dist-')), 'brak');
    const { app } = await testHarness({ siteDistDir: missing, adminDistDir: fakePanel() });

    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/admin/' })).statusCode).toBe(200);
  });
});
