/**
 * UZ Aero (dane demo) — KLIENT HTTP SEEDA.
 *
 * Cały ruch demo idzie przez PUBLICZNE API serwera: telefony przez `POST /events`,
 * administrator przez `/admin/api/*` z ciasteczkiem sesji i nagłówkiem CSRF. Skrypt nie
 * ma uchwytu do bazy i mieć go nie będzie — dzięki temu dane demo są dokładnie tym, co
 * potrafi wyprodukować produkcyjny kod, a bieg seeda przy okazji sprawdza autoryzację
 * obu powierzchni.
 *
 * ══ CIASTECZKO PANELU, A NIE NAGŁÓWEK `Authorization` ══
 * Trasy panelu czytają poświadczenie WYŁĄCZNIE z ciasteczka `uzaero_admin`
 * (`http/tokenFromRequest.ts`), a token nigdy nie jedzie w ciele odpowiedzi (§8.2).
 * Skrypt musi więc zachować się jak przeglądarka: przechwycić `Set-Cookie` i odsyłać go
 * przy każdym żądaniu. Atrybut `Secure` na ciasteczku jest polityką PRZEGLĄDARKI —
 * `fetch` w Node go nie egzekwuje, więc dev po `http://localhost` działa.
 */

import { ADMIN_CSRF_HEADER } from '../../src/http/adminCsrf.ts';
import { ADMIN_SESSION_COOKIE } from '../../src/http/tokenFromRequest.ts';
import type { WireEvent } from './sessionStream.ts';
import type { DemoTransport, IngestReply } from './runScenario.ts';

export class DemoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: string,
  ) {
    super(`${method} ${path} → ${status}: ${body.slice(0, 400)}`);
    this.name = 'DemoHttpError';
  }
}

export class DemoClient implements DemoTransport {
  /** Token dostępowy per pilot — wydawany raz, ważny na cały bieg seeda. */
  private readonly pilotTokens = new Map<string, string>();
  private adminCookie: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly password: string,
  ) {}

  // ── telefon ───────────────────────────────────────────────────────────────

  /** Loguje pilota i zapamiętuje token. Kolejne wołania dla tego samego kodu są tanie. */
  async loginPilot(pilotCode: string): Promise<void> {
    if (this.pilotTokens.has(pilotCode)) return;
    const body = await this.request<{ token: string }>('POST', '/auth/login', {
      body: { login: pilotCode, password: this.password },
    });
    this.pilotTokens.set(pilotCode, body.token);
  }

  async sendEvents(
    pilotCode: string,
    events: readonly WireEvent[],
    sourceDevice: string,
  ): Promise<IngestReply> {
    const token = this.pilotTokens.get(pilotCode);
    if (token == null) throw new Error(`pilot ${pilotCode} nie jest zalogowany`);
    return this.request<IngestReply>('POST', '/events', {
      body: { events, sourceDevice },
      headers: { authorization: `Bearer ${token}` },
    });
  }

  // ── panel ─────────────────────────────────────────────────────────────────

  /**
   * Logowanie do panelu ustawia ciasteczko sesji. Przełączenie konta (administrator →
   * szef wyszkolenia) po prostu je NADPISUJE — tak samo jak w przeglądarce, w której
   * nie da się być zalogowanym dwiema tożsamościami naraz.
   */
  async loginPanel(pilotCode: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/admin/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ADMIN_CSRF_HEADER]: '1' },
      body: JSON.stringify({ login: pilotCode, password: this.password }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new DemoHttpError(response.status, 'POST', '/admin/api/auth/login', text);
    }

    const cookie = cookieValue(response.headers.getSetCookie(), ADMIN_SESSION_COOKIE);
    if (cookie == null) {
      throw new Error(`logowanie ${pilotCode} do panelu nie zwróciło ciasteczka sesji`);
    }
    this.adminCookie = cookie;
  }

  adminGet<T>(path: string): Promise<T> {
    return this.request<T>('GET', `/admin/api${path}`, { headers: this.adminHeaders() });
  }

  adminPost<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', `/admin/api${path}`, { body, headers: this.adminHeaders() });
  }

  private adminHeaders(): Record<string, string> {
    if (this.adminCookie == null) throw new Error('brak sesji panelu — zaloguj się najpierw');
    return { cookie: `${ADMIN_SESSION_COOKIE}=${this.adminCookie}`, [ADMIN_CSRF_HEADER]: '1' };
  }

  // ── warstwa transportowa ──────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await response.text();
    if (!response.ok) throw new DemoHttpError(response.status, method, path, text);
    return (text === '' ? undefined : JSON.parse(text)) as T;
  }
}

/** Wartość ciasteczka o danej nazwie z listy nagłówków `Set-Cookie`. */
function cookieValue(setCookie: readonly string[], name: string): string | null {
  for (const header of setCookie) {
    const [pair] = header.split(';');
    const separator = pair?.indexOf('=') ?? -1;
    if (pair == null || separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return null;
}
