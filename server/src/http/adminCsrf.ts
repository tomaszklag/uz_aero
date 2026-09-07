/**
 * UZ Aero (serwer) - obrona przed CSRF dla tras panelu (`docs/architektura-panelu-serwer.md` §8.3).
 *
 * Ciasteczko sesji panelu jedzie automatycznie z każdym żądaniem przeglądarki - także
 * z żądaniem wywołanym przez CUDZĄ stronę. `SameSite=Strict` to zamyka, ale jest
 * polityką przeglądarki, więc stoi obok niego drugi, niezależny mechanizm:
 *
 * **każda mutacja `/admin/api/*` musi nieść nagłówek `X-UZ-Admin: 1`.**
 *
 * Skuteczność bierze się stąd, że nagłówka niestandardowego nie da się wysłać
 * cross-origin bez preflightu, a serwer nie wysyła ŻADNYCH nagłówków CORS - więc
 * preflight nie przechodzi. Tabeli tokenów CSRF nie zakładamy: przy jednym originie
 * (§8.7) byłaby ruchomą częścią bez zysku.
 *
 * Brama jest hookiem na całej instancji, a nie zdaniem w `adminRoute`: `POST
 * /admin/api/auth/login` jest trasą PUBLICZNĄ (nie przechodzi przez `adminRoute`),
 * a to właśnie logowanie jest najbardziej klasycznym celem login-CSRF. Jedno miejsce
 * obsługuje obie rodziny tras i nie da się go pominąć, dopisując plik.
 */

import type { FastifyInstance } from 'fastify';

import { ADMIN_API_PREFIX } from './routes/admin/adminRoute.ts';

export const ADMIN_CSRF_HEADER = 'x-uz-admin';

/** Metody bez skutków ubocznych - przeglądarka wysyła je też jako nawigację. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function registerAdminCsrfGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    if (SAFE_METHODS.has(req.method)) return;
    if (!req.url.startsWith(`${ADMIN_API_PREFIX}/`)) return;

    if (req.headers[ADMIN_CSRF_HEADER] == null) {
      // 403, nie 401: poświadczenie może być całkowicie poprawne - odrzucamy
      // POCHODZENIE żądania. „Zaloguj się" byłoby tu fałszywą podpowiedzią.
      return reply.code(403).send({ error: 'csrf_header_required' });
    }
  });
}
