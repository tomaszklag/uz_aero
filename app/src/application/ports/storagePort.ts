/**
 * Ninerdeck - PORT magazynu lokalnego (docs/_main.md.txt §5.2).
 *
 * To jest port w rozumieniu architektury heksagonalnej: aplikacja mówi, czego potrzebuje
 * od magazynu; infrastruktura dostarcza implementację (`ExpoSqliteAdapter` w telefonie,
 * `InMemoryAdapter` w testach). Kierunek zależności: infrastruktura → aplikacja, nigdy
 * odwrotnie.
 *
 * DLACZEGO PORT, a nie import `expo-sqlite` wprost: moduł natywny nie działa w Node/Jest,
 * a rdzeń logiki (repo, projekcje, reguły, outbox, dedup) musi być testowalny bez telefonu.
 *
 * KONTRAKT PORZĄDKU: „chronologicznie" = **kolejność wstawienia** (append-only).
 * Świadomie NIE sortujemy po `deviceTime` - offline zegar telefonu może cofnąć się
 * w trakcie dnia (§4.1 pkt 6, §4.5); realna kolejność akcji pilota = kolejność zapisu.
 * (Porządek CZASOWY, potrzebny do arytmetyki, przywraca dopiero `projectSession`.)
 *
 * KONTRAKT IDEMPOTENCJI: `insertEvent` ignoruje duplikat `uuid` i zwraca `false`
 * (dedup po UUID, §4.1) - to na tym stoi „ponowny append nie duplikuje" z repo.
 *
 * KONTRAKT WALIDACJI: port NIE zna reguł domenowych i celowo przyjmie każde zdarzenie.
 * Inwarianty egzekwuje warstwa komend (`application/commands`) PRZED zapisem - magazyn
 * musi umieć odtworzyć dowolną historię, także zastaną.
 */

import type { EpochMillis, Event, ReferenceAircraft, ReferencePilot } from '../../domain';

export interface StoragePort {
  /** Tworzy schemat / migruje bazę. Idempotentne (można wołać przy każdym starcie). */
  init(): Promise<void>;

  // ── events (append-only) ────────────────────────────────────────────────────
  /**
   * Wstawia zdarzenie. Zwraca `false`, gdy `uuid` już istnieje (duplikat zignorowany).
   *
   * `orgId` przypisuje OPERACJĘ do klubu (wielofirmowość §7) i działa jak `INSERT OR
   * IGNORE`: klub stawia PIERWSZE zapisane zdarzenie operacji, kolejne go nie ruszają.
   * Dzięki temu korekta operacji z klubu A, dopisana wtedy, gdy aktywny jest klub B,
   * zostaje zapisem klubu A - a zapis z klubu, którego token właśnie mamy, nie ma jak
   * pojechać do cudzego dziennika. `null` = klub nieznany (telefon jeszcze się nie
   * zalogował po aktualizacji; §11).
   */
  insertEvent(event: Event, orgId: string | null): Promise<boolean>;
  getEventByUuid(uuid: string): Promise<Event | null>;
  /** Zdarzenia sesji w kolejności wstawienia. */
  getEventsBySession(sessionUuid: string): Promise<Event[]>;
  /**
   * Outbox: zdarzenia z `syncedAt IS NULL`, w kolejności wstawienia (§4.3).
   *
   * `orgId` zawęża do zapisów, które da się wysłać TOKENEM TEGO KLUBU: operacje tego
   * klubu plus operacje bez klubu (zapisy sprzed 2.0.0). `null` = bez zawężenia, czyli
   * „ile jeszcze nie wyszło" - tego pyta SyncChip i blokada wylogowania, bo one mierzą
   * kompletność rejestru na serwerze, a nie możliwość wysyłki tu i teraz.
   */
  getUnsyncedEvents(orgId?: string | null): Promise<Event[]>;
  /** Wszystkie zdarzenia w kolejności wstawienia (diagnostyka / testy). */
  getAllEvents(): Promise<Event[]>;
  /** Oznacza wskazane `uuid` jako wysłane (ustawia `syncedAt`). Nieznane `uuid` pomija. */
  markSynced(uuids: string[], syncedAt: EpochMillis): Promise<void>;
  /**
   * WSTRZYMUJE zdarzenia (issue #81): operację zakończył albo unieważnił administrator,
   * więc jej zaległe zapisy NIE MOGĄ już wyjść na serwer. Wiersz zostaje w `events`
   * (rejestr jest append-only, ekran dalej go czyta), `syncedAt` zostaje `null`
   * (serwer tego nie potwierdził i nie potwierdzi), a osobna tabela mówi, że ten uuid
   * WYPADŁ z outboxa. `getUnsyncedEvents` takich wierszy nie oddaje.
   */
  withholdEvents(uuids: string[], reason: WithheldReason, withheldAt: EpochMillis): Promise<void>;
  /** Wszystkie wstrzymane zapisy - do liczników na ekranie 01 i w historii. */
  getWithheldEvents(): Promise<WithheldEvent[]>;

