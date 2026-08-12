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
  ConsumptionModel,
  ConsumptionSummary,
  Event,
  EventCorrectionPayload,
  EventType,
  FlagStatus,
  FlagType,
  FlightProfile,
  FuelInterval,
  MhFormat,
  MhModel,
  OperationType,
  RuleViolation,
  ServiceStatus,
  SessionState,
  TrackPoint,
  TrackVertex,
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
  | 'audit.read'
  /** Narzędzia serwisowe `A11`: porównanie i nadpisanie projekcji, stan schematu. */
  | 'maintenance.run';

/**
 * Katalog akcji dziennika audytu. LUSTRO `server/src/domain/adminActions.ts` — świadome,
 * opisane i PRZYBITE TESTEM (`admin/test/adminActions.mirror.test.ts`).
 *
 * Ta sama sytuacja, co przy `Capability` wyżej: katalog mieszka w `server/src/domain/`,
 * a panel nigdy nie importuje z wnętrza serwera (§5.2). Różnica jest jednak istotna
 * i dlatego ta kopia dostaje mechanizm, którego `Capability` nie ma: ekran `A09` musi
 * mieć KOMPLET kodów, bo mapuje każdy z nich na plakietkę i opis (`Record<AdminAction,
 * …>` w `screens/audit/auditActions.ts` wymusza to kompilatorem). Lista przepisana
 * ręcznie i niepilnowana rozjechałaby się przy pierwszej nowej komendzie panelu —
 * i objawiłoby się to dopiero wtedy, gdy ktoś by tej akcji szukał w dzienniku.
 *
 * Czego ta kopia NIE robi: nie decyduje o tym, co wolno zapisać. Zapisuje wyłącznie
 * serwer, typem `AdminAction` po swojej stronie. Tu są nazwy do nazwania — i do
 * zbudowania filtra, który serwer i tak waliduje `isAdminAction`.
 *
 * **Dziennik może nieść kody SPOZA tej listy** (wpisy historyczne, akcja wycofana
 * z katalogu — `admin_audit.action` celowo nie ma `CHECK`-a). Dlatego DTO niżej ma
 * `action: string`, a nie `AdminAction`: unia opisuje katalog, nie zawartość tabeli.
 */
export type AdminAction =
  | 'flag.resolve'
  | 'event.correct'
  | 'export.retry'
  | 'pilot.create'
  | 'pilot.update'
  | 'pilot.deactivate'
  | 'pilot.password_reset'
  | 'aircraft.create'
  | 'aircraft.update'
  | 'aircraft.disable'
  | 'thresholds.update'
  | 'maintenance.rebuild_projections'
  | 'maintenance.retry_exports'
  | 'maintenance.prune_tokens';

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
   * 422 `rule_violation` z zapisu korekty: KTÓRE reguły domeny odmówiły. Panel ma
   * pokazać konkretny powód z tej listy, a nie „popraw formularz" — kody i komunikaty
   * pochodzą z `packages/domain/src/rules/violations.ts` i są pisane dla człowieka.
   */
  violations?: RuleViolation[];
  /**
   * 409 `already_resolved`: stan flagi, którą ktoś zamknął PIERWSZY.
   *
   * Odmowa niesie tu treść, a nie tylko kod, i to jest jej sens: przegrany wyścig
   * ma pokazać CZYJE rozstrzygnięcie zdążyło i jakim komentarzem — inaczej drugi
   * klikający dopisałby własne uzasadnienie do decyzji, której nie podjął.
   */
  flag?: ResolvedFlagWireDto;
  /**
   * 409 `conflict` z zapisu konta albo jednostki: KTÓRE pole jest zajęte. Bez tego
   * formularz z kilkoma polami dostawałby „naruszenie unikalności" i nie wiedziałby,
   * co poprawić. `reg` dochodzi z ekranu floty (`A07a`) — rejestracja jest unikalna
   * w całym systemie, bo widać ją w logu dnia, w nazwie karty arkusza i w każdej fladze.
   */
  field?: 'code' | 'email' | 'reg';
  /**
   * 409 `refused` z zapisu konta: DLACZEGO odmówiono (`self_deactivate`, `last_admin`…).
   * Odmowa bez powodu przy przycisku „Deaktywuj" kazałaby administratorowi zgadywać,
   * czy to awaria, czy zasada — czyli dokładnie w tej chwili sięgnąć po `UPDATE` w psql.
   */
  reason?: PilotRefusalDto | FleetRefusalDto;
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
 * RODZAJ awarii próby eksportu — jedzie razem z `outcome: null`.
 *
 * `sheets_adapter` = rzucił zapis karty (niedostępny Google, padnięta baza kart);
 * ponowienie za chwilę ma sens. `unexpected` = rzuciło cokolwiek innego po stronie
 * serwera; ponowienie samo z siebie tego nie naprawi i panel ma tak powiedzieć,
 * zamiast obiecywać, że minie.
 */
export type ExportFailureDto = 'sheets_adapter' | 'unexpected';

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

// ── monitor eksportu (`A05`) ────────────────────────────────────────────────────

/**
 * Stan karty dnia — wnioskuje go SERWER, panel wyłącznie nazywa.
 *
 * Wniosek składa się z czterech faktów naraz (status sesji, obecność chwili przejęcia,
 * otwarte flagi blokujące, obecność wiersza w `export_log`), a panel widzi każdy z nich
 * osobno — złożenie ich tutaj byłoby drugą definicją reguły, która i tak musi istnieć
 * na serwerze, bo to ona bramkuje eksport.
 *
 * Stanu „karta nieaktualna" (`NIEAKTUALNY` z `ANALIZA`) **nie ma i to jest świadome**:
 * wymagałby porównania stempla eksportu ze stemplem projekcji, a te pochodzą z dwóch
 * różnych zegarów (aplikacji i Postgresa). Mockup `A05` tego stanu zresztą nie zna —
 * rozróżnia „W arkuszu" i „Rewizja N", a jedno i drugie wynika z numeru rewizji.
 */
export type ExportStateDto = 'waiting' | 'blocked' | 'impossible' | 'missing' | 'current';

/**
 * Jeden dzień lotny widziany OD STRONY ARKUSZA — odpowiedź `GET /admin/api/exports`.
 *
 * Wiersz powstaje z projekcji sesji, a nie z `export_log`, i to jest istota tego ekranu:
 * dzień BEZ ani jednego eksportu jest tu najważniejszym wierszem, a nie brakiem danych.
 */
export interface ExportListItemDto {
  sessionUuid: string;

  /**
   * Nazwa karty wg konwencji §4.7 (`YYYY-MM-DD_SP-XXX`) — policzona przez serwer TĄ
   * SAMĄ funkcją, którą eksporter nazywa kartę przy zapisie. Panel jej NIE skleja:
   * druga konwencja nazw znaczyłaby link do karty, której w bazie nie ma.
   * `null` = sesja bez `session_claim`, czyli karty nie da się nazwać.
   */
  tab: string | null;
  /** Dzień karty `YYYY-MM-DD` (UTC z chwili przejęcia); `null` razem z `tab`. */
  day: string | null;
  /** Chwila przejęcia samolotu (epoch ms UTC) — kolumna „Dzień". `null` = rejestr bez claimu. */
  claimedAt: number | null;

  aircraftId: string;
  /** `null` = samolotu nie ma już w rejestrze floty; dzień zostaje widoczny. */
  reg: string | null;
  aircraftType: string | null;

  picId: string;
  picCode: string | null;
  picName: string | null;

