/**
 * UZ Aero — PORT serwera synchronizacji (§4.6).
 *
 * Jedyne miejsce, w którym aplikacja „wie", że istnieje serwer. Kontrakt odpowiada
 * 1:1 endpointom z §4.6; kształty danych idą z domeny, więc telefon i serwer nie mają
 * osobnych definicji tych samych rzeczy.
 *
 * Adapter produkcyjny robi HTTP (fetch); testy wstrzykują implementację w pamięci —
 * pętla synca musi być testowalna bez sieci, bo jej najciekawsze przypadki to właśnie
 * BRAK sieci i tokeny, które wygasły w połowie pracy.
 *
 * Błędy: metody rzucają `ServerUnreachableError` (offline/timeout — normalny stan
 * pracy, nie awaria) albo `ServerRejectedError` (serwer odpowiedział odmową — 401/403/4xx,
 * z kodem do decyzji wołającego). Rozróżnienie jest sednem offline-first: na pierwsze
 * odpowiadamy „spróbuj później", na drugie trzeba zareagować (odświeżyć token, pokazać
 * powód).
 */

import type { Event, Handover, ReferenceAircraft, ReferencePilot } from '../../domain';

/** Para tokenów + tożsamość — wynik logowania i odświeżenia (§3.0). */
export interface AuthTokens {
  token: string;
  refreshToken: string;
  pilot: { id: string; code: string; name: string };
}

/** Wynik przyjęcia paczki przez serwer (§4.3, §4.5). */
export interface PushResult {
  accepted: number;
  duplicates: number;
  /** Otwarte flagi dotykające wysłanych sesji — do pokazania na ekranie 11. */
  flags: { type: string; sessionUuids: string[] }[];
}

/** Migawka `GET /reference` — wejście do cache referencyjnego (§4.8). */
export interface ReferenceData {
  aircraft: ReferenceAircraft[];
  pilots: ReferencePilot[];
}

/**
 * Wynik `GET /reference` z obsługą ETag (§4.8): `data: null` = 304 Not Modified —
 * serwer potwierdził, że cache jest aktualny, i nie wysyłał ciała. `etag` zapamiętuje
 * wołający i podaje przy następnym zapytaniu.
 */
export interface ReferenceFetch {
  data: ReferenceData | null;
  etag: string | null;
}

/** Stan samolotu z `GET /aircraft/:id/state` — claim + przekazanie (§4.6). */
export interface RemoteAircraftState {
  aircraftId: string;
  claimPicId: string | null;
  claimSince: number | null;
  handover: Handover | null;
  lastSyncAt: string | null;
}

/**
 * Stan sesji po stronie serwera z `GET /sessions/:uuid/sync-status` — ekran 11.
 *
 * `received` to liczba zdarzeń, które SERWER widzi (nie mylić z licznikiem outboxa),
 * a `exportUrl` wypełni się dopiero, gdy serwerowy eksport do Sheets powstanie (faza 4)
 * — do tego czasu jest jawnym `null`, nie brakującym polem.
 */
export interface SessionSyncStatus {
  sessionUuid: string;
  received: number;
  status: 'open' | 'closed';
  flags: { type: string; sessionUuids: string[] }[];
  exportUrl: string | null;
}

export class ServerUnreachableError extends Error {
  constructor(cause?: unknown) {
    super('Serwer nieosiągalny');
    this.name = 'ServerUnreachableError';
    this.cause = cause;
  }
}

export class ServerRejectedError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Serwer odmówił: ${status} ${code}`);
    this.name = 'ServerRejectedError';
  }
}

export interface ServerPort {
  login(login: string, password: string): Promise<AuthTokens>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  pushEvents(token: string, events: Event[], sourceDevice: string | null): Promise<PushResult>;
  getReference(token: string, etag?: string | null): Promise<ReferenceFetch>;
  getAircraftState(token: string, aircraftId: string): Promise<RemoteAircraftState>;
  getSyncStatus(token: string, sessionUuid: string): Promise<SessionSyncStatus>;
}
