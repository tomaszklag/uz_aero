/**
 * UZ Aero (serwer) — wspólna autoryzacja tras: token → claims.
 *
 * Osobny moduł, bo używa go każda trasa poza `/auth/*` i `/health` — a wspólny kod
 * autoryzacji ma mieć jedno miejsce, w którym audyt czyta, co dokładnie przepuszczamy.
 *
 * **Wejściem jest TOKEN, nie nagłówek** (zmiana 2026-07-31, przekrój sesji
 * przeglądarkowej). Telefon nosi go w `Authorization: Bearer`, panel w ciasteczku
 * `HttpOnly` — a autoryzacja nie ma prawa istnieć w dwóch kopiach, po jednej na kanał.
 * Skąd token pochodzi, wie wyłącznie `http/tokenFromRequest.ts`; tutaj zostaje sama
 * decyzja, a funkcje pozostają czyste (testowalne bez Fastify).
 *
 * Dwa poziomy, celowo rozdzielone:
 *  • `authorize` — „czy to w ogóle ktoś zalogowany" (trasy aplikacji pilota);
 *  • `authorizeCapability` — „czy wolno mu TO zrobić" (trasy panelu, `/admin/api/*`).
 * Rozdział jest istotny, bo rozróżnia 401 od 403, a to są dla użytkownika dwie różne
 * wiadomości: „zaloguj się" i „twoja rola tego nie obejmuje". Mockup panelu wymaga
 * podania POWODU odmowy (`design/admin/`, reguła „nigdy cichy brak"), więc odpowiedź
 * niesie też wymaganą zdolność.
 */

import type { Identity, TokenService } from '../application/common/ports.ts';
import { can, type Capability } from '../domain/roles.ts';

export function authorize(tokens: TokenService, token: string | null): Identity | null {
  if (token == null) return null;
  return tokens.verify(token);
}

export type AuthOutcome =
  | { ok: true; identity: Identity }
  | { ok: false; status: 401; body: { error: 'unauthorized' } }
  | { ok: false; status: 403; body: { error: 'forbidden'; required: Capability } };

/**
 * Brama uprawnień dla tras panelu. Zwraca gotowy status i ciało odpowiedzi, żeby
 * żadna trasa nie wymyślała własnego kształtu odmowy — 403 z innym polem w innym
 * miejscu to dokładnie ten rodzaj rozjazdu, przed którym broni istnienie tego pliku.
 */
export function authorizeCapability(
  tokens: TokenService,
  token: string | null,
  capability: Capability,
): AuthOutcome {
  const identity = authorize(tokens, token);
  if (identity == null) return { ok: false, status: 401, body: { error: 'unauthorized' } };

  if (!can(identity.role, capability)) {
    return { ok: false, status: 403, body: { error: 'forbidden', required: capability } };
  }
  return { ok: true, identity };
}
