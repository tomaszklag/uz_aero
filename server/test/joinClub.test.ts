/**
 * Ninerdeck (serwer) - DOŁĄCZANIE DO KLUBU KODEM (`POST /auth/join`; wielofirmowość
 * §3.8, §5; issue #100, epik D).
 *
 * Przekrój END-TO-END, bo jego wartością jest CIĄG zdarzeń, a nie pojedyncza trasa:
 * nieznajomy loguje się Googlem i dostaje token osoby (202) → wpisuje kod klubu →
 * powstaje członkostwo `pending` → `GET /auth/memberships` pokazuje, w którym klubie
 * czeka. Decyzja administratora (epik D2) tu NIE występuje - zatwierdzenie w tych
 * przypadkach idzie wprost w bazie, bo testowaną rzeczą jest droga pilota.
 *
 * Własności, których złamanie jest luką, a nie usterką:
 *  1. **kod daje WYŁĄCZNIE `pending`** - bez kodu pilota, bez tokenów klubu;
 *  2. **kod nieznany, wyłączony i klub nieaktywny dają JEDNĄ odpowiedź** (404) - nic się
 *     nie ujawnia;
 *  3. **`rejected` nie da się obejść ponownym kodem** - decyzja klubu zostaje;
 *  4. **drugie zgłoszenie tej samej osoby nie tworzy drugiego wiersza**;
 *  5. **ograniczenie tempa** - 10 prób na osobę, 30 na adres, okno 15 minut, `429` z czasem
 *     odczekania; próba odbita nie przedłuża blokady.
 *
 * Zero atrap poza weryfikacją podpisu Google (`testIdentityProvider.ts`) - licznik prób
 * jedzie na sterowanym zegarze harnessu.
 */

import { describe, expect, it } from 'vitest';

import { JOIN_LIMIT_PER_IP, JOIN_LIMIT_PER_PERSON, JOIN_WINDOW_MS } from '../src/application/mobile/commands/join.ts';
import { testHarness } from './helpers.ts';
import { googleTokenFor, googleTokenForStranger } from './testIdentityProvider.ts';
import { ORG_A, ORG_A_CODE, ORG_B } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

/** Nieznajomy loguje się pierwszy raz - wraca 202 i token OSOBY. */
async function personTokenOf(app: Harness['app'], subject: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenForStranger(subject) },
  });
  expect(res.statusCode).toBe(202);
  return res.json().personToken as string;
}

async function clubTokenOf(app: Harness['app'], code: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(code) },
  });
  expect(res.statusCode).toBe(200);
  return res.json().token as string;
}

const join = (app: Harness['app'], token: string | null, code: unknown, remoteAddress?: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/join',
    headers: token == null ? {} : { authorization: `Bearer ${token}` },
    payload: { code },
    ...(remoteAddress == null ? {} : { remoteAddress }),
  });

const personIdOf = async (db: Harness['db'], subject: string): Promise<string> => {
  const { rows } = await db.query<{ pilot_id: string }>(
    'SELECT pilot_id FROM external_identities WHERE subject = $1',
    [subject],
  );
  return rows[0]!.pilot_id;
};

const membershipOf = async (db: Harness['db'], orgId: string, pilotId: string) => {
  const { rows } = await db.query<{
    code: string | null;
    role: string;
    status: string;
    joined_via: string;
    reject_reason: string | null;
  }>(
    'SELECT code, role, status, joined_via, reject_reason FROM memberships WHERE org_id = $1 AND pilot_id = $2',
    [orgId, pilotId],
  );
  return rows;
};