  /** `active` = brak `day_close`. NIE znaczy „w locie" — projekcja tego nie niesie. */
  sessionStatus: 'active' | 'closed';
  state: ExportStateDto;

  /** Ostatnia rewizja karty; `null` = nigdy nie eksportowano. */
  revision: number | null;
  /** ISO 8601 UTC — chwila ostatniej UDANEJ wysyłki. */
  exportedAt: string | null;
  sheetUrl: string | null;

  /** Otwarte flagi trzymające kartę poza arkuszem — cel linku „Do flagi". */
  blockingFlagIds: number[];
  /** ISO 8601 UTC — ostatnia przyjęta paczka tej sesji („kiedy ostatni sync"). */
  updatedAt: string;

  /**
   * INNA sesja zapisała kartę o tej samej nazwie PÓŹNIEJ — treść leżąca dziś pod `tab`
   * opisuje TAMTEN dzień pracy, nie ten wiersz.
   *
   * Nazwa karty (`YYYY-MM-DD_SP-XXX`) niesie dzień i samolot, ale nie sesję, więc dwie
   * zamknięte zmiany na jednym samolocie tego samego dnia budują kartę o tej samej
   * nazwie — a `exported_sheets` jest po niej UPSERT-owane. Serwer wykrywa to
   * w `export_log`; panel niczego tu nie porównuje.
   */
  overwrittenBy: { sessionUuid: string; exportedAt: string } | null;
}

/**
 * Liczniki kafli i chipów. Liczy je SERWER nad CAŁYM zakresem zapytania — także po
 * zawężeniu chipem (inaczej po jednym kliknięciu wszystkie pozostałe pokazywałyby zero)
 * i także wtedy, gdy `limit` obciął listę (inaczej kafel opisywałby okno, a nie rejestr).
 */
export interface ExportCountsDto {
  /** Wszystkie dni w zakresie filtra — NIEZALEŻNIE od zawężenia chipem stanu. */
  total: number;
  current: number;
  blocked: number;
  missing: number;
  waiting: number;
  impossible: number;
  /**
   * Karty z rewizją > 1 — wymiar, nie stan. Liczone WYŁĄCZNIE po numerze rewizji, bez
   * oglądania się na stan karty; chip „Rewizje" zawęża panel dokładnie tak samo.
   */
  revised: number;
  /** Dni, których kartę nadpisała inna sesja tego dnia (`overwrittenBy`). */
  overwritten: number;
}

/**
 * Strona monitora. **Bez kursora i to jest celowe**: ekran jest zawężony do ZAKRESU DAT,
 * a zakres w skali klubu to kilkadziesiąt dni lotnych. Kursor dokłada się tam, gdzie
 * lista rośnie bez granicy (dziennik audytu, rejestr zdarzeń); tu granicę stawia kalendarz.
 *
 * Kalendarza panel jednak jeszcze nie ma, więc `limit` bywa realną granicą — i wtedy
 * `truncated` mówi to wprost. Lista przycięta po cichu wygląda na komplet, a to jest
 * najgorszy tryb awarii narzędzia nadzoru.
 */
export interface ExportPageDto {
  items: ExportListItemDto[];
  counts: ExportCountsDto;
  /** Ile dni pasuje do zapytania RAZEM z zawężeniem — także tych poza `limit`. */
  matched: number;
  /** `true` = `limit` obciął listę. */
  truncated: boolean;
}

/** Jedna wysyłka karty — wiersz `export_log`. */
export interface ExportRevisionDto {
  revision: number;
  day: string;
  sheetUrl: string;
  exportedAt: string;
}

/**
 * Historia rewizji jednej karty — `GET /admin/api/exports/:sessionUuid`.
 *
 * `sheetRows` (0 albo 1) jedzie OSOBNO od `revisions.length` i to jest cała treść tego
 * rozwinięcia: „3 wiersze dziennika, 1 wiersz karty". `export_log` jest append-only
 * i pamięta każdą wysyłkę; `exported_sheets` trzyma wyłącznie treść bieżącą, bo czytelnik
 * linku ma widzieć aktualny stan dnia — tak jak widziałby arkusz.
 */
export interface ExportHistoryDto {
  sessionUuid: string;
  tab: string | null;
  state: ExportStateDto;
  /** Od najstarszej rewizji — to jest oś czasu jednej karty, a nie lista. */
  revisions: ExportRevisionDto[];
  sheetRows: number;
  /**
   * Ten sam fakt, co w wierszu listy — jedzie tu, bo to PODGLĄD wprowadza w błąd:
   * gdy kartę zapisała później inna sesja, `rows` opisują tamten dzień pracy.
   */
  overwrittenBy: { sessionUuid: string; exportedAt: string } | null;
}

/** Treść BIEŻĄCEJ karty — dosłowne wiersze dokumentu, nie projekcja do liczenia. */
export interface SheetPreviewDto {
  tab: string;
  rows: string[][];
  updatedAt: string;
}

/**
 * Wynik ponowienia — odpowiedź `POST /admin/api/exports/:sessionUuid/retry`.
 *
 * **Odmowa jedzie jako 200, nie jako błąd.** „Dzień jeszcze otwarty" i „flaga trzyma
 * kartę" to poprawne odpowiedzi o stanie świata; awarią jest dopiero `outcome: null`,
 * czyli „eksport rzucił" — jedyny stan, w którym mockupowa „Błąd regeneracji" ma
 * pokrycie w danych. Widać go WYŁĄCZNIE tutaj: nieudany eksport nie zostawia wiersza
 * w żadnej tabeli, więc lista nie ma z czego go odtworzyć.
 */
export interface ExportRetryDto {
  sessionUuid: string;
  tab: string | null;
  revisionBefore: number | null;
  revisionAfter: number | null;
  outcome: ExportOutcomeDto | null;
  /** `null` ⟺ `outcome != null`. RODZAJ awarii, gdy próba rzuciła. */
  failure: ExportFailureDto | null;
  retriedAt: string;
}

/** Odpowiedź ponowienia: wynik próby + ŚWIEŻY wiersz listy, żeby panel nie dopytywał. */
export interface ExportRetryResultDto {
  retry: ExportRetryDto;
  row: ExportListItemDto | null;
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
 * niekonsekwencja: `claimedAt` jest czasem, który zapisał telefon (ta sama domena, co
 * `Event.gpsTime`), a `updatedAt` chwilą, w której serwer przyjął paczkę.
 *
 * **Ten wiersz opisuje SESJĘ SAMOLOTU (przejęcie → zdanie), nie dzień pilota.** Dzień
 * pilota to lista sesji na różnych maszynach (issue #23; klamra służby nie istnieje
 * w modelu w ogóle), więc nie ma go czego szukać w wierszu jednej sesji — a sesje
 * bywają krótkie (dwie zmiany dziennie na maszynie to norma).
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
   * Chwila PRZEJĘCIA samolotu (`session_claim`), kolumna „Dzień · UTC". Każda sesja ją
   * ma (§4.4), więc od 2026-08-07 żaden dzień nie wypada z filtra zakresu z powodu
   * braku daty. `null` znaczy rejestr niekompletny, nie „bez preflightu".
   */
  claimedAt: number | null;
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
  /**
   * `true` = to zdarzenie poprawił ADMINISTRATOR z panelu, a nie pilot w oknie 24 h.
   *
   * Panelowi tej różnicy nie da się wyliczyć z osi: `event_correction` wygląda
   * identycznie niezależnie od tego, kto ją dopisał, a rozróżnia je kolumna serwera
   * `events.source_device`. Konsekwencja jest jednak dla panelu decydująca — korekta
   * pilota idzie przez `POST /events`, czyli Z POMINIĘCIEM bramy `AuditedWrite`, więc
   * wpisu w `admin_audit` po niej nie ma. Przejście „ślad w audycie" wiesza się
   * dokładnie na tym polu.
   */
  adminCorrected: boolean;
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
  /** Porządek CHRONOLOGICZNY nadaje serwer. Panel go NIE zmienia (patrz `dayTimeline`). */
  timeline: TimelineEntryDto[];
  /** Flagi sesji RAZEM z rozwiązanymi — historia decyzji zostaje na karcie. */
  flags: FlagListItemDto[];
}

