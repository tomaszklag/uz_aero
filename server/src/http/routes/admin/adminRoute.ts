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
 * Token przychodzi z `tokenFromRequest` — nagłówek `Bearer` (skrypty, telefon) ALBO
 * ciasteczko sesji panelu (przeglądarka). Trasa nie wie, który to kanał i wiedzieć
 * nie musi: brama uprawnień jest jedna (`http/authorize.ts`), a wejście do niej
 * rozstrzyga jeden plik (`http/tokenFromRequest.ts`).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Actor } from '../../../application/admin/ports.ts';
import type {
  PilotAuthSnapshot,
  PilotsPort,
  TokenService,
} from '../../../application/common/ports.ts';
import type { Capability } from '../../../domain/roles.ts';
import { authorizeAccount } from '../../authorize.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

/** Ścieżka API panelu. Statyczny build panelu stanie pod `/admin/*`. */
export const ADMIN_API_PREFIX = '/admin/api';

/**
 * Zależności BRAMY, wspólne dla wszystkich tras panelu.
 *
 * Jeden obiekt zamiast dwóch parametrów w każdej funkcji `register*`: brama ma dziś
 * dwa wejścia (weryfikacja tokenu i odczyt konta), a trzecie — gdyby kiedyś doszło —
 * ma się dołożyć TUTAJ, a nie w sześciu sygnaturach naraz.
 */
export interface AdminGate {
  tokens: TokenService;
  /**
   * Konta czytane PRZY KAŻDYM ŻĄDANIU panelu — patrz `authorizeAccount`. To ten sam
   * port, którym loguje się telefon: panel i aplikacja mają jedną tabelę kont, bo to
   * ci sami ludzie.
   */
  accounts: PilotsPort;
}

export interface AdminRouteSpec {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Ścieżka WZGLĘDEM `ADMIN_API_PREFIX`, np. `/flags/:id/resolve`. */
  url: string;
  capability: Capability;
}

/**
 * Świeże konto (z bazy) + adres żądania → `Actor` (do audytu). Jedyne miejsce, w którym
 * to złączenie zachodzi.
 *
 * Rola pochodzi z KONTA, nie z claimu tokenu (zmiana 2026-08-01, przekrój A06 —
 * uzasadnienie stoi przy `authorizeAccount`). Dzięki temu jeden odczyt obsługuje naraz
 * dwie rzeczy: bramę uprawnień i `admin_audit.actor_role`, czyli rolę Z CHWILI AKCJI.
 *
 * Wejściem jest PROJEKCJA konta bez hasha (`PilotAuthSnapshot`), nie pełne konto
 * logowania: warstwa HTTP nie ma powodu widzieć `password_hash`, a przy każdym żądaniu
 * panelu widziała go do 2026-08-01.
 */
function actorFrom(account: PilotAuthSnapshot, req: FastifyRequest): Actor {
  return { pilotId: account.id, role: account.role, ip: req.ip ?? null };
}

export function adminRoute(
  app: FastifyInstance,
  gate: AdminGate,
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
      const outcome = await authorizeAccount(
        gate.tokens,
        gate.accounts,
        tokenFromRequest(req),
        spec.capability,
      );
      if (!outcome.ok) return reply.code(outcome.status).send(outcome.body);

      return handler(req, reply, actorFrom(outcome.account, req));
    },
  });
}
