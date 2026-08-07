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

import type {
  EventType,
  FlagStatus,
  FlagType,
  MhFormat,
  OperationType,
  ServiceStatus,
} from '@uzaero/domain';

import type { AdminAction } from '../../domain/adminActions.ts';
import type { PilotRole } from '../../domain/roles.ts';
import type { FlagRecord, Queryable, SessionRow } from '../common/ports.ts';
import type { AdminEventCounts } from './contracts/events.ts';
import type { AdminExportCounts, ExportState } from './contracts/exports.ts';

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

// ── eksport kart dziennych (A05) ────────────────────────────────────────────────

/**
 * Katalog stanów karty jako WARTOŚĆ — `ExportState` jest typem i nie da się po nim
 * iterować ani niczego nim sprawdzić w czasie działania.
 *
 * `Record<ExportState, true>` jest tu WYMUSZENIEM kompilatora, a nie ozdobą: dopisanie
 * stanu do kontraktu bez dopisania go tutaj przestaje się kompilować. Bez tego zod
 * w trasie odrzucałby nowy stan czterysetką, a strażnik w adapterze rzucał na własnym
 * `CASE` — czyli nowy stan byłby jednocześnie zaimplementowany i nieosiągalny.
 */
const EXPORT_STATE_CATALOG: Record<ExportState, true> = {
  waiting: true,
  blocked: true,
  impossible: true,
  missing: true,
  current: true,
};

/** Stany w kolejności deklaracji — wejście dla `z.enum` w trasie monitora. */
export const EXPORT_STATES = Object.keys(EXPORT_STATE_CATALOG) as ExportState[];

/** Czy napis (z SQL-a albo z query stringa) jest znanym stanem karty. */
export function isExportState(value: string): value is ExportState {
  return Object.prototype.hasOwnProperty.call(EXPORT_STATE_CATALOG, value);
}

/**
 * Filtr monitora eksportu (`A05`). Pola NIEUSTAWIONE (`undefined`) są pomijane.
 *
 * ══ `state` JEST TU OD 2026-08-01 I TO JEST ZMIANA DECYZJI ══
 * Do tej pory zawężenie po stanie robiła warstwa aplikacji na już zmapowanych wierszach,
 * z uzasadnieniem „stan jest wnioskiem mappera, `CASE` w SQL-u byłby jego drugą
 * definicją". Uzasadnienie było prawdziwe, ale konsekwencja gorsza od kosztu, przed
 * którym broniło: zawężenie stało PO `LIMIT`-cie, więc `?state=missing` nie umiało
 * znaleźć dnia z awarią eksportu sprzed dziewięciu miesięcy — obcięcie zabierało go
 * przed filtrem. Chip „Bez karty" pokazywał wtedy zero i wyglądało to na dobrą wiadomość.
 *
 * Zawężenie i liczenie robi więc SQL, nad CAŁYM zakresem filtra, wzorem `total`
 * w skrzynce flag. Druga definicja stanu istnieje i jest nazwana — pilnuje jej test
 * porównujący liczniki z wierszami odpowiedzi (`test/adminExports.test.ts`).
 */
export interface ExportListFilter {
  /** Zakres po duty starcie (`sessions.claim_time`, epoch ms UTC), obustronnie domknięty. */
  fromMs?: number;
  toMs?: number;
  aircraftId?: string;
  /** Fragment rejestracji, identyfikatora samolotu albo uuid-a sesji. */
  search?: string;
  /** Zawężenie do JEDNEGO stanu karty; `undefined` = bez zawężenia. */
  state?: ExportState;
  limit: number;
}

/**
 * Dzień lotny widziany OD STRONY ARKUSZA: tyle z projekcji, ile trzeba, żeby nazwać
 * kartę i ocenić jej stan, plus to, czego w `export_log` NIE MA.
 *
 * Wiersz powstaje z `sessions`, a nie z `export_log`, i to jest istota tego ekranu:
 * pytanie brzmi „czy każdy dzień ma aktualny arkusz", więc dzień BEZ ani jednego wpisu
 * w dzienniku musi być widoczny. Lista budowana z `export_log` nie umiałaby go pokazać.
 */
export interface AdminExportJoin {
  sessionUuid: string;
  aircraftId: string;
  reg: string | null;
  aircraftType: string | null;
  picId: string;
  picCode: string | null;
  picName: string | null;
  status: 'active' | 'closed';
  /** Chwila przejęcia samolotu (epoch ms UTC); `null` = strumień bez `session_claim`. */
  claimedAt: number | null;
  /** Ostatnia przyjęta paczka tej sesji — oś porównania „karta starsza niż dane". */
  updatedAt: Date;
  /**
   * Identyfikatory OTWARTYCH flag, które trzymają kartę poza arkuszem. Lista typów
   * blokujących jedzie z `EXPORT_BLOCKING_FLAG_TYPES`, czyli z tego samego miejsca,
   * co bramka `DayExporter` — powtórzenie warunku w SQL-u dałoby stan, w którym monitor
   * mówi „zablokowana", a eksporter przepuszcza.
   */
  blockingFlagIds: number[];
  /** Ostatnia rewizja z `export_log`; `null` = karta nigdy nie powstała. */
  revision: number | null;
  exportedAt: Date | null;
  sheetUrl: string | null;
  /**
   * INNA sesja zapisała kartę o tej samej nazwie PÓŹNIEJ — wiersz `export_log` o tym
   * samym `(day, aircraft_id)`, innym `session_uuid` i większym `exported_at`.
   *
   * Fakt, nie ocena: `sheetTabName` niesie dzień i samolot, ale nie sesję, więc dwie
   * zamknięte zmiany na jednym samolocie tego samego dnia budują kartę o tej samej
   * nazwie, a `exported_sheets` jest po `tab` UPSERT-owane. `null` = ten wiersz jest
   * ostatnim autorem swojej karty (albo karty jeszcze nie ma).
   */
  overwrittenBy: { sessionUuid: string; exportedAt: Date } | null;
}

/** Jeden wiersz `export_log` — jedna wykonana wysyłka karty. */
export interface AdminExportRevision {
  revision: number;
  day: string;
  sheetUrl: string;
  exportedAt: Date;
}

