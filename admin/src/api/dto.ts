/**
 * UZ Aero — panel: KOPERTY ODPOWIEDZI `/admin/api/*` jako własne typy.
 *
 * Dlaczego własne, a nie importowane z serwera (`docs/architektura-panelu-frontend.md`
 * §5.2): `server/` to workspace z `type: module`, rozszerzeniami `.ts` w importach,
 * typami Fastify i `pg`. Import stamtąd wciągnąłby typy Node'a do bundla przeglądarki
 * i przywiązałby panel do wewnętrznego podziału warstw serwera. **Nigdy nie importujemy
 * z `server/src`** — a kształty odpowiedzi po stronie serwera przybijają jego własne
 * testy tras (PGlite + `app.inject`).
 *
 * Byty domenowe biorzemy jako TYPY z `@uzaero/domain` (`import type`, nigdy wartości).
 * Tutaj mieszkają wyłącznie koperty HTTP — czyli to, co jest prezentacją przez
 * konkretną trasę i zmienia się razem z nią.
 */

import type {
  Event,
  FlagStatus,
  FlagType,
  MhFormat,
  OperationType,
  SessionState,
} from '@uzaero/domain';

/**
 * Role kont. LUSTRO `server/src/domain/roles.ts` — świadome, opisane i tymczasowe.
 *
 * Rekomendacją `docs/architektura-panelu-frontend.md` §11 pkt 6 jest przeniesienie
 * `roles.ts` do `@uzaero/domain`, żeby panel dostał TYP zamiast kopii. To DECYZJA
 * CZŁOWIEKA, jeszcze niepodjęta, więc panel realizuje wariant minimalny: serwer
 * przysyła listę zdolności, panel porównuje ją z nazwami, a lista mieszka tutaj —
 * w jednym pliku, na granicy HTTP, gdzie każdy jej widzi.
 *
 * Czego ta kopia NIE robi: nie decyduje o niczym. Mapa rola → zdolności jest wyłącznie
 * na serwerze i wyłącznie on ją egzekwuje. Tu są nazwy do porównania, nie uprawnienia.
 */
export type PilotRole = 'pilot' | 'training_lead' | 'admin';

export type Capability =
  | 'panel.access'
  | 'flags.resolve'
  | 'events.correct'
  | 'accounts.manage'
  | 'fleet.manage'
  | 'thresholds.manage'
  | 'audit.read';

/** Konto zalogowane w panelu — stopka sidebara i decyzje o widoczności pozycji. */
export interface PanelPilotDto {
  id: string;
  code: string;
  name: string;
  role: PilotRole;
}

/**
 * Odpowiedź `POST /admin/api/auth/login` i `GET /admin/api/me` — TEN SAM kształt.
 *
 * Token NIE JEST tu wymieniony i nie może być: sesja jedzie ciasteczkiem `HttpOnly`,
 * którego JavaScript panelu nie widzi. To nie jest niedopatrzenie kontraktu, tylko
 * jego treść — panel nigdy nie trzyma poświadczenia.
 */
export interface PanelSessionDto {
  pilot: PanelPilotDto;
  capabilities: Capability[];
}

/** Ciało odmowy z tras panelu — `error` zawsze, reszta zależnie od powodu. */
export interface ApiErrorDto {
  error: string;
  /** 403 z bramy zdolności: KTÓREJ zdolności zabrakło (panel ma podać powód). */
  required?: Capability;
  /**
   * 409 `already_resolved`: stan flagi, którą ktoś zamknął PIERWSZY.
   *
   * Odmowa niesie tu treść, a nie tylko kod, i to jest jej sens: przegrany wyścig
   * ma pokazać CZYJE rozstrzygnięcie zdążyło i jakim komentarzem — inaczej drugi
   * klikający dopisałby własne uzasadnienie do decyzji, której nie podjął.
   */
  flag?: ResolvedFlagWireDto;
}

// ── skrzynka flag (`A03`, `A03a`) ───────────────────────────────────────────────

/**
 * Jedna sprawa w skrzynce — odpowiedź `GET /admin/api/flags`.
 *
 * `FlagType`/`FlagStatus` biorzemy jako TYPY z `@uzaero/domain` (a nie jako kopię
 * jak przy rolach): katalog flag JEST w pakiecie wspólnym, więc panel nie ma powodu
 * mieć własnej listy. Reszta pól to koperta trasy i mieszka tutaj.
 */
