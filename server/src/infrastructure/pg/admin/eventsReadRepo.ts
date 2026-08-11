/**
 * UZ Aero (serwer) — adapter ODCZYTU rejestru zdarzeń (`AdminEventsReadPort`, `A04`).
 *
 * Osobny plik od `eventsRepo.ts` z tego samego powodu, dla którego port jest osobny:
 * tamten odpowiada na dwa wąskie pytania o kolumny techniczne pojedynczego zdarzenia
 * (`source_device`, uuidy korekt panelu) i wołany jest z karty dnia. Ten czyta listę
 * ze złączeniem trzech tabel, sześcioma filtrami, kursorem i licznikami. Osobny też od
 * `common/eventsStore.ts`, który obsługuje INGEST i oddaje byty domenowe — ten oddaje
 * kolumny, bo panel pyta o wiersz, nie o zdarzenie.
 *
 * ══ NIEZNANY TYP I NIEZNANY PAYLOAD NIE MAJĄ PRAWA WYWRÓCIĆ ODCZYTU ══
 * W adapterach flag i operacji stoi strażnik rzucający na wartościach spoza katalogu —
 * bo tam wartość jest pilnowana `CHECK`-iem w bazie, więc jej naruszenie znaczy ręczną
 * ingerencję w dane. **Tutaj takiego strażnika NIE MA i nie wolno go dodać.** Kolumna
 * `events.type` celowo nie ma `CHECK`-a, a `payload` jest `JSONB`
 * dowolnego kształtu. Strażnik przy odczycie znaczyłby, że narzędzie śledcze przestaje
 * się otwierać przez własną historię — dokładnie wtedy, gdy jest potrzebne.
 *
 * Czego tu NIE MA: `UPDATE` i `DELETE`. Rejestr jest append-only, a brak tych zdań
 * w kodzie jest jedną z warstw tej gwarancji (obok `test/architecture.test.ts`).
 */

import type {
  AdminEventRow,
  AdminEventsReadPort,
  EventListFilter,
} from '../../../application/admin/ports.ts';
import type { AdminEventCounts } from '../../../application/admin/contracts/events.ts';
import type { Queryable } from '../../../application/common/ports.ts';
import {
  decodeCursor,
  encodeCursor,
  keysetOrderBy,
  keysetPredicate,
  type CursorShape,
  type KeysetDirection,
} from '../keyset.ts';
import { SqlFilter } from '../sqlFilter.ts';

/**
 * Klucz porządku rejestru — dokładnie ten, pod który stoi `idx_events_received`
 * po ujednoliceniu reguły `NULLS` (`architektura-panelu-serwer.md` §7.8). Obie kolumny
 * są `NOT NULL` (`uuid` jest kluczem głównym), stąd
 * `k1Nullable: false`: gałąź `IS NULL` byłaby martwym warunkiem, a martwy warunek
 * w `WHERE` potrafi odciąć planerowi indeks. Ta sama deklaracja zdejmuje `NULLS LAST`
 * z `ORDER BY`, dzięki czemu jeden indeks obsługuje `?sort=desc` skanem w przód
 * i `?sort=asc` skanem wstecz (`keysetOrderBy`, reguła `NULLS` — §7.8).
 *
 * `uuid` jako tie-breaker, bo CAŁA paczka z jednego synca ma identyczny `received_at`
 * — `now()` w Postgresie zwraca czas rozpoczęcia transakcji. Bez rozstrzygnięcia
 * granica strony wypadałaby w środku paczki i gubiła z niej wiersze.
 */
const KEY: readonly [string, string] = ['e.received_at', 'e.uuid'];

/**
 * Kształt kursora. Każda deklaracja coś ODRZUCA, zanim wartość z zewnątrz dotrze
 * do Postgresa: `timestamp` (kolumna `TIMESTAMPTZ`, więc kursor niesie ISO 8601 UTC,
 * a nie dowolny napis → `22007`), `k1Nullable: false` (`received_at` jest `NOT NULL`,
 * kursor z `null` pochodzi z innego zapytania) i `k2: 'string'` (uuid jest `TEXT`,
 * więc każdy napis jest tu legalną wartością — inaczej niż przy `BIGSERIAL` audytu).
 */
const shapeOf = (direction: KeysetDirection): CursorShape => ({
  k1: 'timestamp',
  k1Nullable: false,
  k2: 'string',
  direction,
});

interface EventDbRow {
  uuid: string;
  session_uuid: string;
  aircraft_id: string;
  reg: string | null;
  pic_id: string;
  pic_code: string | null;
  pic_name: string | null;
  dual_id: string | null;
  dual_code: string | null;
  dual_name: string | null;
  type: string;
  /** `BIGINT` — sterownik oddaje `int8` NAPISEM, nie liczbą. */
  device_time: string | number;
  gps_time: string | number | null;
  payload: unknown;
  schema_version: number;
  received_at: string | Date;
  source_device: string | null;
}

/**
 * `LEFT JOIN`, nigdy `INNER`: skasowany samolot i skasowane konto nie mogą usuwać
 * zdarzeń z rejestru. Wiersz zostaje widoczny z samymi identyfikatorami — i to jest
 * przypadek, w którym rejestr jest najbardziej potrzebny.
 */