/**
 * Port monitora eksportu — osobny od `ExportLogPort`, nie jego rozszerzenie.
 *
 * Ta sama decyzja, co przy flagach, kontach i flocie: osobny port wtedy, gdy inny jest
 * POWÓD istnienia. `ExportLogPort` obsługuje ŚCIEŻKĘ EKSPORTU (`latest` + `append`
 * + blokada, wołane z `DayExporter` w gorącej sekwencji po zapisie karty) oraz
 * `sync-status` telefonu. Ten czyta listy ze złączeniem trzech tabel i historię rewizji
 * — czyli pytania, których na tamtej ścieżce nikt nie zadaje. Korzyścią uboczną jest to,
 * że eksport nie ma jak zregresować od zmian w ekranie monitora.
 */
export interface ExportsAdminPort {
  /**
   * Strona monitora RAZEM z licznikami.
   *
   * Liczniki jadą stąd, a nie z warstwy aplikacji, i to jest cała zmiana z 2026-08-01:
   * muszą opisywać CAŁY zakres filtra, a warstwa aplikacji widzi wyłącznie wiersze PO
   * `LIMIT`-cie. `matched` to liczba dni pasujących do filtra RAZEM z zawężeniem po
   * stanie — po niej trasa poznaje, że limit obciął listę.
   */
  list(
    db: Queryable,
    filter: ExportListFilter,
  ): Promise<{ items: AdminExportJoin[]; counts: AdminExportCounts; matched: number }>;
  /** Pojedynczy dzień; `null` = nie ma takiej sesji w projekcji. */
  byUuid(db: Queryable, sessionUuid: string): Promise<AdminExportJoin | null>;
  /**
   * WSZYSTKIE wiersze dziennika tej sesji, od najstarszej rewizji.
   *
   * Bez limitu i bez kursora, w przeciwieństwie do list panelu: liczba rewizji jednej
   * karty jest z natury jednocyfrowa (pierwszy eksport + spóźnione paczki + korekty),
   * a rozwinięcie wiersza ma pokazać HISTORIĘ, nie jej początek. Stronicowanie czegoś,
   * czego sens polega na kompletności, byłoby wadą udającą ostrożność.
   */
  history(db: Queryable, sessionUuid: string): Promise<AdminExportRevision[]>;
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

// ── rejestr zdarzeń (lista śledcza, A04) ────────────────────────────────────────

/**
 * Filtr rejestru (`A04`). Pola NIEUSTAWIONE (`undefined`) są pomijane.
 *
 * ══ ZAKRES DAT IDZIE PO `received_at`, NIE PO CZASIE ZDARZENIA ══
 * I to jest decyzja, nie skrót. Po pierwsze: porządek listy i kursor jadą po
 * `(received_at, uuid)`, więc zakres po innej kolumnie kazałby stronie i filtrowi
 * mówić o dwóch różnych osiach czasu — a wtedy „następna strona" przestaje znaczyć
 * cokolwiek. Po drugie: ekran odpowiada między innymi na pytanie „czy to zdarzenie
 * w ogóle DOTARŁO", a to jest pytanie o zegar serwera. Zakres po czasie zdarzenia
 * wymagałby drugiego indeksu i drugiego kursora; ekran nazywa tę oś wprost.
 */
export interface EventListFilter {
  /** Zakres po `received_at` (epoch ms UTC), obustronnie domknięty. */
  fromMs?: number;
  toMs?: number;
  aircraftId?: string;
  /** Dopasowuje PIC-a **albo** Duala — dzień szkolny należy do obu, nie tylko do PIC-a. */
  pilotId?: string;
  sessionUuid?: string;
  /** DOKŁADNY uuid zdarzenia — wklejenie go z telefonu to główny scenariusz `A04`. */
  uuid?: string;
  /**
   * Typy zdarzeń jako LISTA, wzorem `AuditListFilter.actions`: ekran filtruje chipami,
   * a chip bywa grupą. Typ `EventType` (a nie `string`) dotyczy WYŁĄCZNIE wejścia —
   * po kodzie spoza katalogu nie da się filtrować, bo katalog jest jedyną listą, którą
   * panel zna. Odczyt jest szerszy, patrz `AdminEventRow.type`.
   */
  types?: EventType[];
  /** Dokładna wartość `source_device` — „czym to przyszło". */
  sourceDevice?: string;
  cursor?: string;
  direction: 'asc' | 'desc';
  limit: number;
}

/**
 * Wiersz `events` razem z tym, czego lista potrzebuje ze złączeń.
 *
 * `type` i `payload` jadą SUROWO (napis i `unknown`) — pełne uzasadnienie stoi
 * w nagłówku `contracts/events.ts`. Adapter nie ma tu ani jednego strażnika i nie wolno
 * go dodać: rejestr, który wywraca się na własnej historii, przestaje być narzędziem
 * śledczym dokładnie wtedy, gdy jest potrzebny.
 */
export interface AdminEventRow {
  uuid: string;
  sessionUuid: string;
  aircraftId: string;
  reg: string | null;
  picId: string;
  picCode: string | null;
  picName: string | null;
  dualId: string | null;
  dualCode: string | null;
  dualName: string | null;
  type: string;
  deviceTime: number;
  gpsTime: number | null;
  payload: unknown;
  schemaVersion: number;
  receivedAt: Date;
  sourceDevice: string | null;
}

/**
 * Strona rejestru RAZEM z korektami celującymi w jej wiersze.
 *
 * ══ DLACZEGO KOREKTY JADĄ OSOBNO, A NIE JAKO GOTOWA FLAGA `voided` ══
 * Bo o tym, czy zdarzenie zaszło, rozstrzyga `applyCorrections` z `@uzaero/domain`
 * — razem z regułą „gdy jedno zdarzenie ma kilka korekt, wygrywa ostatnia" i z parą
 * `void` → `retime`, która przywraca zdarzenie do życia. Ta reguła ma mieć JEDNĄ
 * implementację; `CASE` w SQL-u byłby jej drugą i rozjechałby się przy pierwszej
 * zmianie. Adapter dostarcza więc FAKTY (wiersze korekt celujących w stronę),
 * a wniosek wyciąga czysta funkcja `mappers/eventEntry.ts`.
 *
 * Korekta z tej listy bywa spoza strony — i o to chodzi: zdarzenie sprzed miesiąca
 * unieważnione wczoraj musi być przekreślone także wtedy, gdy sama korekta wypadła
 * poza bieżące zawężenie.
 *
 * `null` = **kursor nieczytelny**, wzorem `SessionsAdminPort.list`: kursor przychodzi
 * z zewnątrz, więc jego uszkodzenie to 400, a nie 500.
 *
 * `counts: null` znaczy „nie pytaliśmy" (strona kursorowa), a nie „nic nie ma".
 */
export interface AdminEventsReadPort {
  list(
    db: Queryable,
    filter: EventListFilter,
    /** Próg `CLOCK_DRIFT` (ms) — jedzie z domeny, żeby SQL nie miał własnej kopii. */
    driftThresholdMs: number,
  ): Promise<{
    items: AdminEventRow[];
    corrections: AdminEventRow[];
    nextCursor: string | null;
    counts: AdminEventCounts | null;
  } | null>;
}

// ── konta pilotów (A06, A06a) ───────────────────────────────────────────────────

/**
 * Konto tak, jak widzi je PANEL: bez `passwordHash`.
 *
 * Osobny typ od `PilotAccount` (`application/common/ports.ts`) i to jest jego cała
 * treść. Tamten istnieje dla LOGOWANIA, więc niesie hash — a hash nie ma prawa wjechać
 * do komendy, która go nie weryfikuje, ani tym bardziej do mapowania na kontrakt.
 * Jeden brak pola jest tu tańszy niż dyscyplina „pamiętaj, żeby go nie serializować".
 */
export interface AdminPilotAccount {
  id: string;
  code: string;
  name: string;
  email: string | null;
  active: boolean;
  role: PilotRole;
}

/**
 * Konto + to, czego lista potrzebuje ze złączeń.
 *
 * `flyingDays` jest AGREGATEM PROJEKCJI (`COUNT` po `sessions`), nie odtworzeniem
 * projekcji SQL-em — dokładnie ta granica, którą stawia `docs/architektura-panelu-serwer.md`
 * §7.1. Liczymy dni ZAMKNIĘTE, bo tak mówi mockup A06 („Suma dni z zamkniętymi
 * sesjami"), i w oknie podanym w filtrze: kolumna nosi nagłówek z miesiącem, więc
 * liczba bez okna nie znaczyłaby nic.
 */
export interface AdminPilotJoin {
  account: AdminPilotAccount;
  updatedAt: Date;
  flyingDays: number;
}

/**
 * Filtr listy kont (`A06`). Pola NIEUSTAWIONE (`undefined`) są pomijane.
 *
 * Okno `fromMs`/`toMs` NIE filtruje kont — filtruje wyłącznie `flyingDays`. Konto bez
 * ani jednego dnia w oknie zostaje na liście z zerem; wypadnięcie go stąd znaczyłoby,
 * że lista kont zależy od tego, kto ostatnio latał, a to jest inna lista.
 */
export interface PilotListFilter {
  active?: boolean;
  /**
   * Role jako LISTA, nie pojedyncza wartość, bo ekran filtruje chipem „Z rolą panelu",
   * a to są DWIE role naraz (`admin` + `training_lead`). Jedna wartość zmusiłaby panel
   * albo do rezygnacji z chipa z mockupu, albo do sklejania listy z dwóch żądań —
   * czyli do liczenia po swojemu. Ta sama decyzja, co przy `AuditListFilter.actions`.
   */
  roles?: PilotRole[];
  /** Fragment kodu, nazwiska albo e-maila; dopasowanie bez rozróżniania wielkości. */
  search?: string;
  /** Okno „dni lotnych" (epoch ms UTC), obustronnie domknięte. */
  fromMs: number;
  toMs: number;
  /** Kierunek sortowania po NAZWISKU; konta nieaktywne i tak lądują na końcu. */
  direction: 'asc' | 'desc';
  limit: number;
}

/**
 * Liczniki kafli i karty „Rola w panelu" (`A06`). Liczone po WSZYSTKICH kontach,
 * niezależnie od filtra listy: kafel opisuje klub, a nie zawężenie, którym ktoś
 * właśnie patrzy na tabelę.
 */
export interface PilotCounts {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<PilotRole, number>;
  /**
   * Dni lotne CAŁEGO klubu w oknie: liczba sesji ZAMKNIĘTYCH, nie suma kolumny
   * `flyingDays` z wierszy. Różnica jest realna, a nie kosmetyczna — dzień szkolny
   * liczy się dwóm pilotom naraz, więc suma kolumny byłaby większa od liczby dni.
   * Kafel „Dni lotne · <miesiąc>" ma pokazywać dni, a nie osobodni.
   */
  flyingDays: number;
}

/**
 * Liczniki CHIPÓW filtra (`A06`) — cztery zawężenia listy, policzone w bieżącym
 * WYSZUKIWANIU.
 *
 * Osobny typ od `PilotCounts` i to jest jego cała treść: `PilotCounts` opisuje KLUB
 * (kafle „Konta aktywne 8 / 10"), a te liczby są obietnicą chipa — „tyle wierszy
 * zobaczysz po kliknięciu". Do 2026-08-01 chipy nosiły liczby z `PilotCounts`, więc
 * po wpisaniu frazy tabela miała jeden wiersz, a chip „Nieaktywni" nadal pokazywał 2
 * i po kliknięciu dawał zero wierszy.
 *
 * Zawęża je WYŁĄCZNIE wyszukiwanie, nie wybrany chip: liczby na czterech chipach mają
 * być porównywalne między sobą, a chip zawężony sam sobą pokazywałby zawsze tyle, ile
 * właśnie widać.
 */
export interface PilotScopeCounts {
  /** Chip „Wszyscy". */
  total: number;
  active: number;
  inactive: number;
  /** Chip „Z rolą panelu" — role dające wejście do panelu, razem. */
  panel: number;
}

/** Nowe konto — hash liczy komenda, adapter go wyłącznie zapisuje. */
export interface NewPilotAccount {
  id: string;
  code: string;
  name: string;
  email: string | null;
  role: PilotRole;
  passwordHash: string;
}

/** Zmiana tożsamości albo roli. Pola nieustawione zostają bez zmian. */
export interface PilotPatch {
  code?: string;
  name?: string;
  email?: string | null;
  role?: PilotRole;
}

/**
 * Port kont po stronie PANELU — osobny od `PilotsPort`, nie jego rozszerzenie.
 *
 * `PilotsPort` jest portem LOGOWANIA: dwie metody odczytu, adapter z własnym uchwytem
 * do bazy, wołany poza transakcją. Panel pisze i musi to robić W TRANSAKCJI śladu
 * audytu, więc każda metoda bierze `tx` z zewnątrz. Precedens i uzasadnienie takie
 * samo jak przy `FlagsAdminPort` vs `FlagsPort`: osobny port wtedy, gdy inny jest
 * POWÓD istnienia — a korzyścią uboczną jest to, że ścieżka logowania nie ma jak
 * zregresować od zmian w panelu kont.
 */
export interface PilotsAdminPort {
  list(db: Queryable, filter: PilotListFilter): Promise<{ items: AdminPilotJoin[]; total: number }>;
  /** Liczniki po CAŁYM klubie; okno dotyczy wyłącznie `flyingDays`. */
  counts(db: Queryable, window: { fromMs: number; toMs: number }): Promise<PilotCounts>;
  /**
   * Liczniki CHIPÓW — te same cztery zawężenia, ale w bieżącym wyszukiwaniu.
   * `search` nieustawione = po całym klubie (wtedy zgadzają się z `counts`).
   */
  scopeCounts(db: Queryable, filter: { search?: string }): Promise<PilotScopeCounts>;
  byId(db: Queryable, id: string): Promise<AdminPilotAccount | null>;
  /**
   * Kolizja unikalności PRZED zapisem: `'code'` albo `'email'`, albo `null`.
   *
   * Sprawdzenie zamiast łapania błędu `23505` z bazy, bo panel musi wiedzieć, KTÓRE
   * pole jest zajęte — komunikat „naruszenie unikalności" przy formularzu z trzema
   * polami nie jest odpowiedzią. Sprawdzenie i zapis jadą tą samą transakcją, więc
   * wyścig kończy się i tak błędem bazy, a nie cichym nadpisaniem.
   */
  conflict(
    tx: Queryable,
    values: { code: string; email: string | null; exceptId: string | null },
  ): Promise<'code' | 'email' | null>;
  insert(tx: Queryable, account: NewPilotAccount): Promise<void>;
  update(tx: Queryable, id: string, patch: PilotPatch): Promise<void>;
  /**
   * `at` = chwila DEAKTYWACJI, zapisywana jako `credentials_valid_from` (migracja 13).
   * Bez niej odebranie dostępu nie dotykałoby sesji PANELU, bo ta nie ma wiersza
   * w bazie — kasowanie `refresh_tokens` zrywa wyłącznie sesje telefonu.
   * Aktywacja znacznika NIE cofa: token sprzed odcięcia ma zostać martwy.
   */
  setActive(tx: Queryable, id: string, active: boolean, at: Date): Promise<void>;
  /** `at` jak wyżej — reset hasła unieważnia poświadczenia obu powierzchni naraz. */
  setPasswordHash(tx: Queryable, id: string, passwordHash: string, at: Date): Promise<void>;
  /** Ile kont AKTYWNYCH ma rolę `admin` — wejście do `domain/accountGuards.ts`. */
  countActiveAdmins(tx: Queryable): Promise<number>;
  /**
   * Blokada advisory na STAŁYM kluczu „populacja administratorów", ważna do końca
   * transakcji. Wołana PRZED `countActiveAdmins` przez każdą mutację zmieniającą tę
   * populację.
   *
   * ══ DLACZEGO PORT, A NIE `tx.query` W KOMENDZIE ══
   * Bo klucz musi być JEDEN dla wszystkich wołających, a stała rozsiana po komendach
   * przestaje być stałą przy pierwszej literówce — a literówka w kluczu nie psuje
   * niczego widocznego, tylko cicho wyłącza szeregowanie. Nazwa klucza jest szczegółem
   * Postgresa i mieszka w adapterze, tak jak kształt kursora.
   */
  lockAdminPopulation(tx: Queryable): Promise<void>;
}

/**
 * Unieważnianie sesji pilota — osobny port, bo `RefreshTokensPort` odpowiada na inne
 * pytanie i w innym rytmie (wydaj/rotuj, poza transakcją, z własnym uchwytem do bazy).
 *
 * ══ DLACZEGO TO W OGÓLE ISTNIEJE ══
 * Bez tego „Deaktywuj" jest obietnicą bez pokrycia: konto przestaje się logować, ale
 * pilot z żywym refresh tokenem pracuje dalej przez 90 dni (`REFRESH_TTL_DAYS`).
 * `AuthCommands.refresh` sprawdza wprawdzie `account.active` i odmawia — ale dopiero
 * przy próbie rotacji, a JWT wydany wcześniej żyje jeszcze godzinę. Reset hasła też
 * musi zrywać sesje, inaczej stara sesja przeżywa zmianę poświadczeń, czyli dokładnie
 * to, przed czym reset ma chronić.
 *
 * Liczba unieważnionych tokenów jedzie do audytu (mockup A06a: „Aktywne sesje pilota —
 * unieważnione"), bo odpowiada na pytanie, którego wpis bez niej nie zamyka: czy ktoś
 * jeszcze pracował na tym koncie w chwili odcięcia.
 */
export interface RefreshTokensAdminPort {
  revokeAllFor(tx: Queryable, pilotId: string): Promise<number>;
}

// ── flota (A07, A07a) ───────────────────────────────────────────────────────────

/**
 * Samolot tak, jak widzi go PANEL — czysta konfiguracja, bez stanu z telefonów.
 *
 * Osobny typ od `ReferenceAircraft` (`@uzaero/domain`) i to jest jego treść: tamten
 * jest KSZTAŁTEM CACHE'U telefonu, więc niesie `claimPicId`, `handover` i `fetchedAt`
 * — pola, które przy zapisie konfiguracji nie znaczą nic i których komenda nie ma prawa
 * dotknąć. Wpuszczenie tamtego typu do komendy dałoby `update`, który potrafi „zapisać"
 * claim, czyli przepisać stan wyliczany ze strumienia zdarzeń.
 */
export interface AdminAircraft {
  id: string;
  reg: string;
  type: string;
  year: number | null;
  capacityL: number;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
}

/**
 * Samolot + to, czego lista potrzebuje ze złączeń i z rejestru.
 *
 * `openSessions`, `openFlags` i `lastEventAt` są AGREGATAMI po tabelach obok
 * (`sessions`, `flags`, `events`), a nie odtworzeniem projekcji SQL-em — ta sama
 * granica, co przy `flyingDays` kont (`docs/architektura-panelu-serwer.md` §7.1).
 * Claim i ostatni odczyt liczników NIE są tutaj, bo ich wybór jest REGUŁĄ
 * (`application/common/aircraftStateView.ts`), a nie zapytaniem.
 */
export interface AdminAircraftJoin {
  aircraft: AdminAircraft;
  updatedAt: Date;
  openSessions: number;
  openFlags: number;
  /** Ostatnie przyjęte zdarzenie tego samolotu; `null` = nie ma ani jednego. */
  lastEventAt: Date | null;
}

/** Filtr listy floty (`A07`). Pola NIEUSTAWIONE (`undefined`) są pomijane. */
export interface FleetListFilter {
  serviceStatus?: ServiceStatus;
  /**
   * `true` = tylko jednostki z OTWARTĄ sesją (chip „Z claimem" z mockupu A07).
   *
   * Filtr siedzi po stronie SERWERA, mimo że lista i tak jedzie w całości i panel
   * mógłby odsiać wiersze sam. Powód jest doktrynalny i praktyczny naraz: skład listy
   * ustala serwer, a chip z liczbą jest obietnicą „tyle wierszy zobaczysz" — dwie
   * różne definicje „z claimem" (jedna w SQL-u kafla, druga w `.filter()` panelu) to
   * dokładnie ten rozjazd, który panel ma wykrywać, a nie produkować.
   */
  claimed?: boolean;
  /** Fragment rejestracji albo typu; dopasowanie bez rozróżniania wielkości. */
  search?: string;
}

/**
 * Liczniki kafli — po CAŁEJ flocie, niezależnie od zawężenia listy.
 *
 * Ten sam typ obsługuje liczniki CHIPÓW, ale liczone w bieżącym WYSZUKIWANIU
 * (`FleetAdminPort.scopeCounts`). Osobna metoda, wspólny kształt — bo to są te same
 * cztery zawężenia, tylko dwa różne pytania: kafel opisuje KLUB („W służbie 4 / 5")
 * i ma się nie ruszać przy wpisywaniu w wyszukiwarkę, a chip z liczbą jest obietnicą
 * „tyle wierszy zobaczysz po kliknięciu". Przy kontach pilotów rozjazd tych dwóch
 * liczb był realną usterką (chip pokazywał 2 i dawał pustą tabelę).
 */
export interface FleetCounts {
  total: number;
  active: number;
  disabled: number;
  claimed: number;
}

/** Zmiana konfiguracji. Pola nieustawione zostają bez zmian. */
export interface AircraftPatch {
  reg?: string;
  type?: string;
  year?: number | null;
  capacityL?: number;
  mhFormat?: MhFormat;
  dualRequired?: boolean;
  serviceStatus?: ServiceStatus;
}

/**
 * Port floty po stronie PANELU — osobny od `ReferencePort` i `AircraftConfigPort`.
 *
 * Ta sama decyzja, co przy flagach i kontach: osobny port wtedy, gdy inny jest POWÓD
 * istnienia. `ReferencePort` buduje CAŁĄ migawkę pod cache telefonów i czyta poza
 * transakcją; `AircraftConfigPort` oddaje jedną liczbę w gorącej transakcji ingestu.
 * Panel pisze — i musi to robić w transakcji śladu audytu, więc każda metoda bierze
 * `tx` z zewnątrz. Korzyścią uboczną jest to, że ani ingest, ani `GET /reference` nie
 * mają jak zregresować od zmian w ekranie floty.
 */
export interface FleetAdminPort {
  list(db: Queryable, filter: FleetListFilter): Promise<AdminAircraftJoin[]>;
  counts(db: Queryable): Promise<FleetCounts>;
  /**
   * Liczniki CHIPÓW — te same cztery zawężenia, ale w bieżącym wyszukiwaniu.
   * `search` nieustawione = po całej flocie (wtedy zgadzają się z `counts`).
   */
  scopeCounts(db: Queryable, filter: { search?: string }): Promise<FleetCounts>;
  byId(db: Queryable, id: string): Promise<AdminAircraft | null>;
  /** Wiersz listy dla POJEDYNCZEJ jednostki — odpowiedź mutacji bez drugiej listy. */
  joinById(db: Queryable, id: string): Promise<AdminAircraftJoin | null>;
  /**
   * Kolizja unikalności rejestracji PRZED zapisem; `null` = wolna.
   *
   * Sprawdzenie zamiast samego łapania `23505`, dokładnie jak przy kontach: panel ma
   * dostać nazwę POLA do poprawienia, a nie „naruszenie unikalności". Wyścig i tak
   * kończy się błędem bazy i tam jest tłumaczony na ten sam wynik.
   */
  conflict(tx: Queryable, values: { reg: string; exceptId: string | null }): Promise<'reg' | null>;
  insert(tx: Queryable, aircraft: AdminAircraft): Promise<void>;
  update(tx: Queryable, id: string, patch: AircraftPatch): Promise<void>;
  /**
   * Ile sesji tego samolotu nie ma `day_close` — wejście do `domain/fleetGuards.ts`.
   * Czytane w TEJ SAMEJ transakcji co zapis, po wzięciu blokady niżej.
   */
  openSessions(tx: Queryable, aircraftId: string): Promise<number>;
  /**
   * Blokada advisory na konfiguracji JEDNEJ jednostki, ważna do końca transakcji.
   *
   * ══ CZEGO PILNUJE, A CZEGO NIE ══
   * Pilnuje sekwencji „odczytaj wiersz → policz otwarte sesje → zapisz": bez niej dwie
   * równoległe zmiany tego samego samolotu czytają ten sam stan wyjściowy, więc DIFF
   * w dzienniku audytu opisuje przejście, którego nie było („1257 → 1100" zapisane
   * dwa razy, choć druga zmiana zaczynała od 1100). Dziennik nadzoru, w którym „przed"
   * bywa nieprawdą, przestaje być dowodem.
   *
   * NIE pilnuje wyścigu z INGESTEM: telefon otwierający dzień blokuje sesję, nie
   * samolot, więc nowa sesja może powstać tuż po sprawdzeniu. To jest świadomie
   * przyjęte i opisane na ekranie — samolot z dniem pobranym rano dokończy go na
   * starej konfiguracji (`A07a`).
   *
   * Klucz mieszka w adapterze, bo nazwa klucza advisory jest szczegółem Postgresa —
   * ta sama decyzja, co przy `PilotsAdminPort.lockAdminPopulation`.
   */
  lockAircraft(tx: Queryable, aircraftId: string): Promise<void>;
}

// ── konserwacja (przebudowa projekcji, panel) ───────────────────────────────────

/**
 * Stan tabeli `refresh_tokens` — same LICZBY i DATY.
 *
 * Metody portu nie oddają ani jednej kolumny z hashem i to jest część kontraktu,
 * nie oszczędność: `A09` wymienia tokeny na liście rzeczy, które nigdy nie opuszczają
 * swojej tabeli, a `admin_audit.details` powstaje z tego, co odda port. Adapter, który
 * odda hashe „na wszelki wypadek", tworzy okazję do wpisania ich do dziennika.
 */
export interface RefreshTokenScan {
  total: number;
  expired: number;
  valid: number;
  oldestExpiredAt: Date | null;
  newestExpiredAt: Date | null;
}

/** Skutek czyszczenia: ile wierszy zniknęło i z jakiego zakresu dat wygaśnięcia. */
export interface PurgedTokens {
  deleted: number;
  oldestExpiredAt: Date | null;
  newestExpiredAt: Date | null;
  /** Policzone PO skasowaniu, w tej samej transakcji — obietnica „nikt nie wypadł". */
  remainingValid: number;
}

/** Jedna migracja tak, jak widzi ją baza plus opis stojący przy DDL-u. */
export interface SchemaMigrationRow {
  version: number;
  title: string;
  /** `null` = migracja jest w kodzie, ale `schema_migrations` jej nie odnotowało. */
  appliedAt: Date | null;
}

/**
 * Port operacji serwisowych panelu (`A11`).
 *
 * Trzy tematy w jednym porcie i to jest świadome: łączy je nie tabela (są trzy różne),
 * tylko POWÓD istnienia — narzędzia, po które sięga się rzadko, świadomie i wyłącznie
 * z jednego ekranu. Ta sama zasada, co przy `ExportsAdminPort` czy `DashboardAdminPort`:
 * osobny port wtedy, gdy inny jest powód, a nie wtedy, gdy inna jest tabela.
 */
export interface MaintenanceAdminPort {
  /**
   * Uuidy WSZYSTKICH sesji obecnych w rejestrze `events` — źródłem jest strumień,
   * nie tabela `sessions`, i to jest cały sens tej metody. Sesja, która jest
   * w rejestrze, a nie ma wiersza projekcji, to najcięższy przypadek dryfu; lista
   * budowana z projekcji nie umiałaby go zobaczyć.
   */
  sessionUuids(db: Queryable): Promise<string[]>;

