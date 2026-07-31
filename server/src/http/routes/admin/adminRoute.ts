/**
 * UZ Aero (serwer) — deklaracja trasy panelu administracyjnego.
 *
 * **Zdolność jest ATRYBUTEM trasy, a nie zdaniem w ciele handlera.** Dzięki temu
 * odpowiedź na pytanie „czego wymaga ten endpoint" da się wyczytać z jednej linii
 * i wygrepować z całego katalogu — a handler dostaje `Actor` gotowego, więc nie ma
 * jak zapomnieć sprawdzenia, bo nie ma jak go pominąć.
 *
 * **Prefiks `/admin/api`, nie `/admin`.** `/admin/*` jest zarezerwowane pod statyczny
 * build panelu (`@fastify/static`), a statyczny wildcard i trasa API w jednym drzewie
 * routingu dają tryb awarii wyjątkowo trudny do zdiagnozowania: żądanie API obsłużone
 * plikiem HTML. Prefiks stoi tu w jednym miejscu, żeby nie dało się go przeoczyć
 * w kolejnym pliku tras.
 *
 * Autoryzacja zostaje na `Authorization: Bearer` — tak samo jak trasy telefonu.
 * Sesja przeglądarkowa na ciasteczku (`docs/architektura-panelu-serwer.md` §8) czeka
 * na klienta panelu: kodu obsługi ciasteczka nie byłoby dziś czym sprawdzić.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Actor } from '../../../application/admin/ports.ts';
import type { Identity, TokenService } from '../../../application/ports.ts';
import type { Capability } from '../../../domain/roles.ts';
import { authorizeCapability } from '../../authorize.ts';

/** Ścieżka API panelu. Statyczny build panelu stanie pod `/admin/*`. */
export const ADMIN_API_PREFIX = '/admin/api';

export interface AdminRouteSpec {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Ścieżka WZGLĘDEM `ADMIN_API_PREFIX`, np. `/flags/:id/resolve`. */
  url: string;
  capability: Capability;
}

/**
 * `Identity` (z tokenu) + adres żądania → `Actor` (do audytu). Jedyne miejsce, w którym
 * to złączenie zachodzi.
 *
 * Rola pochodzi dziś z tokenu, tak jak na wszystkich trasach telefonu. Docelowo
 * czyta się ją przy każdym żądaniu panelu ze ŚWIEŻEGO konta (§8.5), żeby odebranie
 * uprawnień działało natychmiast, a nie po wygaśnięciu tokenu — to część przekroju 0
 * (`requireAdminActor`) i wchodzi razem z sesją przeglądarkową. Dziś różnica jest
 * ograniczona TTL-em tokenu dostępu, a `AuthCommands.refresh` już bierze rolę z konta.
 */
function actorFrom(identity: Identity, req: FastifyRequest): Actor {
  return { pilotId: identity.pilotId, role: identity.role, ip: req.ip ?? null };
}

export function adminRoute(
  app: FastifyInstance,
  tokens: TokenService,
  spec: AdminRouteSpec,
  handler: (req: FastifyRequest, reply: FastifyReply, actor: Actor) => Promise<unknown>,
): void {
  app.route({
    method: spec.method,
    url: `${ADMIN_API_PREFIX}${spec.url}`,
    handler: async (req, reply) => {
      // Bramy `panel.access` nie dokładamy obok zdolności właściwej dla operacji:
      // mapa w `domain/roles.ts` nie przyznaje ŻADNEJ zdolności panelu roli, która
      // nie ma wejścia do panelu, więc druga kontrola nie odrzuciłaby niczego,
      // co przeszło pierwszą. Dwupoziomowa brama z §8.6 ma sens dopiero przy
      // scope'ie z logowaniem panelu (wtedy niesie komunikat ekranu A00).
      const outcome = authorizeCapability(tokens, req.headers.authorization, spec.capability);
      if (!outcome.ok) return reply.code(outcome.status).send(outcome.body);

      return handler(req, reply, actorFrom(outcome.identity, req));
    },
  });
}
