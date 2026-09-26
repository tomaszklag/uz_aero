/**
 * Ninerdeck (serwer) - trasy HASŁA bez sesji (2.1.0, `docs/logowanie-haslem.md` §5.1,
 * §5.4, §5.4a, §5.7; issue #132 B7). `common/`, bo `POST /auth/password/forgot`
 * i `POST /auth/password/reset` woła zarówno aplikacja pilota, jak i panel oraz
 * strona `/haslo/`; logowanie telefonu i rejestracja stoją tu obok, bo dzielą
 * z nimi komendę.
 *
 * Cienkie jak reszta: zod → komenda → status. Tabela odpowiedzi jest w dokumencie
 * i tu ma się z nim zgadzać co do kodu:
 *  • `POST /auth/password` → `200` tokeny / `202` token osoby / `401 invalid_credentials`
 *    (JEDNA odpowiedź na trzy stany) / `401 account_disabled` / `429` + `Retry-After`;
 *  • `POST /auth/password/forgot`, `POST /auth/signup` → ZAWSZE `202`, niezależnie od tego,
 *    czy adres istnieje i czy limit wysyłek jest wyczerpany (§8 pkt 2); OBIE mają lustro
 *    pod prefiksem panelu (`admin/auth.ts`, issue #180) na TYM SAMYM handlerze;
 *  • `POST /auth/password/reset` → `204` bez sesji / `401 invalid_token` (obcy, po terminie,
 *    zużyty - jednakowo) / `400 weak_password { reason }`;
 *  • `GET /auth/methods` → `{ google, password: true }` - telefon rysuje z tego przyciski;
 *    pola o sposobie resetu NIE MA, bo poczta jest wymaganiem serwera.
 */

import type { FastifyInstance, FastifyReply, RouteHandlerMethod } from 'fastify';
import { PASSWORD_MAX_LENGTH } from '@ninerdeck/domain';
import { z } from 'zod';

import type { AuthCommands } from '../../../application/common/commands/auth.ts';
import type {
  ChangePasswordOutcome,
  PasswordCommands,
} from '../../../application/common/commands/passwords.ts';
import { deviceFrom } from '../../device.ts';
import { membershipToWire } from './auth.ts';

/**
 * Hasło bez `.min()`: minimum egzekwuje POLITYKA domeny (`weak_password`), a przy
 * LOGOWANIU krótkie hasło ma dostać to samo `invalid_credentials`, co każde inne złe.
 * Sufit stoi tu, bo scrypt liczy się na całości (§3 D4).
 */
export const passwordField = z.string().min(1).max(PASSWORD_MAX_LENGTH);

const loginBody = z.object({
  login: z.string().trim().min(1).max(200),
  password: passwordField,
  orgId: z.string().min(1).max(100).optional(),
});

const forgotBody = z.object({ email: z.string().trim().min(3).max(200) });

const signupBody = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
});

const resetBody = z.object({
  token: z.string().min(1).max(200),
  password: passwordField,
});

/** `429` z `Retry-After` - ten sam kształt, co `POST /auth/join`. */
export function tooManyAttempts(reply: FastifyReply, retryAfterSec: number): unknown {
  return reply
    .header('Retry-After', String(retryAfterSec))
    .code(429)
    .send({ error: 'too_many_attempts', retryAfterSec });
}

/**
 * Ustawienie / zmiana hasła (§5.3) - JEDNO ciało i JEDNA tabela odpowiedzi dla telefonu
 * (`PUT /me/password`) i panelu (`PUT /admin/api/me/password`); różni je wyłącznie brama.
 * `current` opcjonalne, bo osoba BEZ hasła (dziś każdy zalogowany Googlem) ustawia pierwsze
 * bez niego; komenda wymaga go, gdy hasło JUŻ jest.
 */
export const changePasswordBody = z.object({
  current: passwordField.optional(),
  next: passwordField,
});

export function sendChangeOutcome(reply: FastifyReply, outcome: ChangePasswordOutcome): unknown {
  if (outcome.ok) return reply.code(204).send();
  switch (outcome.reason) {
    case 'invalid_credentials':
      return reply.code(401).send({ error: 'invalid_credentials' });
    case 'email_required':
      return reply.code(409).send({ error: 'email_required' });
    case 'weak_password':
      return reply.code(400).send({ error: 'weak_password', reason: outcome.weakness });
    case 'rate_limited':
      return tooManyAttempts(reply, outcome.retryAfterSec);
  }
}