// ── rejestr zdarzeń (`A04`) ─────────────────────────────────────────────────────

/** Który zegar dał czas efektywny — ten, którym liczy projekcja serwera. */
export type EventClockDto = 'gps' | 'device';

/**
 * Jedno zdarzenie w rejestrze — odpowiedź `GET /admin/api/events`.
 *
 * ══ DWA POLA SĄ CELOWO SZERSZE, NIŻ WYGLĄDAJĄ ══
 *  1. **`type` jest napisem, nie `EventType`.** Kolumna `events.type` nie ma `CHECK`-a,
 *     a walidacja katalogu zachodzi na WEJŚCIU (`POST /events`). Rejestr pokazuje więc
 *     typ spoza katalogu DOSŁOWNIE — narzędzie śledcze, które wywraca się na własnej
 *     historii, jest bezużyteczne dokładnie wtedy, gdy jest potrzebne. Ta sama decyzja,
 *     co przy `AuditEntryDto.action`.
 *  2. **`payload` jest `unknown`, nie `Record<string, unknown>`.** `JSONB` przyjmuje też
 *     tablicę, liczbę i `null`. Obietnica „to zawsze obiekt" jest obietnicą, której baza
 *     nie składa, a panel ma pokazać to, co przyszło z telefonu, a nie to, czego się
 *     spodziewa.
 *
 * ══ DWA ZEGARY ══
 * `driftMs === null` znaczy **„różnicy nie ma czego liczyć"** (brak fixa GPS), a nie
 * „zero". Zero jest twierdzeniem, że zegary się zgadzały — i to jest cała treść kolumny
 * `Δ zegarów` z mockupu `A04`.
 */
export interface EventEntryDto {
  uuid: string;
  sessionUuid: string;

  aircraftId: string;
  /** `null` = jednostki nie ma już w rejestrze floty; zdarzenie zostaje. */
  reg: string | null;

  picId: string;
  picCode: string | null;
  picName: string | null;
  dualId: string | null;
  dualCode: string | null;
  dualName: string | null;

  /** Surowy kod typu — także spoza katalogu (patrz nagłówek). */
  type: string;

  /** Zegar telefonu (epoch ms UTC) — zawsze obecny. */
  deviceTime: number;
  /** Czas z fixa GPS (epoch ms UTC); `null` = brak fixa w chwili zapisu. */
  gpsTime: number | null;
  /** `|device − gps|` w ms; `null` = brak fixa, więc różnica NIE ISTNIEJE. */
  driftMs: number | null;
  /**
   * Czas, którym liczy projekcja — **PO nałożeniu korekt**, nie z kolumn surowych.
   * Surowe zegary stoją w `deviceTime`/`gpsTime` obok, więc nic nie ginie.
   */
  effectiveTime: number;
  /** Który zegar dał `effectiveTime` — w TYM SAMYM stanie (po korektach). */
  effectiveClock: EventClockDto;

  /** Treść zdarzenia DOSŁOWNIE z `JSONB`, dowolnego kształtu. */
  payload: unknown;
  schemaVersion: number;

  /** ISO 8601 UTC — kiedy SERWER przyjął zdarzenie. Po tym idzie porządek listy. */
  receivedAt: string;
  sourceDevice: string | null;
  /** TEN WIERSZ zapisał panel, a nie telefon — fakt o pochodzeniu zapisu. */
  writtenByPanel: boolean;

  /** Korekta unieważniła zdarzenie. Wiersz ZOSTAJE — przekreślony, nie usunięty. */
  voided: boolean;
  /** Zdarzenie RUSZAŁA korekta — z istnienia zapisu, nie z nierówności wartości. */
  corrected: boolean;
  /** Czas NADANY korektą `retime` (epoch ms UTC); `null` = czasu nie nadano. */
  correctedTime: number | null;
  /** Korektę TEGO ZDARZENIA zapisał PANEL, nie pilot w oknie 24 h (`source_device`). */
  adminCorrected: boolean;
}

/**
 * Liczniki kafli `A04`. Liczy je SERWER nad CAŁYM zakresem zapytania — także wtedy,
 * gdy `limit` obciął listę. Kafel opisuje rejestr, a nie okno, przez które właśnie
 * ktoś patrzy.
 */
export interface EventCountsDto {
  total: number;
  withoutGpsFix: number;
  clockDrift: number;
  /** Próg, którym policzono `clockDrift` — panel go WYPISUJE, a nie zna. */
  driftThresholdMs: number;
}

/** Strona rejestru. Kursor keyset po `(received_at, uuid)`. */
export interface EventsPageDto {
  items: EventEntryDto[];
  nextCursor: string | null;
  /**
   * **`null` = serwer tych liczb nie policzył, a NIE „zero".** Liczy je wyłącznie dla
   * PIERWSZEJ strony (bez kursora): są własnością zapytania, a nie strony, a pełny
   * `COUNT(*)` na najszybciej rosnącej tabeli w systemie jest wielokrotnie droższy
   * od samej strony. Panel niesie wartości z pierwszej strony i nigdy nie zamienia
   * `null` na `0`.
   */
  counts: EventCountsDto | null;
}

// ── dziennik audytu (`A09`) ─────────────────────────────────────────────────────

/**
 * Jeden wpis dziennika — odpowiedź `GET /admin/api/audit`.
 *
 * ══ DWA POLA SĄ NAPISAMI CELOWO I NIE WOLNO ICH ZWĘZIĆ ══
 * `action` i `actorRole` opisują stan świata Z CHWILI AKCJI. Migracja 9 świadomie nie
 * zakłada na nie `CHECK`-a, żeby przemianowanie akcji albo wycofanie roli nie
 * unieważniało wpisu sprzed roku. Panel idzie za tą decyzją: kod spoza katalogu
 * pokazujemy DOSŁOWNIE (`auditActions.ts`), zamiast go ukrywać albo wywracać się na nim.
 * Dziennik nadzoru, który nie otwiera się przez własną historię, przestaje być dziennikiem.
 *
 * `details` jest workiem o kształcie zależnym od akcji — serwer wydaje go bez
 * interpretacji. Panel czyta z niego pola po nazwie i **pokazuje także te, których nie
 * rozumie**: dziennik, który ukrywa pole, bo go nie zna, przestaje być narzędziem nadzoru.
 */
export interface AuditEntryDto {
  /** `admin_audit.id` — rosnący; w kolumnie czasu widać go jako `#8814`. */
  id: number;
  /** ISO 8601 UTC — chwila akcji wg zegara serwera. */
  createdAt: string;

  actorPilotId: string;
  /** `null` = konta nie ma już w `pilots`; wpis zostaje z samym identyfikatorem. */
  actorCode: string | null;
  actorName: string | null;
  actorRole: string;

