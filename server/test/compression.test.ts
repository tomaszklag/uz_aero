/**
 * Ninerdeck (serwer) - kompresja odpowiedzi (`http/server.ts`, 2026-09-07).
 *
 * Sprawdzamy DECYZJE, nie wtyczkę: (1) obejmuje trzy powierzchnie naraz - stronę
 * publiczną i API (panel jedzie tą samą drogą, co strona); (2) nie pakuje tego, co
 * spakowane już jest (PNG) ani tego, co za małe, żeby zysk pokrył narzut; (3) niesie
 * `Vary: Accept-Encoding`, bez którego pośrednik potrafi podać spakowaną odpowiedź
 * klientowi, który jej nie rozumie; (4) klient bez `Accept-Encoding` dostaje czysty
 * tekst - stary telefon nie ma prawa zobaczyć bajtów zamiast strony.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

/** Namiastka `site/dist`: strona ponad progiem i obrazek, którego pakować nie wolno. */
function fakeSite(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ninerdeck-site-dist-'));
  const filler = '<p>Chronometraż, który prowadzi się sam.</p>\n'.repeat(60);
  writeFileSync(join(dir, 'index.html'), `<!doctype html><title>NINERDECK</title>${filler}`);
  // Treść nieistotna - o pominięciu rozstrzyga typ MIME z rozszerzenia, nie entropia.
  writeFileSync(join(dir, 'logo.png'), Buffer.alloc(4096, 7));
  return dir;
}

async function pilotToken(app: Awaited<ReturnType<typeof testHarness>>['app']): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor('TMK') },
  });
  return login.json().token as string;
}

describe('kompresja odpowiedzi', () => {
  it('strona: HTML jedzie spakowany i rozpakowuje się do tej samej treści', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite() });

    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'accept-encoding': 'gzip' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(String(res.headers.vary)).toContain('accept-encoding');
    expect(gunzipSync(res.rawPayload).toString('utf8')).toContain('NINERDECK');
  });

  it('strona: kompresja naprawdę zmniejsza - to jest cały powód tej wtyczki', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite() });
    const url = '/';

    const plain = await app.inject({ method: 'GET', url });
    const gzipped = await app.inject({ method: 'GET', url, headers: { 'accept-encoding': 'gzip' } });

    // Strona to powtarzalny HTML - gzip ścina ją wielokrotnie, nie o kilka procent.
    expect(gzipped.rawPayload.length * 2).toBeLessThan(plain.rawPayload.length);
  });

  it('bez `Accept-Encoding` odpowiedź jest czystym tekstem', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite() });

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body).toContain('NINERDECK');
  });

  it('nie pakuje obrazka (spakowany już jest) ani odpowiedzi poniżej progu', async () => {
    const { app } = await testHarness({ siteDistDir: fakeSite() });
    const gzip = { 'accept-encoding': 'gzip' };

    const png = await app.inject({ method: 'GET', url: '/logo.png', headers: gzip });
    expect(png.statusCode).toBe(200);
    expect(png.headers['content-encoding']).toBeUndefined();

    // `{"ok":true}` - spakowane byłoby WIĘKSZE niż w oryginale.
    const health = await app.inject({ method: 'GET', url: '/health', headers: gzip });
    expect(health.statusCode).toBe(200);
    expect(health.headers['content-encoding']).toBeUndefined();
    expect(health.json()).toEqual({ ok: true });
  });

  it('API też: `GET /reference` wraca spakowane i parsuje się jak zawsze', async () => {
    const { app } = await testHarness();
    const token = await pilotToken(app);

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}`, 'accept-encoding': 'gzip' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');

    // Telefon dostaje ten sam kontrakt co przed zmianą - kompresja jest przezroczysta.
    const body = JSON.parse(gunzipSync(res.rawPayload).toString('utf8'));
    expect(body.aircraft.map((a: { reg: string }) => a.reg)).toContain('SP-AXA');
  });
});
