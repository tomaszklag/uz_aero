/**
 * Ninerdeck (serwer) - REJESTRACJA E-MAILEM (2.1.0, `docs/logowanie-haslem.md` §5.4a;
 * issue #132 B6/B7/B9; decyzja z przeglądu makiet 2026-09-17 odwracająca D9).
 *
 * „Załóż konto" (00H) jest TYM SAMYM mechanizmem, co „Nie pamiętam hasła" - list
 * z linkiem i strona `/haslo/` - z jedną różnicą: osoba powstaje DOPIERO przy realizacji
 * linku, w tej samej transakcji, co hasło. Test pilnuje:
 *  • odpowiedź `202` jest IDENTYCZNA dla adresu wolnego i zajętego; różnią się listy;
 *  • realizacja zakłada osobę BEZ członkostwa i z hasłem; logowanie kończy się `202`
 *    z tokenem osoby - dokładnie tam, gdzie osoba po pierwszym logowaniu Googlem;
 *  • wyścig (adres zajęto po wysłaniu listu) kończy się resetem dla TEJ osoby, nie drugą
 *    osobą o tym samym adresie.
 */

import { describe, expect, it } from 'vitest';

import { tokenIn } from './fakeMail.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const PASSWORD = 'pierwsze-haslo-nowej-osoby';

const signup = (app: App, name: string, email: string) =>
  app.inject({ method: 'POST', url: '/auth/signup', payload: { name, email } });
const reset = (app: App, token: string, password: string) =>
  app.inject({ method: 'POST', url: '/auth/password/reset', payload: { token, password } });
const passwordLogin = (app: App, login: string, password: string) =>
  app.inject({ method: 'POST', url: '/auth/password', payload: { login, password } });

