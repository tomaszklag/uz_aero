/**
 * Ninerdeck (serwer) - ROZDZIAŁ HOSTÓW: strona publiczna na jednym adresie, panel i API
 * na drugim (issue #124, własna domena: `ninerdeck.pl` ↔ `app.ninerdeck.pl`).
 *
 * ══ PO CO ══
 * Strona ma CSP świadomie luźniejszą niż panel (`routes/site/staticSite.ts`: skrypty
 * w treści makiet, fonty Google). Dopóki strona i panel dzielą origin, `'unsafe-inline'`
 * strony jest warte tyle, ile pewność, że w `site/dist` nie ma cudzej treści - bo
 * ciasteczko panelu widzi ten sam origin. Osobna nazwa hosta dla strony była od początku
 * jedynym domknięciem tego ryzyka.
 *
 * **Dwie domeny wskazujące na jedną usługę NICZEGO same nie rozdzielają.** Bez tego pliku
 * `ninerdeck.pl/admin/` dalej otwierałoby panel na origin strony, a `app.ninerdeck.pl/`
 * landing na origin panelu. Rozdział musi zrobić serwer: odmówić panelu i API na hoście
 * strony, a strony na hoście panelu.
 *
 * ══ TRYB ══
 * Włącza go `PUBLIC_SITE_URL` (adres strony) obok `PUBLIC_BASE_URL` (adres panelu i API).
 * Bez `PUBLIC_SITE_URL` serwer zachowuje się jak dotąd - jeden host, wszystko pod nim
 * (dev, testy, usługa bez własnej domeny). `PUBLIC_SITE_URL` bez `PUBLIC_BASE_URL` albo
 * o tym samym hoście to ODMOWA STARTU (`hostSplitFrom` rzuca): połowiczny rozdział
 * wyglądałby jak działający serwer, w którym `/admin` na hoście strony nie ma dokąd odesłać.
 *
 * ══ DECYZJA (per żądanie) ══
 *   host STRONY   pliki strony              → przechodzą
 *                 `/admin`, `/admin/*` GET   → 301 na host aplikacji (człowiek wpisał
 *                                              `ninerdeck.pl/admin` z ręki)
 *                 `/haslo/…` GET            → 301 na host aplikacji - ta jedna strona
 *                                              mieszka tam, bo pyta API względnym
 *                                              adresem (patrz `PASSWORD_PAGE`)
 *                 API, trasy telefonu       → 404, nie 401: na tym hoście te trasy
 *                                              NIE ISTNIEJĄ, a 401 potwierdzałoby, że są
 *   inny host     `/` GET                   → 301 na `/admin/` - korzeń hosta aplikacji jest
 *                                              wejściem PANELU: kto wpisuje `app.ninerdeck.pl`,
 *                                              szuka panelu, nie landingu (decyzja
 *                                              właściciela 2026-09-17)
 *                 inne pliki strony GET     → 301 na host strony (`/pobierz/`,
 *                                              `/dokumentacja/…` to treść strony, nie 404)
 *                 `/haslo/…`                → przechodzi - to jej host
 *                 reszta                    → przechodzi
 *   każdy host    `/health`                 → przechodzi (sonda hostingu pyta bez
 *                                              nagłówka `Host` własnej domeny)
 *
 * „Inny host" to KAŻDY poza hostem strony - także domena wygenerowana przez hosting
 * i `localhost`. Asymetria jest celowa: wyjątkowy jest host strony, bo to on niesie
 * luźniejszą politykę; API nie musi znać listy swoich adresów.
 *
 * ══ JAK ROZPOZNAJEMY ══
 * Rodzaj trasy czytamy z `request.routeOptions.url` - WZORCA trasy, w którą trafił router -
 * a nie z prefiksu ścieżki: `/*` to statyczna strona, `/admin` i `/admin/*` to statyczny
 * panel (`staticPanel.ts`), `/health` sonda, wszystko inne API. Prefiks ścieżki kłamałby
 * przy `/admin/api/...` (zaczyna się od `/admin/`, a jest API) i wymagałby drugiej listy
 * tras obok routera. Host czytamy z `request.hostname` (za proxy hostingu to
 * `X-Forwarded-Host` - patrz `trustProxy` w `server.ts`), bez portu i bez rozróżniania
 * wielkości liter, bo tak działa DNS.
 *
 * Hook jest jeden, na całej instancji, PRZED trasami - jak strażnik CSRF (`adminCsrf.ts`):
 * rozdziału nie da się pominąć, dopisując plik z trasą. Nowych tras nie rejestruje,
 * więc rejestr tras i test izolacji klubów (`tenantIsolation.test.ts`) go nie widzą.
 */

