/**
 * UZ Aero (serwer) - KOD KLUBU w panelu klubu (`/admin/api/club-code*`; mockup
 * `piloci-kod-klubu`; wielofirmowość §3.8, §8.3; issue #100, D2).
 *
 * Przekrój jest END-TO-END i to jest jego sens: kod klubu nie jest polem w formularzu,
 * tylko WŁĄCZNIKIEM jedynej drogi do klubu. Dlatego każdy przypadek kończy się próbą
 * `POST /auth/join` - sprawdzamy skutek, a nie zapis w kolumnie.
 *
 * Własności, których złamanie jest luką, a nie usterką:
 *  1. **rotacja unieważnia stary kod W TEJ SAMEJ CHWILI** - a zgłoszeń już złożonych
 *     nie rusza (są wierszami członkostw, nie kodem);
 *  2. **wyłączenie zamyka drogę do klubu CAŁKOWICIE** - bo innej nie ma, a odpowiedź
 *     jest taka sama, jak na kod zmyślony (nic się nie ujawnia);
 *  3. **kod jest jedyny na serwerze** - zderzenie z kodem innego klubu kończy się
 *     ponownym losowaniem, nie błędem i nie nadpisaniem cudzego kodu;
 *  4. **każda zmiana kodu ma ślad w dzienniku** z OBOMA kodami - „dlaczego kod, który mi
 *     podali, nie działa" musi mieć odpowiedź.
 */

import { describe, expect, it } from 'vitest';

import { CLUB_CODE_ALPHABET, CLUB_CODE_LENGTH } from '../src/domain/clubCode.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor, googleTokenForStranger } from './testIdentityProvider.ts';
import { ORG_A, ORG_A_CODE, ORG_B } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const admin = (token: string) => ({ authorization: `Bearer ${token}`, ...ADMIN_CSRF_HEADERS });

async function tokenOf(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().token as string;
}

/**
 * Bajty, z których `clubCodeFrom` złoży ZADANY kod - odwrotność mapowania `bajt % 32`.
 *
 * Dzięki temu test mówi „generator zwraca AAA-BBBB", a nie „generator zwraca bajty
 * 0,0,0,1,1,1,1" - a sprawdzenie dotyczy kodu, który widzi administrator.
 */
const bytesFor = (code: string): Uint8Array =>
  Uint8Array.from(
    [...code].map((ch) => {
      const index = CLUB_CODE_ALPHABET.indexOf(ch);
      // Bez tego strażnika literówka z `O` albo `I` (których w alfabecie NIE MA)
      // przechodziłaby jako -1, czyli bajt 255, i test porównywałby inny kod, niż napisał.
      expect(index, `${ch} nie jest znakiem kodu klubu`).toBeGreaterThanOrEqual(0);
      return index;
    }),
  );

/** Generator oddający kody PO KOLEI - do przypadku zderzenia z kodem innego klubu. */
function codeGenerator(...codes: string[]): (count: number) => Uint8Array {
  let next = 0;
  return (count) => {
    expect(count).toBe(CLUB_CODE_LENGTH);
    const code = codes[Math.min(next, codes.length - 1)]!;
    next += 1;
    return bytesFor(code);
  };
}

const state = (app: Harness['app'], token: string) =>
  app.inject({
    method: 'GET',
    url: '/admin/api/club-code',
    headers: { authorization: `Bearer ${token}` },
  });

const rotate = (app: Harness['app'], token: string) =>
  app.inject({ method: 'POST', url: '/admin/api/club-code/rotate', headers: admin(token) });

const disable = (app: Harness['app'], token: string) =>
  app.inject({ method: 'POST', url: '/admin/api/club-code/disable', headers: admin(token) });

/** Nieznajomy próbuje wejść do klubu podanym kodem - jedyny test skutku, jaki ma sens. */
async function joinWith(app: Harness['app'], subject: string, code: string) {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenForStranger(subject) },
  });
  expect(login.statusCode).toBe(202);
  return app.inject({
    method: 'POST',
    url: '/auth/join',
    headers: { authorization: `Bearer ${login.json().personToken}` },
    payload: { code },
  });
}

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    action: string;
    target_id: string;
    org_id: string | null;
    details: Record<string, unknown>;
  }>('SELECT action, target_id, org_id, details FROM admin_audit ORDER BY id');
  return rows;
}

