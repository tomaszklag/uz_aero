/**
 * UZ Aero (serwer) - testy `POST /traces` (ślad kalibracyjny GPS, faza 5).
 *
 * Ślad NIE dotyka Postgresa: ląduje w NDJSON per sesja - dokładnie w formacie,
 * który czyta skrypt `replay`. Test zagląda do pliku, bo plik JEST kontraktem.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TEST_PASSWORD, testHarness } from './helpers.ts';

async function login(app: Awaited<ReturnType<typeof testHarness>>['app']) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: 'TMK', password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

const fix = (sec: number) => ({
  sessionUuid: 'sess-1',
  kind: 'fix',
  time: Date.UTC(2026, 5, 22, 8, 0, sec),
  deviceTime: Date.UTC(2026, 5, 22, 8, 0, sec),
  gs: 60,
  alt: 900,
  lat: 50.078,
  lon: 19.785,
  accuracyM: 5,
  detail: null,
});

describe('POST /traces', () => {
  it('przyjmuje paczkę i dopisuje NDJSON per sesja, z tożsamością z JWT', async () => {
    const { app, tracesDir } = await testHarness();
    const token = await login(app);

    const res = await app.inject({
      method: 'POST',
      url: '/traces',
      headers: { authorization: `Bearer ${token}` },
      payload: { entries: [fix(0), fix(1), { sessionUuid: 'sess-1', kind: 'undo', time: 1, deviceTime: 1, detail: 'landing' }] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accepted: 3 });

    const lines = (await readFile(join(tracesDir, 'sess-1.ndjson'), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ kind: 'fix', gs: 60, pilotId: 'TMK' }); // czyj telefon nagrał
    expect(lines[2]).toMatchObject({ kind: 'undo', detail: 'landing' });
  });

  it('kolejna paczka DOPISUJE, nie nadpisuje (append jak w rejestrze)', async () => {
    const { app, tracesDir } = await testHarness();
    const token = await login(app);
    const post = (entries: unknown[]) =>
      app.inject({
        method: 'POST',
        url: '/traces',
        headers: { authorization: `Bearer ${token}` },
        payload: { entries },
      });

    await post([fix(0)]);
    await post([fix(1)]);

    const content = await readFile(join(tracesDir, 'sess-1.ndjson'), 'utf8');
    expect(content.trim().split('\n')).toHaveLength(2);
  });

  it('bez tokenu → 401, nic nie ląduje na dysku', async () => {
    const { app, tracesDir } = await testHarness();

    const res = await app.inject({ method: 'POST', url: '/traces', payload: { entries: [fix(0)] } });

    expect(res.statusCode).toBe(401);
    expect(await readdir(tracesDir)).toHaveLength(0);
  });

  it('koperta spoza ram (pusta / za duża) → 400', async () => {
    const { app } = await testHarness();
    const token = await login(app);

    const empty = await app.inject({
      method: 'POST',
      url: '/traces',
      headers: { authorization: `Bearer ${token}` },
      payload: { entries: [] },
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error).toBe('bad_envelope');
  });
});