const SELECT = `
  SELECT e.uuid,
         e.session_uuid,
         e.aircraft_id,
         a.reg,
         e.pic_id,
         p.code AS pic_code,
         p.name AS pic_name,
         e.dual_id,
         d.code AS dual_code,
         d.name AS dual_name,
         e.type,
         e.device_time,
         e.gps_time,
         e.payload,
         e.schema_version,
         e.received_at,
         e.source_device
    FROM events e
    LEFT JOIN aircraft a ON a.id = e.aircraft_id
    LEFT JOIN pilots   p ON p.id = e.pic_id
    LEFT JOIN pilots   d ON d.id = e.dual_id`;

const toRow = (r: EventDbRow): AdminEventRow => ({
  uuid: r.uuid,
  sessionUuid: r.session_uuid,
  aircraftId: r.aircraft_id,
  reg: r.reg,
  picId: r.pic_id,
  picCode: r.pic_code,
  picName: r.pic_name,
  dualId: r.dual_id,
  dualCode: r.dual_code,
  dualName: r.dual_name,
  type: r.type,
  deviceTime: Number(r.device_time),
  gpsTime: r.gps_time == null ? null : Number(r.gps_time),
  // BEZ `?? {}`: `payload` jest `NOT NULL` w schemacie, ale JSON-owy `null` jest
  // legalną wartością `JSONB` — i ma dojechać do panelu jako `null`, a nie jako pusty
  // obiekt. Rejestr pokazuje to, co przyszło.
  payload: r.payload,
  schemaVersion: r.schema_version,
  receivedAt: new Date(r.received_at),
  sourceDevice: r.source_device,
});

export class PgAdminEventsReadRepo implements AdminEventsReadPort {
  async list(
    db: Queryable,
    filter: EventListFilter,
    driftThresholdMs: number,
  ): Promise<{
    items: AdminEventRow[];
    corrections: AdminEventRow[];
    nextCursor: string | null;
    counts: AdminEventCounts | null;
  } | null> {
    const shape = shapeOf(filter.direction);
    const cursor = filter.cursor == null ? null : decodeCursor(filter.cursor, shape);
    if (filter.cursor != null && cursor == null) return null;

    const page = new SqlFilter();
    applyFilters(page, filter);
    keysetPredicate(KEY, cursor, page, shape);

    // +1 wiersz ponad limit to cała detekcja „czy jest następna strona" — drugi
    // `COUNT` na to nie odpowiada, bo mógłby się zmienić między zapytaniami.
    const limitParam = page.bind(filter.limit + 1);
    const { rows } = await db.query<EventDbRow>(
      `${SELECT} ${page.where()} ${keysetOrderBy(KEY, shape)} LIMIT ${limitParam}`,
      page.params(),
    );

    const items = rows.slice(0, filter.limit).map(toRow);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > filter.limit && last != null
        ? encodeCursor({ k1: last.receivedAt.toISOString(), k2: last.uuid }, shape)
        : null;

    return {
      items,
      corrections: await this.correctionsFor(db, items),
      nextCursor,
      counts: await this.counts(db, filter, driftThresholdMs, cursor != null),
    };
  }

  /**
   * Korekty celujące w wiersze TEJ strony — także spoza filtra i spoza zakresu dat.
   *
   * Osobne zapytanie zamiast `LEFT JOIN LATERAL` w zapytaniu strony, bo to są dwa różne
   * pytania i mają różny zasięg: strona jest zawężona filtrem, a korekta unieważniająca
   * zdarzenie sprzed miesiąca mogła powstać wczoraj. Złączenie w zapytaniu strony
   * musiałoby więc i tak wyłamać się z jej `WHERE` — czyli byłoby tym samym zapytaniem,
   * tylko trudniejszym do przeczytania i do zaplanowania.
   *
   * Stoi pod `idx_events_correction_target`: indeks CZĘŚCIOWY po
   * `payload->>'targetUuid'` wyłącznie dla `type = 'event_correction'`. Bez niego to
   * jest pełne skanowanie rejestru raz na stronę — dokładnie ten koszt, przed którym
   * broni kursor.
   *
   * `IN (…)` składamy z osobnych miejsc na wartości, a nie przez `= ANY ($n)` z tablicą:
   * tablicę trzeba by serializować do literału Postgresa, co jest zachowaniem STEROWNIKA
   * (testy jadą na PGlite, produkcja na `pg`). Kilka `$n` znaczy to samo w obu.
   *
   * ══ `ORDER BY` JEST TU DEKLARACJĄ PORZĄDKU, A NIE OPTYMALIZACJĄ ══
   * `applyCorrections` sortuje strumień STABILNIE po czasie zdarzenia, więc przy REMISIE
   * czasu o zwycięzcy decyduje kolejność, w jakiej korekty weszły do strumienia — czyli
   * kolejność wierszy z bazy. Bez `ORDER BY` daje ją układ sterty: ta sama para korekt
   * dawała raz wiersz przekreślony, raz nie, a zmieniało się to po `VACUUM` albo po
   * przepakowaniu tabeli. W testach z zamrożonym zegarem remis jest stanem DOMYŚLNYM,
   * a nie przypadkiem brzegowym. Porządkujemy po `received_at, uuid`, czyli po tym samym
   * kluczu, co strona: przy równym czasie zdarzenia wygrywa korekta przyjęta PÓŹNIEJ.
   */
  private async correctionsFor(
    db: Queryable,
    items: readonly AdminEventRow[],
  ): Promise<AdminEventRow[]> {
    if (items.length === 0) return [];

    const filter = new SqlFilter();
    const holes = items.map(() => '?').join(', ');
    filter.add(`e.type = 'event_correction'`);
    filter.add(`e.payload->>'targetUuid' IN (${holes})`, ...items.map((i) => i.uuid));

    const { rows } = await db.query<EventDbRow>(
      `${SELECT} ${filter.where()} ORDER BY e.received_at, e.uuid`,
      filter.params(),
    );
    return rows.map(toRow);
  }

