/**
 * UZ Aero (serwer) - testy `GET /me/events` (§4.9, issue #32).
 *
 * Scenariusz, dla którego ta trasa istnieje: pilot wyczyścił pamięć aplikacji i stracił
 * na telefonie WSZYSTKO, choć jego dni leżą kompletne na serwerze. Trasa oddaje mu
 * własny rejestr - i to jest cała jej treść, więc testy pilnują dokładnie trzech rzeczy:
 *
 *  • **zakres** - wyłącznie sesje, w których pilot jest PIC-em (cudze dni nie mają prawa
 *    trafić do jego lokalnej historii, bo tam dałoby się je „otworzyć i poprawić");
 *  • **koperta** - to, co wyszło przez `POST /events`, wraca w kształcie, który ten sam
 *    endpoint przyjmie z powrotem (jedna definicja zdarzenia w obie strony);
 *  • **kursor** - strona po stronie, bez gubienia i bez dublowania, także gdy rejestr
 *    rośnie w trakcie odtwarzania.
 *
 * Dane wjeżdżają PRAWDZIWĄ drogą - przez `POST /events` - więc test przechodzi całą
 * ścieżkę telefonu: koperta, rejestr, odczyt kursorem.
 */

import { describe, expect, it } from 'vitest';

import { TEST_PASSWORD, testHarness } from './helpers.ts';

type App = Awaited<ReturnType<typeof testHarness>>['app'];

const DAY = Date.UTC(2026, 5, 22);

interface EventSpec {
  uuid: string;
  session: string;
  pic: string;
  dual?: string | null;
  type?: string;
  at?: number;
  aircraft?: string;
  payload?: Record<string, unknown>;
}

/** Koperta §5.1 - dokładnie ta, którą wysyła telefon. */
function envelope(spec: EventSpec) {
  const at = spec.at ?? DAY + 8 * 3_600_000;
  return {
    uuid: spec.uuid,
    sessionUuid: spec.session,
    aircraftId: spec.aircraft ?? 'SP-AXA',
    picId: spec.pic,
    dualId: spec.dual ?? null,
    type: spec.type ?? 'session_claim',
    deviceTime: at,
    gpsTime: at,
    payload: spec.payload ?? { mode: 'free' },
    schemaVersion: 1,
  };
}

async function login(app: App, who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

/** Wysyła paczkę JAKO jej PIC - single-writer §4.4 nie ma tu wyjątków. */
async function send(app: App, pic: string, specs: EventSpec[]): Promise<void> {
  const token = await login(app, pic);
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events: specs.map(envelope) },
  });
  expect(res.statusCode, `paczka ${pic} odrzucona: ${res.payload}`).toBe(200);
}

const pull = (app: App, token: string, query = '') =>
  app.inject({
    method: 'GET',
    url: `/me/events${query}`,
    headers: { authorization: `Bearer ${token}` },
  });

/**
 * Przechodzi CAŁY rejestr kursorem, tak jak robi to telefon przy odtwarzaniu.
 * Zwraca uuidy w kolejności, w jakiej przyszły - łącznie z ewentualnymi powtórzeniami,
 * bo to właśnie one byłyby dowodem, że kursor stoi w miejscu.
 */