  action: string;
  /** `flag` · `event` · `pilot` · `aircraft` · `sheet` … — `null` przy akcji bez celu. */
  targetType: string | null;
  targetId: string | null;

  details: Record<string, unknown>;
  /** `null` = akcja spoza żądania HTTP (skrypt administracyjny). */
  ip: string | null;
}

/** Strona dziennika. Kursor keyset — `nextCursor === null` znaczy „to był koniec". */
export interface AuditPageDto {
  items: AuditEntryDto[];
  nextCursor: string | null;
  /**
   * Ile wpisów spełnia CAŁY filtr, także gdy `limit` obciął stronę.
   *
   * **`null` = serwer tej liczby nie policzył, a NIE „zero".** Liczy ją wyłącznie dla
   * PIERWSZEJ strony (bez kursora): jest własnością zapytania, a nie strony, więc nie
   * zmienia się przy przewijaniu, a pełny `COUNT(*)` na dzienniku bez górnej granicy
   * jest wielokrotnie droższy od samej strony. Panel niesie wartość z pierwszej strony
   * (`auditPages.ts`) i nigdy nie zamienia `null` na `0` — zero jest twierdzeniem
   * o świecie, brak odpowiedzi nim nie jest.
   */
  total: number | null;
}

// ── konta pilotów (`A06`, `A06a`) ───────────────────────────────────────────────

/**
 * Jedno konto na liście — odpowiedź `GET /admin/api/pilots`.
 *
 * ══ CZEGO TU NIE MA I DLACZEGO ══
 *  1. **Hasła i hasha.** Hasło jedzie WYŁĄCZNIE w odpowiedzi na akcję, która je
 *     wytworzyła (`PilotSecretDto`), i tylko raz; hash nie opuszcza serwera nigdy.
 *  2. **`lastLoginAt`.** Mockup A06 ma kolumnę „Ostatnie logowanie”, a `pilots` nie
 *     ma takiej kolumny i nikt jej nie zapisuje. Panel tej kolumny NIE pokazuje
 *     i mówi o tym wprost na ekranie — wyliczanie jej z czegokolwiek innego byłoby
 *     inną wielkością pod tą samą etykietą.
 *
 * `flyingDays` liczy SERWER agregatem po projekcji `sessions`, w oknie, które ta sama
 * odpowiedź podaje w `daysFrom`/`daysTo`. Panel go wyłącznie wyświetla.
 */
export interface PilotListItemDto {
  id: string;
  /** Etykieta w logu dnia i w kartach arkusza — NIE klucz zdarzeń (te wiążą `id`). */
  code: string;
  name: string;
  email: string | null;
  active: boolean;
  role: PilotRole;
  /** ISO 8601 UTC — ostatnia zmiana wiersza konta. Nie: ostatnie logowanie. */
  updatedAt: string;
  flyingDays: number;
}

/** Liczniki kafli i karty „Rola w panelu" — po WSZYSTKICH kontach, nie po filtrze. */
export interface PilotCountsDto {
  total: number;
  active: number;
  inactive: number;
  admin: number;
  trainingLead: number;
  pilot: number;
  /**
   * Dni lotne CAŁEGO klubu w oknie `daysFrom`–`daysTo`: liczba sesji ZAMKNIĘTYCH,
   * a nie suma kolumny `flyingDays` z wierszy. Dzień szkolny liczy się dwóm pilotom
   * naraz, więc suma kolumny byłaby liczbą osobodni — panel nie ma jak tej różnicy
   * odgadnąć i dlatego liczbę podaje serwer.
   */
  flyingDays: number;
}

/**
 * Liczniki CHIPÓW filtra — cztery zawężenia listy w bieżącym WYSZUKIWANIU.
 *
 * Osobne od `PilotCountsDto`, bo odpowiadają na inne pytanie. Kafel opisuje KLUB
 * („Konta aktywne 8 / 10") i ma się nie ruszać przy wpisywaniu w wyszukiwarkę; chip
 * z liczbą jest obietnicą „tyle wierszy zobaczysz po kliknięciu". Do 2026-08-01 chipy
 * nosiły liczby kafli, więc po wpisaniu frazy chip „Nieaktywni" pokazywał 2 i po
 * kliknięciu dawał pustą tabelę.
 */
export interface PilotScopeCountsDto {
  /** Chip „Wszyscy". */
  total: number;
  active: number;
  inactive: number;
  /** Chip „Z rolą panelu" — konta z rolą dającą wejście do panelu. */
  panel: number;
}

/**
 * Lista kont. **Bez kursora i to jest celowe**: klub ma kilkanaście kont, a lista
 * referencyjna, którą trzeba stronicować, nie nadaje się na słownik do filtra innego
 * ekranu. `total` mówi, ile kont spełnia filtr — także gdy `limit` obciął listę.
 */
export interface PilotPageDto {
  items: PilotListItemDto[];
  total: number;
  counts: PilotCountsDto;
  /** Liczniki chipów — patrz `PilotScopeCountsDto`. Bez wyszukiwania = jak `counts`. */
  scopes: PilotScopeCountsDto;
  /** Okno, w którym policzono `flyingDays` — dzień UTC `YYYY-MM-DD`, włącznie. */
  daysFrom: string;
  daysTo: string;
}

/**
 * Odpowiedź akcji, która WYTWORZYŁA hasło (założenie konta, reset hasła).
 *
 * `password` widzimy jeden jedyny raz: nie ma go w bazie (jest hash), nie ma
 * w dzienniku audytu (jest sam fakt) i nie ma trasy „pokaż ponownie". Panel nie ma
 * prawa go nigdzie zapisać — pokazuje w szufladzie i zapomina razem z jej zamknięciem.
 */
export interface PilotSecretDto {
  pilot: PilotListItemDto;
  password: string;
  /** Ile sesji pilota unieważniono przy okazji (reset zrywa wszystkie). */
  revokedSessions: number;
}

/** Odpowiedź zmiany konta bez hasła: nowy stan wiersza + skutki uboczne. */
export interface PilotChangeDto {
  pilot: PilotListItemDto;
  /** `0` przy zmianie tożsamości; przy deaktywacji — ile sesji zerwano. */
  revokedSessions: number;
}

/**
 * Powód, dla którego serwer ODMÓWIŁ zmiany na koncie (`409 refused`).
 *
 * Lustro `AccountRefusal` z `server/src/domain/accountGuards.ts`. Kody są surowe —
 * nazwanie ich po polsku jest sprawą panelu (`screens/pilots/accountActions.ts`),
 * bo serwer nie zna języka interfejsu.
 */
export type PilotRefusalDto =
  | 'self_deactivate'
  | 'self_demote'
  | 'last_admin'
  | 'inactive_account';

// ── flota (`A07`, `A07a`) ───────────────────────────────────────────────────────

/**
 * Kto trzyma samolot TERAZ — sesja bez `day_close`.
 *
 * **To NIE jest „w locie"** i mockup A07 tak to podpisuje wyłącznie skrótem myślowym.
 * Projekcja `sessions` nie niesie stanu silnika (ta sama granica, co na liście dni
 * `A02`), więc claim znaczy „ktoś zajął jednostkę na dziś" — a czy w tej chwili kołuje,
 * czy stoi na płycie, tego serwer nie wie i panel nie zgaduje.
 */
export interface AircraftClaimDto {
  /** Sesja trzymająca claim — stąd link w głąb, na kartę dnia `A02a`. */
  sessionUuid: string;
  picId: string;
  /** `null` = konta nie ma już w `pilots`; claim zostaje z samym identyfikatorem. */
  picCode: string | null;
  picName: string | null;
  /** Chwila PRZEJĘCIA samolotu (epoch ms UTC); `null` = rejestr bez `session_claim`. */
  since: number | null;
}

