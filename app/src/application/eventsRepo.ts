/**
 * Ninerdeck - repozytorium zdarzeń (docs/_main.md.txt §4.1, §4.3, §4.8, §5.2).
 *
 * Serwis APLIKACYJNY nad portami: nadaje `uuid`, stempluje dwa zegary, egzekwuje
 * idempotencję i wystawia outbox oraz cache referencyjny. Zależy wyłącznie od portów
 * (`StoragePort`, `ClockPort`, `IdPort`) i domeny - nie zna SQLite, RN ani UI.
 *
 * CELOWO BEZ REGUŁ DOMENOWYCH: `appendEvent` zapisze każde poprawnie zbudowane zdarzenie.
 * Inwarianty egzekwuje warstwa komend (`application/commands`), bo repozytorium musi umieć
 * odtworzyć również historię, która powstała pod starszymi regułami (append-only).
 * Kto chce sprawdzić regułę przed zapisem, używa pary `stampEvent` + `appendStamped`.
 *
 * Zegar i generator UUID są WSTRZYKIWANE (DI) - testy podają `FixedClock` i deterministyczny
 * `generateId`, więc asercje na czasie/uuid są powtarzalne. W RN można podać
 * `expo-crypto`.randomUUID jako `generateId` (mocniejsza losowość niż fallback).
 */

import {
  CURRENT_SCHEMA_VERSION,
  projectSession,
  type AppendEventInput,
  type EpochMillis,
  type Event,
  type ReferenceAircraft,
  type ReferencePilot,
} from '../domain';
import {
  SESSION_META_KEYS,
  type ClockPort,
  type IdPort,
  type StoragePort,
  type WithheldEvent,
  type WithheldReason,
} from './ports';

/**
 * Zależności repozytorium - WYMAGANE, nie opcjonalne z domyślnymi wartościami.
 *
 * Gdyby miały domyślne (`clock = defaultClock`), warstwa aplikacji musiałaby importować
 * infrastrukturę i kierunek zależności złamałby się w jednej linijce. Produkcyjne
 * domyślne wiąże `infrastructure/createEventsRepo.ts` (composition root).
 */
export interface EventsRepoOptions {
  /** Źródło `deviceTime`/`gpsTime`. */
  clock: ClockPort;
  /** Generator UUID (klucz idempotencji). */
  generateId: IdPort;
}

/** Bieżący kontekst sesji zapisany w `session_meta` (§5.2). */
export interface CurrentSession {
  sessionUuid: string;
  pilotId: string;
  aircraftId: string;
}

export class EventsRepo {
  private readonly clock: ClockPort;
  private readonly generateId: IdPort;
  /**
   * KLUB AKTYWNY trzymany w pamięci, bo pyta o niego KAŻDY zapis zdarzenia (§7).
   * Odczyt z `session_meta` przy `init()` i przy każdej zmianie - magazyn zostaje
   * źródłem prawdy, a to jest podręczna kopia, żeby append nie robił zapytania.
   * `null` = telefon nie zna jeszcze klubu (świeża instalacja, aktualizacja z 1.x).
   */
  private activeOrgId: string | null = null;

  constructor(
    private readonly adapter: StoragePort,
    options: EventsRepoOptions,
  ) {
    this.clock = options.clock;
    this.generateId = options.generateId;
  }

  /** Zegar użyty do stemplowania zdarzeń - komendy potrzebują go do reguł czasowych. */
  get now(): EpochMillis {
    return this.clock.now();
  }

  /** Przygotowuje magazyn (schemat/migracje). Woła się raz przy starcie aplikacji. */
  async init(): Promise<void> {
    await this.adapter.init();
    this.activeOrgId = await this.adapter.getMeta(SESSION_META_KEYS.activeOrgId);
  }

  // ── klub aktywny (wielofirmowość §7) ──────────────────────────────────────────

  /** Klub, w którego kontekście telefon pracuje; `null` = jeszcze nieznany. */
  get activeOrg(): string | null {
    return this.activeOrgId;
  }

