/**
 * Ninerdeck (serwer) - `POST /auth/switch { orgId }`: przełączenie klubu w telefonie
 * (wielofirmowość §6, §7.3; issue #102, ekran 13A).
 *
 * Cienka jak reszta warstwy HTTP: zod → komenda → status. Cała decyzja o tym, KTO może
 * przełączyć się DOKĄD, mieszka w `AuthCommands.switchClub`.
 *
 *  • `200` + nowa para tokenów (i komplet klubów osoby - z tego telefon rysuje listę na 13A);
 *  • `404` klub, którego ta osoba nie ma albo w którym nie jest aktywna - cudzy klub jest
 *    dla niej NIEISTNIEJĄCY (epik C: 403 potwierdzałoby, że taki klub jest);
 *  • `401` za tokenem nikt nie stoi, poświadczenia unieważnione albo to nie jest token klubu.
 *
 * ══ DLACZEGO TU, A NIE W `routes/common/auth.ts` ══
 * Ten sam powód, co przy `POST /auth/join`: to jest trasa WYŁĄCZNIE telefonu. Panel ma
 * własne przełączenie zakresu (`POST /admin/api/auth/switch`), bo tam sesja to jeden token
 * w ciasteczku i dochodzi do niej platforma - inne wejście, inne wyjście, inna brama CSRF.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthCommands } from '../../../application/common/commands/auth.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

/**
 * Identyfikator klubu z listy członkostw, którą telefon dostał przy logowaniu. Sufit
 * chroni przed megabajtem, nie waliduje kształtu: identyfikator nieznany dostaje `404`,
 * tak samo jak cudzy - jedna odpowiedź, nic się nie ujawnia.
 */
const switchBody = z.object({ orgId: z.string().trim().min(1).max(64) });

export function registerSwitchRoutes(app: FastifyInstance, auth: AuthCommands): void {
  app.post('/auth/switch', async (req, reply) => {
    const parsed = switchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const person = auth.identifyPerson(tokenFromRequest(req));
    if (person == null) return reply.code(401).send({ error: 'unauthorized' });

    const result = await auth.switchClub(person, parsed.data.orgId);
    if (result.ok) return reply.send(result.tokens);
    return result.reason === 'not_found'
      ? reply.code(404).send({ error: 'not_found' })
      : reply.code(401).send({ error: 'unauthorized' });
  });
}
