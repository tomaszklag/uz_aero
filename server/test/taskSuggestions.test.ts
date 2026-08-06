/**
 * UZ Aero (serwer) — testy `GET /me/task-suggestions` (issue #14, ekran 02e).
 *
 * Sedno kontraktu to DWA RÓŻNE ZAKRESY w jednej odpowiedzi: oznaczenia klientów
 * pochodzą z sesji CAŁEGO klubu (kontrahent jest wspólny — nowy pilot lecący dla
 * SKY CAMP ma je zobaczyć), notatki wyłącznie z sesji TEGO pilota (to jego osobista
 * uwaga o okolicznościach dnia). Rozjazd tych zakresów byłby cichy: odpowiedź dalej
 * wyglądałaby poprawnie, tylko podpowiadałaby cudze zdania.
 *
 * Dane wjeżdżają PRAWDZIWĄ drogą — przez `POST /events` — więc test przechodzi całą
 * ścieżkę telefonu: koperta, projekcja `sessions`, odczyt podpowiedzi.
 */

import { describe, expect, it } from 'vitest';

import { TEST_PASSWORD, testHarness } from './helpers.ts';

type App = Awaited<ReturnType<typeof testHarness>>['app'];

const DAY = Date.UTC(2026, 5, 22);
/** Meldunek `d`-tego dnia o godzinie `h` UTC — steruje `claim_time` w projekcji. */
const at = (d: number, h: number): number => DAY + d * 86_400_000 + h * 3_600_000;

let seq = 0;

interface PreflightSpec {
  session: string;
  pic: string;
  dutyStart: number;
  client?: string | null;
  notes?: string | null;
  operation?: string;
  aircraft?: string;
}

/**
 * Sam `preflight_confirm` — do podpowiedzi wystarczy meldunek. Dzień bez lotu jest
 * realnym stanem (pilot zameldował się i nie poleciał), więc fixture nie udaje, że
 * podpowiedź wymaga zamkniętego dnia.
 */
function preflight(spec: PreflightSpec) {
  seq += 1;
  return {
    uuid: `e-${seq}-preflight`,
    sessionUuid: spec.session,
    aircraftId: spec.aircraft ?? 'SP-AXA',
    picId: spec.pic,
    dualId: null,
    type: 'preflight_confirm',
    deviceTime: spec.dutyStart,
    gpsTime: spec.dutyStart,
    payload: {
      operation: spec.operation ?? 'skoki',
      dutyStart: spec.dutyStart,
      reading: { fuelL: 150, mh: 1234.5 },
      client: spec.client ?? null,
      notes: spec.notes ?? null,
      mhFormat: 'hhmm',
    },
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

/** Wysyła meldunki JAKO ich PIC — single-writer §4.4 nie ma tu wyjątków. */
async function send(app: App, pic: string, specs: PreflightSpec[]): Promise<void> {
  const token = await login(app, pic);
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events: specs.map(preflight) },
  });
  expect(res.statusCode, `paczka ${pic} odrzucona: ${res.payload}`).toBe(200);
}

const suggestions = (app: App, token: string) =>
  app.inject({
    method: 'GET',
    url: '/me/task-suggestions',
    headers: { authorization: `Bearer ${token}` },
  });

const iso = (ms: number): string => new Date(ms).toISOString();

