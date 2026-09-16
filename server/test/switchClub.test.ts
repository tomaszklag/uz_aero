/**
 * Ninerdeck (serwer) - PRZEŁĄCZENIE KLUBU W TELEFONIE (`POST /auth/switch`;
 * wielofirmowość §6, §7.3; issue #102, epik F).
 *
 * Pilot w dwóch klubach pracuje w JEDNYM naraz, a zmiana kontekstu to nowa para tokenów -
 * nie nagłówek w żądaniu. Trasa jest przez to jedynym miejscem telefonu, w którym cudzy
 * identyfikator klubu jedzie w ciele żądania.
 *
 * Własności, których złamanie jest luką, a nie usterką:
 *  1. **token OSOBY tędy nie przechodzi** - tokeny klubu wydaje mu wyłącznie
 *     `GET /auth/memberships` i DOKŁADNIE RAZ (audyt 2026-09-05); ta trasa byłaby obejściem;
 *  2. **cel sprawdzany od zera** - członkostwo `active` w KLUBIE DOCELOWYM, nie w źródłowym;
 *  3. **cudzy klub to 404** - nie 403, bo 403 potwierdzałoby, że taki klub jest;
 *  4. **unieważnienie poświadczeń obejmuje przełączenie** - stary token nie mieni nowej
 *     pary po wyłączeniu członkostwa w celu;
 *  5. **nowa para jest parą DLA CELU** - `org` w odpowiedzi i klub aktywny przy następnym
 *     logowaniu (`lastOrgFor` czyta najświeższy refresh).
 *
 * Izolację samej trasy (TMK → Beta) trzyma `tenantIsolation.test.ts`; tutaj chodzi o pilota,
 * który NAPRAWDĘ ma dwa kluby - w świecie testowym jest nim PWI (`PWI` w Alfie, `PWB` w Becie).
 */

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function loginOf(app: Harness['app'], code: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(code) },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as {
    token: string;
    refreshToken: string;
    org: { id: string; slug: string; name: string };
    pilot: { id: string; code: string; name: string; role: string };
    memberships: { org: { id: string }; code: string }[];
  };
}

const switchTo = (app: Harness['app'], token: string | null, orgId: unknown) =>
  app.inject({
    method: 'POST',
    url: '/auth/switch',
    headers: token == null ? {} : { authorization: `Bearer ${token}` },
    payload: { orgId },
  });

