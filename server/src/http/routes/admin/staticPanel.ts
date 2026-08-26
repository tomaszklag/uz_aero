/**
 * UZ Aero (serwer) — statyczny build panelu pod `/admin/`
 * (`docs/architektura-panelu-frontend.md` §9, wdrożone przy hostingu 2026-08-26).
 *
 * Serwuje katalog `admin/dist` (Vite z `base: '/admin/'`) wskazany zmienną
 * `ADMIN_DIST_DIR`. W dev zmiennej nie ma i rejestracja się nie dzieje — panel jedzie
 * z Vite (`npm run admin`), które proxuje `/admin/api` do serwera; oba warianty dają
 * ten sam origin, na którym stoi ciasteczko `SameSite=Strict`.
 *
 * Decyzje wprost z §9:
 *  • **BEZ fallbacku SPA** — panel routuje hashem (`#/dni/<uuid>`), więc serwer obsługuje
 *    dokładnie `GET /admin/` (index.html) i pliki buildu. Wildcard „wszystko → index"
 *    musiałby omijać zasoby i nie połykać 404 z API — realne źródło błędów, którego
 *    za jeden znak `#` w adresie nie kupujemy;
 *  • trasy API są w routerze KONKRETNE (`/admin/api/...`), więc wygrywają z wildcardem
 *    plików — przybija to test w `adminStatic.test.ts`.
 *
 * `GET /admin` (bez ukośnika) i `GET /` przekierowują na `/admin/`: panel jest jedyną
 * treścią serwera przeznaczoną dla przeglądarki, a goły adres wpisuje człowiek.
 */

import { resolve } from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * CSP dla panelu — możliwe, odkąd czcionki są self-hostowane (`admin/public/fonts/`,
 * §9): panel nie sięga poza własny origin po NIC. `style-src 'unsafe-inline'` zostaje
 * dla atrybutów `style={...}` Reacta (dynamiczne szerokości pasków i wykresów);
 * skrypty inline są zablokowane — build Vite ładuje wyłącznie moduły z `/admin/assets/`.
 * Nagłówek nadaje serwowanie statyczne, więc dev z Vite (HMR, preambuła inline
 * plugin-react) pozostaje nietknięty.
 */
const PANEL_CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export function registerAdminPanelStatic(app: FastifyInstance, distDir: string): void {
  app.register(fastifyStatic, {
    // `@fastify/static` wymaga ścieżki bezwzględnej; względna w env liczy się od cwd.
    root: resolve(distDir),
    prefix: '/admin/',
    index: 'index.html',
    setHeaders: (res) => res.setHeader('content-security-policy', PANEL_CSP),
  });
  app.get('/admin', (_req, reply) => reply.redirect('/admin/'));
  app.get('/', (_req, reply) => reply.redirect('/admin/'));
}
