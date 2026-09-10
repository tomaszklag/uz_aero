/**
 * UZ Aero (serwer) - WYJŚCIE Z KLUBU (wielofirmowość; issue #100, D6).
 *
 * Wyjście z klubu nie jest osobną operacją i to jest cała treść tego pliku: jest nim
 * WYŁĄCZENIE CZŁONKOSTWA, które panel klubu umie od epiku B. Ten przekrój pilnuje
 * czterech skutków, z których żaden nie ma własnego kodu - wszystkie wynikają z bramy
 * członkostwa (epik C) i z tego, że rejestr jest append-only:
 *
 *  1. **trasy telefonu zamykają się NATYCHMIAST** - i refresh też, więc pilot nie wraca
 *     tyłem przez rotację tokenu;
 *  2. **rejestr, projekcje i dziennik klubu zostają NIETKNIĘTE** - loty byłego członka
 *     dalej liczą się w statystykach i w karcie arkusza, bo się zdarzyły;
 *  3. **zaległe zapisy do klubu, z którego wyszedł, NIE WCHODZĄ** - a gdy telefon wyśle
 *     je pod tokenem DRUGIEGO klubu (osoba lata gdzie indziej), wracają we `withheld`
 *     i znikają z kolejki na zawsze (mechanizm z issue #81);
 *  4. **okno korekty pilota zamyka się razem z dostępem** - poprawki nie da się wysłać,
 *     choć zdarzenie leży w rejestrze; poprawia odtąd wyłącznie administrator.
 *
 * Czego tu NIE MA i dlaczego: „opuść klub" z telefonu. Wyjście jest decyzją KLUBU
 * (`docs/wielofirmowosc.md` §8.3) - pilot, który chce odejść, mówi to administratorowi,
 * a ten wyłącza członkostwo. Gdyby pilot mógł wyjść sam, zrobiłby to z otwartą operacją
 * i niewysłaną kolejką.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B, seedBetaFleet } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const writer = (token: string) => ({ ...bearer(token), ...ADMIN_CSRF_HEADERS });

async function login(app: Harness['app'], who: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(who) },
  });
}

async function tokenOf(app: Harness['app'], who: string): Promise<string> {
  const res = await login(app, who);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().token as string;
}

/** Wyłączenie członkostwa = wyjście z klubu. Jedna trasa, ta sama od epiku B. */
const leave = (app: Harness['app'], adminToken: string, pilotId: string) =>
  app.inject({
    method: 'POST',
    url: `/admin/api/pilots/${pilotId}/active`,
    headers: writer(adminToken),
    payload: { active: false },
  });

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
/** Jedna ZAMKNIĘTA operacja pilota - materiał, który ma przeżyć jego odejście. */
function day(sessionUuid: string, aircraftId: string, picId: string) {
  const base = { sessionUuid, aircraftId, picId, dualId: null };
  const event = (type: string, time: number, payload: Record<string, unknown> = {}) => {
    seq += 1;
    return {
      uuid: `leave-${seq}-${type}`,
      type,
      deviceTime: time,
      gpsTime: time,
      payload,
      schemaVersion: 1,
      ...base,
    };
  };
  return [
    event('session_claim', at(8, 0), { mode: 'free' }),
    event('preflight_confirm', at(8, 1), {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: null,
      reading: { fuelL: 150, mh: 1234.5 },
      mhFormat: 'hhmm',
    }),
    event('engine_start', at(8, 12)),
    event('takeoff', at(8, 25), { method: 'auto' }),
    event('landing', at(9, 18), { method: 'auto' }),
    event('engine_stop', at(10, 34)),
    event('day_close', at(16, 45), { finalReading: { fuelL: 88, mh: 1241.15 } }),
  ];
}

const post = (app: Harness['app'], token: string, events: unknown[]) =>
  app.inject({ method: 'POST', url: '/events', headers: bearer(token), payload: { events } });

