/**
 * UZ Aero (serwer) — statyczny build panelu pod `/admin/` (§9 architektury frontendu).
 *
 * Testowane są DECYZJE z §9, nie sama wtyczka: (1) serwer bez `ADMIN_DIST_DIR` panelu
 * nie zna — dev z Vite ma zostać nietknięty; (2) pliki buildu nie przesłaniają tras
 * API — `/admin/api/*` jest w routerze konkretne i wygrywa z wildcardem plików;
 * (3) fallbacku SPA NIE MA — ścieżka spoza buildu to 404, bo panel routuje hashem.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';

/** Namiastka `admin/dist` — kształt buildu Vite z `base: '/admin/'`. */
function fakeDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'uzaero-admin-dist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>UZ AERO panel</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("panel")');
  return dir;
}

describe('statyczny build panelu', () => {
  it('serwuje index.html i pliki buildu; goły adres przekierowuje do panelu', async () => {
    const { app } = await testHarness({ adminDistDir: fakeDist() });

    const index = await app.inject({ method: 'GET', url: '/admin/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('UZ AERO panel');
    // CSP wchodzi razem z self-hostem czcionek: panel nie sięga poza własny origin.
    expect(index.headers['content-security-policy']).toContain("default-src 'self'");

    const asset = await app.inject({ method: 'GET', url: '/admin/assets/app.js' });
    expect(asset.statusCode).toBe(200);

    for (const url of ['/admin', '/']) {
      const redirect = await app.inject({ method: 'GET', url });
      expect(redirect.statusCode).toBe(302);
      expect(redirect.headers.location).toBe('/admin/');
    }
  });

  it('pliki nie przesłaniają API: `/admin/api/*` odpowiada jak zawsze', async () => {
    const { app } = await testHarness({ adminDistDir: fakeDist() });

    // Bez tokenu — brama musi odpowiedzieć swoim 401, a nie plikiem ani 404 plików.
    const me = await app.inject({ method: 'GET', url: '/admin/api/me' });
    expect(me.statusCode).toBe(401);
  });

  it('bez fallbacku SPA: ścieżka spoza buildu = 404 (panel routuje hashem)', async () => {
    const { app } = await testHarness({ adminDistDir: fakeDist() });

    const missing = await app.inject({ method: 'GET', url: '/admin/dni/123' });
    expect(missing.statusCode).toBe(404);
  });

  it('bez ADMIN_DIST_DIR serwer panelu nie zna (dev z Vite bez zmian)', async () => {
    const { app } = await testHarness();

    expect((await app.inject({ method: 'GET', url: '/admin/' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
  });
});