  /**
   * Liczniki kafli WYŁĄCZNIE dla pierwszej strony; kolejne dostają `null`, a panel
   * niesie liczby z pierwszej.
   *
   * **Powód: liczniki są własnością ZAPYTANIA, nie strony** — nie zmieniają się przy
   * przewijaniu, więc płacimy za nie RAZ. Liczenie ich przy każdej stronie jest tym
   * samym błędem, przed którym broni kursor: `events` jest najszybciej rosnącą tabelą
   * w systemie, a pełny `COUNT` skanuje ją całą, więc koszt strony przestałby być stały.
   *
   * Trzy liczby jednym przebiegiem (`FILTER`), a nie trzema zapytaniami: to jest jedno
   * pytanie o jeden zbiór, a trzy przebiegi po rosnącej tabeli różniłyby się między
   * sobą przy dosyłce outboxa w trakcie liczenia.
   *
   * **Warunki są te same co strony, ale BEZ kursora** — licznik opisuje cały wynik
   * filtra, a nie resztę po kursorze. `COUNT` bez złączeń: żaden filtr nie sięga do
   * `pilots` ani `aircraft` (szukamy po identyfikatorach, nie po nazwiskach), więc
   * złączenie byłoby tu wyłącznie kosztem.
   */
  private async counts(
    db: Queryable,
    filter: EventListFilter,
    driftThresholdMs: number,
    paged: boolean,
  ): Promise<AdminEventCounts | null> {
    if (paged) return null;

    const conditions = new SqlFilter();
    applyFilters(conditions, filter);
    // Próg jedzie PARAMETREM z `@uzaero/domain` — wpisany w tekst zapytania byłby drugą
    // definicją tolerancji obok tej, którą liczy flagę `CLOCK_DRIFT` przy ingescie.
    const threshold = conditions.bind(driftThresholdMs);

    const { rows } = await db.query<{ total: string; no_fix: string; drift: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE e.gps_time IS NULL) AS no_fix,
              COUNT(*) FILTER (
                WHERE e.gps_time IS NOT NULL
                  AND ABS(e.device_time - e.gps_time) > ${threshold}
              ) AS drift
         FROM events e ${conditions.where()}`,
      conditions.params(),
    );

    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      withoutGpsFix: Number(row?.no_fix ?? 0),
      clockDrift: Number(row?.drift ?? 0),
      driftThresholdMs,
    };
  }
}

/**
 * Wszystkie filtry są OPCJONALNE i pomijane, gdy nieustawione — numerację `$n` nadaje
 * `SqlFilter`, żeby nie było jej w tym pliku wcale.
 *
 * Zakres dat idzie po `received_at`, czyli po TEJ SAMEJ kolumnie, co porządek i kursor
 * (uzasadnienie: `application/admin/ports.ts` → `EventListFilter`).
 */
function applyFilters(sql: SqlFilter, filter: EventListFilter): void {
  if (filter.types !== undefined && filter.types.length > 0) {
    const holes = filter.types.map(() => '?').join(', ');
    sql.add(`e.type IN (${holes})`, ...filter.types);
  }

  sql.addOptional('e.uuid = ?', filter.uuid);
  sql.addOptional('e.session_uuid = ?', filter.sessionUuid);
  sql.addOptional('e.aircraft_id = ?', filter.aircraftId);
  sql.addOptional('e.source_device = ?', filter.sourceDevice);
  // PIC **albo** Dual: dzień szkolny należy do obu pilotów, a zawężenie tylko po PIC-u
  // ukrywałoby przed instruktorem połowę jego własnych zdarzeń. `add`, a nie
  // `addOptional`, bo warunek ma DWA miejsca na tę samą wartość.
  if (filter.pilotId !== undefined) {
    sql.add('(e.pic_id = ? OR e.dual_id = ?)', filter.pilotId, filter.pilotId);
  }
  sql.addOptional(
    'e.received_at >= ?',
    filter.fromMs === undefined ? undefined : new Date(filter.fromMs),
  );
  sql.addOptional(
    'e.received_at <= ?',
    filter.toMs === undefined ? undefined : new Date(filter.toMs),
  );
}
