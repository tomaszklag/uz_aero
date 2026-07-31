/**
 * UZ Aero (serwer) — role kont i brama uprawnień panelu (migracja 7, decyzja 2026-07-31).
 *
 * Trzy rzeczy, które MUSZĄ trzymać, bo ich złamanie jest luką, a nie usterką:
 *  1. brak roli nigdy nie awansuje — nieznana wartość schodzi do `pilot`;
 *  2. rola jedzie z KONTA, nie z tokenu — odebranie uprawnień działa przy odświeżeniu;
 *  3. baza nie przyjmuje roli spoza słownika (CHECK z migracji 7).
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { authorizeCapability } from '../src/http/authorize.ts';
import { can } from '../src/domain/roles.ts';
import { TEST_PASSWORD, TEST_SECRET, testHarness } from './helpers.ts';

describe('mapa uprawnień', () => {
  it('pilot nie ma w panelu NICZEGO — z wejściem włącznie', () => {
    expect(can('pilot', 'panel.access')).toBe(false);
    expect(can('pilot', 'flags.resolve')).toBe(false);
    expect(can('pilot', 'accounts.manage')).toBe(false);
  });

  it('szef wyszkolenia rozstrzyga flagi, ale nie pisze w cudzym rejestrze ani w kontach', () => {
    expect(can('training_lead', 'panel.access')).toBe(true);
    expect(can('training_lead', 'flags.resolve')).toBe(true);
    expect(can('training_lead', 'events.correct')).toBe(false);
    expect(can('training_lead', 'accounts.manage')).toBe(false);
    expect(can('training_lead', 'thresholds.manage')).toBe(false);
    expect(can('training_lead', 'audit.read')).toBe(false);
  });

  it('administrator ma komplet', () => {
    for (const capability of [
      'panel.access',
      'flags.resolve',
      'events.correct',
      'accounts.manage',
      'fleet.manage',
      'thresholds.manage',
      'audit.read',
    ] as const) {
      expect(can('admin', capability)).toBe(true);
    }
  });
});

describe('brama uprawnień tras panelu', () => {
  it('bez nagłówka → 401, nie 403 — to dwie różne wiadomości', async () => {
    const { tokens } = await testHarness();
    const outcome = authorizeCapability(tokens, undefined, 'panel.access');
    expect(outcome).toEqual({ ok: false, status: 401, body: { error: 'unauthorized' } });
  });

  it('ważny token pilota → 403 z podaną wymaganą zdolnością', async () => {
    // Odmowa ma NIEŚĆ POWÓD: panel pokazuje, czego brakuje, zamiast gasnąć bez słowa.
    const { tokens } = await testHarness();
    const token = tokens.sign({ pilotId: 'PWI', code: 'PWI', role: 'pilot' }, 3600);

    const outcome = authorizeCapability(tokens, `Bearer ${token}`, 'flags.resolve');
    expect(outcome).toEqual({
      ok: false,
      status: 403,
      body: { error: 'forbidden', required: 'flags.resolve' },
    });
  });

  it('szef wyszkolenia przechodzi na flagach i odbija się na kontach', async () => {
    const { tokens } = await testHarness();
    const token = tokens.sign({ pilotId: 'AKO', code: 'AKO', role: 'training_lead' }, 3600);
    const header = `Bearer ${token}`;

    expect(authorizeCapability(tokens, header, 'flags.resolve').ok).toBe(true);
    expect(authorizeCapability(tokens, header, 'accounts.manage')).toMatchObject({
      status: 403,
      body: { required: 'accounts.manage' },
    });
  });
});

describe('zgodność wstecz tokenów', () => {
  it('token wydany PRZED migracją 7 (bez claimu roli) działa jako pilot', async () => {
    // Odrzucenie takiego tokenu wylogowałoby telefony w terenie bez powodu, a cichy
    // awans byłby luką — jedyne bezpieczne wyjście to najmniejsza rola.
    const { tokens, clock } = await testHarness();

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'TMK',
        code: 'TMK',
        exp: Math.floor(clock.now().getTime() / 1000) + 3600,
      }),
    ).toString('base64url');
    const body = `${header}.${payload}`;
    const signature = createHmac('sha256', TEST_SECRET).update(body).digest('base64url');
    const legacyToken = `${body}.${signature}`;

    // Token jest ważny (podpis się zgadza)…
    expect(tokens.verify(legacyToken)).toEqual({ pilotId: 'TMK', code: 'TMK', role: 'pilot' });
    // …ale mimo że TMK jest w bazie administratorem, sam token panelu nie otwiera.
    expect(authorizeCapability(tokens, `Bearer ${legacyToken}`, 'panel.access').ok).toBe(false);
  });
});

describe('rola pochodzi z konta, nie z tokenu', () => {
  it('odebranie roli działa przy najbliższym odświeżeniu', async () => {
    const { app, db, tokens } = await testHarness();

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });
    expect(tokens.verify(login.json().token)?.role).toBe('admin');

    // Administrator traci uprawnienia w bazie…
    await db.query("UPDATE pilots SET role = 'pilot' WHERE id = 'TMK'");

    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: login.json().refreshToken },
    });

    // …a świeży token już go nie niesie. Gdyby rola szła ze starego tokenu, dostęp
    // wisiałby do wygaśnięcia refresha, czyli do 90 dni.
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().pilot.role).toBe('pilot');
    expect(tokens.verify(refreshed.json().token)?.role).toBe('pilot');
  });
});

describe('CHECK z migracji 7', () => {
  it('baza nie przyjmuje roli spoza słownika', async () => {
    const { db } = await testHarness();
    await expect(
      db.query("UPDATE pilots SET role = 'superadmin' WHERE id = 'TMK'"),
    ).rejects.toThrow();
  });

  it('konto założone bez podanej roli dostaje `pilot`', async () => {
    const { db } = await testHarness();
    await db.query(
      `INSERT INTO pilots (id, code, name, email, password_hash, active)
       VALUES ('NEW', 'NEW', 'Nowe Konto', 'nowe@uzaero.pl', 'x', TRUE)`,
    );
    const { rows } = await db.query<{ role: string }>(
      "SELECT role FROM pilots WHERE id = 'NEW'",
    );
    expect(rows[0]?.role).toBe('pilot');
  });
});
