/**
 * UZ Aero (serwer) — JEDYNE miejsce, które wie, SKĄD pochodzi token żądania.
 *
 * Telefon nosi token w `Authorization: Bearer`, przeglądarka panelu — w ciasteczku
 * `HttpOnly` (§8.2 `docs/architektura-panelu-serwer.md`). To dwa różne kanały tego
 * samego poświadczenia, więc autoryzacji NIE dublujemy: `http/authorize.ts` zostaje
 * jedną bramą, a zmienia się wyłącznie jej wejście — z nagłówka na napis.
 *
 * Dlaczego to osobny plik, a nie parametr `authorize(req)`: `authorize` jest czystą
 * funkcją nad napisem i testuje się bez Fastify. Wiedza o kształcie żądania ma mieć
 * jedno miejsce i nie jest nim moduł, w którym audyt czyta, co przepuszczamy.
 */

import type { FastifyRequest } from 'fastify';

/**
 * Nazwa ciasteczka sesji panelu. Stoi tu, a nie w trasie logowania, bo czyta ją
 * i strona wystawiająca (`routes/admin/auth.ts`), i strona sprawdzająca — a rozjazd
 * nazw byłby cichą awarią „zalogowany, ale wylogowany".
 */
export const ADMIN_SESSION_COOKIE = 'uzaero_admin';

/**
 * Token żądania: **nagłówek WYGRYWA z ciasteczkiem**.
 *
 * Żądanie niosące oba pochodzi z przeglądarki z doklejonym `Authorization` — i nie ma
 * prawa podnieść uprawnień przez to, że doklejono mu drugie poświadczenie. Jedna
 * kolejność, zapisana raz, zamiast domysłu w każdej trasie.
 *
 * `null` = brak poświadczenia (nie „złe poświadczenie" — o tym orzeka `authorize`).
 */
export function tokenFromRequest(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header != null && header.startsWith('Bearer ')) return header.slice('Bearer '.length);

  // `req.cookies` wstawia `@fastify/cookie`; bez wtyczki pole jest `undefined`
  // i trasy telefonu działają dokładnie jak dotąd.
  const cookie = req.cookies?.[ADMIN_SESSION_COOKIE];
  return cookie != null && cookie.length > 0 ? cookie : null;
}
