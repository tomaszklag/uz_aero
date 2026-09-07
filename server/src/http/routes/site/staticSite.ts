/**
 * UZ Aero (serwer) - strona publiczna pod `/` (landing, pobieranie, wydania, dokumentacja).
 *
 * Do 2026-09-07 stała na GitHub Pages w OSOBNYM repozytorium, do którego kopiowało się
 * wynik renderowania - razem z 71 makietami z `design/`. Odtąd jest tu: źródła w `site/src/`,
 * budowanie `npm run site` (`site/tools/build.mjs`), wynik w `site/dist` i to jego serwuje
 * ten plik. Jedno repozytorium, jedna domena dla strony, panelu i API.
 *
 * Ścieżka do buildu jest WBUDOWANA, dokładnie jak przy panelu (`staticPanel.ts`) i z tego
 * samego powodu: env miałaby dwa stany, których nikt nie przestawia ręcznie. Brak katalogu
 * nie przewraca startu - `@fastify/static` odnotowuje go ostrzeżeniem, a `/` odpowiada 404;
 * dev bez `npm run site` działa jak dotąd, bo strona nie jest do niczego w serwerze potrzebna.
 *
 * Decyzje:
 *  • **`decorateReply: false`** - `reply.sendFile` dekoruje już rejestracja panelu, a druga
 *    dekoracja tej samej nazwy jest w Fastify błędem startu (`FST_ERR_DEC_ALREADY_PRESENT`).
 *    Serwer nie używa `sendFile` nigdzie, więc nic na tym nie traci;
 *  • **wildcard `/` NIE PRZESŁANIA panelu ani API** - `/admin/*` (pliki panelu) i
 *    `/admin/api/*` (trasy) są w routerze BARDZIEJ KONKRETNE i wygrywają niezależnie od
 *    kolejności rejestracji. Przybija to `siteStatic.test.ts`, bo jest to dokładnie ten tryb
 *    awarii, przed którym ostrzega docblock `adminRoute.ts`: żądanie API obsłużone plikiem;
 *  • **`redirect: true`** - `/dokumentacja` bez ukośnika prowadzi do `/dokumentacja/`.
 *    Adresy stron podręcznika są katalogowe i człowiek wpisuje je z ręki albo dostaje
 *    w wiadomości bez końcowego znaku;
 *  • **bez fallbacku SPA** - strona jest zbiorem plików, nie aplikacją. Nieznany adres
 *    to 404, a nie landing udający, że wszystko jest w porządku.
 */

import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/** Wynik `npm run site`, liczony od TEGO pliku - jak `ADMIN_DIST` i z tego samego powodu. */
const SITE_DIST = fileURLToPath(new URL('../../../../../site/dist', import.meta.url));

/**
 * CSP strony - ŚWIADOMIE LUŹNIEJSZA niż panelu i tylko w dwóch miejscach.
 *
 * `script-src 'unsafe-inline'`: makiety w `design/` (żywe ekrany podręcznika i landingu)
 * mają skrypty w treści pliku - siedemnaście z nich - a landing jeden własny. To NIE jest
 * kod z zewnątrz: to nasze pliki z tego repozytorium, budowane razem z obrazem.
 * `style-src`/`font-src`: strona bierze kroje pisma z Google Fonts (panel je self-hostuje,
 * bo administrator loguje się do niego z konta - strona nie ma sesji, ciasteczka ani pola,
 * w które ktokolwiek cokolwiek wpisuje).
 *
 * **Zostaje jedno ryzyko i jest nazwane**: strona stoi na TYM SAMYM origin co panel, więc
 * `'unsafe-inline'` jest tu warte tyle, ile pewność, że w `site/dist` nie ma cudzej treści.
 * Dziś jej nie ma - wszystko wchodzi z `site/src`, `docs/` i `design/`. Właściwym
 * domknięciem jest osobna nazwa hosta dla strony po podpięciu własnej domeny
 * (`uzaero.pl` dla strony, `app.uzaero.pl` dla panelu i API); ciasteczko panelu jest
 * `httpOnly` i `SameSite=Strict`, co ryzyko ogranicza, ale go nie kasuje.
 */
const SITE_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data:; " +
  "frame-src 'self'; " +
  "object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

/**
 * Cache: `no-cache` (rewalidacja przy każdym wejściu) na WSZYSTKIM.
 *
 * Inaczej niż w panelu, gdzie Vite hashuje nazwy w `assets/` i rok `immutable` jest
 * prawdą - tu nazwy są stałe (`site.css`, `dokumentacja.css`, `screens/01-moj-dzien.html`),
 * a treść pod nimi zmienia się z każdym wydaniem. Rewalidacja kosztuje 304, nieaktualny
 * arkusz stylów kosztuje zgłoszenie błędu ze strony, która już nie istnieje.
 */
const SITE_CACHE = 'no-cache';

/** `distDir` podmieniają WYŁĄCZNIE testy - `siteStatic.test.ts` podstawia katalog tymczasowy. */
export function registerPublicSiteStatic(app: FastifyInstance, distDir: string = SITE_DIST): void {
  app.register(fastifyStatic, {
    root: distDir,
    prefix: '/',
    index: 'index.html',
    redirect: true,
    // `sendFile` dekoruje już panel; druga dekoracja tej samej nazwy przewraca start.
    decorateReply: false,
    // Wtyczka dokłada własny `cache-control` PO `setHeaders` i ten by wygrał - nagłówek
    // stawiamy w całości sami (ta sama pułapka, co przy panelu).
    cacheControl: false,
    setHeaders: (res) => {
      res.setHeader('content-security-policy', SITE_CSP);
      res.setHeader('cache-control', SITE_CACHE);
    },
  });
}
