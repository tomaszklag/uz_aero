/**
 * UZ Aero - panel 2.0: KOPERTY ODPOWIEDZI `/admin/api/*` jako własne typy.
 *
 * Dlaczego własne, a nie importowane z serwera: `server/` to workspace z `type: module`,
 * rozszerzeniami `.ts` w importach, typami Fastify i `pg`. Import stamtąd wciągnąłby
 * typy Node'a do bundla przeglądarki i przywiązałby panel do wewnętrznego podziału
 * warstw serwera. **Nigdy nie importujemy z `server/src`** - a kształty odpowiedzi
 * po stronie serwera przybijają jego własne testy tras.
 *
 * Byty domenowe biorzemy jako TYPY z `@uzaero/domain` (`import type`, nigdy wartości).
 *
 * == TEN PLIK OPISUJE TO, CZEGO PANEL 2.0 UZYWA ==
 * Serwer przysyła w tych samych kopertach WIĘCEJ, niż jest tu wymienione: przy kontach
 * `counts`, `scopes`, `daysFrom`/`daysTo` i `flyingDays`, przy flocie `counts`, `scopes`,
 * `claim`, `reading`, `lastEventAt`, `openFlags`. Panel 2.0 świadomie tego nie rysuje
 * (kafle i liczniki chipów opisują klub kilkunastoosobowy, a stan z telefonów to nie
 * konfiguracja) - a TypeScript ignoruje pola nadmiarowe, więc kontrakt zostaje spełniony.
 * Pole dopisuje się tutaj razem z ekranem, który je pokazuje, nigdy „na zapas".
 */

import type { MhFormat, ServiceStatus } from '@uzaero/domain';

// -- sesja panelu (logowanie, `GET /me`) ----------------------------------------

/**
 * Role kont. LUSTRO `server/src/domain/roles.ts`, przybite `test/mirrors.test.ts`.
 *
 * Kopia, a nie import, bo panel nie widzi wnętrza serwera. Ta kopia NIE DECYDUJE
 * o niczym: mapa rola -> zdolności jest wyłącznie na serwerze i wyłącznie on ją
 * egzekwuje. Tu są nazwy do porównania, nie uprawnienia.
 *
 * `training_lead` wycofany 2026-08-30 (decyzja właściciela produktu, do rewizji
 * w kolejnej iteracji uprawnień). Zostają dwie role, a jedna z nich w ogóle nie
 * dotyczy panelu - więc każdy, kto tu wejdzie, ma dziś komplet zdolności.
 */
export type PilotRole = 'pilot' | 'admin';

/**
 * Zdolności. LUSTRO `server/src/domain/roles.ts`, przybite `test/mirrors.test.ts`.
 *
 * Panel 2.0 pyta o dwie z nich (`accounts.manage`, `fleet.manage`), ale unia musi być
 * KOMPLETNA: zdolność dodana na serwerze i nieznana panelowi zostaje po cichu pominięta
 * przy porównaniu, więc ekran zablokowałby akcję komuś, kto ma uprawnienie.
 */
export type Capability =
  | 'panel.access'
  | 'flags.resolve'
  | 'events.correct'
  | 'accounts.manage'
  | 'fleet.manage'
  | 'thresholds.manage'
  | 'audit.read'
  | 'maintenance.run';

/** Konto zalogowane w panelu - stopka nawigacji i decyzje o widoczności akcji. */
export interface PanelPilotDto {
  id: string;
  code: string;
  name: string;
  role: PilotRole;
}

/**
 * Odpowiedź `POST /admin/api/auth/login` i `GET /admin/api/me` - TEN SAM kształt.
 *
 * Tokenu tu nie ma i być nie może: sesja jedzie ciasteczkiem `HttpOnly`, którego
 * JavaScript panelu nie widzi. To nie jest niedopatrzenie kontraktu, tylko jego treść.
 */
export interface PanelSessionDto {
  pilot: PanelPilotDto;
  capabilities: Capability[];
}

// -- odmowy ---------------------------------------------------------------------

/**
 * Powód odmowy zmiany na koncie (`409 refused`).
 * LUSTRO `AccountRefusal` z `server/src/domain/accountGuards.ts`.
 */
export type PilotRefusalDto =
  | 'self_deactivate'
  | 'self_demote'
  | 'last_admin'
  | 'inactive_account'
  | 'self_delete'
  | 'account_active'
  | 'has_history';

/**
 * Powód odmowy zmiany konfiguracji samolotu (`409 refused`).
 * LUSTRO `FleetRefusal` z `server/src/domain/fleetGuards.ts`.
 *
 * Do 2.0 brakowało tu obu powodów oleju (issue #60) - panel pokazałby wtedy klientowi
 * surowe `oil_min_above_capacity`. Rozjazdu pilnuje odtąd `test/mirrors.test.ts`.
 */
export type FleetRefusalDto =
  | 'capacity_not_positive'
  | 'open_session'
  | 'oil_not_positive'
  | 'oil_min_above_capacity'
  | 'aircraft_in_service'
  | 'has_history';

