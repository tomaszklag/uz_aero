/**
 * UZ Aero (serwer) - statyczny build panelu pod `/admin/` (§9 architektury frontendu).
 *
 * Testowane są DECYZJE z §9, nie sama wtyczka: (1) serwer serwuje panel ZAWSZE -
 * przełącznika env nie ma (`ADMIN_DIST_DIR` usunięta 2026-08-26), a brakujący katalog
 * buildu (dev bez `npm run build -w admin`) nie przewraca startu: `/admin/` odpowiada
 * wtedy 404 i panel jedzie z Vite; (2) pliki buildu nie przesłaniają tras API -
 * `/admin/api/*` jest w routerze konkretne i wygrywa z wildcardem plików;
 * (3) fallbacku SPA NIE MA - ścieżka spoza buildu to 404, bo panel routuje hashem.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';

/** Namiastka `admin/dist` - kształt buildu Vite z `base: '/admin/'`. */
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

  it('cache z §9: hashowane assets = rok immutable, index.html = no-cache', async () => {
    const { app } = await testHarness({ adminDistDir: fakeDist() });

    // Vite hashuje nazwy w `assets/`, więc treść pod tą samą nazwą nie ma prawa się
    // zmienić - rok i `immutable`. `index.html` wskazuje świeże hashe, więc odwrotnie:
    // bez `no-cache` administrator po wdrożeniu siedzi na starym bundlu.
    const index = await app.inject({ method: 'GET', url: '/admin/' });
    expect(index.headers['cache-control']).toBe('no-cache');

    const asset = await app.inject({ method: 'GET', url: '/admin/assets/app.js' });
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('pliki nie przesłaniają API: `/admin/api/*` odpowiada jak zawsze', async () => {
    const { app } = await testHarness({ adminDistDir: fakeDist() });

    // Bez tokenu - brama musi odpowiedzieć swoim 401, a nie plikiem ani 404 plików.
    const me = await app.inject({ method: 'GET', url: '/admin/api/me' });
    expect(me.statusCode).toBe(401);
  });

  it('bez fallbacku SPA: ścieżka spoza buildu = 404 (panel routuje hashem)', async () => {
    const { app } = await testHarness({ adminDistDir: fakeDist() });

    const missing = await app.inject({ method: 'GET', url: '/admin/dni/123' });
    expect(missing.statusCode).toBe(404);
  });

  it('brak katalogu buildu (dev bez `vite build`) = 404 na plikach, przekierowania stoją', async () => {
    // Ścieżka na pewno nieistniejąca: świeży katalog tymczasowy + podkatalog,
    // którego nikt nie utworzył. `@fastify/static` ma to przyjąć ostrzeżeniem,
    // nie wyjątkiem - dev bez buildu panelu musi wystartować.
    const missingDist = join(mkdtempSync(join(tmpdir(), 'uzaero-admin-dist-')), 'brak');
    const { app } = await testHarness({ adminDistDir: missingDist });

    expect((await app.inject({ method: 'GET', url: '/admin/' })).statusCode).toBe(404);

    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(302);
    expect(root.headers.location).toBe('/admin/');
  });
});
