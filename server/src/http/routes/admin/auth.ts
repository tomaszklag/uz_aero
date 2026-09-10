/**
 * UZ Aero (serwer) - sesja przeglądarkowa panelu (`/admin/api/auth/*`, mockupy
 * `00-logowanie`, `00a-wybor-klubu`).
 *
 * Logowanie i wylogowanie NIE przechodzą przez `adminRoute` - i muszą takie być, bo
 * logowanie jest z definicji publiczne (test architektury wymienia ten plik imiennie,
 * żeby wyjątek był decyzją, a nie luką). Przełączenie zakresu (issue #101, E2) już bramę
 * ma - to trasa dla ZALOGOWANEGO, tylko obu rodzajów sesji naraz (`sessionRoute`).
 *
 * **Token jedzie WYŁĄCZNIE do ciasteczka `HttpOnly`, nigdy do ciała odpowiedzi.**
 * Gdyby ciało niosło token, panel mógłby go odłożyć „na chwilę" do `localStorage`,
 * a wtedy cała ochrona przed XSS-em z §8.2 kończy się na pierwszym takim `const`.
 * Panel dostaje w zamian tożsamość i listę zdolności - dokładnie tyle, ile potrzebuje
 * do narysowania sidebara.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type {
  AuthCommands,
  PanelPilot,
  PanelScopes,
  PanelSession,
} from '../../../application/common/commands/auth.ts';
import { capabilitiesOf, platformCapabilitiesOf } from '../../../domain/roles.ts';
import { ADMIN_SESSION_COOKIE, tokenFromRequest } from '../../tokenFromRequest.ts';
import { sessionRoute, ADMIN_API_PREFIX, type AdminGate } from './adminRoute.ts';

const loginBody = z.object({ idToken: z.string().min(1).max(4096) });

/**
 * Cel przełączenia: identyfikator klubu albo `null` = platforma.
 *
 * `null` jest WARTOŚCIĄ, nie brakiem pola (`.nullable()`, nie `.optional()`): zejście na
 * platformę to wybór, a puste ciało byłoby żądaniem bez celu. Stąd pole wymagane.
 */
const switchBody = z.object({ orgId: z.string().min(1).max(100).nullable() });

/**
 * Atrybuty ciasteczka sesji panelu (§8.2). Stoją w JEDNEJ stałej, bo `clearCookie`
 * musi podać te same `path`/`sameSite`, żeby w ogóle trafić w to ciasteczko -
 * rozjazd atrybutów daje wylogowanie, które nic nie wylogowuje.
 *
 * `path: '/admin'` - ciasteczko nie jedzie z żądaniami telefonu (`/events`, `/reference`).
 * `secure` bez warunku na środowisko: przeglądarki traktują `http://localhost` jako
 * kontekst bezpieczny, więc dev działa, a produkcja nie ma jak dostać wersji bez flagi.
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/admin',
} as const;

/**
 * Tożsamość + KLUB + zdolności - ten sam kształt zwraca `GET /admin/api/me` (patrz `me.ts`).
 *
 * `org` jest kontekstem całej sesji (wielofirmowość §8.2): panel rysuje z niego nazwę
 * klubu w kolumnie bocznej i nie pyta o nią drugi raz. Kod i rola są kodem i rolą
 * Z CZŁONKOSTWA w tym klubie.
 */
export const panelSessionToWire = (pilot: PanelPilot, scopes: PanelScopes) => ({
  pilot: { id: pilot.id, code: pilot.code, name: pilot.name, role: pilot.role },
  org: pilot.org,
  capabilities: capabilitiesOf(pilot.role),
  scopes,
});

/**
 * Sesja PLATFORMOWA superadministratora: bez klubu (`org: null`) i bez kodu - kod jest
 * własnością członkostwa, a superadministrator go nie ma. Panel po `org === null`
 * poznaje, że ma narysować ramę superadministratora (issue #101, E1).
 */
export const platformSessionToWire = (
  pilot: Extract<PanelSession, { kind: 'platform' }>['pilot'],
  scopes: PanelScopes,
) => ({
  pilot: {
    id: pilot.id,
    code: null,
    name: pilot.name,
    role: pilot.platformRole,
  },
  org: null,
  capabilities: platformCapabilitiesOf(pilot.platformRole),
  scopes,
});

/** Sesja → ciało odpowiedzi. Jedno miejsce, bo logowanie i przełączenie oddają to samo. */
const sessionToWire = (session: PanelSession) =>
  session.kind === 'org'
    ? panelSessionToWire(session.pilot, session.scopes)
    : platformSessionToWire(session.pilot, session.scopes);

/** Ciasteczko + ciało - jedno miejsce, bo logowanie i przełączenie kończą się tak samo. */
function sendSession(reply: FastifyReply, session: PanelSession): unknown {
  return reply
    .setCookie(ADMIN_SESSION_COOKIE, session.token, {
      ...COOKIE_OPTIONS,
      maxAge: session.ttlSec,
    })
    .send(sessionToWire(session));
}

