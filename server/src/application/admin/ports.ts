/**
 * UZ Aero (serwer) — PORTY warstwy aplikacji dla panelu administracyjnego.
 *
 * Osobny plik od `application/ports.ts`, i to nie dla symetrii: tamten ma docblock
 * mówiący, czym jest — kontraktem powierzchni TELEFONU. Panel jest drugą powierzchnią,
 * o innym zestawie operacji (listy globalne, cykl życia flagi, konta, flota), więc
 * dopisanie ich tam złamałoby cel reguły granulacji: „żeby plik dało się przeczytać
 * w całości". Jeden plik portów na POWIERZCHNIĘ, nie jeden na projekt.
 *
 * Kierunek zależności bez zmian: `application/admin` zna wyłącznie te interfejsy,
 * implementacje (`infrastructure/pg/admin/*`) wstrzykuje composition root.
 */

import type { FlagStatus, FlagType, MhFormat, OperationType } from '@uzaero/domain';

import type { AdminAction } from '../../domain/adminActions.ts';
import type { PilotRole } from '../../domain/roles.ts';
import type { FlagRecord, Queryable, SessionRow } from '../common/ports.ts';

// ── tożsamość działającego ──────────────────────────────────────────────────────

/**
 * KTO wykonuje akcję panelu. Osobny typ od `Identity` (tożsamość odczytana z tokenu),
 * bo niesie co innego: `Identity` odpowiada na pytanie „czy token jest ważny",
 * a `Actor` — „co wpisać do dziennika audytu". Stąd `ip`, którego w tokenie nie ma
 * i być nie może.
 *
 * `role` jest rolą Z CHWILI AKCJI i tak trafia do `admin_audit`. Role się zmieniają;
 * odczytanie ich później z konta odpowiadałoby na inne pytanie niż „kto miał wtedy
 * prawo to zrobić".
 */
export interface Actor {
  pilotId: string;
  role: PilotRole;
  /** `null` = akcja spoza żądania HTTP (skrypt administracyjny). */
  ip: string | null;
}

// ── dziennik audytu ─────────────────────────────────────────────────────────────

/**
 * Ślad akcji tak, jak opisuje ją KOMENDA: co zrobiono i na czym. Tożsamość, rolę,
 * adres i czas dokłada `AuditedWrite` — komenda nie ma ich skąd wziąć i nie powinna,
 * bo to detale bramy zapisu, nie operacji.
 */
export interface AuditEntry {
  action: AdminAction;
  targetType: string | null;
  targetId: string | null;
  /** Notatka, diff, kontekst decyzji — NIGDY hasło ani hash. */
  details: Record<string, unknown>;
}

/** Kompletny wiersz dziennika: opis akcji + kto, kiedy i skąd. */
export interface AuditRecord extends AuditEntry {
  actorPilotId: string;
  actorRole: PilotRole;
  ip: string | null;
  createdAt: Date;
}

/**
 * Port ma JEDNĄ metodę i to jest jego treść: dziennik audytu jest append-only.
 * Brak `update` i `delete` nie jest przeoczeniem do uzupełnienia — to jedyna
 * gwarancja niezmienności, którą da się dziś wyrazić w kodzie (docelowo dokłada się
 * do niej `GRANT` bez `UPDATE`/`DELETE`, `docs/architektura-panelu-serwer.md` §11).
 *
 * Odczyt dziennika (`A09`) mieszka w OSOBNYM porcie niżej — nie dlatego, że czytanie
 * łamałoby niezmienność, tylko dlatego, że ten port wędruje do `AuditedWrite`, czyli
 * do bramy ZAPISU. Brama, która przy okazji umie czytać listy z filtrami, przestaje
 * być bramą i zaczyna być repozytorium.
 *
 * `tx` jest parametrem, nie polem: wpis MUSI móc pojechać transakcją skutku,
 * który opisuje. Adapter z własnym uchwytem do bazy nie umiałby tego zrobić.
 */
export interface AdminAuditPort {
  append(tx: Queryable, record: AuditRecord): Promise<void>;
}

/**
 * Filtr dziennika (`A09`). Pola NIEUSTAWIONE (`undefined`) są pomijane.
 *
 * `actions` jest LISTĄ, a nie pojedynczą wartością, bo ekran filtruje GRUPAMI
 * („Konta", „Flota", „Konserwacja") — a grupa to kilka kodów katalogu. Jedna wartość
 * zmusiłaby panel albo do rezygnacji z chipów z mockupu, albo do składania sumy
 * z kilku żądań i sklejania stron kursora po swojemu.
 *
 * Typ `AdminAction` (a nie `string`) jest tu ŚWIADOMY i dotyczy WYŁĄCZNIE wejścia:
 * po kodzie spoza katalogu nie da się filtrować, bo katalog jest jedyną listą, którą
 * panel zna. Odczyt jest szerszy — patrz `AdminAuditJoin.action`.
 */