/**
 * „Nie pamiętam hasła" - `202` ZAWSZE. Odpowiedź nie niesie nic poza kodem: zdanie
 * „jeśli adres jest w systemie, link już idzie" pisze ekran, nie serwer.
 *
 * Handler jest WYEKSPORTOWANY, bo tę samą prośbę składa telefon (`/auth/password/forgot`)
 * i panel (`/admin/api/auth/password/forgot`, `admin/auth.ts`). Panel woła wyłącznie
 * `/admin/api/*` - jeden origin, nagłówek CSRF - więc trasa istniejąca tylko pod
 * `/auth/…` była dla niego 404 od 2.1.0 do issue #180, a ekran chował to za zdaniem
 * „link już idzie". Dwie rejestracje, JEDEN kod: rozjazd między nimi byłby drugim
 * takim błędem.
 */
export function forgotHandler(passwords: PasswordCommands): RouteHandlerMethod {
  return async (req, reply) => {
    const parsed = forgotBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    await passwords.forgot(parsed.data.email, req.ip ?? null);
    return reply.code(202).send({ status: 'accepted' });
  };
}

/**
 * „Załóż konto" (00H w telefonie, `#/logowanie/konto` w panelu od issue #180) - `202`
 * ZAWSZE; adres zajęty dostaje list resetu, nie odmowę (§5.4a). Ten sam handler pod
 * dwoma prefiksami z tego samego powodu, co `forgotHandler`.
 */
export function signupHandler(passwords: PasswordCommands): RouteHandlerMethod {
  return async (req, reply) => {
    const parsed = signupBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    await passwords.signUp(parsed.data.name, parsed.data.email, req.ip ?? null);
    return reply.code(202).send({ status: 'accepted' });
  };
}

export function registerPasswordRoutes(
  app: FastifyInstance,
  auth: AuthCommands,
  passwords: PasswordCommands,
  /** Identyfikator klienta Google ANDROID - `null`, dopóki telefon nie ma builda z Google. */
  googleAndroidClientId: string | null,
): void {
  app.post('/auth/password', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const result = await auth.loginWithPassword({
      login: parsed.data.login,
      password: parsed.data.password,
      orgId: parsed.data.orgId ?? null,
      device: deviceFrom(req),
    });
    if (result.ok) return reply.send(result.tokens);

    switch (result.reason) {
      case 'no_club':
        // Osoba jest, klubu nie ma - dokładnie ta sama odpowiedź, co po Google (§5.1).
        return reply.code(202).send({
          status: result.clubs.status,
          personToken: result.personToken,
          memberships: result.clubs.memberships.map(membershipToWire),
          person: result.clubs.person,
        });
      case 'rate_limited':
        return tooManyAttempts(reply, result.retryAfterSec);
      case 'invalid_credentials':
      case 'account_disabled':
        return reply.code(401).send({ error: result.reason });
    }
  });

  app.post('/auth/password/forgot', forgotHandler(passwords));
  app.post('/auth/signup', signupHandler(passwords));

  /** Realizacja linku ze strony `/haslo/` - BEZ sesji w odpowiedzi (§5.4). */
  app.post('/auth/password/reset', async (req, reply) => {
    const parsed = resetBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const outcome = await passwords.resetByLink(parsed.data.token, parsed.data.password);
    if (outcome.ok) return reply.code(204).send();
    if (outcome.reason === 'weak_password') {
      return reply.code(400).send({ error: 'weak_password', reason: outcome.weakness });
    }
    return reply.code(401).send({ error: 'invalid_token' });
  });

  /**
   * Metody logowania telefonu (§5.7) - publiczne, bo pyta o nie ekran 00A, czyli ktoś
   * bez sesji. Identyfikator klienta nie jest sekretem (uzasadnienie przy
   * `GET /admin/api/auth/google-client`).
   */
  app.get('/auth/methods', async (_req, reply) =>
    reply.send({
      google: googleAndroidClientId == null ? null : { clientId: googleAndroidClientId },
      password: true,
    }),
  );
}