/** Ciało odmowy z tras panelu - `error` zawsze, reszta zależnie od powodu. */
export interface ApiErrorDto {
  error: string;
  /** 403 z bramy zdolności: KTOREJ zdolności zabrakło. */
  required?: Capability;
  /** 409 `conflict`: KTORE pole jest zajęte - bez tego formularz nie wie, co poprawić. */
  field?: 'code' | 'email' | 'reg';
  /** 409 `refused`: DLACZEGO odmówiono. Odmowa bez powodu każe zgadywać, czy to awaria. */
  reason?: PilotRefusalDto | FleetRefusalDto;
}

// -- konta pilotów --------------------------------------------------------------

/**
 * Jedno konto - wiersz `GET /admin/api/pilots`.
 *
 * Czego tu NIE MA i nie będzie: **hasła** (w bazie jest hash; jawne hasło istnieje
 * wyłącznie w odpowiedzi, która je wytworzyła) i **ostatniego logowania** (kolumny
 * nie ma w `pilots` i nikt jej nie zapisuje - wyliczenie jej z rotacji tokenów byłoby
 * inną wielkością pod tą samą etykietą).
 */
export interface PilotListItemDto {
  id: string;
  /** Etykieta w arkuszu klubu i przy wyborze drugiego pilota; działa też jako login. */
  code: string;
  name: string;
  /** `null` = konto bez e-maila; pilot loguje się kodem. To normalny stan. */
  email: string | null;
  active: boolean;
  role: PilotRole;
}

/** Lista kont. Bez kursora - klub ma kilkanaście kont, `limit` starcza na komplet. */
export interface PilotPageDto {
  items: PilotListItemDto[];
  /** Ile kont spełnia filtr - także wtedy, gdy `limit` obciął listę. */
  total: number;
}

/**
 * Odpowiedź akcji, która WYTWORZYŁA hasło (założenie konta, reset).
 *
 * `password` widzimy jeden jedyny raz: nie ma go w bazie, nie ma w dzienniku audytu
 * i nie ma trasy „pokaż ponownie". Panel nie ma prawa go nigdzie zapisać - pokazuje
 * i zapomina razem z zamknięciem formularza.
 */
export interface PilotSecretDto {
  pilot: PilotListItemDto;
  password: string;
}

/**
 * Odpowiedź zmiany konta bez hasła.
 *
 * **Wiersza z tej odpowiedzi NIE WSTAWIAMY do tabeli.** Serwer składa go skrótem
 * (`accountToWire` w `server/src/http/routes/admin/pilots.ts`) - mutacja oddaje
 * tożsamość i status konta, którego dotyczyła, a nie jego świeży wiersz listy.
 * Po zapisie unieważniamy listę i prawda przychodzi z niej.
 */
export interface PilotChangeDto {
  pilot: PilotListItemDto;
}

// -- flota ----------------------------------------------------------------------

/**
 * Jedna jednostka - wiersz `GET /admin/api/fleet`.
 *
 * `fuelToleranceL` LICZY SERWER i to jest treść tej trasy: próg flagi rozjazdu paliwa
 * to `max(10 L, 5% pojemności)`, a panelowi wolno importować z `@uzaero/domain` wyłącznie
 * TYPY. Gdyby serwer nie podawał wyniku, panel musiałby trzymać drugą kopię reguły.
 */
export interface AircraftListItemDto {
  id: string;
  /** Znaki na kadłubie - unikalne. Etykieta, nie klucz zdarzeń (te wiążą `id`). */
  reg: string;
  type: string;
  year: number | null;
  capacityL: number;
  /** Efektywny próg rozjazdu paliwa (L) dla tej pojemności - patrz wyżej. */
  fuelToleranceL: number;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
  /** Konfiguracja oleju (issue #60); `null` = nieprowadzony - moduł w telefonie milczy. */
  oilMinL: number | null;
  oilCapacityL: number | null;
  oilNormLPerH: number | null;
  /** Sesje bez zdania samolotu. Blokują wyłączenie ze służby - i tylko po to tu są. */
  openSessions: number;
}

/** Lista floty. Bez kursora - klub ma kilka jednostek. */
export interface FleetPageDto {
  items: AircraftListItemDto[];
}

/** Odpowiedź zapisu konfiguracji - pełny, świeży wiersz listy (inaczej niż przy kontach). */
export interface AircraftChangeDto {
  aircraft: AircraftListItemDto;
}

/**
 * Próg rozjazdu paliwa rozwiązany dla pojemności, która NIE MUSI być w bazie -
 * odpowiedź `GET /admin/api/fleet/tolerance`.
 *
 * Jedyna droga, którą formularz dostaje liczbę „+/-55 L" dla wpisywanej wartości,
 * zamiast liczyć 5% po swojemu.
 */
export interface AircraftToleranceDto {
  /** `null` = pytanie bez pojemności; próg schodzi wtedy do podłogi 10 L. */
  capacityL: number | null;
  fuelToleranceL: number;
}
