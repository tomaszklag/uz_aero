/**
 * UZ Aero (serwer) — PORTY warstwy aplikacji.
 *
 * Ta sama zasada co w aplikacji mobilnej: komendy i zapytania znają WYŁĄCZNIE te
 * interfejsy; implementacje (Postgres, zegar systemowy, krypto) wstrzykuje composition
 * root. Dzięki temu testy jadą na PGlite i sterowanym zegarze bez jednej atrapy
 * „udającej" logikę.
 *
 * Uproszczony CQRS: komendy piszą i zwracają wynik, zapytania czytają projekcje.
 * Bez szyny zdarzeń i bez osobnej bazy odczytu — projekcje odświeżamy synchronicznie
 * w tej samej transakcji, w której przyjmujemy zdarzenia. Przy skali klubu (jeden
 * serwer, kilkunastu pilotów) każdy dodatkowy ruchomy element to koszt bez zysku.
 */

import type { ReferenceAircraft, ReferencePilot } from '@uzaero/domain';

// ── magazyn ─────────────────────────────────────────────────────────────────────

/**
 * Minimalny interfejs bazy — spełniają go strukturalnie i `pg.Pool`, i PGlite.
 * To jest nasz „port bazodanowy": adaptery przyjmują `Queryable`, więc test może
 * podać bazę w procesie, a produkcja pulę połączeń, bez żadnej warstwy tłumaczącej.
 */
export interface Queryable {
  query<R = unknown>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

// ── piloci i uwierzytelnienie ───────────────────────────────────────────────────

/** Konto pilota po stronie serwera (zakłada administrator — brak rejestracji). */
export interface PilotAccount {
  id: string;
  code: string;
  name: string;
  email: string | null;
  passwordHash: string;
  active: boolean;
}

export interface PilotsPort {
  findByLogin(login: string): Promise<PilotAccount | null>;
  findById(id: string): Promise<PilotAccount | null>;
}

/**
 * Hasła: `hash` przy zakładaniu konta (seed/admin), `verify` przy logowaniu.
 * Implementacja na `node:crypto` (scrypt) — patrz adapter, tam jest uzasadnienie.
 */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

/** Podpisywanie i weryfikacja JWT sesji (HS256). */
export interface TokenService {
  /** Zwraca podpisany token dostępu dla pilota. */
  sign(claims: { pilotId: string; code: string }, ttlSec: number): string;
  /** Zwraca claims albo `null` — token zły/wygasły. Nigdy nie rzuca. */
  verify(token: string): { pilotId: string; code: string } | null;
}

/**
 * Refresh tokeny: NIEPRZEZROCZYSTE losowe wartości w bazie (hash), nie JWT.
 * Powód: refresh żyje długo (§3.0 — wygasły JWT nie wylogowuje), więc musi dać się
 * unieważnić po stronie serwera; JWT z natury unieważnić się nie da.
 */
export interface RefreshTokensPort {
  issue(pilotId: string, expiresAt: Date): Promise<string>;
  /** Zużywa token (rotacja): zwraca pilota i unieważnia stary; `null` = nieznany/wygasły. */
  consume(token: string): Promise<{ pilotId: string } | null>;
}

// ── dane referencyjne ───────────────────────────────────────────────────────────

/** Flota + piloci dla `GET /reference` (§4.6, §4.8). */
export interface ReferenceSnapshot {
  aircraft: ReferenceAircraft[];
  pilots: ReferencePilot[];
  /** Najświeższy `updated_at` — podstawa ETagu i adnotacji wieku cache w aplikacji. */
  updatedAt: Date | null;
}

export interface ReferencePort {
  snapshot(): Promise<ReferenceSnapshot>;
}

// ── zegar ───────────────────────────────────────────────────────────────────────

/** Czas jako port — testy okna refresh tokenów sterują nim jawnie. */
export interface Clock {
  now(): Date;
}