export interface AuditListFilter {
  actions?: AdminAction[];
  actorPilotId?: string;
  targetType?: string;
  targetId?: string;
  /** Zakres po `created_at` (epoch ms UTC), obustronnie domknięty. */
  fromMs?: number;
  toMs?: number;
  cursor?: string;
  direction: 'asc' | 'desc';
  limit: number;
}

/**
 * Wiersz dziennika razem z tym, czego lista potrzebuje ze złączenia z `pilots`.
 *
 * ══ DLACZEGO `action` I `actor_role` SĄ TU NAPISAMI, A NIE UNIAMI ══
 * Bo wiersz `admin_audit` jest zapisem HISTORYCZNYM i tak został zaprojektowany:
 * migracja 9 celowo nie ma `CHECK`-a na tych kolumnach, żeby przemianowanie akcji
 * albo wycofanie roli z katalogu nie unieważniało tego, co zdarzyło się rok temu.
 * Zwężenie do `AdminAction`/`PilotRole` przy ODCZYCIE odwróciłoby tę decyzję: adapter
 * musiałby albo rzucić na nieznanym kodzie (dziennik nadzoru przestałby się otwierać
 * przez własną historię), albo taki wiersz pominąć (dziennik zacząłby ukrywać wpisy).
 * Strona odczytu pokazuje kod DOSŁOWNIE — nazywanie go jest sprawą panelu.
 *
 * `actorCode`/`actorName` przychodzą z `LEFT JOIN pilots`: konto skasowane albo
 * przepisane zostawia wpis widoczny z samym identyfikatorem, a nie usuwa go z listy.
 */
export interface AdminAuditJoin {
  id: number;
  createdAt: Date;
  actorPilotId: string;
  actorCode: string | null;
  actorName: string | null;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  ip: string | null;
}

/**
 * Strona ODCZYTU dziennika (`A09`) — jedna metoda, tak jak port zapisu.
 *
 * `null` = **kursor nieczytelny**, wzorem `SessionsAdminPort.list`: kursor przychodzi
 * z zewnątrz, więc jego uszkodzenie to 400, a nie 500.
 *
 * `total: null` znaczy co INNEGO niż `total: 0` i nie wolno tego skleić: to jest
 * „nie pytaliśmy", a nie „nic nie ma". Licznik powstaje wyłącznie dla pierwszej strony
 * (uzasadnienie w `infrastructure/pg/admin/auditReadRepo.ts`), więc kolejne strony
 * oddają `null` i to klient niesie liczbę z pierwszej.
 */
export interface AdminAuditReadPort {
  list(
    db: Queryable,
    filter: AuditListFilter,
  ): Promise<{ items: AdminAuditJoin[]; nextCursor: string | null; total: number | null } | null>;
}

// ── flagi (cykl życia, panel) ───────────────────────────────────────────────────

/**
 * Flaga widziana przez panel: rekord serwera (`FlagRecord`) plus dane ROZSTRZYGNIĘCIA.
 *
 * Dziedziczenie zamiast czwartej deklaracji kształtu flagi jest tu celowe. Do
 * 2026-07-31 ten sam byt był przepisany ręcznie w czterech miejscach i zgodny ze sobą
 * wyłącznie przez przypadek (`packages/domain/src/flags.ts` powstał, żeby to skończyć).
 * Panel widzi WIĘCEJ niż telefon, nie coś innego — i tak to zapisujemy.
 */