  /**
   * Ile tokenów leży w tabeli i ile z nich jest MARTWYCH wobec podanej chwili.
   *
   * `at` jest parametrem, a nie `now()` w SQL-u, bo granica „wygasły" musi być tą samą
   * chwilą w podglądzie i w audycie skasowania — a zegar aplikacji jest sterowalny
   * (testy), zegar bazy nie.
   */
  scanRefreshTokens(db: Queryable, at: Date): Promise<RefreshTokenScan>;

  /**
   * Kasuje WYŁĄCZNIE wiersze, których `expires_at` już minęło.
   *
   * ══ WARUNEK JEST W SQL-U I TAM MA ZOSTAĆ ══
   * Token WAŻNY skasowany przez pomyłkę wylogowuje pilota w terenie, a ponowne
   * logowanie jest jedyną czynnością w systemie, która wymaga sieci (§3.0). Filtr
   * wpisany po stronie aplikacji („pobierz i skasuj te, które…") miałby dwie okazje
   * do pomyłki i jedno okno wyścigu; tutaj jest jedno polecenie i jeden predykat.
   */
  purgeExpiredRefreshTokens(tx: Queryable, at: Date): Promise<PurgedTokens>;

  /**
   * Migracje znane KODOWI, wzbogacone o chwilę zastosowania z `schema_migrations`.
   *
   * Opis migracji przychodzi z adaptera, bo tam mieszka DDL (`infrastructure/pg/schema.ts`)
   * — warstwa aplikacji nie ma prawa go znać, a rozdzielenie „numer z bazy" od „opis
   * z kodu" na dwa źródła dałoby ekran, na którym trzeba je sklejać po indeksie.
   */
  schemaMigrations(db: Queryable): Promise<{ version: number; rows: SchemaMigrationRow[] }>;
}

// ── statystyki (A10) ────────────────────────────────────────────────────────────

/** Zakres statystyk po DNIU ZAMKNIĘCIA (`sessions.close_time`), obustronnie domknięty. */
export interface StatsRange {
  fromMs: number;
  toMs: number;
}

/**
 * Wspólny rdzeń wiersza agregatu — te same liczby w każdym ujęciu, bo to ten sam
 * zbiór dni policzony w trzech przekrojach (sumy MUSZĄ się zgadzać między ujęciami).
 *
 * `staleRows` = wiersze projekcji sprzed migracji 18 (`takeoff_count IS NULL` —
 * kolumny statystyk wypełnia się razem, więc jedna wystarcza za wskaźnik).
 * `fuelKnownSessions`/`mhKnownSessions` liczą wiersze, które WESZŁY do sumy —
 * mapper odróżnia nimi „bilansu nie ma z czego policzyć" od „wiersz nieprzeliczony".
 */
export interface AdminStatsGroupRow {
  sessions: number;
  blockMs: number;
  flightMs: number;
  takeoffs: number;
  landings: number;
  fuelConsumedL: number;
  fuelKnownSessions: number;
  /** Blok WYŁĄCZNIE dni, które weszły do sumy paliwa — mianownik Śr. L/h. */
  fuelBlockMs: number;
  mhDeltaH: number;
  mhKnownSessions: number;
  /** Blok WYŁĄCZNIE dni ze znanym Δ MH — mianownik rozjazdu Δ MH vs blok. */
  mhBlockMs: number;
  staleRows: number;
}

/** Sumy całego zakresu plus wymiary kafli (`aircraft`, `pilots`). */
export interface AdminStatsTotalsRow extends AdminStatsGroupRow {
  aircraft: number;
  /**
   * PIC ∪ Dual — pilotów BIORĄCYCH UDZIAŁ, nie tylko piszących sesję. Uwaga:
   * `dual_id` niesie OSTATNIEGO duala dnia, więc dual zastąpiony w środku dnia
   * może nie być policzony (przypis pod tabelą pilotów mówi to wprost).
   */
  pilots: number;
}

/**
 * Dni OTWARTE: `inRange` — z duty startem w zakresie; `undated` — z SAMYM
 * `session_claim` (`claim_time IS NULL`), których nie da się przypisać do żadnego
 * zakresu, więc liczone są ZAWSZE.
 */
export interface AdminStatsOpenSessionsRow {
  inRange: number;
  undated: number;
}

export interface AdminStatsAircraftRow extends AdminStatsGroupRow {
  aircraftId: string;
  reg: string | null;
  aircraftType: string | null;
  capacityL: number | null;
  mhFormat: MhFormat | null;
  /** Dni kalendarzowe (UTC, po dniu zamknięcia) z co najmniej jedną zamkniętą sesją. */
  activeDays: number;
  /** Odczyty skrajnych sesji zakresu — surowe, bez szukania „pierwszego niepustego". */
  mhFirstStart: number | null;
  mhLastEnd: number | null;
}

export interface AdminStatsPilotRow {
  pilotId: string;
  code: string | null;
  name: string | null;
  sessions: number;
  blockMs: number;
  flightMs: number;
  takeoffs: number;
  landings: number;
  staleRows: number;
  /** Rejestracje jednostek (bez `null` po `LEFT JOIN`), alfabetycznie. */
  regs: string[];
}

export interface AdminStatsOperationRow extends AdminStatsGroupRow {
  operation: OperationType | null;
  regs: string[];
  clients: number;
}

/** Numer doby UTC (`close_time / 86400000`) — na dzień zamienia go warstwa aplikacji. */
export interface AdminStatsDailyRow {
  dayIndex: number;
  blockMs: number;
}

export interface AdminStatsDropsRow {
  sessions: number;
  flightMs: number;
  lifts: number;
  tandem: number;
  aff: number;
  solo: number;
  altSumFt: number;
  altCount: number;
  /**
   * Wiersze, przez które sum zrzutów nie da się uczciwie podać: dni skokowe sprzed
   * migracji 18 ORAZ dni z `operation IS NULL` w zakresie — rodzaju operacji nie
   * znamy, więc KAŻDY z nich mógł być dniem skokowym. To domyślny stan bazy
   * migrującej ze starego schematu, aż do przebudowy projekcji (`A11`).
   */
  staleRows: number;
}

export interface AdminStatsClientRow {
  client: string | null;
  lifts: number;
  tandem: number;
  aff: number;
  solo: number;
  altSumFt: number;
  altCount: number;
}

/**
 * Port statystyk (`A10`) — WYŁĄCZNIE agregacja kolumn projekcji `sessions`.
 *
 * Reguła twarda z `docs/architektura-panelu-serwer.md` §7.5: wolno SUMOWAĆ wartości,
 * które wyprodukowała projekcja (`sessionRowFrom(projectSession(...))`), nie wolno
 * ODTWARZAĆ projekcji SQL-em (`COUNT(*) FROM events WHERE type='takeoff'` byłoby
 * drugim, równoległym wyliczeniem — i to ono zaczyna kłamać). Dlatego każda liczba
 * tego portu ma swoją kolumnę w `sessions`, a brak kolumny = brak liczby.
 */
export interface StatsAdminPort {
  totals(db: Queryable, range: StatsRange): Promise<AdminStatsTotalsRow>;
  /** Dni OTWARTE — licznik pominiętych (w zakresie + bez daty), nie składnik sum. */
  openSessions(db: Queryable, range: StatsRange): Promise<AdminStatsOpenSessionsRow>;
  /** Tylko doby NIEPUSTE — zer nie zmyśla baza, dopełnia je warstwa aplikacji. */
  daily(db: Queryable, range: StatsRange): Promise<AdminStatsDailyRow[]>;
  byAircraft(db: Queryable, range: StatsRange): Promise<AdminStatsAircraftRow[]>;
  byPilot(db: Queryable, range: StatsRange): Promise<AdminStatsPilotRow[]>;
  byOperation(db: Queryable, range: StatsRange): Promise<AdminStatsOperationRow[]>;
  /** Strona przychodowa — zakres zawężony do `operation = 'skoki'` (podpis mockupu). */
  drops(db: Queryable, range: StatsRange): Promise<AdminStatsDropsRow>;
  dropsByClient(db: Queryable, range: StatsRange): Promise<AdminStatsClientRow[]>;
}

// ── pulpit (A01, A01a) ──────────────────────────────────────────────────────────

/**
 * Jedno zdarzenie w karcie „Ostatnio przyjęte" tak, jak leży w bazie: nagłówek plus
 * złączenia z rejestrem floty i kont.
 *
 * Port oddaje ten kształt, a nie gotowy DTO — mapowanie na kontrakt jest czystą
 * funkcją (`mappers/recentEvent.ts`) i ma być testowalne bez bazy, tak samo jak
 * `sessionListItem` i `aircraftListItem`.
 */
export interface AdminRecentEventRow {
  uuid: string;
  sessionUuid: string;
  aircraftId: string;
  reg: string | null;
  type: string;
  /** Czas zdarzenia z telefonu (epoch ms UTC). */
  deviceTime: number;
  /** Czas z GPS-u, gdy był — domena preferuje go przed zegarem telefonu. */
  gpsTime: number | null;
  /** Kiedy SERWER przyjął zdarzenie. */
  receivedAt: Date;
  picId: string;
  picCode: string | null;
  picName: string | null;
}

/** Sumy jednej doby z projekcji `sessions` plus liczba zdarzeń przyjętych w tej dobie. */
export interface AdminDayTotalsRow {
  sessions: number;
  aircraft: number;
  flights: number;
  blockMs: number;
  eventsAccepted: number;
}

/**
 * Port PULSU SYSTEMU — trzy pytania, których nie zadaje żadna inna powierzchnia.
 *
 * Osobny port, a nie rozszerzenie `EventsStorePort`, i to z tego samego powodu, co przy
 * `ExportsAdminPort` obok `ExportLogPort`: tamten obsługuje ŚCIEŻKĘ INGESTU (wstawienie
 * paczki, strumień sesji do `projectSession`) i jest wołany w gorącej transakcji.
 * Ten czyta agregaty po `received_at` na potrzeby jednego ekranu. Korzyścią uboczną
 * jest to, że ingest nie ma jak zregresować od zmian w pulpicie.
 *
 * **Wszystkie trzy metody chodzą po `events.received_at`, więc wymagają indeksu**
 * (`idx_events_received`, migracja 15). Bez niego „ostatnie sześć zdarzeń" to pełne
 * skanowanie rejestru, który rośnie bez granicy — czyli pulpit wolniejszy z każdym
 * miesiącem pracy klubu.
 */
export interface DashboardAdminPort {
  /**
   * Histogram przyjęć w oknie `[fromMs, toMs)` podzielonym na wiadra po `bucketMs`.
   *
   * Adapter oddaje TYLKO wiadra niepuste (`GROUP BY`), a dopełnienie zerami robi
   * warstwa aplikacji — inaczej „nic nie przyszło o 09:00" byłoby brakiem wiersza,
   * czyli stanem, którego wykres nie umie narysować.
   */
  inflow(
    db: Queryable,
    window: { fromMs: number; toMs: number; bucketMs: number },
  ): Promise<{ bucket: number; count: number }[]>;