  /**
   * Ustawia klub aktywny (logowanie, odświeżenie tokenów, przełączenie na 13A) i przy
   * okazji PRZYGARNIA operacje bez klubu - zapisy sprzed 2.0.0 (§11: „klub z pierwszego
   * odświeżenia tokenów po aktualizacji"). Zwraca liczbę przygarniętych operacji.
   *
   * Przygarnięcie jest bezpieczne także przy PRZEŁĄCZENIU do drugiego klubu, bo do tego
   * czasu żadna operacja bez klubu już nie istnieje: pierwsze wejście do aplikacji po
   * aktualizacji stempluje je wszystkie klubem, w którym ten telefon pracował - a przed
   * 2.0.0 klub był dokładnie jeden.
   */
  async setActiveOrg(orgId: string): Promise<number> {
    this.activeOrgId = orgId;
    await this.adapter.setMeta(SESSION_META_KEYS.activeOrgId, orgId);
    return this.adapter.adoptSessionsWithoutOrg(orgId);
  }

  /** Klub OPERACJI - `null` dla zapisu sprzed 2.0.0 i operacji nieznanej magazynowi. */
  getSessionOrg(sessionUuid: string): Promise<string | null> {
    return this.adapter.getSessionOrg(sessionUuid);
  }

  /** Mapa operacja → klub; z niej bierze się plakietka klubu na kafelku (01e, 12). */
  getSessionOrgs(): Promise<Record<string, string>> {
    return this.adapter.getSessionOrgs();
  }

  // ── zapis zdarzeń ─────────────────────────────────────────────────────────────

  /**
   * Dopisuje zdarzenie do strumienia (append-only) i zwraca zapisany rekord.
   *
   * Dopełnia: `uuid` (v4, chyba że podany), `deviceTime` (z zegara, chyba że podany),
   * `gpsTime` (z ostatniego fixa; `undefined` = weź z zegara, jawne `null` = brak fixa),
   * `schemaVersion` (CURRENT), `syncedAt = null` (zawsze najpierw do outboxa).
   *
   * IDEMPOTENTNE: ponowny append tego samego `uuid` nie duplikuje - zwraca rekord już
   * zapisany (dedup po UUID, §4.1). Bezpieczne przy retry warstwy sync.
   */
  async appendEvent(input: AppendEventInput): Promise<Event> {
    return this.appendStamped(this.stampEvent(input));
  }

  /**
   * Buduje kompletne zdarzenie (uuid + oba zegary + wersja schematu) BEZ zapisu.
   *
   * Rozdzielone od zapisu, bo reguły domenowe (`checkAppend`) potrzebują kandydata
   * z czasami - dopiero mając ostemplowane zdarzenie można sprawdzić np. okno korekty
   * 24 h czy rozjazd device↔GPS. Warstwa komend robi: `stampEvent` → reguły → `appendStamped`.
   */
  stampEvent(input: AppendEventInput): Event {
    const uuid = input.uuid ?? this.generateId();
    const deviceTime = input.deviceTime ?? this.clock.now();
    const gpsTime = input.gpsTime !== undefined ? input.gpsTime : this.clock.gpsTime();

    // Rzut do `Event` jest bezpieczny: `AppendEventInput` to unia skorelowana
    // (para `type`↔`payload` wymuszona w miejscu wywołania). Dostęp do pól rozrywa
    // korelację dla kompilatora, ale nie w runtime - pary nie da się rozjechać.
    return {
      uuid,
      sessionUuid: input.sessionUuid,
      aircraftId: input.aircraftId,
      picId: input.picId,
      dualId: input.dualId ?? null,
      type: input.type,
      payload: input.payload,
      deviceTime,
      gpsTime,
      schemaVersion: input.schemaVersion ?? CURRENT_SCHEMA_VERSION,
      syncedAt: null,
    } as Event;
  }

  /** Zapisuje gotowe (ostemplowane) zdarzenie. Idempotentne - patrz `appendEvent`. */
  async appendStamped(event: Event): Promise<Event> {
    const inserted = await this.adapter.insertEvent(event, this.activeOrgId);
    if (!inserted) {
      const existing = await this.adapter.getEventByUuid(event.uuid);
      return existing ?? event;
    }
    return event;
  }