describe('rejestracja e-mailem (§5.4a)', () => {
  it('adres wolny i zajęty dostają IDENTYCZNĄ odpowiedź; listy są różne', async () => {
    const { app, db, mail } = await testHarness();

    const fresh = await signup(app, 'Nowa Osoba', 'Nowa@Example.com');
    const taken = await signup(app, 'Ktoś Inny', 'tomasz@ninerdeck.pl');
    expect(fresh.statusCode).toBe(202);
    expect(taken.statusCode).toBe(202);
    expect(taken.body).toBe(fresh.body);

    expect(mail.lastTo('nowa@example.com')!.subject).toBe('Ninerdeck - załóż hasło do nowego konta');
    expect(mail.lastTo('tomasz@ninerdeck.pl')!.subject).toBe('Ninerdeck - masz już konto');
    // Adres zajęty NIE dostaje tokenu rejestracji - jego list resetuje hasło ISTNIEJĄCEJ osoby.
    const { rows } = await db.query<{ kind: string; pilot_id: string | null; email: string | null }>(
      `SELECT kind, pilot_id, email FROM password_reset_tokens ORDER BY kind`,
    );
    expect(rows).toEqual([
      { kind: 'reset', pilot_id: 'TMK', email: null },
      { kind: 'signup', pilot_id: null, email: 'nowa@example.com' },
    ]);
  });

  it('realizacja linku zakłada osobę BEZ członkostwa i z hasłem w jednej transakcji', async () => {
    const { app, db, mail } = await testHarness();
    await signup(app, '  Nowa Osoba ', 'Nowa@Example.com');
    const token = tokenIn(mail.lastTo('nowa@example.com')!);

    // Przed kliknięciem osoby NIE MA - list nie zakłada konta.
    expect((await db.query(`SELECT 1 FROM pilots WHERE lower(email) = 'nowa@example.com'`)).rows).toHaveLength(0);

    expect((await reset(app, token, PASSWORD)).statusCode).toBe(204);

    const person = (await db.query<{ id: string; name: string; email: string; active: boolean }>(
      `SELECT id, name, email, active FROM pilots WHERE lower(email) = 'nowa@example.com'`,
    )).rows;
    expect(person).toHaveLength(1);
    expect(person[0]).toMatchObject({ name: 'Nowa Osoba', email: 'nowa@example.com', active: true });
    expect((await db.query(`SELECT 1 FROM memberships WHERE pilot_id = $1`, [person[0]!.id])).rows).toHaveLength(0);
    expect((await db.query(`SELECT set_via FROM password_credentials WHERE pilot_id = $1`, [person[0]!.id])).rows[0]).toEqual({ set_via: 'link' });

    // Logowanie hasłem kończy się tam, gdzie osoba po pierwszym logowaniu Googlem: 202 + token osoby.
    const login = await passwordLogin(app, 'nowa@example.com', PASSWORD);
    expect(login.statusCode, login.body).toBe(202);
    expect(login.json()).toMatchObject({ status: 'none', memberships: [], person: { name: 'Nowa Osoba', email: 'nowa@example.com' } });
    expect(typeof login.json().personToken).toBe('string');
  });

  it('link „masz już konto" ustawia hasło istniejącej osobie - bez drugiej osoby', async () => {
    const { app, db, mail } = await testHarness();
    await signup(app, 'Ktoś Inny', 'tomasz@ninerdeck.pl');
    expect((await reset(app, tokenIn(mail.lastTo('tomasz@ninerdeck.pl')!), PASSWORD)).statusCode).toBe(204);

    expect((await passwordLogin(app, 'tomasz@ninerdeck.pl', PASSWORD)).statusCode).toBe(200);
    const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM pilots WHERE lower(email) = 'tomasz@ninerdeck.pl'`);
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('wyścig: adres zajęto po wysłaniu listu → link działa jak reset dla TEJ osoby', async () => {
    const { app, db, mail } = await testHarness();
    await signup(app, 'Nowa Osoba', 'nowa@example.com');
    const token = tokenIn(mail.lastTo('nowa@example.com')!);

    // W międzyczasie ktoś z tym adresem zalogował się Googlem pierwszy raz.
    await db.query(`INSERT INTO pilots (id, name, email, active) VALUES ('z-google', 'Nowa Z Google', 'nowa@example.com', TRUE)`);

    expect((await reset(app, token, PASSWORD)).statusCode).toBe(204);
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM pilots WHERE lower(email) = 'nowa@example.com'`);
    expect(rows).toEqual([{ id: 'z-google' }]);
    expect((await db.query(`SELECT 1 FROM password_credentials WHERE pilot_id = 'z-google'`)).rows).toHaveLength(1);
    expect((await passwordLogin(app, 'nowa@example.com', PASSWORD)).statusCode).toBe(202);
  });

  it('drugi list na ten sam adres zużywa pierwszy token', async () => {
    const { app, mail } = await testHarness();
    await signup(app, 'Nowa Osoba', 'nowa@example.com');
    const first = tokenIn(mail.lastTo('nowa@example.com')!);
    await signup(app, 'Nowa Osoba', 'NOWA@example.com');
    const second = tokenIn(mail.lastTo('nowa@example.com')!);

    expect((await reset(app, first, PASSWORD)).statusCode).toBe(401);
    expect((await reset(app, second, PASSWORD)).statusCode).toBe(204);
  });

  it('polityka hasła zna imię i adres z TOKENU - słabe hasło nie spala linku', async () => {
    const { app, mail } = await testHarness();
    await signup(app, 'Nowa Osoba', 'nowa@example.com');
    const token = tokenIn(mail.lastTo('nowa@example.com')!);

    expect((await reset(app, token, 'osoba-lata-wysoko-2026')).json()).toEqual({ error: 'weak_password', reason: 'contains_name' });
    expect((await reset(app, token, 'nowa@example.com-x')).json()).toEqual({ error: 'weak_password', reason: 'contains_email' });
    expect((await reset(app, token, PASSWORD)).statusCode).toBe(204);
  });

  it('formularz waliduje kształt (400), a panel tej trasy NIE MA', async () => {
    const { app } = await testHarness();
    expect((await signup(app, 'X', 'nowa@example.com')).statusCode).toBe(400);
    expect((await signup(app, 'Nowa Osoba', 'to-nie-adres')).statusCode).toBe(400);
    // Z nagłówkiem CSRF, żeby dojść do routera - bez niego strażnik odbija 403 wszystko pod `/admin/api`.
    const panel = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/signup',
      headers: ADMIN_CSRF_HEADERS,
      payload: { name: 'A B', email: 'a@b.pl' },
    });
    expect(panel.statusCode).toBe(404);
  });

  it('osoba z rejestracji podpina Google po tym samym adresie - jedna osoba, dwa dowody', async () => {
    const { app, db, mail, identityProvider } = await testHarness();
    await signup(app, 'Nowa Osoba', 'nowa@example.com');
    expect((await reset(app, tokenIn(mail.lastTo('nowa@example.com')!), PASSWORD)).statusCode).toBe(204);

    identityProvider.register('google-nowa', {
      provider: 'google',
      subject: 'google-sub-nowa',
      email: 'nowa@example.com',
      emailVerified: true,
      name: 'Nowa Osoba',
    });
    const google = await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: 'google-nowa' } });
    expect(google.statusCode).toBe(202);
    const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM pilots WHERE lower(email) = 'nowa@example.com'`);
    expect(Number(rows[0]!.n)).toBe(1);
  });
});