  /** Ostatnio przyjęte zdarzenia, od najnowszego. Pusta tablica = pusty rejestr. */
  recent(db: Queryable, limit: number): Promise<AdminRecentEventRow[]>;

  /**
   * Sumy doby `[fromMs, toMs]` — dni lotne po duty starcie, zdarzenia po przyjęciu.
   * Dwa różne zegary w jednym wyniku i to jest świadome: kontrakt nazywa je osobno.
   */
  dayTotals(db: Queryable, range: { fromMs: number; toMs: number }): Promise<AdminDayTotalsRow>;

  /**
   * Duty start NAJNOWSZEGO dnia lotnego (epoch ms UTC); `null` = projekcja jest pusta
   * albo żadna sesja nie ma preflightu. Po nim pulpit wskazuje „ostatni dzień lotny",
   * gdy dziś nic nie lata.
   */
  lastFlyingDayStart(db: Queryable): Promise<number | null>;
}

// ── analityka zużycia (A10a, A10b) ──────────────────────────────────────────────

/**
 * Sesja jako WEJŚCIE analityki: identyfikator plus kolumny projekcji, które model
 * motogodzin konsumuje wprost.
 *
 * Podział pracy jest tu istotny i celowy. Model MH (`ΔMH = k_lot·t_lot + k_ziemia·t_ziemia`)
 * składa się WYŁĄCZNIE z wartości, które wyprodukowała projekcja — `mh_delta_h`,
 * `flight_ms`, `block_ms` (migracja 18) — więc liczy się bez ani jednego odczytu
 * rejestru zdarzeń, dokładnie tak, jak każe §7.2. Strumień jest potrzebny dopiero
 * modelowi PALIWA, bo granice interwałów wyznaczają odczyty paliwomierza z payloadów,
 * a tych projekcja nie niesie i nieść nie powinna (jest ich kilka na sesję).
 */
export interface ConsumptionSessionRef {
  sessionUuid: string;
  claimTime: number | null;
  closeTime: number | null;
  mhDeltaH: number | null;
  blockMs: number;
  flightMs: number;
  /** `null` = wiersz sprzed migracji 18, jeszcze nieprzeliczony (`A11`). */
  takeoffCount: number | null;
}

/** Jednostka, której dotyczy analityka — nagłówek ekranu i podpisy formatu. */
export interface ConsumptionAircraftRow {
  aircraftId: string;
  reg: string;
  aircraftType: string;
  capacityL: number;
  mhFormat: MhFormat;
  serviceStatus: string;
}

/** Zamknięte dni okna razem z licznikiem tych, które nie zmieściły się w limicie. */
export interface ConsumptionSessionsPage {
  sessions: ConsumptionSessionRef[];
  /** Ile dni spełnia warunek zakresu ŁĄCZNIE — mianownik komunikatu o przycięciu. */
  total: number;
}

export interface ConsumptionAdminPort {
  /** Jednostka po identyfikatorze; `null` = nie ma takiej we flocie. */
  aircraft(db: Queryable, aircraftId: string): Promise<ConsumptionAircraftRow | null>;

  /**
   * Zamknięte dni samolotu w oknie, od najnowszego. `limit` jest bezpiecznikiem
   * (patrz `queries/consumption.ts`), a nie stronicowaniem — analityka liczy się
   * na całym oknie albo mówi, że go przycięła.
   */
  closedSessions(
    db: Queryable,
    aircraftId: string,
    range: StatsRange,
    limit: number,
  ): Promise<ConsumptionSessionsPage>;

  /**
   * Dni OTWARTE samolotu w oknie — liczone po `claim_time`, bo dzień bez zamknięcia
   * nie ma `close_time`. Ich zużycia nie znamy (brak odczytu końcowego), więc do modelu
   * nie wchodzą; ekran mówi, ile ich pominął, zamiast milczeć o różnicy.
   */
  openSessions(db: Queryable, aircraftId: string, range: StatsRange): Promise<number>;
}