describe('GET /admin/api/club-code - stan kodu', () => {
  it('oddaje kod w zapisie kanonicznym, chwilę od której obowiązuje i liczbę zgłoszeń', async () => {
    const { app } = await testHarness();
    await joinWith(app, 'czekajacy', ORG_A_CODE);

    const res = await state(app, await tokenOf(app, 'TMK'));

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Panel nie składa zapisu `XXX-XXXX` sam - dostaje go gotowego (jak nazwę karty arkusza).
    expect(body.code).toBe('AZG7K4M');
    expect(body.formatted).toBe(ORG_A_CODE);
    expect(body.since).not.toBeNull();
    expect(body.pendingWithCode).toBe(1);
  });

  it('klub z wyłączonym dołączaniem oddaje same `null` - karta pokazuje kreski', async () => {
    const { app } = await testHarness();
    // Beta ma `join_code = NULL` w świecie testowym: to jest stan „wyłączone".
    const res = await state(app, await tokenOf(app, 'BAD'));

    expect(res.json()).toEqual({ code: null, formatted: null, since: null, pendingWithCode: 0 });
    expect(ORG_B).not.toBe(ORG_A);
  });

  it('jedzie na `accounts.manage` - zwykły pilot kodu klubu nie czyta', async () => {
    const { app } = await testHarness();
    const res = await state(app, await tokenOf(app, 'PWI'));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ required: 'accounts.manage' });
  });
});

describe('POST /admin/api/club-code/rotate - nowy kod', () => {
  it('stary kod przestaje działać NATYCHMIAST, nowy działa, a zgłoszenia zostają', async () => {
    const { app, db, clock } = await testHarness({ clubCodeBytes: codeGenerator('NWYKDEF') });
    // Ktoś zgłosił się STARYM kodem przed rotacją - jego zgłoszenie ma przeżyć.
    await joinWith(app, 'przedrotacja', ORG_A_CODE);
    // Zegar musi ruszyć: „zgłoszenia tym kodem" liczą się od chwili rotacji, więc bez
    // upływu czasu zgłoszenie sprzed niej wypadałoby po tej samej stronie granicy.
    clock.advance(5 * 60_000);
    const token = await tokenOf(app, 'TMK');

    const res = await rotate(app, token);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ code: 'NWYKDEF', formatted: 'NWY-KDEF' });
    // Liczba zgłoszeń TYM kodem zeruje się z definicji - kod obowiązuje od teraz.
    expect(res.json().pendingWithCode).toBe(0);

    expect((await joinWith(app, 'zestarym', ORG_A_CODE)).statusCode).toBe(404);
    expect((await joinWith(app, 'znowym', 'nwy-kdef')).statusCode).toBe(202);

    // Zgłoszenie sprzed rotacji stoi w kolejce nietknięte - kolejka pokazuje WSZYSTKIE,
    // a karta kodu tylko te złożone bieżącym kodem. To jest różnica między tymi liczbami.
    const queue = await app.inject({
      method: 'GET',
      url: '/admin/api/memberships/pending',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(queue.json().items.map((i: { email: string }) => i.email).sort()).toEqual([
      'przedrotacja@gmail.com',
      'znowym@gmail.com',
    ]);
    expect((await state(app, token)).json().pendingWithCode).toBe(1);

    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'club_code.rotate',
      target_id: ORG_A,
      org_id: ORG_A,
    });
    // OBA kody: nowy i poprzedni - bez tego nie da się odtworzyć, który obowiązywał kiedy.
    expect(rows[0]!.details).toEqual({ code: 'NWY-KDEF', previous: ORG_A_CODE });
  });

  it('włącza dołączanie z powrotem w klubie, który je wyłączył', async () => {
    const { app } = await testHarness({ clubCodeBytes: codeGenerator('BETAKDE') });
    const beta = await tokenOf(app, 'BAD');
    expect((await state(app, beta)).json().code).toBeNull();

    expect((await rotate(app, beta)).json()).toMatchObject({ formatted: 'BET-AKDE' });

    expect((await joinWith(app, 'dobety', 'BET-AKDE')).statusCode).toBe(202);
    // Kod Alfy nadal działa w Alfie - rotacja w Becie nie ruszyła cudzej kolumny.
    expect((await joinWith(app, 'doalfy', ORG_A_CODE)).statusCode).toBe(202);
  });

  it('zderzenie z kodem INNEGO klubu → losuje ponownie, cudzy kod zostaje', async () => {
    // Kod jest jedyny na SERWERZE, więc zderzenie jest możliwe (i astronomicznie
    // nieprawdopodobne). Ma kończyć się drugim losowaniem, nie błędem 500 - i nie
    // zostawiać po sobie wpisu w dzienniku o rotacji, która się nie udała.
    const { app, db } = await testHarness({ clubCodeBytes: codeGenerator('ZAJETYK', 'WLNYKDE') });
    await db.query(`UPDATE organizations SET join_code = 'ZAJETYK' WHERE id = $1`, [ORG_B]);

    const res = await rotate(app, await tokenOf(app, 'TMK'));

    expect(res.statusCode).toBe(200);
    expect(res.json().code).toBe('WLNYKDE');
    const { rows } = await db.query<{ id: string; join_code: string }>(
      'SELECT id, join_code FROM organizations ORDER BY id',
    );
    expect(rows).toEqual([
      { id: ORG_A, join_code: 'WLNYKDE' },
      { id: ORG_B, join_code: 'ZAJETYK' },
    ]);
    // Nieudana próba nie zostawia śladu - dziennik ma jeden wpis, nie dwa.
    expect(await auditRows(db)).toHaveLength(1);
  });

  it('zwykły pilot nie rotuje kodu - 403 i kod bez zmian', async () => {
    const { app, db } = await testHarness();
    const res = await rotate(app, await tokenOf(app, 'PWI'));

    expect(res.statusCode).toBe(403);
    const { rows } = await db.query<{ join_code: string }>(
      'SELECT join_code FROM organizations WHERE id = $1',
      [ORG_A],
    );
    expect(rows[0]?.join_code).toBe('AZG7K4M');
    expect(await auditRows(db)).toEqual([]);
  });
});