/**
 * Ostatni znany odczyt liczników — PODPOWIEDŹ, nie prawda.
 *
 * Mockup A07 mówi to wprost: „Liczniki fizyczne wygrywają. Wartości z tej tabeli są
 * podpowiedzią dla pilota na preflight, nie prawdą". Dlatego `at` jedzie razem
 * z wartością: odczyt bez wieku byłby twierdzeniem o teraźniejszości, którym nie jest.
 */
export interface AircraftReadingDto {
  /** Godziny dziesiętne — panel formatuje przez `motoHours(value, mhFormat)`. */
  mh: number;
  fuelL: number;
  at: number;
  byPilotId: string;
  byPilotName: string | null;
  /** `handover` = z zamkniętego dnia; `open_session` = z dnia, który jeszcze trwa. */
  source: 'handover' | 'open_session';
}

/**
 * Jedna jednostka na liście `A07` — odpowiedź `GET /admin/api/fleet`.
 *
 * ══ `fuelToleranceL` LICZY SERWER I TO JEST TREŚĆ TEJ TRASY ══
 * Tolerancja flagi `FUEL_MISMATCH` to `max(10 L, 5% pojemności)` — nie stała, tylko
 * funkcja pojemności. Panelowi wolno importować z `@uzaero/domain` wyłącznie TYPY,
 * więc gdyby serwer nie podawał wyniku, ekran musiałby albo pominąć kolumnę progu (tak
 * było przez cztery przekroje), albo policzyć ją sam — czyli zacząć trzymać drugą kopię
 * reguły §4.5 w przeglądarce.
 *
 * ══ CZEGO TU NIE MA ══
 * **Daty i powodu wyłączenia** („od 19 JUN 2026 · remont" z mockupu). Tabela `aircraft`
 * ma `service_status` i `updated_at`, i nic poza tym; `updated_at` mówi „kiedy ruszono
 * wiersz", a nie „od kiedy samolot stoi". Kto i kiedy wyłączył jednostkę, wie dziennik
 * audytu (`aircraft.disable`) — i tam prowadzi link z szuflady.
 */
export interface AircraftListItemDto {
  id: string;
  /** Znaki na kadłubie — unikalne. Etykieta, nie klucz zdarzeń (te wiążą `id`). */
  reg: string;
  type: string;
  year: number | null;
  capacityL: number;
  /** Efektywna tolerancja `FUEL_MISMATCH` (L) dla tej pojemności — patrz wyżej. */
  fuelToleranceL: number;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
  /** ISO 8601 UTC — ostatnia zmiana wiersza konfiguracji, nie: ostatni lot. */
  updatedAt: string;

  claim: AircraftClaimDto | null;
  reading: AircraftReadingDto | null;
  /**
   * ISO 8601 UTC — kiedy serwer ostatnio przyjął ZDARZENIE tego samolotu.
   * `null` = ani jednego zdarzenia w rejestrze („brak danych", nigdy „zero").
   */
  lastEventAt: string | null;

  /** Sesje bez `day_close` — blokują wyłączenie ze służby. */
  openSessions: number;
  /** Otwarte flagi tej jednostki — karta „Skutki zmiany" pokazuje je „bez przeliczenia". */
  openFlags: number;
}

/** Liczniki kafli `A07` — po CAŁEJ flocie, nie po zawężeniu listy. */
export interface FleetCountsDto {
  total: number;
  active: number;
  disabled: number;
  claimed: number;
}

/**
 * Lista floty. **Bez kursora i to jest celowe**: klub ma kilka jednostek, a lista
 * referencyjna, którą trzeba stronicować, nie nadaje się na słownik do filtra listy
 * dni (`A02`). Ta sama decyzja, co przy kontach pilotów.
 */
export interface FleetPageDto {
  items: AircraftListItemDto[];
  counts: FleetCountsDto;
  /**
   * Liczniki CHIPÓW — te same cztery zawężenia, ale w bieżącym WYSZUKIWANIU.
   *
   * Osobne od `counts`, bo odpowiadają na inne pytanie. Kafel opisuje FLOTĘ („W służbie
   * 4 / 5") i ma się nie ruszać przy wpisywaniu w wyszukiwarkę; chip z liczbą jest
   * obietnicą „tyle wierszy zobaczysz po kliknięciu". Przy kontach pilotów sklejenie
   * tych dwóch liczb było usterką widoczną gołym okiem: chip pokazywał 2 i po kliknięciu
   * dawał pustą tabelę. Bez wyszukiwania `scopes` zgadza się z `counts`.
   */
  scopes: FleetCountsDto;
}

/**
 * Próg `FUEL_MISMATCH` rozwiązany dla pojemności, która NIE MUSI być w bazie —
 * odpowiedź `GET /admin/api/fleet/tolerance`.
 *
 * To jest jedyna droga, którą karta „Skutki zmiany" (`A07a`) dostaje liczbę
 * `±62.9 → ±55.0 L`: panel pyta serwer o próg dla wartości wpisanej w formularzu,
 * zamiast liczyć 5% po swojemu.
 */
export interface AircraftToleranceDto {
  /** `null` = pytanie bez pojemności; próg schodzi wtedy do podłogi 10 L. */
  capacityL: number | null;
  fuelToleranceL: number;
}

/** Odpowiedź zapisu konfiguracji — pełny, świeży wiersz listy. */
export interface AircraftChangeDto {
  aircraft: AircraftListItemDto;
}

/**
 * Powód, dla którego serwer ODMÓWIŁ zmiany konfiguracji (`409 refused`).
 *
 * Lustro `FleetRefusal` z `server/src/domain/fleetGuards.ts`. Kody są surowe —
 * nazwanie ich po polsku jest sprawą panelu (`screens/fleet/aircraftActions.ts`),
 * bo serwer nie zna języka interfejsu.
 */
export type FleetRefusalDto = 'capacity_not_positive' | 'open_session';

// ── korekta administratora (`A02b`) ─────────────────────────────────────────────

/**
 * Kształt korekty na drucie — DOKŁADNIE payload domenowy, bez pól panelu.
 *
 * Jedzie w podglądzie i w zapisie, więc żyje w jednym miejscu: druga definicja byłaby
 * pierwszym punktem, w którym karta „przed → po" opisuje inną operację niż ta, którą
 * panel za chwilę wysyła.
 */
export type CorrectionDraftDto = EventCorrectionPayload;

/**
 * Zdarzenie korygowane — ORYGINALNY ODCZYT z rejestru (karta „oryginalny odczyt").
 *
 * Oba zegary stoją obok siebie, bo różnica między nimi jest całą treścią scenariusza:
 * `gpsTime === null` znaczy „zapisano bez fixa GPS", a wtedy projekcja bierze
 * `deviceTime` — czyli zegar telefonu ze wszystkimi jego wadami.
 */
export interface CorrectionTargetDto {
  uuid: string;
  type: EventType;
  deviceTime: number;
  /** `null` = brak fixa GPS w chwili zapisu. */
  gpsTime: number | null;
  /** Czas, którym projekcja liczy dzień DZIŚ; `null` = zdarzenie już unieważnione. */
  effectiveTime: number | null;
  voided: boolean;
  /** `events.source_device` — dowolny napis z telefonu albo `admin:<id>`. TEKST. */
  sourceDevice: string | null;
  /** Pełne zdarzenie — panel opisuje payload tym samym kodem, co oś dnia. */
  event: Event;
}