describe('GET /me/task-suggestions', () => {
  it('bez tokenu → 401', async () => {
    const { app } = await testHarness();
    const res = await app.inject({ method: 'GET', url: '/me/task-suggestions' });
    expect(res.statusCode).toBe(401);
  });

  it('pusta historia → 200 i dwie puste tablice, nie 404', async () => {
    // Brak historii jest normalnym stanem nowego klubu i pierwszego dnia pilota.
    // 404 mówiłoby „zasobu nie ma", a zasób jest — po prostu nic jeszcze nie zawiera.
    const { app } = await testHarness();
    const res = await suggestions(app, await login(app, 'TMK'));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ clients: [], notes: [] });
  });

  it('klienci pochodzą z CAŁEGO klubu, notatki tylko z sesji tego pilota', async () => {
    const { app } = await testHarness();
    await send(app, 'KRZ', [
      {
        session: 'sess-krz',
        pic: 'KRZ',
        dutyStart: at(0, 8),
        client: 'SKY CAMP',
        notes: 'notatka KRZ-a',
      },
    ]);
    await send(app, 'TMK', [
      { session: 'sess-tmk', pic: 'TMK', dutyStart: at(1, 8), notes: 'lot z uczniem' },
    ]);

    const body = (await suggestions(app, await login(app, 'TMK'))).json();

    // Klient wpisany przez KRZ-a jest kontrahentem KLUBU — TMK ma go zobaczyć.
    expect(body.clients).toEqual([
      { value: 'SKY CAMP', operation: 'skoki', lastUsedAt: iso(at(0, 8)) },
    ]);
    // Notatka KRZ-a jest jego uwagą o jego dniu — do podpowiedzi TMK nie wchodzi.
    expect(body.notes).toEqual([{ value: 'lot z uczniem', lastUsedAt: iso(at(1, 8)) }]);
  });

  it('najnowsze pierwsze i BEZ duplikatów — powtórzona wartość to jedna pozycja', async () => {
    const { app } = await testHarness();
    await send(app, 'TMK', [
      { session: 's1', pic: 'TMK', dutyStart: at(0, 8), client: 'SKY CAMP', notes: 'stara' },
      { session: 's2', pic: 'TMK', dutyStart: at(1, 8), client: 'AEROKLUB', notes: 'nowsza' },
      // Ten sam klient i ta sama notatka co w `s1`, ale najświeższego dnia — wartość
      // ma zostać JEDNA, z podbitym stemplem, a nie trafić na listę drugi raz.
      { session: 's3', pic: 'TMK', dutyStart: at(2, 8), client: 'SKY CAMP', notes: 'stara' },
    ]);

    const body = (await suggestions(app, await login(app, 'TMK'))).json();

    expect(body.clients).toEqual([
      { value: 'SKY CAMP', operation: 'skoki', lastUsedAt: iso(at(2, 8)) },
      { value: 'AEROKLUB', operation: 'skoki', lastUsedAt: iso(at(1, 8)) },
    ]);
    expect(body.notes).toEqual([
      { value: 'stara', lastUsedAt: iso(at(2, 8)) },
      { value: 'nowsza', lastUsedAt: iso(at(1, 8)) },
    ]);
  });

  it('rodzaj operacji przy kliencie pochodzi z jego NAJNOWSZEJ sesji', async () => {
    // Klient bywa obsługiwany różnie (skoki, a potem ferry). Podpowiedź ma nieść to,
    // co robiono ostatnio — starsza operacja podpowiadałaby wczorajszy kontekst.
    const { app } = await testHarness();
    await send(app, 'TMK', [
      { session: 's1', pic: 'TMK', dutyStart: at(0, 8), client: 'SKY CAMP', operation: 'skoki' },
      { session: 's2', pic: 'TMK', dutyStart: at(1, 8), client: 'SKY CAMP', operation: 'ferry' },
    ]);

    const body = (await suggestions(app, await login(app, 'TMK'))).json();
    expect(body.clients).toEqual([
      { value: 'SKY CAMP', operation: 'ferry', lastUsedAt: iso(at(1, 8)) },
    ]);
  });

  it('puste i białoznakowe wartości nie są podpowiedzią', async () => {
    // Pilot, który przeszedł przez pole i nic nie wpisał, nie tworzy pozycji na liście
    // — pusty wiersz do wyboru byłby gorszy niż brak listy.
    const { app } = await testHarness();
    await send(app, 'TMK', [
      { session: 's1', pic: 'TMK', dutyStart: at(0, 8), client: '', notes: '   ' },
      { session: 's2', pic: 'TMK', dutyStart: at(1, 8), client: null, notes: null },
    ]);

    expect((await suggestions(app, await login(app, 'TMK'))).json()).toEqual({
      clients: [],
      notes: [],
    });
  });

  it('obie listy są ucięte do 20 pozycji — to podpowiedź, nie wyszukiwarka', async () => {
    const { app } = await testHarness();
    const specs: PreflightSpec[] = [];
    for (let i = 0; i < 25; i += 1) {
      specs.push({
        session: `s-${i}`,
        pic: 'TMK',
        dutyStart: at(i, 8),
        client: `KLIENT ${i}`,
        notes: `notatka ${i}`,
      });
    }
    await send(app, 'TMK', specs);

    const body = (await suggestions(app, await login(app, 'TMK'))).json();
    expect(body.clients).toHaveLength(20);
    expect(body.notes).toHaveLength(20);
    // Obcięcie idzie po WŁAŚCIWEJ stronie porządku: zostają najnowsze, nie pierwsze
    // z brzegu (limit przed sortowaniem dałby listę odwrotną i nikt by tego nie zauważył).
    expect(body.clients[0]).toMatchObject({ value: 'KLIENT 24' });
    expect(body.clients[19]).toMatchObject({ value: 'KLIENT 5' });
    expect(body.notes[0]).toMatchObject({ value: 'notatka 24' });
  });

  it('sesja bez meldunku nie wywraca porządku — znacznikiem jest wtedy wiersz projekcji', async () => {
    // `sessions.claim_time` niesie duty start z preflightu, więc sesja z samym
    // `session_claim` ma tam NULL. Taki dzień nie ma ani klienta, ani notatki, ale
    // MUSI przejść przez zapytanie bez błędu — `COALESCE` na stempel projekcji jest
    // po to, żeby porządek nie miał dziury.
    const { app } = await testHarness();
    const token = await login(app, 'TMK');
    const claim = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          {
            uuid: 'e-claim-only',
            sessionUuid: 'sess-claim-only',
            aircraftId: 'SP-FGK',
            picId: 'TMK',
            dualId: null,
            type: 'session_claim',
            deviceTime: at(3, 7),
            gpsTime: at(3, 7),
            payload: { mode: 'free' },
            schemaVersion: 1,
          },
        ],
      },
    });
    expect(claim.statusCode).toBe(200);

    await send(app, 'TMK', [
      { session: 's1', pic: 'TMK', dutyStart: at(0, 8), client: 'SKY CAMP', notes: 'uwaga' },
    ]);

    const body = (await suggestions(app, token)).json();
    expect(body.clients).toEqual([
      { value: 'SKY CAMP', operation: 'skoki', lastUsedAt: iso(at(0, 8)) },
    ]);
    expect(body.notes).toEqual([{ value: 'uwaga', lastUsedAt: iso(at(0, 8)) }]);
  });
});