export interface FlagListItemDto {
  id: number;
  type: FlagType;
  status: FlagStatus;

  aircraftId: string;
  /** `null`, gdy samolotu nie ma już w rejestrze floty — flaga zostaje mimo to. */
  reg: string | null;
  aircraftType: string | null;

  sessionUuids: string[];
  /**
   * Liczby rozbieżności policzone przez serwer przy ingescie. Kształt ZALEŻY OD TYPU
   * flagi i celowo nie jest tu rozpisany na unię: `details` pochodzi z kolumny `jsonb`
   * i panel czyta z niego pola po nazwie, przyznając się do braku („—"), zamiast
   * obiecywać typem coś, czego baza nie gwarantuje.
   */
  details: Record<string, unknown>;

  /** ISO 8601 UTC — chwila WYKRYCIA rozbieżności; z niej liczy się wiek w skrzynce. */
  createdAt: string;
  resolvedAt: string | null;
  /** Identyfikator konta, które zamknęło sprawę — NIE nazwisko (patrz raport §API). */
  resolvedBy: string | null;
  resolutionNote: string | null;

  /** Czy ta flaga TRZYMA kartę dnia poza arkuszem — pierwszy klucz porządku skrzynki. */
  blocksExport: boolean;
}

/**
 * Strona skrzynki. Bez kursora — `total` mówi, ile spraw spełnia filtr, także wtedy,
 * gdy `limit` obciął listę.
 */
export interface FlagPageDto {
  items: FlagListItemDto[];
  total: number;
}

/** Flaga w odpowiedzi 409 — węższa niż wiersz listy (bez złączeń i bez `createdAt`). */
export interface ResolvedFlagWireDto {
  id: number;
  type: FlagType;
  aircraftId: string;
  sessionUuids: string[];
  details: Record<string, unknown>;
  status: FlagStatus;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

/** Powody, dla których eksporter ODMÓWIŁ zbudowania karty — nie błędy, tylko stany. */
export type ExportRefusalDto = 'no_events' | 'session_open' | 'no_preflight' | 'overlap_flag';

export type ExportOutcomeDto =
  | { exported: true; tab: string; revision: number; url: string }
  | { exported: false; reason: ExportRefusalDto };

/**
 * Próba re-eksportu jednej z sesji, których dotyczyła flaga.
 *
 * `outcome: null` znaczy „eksport rzucił" — flaga JEST rozwiązana, a karta nie
 * powstała. Panel musi to pokazać uczciwie, bo cisza sugerowałaby, że karty w ogóle
 * nie próbowano odblokować.
 */
export interface ExportAttemptDto {
  sessionUuid: string;
  outcome: ExportOutcomeDto | null;
}

/**
 * Odpowiedź `POST /admin/api/flags/:id/resolve`.
 *
 * Serwer zwraca SKUTEK, a nie `204`: panel mówi „arkusz odblokowany · rewizja 1"
 * zamiast samego „zapisano", i nie musi zgadywać, co się stało.
 */
export interface ResolveFlagResultDto {
  flagId: number;
  type: FlagType;
  resolvedAt: string;
  /** Pusta lista = ta flaga nie blokowała eksportu, więc żadnej karty nie ruszano. */
  exports: ExportAttemptDto[];
}

// ── dni lotne (`A02`) i karta dnia (`A02a`) ─────────────────────────────────────

/**
 * Jeden dzień lotny na liście — odpowiedź `GET /admin/api/sessions`.
 *
 * **Wszystkie liczby są PRZEPISANE z projekcji `sessions`, nie policzone tutaj ani
 * w SQL-u.** Serwer wypełnia je `sessionRowFrom(projectSession(stream))`, więc kolumna
 * „Blok" na tej liście, ekran 10 telefonu i karta arkusza pokazują tę samą wielkość
 * policzoną tym samym kodem. Panel je wyłącznie FORMATUJE (`@uzaero/format`).
 *
 * Czasy zdarzeń w epoch ms UTC, stemple serwera w ISO 8601 — i to nie jest
 * niekonsekwencja: `dutyStart` jest czasem, który zapisał telefon (ta sama domena, co
 * `Event.gpsTime`), a `updatedAt` chwilą, w której serwer przyjął paczkę.
 */
export interface SessionListItemDto {
  sessionUuid: string;