  // ── klub operacji (wielofirmowość §7) ───────────────────────────────────────
  /** Klub operacji; `null` = zapis sprzed 2.0.0 albo operacja nieznana magazynowi. */
  getSessionOrg(sessionUuid: string): Promise<string | null>;
  /** Mapa operacja → klub dla WSZYSTKICH znanych operacji (plakietka klubu, sygnatury). */
  getSessionOrgs(): Promise<Record<string, string>>;
  /**
   * Dopisuje klub operacjom, które go nie mają - jednorazowy backfill po aktualizacji
   * z 1.x (§11: „klub z pierwszego odświeżenia tokenów"). Zwraca liczbę przypisanych
   * operacji. Operacji, które klub JUŻ mają, nie rusza.
   */
  adoptSessionsWithoutOrg(orgId: string): Promise<number>;

  // ── cache referencyjny (§4.8, §5.2) ──────────────────────────────────────────
  upsertAircraft(rows: ReferenceAircraft[], orgId: string): Promise<void>;
  /**
   * Flota KLUBU - `null` (klub nieznany) oddaje pustą listę, bo flota bez klubu nie
   * istnieje; ekran 02 pokazuje wtedy stan „brak samolotów" (02G) i pyta serwer przy
   * każdym pulsie, dopóki nie dostanie floty (issue #55).
   */
  getAircraft(orgId: string | null): Promise<ReferenceAircraft[]>;
  /**
   * Samolot po identyfikatorze - BEZ zawężenia do klubu i to jest celowe: identyfikator
   * jest globalny, a „Mój dzień" i historia pokazują operacje WSZYSTKICH klubów pilota
   * (§7.2), więc znak maszyny z drugiego klubu musi dać się odczytać.
   */
  getAircraftById(id: string): Promise<ReferenceAircraft | null>;
  /**
   * WSZYSTKIE maszyny z cache, bez zawężenia do klubu - do rozwiązywania ZNAKU
   * w historii (§7.2). Do wyboru maszyny służy `getAircraft`.
   */
  getAllAircraft(): Promise<ReferenceAircraft[]>;
  /**
   * Ile maszyn cache zna W KAŻDYM klubie - podpis karty klubu na 13A („· 4 samoloty").
   * Klub, którego telefon nigdy nie widział, NIE MA tu wiersza: „0 samolotów" byłoby
   * zdaniem o flocie, a nie o pustym cache'u.
   */
  aircraftCountsByOrg(): Promise<Record<string, number>>;
  upsertPilots(rows: ReferencePilot[], orgId: string): Promise<void>;
  /** Piloci KLUBU - kod pilota należy do CZŁONKOSTWA, więc lista bez klubu jest pusta. */
  getPilots(orgId: string | null): Promise<ReferencePilot[]>;

  // ── session_meta (key/value, §5.2) ───────────────────────────────────────────
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  deleteMeta(key: string): Promise<void>;

  // ── utrzymanie ───────────────────────────────────────────────────────────────
  /** Czyści cały magazyn (reset w testach / wylogowanie). */
  clear(): Promise<void>;
}

/**
 * Klucze `session_meta` (§5.2 - key/value bieżącej sesji i zalogowanego pilota).
 * Trzymane jako string↔string; wartości strukturalne serializujemy do JSON.
 * Mieszkają przy porcie, bo są kontraktem MAGAZYNU, nie pojęciem domenowym.
 */
export const SESSION_META_KEYS = {
  currentSessionUuid: 'current_session_uuid',
  currentPilotId: 'current_pilot_id',
  currentAircraftId: 'current_aircraft_id',
  /**
   * Sesja TRZYMANEGO SAMOLOTU - dla writera headless (GPS w tle po śmierci procesu).
   * Inny cykl życia niż `current_session_uuid` (ten nigdy nie jest czyszczony,
   * o wznowieniu decyduje `state.closed` - `navigation/resumeTarget.ts`): zapis przy
   * claimie, czyszczenie przy zdaniu samolotu (`releaseAircraft`), uzgodnienie przy
   * wznowieniu. Brak klucza = fixy do kosza.
   */
  activeSessionUuid: 'active_session_uuid',
  /**
   * KLUB AKTYWNY (wielofirmowość §7): kontekst floty, przejęcia i wysyłki. Ustawia go
   * logowanie i przełączenie klubu (13A), oba WYMAGAJĄCE sieci - offline-first dotyczy
   * pracy w klubie, nie zmiany klubu (§6). Brak klucza = telefon jeszcze się nie
   * zalogował po aktualizacji z 1.x: flota jest wtedy pusta, a rejestr czeka na klub.
   */
  activeOrgId: 'active_org_id',
} as const;

export type SessionMetaKey = (typeof SESSION_META_KEYS)[keyof typeof SESSION_META_KEYS];

/**
 * Dlaczego zapis WYPADŁ z outboxa (issue #81):
 *  • `admin_close` - operację zakończył administrator (`session_close`);
 *  • `admin_void`  - operację unieważnił administrator (`session_void` z `source: 'admin'`);
 *  • `server`      - serwer odrzucił zapis w ingeście jako dosłany do operacji
 *                    zakończonej przez administratora (wyścig z wysyłką).
 * Trzy nazwy, jeden skutek: zapis zostaje w rejestrze telefonu, na serwer nie wyjdzie.
 */
export type WithheldReason = 'admin_close' | 'admin_void' | 'server';

export interface WithheldEvent {
  uuid: string;
  sessionUuid: string;
  reason: WithheldReason;
  withheldAt: EpochMillis;
}
