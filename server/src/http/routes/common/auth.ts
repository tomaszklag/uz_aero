/**
 * UZ Aero (serwer) - trasy `/auth/*` (§3.0, §4.6).
 *
 * Cienkie jak cała warstwa HTTP: zod → komenda → status. Jedyna „logika" to mapowanie
 * wyniku komendy na kod odpowiedzi, a i ono jest w całości wypisane w tabelach
 * `docs/logowanie-google.md` §7 i `docs/wielofirmowosc.md` §5.
 *
 * ══ DLACZEGO OSOBA BEZ KLUBU DOSTAJE 202, A NIE 403 ══
 * Bo to nie jest odmowa, tylko „przyjęte, czekaj" (albo „wpisz kod klubu"). Aplikacja
 * ma na te stany OSOBNE ekrany (`00c`, `00d`, `00e`) i odróżnia je polem `status`
 * odpowiedzi, a od złego tokenu - kodem HTTP. Trzy różne wiadomości pod jednym kodem
 * zmusiłyby telefon do czytania treści błędu.
 *
 * `POST /auth/join` (kod klubu) mieszka w `routes/mobile/join.ts`: to trasa WYŁĄCZNIE
 * telefonu, a ten plik jest wspólny, bo `AuthCommands` obsługuje też logowanie panelu.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthCommands, ClubMembershipView } from '../../../application/common/commands/auth.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

/**
 * Token tożsamości od dostawcy. Górna granica jest hojna, bo tokeny Google z paroma
 * zakresami bywają długie - ale musi istnieć: bez niej trasa przyjmuje megabajt
 * do parsowania od kogokolwiek.
 */
const googleBody = z.object({ idToken: z.string().min(1).max(4096) });

const refreshBody = z.object({ refreshToken: z.string().min(1).max(500) });

/**
 * Członkostwo na drucie - daty jako ISO 8601. Jeden kształt dla trzech odpowiedzi
 * (logowanie, stan zgłoszeń, kod klubu), więc stoi tu, a `routes/mobile/join.ts` go importuje.
 */
export const membershipToWire = (m: ClubMembershipView) => ({
  org: m.org,
  clubActive: m.clubActive,
  status: m.status,
  code: m.code,
  role: m.role,
  rejectReason: m.rejectReason,
  createdAt: m.createdAt.toISOString(),
  decidedAt: m.decidedAt?.toISOString() ?? null,
});

export function registerAuthRoutes(app: FastifyInstance, auth: AuthCommands): void {
  app.post('/auth/google', async (req, reply) => {
    const parsed = googleBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const result = await auth.loginWithProvider(parsed.data.idToken);
    if (result.ok) return reply.send(result.tokens);

    // Osoba jest, aktywnego klubu nie ma (wielofirmowość §4, §5): 202 z tokenem OSOBY
    // i stanem, po którym aplikacja wybiera ekran - 00C (czeka), 00D (odrzucono),
    // 00E (wpisz kod klubu).
    if (result.reason === 'no_club') {
      return reply.code(202).send({
        status: result.clubs.status,
        personToken: result.personToken,
        memberships: result.clubs.memberships.map(membershipToWire),
      });
    }
    return reply.code(401).send({ error: result.reason });
  });

  /**
   * Stan osoby wobec klubów - dla ekranu `00c` (co kilkanaście sekund) i listy klubów
   * na `13a`. Przyjmuje token OSOBY albo token DOWOLNEGO klubu (§6); tokeny klubu wydaje
   * wyłącznie tokenowi osoby, dokładnie raz - reguły w `AuthCommands.membershipStatus`.
   *
   * Token bierzemy przez `tokenFromRequest`, bo to jedyne miejsce, które wie, skąd
   * pochodzi poświadczenie (test architektury pilnuje, że nikt nie czyta nagłówka sam).
   */
  app.get('/auth/memberships', async (req, reply) => {
    const person = auth.identifyPerson(tokenFromRequest(req));
    if (person == null) return reply.code(401).send({ error: 'unauthorized' });

    const status = await auth.membershipStatus(person);
    if (status.kind === 'unknown') return reply.code(404).send({ error: 'not_found' });
    if (status.kind === 'approved') {
      // Zatwierdzono w międzyczasie - pilot wchodzi do aplikacji BEZ ponownego
      // przechodzenia przez Google. To jest cała wartość tej trasy.
      return reply.send({ status: 'approved', tokens: status.tokens });
    }
    return reply.send({
      status: status.clubs.status,
      memberships: status.clubs.memberships.map(membershipToWire),
    });
  });

  app.post('/auth/refresh', async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const tokens = await auth.refresh(parsed.data.refreshToken);
    if (tokens == null) return reply.code(401).send({ error: 'invalid_refresh' });
    return reply.send(tokens);
  });
}