  aircraftId: string;
  /** `null` = samolot spoza rejestru floty; dzień zostaje widoczny, rejestracji brak. */
  reg: string | null;
  aircraftType: string | null;
  /**
   * Format licznika TEGO samolotu. Panel formatuje przez `motoHours(value, mhFormat)`
   * i nie zgaduje: `1284.6` i `645:06` to ten sam rodzaj wielkości i dwa różne liczniki
   * w kabinie.
   */
  mhFormat: MhFormat | null;

  picId: string;
  picCode: string | null;
  picName: string | null;
  dualId: string | null;
  dualCode: string | null;
  dualName: string | null;

  /**
   * `active` = brak `day_close` w rejestrze. **To NIE jest „w locie"** — projekcja nie
   * niesie informacji o pracy silnika (patrz baner `A02-dni.html`), więc panel mówi
   * „dzień otwarty" i nie udaje wiedzy, której nie dostał.
   */
  status: 'active' | 'closed';
  operation: OperationType | null;
  client: string | null;

  /**
   * Początek służby — meldunek z `preflight_confirm`, kolumna „Dzień · UTC".
   * `null` = sesja bez preflightu; taki dzień NIE MA daty i wypada z filtra zakresu.
   */
  dutyStart: number | null;
  closeTime: number | null;

  blockMs: number;
  flightMs: number;
  flightsCount: number;
  mhStart: number | null;
  /** `null` dopóki nie ma `day_close` — odczyt końcowy istnieje dopiero z przekazania. */
  mhEnd: number | null;
  fuelStartL: number | null;
  fuelEndL: number | null;

  /** Typy OTWARTYCH flag tej sesji; pusta lista = dzień bez zastrzeżeń. */
  openFlags: FlagType[];
  /** Ostatnia rewizja karty arkusza; `null` = nigdy nie eksportowano. */
  exportRevision: number | null;
  /** ISO 8601 UTC — ostatnia przyjęta paczka tej sesji, czyli „kiedy ostatni sync". */
  updatedAt: string;
}

/**
 * Strona listy dni. **`nextCursor === null` znaczy „to był koniec", nie „spróbuj
 * jeszcze raz"** — a `total` opisuje CAŁY wynik filtra, także wtedy, gdy `limit`
 * obciął stronę.
 *
 * Kursor jest NIEPRZEZROCZYSTY i panel nie ma prawa go konstruować: koduje klucz
 * sortowania SQL-a (`infrastructure/pg/keyset.ts`). Odsyłamy dokładnie ten napis,
 * który przyszedł.
 */
export interface SessionPageDto {
  items: SessionListItemDto[];
  nextCursor: string | null;
  total: number;
}

/**
 * Pozycja osi zdarzeń karty dnia.
 *
 * Oś pokazuje strumień SUROWY — rejestr jest append-only i widać w nim wszystko,
 * łącznie ze zdarzeniami unieważnionymi. Adnotacje wylicza serwer PORÓWNANIEM
 * z wynikiem `applyCorrections`; panel ich nie odtwarza i nie przesortowuje osi.
 */
export interface TimelineEntryDto {
  /** Byt domenowy — jedzie bez własnego DTO (reguła granicy typów serwera). */
  event: Event;
  /** `true` = unieważnione korektą; wiersz jest PRZEKREŚLONY, nigdy ukryty. */
  voided: boolean;
  /** Czas po korekcie (`retime`); `null` = czas zdarzenia jest oryginalny. */
  correctedTime: number | null;
}

/**
 * Karta jednego dnia — odpowiedź `GET /admin/api/sessions/:uuid`.
 *
 * `state` to JEDYNE miejsce panelu, w którym liczby dnia pochodzą z `projectSession`
 * policzonego na żądanie. Jedzie w całości i jako typ domenowy, żeby panel formatował
 * liczby serwera zamiast liczyć własne — to ta sama gwarancja, co
 * `server/test/contract.test.ts`: karta dnia w panelu i ekran 10 telefonu nie mogą
 * się różnić.
 */
export interface SessionDetailDto {
  session: SessionListItemDto;
  state: SessionState;
  /** Porządek CHRONOLOGICZNY nadaje serwer. Panel go NIE zmienia (patrz `dzienTimeline`). */
  timeline: TimelineEntryDto[];
  /** Flagi sesji RAZEM z rozwiązanymi — historia decyzji zostaje na karcie. */
  flags: FlagListItemDto[];
}
