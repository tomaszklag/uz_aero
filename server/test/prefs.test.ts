/**
 * UZ Aero (serwer) - testy `/me/prefs` (decyzja 2026-07-29: motyw jest preferencją
 * PILOTA i wędruje między urządzeniami przez serwer).
 *
 * Sedno kontraktu: LWW po stemplu DECYZJI z telefonu (`themeUpdatedAt`) - starszy
 * stempel NIE nadpisuje, nowszy tak - a odpowiedź PUT jest ZAWSZE stanem
 * autorytatywnym po operacji, bo to z niej telefon-przegrany dowiaduje się,
 * jaki motyw wybrał ten sam pilot na innym urządzeniu.
 */

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

type App = Awaited<ReturnType<typeof testHarness>>['app'];

async function authed(app: App, login = 'TMK'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(login) },
  });
  return res.json().token as string;
}

const put = (app: App, token: string, theme: string, themeUpdatedAt: string) =>
  app.inject({
    method: 'PUT',
    url: '/me/prefs',
    headers: { authorization: `Bearer ${token}` },
    payload: { theme, themeUpdatedAt },
  });

const get = (app: App, token: string) =>
  app.inject({ method: 'GET', url: '/me/prefs', headers: { authorization: `Bearer ${token}` } });

const T1 = '2026-07-29T10:00:00.000Z';
const T2 = '2026-07-29T10:05:00.000Z';

describe('/me/prefs', () => {
  it('bez tokenu → 401 (obie metody)', async () => {
    const { app } = await testHarness();
    expect((await app.inject({ method: 'GET', url: '/me/prefs' })).statusCode).toBe(401);
    const res = await app.inject({
      method: 'PUT',
      url: '/me/prefs',
      payload: { theme: 'paper', themeUpdatedAt: T1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('pilot bez zapisanego motywu: jawne nulle, nie brakujące pola', async () => {
    const { app } = await testHarness();
    const res = await get(app, await authed(app));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ theme: null, themeUpdatedAt: null });
  });

  it('pierwszy PUT zapisuje (brak stempla = każdy wygrywa) i wraca stan autorytatywny', async () => {
    const { app } = await testHarness();
    const token = await authed(app);

    const res = await put(app, token, 'paper', T1);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ theme: 'paper', themeUpdatedAt: T1 });

    expect((await get(app, token)).json()).toEqual({ theme: 'paper', themeUpdatedAt: T1 });
  });

  it('LWW: starszy stempel NIE nadpisuje - odpowiedź niesie zwycięzcę do adopcji', async () => {
    const { app } = await testHarness();
    const token = await authed(app);
    await put(app, token, 'solar', T2); // drugi telefon pilota zapisał później podjętą decyzję

    const res = await put(app, token, 'paper', T1); // nasz stempel jest starszy
    expect(res.statusCode).toBe(200); // przegrana w LWW to wynik uzgadniania, nie błąd żądania
    expect(res.json()).toEqual({ theme: 'solar', themeUpdatedAt: T2 });
    expect((await get(app, token)).json()).toEqual({ theme: 'solar', themeUpdatedAt: T2 });
  });

  it('LWW: nowszy stempel nadpisuje; RÓWNY już nie (ściśle nowszy)', async () => {
    const { app } = await testHarness();
    const token = await authed(app);
    await put(app, token, 'night', T1);

    expect((await put(app, token, 'amber', T2)).json()).toEqual({
      theme: 'amber',
      themeUpdatedAt: T2,
    });
    // Ten sam stempel z inną nazwą = remis → zostaje to, co już zapisane.
    expect((await put(app, token, 'sky', T2)).json()).toEqual({
      theme: 'amber',
      themeUpdatedAt: T2,
    });
  });

  it('preferencja jest per pilot Z TOKENU - zapis TMK nie przecieka do AKO', async () => {
    const { app } = await testHarness();
    const tmk = await authed(app);
    const ako = await authed(app, 'AKO');

    await put(app, tmk, 'paper', T1);
    expect((await get(app, ako)).json()).toEqual({ theme: null, themeUpdatedAt: null });
  });

  it('walidacja zod: pusta/za długa nazwa i zepsuty stempel → 400, bez zapisu', async () => {
    const { app } = await testHarness();
    const token = await authed(app);

    expect((await put(app, token, '', T1)).statusCode).toBe(400);
    expect((await put(app, token, 'x'.repeat(41), T1)).statusCode).toBe(400);
    expect((await put(app, token, 'paper', 'wczoraj po południu')).statusCode).toBe(400);
    expect((await get(app, token)).json()).toEqual({ theme: null, themeUpdatedAt: null });
  });
});
