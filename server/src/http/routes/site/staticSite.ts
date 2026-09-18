/**
 * Ninerdeck (serwer) - strona publiczna pod `/` (landing, pobieranie, wydania, dokumentacja).
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

import { relative, sep } from 'node:path';
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
 * **Ryzyko tej luźniejszej polityki jest nazwane i ma domknięcie.** Dopóki strona stoi na
 * TYM SAMYM origin co panel, `'unsafe-inline'` jest tu warte tyle, ile pewność, że
 * w `site/dist` nie ma cudzej treści (dziś jej nie ma - wszystko wchodzi z `site/src`,
 * `docs/` i `design/`), a ciasteczko panelu `httpOnly` + `SameSite=Strict` ryzyko ogranicza,
 * lecz nie kasuje. Domknięciem jest OSOBNY HOST strony - i to serwer musi go wyegzekwować,
 * bo dwie domeny na jednej usłudze same niczego nie rozdzielają: `PUBLIC_SITE_URL`
 * (`https://ninerdeck.pl`) obok `PUBLIC_BASE_URL` (`https://app.ninerdeck.pl`) włącza
 * `http/hostSplit.ts`, który na hoście strony podaje wyłącznie stronę, a na każdym innym
 * strony nie podaje wcale (issue #124). Bez tej zmiennej ryzyko stoi, jak opisane wyżej.
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
 * CSP STRONY `/haslo/` - ŚCIŚLEJSZA niż reszta strony (2.1.0, H-F F3).
 *
 * ══ DLACZEGO OSOBNA ══
 * Uzasadnienie luzu wyżej kończy się na zdaniu „strona nie ma sesji, ciasteczka ani pola,
 * w które ktokolwiek cokolwiek wpisuje". `/haslo/` ma POLE HASŁA - pierwsze i jedyne na
 * całej stronie - a od H-F stoi w dodatku na origin PANELU (`hostSplit.ts`, `PASSWORD_PAGE`),
 * bo pyta API adresem względnym. Zostawić jej `'unsafe-inline'` znaczyłoby odtworzyć
 * dokładnie to ryzyko, które zamknęło issue #124, i to na stronie, na której człowiek
 * wpisuje nowe hasło.
 *
 * ══ CO Z TEGO WYNIKA DLA PLIKU ══
 * `script-src 'self'` i `style-src` bez `'unsafe-inline'` znaczą, że ta strona NIE MOŻE
 * mieć skryptu ani stylu w treści - stąd `haslo.js` i `haslo.css` obok niej. To jedyna
 * strona w `site/` z tym wymaganiem i dlatego jedyna, która ma własne pliki.
 *
 * ══ CZEGO NIE ZMIENIAMY I DLACZEGO ══
 * Kroje pisma nadal z Google Fonts, jak reszta strony: ta strona nie ma ciasteczka ani
 * sesji, a arkusz stylów z zewnątrz nie sięgnie ani do fragmentu adresu (token), ani do
 * pola - to robi skrypt, a tego `script-src 'self'` już nie wpuszcza. Panel self-hostuje
 * kroje, bo administrator siedzi w nim NA SESJI; tu nie ma czego ukraść.
 * `frame-ancestors 'none'` zamiast `'self'`: osadzanie tej strony w ramce nie ma żadnego
 * zastosowania, a reszta strony ma `'self'` wyłącznie dla żywych makiet w podręczniku.
 */
const PASSWORD_PAGE_CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data:; " +
  "connect-src 'self'; " +
  "object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/**
 * Czy podawany plik należy do `/haslo/`. Rozstrzyga ŚCIEŻKA NA DYSKU, którą podaje
 * `fastify-static` - a nie adres żądania: to ta sama rzecz, ale ścieżka pliku jest już
 * rozwiązana (`/haslo` → `haslo/index.html`), więc nie trzeba powtarzać jej reguł.
 */
const isPasswordPageFile = (filePath: string, distDir: string): boolean =>
  relative(distDir, filePath).split(sep)[0] === 'haslo';

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
    setHeaders: (res, filePath) => {
      res.setHeader(
        'content-security-policy',
        isPasswordPageFile(filePath, distDir) ? PASSWORD_PAGE_CSP : SITE_CSP,
      );
      res.setHeader('cache-control', SITE_CACHE);
    },
  });
}
