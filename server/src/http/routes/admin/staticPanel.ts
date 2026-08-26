/**
 * UZ Aero (serwer) — statyczny build panelu pod `/admin/`
 * (`docs/architektura-panelu-frontend.md` §9, wdrożone przy hostingu 2026-08-26).
 *
 * Serwuje katalog `admin/dist` (Vite z `base: '/admin/'`) spod ścieżki WBUDOWANEJ —
 * rejestracja jest bezwarunkowa. Env `ADMIN_DIST_DIR` usunięta 2026-08-26: miała
 * dokładnie dwa stany (nieustawiona w dev, stała w obrazie Dockera), więc była
 * przełącznikiem, którego nikt nie ustawiał ręcznie. Brakujący katalog nie przeszkadza:
 * `@fastify/static` odnotowuje go ostrzeżeniem i `/admin/` odpowiada 404 — dev bez
 * buildu działa jak dotąd, panel jedzie z Vite (`npm run admin`), które proxuje
 * `/admin/api` do serwera; oba warianty dają ten sam origin, na którym stoi ciasteczko
 * `SameSite=Strict`. Świadomy koszt: `admin/dist` zbudowany lokalnie będzie w dev
 * serwowany pod `:3000/admin/` także wtedy, gdy jest nieświeży — źródłem prawdy w dev
 * pozostaje Vite.
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

import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Build panelu liczony od TEGO pliku, nie od cwd — cwd różni się między obrazem
 * (`/repo`, CMD startuje z korzenia) a dev (`server/`, skrypty npm workspace),
 * a układ katalogów jest w obu ten sam: `<repo>/admin/dist`.
 */
const ADMIN_DIST = fileURLToPath(new URL('../../../../../admin/dist', import.meta.url));

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

/**
 * Cache z §9: Vite hashuje nazwy plików w `assets/`, więc raz pobrany plik nie zmieni
 * treści pod tą samą nazwą — rok i `immutable`. Cała reszta buildu odwrotnie —
 * `no-cache` (rewalidacja przy każdym wejściu): `index.html` wskazuje świeże hashe
 * (bez tego administrator po wdrożeniu siedzi na starym bundlu i zgłasza błędy
 * z wersji, która już nie istnieje), a pliki z `admin/public/` (fonty) Vite kopiuje
 * BEZ hasha w nazwie, więc `immutable` na nich byłoby kłamstwem.
 */
function cacheControlFor(filePath: string): string {
  return /[\\/]assets[\\/]/.test(filePath)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

/** `distDir` podmieniają WYŁĄCZNIE testy — `adminStatic.test.ts` podstawia katalog tymczasowy. */
export function registerAdminPanelStatic(app: FastifyInstance, distDir: string = ADMIN_DIST): void {
  app.register(fastifyStatic, {
    root: distDir,
    prefix: '/admin/',
    index: 'index.html',
    // Wtyczka dokłada własny `cache-control` (z `maxAge`) PO wywołaniu `setHeaders`
    // i ten by wygrał — dlatego jej emisja jest wyłączona, a nagłówek w całości
    // stawia `setHeaders` per plik.
    cacheControl: false,
    setHeaders: (res, filePath) => {
      res.setHeader('content-security-policy', PANEL_CSP);
      res.setHeader('cache-control', cacheControlFor(filePath));
    },
  });
  app.get('/admin', (_req, reply) => reply.redirect('/admin/'));
  app.get('/', (_req, reply) => reply.redirect('/admin/'));
}