describe('POST /auth/join - kod klubu daje wyłącznie zgłoszenie', () => {
  it('poprawny kod → 202 z klubem, członkostwo `pending` BEZ kodu pilota, tokenów klubu nie ma', async () => {
    const { app, db } = await testHarness();
    const token = await personTokenOf(app, 'kandydat1');

    const res = await join(app, token, ORG_A_CODE);

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      status: 'pending',
      org: { id: ORG_A, name: 'Aeroklub Alfa', slug: 'aeroklub-alfa' },
      memberships: [{ org: { id: ORG_A }, status: 'pending', code: null, role: 'pilot' }],
    });
    expect(res.json().token).toBeUndefined();
    expect(res.json().personToken).toBeUndefined();

    const person = await personIdOf(db, 'kandydat1');
    expect(await membershipOf(db, ORG_A, person)).toEqual([
      { code: null, role: 'pilot', status: 'pending', joined_via: 'code', reject_reason: null },
    ]);

    // Zgłoszenie NIE jest dostępem: logowanie dalej daje 202, tym razem ze stanem `pending`.
    const again = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('kandydat1') },
    });
    expect(again.statusCode).toBe(202);
    expect(again.json().status).toBe('pending');
  });

  it.each(['azg7k4m', 'azg-7k4m', 'AZG 7K4M', ' Azg-7K4m '])(
    'myślnik i wielkość liter są zapisem - „%s" trafia w ten sam klub',
    async (typed) => {
      const { app } = await testHarness();
      const token = await personTokenOf(app, 'kandydat2');

      const res = await join(app, token, typed);
      expect(res.statusCode).toBe(202);
      expect(res.json().org.id).toBe(ORG_A);
    },
  );

  it('drugie zgłoszenie tej samej osoby nie tworzy drugiego wiersza - to samo 202', async () => {
    const { app, db } = await testHarness();
    const token = await personTokenOf(app, 'kandydat3');

    expect((await join(app, token, ORG_A_CODE)).statusCode).toBe(202);
    const second = await join(app, token, ORG_A_CODE);
    expect(second.statusCode).toBe(202);
    expect(second.json().status).toBe('pending');

    const person = await personIdOf(db, 'kandydat3');
    expect(await membershipOf(db, ORG_A, person)).toHaveLength(1);
  });

  it('`GET /auth/memberships` po zgłoszeniu: `pending` z nazwą klubu i chwilą zgłoszenia', async () => {
    const { app, clock } = await testHarness();
    const token = await personTokenOf(app, 'kandydat4');
    await join(app, token, ORG_A_CODE);

    const res = await app.inject({
      method: 'GET',
      url: '/auth/memberships',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'pending',
      memberships: [
        {
          org: { id: ORG_A, slug: 'aeroklub-alfa', name: 'Aeroklub Alfa' },
          clubActive: true,
          status: 'pending',
          code: null,
          role: 'pilot',
          rejectReason: null,
          createdAt: clock.now().toISOString(),
          decidedAt: null,
        },
      ],
      person: { name: 'Nieznajomy kandydat4', email: 'kandydat4@gmail.com' },
    });
  });

  it('pilot klubu A dołącza do B WŁASNYM tokenem klubu (13A) - zgłoszenie w B, A bez zmian', async () => {
    const { app, db } = await testHarness();
    await db.query("UPDATE organizations SET join_code = 'BET2345', join_code_since = now() WHERE id = $1", [ORG_B]);
    const token = await clubTokenOf(app, 'TMK');

    const res = await join(app, token, 'bet-2345');

    expect(res.statusCode).toBe(202);
    expect(res.json().org.id).toBe(ORG_B);
    // Lista niesie OBA kluby: aktywne członkostwo w Alfie i zgłoszenie w Becie.
    expect(res.json().memberships).toMatchObject([
      { org: { id: ORG_A }, status: 'active', code: 'TMK' },
      { org: { id: ORG_B }, status: 'pending', code: null },
    ]);
    expect(await membershipOf(db, ORG_B, 'TMK')).toEqual([
      { code: null, role: 'pilot', status: 'pending', joined_via: 'code', reject_reason: null },
    ]);
  });
});

