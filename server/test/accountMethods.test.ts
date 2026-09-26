/**
 * Ninerdeck (serwer) - CZYM TA OSOBA MOŻE WEJŚĆ (2.1.0, issue #134 D4/D5/D6;
 * mockupy `piloci-konto`, `konto`, `organizacje-klub`).
 *
 * Trzy miejsca panelu zadają to samo pytanie i do 2.1.0 żadne nie miało z czego
 * odpowiedzieć: plakietki „Google" / „hasło" w karcie członka, karta „Logowanie"
 * na `#/konto` i stan zaproszenia pierwszego administratora klubu.
 *
 * Wspólny mianownik wszystkich przypadków niżej: odpowiedź mówi, JAKIE METODY istnieją,
 * i ani słowa o samych poświadczeniach - żadnego skrótu hasła, żadnego tokenu linku.
 * „Administrator wysyła, nie dyktuje" (§5.4) obowiązuje także drut.
 */

import { describe, expect, it } from 'vitest';

import { tokenIn } from './fakeMail.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const PASSWORD = 'tablet-w-kabinie-2026';

async function panelCookie(app: App, code: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(code) },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.cookies.find((c) => c.name === 'ninerdeck_admin')!.value;
}

/** Metody KONKRETNEGO członka z listy klubu - tej, którą rysuje karta w szufladzie. */
async function methodsOf(app: App, cookie: string, code: string): Promise<string[]> {
  const res = await app.inject({
    method: 'GET',
    url: '/admin/api/pilots?limit=200',
    cookies: { ninerdeck_admin: cookie },
  });
  expect(res.statusCode, res.body).toBe(200);
  const item = (res.json().items as { code: string; loginMethods: string[] }[]).find(
    (i) => i.code === code,
  );
  expect(item, `nie ma członka ${code} na liście`).toBeDefined();
  return item!.loginMethods;
}

describe('plakietki metod w karcie członka (D4)', () => {
  it('pusto, dopóki nikt nie wszedł; Google po logowaniu; hasło po realizacji linku', async () => {
    const { app, mail } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');

    // Administrator właśnie wszedł Googlem, więc ma dokładnie jedną metodę…
    expect(await methodsOf(app, cookie, 'AKO')).toEqual(['google']);
    // …a członkini, której nikt jeszcze nie wpuścił, NIE MA ŻADNEJ. To jest stan
    // prawdziwy, nie brak danych: konto założone adresem czeka na pierwsze wejście.
    expect(await methodsOf(app, cookie, 'BNO')).toEqual([]);

    // Administrator wysyła TEN SAM list, który pilotka wysłałaby sobie sama…
    const sent = await app.inject({
      method: 'POST',
      url: '/admin/api/pilots/BNO/password-link',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
    });
    expect(sent.statusCode, sent.body).toBe(200);
    // …i nie widzi w odpowiedzi ani linku, ani tokenu - sam adres i termin.
    expect(Object.keys(sent.json()).sort()).toEqual(['expiresAt', 'sentTo']);

    // Sam wysłany list metody NIE DODAJE - dodaje ją dopiero ustawione hasło.
    const letter = mail.lastTo('barbara@ninerdeck.pl')!;
    expect(await methodsOf(app, cookie, 'BNO')).toEqual([]);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/password/reset', payload: { token: tokenIn(letter), password: PASSWORD } })).statusCode,
    ).toBe(204);

    expect(await methodsOf(app, cookie, 'BNO')).toEqual(['password']);

    // Kolejność jest kolejnością plakietek w mockupie: Google przed hasłem, także
    // wtedy, gdy hasło powstało wcześniej.
    const google = await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor('BNO') } });
    expect(google.statusCode, google.body).toBe(200);
    expect(await methodsOf(app, cookie, 'BNO')).toEqual(['google', 'password']);
  });

  it('lista nie niesie ani skrótu hasła, ani niczego, czym dałoby się wejść', async () => {
    const { app } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/pilots?limit=200',
      cookies: { ninerdeck_admin: cookie },
    });
    expect(res.body).not.toContain('scrypt$');
    expect(res.body).not.toContain('/haslo/');
  });
});

describe('moje konto w panelu (`GET /admin/api/me/account`, D6)', () => {
  it('oddaje adres i metody zalogowanego - i rośnie o hasło po jego ustawieniu', async () => {
    const { app, mail } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');

    const before = await app.inject({
      method: 'GET',
      url: '/admin/api/me/account',
      cookies: { ninerdeck_admin: cookie },
    });
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json()).toEqual({ email: 'adam@ninerdeck.pl', methods: ['google'] });

    // Hasło ustawia się TĄ SAMĄ komendą, co na telefonie - osoba bez hasła nie podaje
    // obecnego, bo nie ma czego podać.
    const set = await app.inject({
      method: 'PUT',
      url: '/admin/api/me/password',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
      payload: { next: PASSWORD },
    });
    expect(set.statusCode, set.body).toBe(204);
    expect(mail.sent).toHaveLength(0);

    const after = await app.inject({
      method: 'GET',
      url: '/admin/api/me/account',
      cookies: { ninerdeck_admin: cookie },
    });
    expect(after.json()).toEqual({ email: 'adam@ninerdeck.pl', methods: ['google', 'password'] });
  });

  it('odpowiada też sesji PLATFORMOWEJ - hasło ma każdy zalogowany, nie tylko klub', async () => {
    const { app } = await testHarness();
    const cookie = await panelCookie(app, 'ROOT');

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/me/account',
      cookies: { ninerdeck_admin: cookie },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().methods).toEqual(['google']);
  });

  it('bez sesji nie odpowiada wcale', async () => {
    const { app } = await testHarness();
    expect((await app.inject({ method: 'GET', url: '/admin/api/me/account' })).statusCode).toBe(401);
  });
});