  /**
   * Wstawia zdarzenia POBRANE Z SERWERA (§4.9, issue #32) - odtworzenie rejestru na
   * urządzeniu, które go straciło. Zwraca liczbę wierszy faktycznie NOWYCH.
   *
   * Dwie rzeczy odróżniają to od `appendStamped` i obie są istotne:
   *
   *  • **stempel `syncedAt` z góry** - zdarzenie przyszło Z serwera, więc serwer je ma.
   *    Wstawione bez stempla wpadłoby do outboxa i telefon odesłałby własnemu serwerowi
   *    jego własne dane, przy każdej okazji synchronizacji, do skutku.
   *  • **zero reguł domenowych**, jak w całym repozytorium: odtwarzamy historię, która
   *    powstała pod regułami z chwili zapisu, a nie kandydata do zapisu.
   *
   * Dedup po `uuid` robi magazyn (`insertEvent` → `false` przy duplikacie), więc
   * pobranie zachodzące na to, co telefon już ma, jest bezpieczne i nic nie nadpisuje.
   * Zdarzenie leżące lokalnie jako NIEWYSŁANE zostaje w outboxie - o jego losie
   * rozstrzyga wysyłka (`duplicates` w odpowiedzi), a nie odczyt.
   */
  async appendFromServer(
    events: readonly Omit<Event, 'syncedAt'>[],
    syncedAt: EpochMillis = this.clock.now(),
  ): Promise<number> {
    let inserted = 0;
    for (const event of events) {
      // Klub ten sam, co przy zapisie własnym: `GET /me/events` odtwarza rejestr KLUBU
      // Z TOKENU (epik C), więc wszystko, co stąd przyszło, należy do klubu aktywnego.
      if (await this.adapter.insertEvent({ ...event, syncedAt } as Event, this.activeOrgId)) {
        inserted += 1;
      }
    }
    return inserted;
  }

  // ── odczyt zdarzeń ────────────────────────────────────────────────────────────

  getEvent(uuid: string): Promise<Event | null> {
    return this.adapter.getEventByUuid(uuid);
  }

  /** Zdarzenia jednej sesji w kolejności wstawienia (materiał dla projekcji). */
  getSessionEvents(sessionUuid: string): Promise<Event[]> {
    return this.adapter.getEventsBySession(sessionUuid);
  }

  getAllEvents(): Promise<Event[]> {
    return this.adapter.getAllEvents();
  }

  // ── outbox (§4.3) ─────────────────────────────────────────────────────────────

  /**
   * Kolejka DO WYSŁANIA TERAZ: `syncedAt IS NULL`, w kolejności wstawienia, zawężona do
   * klubu aktywnego (§7) - bo tylko jego tokenem telefon dysponuje.
   *
   * Zapis do operacji z DRUGIEGO klubu jest stanem normalnym, nie usterką: korektę
   * operacji sprzed przełączenia można zrobić z historii (ekran 10 pokazuje operacje
   * wszystkich klubów). Taki zapis czeka na powrót do swojego klubu - wysłany tokenem
   * bieżącego wróciłby jako WSTRZYMANY przez serwer (epik C waży członkostwo per
   * zdarzenie), czyli przepadłby na zawsze.
   */
  getOutbox(): Promise<Event[]> {
    return this.adapter.getUnsyncedEvents(this.activeOrgId);
  }

  /**
   * Ile zdarzeń czeka W CAŁYM rejestrze - zasila SyncChip (`OFFLINE · n`) i blokadę
   * wylogowania. Bez zawężenia do klubu, bo to pytanie brzmi „czego serwer jeszcze nie
   * ma", a nie „co da się wysłać tym tokenem".
   */
  async getOutboxCount(): Promise<number> {
    return (await this.adapter.getUnsyncedEvents()).length;
  }

  /**
   * Ile zapisów KLUBU AKTYWNEGO czeka w kolejce - blokada przełączenia klubu na 13A (§7.3).
   *
   * Pyta wyłącznie o klub, z którego pilot WYCHODZI, bo to jego zapisy zostałyby bez drogi
   * wyjścia: token drugiego klubu ich nie wyśle. Zapisy INNYCH klubów przełączenia nie
   * blokują - byłoby to zakleszczenie, w którym korekta z klubu A czeka na powrót do A,
   * a powrót do A blokuje właśnie ta korekta.
   */
  async pendingInActiveOrg(): Promise<number> {
    return (await this.adapter.getUnsyncedEvents(this.activeOrgId)).length;
  }

