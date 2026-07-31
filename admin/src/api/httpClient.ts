/**
 * UZ Aero — panel: JEDYNE miejsce w kodzie, w którym występuje `fetch`.
 *
 * Reguła jest wykonywalna (`test/architecture.test.ts`), a jej cel nie jest
 * porządkowy: dopóki sieć ma jedne drzwi, „skąd wzięła się ta liczba" ma zawsze
 * tę samą odpowiedź — z odpowiedzi serwera. Drugie wywołanie `fetch` w komponencie
 * jest pierwszym krokiem do panelu, który liczy po swojemu.
 *
 * Trzy rzeczy dzieją się tu i nigdzie indziej:
 *  • ścieżki są WZGLĘDNE (`/admin/api/…`) — panel jedzie z tego samego originu co API,
 *    więc nie ma `apiBaseUrl`, nie ma CORS-u i ciasteczko `SameSite=Strict` działa.
 *    W `app/` taki plik istnieje właśnie dlatego, że telefon jest INNYM originem;
 *  • mutacje niosą nagłówek CSRF (`X-UZ-Admin`), którego przeglądarka nie wyśle
 *    cross-origin bez preflightu — serwer go WYMAGA (`server/src/http/adminCsrf.ts`);
 *  • odpowiedzi spoza 2xx stają się `HttpError`, a nie `undefined` w komórce tabeli.
 */

import type { ApiErrorDto } from './dto';

/** Prefiks API panelu. `/admin/api`, nie `/admin` — to drugie to statyczny build. */
const API_PREFIX = '/admin/api';

/** Nagłówek CSRF wymagany przez serwer przy każdej metodzie innej niż GET. */
const CSRF_HEADER = 'X-UZ-Admin';

/**
 * Odpowiedź serwera spoza 2xx jako wyjątek NIOSĄCY STATUS I CIAŁO.
 *
 * Status jest częścią wiadomości, a nie szczegółem transportu: 401 znaczy „zaloguj
 * się", 403 „twoja rola tego nie obejmuje", 409 „ktoś cię ubiegł". Ekran, który
 * dostaje samo `Error('błąd')`, nie ma jak powiedzieć, co się stało — a mockupy
 * panelu wymagają podania powodu, nigdy cichego odbicia.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorDto,
  ) {
    super(`HTTP ${status}: ${body.error}`);
    this.name = 'HttpError';
  }
}

/** `true` dla odmów serwera; `false` dla awarii sieci — to dwie różne wiadomości. */
export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/**
 * Walidacja WĄSKA i celowo taka (`docs/architektura-panelu-frontend.md` §5.2):
 * sprawdzamy, że przyszedł JSON — czyli tyle, żeby złamany kontrakt wywalił się
 * głośno przy odpowiedzi, a nie po cichu przy renderze. Pełnych schematów `zod`
 * po stronie klienta NIE ma: kształt przybijają testy tras serwera.
 */
async function parse(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? '';
  if (res.status === 204) return null;
  if (!type.includes('application/json')) {
    throw new HttpError(res.status, { error: 'bad_response' });
  }
  return res.json();
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    // Ciasteczko sesji jedzie z żądaniem także wtedy, gdy dev-serwer stoi na innym
    // porcie niż API — bez tego logowanie „działa", a kolejne żądanie dostaje 401.
    credentials: 'same-origin',
  });

  const body = await parse(res);
  if (!res.ok) {
    const dto = (body ?? {}) as Partial<ApiErrorDto>;
    // Ciało odmowy przepisujemy W CAŁOŚCI, a nie pole po polu. Powód jest konkretny:
    // 409 z wyścigu o flagę niesie `flag` ze stanem i komentarzem ZWYCIĘZCY, a lista
    // wybranych pól gubiłaby tę treść po cichu — i przy każdej kolejnej odmowie
    // niosącej dane trzeba by pamiętać, żeby ją tutaj dopisać.
    throw new HttpError(res.status, { ...dto, error: dto.error ?? 'unknown' });
  }
  return body;
}

export async function apiGet<T>(path: string): Promise<T> {
  return (await request(path, { method: 'GET' })) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return (await request(path, {
    method: 'POST',
    headers: {
      [CSRF_HEADER]: '1',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })) as T;
}