describe('moje konto na TELEFONIE (`GET /me/account`, issue #135 E7)', () => {
  /**
   * Telefon pyta o to z jednego powodu: wiersz w sekcji „Hasło" nazywa się „Ustaw hasło"
   * albo „Zmień hasło", a różnicę robi obecność poświadczenia. Bez tej trasy aplikacja
   * musiałaby zgadywać - a zgadnięcie w jedną stronę znaczy formularz proszący o hasło,
   * którego nie ma, w drugą - milczące nadpisanie istniejącego.
   */
  it('mówi DWOMA „tak/nie", a po ustawieniu hasła zmienia odpowiedź', async () => {
    const { app } = await testHarness();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('AKO') },
    });
    expect(login.statusCode, login.body).toBe(200);
    const token = login.json().token as string;

    const before = await app.inject({
      method: 'GET',
      url: '/me/account',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json()).toEqual({
      email: 'adam@ninerdeck.pl',
      hasGoogle: true,
      hasPassword: false,
    });

    const set = await app.inject({
      method: 'PUT',
      url: '/me/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { next: PASSWORD },
    });
    expect(set.statusCode, set.body).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: '/me/account',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.json()).toEqual({
      email: 'adam@ninerdeck.pl',
      hasGoogle: true,
      hasPassword: true,
    });
  });

  it('nie niesie ani skrótu hasła, ani niczego, czym dałoby się wejść', async () => {
    const { app } = await testHarness();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('AKO') },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/me/account',
      headers: { authorization: `Bearer ${login.json().token}` },
    });
    expect(res.body).not.toContain('scrypt$');
    expect(res.body).not.toContain('/haslo/');
  });
});

describe('zaproszenie na karcie klubu (D5)', () => {
  it('żyje na karcie do czasu realizacji linku, a „wszedł" obejmuje wejście HASŁEM', async () => {
    const { app, clock, mail } = await testHarness();
    const cookie = await panelCookie(app, 'ROOT');

    const created = await app.inject({
      method: 'POST',
      url: '/admin/api/organizations',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
      payload: {
        name: 'Aeroklub Delta',
        slug: 'aeroklub-delta',
        admin: { name: 'Dorota Delta', email: 'dorota@delta.pl', code: 'DDE' },
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const orgId = created.json().organization.id as string;

    const cardOf = async (): Promise<{
      signedIn: boolean;
      invite: { sentAt: string; expiresAt: string } | null;
    }> => {
      const res = await app.inject({
        method: 'GET',
        url: `/admin/api/organizations/${orgId}`,
        cookies: { ninerdeck_admin: cookie },
      });
      expect(res.statusCode, res.body).toBe(200);
      return res.json().organization.admins[0];
    };

    // Zaproszenie przeżywa odświeżenie strony: karta czyta je z bazy, a nie z pamięci
    // tej karty przeglądarki, w której kliknięto „Załóż klub".
    const waiting = await cardOf();
    expect(waiting.signedIn).toBe(false);
    expect(waiting.invite).toEqual({ sentAt: expect.any(String), expiresAt: expect.any(String) });
    expect(
      new Date(waiting.invite!.expiresAt).getTime() - new Date(waiting.invite!.sentAt).getTime(),
    ).toBe(72 * 3_600_000);

    // Realizacja linku zużywa go, więc nota gaśnie - nie ma już nic w drodze.
    const letter = mail.lastTo('dorota@delta.pl')!;
    expect(
      (await app.inject({ method: 'POST', url: '/auth/password/reset', payload: { token: tokenIn(letter), password: PASSWORD } })).statusCode,
    ).toBe(204);
    expect((await cardOf()).invite).toBeNull();

    // I najważniejsze: administratorka, która weszła HASŁEM, nie jest już „tą, która
    // się nie zalogowała" - choć tożsamości Google nie ma i mieć nie musi.
    expect((await cardOf()).signedIn).toBe(false);
    clock.advance(1_000);
    const login = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/password',
      headers: ADMIN_CSRF_HEADERS,
      payload: { email: 'dorota@delta.pl', password: PASSWORD },
    });
    expect(login.statusCode, login.body).toBe(200);

    const entered = await cardOf();
    expect(entered.signedIn).toBe(true);
    expect(entered.invite).toBeNull();
  });
});
