/**
 * UZ Aero — store sesji (Zustand) — CIENKA warstwa nad `application`.
 *
 * Store nie zna reguł ani bazy. Robi trzy rzeczy:
 *  1. trzyma tożsamość bieżącej sesji (`context`) i podaje ją komendom,
 *  2. woła komendę i po zapisie odświeża projekcję zapytaniami,
 *  3. wystawia UI to, co ekran ma narysować: `projection`, `outboxCount`, `warnings`, `lastError`.
 *
 * Cała walidacja siedzi w `domain/rules` i jest egzekwowana przez `SessionCommands` —
 * gdyby ekran wołał komendę z pominięciem store'u, reguły i tak obowiązują.
 *
 * Dane sesji są ZAWSZE świeże (źródłem prawdy jest telefon) — zero wariantów offline
 * w tej warstwie (§6 pkt 1). Wskaźnik łączności to wyłącznie `outboxCount`/`synced`
 * (SyncChip), liczony z outboxa.
 */

import { create } from 'zustand';

import {
  DomainRuleError,
  emptySessionState,
  type CrewChangePayload,
  type DayClosePayload,
  type FuelMhReading,
  type DetectionMethod,
  type EngineStartPayload,
  type EngineStopPayload,
  type EpochMillis,
  type Event,
  type EventCorrectionPayload,
  type GpsPosition,
  type ManualLogEntryPayload,
  type PreflightConfirmPayload,
  type RefuelPayload,
  type RuleViolation,
  type SessionFlag,
  type SessionState,
} from '../../domain';
import {
  EventRestore,
  ReferenceSync,
  SESSION_META_KEYS,
  SessionCommands,
  SessionQueries,
  FlightTrackQueries,
  SyncEngine,
  ThemePrefsSync,
  TraceSync,
  type BoardingInput,
  type ClaimInput,
  type CommandResult,
  type DropInput,
  type ManualFlightInput,
  type EventsRepo,
  type SessionContext,
  type SyncOutcome,
} from '../../application';
import { useAuthStore } from './authStore';

export type { ClaimInput, SessionContext };

export interface SessionStore {
  /** Warstwa danych — potrzebna wyłącznie do księgowości outboxa (`markSynced`, §4.3). */
  repo: EventsRepo | null;
  commands: SessionCommands | null;
  queries: SessionQueries | null;
  /**
   * Zapytania o ślad lotu (ekran 14) — podłączane osobno, bo potrzebują `TracePort`,
   * czyli magazynu stojącego OBOK rejestru (własna retencja, własna wysyłka). Ekran
   * bez podłączonej warstwy pokazuje stan pusty zamiast się wywalać: ślad jest
   * materiałem badawczym i jego brak nigdy nie może zablokować pracy.
   */
  trackQueries: FlightTrackQueries | null;