import type { FastifyInstance } from 'fastify';

export interface HostSplit {
  /** Adres strony publicznej bez końcowego ukośnika, np. `https://ninerdeck.pl`. */
  readonly siteUrl: string;
  /** Adres panelu i API bez końcowego ukośnika, np. `https://app.ninerdeck.pl`. */
  readonly appUrl: string;
  /** Host strony małymi literami - porównywany z `request.hostname` przy każdym żądaniu. */
  readonly siteHost: string;
}

/**
 * Rodzaj trasy, w którą trafił router - po WZORCU trasy, nie po ścieżce żądania.
 *
 * `app_page` jest jedynym wyjątkiem od tej zasady i ma jeden powód: `/haslo/` jest
 * PLIKIEM STRONY, który musi stać na hoście APLIKACJI - patrz `PASSWORD_PAGE`.
 */
export type RouteKind = 'site' | 'app_page' | 'panel' | 'health' | 'api';

export type HostSplitDecision =
  | { readonly kind: 'pass' }
  | { readonly kind: 'redirect'; readonly location: string }
  | { readonly kind: 'not_found' };

export interface HostSplitRequest {
  readonly hostname: string;
  readonly method: string;
  /** Ścieżka razem z zapytaniem, jak `request.url` - przekierowanie niesie ją w całości. */
  readonly url: string;
  readonly route: RouteKind;
}

const PASS: HostSplitDecision = { kind: 'pass' };
const NOT_FOUND: HostSplitDecision = { kind: 'not_found' };

/** Metody, które przekierowujemy: nawigacja przeglądarki. `POST` na stronę nie ma sensu. */
const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * Cel korzenia hosta aplikacji - WZGLĘDNY, więc zostaje na tym hoście, na który ktoś wszedł
 * (także na domenie hostingu), zamiast przepisywać go na `PUBLIC_BASE_URL`.
 */
const PANEL_ENTRY = '/admin/';

/**
 * `/haslo/` - JEDYNY plik strony, który mieszka na hoście APLIKACJI (2.1.0, H-F F3).
 *
 * ══ DLACZEGO WYJĄTEK ══
 * Strona z linku w e-mailu pyta `POST /auth/password/reset` ADRESEM WZGLĘDNYM, a to jest
 * trasa API - czyli na hoście strony NIE ISTNIEJE (odpowiada `404`, i tak ma być). Link
 * w liście składa się z `PUBLIC_BASE_URL`, czyli i tak wskazuje host aplikacji; bez tego
 * wyjątku hook odsyłałby go stamtąd na host strony i pilot klikałby w link, który nie
 * ustawia hasła. Alternatywa - wołanie API przez origin - znaczyłaby CORS na trasie
 * uwierzytelniania, czyli nową powierzchnię tam, gdzie jej najmniej chcemy.
 *
 * ══ CENA I JEJ SPŁATA ══
 * Plik strony na origin panelu to dokładnie to ryzyko, które zamknęło issue #124. Dlatego
 * `/haslo/` jest JEDYNĄ stroną bez skryptu i stylu w treści pliku, a `staticSite.ts` daje
 * jej WŁASNĄ, ścisłą politykę bezpieczeństwa - bez `'unsafe-inline'`. Uzasadnienie luzu
 * dla reszty strony („nie ma pola, w które ktokolwiek cokolwiek wpisuje") przestało jej
 * dotyczyć w chwili, gdy dostała pole hasła.
 *
 * Dopisując tu drugą ścieżkę, przeczytaj oba akapity: wyjątek jest wąski i ma być wąski.
 */
const PASSWORD_PAGE = '/haslo';

const isPasswordPage = (path: string): boolean =>
  path === PASSWORD_PAGE || path.startsWith(`${PASSWORD_PAGE}/`);

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

/** Sama ścieżka z `request.url` - bez zapytania; `/?x=1` jest nadal korzeniem. */
const pathOf = (url: string): string => url.split('?')[0] ?? url;