export interface AdminFlag extends FlagRecord {
  /** Kiedy serwer wykrył rozbieżność — oś „wieku" w skrzynce (`A03`). */
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

/** Skutek zamknięcia flagi: tyle, ile trzeba, żeby zdecydować o re-eksporcie. */
export interface ResolvedFlag {
  type: FlagType;
  sessionUuids: string[];
}

/**
 * Port CYKLU ŻYCIA flagi — nowy, a nie rozszerzenie `FlagsPort`.
 *
 * `FlagsPort` jest portem ścieżki INGESTU (`ensureOpen` + `openFor*`), wołanym
 * w gorącej transakcji przyjęcia paczki zdarzeń. Panel potrzebuje czegoś innego
 * i w innym rytmie. Projekt ma na to precedens i uzasadnienie: `SheetsReadPort` jest
 * osobny od `SheetsPort`, a `PilotPrefsPort` od `PilotsPort` — osobny port wtedy, gdy
 * inny jest POWÓD istnienia. Korzyść uboczna: `infrastructure/pg/flagsRepo.ts`
 * zostaje nietknięty, więc ścieżka ingestu nie ma jak zregresować.
 */
/**
 * Filtr skrzynki flag (`A03`). Pola NIEUSTAWIONE (`undefined`) są pomijane — składa
 * je `infrastructure/pg/sqlFilter.ts`, żeby numeracja parametrów miała jednego autora.
 */
export interface FlagListFilter {
  status?: FlagStatus;
  type?: FlagType;
  aircraftId?: string;
  /** Flagi obejmujące TĘ sesję — karta dnia (`A02a`), razem z rozwiązanymi. */
  sessionUuid?: string;
  /** Zakres po `created_at` (epoch ms UTC), obustronnie domknięty. */
  fromMs?: number;
  toMs?: number;
  limit: number;
}

/** Flaga razem z tym, czego skrzynka potrzebuje ze złączeń. */
export interface AdminFlagJoin {
  flag: AdminFlag;
  reg: string | null;
  aircraftType: string | null;
}

export interface FlagsAdminPort {
  /**
   * Lista dla skrzynki. Porządek jest CZĘŚCIĄ KONTRAKTU tego portu, nie parametrem:
   * `blokujące eksport → najstarsze` (A03). Sortowanie po wieku ma sens tylko razem
   * z wyniesieniem spraw blokujących na górę — flaga leżąca trzeci dzień jest
   * problemem sama w sobie, ale karta dnia stojąca poza arkuszem jest pilniejsza.
   */
  list(db: Queryable, filter: FlagListFilter): Promise<{ items: AdminFlagJoin[]; total: number }>;
  byId(db: Queryable, id: number): Promise<AdminFlag | null>;
  /**
   * Zamknięcie flagi z OPTYMISTYCZNĄ współbieżnością: warunek `status='open'` siedzi
   * w SQL-u, więc dwie osoby klikające „Rozwiąż i odblokuj kartę" nie prześcigną się
   * timingiem — druga dostaje `null` i trasa odpowiada 409 z aktualnym stanem flagi.
   * Blokad pesymistycznych przy dwóch użytkownikach nie wprowadzamy.
   */
  resolve(
    tx: Queryable,
    id: number,
    by: string,
    note: string,
    at: Date,
  ): Promise<ResolvedFlag | null>;
}

// ── dni lotne (lista i karta, panel) ────────────────────────────────────────────

/**
 * Twardy limit strony każdej listy panelu. Ta sama liczba, co maksymalna paczka
 * `POST /events` — jedna liczba, jedno znaczenie „ile wierszy naraz ma sens w tym
 * systemie". Stoi przy portach, a nie przy kursorze w adapterze, bo jest polityką
 * kontraktu (trasa odrzuca większe `limit`), a nie szczegółem SQL-a.
 */
export const PAGE_LIMIT_MAX = 500;

/**
 * Filtr listy dni (`A02`). Pola NIEUSTAWIONE (`undefined`) są pomijane.
 *
 * `cursor` jest NIEPRZEZROCZYSTYM napisem — dokładnie tym, co panel dostał w poprzedniej
 * odpowiedzi. Warstwa aplikacji celowo nie zna jego budowy: kursor koduje klucz
 * SORTOWANIA SQL-a, więc jego kształt jest sprawą adaptera (`infrastructure/pg/keyset.ts`).
 */
export interface SessionListFilter {
  /** Zakres po duty starcie (`sessions.claim_time`, epoch ms UTC), obustronnie domknięty. */
  fromMs?: number;
  toMs?: number;
  aircraftId?: string;
  /** Dopasowuje PIC-a **albo** Duala — dzień szkolny należy do obu, nie tylko do PIC-a. */
  pilotId?: string;
  status?: 'active' | 'closed';
  operation?: OperationType;
  /** `true` = tylko dni z OTWARTĄ flagą; `false` = tylko dni bez. */
  flagged?: boolean;
  /** `true` = tylko dni z kartą w `export_log`; `false` = tylko dni bez karty. */
  exported?: boolean;
  cursor?: string;
  direction: 'asc' | 'desc';
  limit: number;
}

/**
 * Wiersz projekcji + to, czego lista potrzebuje ze złączeń i dzienników.
 *
 * Port oddaje `SessionRow` (model warstwy aplikacji), a NIE gotowy DTO: mapowanie na
 * kontrakt panelu jest czystą funkcją (`admin/sessionListItem.ts`) i ma być testowalne
 * bez bazy — tak samo jak `sessionRowFrom` po stronie zapisu.
 */
export interface AdminSessionJoin {
  row: SessionRow;
  reg: string | null;
  aircraftType: string | null;
  mhFormat: MhFormat | null;
  picCode: string | null;
  picName: string | null;
  dualCode: string | null;
  dualName: string | null;
  /** Typy flag OTWARTYCH dla tej sesji (posortowane po id — kolejność powstania). */
  openFlags: FlagType[];
  exportRevision: number | null;
  updatedAt: Date;
}

export interface SessionsAdminPort {
  /**
   * Strona listy dni. `null` = **kursor nieczytelny** — odmowa jest wariantem wyniku,
   * nie wyjątkiem (wzorzec `FlagsAdminPort.resolve`): kursor przychodzi z zewnątrz,
   * więc jego uszkodzenie to 400, a nie 500.
   */
  list(
    db: Queryable,
    filter: SessionListFilter,
  ): Promise<{ items: AdminSessionJoin[]; nextCursor: string | null; total: number } | null>;
  /** Pojedynczy dzień ze złączeniami; `null` = nie ma takiej sesji w projekcji. */
  byUuid(db: Queryable, sessionUuid: string): Promise<AdminSessionJoin | null>;
}

// ── rejestr zdarzeń (metadane zapisu, panel) ────────────────────────────────────

/**
 * Port danych, które są w tabeli `events`, ale NIE SĄ zdarzeniem domenowym.
 *
 * `EventsStorePort.sessionEvents` oddaje `Event[]` — czysty byt domenowy, bez kolumn
 * technicznych. `source_device` jest kolumną serwera („czym to przyszło"), nie polem
 * zdarzenia: telefon go nie zna, projekcja go nie czyta, a reguły nie mają o nim
 * pojęcia. Dopisanie go do `Event` przemyciłoby szczegół transportu do domeny, którą
 * dzielimy z aplikacją pilota.
 *
 * A panel go potrzebuje: karta „Zdarzenie korygowane" (`A02b`) mówi, czy odczyt zapisał
 * telefon PIC-a, czy poprzednia korekta z panelu — i to jest pierwsza rzecz, o którą
 * pyta się przy rozjeździe czasu.
 */
export interface EventsAdminPort {
  /**
   * `source_device` pojedynczego zdarzenia. Zewnętrzne `null` = nie ma takiego uuid-a
   * w rejestrze; wewnętrzne = zdarzenie jest, ale bez pola (wpisy sprzed migracji 4).
   * Dwie różne odpowiedzi na dwa różne pytania, więc opakowane, a nie sklejone.
   */
  sourceDeviceOf(db: Queryable, eventUuid: string): Promise<{ sourceDevice: string | null } | null>;

