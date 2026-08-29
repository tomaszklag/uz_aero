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

const loginBody = z.object({
  login: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

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

export function registerAdminAuthRoutes(app: FastifyInstance, auth: AuthCommands): void {
  app.post(`${ADMIN_API_PREFIX}/auth/login`, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const result = await auth.panelLogin(parsed.data.login, parsed.data.password);
    if (!result.ok) {
      // 401 dla złych poświadczeń i konta wyłączonego (A00a: jeden komunikat, żeby
      // nie zdradzać, które loginy istnieją) - ale 403 dla konta bez roli panelu:
      // tam hasło było poprawne i człowiek ma prawo wiedzieć, dlaczego go nie wpuszczamy.
      const status = result.reason === 'no_panel_access' ? 403 : 401;
      return reply.code(status).send({ error: result.reason });
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