/**
 * Konfiguracja rozdziału z env. `null` = jeden host dla wszystkiego (dev, testy).
 *
 * Rzuca przy połowicznej konfiguracji - serwer ma NIE WSTAĆ, a nie udawać rozdział.
 * Sprawdzenie stoi tu, a nie w schemacie zod w `index.ts`, bo pyta o RELACJĘ dwóch
 * zmiennych, a testy mają ją wołać bez podnoszenia całego composition root.
 */
export function hostSplitFrom(
  siteUrl: string | undefined,
  appUrl: string | undefined,
): HostSplit | null {
  if (siteUrl == null) return null;
  if (appUrl == null) {
    throw new Error(
      'PUBLIC_SITE_URL wymaga PUBLIC_BASE_URL - host strony nie miałby dokąd odesłać /admin',
    );
  }
  const siteHost = new URL(siteUrl).hostname.toLowerCase();
  const appHost = new URL(appUrl).hostname.toLowerCase();
  if (siteHost === appHost) {
    throw new Error(
      'PUBLIC_SITE_URL i PUBLIC_BASE_URL wskazują ten sam host - rozdział nie ma czego rozdzielać',
    );
  }
  return { siteUrl: stripTrailingSlash(siteUrl), appUrl: stripTrailingSlash(appUrl), siteHost };
}

/**
 * Wzorzec trasy → rodzaj. `undefined` = router nic nie dopasował (handler 404 Fastify'ego):
 * liczy się jak API, więc 404 zostaje 404 na każdym hoście.
 *
 * `path` jest opcjonalna i służy DOKŁADNIE JEDNEJ rzeczy: wyłowieniu `/haslo/` spod
 * wzorca `/*` (patrz `PASSWORD_PAGE`). Reszta rozpoznania idzie z wzorca routera i ma
 * tak zostać - prefiks ścieżki kłamałby przy `/admin/api/...`.
 */
export function routeKindOf(routeUrl: string | undefined, path?: string): RouteKind {
  if (routeUrl === '/*') {
    return path != null && isPasswordPage(path) ? 'app_page' : 'site';
  }
  if (routeUrl === '/admin' || routeUrl === '/admin/*') return 'panel';
  if (routeUrl === '/health') return 'health';
  return 'api';
}

/** Czysta tabela decyzji z docblocku pliku - to ją testuje `hostSplit.test.ts` wprost. */
export function decideHostSplit(split: HostSplit, req: HostSplitRequest): HostSplitDecision {
  if (req.route === 'health') return PASS;

  const onSiteHost = req.hostname.toLowerCase() === split.siteHost;
  const navigates = READ_METHODS.has(req.method);

  if (onSiteHost) {
    if (req.route === 'site') return PASS;
    // `/haslo/` i panel odsyłamy tak samo: oba mieszkają na hoście aplikacji, a człowiek
    // mógł tu trafić ze starego linku albo przepisując adres z ręki. Fragment z tokenem
    // przeżywa przekierowanie, bo przeglądarka nigdy go nie wysyła i nie gubi.
    if ((req.route === 'panel' || req.route === 'app_page') && navigates) {
      return { kind: 'redirect', location: `${split.appUrl}${req.url}` };
    }
    return NOT_FOUND;
  }

  if (req.route === 'site' && navigates) {
    // Korzeń hosta aplikacji to wejście panelu, nie strony; pozostała treść strony
    // (`/pobierz/`, `/dokumentacja/…`) odsyła tam, gdzie mieszka.
    if (pathOf(req.url) === '/') return { kind: 'redirect', location: PANEL_ENTRY };
    return { kind: 'redirect', location: `${split.siteUrl}${req.url}` };
  }
  return PASS;
}

export function registerHostSplit(app: FastifyInstance, split: HostSplit | null): void {
  if (split == null) return;

  app.addHook('onRequest', async (req, reply) => {
    const decision = decideHostSplit(split, {
      hostname: req.hostname,
      method: req.method,
      url: req.url,
      route: routeKindOf(req.routeOptions.url, pathOf(req.url)),
    });
    // 301, nie 302: adresy są stałe z definicji (człowiek ma zapamiętać właściwy),
    // a przeglądarka wolno nie pytać drugi raz.
    if (decision.kind === 'redirect') return reply.redirect(decision.location, 301);
    if (decision.kind === 'not_found') return reply.code(404).send({ error: 'not_found' });
  });
}