  /**
   * Oznacza zdarzenia jako wysłane (po potwierdzeniu serwera). Znika z outboxa.
   * @param syncedAt czas potwierdzenia (domyślnie `clock.now()`).
   */
  markSynced(uuids: string[], syncedAt: EpochMillis = this.clock.now()): Promise<void> {
    return this.adapter.markSynced(uuids, syncedAt);
  }

  // ── zapisy wstrzymane (issue #81) ─────────────────────────────────────────────

  /**
   * WSTRZYMUJE wskazane zdarzenia: wypadają z outboxa na zawsze, zostają w rejestrze
   * (patrz `StoragePort.withholdEvents`). Wołane, gdy o losie zapisu zdecydował ktoś
   * inny niż ten telefon - administrator z panelu albo serwer w ingeście.
   */
  withholdEvents(
    uuids: string[],
    reason: WithheldReason,
    withheldAt: EpochMillis = this.clock.now(),
  ): Promise<void> {
    return this.adapter.withholdEvents(uuids, reason, withheldAt);
  }

  /**
   * PRZEMIATANIE OUTBOXA PRZED WYSYŁKĄ (issue #81): każda operacja, której zaległe
   * zapisy czekają w kolejce, a którą administrator już ZAKOŃCZYŁ albo UNIEWAŻNIŁ
   * (`session_close` / `session_void` z `source: 'admin'` - przyszły z serwera przez
   * `GET /me/events`), oddaje te zapisy do wstrzymanych. Zwraca uuidy wstrzymane
   * w tym przebiegu.
   *
   * ══ DLACZEGO TU, A NIE PRZY ODTWORZENIU ══
   * Odtworzenie tylko DOPISUJE do rejestru (§4.9) i nie ma wiedzieć, co z tego wynika.
   * Niezmiennik brzmi „outbox nigdy nie niesie zapisu do operacji zakończonej przez
   * administratora" - i pilnuje go ten, kto z outboxa czyta, tuż przed wysyłką,
   * na aktualnym stanie rejestru. Przemiatanie jest tanie: kolejka to kilka operacji,
   * a strumień każdej i tak liczy się w pamięci.
   */
  async withholdAdminEnded(withheldAt: EpochMillis = this.clock.now()): Promise<string[]> {
    const pending = await this.adapter.getUnsyncedEvents();
    const bySession = new Map<string, Event[]>();
    for (const event of pending) {
      const list = bySession.get(event.sessionUuid);
      if (list) list.push(event);
      else bySession.set(event.sessionUuid, [event]);
    }

    const withheld: string[] = [];
    for (const [sessionUuid, queued] of bySession) {
      const state = projectSession(await this.adapter.getEventsBySession(sessionUuid));
      const reason: WithheldReason | null = state.voidedByAdmin
        ? 'admin_void'
        : state.closedByAdmin
          ? 'admin_close'
          : null;
      if (reason == null) continue;
      const uuids = queued.map((e) => e.uuid);
      await this.adapter.withholdEvents(uuids, reason, withheldAt);
      withheld.push(...uuids);
    }
    return withheld;
  }

  /** Wszystkie wstrzymane zapisy - liczniki na ekranie 01 i w historii (12). */
  getWithheld(): Promise<WithheldEvent[]> {
    return this.adapter.getWithheldEvents();
  }

  // ── cache referencyjny (§4.8, §5.2) ──────────────────────────────────────────

  /**
   * Zapisuje samoloty do cache, stemplując `fetchedAt` (jeśli nie podano - `clock.now()`).
   * `fetchedAt` steruje adnotacją wieku w UI („· z cache · sync …", §6).
   */
  upsertAircraft(
    rows: Array<Omit<ReferenceAircraft, 'fetchedAt'>>,
    orgId: string,
    fetchedAt: EpochMillis = this.clock.now(),
  ): Promise<void> {
    return this.adapter.upsertAircraft(
      rows.map((r) => ({ ...r, fetchedAt })),
      orgId,
    );
  }