  /** Tożsamość bieżącej sesji (null przed claimem). */
  context: SessionContext | null;
  /** Strumień zdarzeń bieżącej sesji (kolejność zapisu). */
  events: Event[];
  /** Projekcja: stan i statystyki dnia. */
  projection: SessionState;
  /** Liczba zdarzeń w outboxie (zasila SyncChip). */
  outboxCount: number;
  /** true, gdy outbox pusty (SyncChip = SYNC). */
  synced: boolean;
  /**
   * Licznik zmian LOKALNEGO STRUMIENIA spoza bieżącej sesji — rośnie, gdy odtworzenie
   * (§4.9) dopisze zdarzenia z serwera. Ekrany czytające cały rejestr („Mój dzień",
   * „Historia dni") trzymają go w zależnościach efektu: bez tego pilot po czyszczeniu
   * pamięci patrzyłby na pusty dzień, mając już dane w bazie, do czasu przejścia
   * między ekranami. `projection.eventCount` tego nie łapie — opisuje JEDNĄ sesję.
   */
  streamRevision: number;
  /**
   * Czy lokalny strumień został już UZGODNIONY z serwerem w tym uruchomieniu.
   *
   * Odpowiada na jedno pytanie ekranu: „czy pustemu rejestrowi wolno wierzyć". Zanim
   * pierwsze odtworzenie się zakończy, pusta doba może być artefaktem czyszczenia
   * pamięci, a nie faktem — a „JESZCZE ŻADNEGO LOTU" pokazane pilotowi z trzema
   * sesjami za sobą jest kłamstwem (to ta sama zasada, dla której `usePilotDay` zwraca
   * `null` do pierwszego odczytu). `true` bez warstwy synca: bez serwera lokalny
   * rejestr JEST całą prawdą i nie ma na co czekać.
   */
  streamHydrated: boolean;
  /** Silnik synca — podłączany w composition root; ekran 11 pyta go o stan serwera. */
  sync: SyncEngine | null;
  /** Odświeżanie cache referencyjnego (§4.8) — podłączane razem z silnikiem. */
  referenceSync: ReferenceSync | null;
  /** Odtworzenie rejestru z serwera (§4.9, issue #32) — druga połowa outboxa. */
  eventRestore: EventRestore | null;
  /** Wysyłka śladu kalibracyjnego (faza 5) — ostatni, niskopriorytetowy krok okazji. */
  traceSync: TraceSync | null;
  /** Uzgadnianie motywu pilota przez `/me/prefs` (decyzja 2026-07-29) — ThemeProvider słucha adopcji. */
  themePrefs: ThemePrefsSync | null;
  /** Wynik ostatniego przebiegu synca — SyncChip i ekran 11 czytają stąd. */
  lastSync: SyncOutcome | null;
  /** Chwila ostatniej UDANEJ wysyłki (epoch ms) — „ostatnia udana wysyłka 14:02 UTC". */
  lastSyncAt: number | null;
  /** Otwarte flagi serwera dotykające naszych sesji (§4.5) — do pokazania na 11. */
  serverFlags: SessionFlag[];
  /** Miękkie flagi ostatniej udanej komendy (banner „zapisane, ale sprawdź"). */
  warnings: RuleViolation[];
  /** Komunikat ostatniego odrzucenia (twarda reguła) — null po udanej komendzie. */
  lastError: string | null;

  /** Podłącza gotowe warstwy (composition root aplikacji). */
  attach(deps: { repo: EventsRepo; commands: SessionCommands; queries: SessionQueries }): void;
  /** Skrót: buduje komendy i zapytania z repozytorium. */
  attachRepo(repo: EventsRepo): void;
  /** Podłącza zapytania o ślad (composition root — potrzebują magazynu śladu). */
  attachTrack(queries: FlightTrackQueries): void;
  /**
   * Podłącza warstwę synca (composition root) — bez niej `syncNow` i `refreshReference`
   * są cichym no-op (testy i StyleGuide żyją bez serwera).
   */
  attachSync(
    sync: SyncEngine,
    referenceSync: ReferenceSync,
    traceSync: TraceSync,
    themePrefs: ThemePrefsSync,
    eventRestore: EventRestore,
  ): void;