describe('POST /auth/switch - przełączenie klubu w telefonie', () => {
  it('wydaje parę tokenów DLA KLUBU DOCELOWEGO, z kodem pilota z tamtego członkostwa', async () => {
    const { app } = await testHarness();
    const login = await loginOf(app, 'PWI');
    // Bez historii refreshów klub aktywny to pierwszy alfabetycznie - Alfa.
    expect(login.org.id).toBe(ORG_A);
    expect(login.pilot.code).toBe('PWI');

    const res = await switchTo(app, login.token, ORG_B);
    expect(res.statusCode, res.body).toBe(200);
    const next = res.json();

    expect(next.org.id).toBe(ORG_B);
    // KOD JEST WŁASNOŚCIĄ CZŁONKOSTWA: ten sam człowiek, inny klub, inny kod (§3.2).
    expect(next.pilot.code).toBe('PWB');
    expect(next.refreshToken).not.toBe(login.refreshToken);
    // Komplet klubów jedzie dalej - z tego telefon rysuje listę na 13A.
    expect(next.memberships.map((m: { org: { id: string } }) => m.org.id).sort()).toEqual([ORG_A, ORG_B]);
  });

  it('nowa para jest parą dla celu - kolejne logowanie wchodzi już do tamtego klubu', async () => {
    const { app, clock } = await testHarness();
    const login = await loginOf(app, 'PWI');
    // Zegar musi ruszyć, bo „ostatnio używany klub" to NAJŚWIEŻSZY refresh po
    // `created_at`; przy zegarze zamrożonym oba wiersze mają tę samą chwilę i rozstrzyga
    // porządek zapasowy (skrót tokenu), czyli rzut monetą. W produkcji chwila logowania
    // i chwila przełączenia nigdy nie są tą samą milisekundą.
    clock.advance(60_000);
    expect((await switchTo(app, login.token, ORG_B)).statusCode).toBe(200);

    expect((await loginOf(app, 'PWI')).org.id).toBe(ORG_B);
  });

  it('klub, w którym ta osoba nie lata, jest NIEISTNIEJĄCY (404, bez tokenów)', async () => {
    const { app } = await testHarness();
    const login = await loginOf(app, 'TMK'); // wyłącznie Alfa

    const res = await switchTo(app, login.token, ORG_B);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('identyfikator klubu, którego nie ma, dostaje TĘ SAMĄ odpowiedź co cudzy', async () => {
    const { app } = await testHarness();
    const login = await loginOf(app, 'TMK');

    expect((await switchTo(app, login.token, 'org-nie-ma')).statusCode).toBe(404);
  });

  it('członkostwo w celu WYŁĄCZONE - nie ma dokąd przełączyć', async () => {
    const { app, db } = await testHarness();
    const login = await loginOf(app, 'PWI');
    await db.query(`UPDATE memberships SET status = 'disabled' WHERE org_id = $1 AND pilot_id = 'PWI'`, [ORG_B]);

    expect((await switchTo(app, login.token, ORG_B)).statusCode).toBe(404);
  });

  it('klub docelowy WYŁĄCZONY przez superadministratora - też 404', async () => {
    const { app, db } = await testHarness();
    const login = await loginOf(app, 'PWI');
    await db.query('UPDATE organizations SET active = FALSE WHERE id = $1', [ORG_B]);

    expect((await switchTo(app, login.token, ORG_B)).statusCode).toBe(404);
  });

  it('unieważnienie poświadczeń W CELU odcina stary token (nie da się obejść przełączeniem)', async () => {
    const { app, db, clock } = await testHarness();
    const login = await loginOf(app, 'PWI');
    await db.query(
      `UPDATE memberships SET credentials_valid_from = $1 WHERE org_id = $2 AND pilot_id = 'PWI'`,
      [new Date(clock.now().getTime() + 1000).toISOString(), ORG_B],
    );

    expect((await switchTo(app, login.token, ORG_B)).statusCode).toBe(404);
  });

  it('osoba wyłączona PLATFORMOWO nie przełącza się nigdzie', async () => {
    const { app, db } = await testHarness();
    const login = await loginOf(app, 'PWI');
    await db.query(`UPDATE pilots SET active = FALSE WHERE id = 'PWI'`);

    const res = await switchTo(app, login.token, ORG_B);
    expect(res.statusCode).toBe(401);
  });

  it('TOKEN OSOBY tędy nie przechodzi - to obejście jednorazowości z GET /auth/memberships', async () => {
    const { app, db } = await testHarness();
    // PWI zostaje bez aktywnego członkostwa: logowanie oddaje wtedy token OSOBY (202).
    await db.query(`UPDATE memberships SET status = 'pending', code = NULL WHERE pilot_id = 'PWI'`);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('PWI') },
    });
    expect(res.statusCode).toBe(202);
    const personToken = res.json().personToken as string;

    // Klub wraca do porządku, ale token osoby nadal nie jest drogą do jego tokenów.
    await db.query(`UPDATE memberships SET status = 'active', code = 'PWB' WHERE org_id = $1 AND pilot_id = 'PWI'`, [ORG_B]);
    const denied = await switchTo(app, personToken, ORG_B);
    expect(denied.statusCode).toBe(401);
    expect(denied.body).not.toContain('refreshToken');
  });

  it('bez tokenu i bez klubu w ciele - 401 i 400, nie 500', async () => {
    const { app } = await testHarness();

    expect((await switchTo(app, null, ORG_A)).statusCode).toBe(401);
    const login = await loginOf(app, 'TMK');
    expect((await switchTo(app, login.token, '')).statusCode).toBe(400);
  });
});