  upsertPilots(
    rows: Array<Omit<ReferencePilot, 'fetchedAt'>>,
    orgId: string,
    fetchedAt: EpochMillis = this.clock.now(),
  ): Promise<void> {
    return this.adapter.upsertPilots(
      rows.map((r) => ({ ...r, fetchedAt })),
      orgId,
    );
  }

  /**
   * Zbiorczy zapis cache (typowo po odpowiedzi GET /reference).
   *
   * `orgId` jedzie JAWNIE, a nie z `activeOrg`, i to jest zabezpieczenie przed wyścigiem:
   * pilot może przełączyć klub, gdy odpowiedź jest jeszcze w drodze, a wtedy flota klubu A
   * wpisałaby się pod klub B - czyli cudza maszyna na liście przejęcia. Wołający pyta
   * o klub PRZED zapytaniem do serwera i tym samym klubem zapisuje.
   */
  async upsertReference(
    orgId: string,
    input: {
      aircraft?: Array<Omit<ReferenceAircraft, 'fetchedAt'>>;
      pilots?: Array<Omit<ReferencePilot, 'fetchedAt'>>;
      fetchedAt?: EpochMillis;
    },
  ): Promise<void> {
    const fetchedAt = input.fetchedAt ?? this.clock.now();
    if (input.aircraft?.length) await this.upsertAircraft(input.aircraft, orgId, fetchedAt);
    if (input.pilots?.length) await this.upsertPilots(input.pilots, orgId, fetchedAt);
  }

  /** Flota KLUBU AKTYWNEGO - bez klubu pusta (ekran 02 pokazuje wtedy 02G). */
  getAircraft(): Promise<ReferenceAircraft[]> {
    return this.adapter.getAircraft(this.activeOrgId);
  }

  /** Po identyfikatorze - BEZ zawężenia do klubu (historia pokazuje wszystkie kluby, §7.2). */
  getAircraftById(id: string): Promise<ReferenceAircraft | null> {
    return this.adapter.getAircraftById(id);
  }

  /** Wszystkie znane maszyny - wyłącznie do rozwiązywania ZNAKU w historii (patrz port). */
  getAllAircraft(): Promise<ReferenceAircraft[]> {
    return this.adapter.getAllAircraft();
  }

  /** Liczba maszyn per klub - podpis karty klubu na 13A (patrz port). */
  aircraftCountsByOrg(): Promise<Record<string, number>> {
    return this.adapter.aircraftCountsByOrg();
  }

  /** Piloci KLUBU AKTYWNEGO - kod pilota jest własnością członkostwa (§3.2). */
  getPilots(): Promise<ReferencePilot[]> {
    return this.adapter.getPilots(this.activeOrgId);
  }

  // ── session_meta (§5.2) ──────────────────────────────────────────────────────

  getMeta(key: string): Promise<string | null> {
    return this.adapter.getMeta(key);
  }

  setMeta(key: string, value: string): Promise<void> {
    return this.adapter.setMeta(key, value);
  }

  deleteMeta(key: string): Promise<void> {
    return this.adapter.deleteMeta(key);
  }

  /** Zapamiętuje bieżącą sesję (przetrwanie restartu aplikacji). */
  async setCurrentSession(session: CurrentSession): Promise<void> {
    await this.adapter.setMeta(SESSION_META_KEYS.currentSessionUuid, session.sessionUuid);
    await this.adapter.setMeta(SESSION_META_KEYS.currentPilotId, session.pilotId);
    await this.adapter.setMeta(SESSION_META_KEYS.currentAircraftId, session.aircraftId);
  }

  /** Odczytuje bieżącą sesję z `session_meta` (null gdy którykolwiek klucz brakuje). */
  async getCurrentSession(): Promise<CurrentSession | null> {
    const sessionUuid = await this.adapter.getMeta(SESSION_META_KEYS.currentSessionUuid);
    const pilotId = await this.adapter.getMeta(SESSION_META_KEYS.currentPilotId);
    const aircraftId = await this.adapter.getMeta(SESSION_META_KEYS.currentAircraftId);
    if (!sessionUuid || !pilotId || !aircraftId) return null;
    return { sessionUuid, pilotId, aircraftId };
  }
}
