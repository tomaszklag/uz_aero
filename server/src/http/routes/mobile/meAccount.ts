/**
 * Ninerdeck (serwer) - `GET /me/account`: czym zalogowany może się zalogować
 * (2.1.0, `docs/logowanie-haslem.md` §5.3; issue #135 E7).
 *
 * Telefon pyta o to w USTAWIENIACH i tylko tam: obecność hasła rozstrzyga, czy wiersz
 * w sekcji „Hasło" nazywa się „Ustaw hasło" (bez pola na obecne), czy „Zmień hasło"
 * (z nim). Bez tej trasy aplikacja musiałaby zgadywać - a zgadnięcie w tę stronę znaczy
 * formularz proszący o hasło, którego nie ma; w tamtą - milczące nadpisanie istniejącego.
 *
 * ══ OSOBNO OD `GET /reference` ══
 * Tamto jest CACHE'EM KLUBU (flota, członkowie) z ETagiem i wiekiem: doklejenie tam
 * metod jednej osoby unieważniałoby cały cache przy każdym ustawieniu hasła, a czytałoby
 * się z niego coś, co do klubu nie należy. Metody są własnością OSOBY - ta sama odpowiedź
 * w każdym jej klubie.
 *
 * Brama członkostwa jak wszędzie na trasach telefonu: hasło ustawia ktoś, kto już wszedł
 * do klubu. Osoba bez klubu ma własną drogę - link z e-maila.
 */

import type { FastifyInstance } from 'fastify';

import type { AccountQuery } from '../../../application/common/queries/account.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';

export function registerMeAccountRoutes(
  app: FastifyInstance,
  accounts: AccountQuery,
  gate: MemberGate,
): void {
  app.get('/me/account', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const account = await accounts.of(who.pilotId);
    // `null` = token przeżył konto; to jest prawda o sesji, nie o żądaniu.
    if (account == null) return reply.code(401).send({ error: 'unauthorized' });

    // Telefon dostaje DWA „tak/nie" zamiast listy napisów: rysuje z nich jeden wiersz
    // ustawień, a nie rząd plakietek jak panel - słownik plakietek byłby tu kontraktem
    // bez odbiorcy.
    return reply.send({
      email: account.email,
      hasGoogle: account.hasGoogle,
      hasPassword: account.hasPassword,
    });
  });
}
