/**
 * Ninerdeck (serwer) - ADRES E-MAIL ZAPISUJE SIĘ ZNORMALIZOWANY (2.1.0, issue #132 B1;
 * `docs/logowanie-haslem.md` §4.4).
 *
 * Od 2.1.0 adres jest LOGINEM, a migracja 9 dokłada `idx_pilots_email_lower` - unikalność
 * liczoną po `lower(email)`. Odczyty i sprawdzenia kolizji robiły `lower()` od dawna, ale
 * ZAPIS zostawiał to, co przyszło z formularza albo od dostawcy, więc w bazie mogły stać
 * dwa różne napisy na jedną osobę („Jan@X.pl" i „jan@x.pl"), a panel pokazywałby ten,
 * który akurat wpisano ostatni.
 *
 * Reguła jest JEDNA (`domain/email.ts`), więc i test jest jeden - dla WSZYSTKICH czterech
 * dróg, którymi adres trafia na `pilots`. Osobne asercje w czterech plikach testowych
 * rozjechałyby się przy piątej drodze; tutaj widać całą listę naraz i widać, gdy urośnie.
 *
 * Czego ten test NIE sprawdza: `external_identities.email` zostaje TAKI, JAKI PRZYSZEDŁ
 * od dostawcy - to zapis o cudzym koncie, materiał dla administratora przy decyzji,
 * a nie login. Porównania z nim i tak idą przez `lower()`.
 */

import { describe, expect, it } from 'vitest';

import { seed } from '../src/infrastructure/pg/seed.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { tokenIn } from './fakeMail.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const emailOf = async (db: Harness['db'], pilotId: string): Promise<string | null> => {
  const { rows } = await db.query<{ email: string | null }>('SELECT email FROM pilots WHERE id = $1', [pilotId]);
  return rows[0]?.email ?? null;
};

const emailIn = async (db: Harness['db'], like: string): Promise<string | null> => {
  const { rows } = await db.query<{ email: string }>(
    'SELECT email FROM pilots WHERE lower(email) = lower($1)',
    [like],
  );
  return rows[0]?.email ?? null;
};

async function panelCookie(app: App, code: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(code) },
  });
  expect(res.statusCode).toBe(200);
  return res.cookies.find((c) => c.name === 'ninerdeck_admin')!.value;
}

describe('adres e-mail zapisuje się znormalizowany (§4.4)', () => {
  it('PIERWSZE LOGOWANIE GOOGLEM: adres z profilu schodzi do małych liter', async () => {
    const { app, db, identityProvider } = await testHarness();
    identityProvider.register('google-nowy', {
      provider: 'google',
      subject: 'google-sub-nowy',
      email: '  Nowy.Pilot@Example.COM ',
      emailVerified: true,
      name: 'Nowy Pilot',
    });

    const res = await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: 'google-nowy' } });
    expect(res.statusCode).toBe(202);
    expect(await emailIn(db, 'nowy.pilot@example.com')).toBe('nowy.pilot@example.com');

    // Tożsamość u dostawcy zostaje taka, jaka przyszła - to nie jest login.
    const { rows } = await db.query<{ email: string }>(
      `SELECT email FROM external_identities WHERE subject = 'google-sub-nowy'`,
    );
    expect(rows[0]?.email).toBe('  Nowy.Pilot@Example.COM ');
  });

  it('ZAŁOŻENIE KLUBU: adres pierwszego administratora schodzi do małych liter', async () => {
    const { app, db } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/organizations',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: root },
      payload: {
        name: 'Aeroklub Gamma',
        slug: 'aeroklub-gamma',
        admin: { name: 'Grażyna Gamma', email: 'Grazyna.Gamma@Example.PL', code: 'GGA' },
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(await emailIn(db, 'grazyna.gamma@example.pl')).toBe('grazyna.gamma@example.pl');
    // Zaproszenie idzie na ten sam, znormalizowany adres.
    expect(res.json().invite.sentTo).toBe('grazyna.gamma@example.pl');
  });

  it('EDYCJA CZŁONKA W PANELU: nowy adres schodzi do małych liter', async () => {
    const { app, db } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');

    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/api/pilots/JSE',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
      payload: { email: 'Jan.Serafin@Ninerdeck.PL' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await emailOf(db, 'JSE')).toBe('jan.serafin@ninerdeck.pl');

    // Wyczyszczenie pola dalej znaczy „bez adresu", nie pusty napis.
    const cleared = await app.inject({
      method: 'PATCH',
      url: '/admin/api/pilots/JSE',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
      payload: { email: '' },
    });
    expect(cleared.statusCode).toBe(200);
    expect(await emailOf(db, 'JSE')).toBeNull();
  });

  it('REJESTRACJA E-MAILEM: adres z formularza schodzi do małych liter', async () => {
    const { app, db, mail } = await testHarness();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Nowa Osoba', email: '  Nowa.Osoba@Example.COM ' },
    });
    const token = tokenIn(mail.lastTo('nowa.osoba@example.com')!);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/password/reset', payload: { token, password: 'pierwsze-haslo-2026' } }))
        .statusCode,
    ).toBe(204);

    expect(await emailIn(db, 'nowa.osoba@example.com')).toBe('nowa.osoba@example.com');
  });

  it('SEED: adres superadministratora schodzi do małych liter', async () => {
    const { db } = await testHarness();
    await seed(db, { adminEmail: '  Szef@Aeroklub.PL ' });
    expect(await emailOf(db, 'admin')).toBe('szef@aeroklub.pl');
  });

  it('adres zapisany wielkimi literami NIE tworzy drugiej osoby (indeks migracji 9)', async () => {
    // Kontrola samej reguły: gdyby normalizacja gdzieś wypadła, ten wiersz wjechałby
    // obok istniejącego i `findByEmail` oddawałby raz jedną osobę, raz drugą.
    const { db } = await testHarness();
    await expect(
      db.query(`INSERT INTO pilots (id, name, email, active) VALUES ('dubel', 'Dubel', 'ADAM@ninerdeck.pl', TRUE)`),
    ).rejects.toThrow();
  });
});