const count = async (db: Harness['db'], table: string, where = ''): Promise<number> => {
  const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`);
  return Number(rows[0]!.n);
};

describe('wyjście z klubu = wyłączenie członkostwa', () => {
  it('zamyka trasy telefonu NATYCHMIAST - razem z refreshem, więc nie ma drogi powrotnej', async () => {
    // KRZ lata WYŁĄCZNIE w Alfie, więc po wyjściu nie ma już żadnego klubu - PWI byłby
    // tu złym świadkiem, bo wraca do Bety (ostatni przypadek tego pliku).
    const { app } = await testHarness();
    const pilot = await login(app, 'KRZ');
    const { token, refreshToken } = pilot.json();
    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(token) })).statusCode).toBe(200);

    await leave(app, await tokenOf(app, 'TMK'), 'KRZ');

    // Token jest ważny kryptograficznie jeszcze godzinę - i nic mu to nie daje.
    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(token) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/me/events', headers: bearer(token) })).statusCode).toBe(401);
    // Rotacja refresha też odmawia - inaczej telefon wracałby do klubu co godzinę.
    const rotated = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(rotated.statusCode).toBe(401);
    // Logowanie od zera: osoba jest, klubu nie ma - 202 ze stanem, nie tokeny.
    const again = await login(app, 'KRZ');
    expect(again.statusCode).toBe(202);
    expect(again.json().memberships[0]).toMatchObject({ status: 'disabled' });
  });

  it('REJESTR I DZIENNIK KLUBU ZOSTAJĄ - lot się zdarzył, więc dalej się liczy', async () => {
    const { app, db } = await testHarness();
    const pilot = await tokenOf(app, 'PWI');
    expect((await post(app, pilot, day('sess-odchodzi', 'SP-AXA', 'PWI'))).statusCode).toBe(200);
    const admin = await tokenOf(app, 'TMK');

    await leave(app, admin, 'PWI');

    expect(await count(db, 'events', `WHERE org_id = '${ORG_A}'`)).toBe(7);
    expect(await count(db, 'sessions', `WHERE session_uuid = 'sess-odchodzi'`)).toBe(1);
    // Karta arkusza (dokument klubu) stoi dalej - z kodem byłego członka w wierszach.
    expect(await count(db, 'exported_sheets', `WHERE org_id = '${ORG_A}'`)).toBe(1);
    // Panel widzi operację i jej pilota: członkostwo jest wyłączone, nie skasowane.
    const sessions = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions',
      headers: bearer(admin),
    });
    expect(sessions.json().items[0]).toMatchObject({ picCode: 'PWI' });
    const pilots = await app.inject({
      method: 'GET',
      url: '/admin/api/pilots',
      headers: bearer(admin),
    });
    expect(pilots.json().items.find((i: { code: string }) => i.code === 'PWI')).toMatchObject({
      active: false,
    });
  });

  it('zaległe zapisy do klubu, z którego wyszedł, wracają we `withheld` pod tokenem DRUGIEGO klubu', async () => {
    // Realny przebieg: PWI lata w Alfie i w Becie. Alfa wyłącza mu członkostwo, gdy
    // w telefonie stoi niewysłana reszta operacji z Alfy. Telefon nie ma już tokenu
    // Alfy, więc wysyła ją tym, który ma - a serwer mówi „tych zapisów nie przyjmę",
    // zamiast trzymać kolejkę w nieskończoność (mechanizm z issue #81).
    const { app, db, clock } = await testHarness();
    await seedBetaFleet(db);

    const inAlfa = await tokenOf(app, 'PWI');
    const [claim, preflight, ...rest] = day('sess-wyjscie', 'SP-AXA', 'PWI');
    expect((await post(app, inAlfa, [claim!, preflight!])).statusCode).toBe(200);

    await leave(app, await tokenOf(app, 'TMK'), 'PWI');

    // Telefon przełącza się na klub, w którym PWI nadal jest (najświeższy refresh).
    clock.advance(60_000);
    await db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
       VALUES ('pwi-beta', 'PWI', $1, $2, $3)`,
      [ORG_B, new Date(clock.now().getTime() + 86_400_000), clock.now()],
    );
    const inBeta = await login(app, 'PWI');
    expect(inBeta.json().org.id).toBe(ORG_B);

    const res = await post(app, inBeta.json().token, rest);

    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(0);
    expect([...res.json().withheld].sort()).toEqual(rest.map((e) => e.uuid).sort());
    // Ani jeden zapis nie wszedł - operacja z Alfy zostaje taka, jaka była w chwili wyjścia.
    expect(await count(db, 'events', `WHERE session_uuid = 'sess-wyjscie'`)).toBe(2);
  });

  it('OKNO KOREKTY zamyka się razem z dostępem - poprawia odtąd administrator', async () => {
    const { app, db } = await testHarness();
    const pilot = await tokenOf(app, 'PWI');
    expect((await post(app, pilot, day('sess-korekta', 'SP-AXA', 'PWI'))).statusCode).toBe(200);
    const admin = await tokenOf(app, 'TMK');

    await leave(app, admin, 'PWI');

    // Korekta pilota to zwykły zapis do rejestru - a brama zamknęła trasę.
    const correction = await post(app, pilot, [
      {
        uuid: 'leave-correction',
        type: 'event_correction',
        sessionUuid: 'sess-korekta',
        aircraftId: 'SP-AXA',
        picId: 'PWI',
        dualId: null,
        deviceTime: at(17, 0),
        gpsTime: at(17, 0),
        payload: { action: 'void', targetUuid: 'leave-5-landing', reason: 'pomyłka' },
        schemaVersion: 1,
      },
    ]);
    expect(correction.statusCode).toBe(401);

    // Administrator klubu poprawia dalej - jego okno nigdy nie było oknem pilota.
    const byAdmin = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-korekta/void',
      headers: writer(admin),
      payload: { reason: 'wyjaśnione po odejściu pilota' },
    });
    expect(byAdmin.statusCode).toBe(200);
    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM sessions WHERE session_uuid = 'sess-korekta'`,
    );
    expect(rows[0]?.status).toBe('voided');
  });

  it('wyjście z JEDNEGO klubu nie rusza drugiego - osoba jest jedna, członkostwa dwa', async () => {
    const { app, db } = await testHarness();
    await seedBetaFleet(db);

    await leave(app, await tokenOf(app, 'TMK'), 'PWI');

    // W Becie PWI dalej pracuje - pod swoim kodem TAMTEGO klubu.
    const inBeta = await login(app, 'PWI');
    expect(inBeta.statusCode).toBe(200);
    expect(inBeta.json()).toMatchObject({ pilot: { code: 'PWB' }, org: { id: ORG_B } });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/reference',
          headers: bearer(inBeta.json().token),
        })
      ).statusCode,
    ).toBe(200);
    // Osoba nie jest zablokowana platformowo - to odebranie dostępu w JEDNYM klubie.
    const { rows } = await db.query<{ active: boolean }>(
      `SELECT active FROM pilots WHERE id = 'PWI'`,
    );
    expect(rows[0]?.active).toBe(true);
  });
});
