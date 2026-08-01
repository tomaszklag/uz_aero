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
  EventCorrectionPayload,
  EventType,
  FlagStatus,
  FlagType,
  MhFormat,
  OperationType,
  RuleViolation,
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

/**
 * Katalog akcji dziennika audytu. LUSTRO `server/src/domain/adminActions.ts` — świadome,
 * opisane i PRZYBITE TESTEM (`admin/test/adminActions.mirror.test.ts`).
 *
 * Ta sama sytuacja, co przy `Capability` wyżej: katalog mieszka w `server/src/domain/`,
 * a panel nigdy nie importuje z wnętrza serwera (§5.2). Różnica jest jednak istotna
 * i dlatego ta kopia dostaje mechanizm, którego `Capability` nie ma: ekran `A09` musi
 * mieć KOMPLET kodów, bo mapuje każdy z nich na plakietkę i opis (`Record<AdminAction,
 * …>` w `screens/audyt/audytActions.ts` wymusza to kompilatorem). Lista przepisana
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
   * 409 `conflict` z zapisu konta: KTÓRE pole jest zajęte. Bez tego formularz z trzema
   * polami dostawałby „naruszenie unikalności" i nie wiedziałby, co poprawić.
   */
  field?: 'code' | 'email';
  /**
   * 409 `refused` z zapisu konta: DLACZEGO odmówiono (`self_deactivate`, `last_admin`…).
   * Odmowa bez powodu przy przycisku „Deaktywuj" kazałaby administratorowi zgadywać,
   * czy to awaria, czy zasada — czyli dokładnie w tej chwili sięgnąć po `UPDATE` w psql.
   */
  reason?: PilotRefusalDto;
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
  /** Porządek CHRONOLOGICZNY nadaje serwer. Panel go NIE zmienia (patrz `dzienTimeline`). */
  timeline: TimelineEntryDto[];
  /** Flagi sesji RAZEM z rozwiązanymi — historia decyzji zostaje na karcie. */
  flags: FlagListItemDto[];
}

// ── dziennik audytu (`A09`) ─────────────────────────────────────────────────────

/**
 * Jeden wpis dziennika — odpowiedź `GET /admin/api/audit`.
 *
 * ══ DWA POLA SĄ NAPISAMI CELOWO I NIE WOLNO ICH ZWĘZIĆ ══
 * `action` i `actorRole` opisują stan świata Z CHWILI AKCJI. Migracja 9 świadomie nie
 * zakłada na nie `CHECK`-a, żeby przemianowanie akcji albo wycofanie roli nie
 * unieważniało wpisu sprzed roku. Panel idzie za tą decyzją: kod spoza katalogu
 * pokazujemy DOSŁOWNIE (`audytActions.ts`), zamiast go ukrywać albo wywracać się na nim.
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
   * (`audytPages.ts`) i nigdy nie zamienia `null` na `0` — zero jest twierdzeniem
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
 * nazwanie ich po polsku jest sprawą panelu (`screens/piloci/kontoActions.ts`),
 * bo serwer nie zna języka interfejsu.
 */
export type PilotRefusalDto =
  | 'self_deactivate'
  | 'self_demote'
  | 'last_admin'
  | 'inactive_account';

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
  reexport: ExportOutcomeDto | null;
}
