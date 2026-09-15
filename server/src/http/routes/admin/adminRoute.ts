/**
 * Ninerdeck (serwer) - deklaracja trasy panelu administracyjnego.
 *
 * **Zdolność jest ATRYBUTEM trasy, a nie zdaniem w ciele handlera.** Dzięki temu
 * odpowiedź na pytanie „czego wymaga ten endpoint" da się wyczytać z jednej linii
 * i wygrepować z całego katalogu - a handler dostaje `Actor` gotowego, więc nie ma
 * jak zapomnieć sprawdzenia, bo nie ma jak go pominąć.
 *
 * **Prefiks `/admin/api`, nie `/admin`.** `/admin/*` jest zarezerwowane pod statyczny
 * build panelu (`@fastify/static`), a statyczny wildcard i trasa API w jednym drzewie
 * routingu dają tryb awarii wyjątkowo trudny do zdiagnozowania: żądanie API obsłużone
 * plikiem HTML. Prefiks stoi tu w jednym miejscu, żeby nie dało się go przeoczyć
 * w kolejnym pliku tras.
 *
 * Token przychodzi z `tokenFromRequest` - nagłówek `Bearer` (skrypty, telefon) ALBO
 * ciasteczko sesji panelu (przeglądarka). Trasa nie wie, który to kanał i wiedzieć
 * nie musi: brama uprawnień jest jedna (`http/authorize.ts`), a wejście do niej
 * rozstrzyga jeden plik (`http/tokenFromRequest.ts`).
 *
 * ══ TRASA KLUBU (wielofirmowość, issue #98) ══
 * Każda trasa zarejestrowana tą funkcją jest trasą KLUBU: klub przychodzi z tokenu
 * sesji, brama sprawdza członkostwo w nim, a handler dostaje `Actor` z `orgId`. Trasy
 * PLATFORMOWE superadministratora (moduł Organizacje, epik E) dostaną własną deklarację
 * na `authorizePlatform` - inny token, inny działający, inny wpis audytu.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Actor, PlatformActor } from '../../../application/admin/ports.ts';
import type {
  MembershipAuthSnapshot,
  PilotsPort,
  TokenService,
} from '../../../application/common/ports.ts';
import type { Capability } from '../../../domain/roles.ts';
import { authorizeOrg, authorizePlatform } from '../../authorize.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

/** Ścieżka API panelu. Statyczny build panelu stanie pod `/admin/*`. */
export const ADMIN_API_PREFIX = '/admin/api';

/**
 * Zależności BRAMY, wspólne dla wszystkich tras panelu.
 *
 * Jeden obiekt zamiast dwóch parametrów w każdej funkcji `register*`: brama ma dziś
 * dwa wejścia (weryfikacja tokenu i odczyt członkostwa), a trzecie - gdyby kiedyś
 * doszło - ma się dołożyć TUTAJ, a nie w sześciu sygnaturach naraz.
 */