  /**
   * Uuidy tych zdarzeń `event_correction` sesji, które zapisał PANEL.
   *
   * Istnieje, bo `event_correction` emitują DWIE powierzchnie: administrator przez
   * `POST /admin/api/sessions/:uuid/corrections` (a więc przez `AuditedWrite`, czyli
   * z wierszem w `admin_audit`) oraz pilot w oknie 24 h przez `POST /events` — tamta
   * droga bramy audytu nie dotyka i śladu w dzienniku nie zostawia. Z samego strumienia
   * zdarzeń tych dwóch przypadków rozróżnić się NIE DA: payload jest identyczny.
   * Rozróżnia je `source_device` (`application/admin/sourceDevice.ts`) i to jest jedyne
   * miejsce, w którym ten fakt jest zapisany.
   */
  adminCorrectionUuids(db: Queryable, sessionUuid: string): Promise<string[]>;
}

// ── konserwacja (przebudowa projekcji, panel) ───────────────────────────────────

export interface MaintenanceAdminPort {
  /**
   * Uuidy WSZYSTKICH sesji obecnych w rejestrze `events` — źródłem jest strumień,
   * nie tabela `sessions`, i to jest cały sens tej metody. Sesja, która jest
   * w rejestrze, a nie ma wiersza projekcji, to najcięższy przypadek dryfu; lista
   * budowana z projekcji nie umiałaby go zobaczyć.
   */
  sessionUuids(db: Queryable): Promise<string[]>;
}