describe('POST /auth/join - odmowy', () => {
  it('kod nieznany, kod WYŁĄCZONY (Beta) i klub NIEAKTYWNY dają tę samą odpowiedź 404', async () => {
    // Żaden z trzech stanów nie ma powodu się ujawniać: odpowiedź jest jedna co do bajtu.
    const { app, db } = await testHarness();
    const token = await personTokenOf(app, 'kandydat5');

    const unknown = await join(app, token, 'ZZZ-9999');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: 'unknown_code' });

    // Beta ma `join_code = NULL` - dowolny kod nie pasuje do niczego. Klub dostał kod
    // i go wyłączył: ten sam napis, który wczoraj działał, dziś jest „nieznany".
    await db.query("UPDATE organizations SET join_code = 'BET2345' WHERE id = $1", [ORG_B]);
    expect((await join(app, token, 'BET-2345')).statusCode).toBe(202);
    await db.query('UPDATE organizations SET join_code = NULL WHERE id = $1', [ORG_B]);
    const token2 = await personTokenOf(app, 'kandydat6');
    const disabled = await join(app, token2, 'BET-2345');
    expect(disabled.statusCode).toBe(404);
    expect(disabled.json()).toEqual(unknown.json());

    await db.query('UPDATE organizations SET active = FALSE WHERE id = $1', [ORG_A]);
    const inactive = await join(app, token2, ORG_A_CODE);
    expect(inactive.statusCode).toBe(404);
    expect(inactive.json()).toEqual(unknown.json());

    // Wpis, który nie może być kodem (zła długość, litera spoza alfabetu) - tak samo.
    for (const bad of ['ABC', 'AZG-7K4M-X', 'AZG-7K0M', 'AZG-7KIM']) {
      const res = await join(app, token2, bad);
      expect(res.statusCode, bad).toBe(404);
      expect(res.json()).toEqual(unknown.json());
    }
  });

  it('członkostwo ODRZUCONE: 403 z powodem - ponowny kod nie obchodzi decyzji klubu', async () => {
    const { app, db, clock } = await testHarness();
    const token = await personTokenOf(app, 'kandydat7');
    await join(app, token, ORG_A_CODE);
    const person = await personIdOf(db, 'kandydat7');
    await db.query(
      `UPDATE memberships SET status = 'rejected', reject_reason = 'nie z tego klubu', decided_at = $3, decided_by = 'TMK'
        WHERE org_id = $1 AND pilot_id = $2`,
      [ORG_A, person, clock.now()],
    );

    const res = await join(app, token, ORG_A_CODE);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: 'membership_rejected',
      org: { id: ORG_A, slug: 'aeroklub-alfa', name: 'Aeroklub Alfa' },
      rejectReason: 'nie z tego klubu',
      decidedAt: clock.now().toISOString(),
    });
    // Wiersz został ODRZUCONY - kod nie cofnął decyzji do `pending`.
    expect(await membershipOf(db, ORG_A, person)).toMatchObject([{ status: 'rejected' }]);

    // Logowanie i stan zgłoszeń mówią to samo: 00D z powodem.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('kandydat7') },
    });
    expect(login.statusCode).toBe(202);
    expect(login.json().status).toBe('rejected');
    expect(login.json().memberships[0]).toMatchObject({ status: 'rejected', rejectReason: 'nie z tego klubu' });
  });

  it('członek klubu → 409 `already_member`; członkostwo wyłączone → 409 `membership_disabled`', async () => {
    const { app, db } = await testHarness();

    const member = await join(app, await clubTokenOf(app, 'JSE'), ORG_A_CODE);
    expect(member.statusCode).toBe(409);
    expect(member.json()).toEqual({
      error: 'already_member',
      org: { id: ORG_A, slug: 'aeroklub-alfa', name: 'Aeroklub Alfa' },
    });

    // Wyłączony w Alfie: logowanie daje token OSOBY (brak aktywnego klubu), a kod Alfy
    // nie zakłada drugiego zgłoszenia obok wyłączonego członkostwa.
    await db.query("UPDATE memberships SET status = 'disabled' WHERE pilot_id = 'JSE'");
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('JSE') },
    });
    expect(login.statusCode).toBe(202);
    const disabled = await join(app, login.json().personToken as string, ORG_A_CODE);
    expect(disabled.statusCode).toBe(409);
    expect(disabled.json()).toMatchObject({ error: 'membership_disabled', org: { id: ORG_A } });
    expect(await membershipOf(db, ORG_A, 'JSE')).toMatchObject([{ status: 'disabled' }]);
  });

  it('bez poświadczenia, z tokenem platformowym i osoby zablokowanej → 401; zły kształt → 400', async () => {
    const { app, db, tokens } = await testHarness();

    expect((await join(app, null, ORG_A_CODE)).statusCode).toBe(401);

    const platform = tokens.signPlatform({ pilotId: 'admin' }, 3600);
    expect((await join(app, platform, ORG_A_CODE)).statusCode).toBe(401);

    const token = await personTokenOf(app, 'kandydat8');
    expect((await join(app, token, 42)).statusCode).toBe(400);
    expect((await join(app, token, '')).statusCode).toBe(400);

    const person = await personIdOf(db, 'kandydat8');
    await db.query('UPDATE pilots SET active = FALSE WHERE id = $1', [person]);
    const blocked = await join(app, token, ORG_A_CODE);
    expect(blocked.statusCode).toBe(401);
    expect(blocked.json()).toEqual({ error: 'account_disabled' });
  });
});