  /** Rozpoczyna/przejmuje sesję: emituje `session_claim` i ustawia kontekst (§4.4). */
  claim(input: ClaimInput): Promise<CommandResult>;
  confirmPreflight(payload: PreflightConfirmPayload): Promise<CommandResult>;
  startEngine(payload?: EngineStartPayload): Promise<CommandResult>;
  stopEngine(payload?: EngineStopPayload): Promise<CommandResult>;
  /** Rozpoczęcie kołowania — bez okna „COFNIJ", zapis natychmiastowy. */
  taxi(
    method?: DetectionMethod,
    position?: GpsPosition | null,
    at?: EpochMillis,
  ): Promise<CommandResult>;
  /** `at` = rzeczywisty czas zdarzenia, gdy różni się od chwili zapisu (§5.1). */
  takeoff(
    method?: DetectionMethod,
    position?: GpsPosition | null,
    at?: EpochMillis,
  ): Promise<CommandResult>;
  landing(
    method?: DetectionMethod,
    position?: GpsPosition | null,
    at?: EpochMillis,
  ): Promise<CommandResult>;
  refuel(payload: RefuelPayload): Promise<CommandResult>;
  /** Korekta zdarzenia (04c) — zmiana czasu albo unieważnienie, zapis append-only. */
  correctEvent(payload: EventCorrectionPayload): Promise<CommandResult>;
  drop(input: DropInput): Promise<CommandResult>;
  /** Załadunek skoczków (issue #21 pkt 7) — znacznik faktu, skład opcjonalny. */
  boarding(input: BoardingInput): Promise<CommandResult>;
  crewChange(payload: CrewChangePayload): Promise<CommandResult>;
  manualLogEntry(payload: ManualLogEntryPayload): Promise<CommandResult>;
  /**
   * Ręczny wpis CAŁEGO lotu z 01 (ekran 15) — tworzy kompletną, ZAKOŃCZONĄ sesję.
   * Nie wymaga kontekstu: sesja historyczna nie jest „bieżącą" i nie ma jej wznawiać.
   */
  manualFlight(input: ManualFlightInput): Promise<CommandResult>;
  /** Zdanie samolotu (09B) = ZATWIERDZENIE logu sesji — NIE kończy dnia pilota. */
  releaseAircraft(payload: DayClosePayload): Promise<CommandResult>;

  /** Wczytuje istniejącą sesję z bazy i odtwarza kontekst (np. po restarcie aplikacji). */
  loadSession(sessionUuid: string): Promise<void>;
  /** Oznacza zdarzenia jako wysłane i odświeża licznik outboxa (księgowość §4.3). */
  markSynced(uuids: string[]): Promise<void>;
  /** Przelicza projekcję i licznik outboxa (po cyklu synca). */
  refreshOutbox(): Promise<void>;
  /** Zapisuje wynik przebiegu synca — flagi serwera nadpisują poprzednie. */
  applySyncOutcome(outcome: SyncOutcome): void;
  /**
   * Jeden pełny przebieg synca z zapisem wyniku — wspólna droga pętli okazji
   * (`useSyncLoop`) i przycisku „SYNCHRONIZUJ TERAZ" na ekranie 11.
   */
  syncNow(): Promise<void>;
  /** Odświeża cache referencyjny, jeśli przekroczył bramę wieku (§4.8). */
  refreshReference(): Promise<void>;
  /**
   * Dopisuje do lokalnego strumienia zdarzenia, które ma serwer, a nie ma telefon
   * (§4.9, issue #32) — odtworzenie po czyszczeniu pamięci, reinstalacji albo na nowym
   * urządzeniu. Po zapisie podbija `streamRevision`, żeby otwarte ekrany przeliczyły
   * projekcje.
   */
  restoreEvents(): Promise<void>;
  /** Wysyła jedną paczkę śladu kalibracyjnego (faza 5) — cicho, bez wpływu na UI. */
  uploadTraces(): Promise<void>;
  /** Uzgadnia motyw zalogowanego pilota (push `dirty` od razu, pull za bramą wieku). */
  syncThemePrefs(): Promise<void>;
  /** Czyści stan w pamięci (wylogowanie / nowy dzień) — nie kasuje bazy. */
  reset(): void;
}