/**
 * Odpowiedź `POST /admin/api/sessions/:uuid/corrections/preview` — DRY-RUN.
 *
 * Serwer liczy `before` i `after` przez `projectSession`, bo panelowi wolno importować
 * z domeny wyłącznie typy. To nie jest wygoda: `void` na `engine_stop` NIE skraca cyklu
 * o różnicę czasów, tylko zostawia go otwartym, przez co wypada z czasu blokowego
 * w całości — tej reguły nie da się odgadnąć z payloadu.
 *
 * Podgląd nie przyjmuje `reason`: skutek ogląda się PRZED napisaniem uzasadnienia.
 */
export interface CorrectionPreviewDto {
  sessionUuid: string;
  /** `null` = celu nie ma w tej sesji; `violations` niesie wtedy powód. */
  target: CorrectionTargetDto | null;
  before: SessionState;
  after: SessionState;
  /** Naruszenia, które ZABLOKOWAŁYBY zapis. Pusta lista = w tej chwili wolno. */
  violations: RuleViolation[];
  /**
   * Miękkie naruszenia — KOLIZJE, nie powody odmowy. Panel pokazuje je jako baner nad
   * formularzem korekty.
   *
   * Zastąpiły bramkę `400 day_open` (2026-08-07). Dwa kody:
   * `ADMIN_EDIT_SESSION_ACTIVE` (pilot nadal prowadzi sesję i dośle własne zdarzenia)
   * i `ADMIN_EDIT_PILOT_WINDOW_OPEN` (okno 24 h od zdania sesji jeszcze biegnie, więc
   * obie strony mogą poprawiać naraz). Rozstrzyga człowiek — panel nie blokuje przycisku.
   */
  warnings: RuleViolation[];
}

/**
 * Odpowiedź `POST /admin/api/sessions/:uuid/corrections` — korekta ZAPISANA.
 *
 * `reexport: null` znaczy **korekta jest w rejestrze, a karta arkusza NIE powstała** —
 * eksport rzucił. Panel musi to pokazać wprost: sugerowanie sukcesu byłoby kłamstwem,
 * a sugerowanie porażki gorszym kłamstwem, bo administrator powtórzyłby korektę.
 */
export interface CorrectionResultDto {
  sessionUuid: string;
  /** Uuid DOPISANEGO zdarzenia — adres korekty w rejestrze i na osi dnia. */
  correctionUuid: string;
  targetUuid: string;
  action: CorrectionDraftDto['action'];
  /** ISO 8601 UTC — chwila zapisu wg zegara serwera. */
  recordedAt: string;
  /** Stan dnia PO korekcie, policzony `projectSession`. Panel go formatuje. */
  state: SessionState;
  /**
   * Kolizje policzone PRZED zapisem — te same dwa kody, co w podglądzie. Jadą
   * w odpowiedzi POZYTYWNEJ, bo korekta JEST w rejestrze: panel ma powiedzieć, w co
   * administrator wszedł, a nie udawać, że zapis się nie odbył.
   */
  warnings: RuleViolation[];
  reexport: ExportOutcomeDto | null;
}

// ── pulpit (`A01`, `A01a`) ──────────────────────────────────────────────────────

/**
 * Stan silnika jednostki z OTWARTĄ sesją — policzony na serwerze `projectSession`.
 *
 * Panel nie ma jak tego wyliczyć i to jest cały powód istnienia tego pola: zakaz
 * importów wartościowych z `@uzaero/domain` (§5.1) odcina mu `projectSession`, więc
 * „W locie" albo przychodzi z serwera, albo nie istnieje. Na `A02` i `A07` NIE
 * istniało; tutaj przychodzi, bo zbiór jest ograniczony do floty klubu.
 *
 * `null` na tym polu znaczy DOKŁADNIE „ta jednostka nie ma otwartej sesji", nigdy
 * „nie wiemy, czy silnik pracuje".
 */
export interface EngineStateDto {
  sessionUuid: string;
  engineRunning: boolean;
  inFlight: boolean;
  /** Numer bieżącego (albo ostatniego) lotu dnia — podpis „lot 4". */
  flightsCount: number;
  /** Czas OTWARTEGO startu (epoch ms UTC); `null` = nie ma lotu w toku. */
  openTakeoffAt: number | null;
  /** Koniec ostatniego ZAMKNIĘTEGO cyklu silnika; `null` = silnik nigdy nie stanął. */
  engineStoppedAt: number | null;
  lastEventAt: number | null;
  /**
   * Chwila PRZEJĘCIA samolotu (`session_claim`, epoch ms UTC) — od kiedy maszyna jest
   * zajęta. Do 2026-08-07 stał tu meldunek pilota — odszedł najpierw z §3.6a (klamra
   * per pilot, nie per maszyna), a od issue #23 klamra służby nie istnieje w ogóle.
   */
  claimedAt: number | null;
  departureIcao: string | null;
  dualId: string | null;
  dualName: string | null;
  /** `0` przy otwartym claimie = ktoś zajął samolot i nic od niego nie dotarło. */
  eventCount: number;
}

/** Jednostka na pulpicie: wiersz floty `A07` plus stan silnika, gdy dzień trwa. */
export interface DashboardAircraftDto {
  aircraft: AircraftListItemDto;
  engine: EngineStateDto | null;
}

/**
 * Liczniki kafli. Każdy pochodzi z zapytania ekranu docelowego — kafel jest przejściem,
 * więc jego liczba musi być obietnicą „tyle wierszy tam zobaczysz".
 */
export interface DashboardCountsDto {
  aircraftTotal: number;
  aircraftActive: number;
  aircraftClaimed: number;
  openDays: number;
  openFlags: number;
  exports: ExportCountsDto;
}

/**
 * Kolejka „Wymaga uwagi" jako TRZY listy w kontraktach ekranów docelowych.
 *
 * Spłaszczenie ich na serwerze wymagałoby czwartej definicji „sprawy"; złożenie
 * w jeden porządek jest decyzją o treści ekranu i mieszka w `dashboardTodo.ts`.
 */
export interface DashboardAttentionDto {
  flags: FlagListItemDto[];
  failedExports: ExportListItemDto[];
  staleOpenDays: SessionListItemDto[];
}

/** Histogram „Napływ zdarzeń" liczony po `received_at` — zegarze SERWERA. */
export interface DashboardInflowDto {
  fromMs: number;
  toMs: number;
  bucketMs: number;
  /** Zawsze PEŁNA tablica; godzina bez zdarzeń to `0`, nie brak wiadra. */
  buckets: number[];
}

/**
 * Jedno zdarzenie w karcie „Ostatnio przyjęte". Bez `payload` — pulpit odpowiada na
 * pytanie „czy coś do nas dociera", a nie „co dokładnie przyszło" (od tego jest oś
 * karty dnia).
 */
export interface RecentEventDto {
  uuid: string;
  sessionUuid: string;
  aircraftId: string;
  reg: string | null;
  type: EventType;
  /** Czas ZDARZENIA (GPS przed zegarem telefonu), epoch ms UTC. */
  eventTime: number;
  /** Kiedy SERWER je przyjął (ISO 8601 UTC) — oś porządku tej listy. */
  receivedAt: string;
  picId: string;
  picCode: string | null;
  picName: string | null;
}

