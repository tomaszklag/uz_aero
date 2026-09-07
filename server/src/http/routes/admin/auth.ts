/**
 * UZ Aero (serwer) - sesja przeglądarkowa panelu (`/admin/api/auth/*`, mockupy A00/A00a).
 *
 * JEDYNE trasy panelu, które nie przechodzą przez `adminRoute` - i muszą takie być,
 * bo logowanie jest z definicji publiczne (test architektury wymienia ten plik
 * imiennie, żeby wyjątek był decyzją, a nie luką). Wszystko poza logowaniem
 * i wylogowaniem rejestruje się z bramą uprawnień.
 *
 * **Token jedzie WYŁĄCZNIE do ciasteczka `HttpOnly`, nigdy do ciała odpowiedzi.**
 * Gdyby ciało niosło token, panel mógłby go odłożyć „na chwilę" do `localStorage`,
 * a wtedy cała ochrona przed XSS-em z §8.2 kończy się na pierwszym takim `const`.
 * Panel dostaje w zamian tożsamość i listę zdolności - dokładnie tyle, ile potrzebuje
 * do narysowania sidebara.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthCommands, PanelPilot } from '../../../application/common/commands/auth.ts';
import { capabilitiesOf } from '../../../domain/roles.ts';
import { ADMIN_SESSION_COOKIE } from '../../tokenFromRequest.ts';
import { ADMIN_API_PREFIX } from './adminRoute.ts';

const loginBody = z.object({ idToken: z.string().min(1).max(4096) });

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

/** Tożsamość + zdolności - ten sam kształt zwraca `GET /admin/api/me` (patrz `me.ts`). */
export const panelSessionToWire = (pilot: PanelPilot) => ({
  pilot: { id: pilot.id, code: pilot.code, name: pilot.name, role: pilot.role },
  capabilities: capabilitiesOf(pilot.role),
});

export function registerAdminAuthRoutes(
  app: FastifyInstance,
  auth: AuthCommands,
  /** Identyfikator klienta Google WEB - panel pobiera go stąd, żeby narysować przycisk. */
  googleWebClientId: string,
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
      // i człowiek ma prawo wiedzieć, dlaczego go nie wpuszczamy - konto pilota nie
      // obejmuje panelu (`no_panel_access`) albo konta jeszcze nie ma, bo zgłoszenie
      // czeka na zatwierdzenie (`not_registered`). 401 zostaje dla tokenu, którego
      // nie da się zweryfikować, i dla konta wyłączonego.
      const known = result.reason === 'no_panel_access' || result.reason === 'not_registered';
      return reply.code(known ? 403 : 401).send({ error: result.reason });
    }

    return reply
      .setCookie(ADMIN_SESSION_COOKIE, result.session.token, {
        ...COOKIE_OPTIONS,
        maxAge: result.session.ttlSec,
      })
      .send(panelSessionToWire(result.session.pilot));
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