describe('POST /admin/api/club-code/disable - koniec dołączania kodem', () => {
  it('zamyka JEDYNĄ drogę do klubu, a odpowiedź jest taka, jak na kod zmyślony', async () => {
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    const res = await disable(app, token);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ code: null, formatted: null, since: null, pendingWithCode: 0 });

    const withRealCode = await joinWith(app, 'zkodem', ORG_A_CODE);
    const withNonsense = await joinWith(app, 'zbzdura', 'ZZZ-ZZZZ');
    expect(withRealCode.statusCode).toBe(404);
    // Co do bajtu to samo: klub wyłączony nie ma powodu się ujawniać.
    expect(withRealCode.json()).toEqual(withNonsense.json());

    const rows = await auditRows(db);
    expect(rows[0]).toMatchObject({ action: 'club_code.disable', org_id: ORG_A });
    expect(rows[0]!.details).toEqual({ previous: ORG_A_CODE });
  });

  it('zgłoszenia złożone PRZED wyłączeniem zostają w kolejce', async () => {
    const { app } = await testHarness();
    await joinWith(app, 'przedwylaczeniem', ORG_A_CODE);
    const token = await tokenOf(app, 'TMK');

    await disable(app, token);

    const queue = await app.inject({
      method: 'GET',
      url: '/admin/api/memberships/pending',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(queue.json().items).toHaveLength(1);
  });

  it('powtórne wyłączenie → 400 `no_changes`, bez drugiego wpisu w dzienniku', async () => {
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    expect((await disable(app, token)).statusCode).toBe(200);

    const again = await disable(app, token);

    expect(again.statusCode).toBe(400);
    expect(again.json()).toEqual({ error: 'no_changes' });
    expect(await auditRows(db)).toHaveLength(1);
  });
});