/** Sumy jednej doby UTC — „Dziś w liczbach" i „Ostatni dzień lotny". */
export interface DayTotalsDto {
  day: string;
  fromMs: number;
  toMs: number;
  sessions: number;
  aircraft: number;
  flights: number;
  blockMs: number;
  /** Zdarzenia PRZYJĘTE w tej dobie — nie „zdarzenia z tego dnia". */
  eventsAccepted: number;
}

/**
 * Odpowiedź `GET /admin/api/dashboard` — cały pulpit jednym żądaniem.
 *
 * `at` jest tu polem UŻYTKOWYM, nie metadaną: wszystkie wieki („sync 2 min temu",
 * „flaga czeka 3 dni") panel liczy WZGLĘDEM NIEGO, a nie względem `Date.now()`
 * przeglądarki. Powód jest konkretny — stemple, z którymi je porównujemy, nadaje
 * baza, więc zegar przeglądarki jest w tym równaniu trzecim, niepotrzebnym i jedynym
 * niesprawdzonym. Administrator z przestawionym zegarem widziałby „sync 3 h temu"
 * przy telefonie, który zsynchronizował się przed chwilą.
 */
export interface DashboardDto {
  at: string;
  /** Okno samodzielnej korekty pilota (ms) — z domeny, bo panel nie ma jej skąd wziąć. */
  correctionWindowMs: number;
  counts: DashboardCountsDto;
  fleet: DashboardAircraftDto[];
  attention: DashboardAttentionDto;
  inflow: DashboardInflowDto;
  recent: RecentEventDto[];
  today: DayTotalsDto;
  /** `null` = w projekcji nie ma ani jednego dnia lotnego. */
  lastFlyingDay: DayTotalsDto | null;
}

// ── statystyki (`A10`) ──────────────────────────────────────────────────────────

/**
 * Zakres raportu — obustronnie domknięty, po DNIU ZAMKNIĘCIA sesji (`close_time`):
 * dzień wchodzi do sum tam, gdzie został domknięty, bo dopiero wtedy jego liczby są
 * ostateczne. `defaulted` = serwer zastosował zakres domyślny (ostatnie 30 dni od
 * DZIŚ zegara SERWERA — panel bez parametrów w adresie nie rozstrzyga, co znaczy „dziś").
 */
export interface StatsRangeDto {
  fromDay: string;
  toDay: string;
  fromMs: number;
  toMs: number;
  calendarDays: number;
  defaulted: boolean;
}

/**
 * Sumy zakresu. KAŻDA liczba — także ilorazy (procenty, średnie) — pochodzi z serwera:
 * konstytucja ekranu mówi „panel sumuje gotowe wyniki, nie liczy własnych metryk",
 * a dzielenie dwóch sum po swojemu byłoby właśnie własną metryką.
 *
 * `null` znaczy „nie wiemy" i ma tu DWA źródła, oba nazwane: `staleRows` (wiersze
 * projekcji sprzed kolumn statystyk — naprawia przebudowa na `A11`) oraz
 * `fuelUnknownSessions`/`mhUnknownSessions` (dni zamknięte, których bilansu nie da
 * się policzyć). Panel nigdy nie zamienia `null` na zero.
 */
export interface StatsTotalsDto {
  sessions: number;
  aircraft: number;
  /** PIC ∪ OSTATNI dual każdego dnia — dual zastąpiony w środku dnia może wypaść. */
  pilots: number;
  blockMs: number;
  flightMs: number;
  flightVsBlockPct: number | null;
  takeoffs: number | null;
  landings: number | null;
  fuelConsumedL: number | null;
  fuelUnknownSessions: number;
  mhDeltaH: number | null;
  mhUnknownSessions: number;
  /** Blok dni ZE ZNANYM Δ MH (h dziesiętne) — mianownik rozjazdu z tego samego zbioru dni. */
  mhBlockHours: number;
  mhVsBlockH: number | null;
  staleRows: number;
  /** Sesje OTWARTE z chwilą przejęcia w zakresie — celowo poza sumami. */
  openSessionsInRange: number;
  /**
   * Sesje OTWARTE BEZ `session_claim` — rejestr niekompletny: nie mają daty, więc nie
   * należą do żadnego zakresu i są liczone ZAWSZE. Do 2026-08-07 licznik obejmował
   * sesje z samym claimem (kolumna niosła wtedy opcjonalny meldunek); dziś taka sesja
   * MA datę, a ten licznik jest sygnałem o połamanym strumieniu i w zdrowym klubie stoi
   * na zerze.
   */
  openSessionsUndated: number;
}

/** Punkt szeregu „nalot dzień po dniu". Dzień bez sesji to PRAWDZIWE zero. */
export interface StatsDailyPointDto {
  day: string;
  blockMs: number;
}

export interface StatsAircraftItemDto {
  aircraftId: string;
  reg: string | null;
  aircraftType: string | null;
  capacityL: number | null;
  mhFormat: MhFormat | null;
  sessions: number;
  blockMs: number;
  flightMs: number;
  takeoffs: number | null;
  landings: number | null;
  fuelConsumedL: number | null;
  fuelUnknownSessions: number;
  avgLitresPerBlockHour: number | null;
  mhFirstStart: number | null;
  mhLastEnd: number | null;
  mhDeltaH: number | null;
  mhUnknownSessions: number;
  activeDays: number;
  utilizationPct: number | null;
  staleRows: number;
}

/**
 * Ujęcie „per pilot" — atrybucja po PIC-u (starty i lądowania też). Kolumny „Blok
 * jako Dual" TU NIE MA: projekcja niesie OSTATNIEGO duala dnia, a zmiana załogi
 * w środku dnia przypisałaby mu cudze godziny — atrybucja per członek załogi czeka
 * na projekcję domenową (ekran mówi to wprost).
 */
export interface StatsPilotItemDto {
  pilotId: string;
  code: string | null;
  name: string | null;
  sessions: number;
  blockMs: number;
  flightMs: number;
  takeoffs: number | null;
  landings: number | null;
  regs: string[];
  staleRows: number;
}

export interface StatsOperationItemDto {
  operation: OperationType | null;
  sessions: number;
  blockMs: number;
  flightMs: number;
  takeoffs: number | null;
  landings: number | null;
  fuelConsumedL: number | null;
  fuelUnknownSessions: number;
  avgLitresPerBlockHour: number | null;
  blockSharePct: number | null;
  regs: string[];
  clients: number;
  staleRows: number;
}

export interface StatsClientItemDto {
  client: string | null;
  lifts: number;
  jumpers: number;
  tandem: number;
  aff: number;
  solo: number;
  avgAltitudeFt: number | null;
  jumpersPerLift: number | null;
}

/** Strona przychodowa — zakres zawężony do operacji `skoki` (podpis mockupu). */
export interface StatsDropsDto {
  sessions: number;
  flightMs: number;
  lifts: number | null;
  jumpers: number | null;
  tandem: number | null;
  aff: number | null;
  solo: number | null;
  liftsPerSession: number | null;
  jumpersPerLift: number | null;
  /** Średnia WYŁĄCZNIE ze zrzutów z fixem — liczona z SUMY i LICZNIKA, nie ze średnich. */
  avgAltitudeFt: number | null;
  /** Zrzuty Z fixem — licznik SERWERA; panel nie odtwarza go odejmowaniem. */
  dropsWithAltitude: number | null;
  dropsWithoutAltitude: number | null;
  jumpersPerFlightHour: number | null;
  /** Dni skokowe sprzed kolumn statystyk ORAZ dni bez rodzaju operacji (mogły być skokowe). */
  staleRows: number;
  /** Pusta przy `staleRows > 0` — częściowa tabela wyglądałaby na kompletną. */
  clients: StatsClientItemDto[];
}