async function pullAll(app: App, token: string, limit: number): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const query = `?limit=${limit}${cursor != null ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res: Awaited<ReturnType<typeof pull>> = await pull(app, token, query);
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      events: { uuid: string }[];
      nextCursor: string | null;
      hasMore: boolean;
    };
    seen.push(...body.events.map((e) => e.uuid));
    cursor = body.nextCursor ?? cursor;
    if (!body.hasMore) return seen;
  }

  throw new Error('kursor nie doszedł do końca w 20 stronach - pętla');
}

describe('GET /me/events (odtworzenie rejestru telefonu)', () => {
  it('bez tokenu → 401', async () => {
    const { app } = await testHarness();
    const res = await app.inject({ method: 'GET', url: '/me/events' });
    expect(res.statusCode).toBe(401);
  });

  it('pilot bez ani jednej sesji → 200 i pusta strona, nie 404', async () => {
    // Pierwszy dzień w klubie jest stanem normalnym. 404 mówiłoby „zasobu nie ma",
    // a zasób jest - rejestr tego pilota jest po prostu pusty.
    const { app } = await testHarness();
    const res = await pull(app, await login(app, 'TMK'));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ events: [], nextCursor: null, hasMore: false });
  });

  it('oddaje WYŁĄCZNIE zdarzenia, w których pilot jest PIC-em', async () => {
    // Sesje, w których pilot był Dualem, do jego lokalnego strumienia NIE wchodzą:
    // „Historia dni" pokazuje wszystko, co leży w rejestrze telefonu, więc dopisanie
    // cudzej sesji dałoby pilotowi dzień, którego nie prowadził - z ołówkiem korekty.
    const { app } = await testHarness();
    await send(app, 'TMK', [{ uuid: 'evt-moje-1', session: 's-tmk', pic: 'TMK' }]);
    await send(app, 'KRZ', [
      { uuid: 'evt-cudze-1', session: 's-krz', pic: 'KRZ' },
      { uuid: 'evt-cudze-2-dual', session: 's-krz-dual', pic: 'KRZ', dual: 'TMK' },
    ]);

    const body = (await pull(app, await login(app, 'TMK'))).json();
    expect(body.events.map((e: { uuid: string }) => e.uuid)).toEqual(['evt-moje-1']);
  });

  it('koperta wraca w kształcie, który `POST /events` przyjmie z powrotem', async () => {
    // Jedna definicja zdarzenia w obie strony: pobrane zdarzenie jest tym samym bytem,
    // co wysłane. Dowód nie z porównania pól, tylko z DZIAŁANIA - odesłane wraca
    // jako duplikat (dedup po uuid, §4.3), a nie jako `400 bad_payload`.
    const { app } = await testHarness();
    const sent = envelope({
      uuid: 'evt-pelna-koperta',
      session: 's-tmk',
      pic: 'TMK',
      dual: 'KRZ',
      type: 'preflight_confirm',
      payload: {
        operation: 'skoki',
        reading: { fuelL: 150, mh: 1234.5 },
        client: 'SKY CAMP',
        notes: null,
        mhFormat: 'hhmm',
      },
    });

    const token = await login(app, 'TMK');
    await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { events: [envelope({ uuid: 'evt-claim-1', session: 's-tmk', pic: 'TMK' }), sent] },
    });

    const body = (await pull(app, token)).json();
    const pulled = body.events.find((e: { uuid: string }) => e.uuid === 'evt-pelna-koperta');
    expect(pulled).toEqual(sent);

    // …i naprawdę przechodzi kopertę wejściową drugi raz.
    const echo = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { events: body.events },
    });
    expect(echo.statusCode).toBe(200);
    expect(echo.json()).toMatchObject({ accepted: 0, duplicates: body.events.length });
  });

  it('kursor przechodzi cały rejestr bez gubienia i bez dublowania', async () => {
    const { app } = await testHarness();
    // Trzy paczki, bo `received_at` nadaje baza w chwili PRZYJĘCIA: paczka to jedna
    // transakcja, więc jej wiersze mają wspólny stempel i rozstrzyga je dopiero uuid.
    // Granica strony wypada wtedy w ŚRODKU paczki - i to jest przypadek, dla którego
    // tie-breaker w kursorze w ogóle istnieje.
    await send(app, 'TMK', [
      { uuid: 'evt-a1xx', session: 's1', pic: 'TMK' },
      { uuid: 'evt-a2xx', session: 's1', pic: 'TMK', type: 'engine_start' },
      { uuid: 'evt-a3xx', session: 's1', pic: 'TMK', type: 'takeoff', payload: { method: 'manual' } },
    ]);
    await send(app, 'TMK', [
      { uuid: 'evt-b1xx', session: 's1', pic: 'TMK', type: 'landing', payload: { method: 'manual' } },
      { uuid: 'evt-b2xx', session: 's1', pic: 'TMK', type: 'engine_stop' },
    ]);
    await send(app, 'KRZ', [{ uuid: 'evt-obcy-1', session: 's-krz', pic: 'KRZ' }]);

    const token = await login(app, 'TMK');
    const seen = await pullAll(app, token, 2);

    expect(new Set(seen)).toEqual(new Set(['evt-a1xx', 'evt-a2xx', 'evt-a3xx', 'evt-b1xx', 'evt-b2xx']));
    expect(seen).toHaveLength(5); // brak powtórzeń = kursor się posuwa
  });

  it('kursor z KOŃCA rejestru dobiera dosyłkę i nie powtarza ostatniej strony', async () => {
    // Odtworzenie nie jest jednorazową operacją: ten sam kursor jedzie przy każdej
    // okazji synchronizacji i ma dowozić dosyłkę z drugiego urządzenia albo korektę
    // dopisaną przez administratora. Dlatego kursor jest wypełniony TAKŻE na ostatniej
    // stronie - inaczej telefon nie miałby czego zapamiętać i przy każdej okazji
    // ściągałby ogon rejestru od nowa.
    const { app } = await testHarness();
    await send(app, 'TMK', [
      { uuid: 'evt-stare-1', session: 's1', pic: 'TMK' },
      { uuid: 'evt-stare-2', session: 's1', pic: 'TMK', type: 'engine_start' },
    ]);

    const token = await login(app, 'TMK');
    const all = (await pull(app, token, '?limit=50')).json();
    expect(all.events.map((e: { uuid: string }) => e.uuid)).toEqual(['evt-stare-1', 'evt-stare-2']);
    expect(all.hasMore).toBe(false);
    expect(all.nextCursor).not.toBeNull();

    const end = `?limit=50&cursor=${encodeURIComponent(all.nextCursor)}`;

    // Telefon w zgodzie z serwerem: pusta strona, zero ruchu, kursor bez zmian.
    const quiet = (await pull(app, token, end)).json();
    expect(quiet).toEqual({ events: [], nextCursor: null, hasMore: false });

    await send(app, 'TMK', [{ uuid: 'evt-nowe-1', session: 's2', pic: 'TMK' }]);

    const after = (await pull(app, token, end)).json();
    expect(after.events.map((e: { uuid: string }) => e.uuid)).toEqual(['evt-nowe-1']);
    expect(after.hasMore).toBe(false);
  });

  it('uszkodzony kursor → 400, nie cicha pierwsza strona', async () => {
    // Ciche zaczęcie od początku byłoby gorsze niż błąd: telefon uznałby, że posunął
    // się naprzód, a stanąłby w miejscu - i robiłby to przy każdej okazji synca.
    const { app } = await testHarness();
    await send(app, 'TMK', [{ uuid: 'evt-e1xx', session: 's1', pic: 'TMK' }]);

    const token = await login(app, 'TMK');
    const res = await pull(app, token, '?cursor=to-nie-jest-kursor');

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_cursor' });
  });

  it('limit spoza zakresu → 400 (koperta ma jeden sufit w obie strony)', async () => {
    const { app } = await testHarness();
    const token = await login(app, 'TMK');

    expect((await pull(app, token, '?limit=501')).statusCode).toBe(400);
    expect((await pull(app, token, '?limit=0')).statusCode).toBe(400);
  });
});