export interface AdminGate {
  tokens: TokenService;
  /**
   * Członkostwa czytane PRZY KAŻDYM ŻĄDANIU panelu - patrz `authorizeOrg`. To ten sam
   * port, którym loguje się telefon: panel i aplikacja mają jedną tabelę osób i jedną
   * tabelę członkostw, bo to ci sami ludzie.
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
 * Świeże członkostwo (z bazy) + adres żądania → `Actor` (do audytu). Jedyne miejsce,
 * w którym to złączenie zachodzi.
 *
 * Rola pochodzi z CZŁONKOSTWA, nie z claimu tokenu (zmiana 2026-08-01, przekrój A06 -
 * uzasadnienie stoi przy `authorizeOrg`). Dzięki temu jeden odczyt obsługuje naraz
 * dwie rzeczy: bramę uprawnień i `admin_audit.actor_role`, czyli rolę Z CHWILI AKCJI.
 * Klub idzie z tego samego wiersza - to klub tokenu, potwierdzony członkostwem.
 */
function actorFrom(account: MembershipAuthSnapshot, req: FastifyRequest): Actor {
  return {
    pilotId: account.pilotId,
    orgId: account.orgId,
    role: account.role,
    ip: req.ip ?? null,
  };
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
      const outcome = await authorizeOrg(
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

/**
 * Trasa PLATFORMOWA - superadministrator bez klubu (wielofirmowość §3.3; issue #99, C6).
 *
 * Ten sam prefiks i ta sama deklaracja zdolności, co `adminRoute`, ale INNA brama
 * (`authorizePlatform`: rodzaj tokenu `platform`, rola z `pilots.platform_role`) i inny
 * działający: `PlatformActor` nie ma klubu, więc handler nie ma jak przypadkiem
 * przefiltrować danych po klubie, którego nie ma. Wpis audytu takiej akcji dostaje
 * `org_id` pusty. Pierwszym użytkownikiem są zgłoszenia błędów - lista dla wszystkich
 * klubów naraz; moduł Organizacje (epik E) dochodzi tą samą deklaracją.
 */
/**
 * Trasa, na którą odpowiadają OBA rodzaje sesji panelu (issue #101, E2).
 *
 * Istnieje dla pytań, które zadaje sama SESJA, a nie moduł: „kim jestem" (`GET /me`)
 * i „przełącz mnie" (`POST /auth/switch`). Administrator klubu i superadministrator
 * zadają je tak samo, a odpowiadają na nie inne dane - więc trasa jest jedna, a handlery
 * dwa. Sklejenie ich w jeden z gałęzią `if (actor.orgId == null)` kazałoby każdemu
 * czytelnikowi rozstrzygać rodzaj sesji w środku, zamiast czytać go z sygnatury.
 *
 * Rodzaj rozstrzyga TOKEN, nie kolejność prób: token klubu i platformowy są rozłączne
 * (`verify` / `verifyPlatform` odrzucają się nawzajem, `hs256Tokens.test.ts`). Gdy nie
 * jest ani jednym, ani drugim, odpowiada brama KLUBU - bo to jej 401 znaczy dla panelu
 * „zaloguj się", a zdecydowana większość sesji jest sesjami klubu.
 */
export function sessionRoute(
  app: FastifyInstance,
  gate: AdminGate,
  spec: { method: AdminRouteSpec['method']; url: string },
  handlers: {
    org: (req: FastifyRequest, reply: FastifyReply, actor: Actor) => Promise<unknown>;
    platform: (
      req: FastifyRequest,
      reply: FastifyReply,
      actor: PlatformActor,
    ) => Promise<unknown>;
  },
): void {
  app.route({
    method: spec.method,
    url: `${ADMIN_API_PREFIX}${spec.url}`,
    handler: async (req, reply) => {
      const token = tokenFromRequest(req);
      if (token != null && gate.tokens.verifyPlatform(token) != null) {
        const outcome = await authorizePlatform(gate.tokens, gate.accounts, token, 'platform.manage');
        if (!outcome.ok) return reply.code(outcome.status).send(outcome.body);

        return handlers.platform(req, reply, {
          pilotId: outcome.identity.pilotId,
          platformRole: outcome.platformRole,
          ip: req.ip ?? null,
        });
      }

      const outcome = await authorizeOrg(gate.tokens, gate.accounts, token, 'panel.access');
      if (!outcome.ok) return reply.code(outcome.status).send(outcome.body);

      return handlers.org(req, reply, actorFrom(outcome.account, req));
    },
  });
}

export function platformRoute(
  app: FastifyInstance,
  gate: AdminGate,
  spec: AdminRouteSpec,
  handler: (req: FastifyRequest, reply: FastifyReply, actor: PlatformActor) => Promise<unknown>,
): void {
  app.route({
    method: spec.method,
    url: `${ADMIN_API_PREFIX}${spec.url}`,
    handler: async (req, reply) => {
      const outcome = await authorizePlatform(
        gate.tokens,
        gate.accounts,
        tokenFromRequest(req),
        spec.capability,
      );
      if (!outcome.ok) return reply.code(outcome.status).send(outcome.body);

      return handler(req, reply, {
        pilotId: outcome.identity.pilotId,
        platformRole: outcome.platformRole,
        ip: req.ip ?? null,
      });
    },
  });
}