describe('POST /auth/join - ograniczenie tempa (§3.8)', () => {
  it('11. próba osoby w oknie → 429 z czasem odczekania; po oknie próby wracają', async () => {
    const { app, clock } = await testHarness();
    const token = await personTokenOf(app, 'zgadujacy');

    for (let i = 0; i < JOIN_LIMIT_PER_PERSON; i += 1) {
      expect((await join(app, token, 'ZZZ-9999')).statusCode, `próba ${i + 1}`).toBe(404);
      clock.advance(1000);
    }

    const blocked = await join(app, token, 'ZZZ-9999');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    const retryAfterSec = blocked.json().retryAfterSec as number;
    expect(blocked.json().error).toBe('too_many_attempts');
    // Najstarsza próba padła 10 s temu, więc odczekanie = okno minus te 10 s.
    expect(retryAfterSec).toBe(JOIN_WINDOW_MS / 1000 - JOIN_LIMIT_PER_PERSON);
    expect(blocked.headers['retry-after']).toBe(String(retryAfterSec));

    // Próba ODBITA nie liczy się do okna: po odczekaniu droga otwiera się dokładnie wtedy,
    // kiedy obiecał `retryAfterSec`, a nie później.
    clock.advance(retryAfterSec * 1000 - 1000);
    expect((await join(app, token, 'ZZZ-9999')).statusCode).toBe(429);
    clock.advance(1000);
    expect((await join(app, token, ORG_A_CODE)).statusCode).toBe(202);
  });

  it('30 prób z jednego ADRESU przez różne osoby → 429 dla następnej; inny adres przechodzi', async () => {
    const { app } = await testHarness();
    const persons = JOIN_LIMIT_PER_IP / JOIN_LIMIT_PER_PERSON;
    for (let p = 0; p < persons; p += 1) {
      const token = await personTokenOf(app, `hangar${p}`);
      for (let i = 0; i < JOIN_LIMIT_PER_PERSON; i += 1) {
        expect((await join(app, token, 'ZZZ-9999', '10.0.0.7')).statusCode).toBe(404);
      }
    }

    const late = await personTokenOf(app, 'spozniony');
    expect((await join(app, late, ORG_A_CODE, '10.0.0.7')).statusCode).toBe(429);
    // Ten sam człowiek z innego adresu - jego własny licznik jest pusty.
    expect((await join(app, late, ORG_A_CODE, '10.0.0.8')).statusCode).toBe(202);
  });
});