export const useSessionStore = create<SessionStore>((set, get) => {
  /** Brak podłączonych warstw to błąd programistyczny, nie stan runtime. */
  function requireCommands(): SessionCommands {
    const { commands } = get();
    if (!commands) throw new Error('SessionStore: warstwa komend nie podłączona (attachRepo).');
    return commands;
  }

  function requireQueries(): SessionQueries {
    const { queries } = get();
    if (!queries) throw new Error('SessionStore: warstwa zapytań nie podłączona (attachRepo).');
    return queries;
  }

  /** Akcje dnia wymagają wcześniejszego `claim`. */
  function requireContext(): SessionContext {
    const { context } = get();
    if (!context) throw new Error('SessionStore: brak sesji (najpierw claim).');
    return context;
  }

  /** Przelicza `events`/`projection`/`outboxCount` z warstwy danych. */
  async function refresh(): Promise<void> {
    const queries = requireQueries();
    const { context } = get();
    const events = context ? await queries.sessionEvents(context.sessionUuid) : [];
    const outbox = await queries.outboxStatus();
    set({
      events,
      projection: context ? await queries.sessionState(context.sessionUuid) : emptySessionState(),
      outboxCount: outbox.count,
      synced: outbox.synced,
    });
  }

  /**
   * Wspólna ścieżka: komenda → odświeżenie → zapamiętanie ostrzeżeń.
   * Twarde odrzucenie (`DomainRuleError`) zapisujemy w `lastError` DLA UI i rzucamy dalej,
   * żeby wołający (np. modal potwierdzenia) mógł zareagować — cichy błąd jest zakazany
   * (§6 pkt 3: „nigdy cichy błąd").
   *
   * `fromDetector` = zapis z AUTODETEKCJI GPS, jedyny wyjątek od tej zasady (issue #30).
   * „Nigdy cichy błąd" broni pilota przed martwym przyciskiem: nacisnął, nic się nie
   * stało, nie wie dlaczego. Automat niczego nie naciska — gdy jego zdarzenie kłóci się
   * z rejestrem, wygrywa rejestr, a czerwony baner „Nie zapisano" opisywałby wtedy
   * pomyłkę MASZYNY językiem utraconego wpisu pilota. Wyjątek jest wąski z rozmysłem:
   * dotyczy WYŁĄCZNIE odmowy reguły. Każda inna awaria zapisu (baza, magazyn) zostaje
   * widoczna — cisza o nieudanym zapisie to utrata danych.
   */
  async function run(
    action: () => Promise<CommandResult>,
    opts: { fromDetector?: boolean } = {},
  ): Promise<CommandResult> {
    try {
      const result = await action();
      await refresh();
      set({ warnings: result.warnings, lastError: null });
      return result;
    } catch (err) {
      if (!(opts.fromDetector === true && err instanceof DomainRuleError)) {
        set({ lastError: err instanceof Error ? err.message : String(err) });
      }
      throw err;
    }
  }

  return {
    repo: null,
    commands: null,
    queries: null,
    trackQueries: null,
    context: null,
    events: [],
    projection: emptySessionState(),
    outboxCount: 0,
    synced: true,
    streamRevision: 0,
    streamHydrated: true,
    sync: null,
    referenceSync: null,
    eventRestore: null,
    traceSync: null,
    themePrefs: null,
    lastSync: null,
    lastSyncAt: null,
    serverFlags: [],
    warnings: [],
    lastError: null,

    attach(deps) {
      set({ repo: deps.repo, commands: deps.commands, queries: deps.queries });
    },

    attachRepo(repo) {
      set({
        repo,
        commands: new SessionCommands(repo),
        queries: new SessionQueries(repo),
      });
    },

    attachSync(sync, referenceSync, traceSync, themePrefs, eventRestore) {
      // `streamHydrated: false` od chwili, w której ISTNIEJE z kim się uzgodnić:
      // dopóki pierwsze odtworzenie nie wróci, pusty rejestr może być skutkiem
      // czyszczenia pamięci, a nie faktem o dniu pilota.
      set({ sync, referenceSync, traceSync, themePrefs, eventRestore, streamHydrated: false });
    },

    attachTrack(trackQueries) {
      set({ trackQueries });
    },

    claim(input) {
      const context: SessionContext = {
        sessionUuid: input.sessionUuid,
        aircraftId: input.aircraftId,
        picId: input.picId,
        dualId: input.dualId ?? null,
      };
      // Kontekst ustawiamy PRZED komendą, żeby `refresh()` po zapisie miał czego szukać.
      set({ context });
      return run(() => requireCommands().claim(input));
    },

    confirmPreflight(payload) {
      return run(() => requireCommands().confirmPreflight(requireContext(), payload));
    },

    startEngine(payload = {}) {
      return run(() => requireCommands().startEngine(requireContext(), payload));
    },

    stopEngine(payload = {}) {
      return run(() => requireCommands().stopEngine(requireContext(), payload));
    },

    // Trzy zdarzenia, które umie zapisać AUTOMAT — i jedyne, w których `method` mówi,
    // czy za zapisem stał palec pilota. Stąd `fromDetector`: patrz nagłówek `run`.
    taxi(method = 'manual', position = null, at) {
      return run(() => requireCommands().taxi(requireContext(), method, position, at), {
        fromDetector: method === 'auto',
      });
    },

    takeoff(method = 'manual', position = null, at) {
      return run(() => requireCommands().takeoff(requireContext(), method, position, at), {
        fromDetector: method === 'auto',
      });
    },

    landing(method = 'manual', position = null, at) {
      return run(() => requireCommands().landing(requireContext(), method, position, at), {
        fromDetector: method === 'auto',
      });
    },

    refuel(payload) {
      return run(() => requireCommands().refuel(requireContext(), payload));
    },

    correctEvent(payload) {
      return run(() => requireCommands().correctEvent(requireContext(), payload));
    },

    drop(input) {
      return run(() => requireCommands().drop(requireContext(), input));
    },

    boarding(input) {
      return run(() => requireCommands().boarding(requireContext(), input));
    },

    async crewChange(payload) {
      const ctx = requireContext();
      const result = await run(() => requireCommands().crewChange(ctx, payload));
      // Zmiana PIC jest odrzucana przez regułę (single-writer, §4.1 pkt 3), więc do
      // kontekstu może wejść wyłącznie nowy Dual — i dopiero po udanym zapisie.
      if (payload.role === 'dual') {
        set({ context: { ...ctx, dualId: payload.pilotInId ?? null } });
      }
      return result;
    },

    manualLogEntry(payload) {
      return run(() => requireCommands().manualLogEntry(requireContext(), payload));
    },

    manualFlight(input) {
      return run(() => requireCommands().manualFlight(input));
    },

    releaseAircraft(payload) {
      return run(() => requireCommands().releaseAircraft(requireContext(), payload));
    },

    async loadSession(sessionUuid) {
      const queries = requireQueries();
      const events = await queries.sessionEvents(sessionUuid);
      const projection = await queries.sessionState(sessionUuid);
      const context: SessionContext | null =
        projection.sessionUuid && projection.aircraftId && projection.picId
          ? {
              sessionUuid: projection.sessionUuid,
              aircraftId: projection.aircraftId,
              picId: projection.picId,
              dualId: projection.dualId,
            }
          : null;
      const outbox = await queries.outboxStatus();
      set({
        context,
        events,
        projection,
        outboxCount: outbox.count,
        synced: outbox.synced,
        warnings: [],
        lastError: null,
      });

      // Uzgodnienie klucza usługi GPS w tle: leczy upgrade w środku otwartego dnia
      // (klucza jeszcze nie było) i crash między `day_close` a czyszczeniem. Błąd meta
      // nie może wywrócić wznowienia — dzień pilota jest ważniejszy niż ślad.
      try {
        const repo = get().repo;
        if (repo != null && projection.sessionUuid != null) {
          // Pytamy o ZDANIE samolotu (`closed`). Historyczny warunek `dutyEnd == null`
          // trzymał klucz usługi w tle wskazujący na sesję, której pilot już nie ma —
          // a samego `dutyEnd` nie ma dziś w modelu w ogóle (issue #23).
          if (!projection.closed) {
            await repo.setMeta(SESSION_META_KEYS.activeSessionUuid, projection.sessionUuid);
          } else {
            await repo.deleteMeta(SESSION_META_KEYS.activeSessionUuid);
          }
        }
      } catch {
        // Świadomie cicho — patrz komentarz wyżej.
      }
    },

    async markSynced(uuids) {
      const { repo } = get();
      if (!repo) throw new Error('SessionStore: repo nie podłączone (attachRepo).');
      await repo.markSynced(uuids);
      await refresh();
    },

    refreshOutbox() {
      return refresh();
    },

    applySyncOutcome(outcome) {
      set((state) => ({
        lastSync: outcome,
        lastSyncAt: outcome.kind === 'synced' ? Date.now() : state.lastSyncAt,
        // Flagi nadpisujemy przy KAŻDYM udanym syncu — serwer zwraca komplet otwartych,
        // więc rozwiązane u administratora same znikają z ekranu 11.
        serverFlags: outcome.kind === 'synced' ? outcome.flags : state.serverFlags,
      }));
    },

    async syncNow() {
      const { sync, applySyncOutcome, refreshOutbox } = get();
      if (sync == null) return; // testy i StyleGuide żyją bez serwera — to nie błąd
      const outcome = await sync.syncOnce();
      applySyncOutcome(outcome);
      if (outcome.kind === 'synced') await refreshOutbox();
    },

    async refreshReference() {
      const { referenceSync } = get();
      if (referenceSync == null) return;
      await referenceSync.refreshIfStale();
    },

    async restoreEvents() {
      const { eventRestore } = get();
      if (eventRestore == null) {
        // Bez warstwy synca (testy, StyleGuide) lokalny rejestr jest całą prawdą —
        // nie ma na co czekać i nie ma co odtwarzać.
        set({ streamHydrated: true });
        return;
      }

      try {
        const outcome = await eventRestore.restoreIfStale();
        // Podbijamy licznik TYLKO przy faktycznym dopisaniu wierszy: pusta dosyłka
        // zdarza się przy każdej okazji i przeliczanie po niej całego rejestru
        // na otwartym ekranie byłoby pracą bez skutku.
        if (outcome.kind === 'pulled' && outcome.inserted > 0) {
          set((state) => ({ streamRevision: state.streamRevision + 1 }));
          await refresh();
        }
      } finally {
        // Także po niepowodzeniu: offline nie jest stanem, w którym ekran ma czekać —
        // wtedy lokalny rejestr jest najlepszą dostępną prawdą i trzeba go pokazać.
        set({ streamHydrated: true });
      }
    },

    async uploadTraces() {
      const { traceSync } = get();
      if (traceSync == null) return;
      await traceSync.uploadOnce();
    },

    async syncThemePrefs() {
      const { themePrefs } = get();
      if (themePrefs == null) return; // testy i StyleGuide żyją bez serwera — to nie błąd
      // Tożsamość bierzemy ze store'u auth w chwili przebiegu — pętla okazji nie musi
      // jej znać, a moduł synca i tak weryfikuje profil przed rozmową z serwerem.
      const pilot = useAuthStore.getState().pilot;
      if (pilot == null) return;
      await themePrefs.syncIfStale(pilot.id);
    },

    reset() {
      set({
        context: null,
        events: [],
        projection: emptySessionState(),
        outboxCount: 0,
        synced: true,
        // Wylogowanie znaczy, że na tym urządzeniu może zalogować się KTOŚ INNY —
        // a jego rejestr trzeba dopiero uzgodnić z serwerem (kursor odtworzenia jest
        // przypisany do pilota, `EventRestore`). Bez warstwy synca nie ma na co czekać.
        streamHydrated: get().eventRestore == null,
        lastSync: null,
        lastSyncAt: null,
        serverFlags: [],
        warnings: [],
        lastError: null,
      });
    },
  };
});
