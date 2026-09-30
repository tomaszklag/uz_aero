/**
 * Ninerdeck (serwer) - klienci tras w testach: telefon (token klubu) i panel (ciasteczko
 * sesji z nagłówkiem CSRF). Wspólne dla testów, które pytają te same punkty końcowe z obu
 * powierzchni (zlecenia 4.0.0, issue #245) - tam scenariusz jedzie w pętli po powierzchniach.
 */

import { expect } from 'vitest';

import { ADMIN_CSRF_HEADERS, type testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A } from './testWorld.ts';

export type Harness = Awaited<ReturnType<typeof testHarness>>;
export type App = Harness['app'];

/** Odpowiedź `inject` w tym, czego testy używają (typ biblioteki ma przeciążenia). */
export interface Reply {
  statusCode: number;
  body: string;
  headers: Record<string, unknown>;
  json: () => any;
}

/** Wysyłka z nagłówkami powierzchni - telefon: token; panel: ciasteczko i CSRF. */
export type Send = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
  headers?: Record<string, string>,
) => Promise<Reply>;

export const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

export async function login(app: App, who: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor(who) } });
  expect(res.statusCode, `logowanie ${who}: ${res.body}`).toBe(200);
  return res.json().token as string;
}

/** Sesja panelu: ciasteczko razem z nagłówkiem CSRF, którego wymaga każdy zapis. */
export async function panelSession(app: App, who: string): Promise<Record<string, string>> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, `panel ${who}: ${res.body}`).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'ninerdeck_admin')!;
  return { cookie: `ninerdeck_admin=${cookie.value}`, ...ADMIN_CSRF_HEADERS };
}

export const phone = (app: App, token: string): Send => (method, url, payload, headers) =>
  app.inject({
    method,
    url,
    headers: { ...bearer(token), ...headers },
    ...(payload === undefined ? {} : { payload }),
  }) as Promise<Reply>;

export const panel = (app: App, session: Record<string, string>): Send => (method, url, payload, headers) =>
  app.inject({
    method,
    url: `/admin/api${url}`,
    headers: { ...session, ...headers },
    ...(payload === undefined ? {} : { payload }),
  }) as Promise<Reply>;

/** Zdolność nadana wprost w bazie - jak zrobiłby to ekran zakresu, bez przechodzenia przez panel. */
export const grant = (h: Harness, pilotId: string, capability: string) =>
  h.db.query(
    `INSERT INTO membership_capabilities (org_id, pilot_id, capability) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [ORG_A, pilotId, capability],
  );