/**
 * Wspólne ciało obu gałęzi przełączenia: rodzaj sesji ŹRÓDŁOWEJ nie ma tu znaczenia -
 * liczy się tożsamość i cel.
 *
 * Chwilę wydania ciasteczka bierzemy z TOKENU, a nie od bramy: to ona rozstrzyga, czy
 * poświadczenie jest starsze niż unieważnienie członkostwa (patrz `panelSwitch`).
 * Porównanie `pilotId` z bramą jest asercją spójności - obie drogi czytają ten sam
 * token, więc rozjazd znaczyłby błąd złożenia, nie cudzą sesję.
 */
async function switchScope(
  auth: AuthCommands,
  req: FastifyRequest,
  reply: FastifyReply,
  pilotId: string,
): Promise<unknown> {
  const body = switchBody.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: 'bad_request' });

  const request = auth.identifyPanel(tokenFromRequest(req));
  if (request == null || request.pilotId !== pilotId) {
    return reply.code(401).send({ error: 'unauthorized' });
  }

  const outcome = await auth.panelSwitch(request, body.data.orgId);
  if (!outcome.ok) {
    return reply
      .code(outcome.reason === 'not_found' ? 404 : 401)
      .send({ error: outcome.reason });
  }

  return sendSession(reply, outcome.session);
}

export function registerAdminAuthRoutes(
  app: FastifyInstance,
  auth: AuthCommands,
  /** Identyfikator klienta Google WEB - panel pobiera go stąd, żeby narysować przycisk. */
  googleWebClientId: string,
  gate: AdminGate,
): void {
  /**
   * Konfiguracja przycisku Google - PUBLICZNA, bo pyta o nią ekran logowania, czyli
   * ktoś bez sesji. Identyfikator klienta nie jest sekretem (stoi w każdym żądaniu
   * do Google i w kodzie każdej aplikacji, która go używa); tym, co chroni konta,
   * jest weryfikacja `aud` po naszej stronie, nie tajność tej liczby.
   */
  app.get(`${ADMIN_API_PREFIX}/auth/google-client`, async (_req, reply) =>
    reply.send({ clientId: googleWebClientId }),
  );

  app.post(`${ADMIN_API_PREFIX}/auth/login`, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const result = await auth.panelLoginWithProvider(parsed.data.idToken);
    if (!result.ok) {
      // 403 dla konta ROZPOZNANEGO, które nie ma wstępu: tożsamość jest poprawna
      // i człowiek ma prawo wiedzieć, dlaczego go nie wpuszczamy - w żadnym klubie nie
      // jest administratorem (`no_panel_access`; od epiku D obejmuje też osobę, która
      // dopiero zalogowała się pierwszy raz i nie ma klubu). 401 zostaje dla tokenu,
      // którego nie da się zweryfikować, i dla osoby zablokowanej.
      const known = result.reason === 'no_panel_access';
      return reply.code(known ? 403 : 401).send({ error: result.reason });
    }

    return sendSession(reply, result.session);
  });

  /**
   * PRZEŁĄCZENIE ZAKRESU sesji panelu (mockup `00a-wybor-klubu`; issue #101, E2).
   *
   * `orgId` = klub, `null` = platforma (moduł Organizacje). Nowe ciasteczko, ten sam
   * token Google w tle - „Zmień klub" nie każe logować się od nowa.
   *
   * ══ DLACZEGO TO NIE JEST TRASA MODUŁU, TYLKO TRASA SESJI ══
   * Bo zadaje ją zarówno administrator klubu (A → B), jak i superadministrator
   * (platforma → klub i z powrotem), a żaden z nich nie pyta o dane modułu. Stąd
   * `sessionRoute`: brama przepuszcza oba rodzaje sesji, a o tym, czy cel jest
   * osiągalny, rozstrzyga komenda - z BAZY, nie z claimów ciasteczka.
   *
   * Klub, którego ta osoba nie ma, odpowiada **404**, nie 403: cudzy klub jest dla niej
   * nieistniejący (epik C, issue #99 - 403 potwierdzałoby, że taki klub jest).
   */
  sessionRoute(app, gate, { method: 'POST', url: '/auth/switch' }, {
    org: (req, reply, actor) => switchScope(auth, req, reply, actor.pilotId),
    platform: (req, reply, actor) => switchScope(auth, req, reply, actor.pilotId),
  });

  /**
   * Wylogowanie kasuje ciasteczko i nie pyta o nic więcej. Nie wymaga ważnej sesji
   * celowo: sesja wygasła albo uszkodzona to dokładnie ten stan, w którym użytkownik
   * klika „Wyloguj" - odbicie go 401 zostawiłoby martwe ciasteczko w przeglądarce.
   * Bramą przed wylogowaniem z cudzej strony jest nagłówek CSRF (`http/adminCsrf.ts`).
   */
  app.post(`${ADMIN_API_PREFIX}/auth/logout`, async (_req, reply) =>
    reply.clearCookie(ADMIN_SESSION_COOKIE, COOKIE_OPTIONS).code(204).send(),
  );
}