/** Odpowiedź `GET /admin/api/stats` — trzy ujęcia jednego zbioru dni naraz. */
export interface StatsReportDto {
  /** Zegar serwera (ISO 8601 UTC) — presety dat liczą „dziś" od niego. */
  at: string;
  range: StatsRangeDto;
  totals: StatsTotalsDto;
  daily: StatsDailyPointDto[];
  aircraft: StatsAircraftItemDto[];
  pilots: StatsPilotItemDto[];
  operations: StatsOperationItemDto[];
  drops: StatsDropsDto;
}

// ── konserwacja (A11) ───────────────────────────────────────────────────────────

/**
 * Tryb raportu przebudowy. `dry_run` powstaje w ZAPYTANIU
 * (`GET /maintenance/projections/compare` — zero zapisów, zero wpisów w dzienniku),
 * `write` w KOMENDZIE (`POST /maintenance/projections/rebuild`, przez `AuditedWrite`).
 * Pole zostaje, bo dwa identycznie wyglądające raporty różnią się wyłącznie tym,
 * czego już nie widać.
 */
export type RebuildModeDto = 'dry_run' | 'write';

/** Jedna rozbieżność: pole projekcji, wartość zapisana i wartość z przeliczenia. */
export interface ProjectionFieldDiffDto {
  field: string;
  stored: unknown;
  computed: unknown;
}

/** Jedna sesja, która nie zgadza się z przeliczeniem ze strumienia. */
export interface ProjectionRowDiffDto {
  sessionUuid: string;
  aircraftId: string;
  /** Dzień karty (`YYYY-MM-DD`, UTC); `null` = sesja bez preflightu. */
  day: string | null;
  /** `true` = wiersza projekcji NIE MA w ogóle, choć sesja jest w rejestrze. */
  missing: boolean;
  fields: ProjectionFieldDiffDto[];
}

/**
 * Raport przebiegu.
 *
 * **Niezerowe `rowsDiffering` to INCYDENT, nie sukces** — projekcja jest odświeżana
 * w tej samej transakcji, w której serwer przyjmuje zdarzenia, więc w normalnej pracy
 * różnicy być NIE MOŻE. Ekran mówi to wprost, zamiast zachęcać do kliknięcia „napraw".
 */
export interface RebuildReportDto {
  mode: RebuildModeDto;
  sessions: number;
  /** Liczba PEŁNA, policzona nad całym rejestrem — niezależna od limitu raportu. */
  rowsDiffering: number;
  fieldsDiffering: number;
  /** Ile wierszy FAKTYCZNIE nadpisano; w `dry_run` zawsze 0. */
  written: number;
  /**
   * Ile rozjechanych sesji ZOSTAŁO poza tym raportem (`rowsDiffering - diffs.length`).
   *
   * Przy `write` ta sama liczba znaczy dodatkowo „tyle sesji nadal się różni i czeka na
   * kolejne uruchomienie": jeden przebieg nadpisuje najwyżej tyle sesji, ile opisuje
   * raport, bo każda z nich jest na czas transakcji zamknięta dla przyjmowania zdarzeń,
   * a blokady advisory idą ze wspólnej puli klastra.
   *
   * Zero znaczy „raport jest kompletny", a nie „nie wiadomo".
   */
  remaining: number;
  /** Lista PRZYCIĘTA po stronie serwera; ile jej brakuje, mówi `remaining`. */
  diffs: ProjectionRowDiffDto[];
}

/**
 * Stan tabeli `refresh_tokens` PRZED czyszczeniem.
 *
 * Same liczby i daty — wartości ani skrótów tokenów nie ma tu i nie może być
 * (`A09`: „Tokeny i refresh tokeny — nigdy").
 */
export interface RefreshTokenScanDto {
  total: number;
  expired: number;
  valid: number;
  oldestExpiredAt: string | null;
  newestExpiredAt: string | null;
  /** Chwila, wobec której serwer policzył „wygasły" — granica jest ruchoma. */
  at: string;
  ttlDays: number;
}

/** Skutek czyszczenia; te same liczby stoją w `admin_audit.details`. */
export interface TokenPurgeReportDto {
  deleted: number;
  oldestExpiredAt: string | null;
  newestExpiredAt: string | null;
  /** Policzone PO skasowaniu — wykonywalna postać „nikt nie został wylogowany". */
  remainingValid: number;
  at: string;
}

/** Jedna migracja: numer, opis stojący przy DDL-u i chwila zastosowania. */
export interface SchemaMigrationDto {
  version: number;
  title: string;
  appliedAt: string | null;
  applied: boolean;
}

/**
 * Stan schematu bazy. `pending > 0` znaczy, że baza jest STARSZA niż kod — stan możliwy
 * wyłącznie po awarii runnera migracji w starcie serwera.
 */
export interface SchemaStateDto {
  schemaVersion: number;
  applied: number;
  pending: number;
  lastAppliedAt: string | null;
  migrations: SchemaMigrationDto[];
}

// ── ślad lotu (A02c) ──────────────────────────────────────────────────────────

/**
 * Trasa jednego lotu: geometria, log punktów i profil pionowy.
 *
 * `TrackVertex`, `TrackPoint` i `FlightProfile` biorzemy jako TYPY z domeny — to byty
 * domenowe, liczone tym samym kodem, którym liczy je telefon. Własny DTO dostaje
 * wyłącznie koperta, bo złączenie śladu (pliki NDJSON) z lotem (projekcja rejestru)
 * istnieje tylko na tej trasie.
 */
export interface FlightTrackDto {
  sessionUuid: string;
  flightIndex: number;
  takeoffAt: number;
  landingAt: number | null;
  /** `auto` / `manual` — lot ręczny nigdy nie ma śladu i to nie jest błąd. */
  method: string;
  line: TrackVertex[];
  /** Próbka co 30 s PLUS wszystkie punkty odrzucone przez bramkę jakości. */
  log: TrackPoint[];
  profile: FlightProfile;
  distanceNm: number;
  maxAltitudeFt: number | null;
  totalCount: number;
  usableCount: number;
}

// ── analityka zużycia (A10a, A10b) ────────────────────────────────────────────

/**
 * Raport analityki zużycia jednego samolotu.
 *
 * `ConsumptionModel`, `MhModel`, `ConsumptionSummary` i `FuelInterval` biorzemy jako
 * TYPY z domeny — to byty domenowe, liczone tym samym kodem, którym liczy je telefon
 * (norma w aplikacji pilota wychodzi z tego samego modułu). Własne są wyłącznie koperty:
 * tożsamość jednostki, zakres i opis podstawy.
 */
export interface ConsumptionReportDto {
  at: string;
  range: StatsRangeDto;
  aircraft: {
    aircraftId: string;
    reg: string;
    aircraftType: string;
    capacityL: number;
    mhFormat: MhFormat;
    serviceStatus: string;
  };
  headline: {
    litersPerFlightHour: number | null;
    litersPerBlockHour: number | null;
    litersPerFlight: number | null;
    mhPerBlockHour: number | null;
  };
  basis: {
    sessions: number;
    sessionsInRange: number;
    openSessions: number;
    staleRows: number;
    firstDay: number | null;
    lastDay: number | null;
  };
  summary: ConsumptionSummary;
  fuel: ConsumptionModel;
  mh: MhModel;
  intervals: FuelInterval[];
}
