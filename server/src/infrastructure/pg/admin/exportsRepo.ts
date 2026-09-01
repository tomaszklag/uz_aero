/**
 * UZ Aero (serwer) - adapter monitora eksportu (`ExportsAdminPort`, `A05`).
 *
 * Osobny plik od `pg/common/exportLogRepo.ts` z tego samego powodu, dla którego port
 * jest osobny: tamten obsługuje ŚCIEŻKĘ EKSPORTU (`latest`, `append`, blokada rewizji)
 * i `sync-status` telefonu. Ten czyta listę ze złączeniem czterech tabel. Eksport nie ma
 * jak zregresować od zmian w ekranie monitora.
 *
 * ══ LISTA JEDZIE Z `sessions`, NIE Z `export_log` ══
 * Pytanie ekranu brzmi „czy każdy dzień ma aktualny arkusz", więc dzień BEZ ani jednego
 * wpisu w dzienniku musi być na liście - a lista budowana z `export_log` nie umiałaby go
 * zobaczyć. To jest ta sama zasada, co przy `MaintenanceAdminPort.sessionUuids`:
 * najcięższe przypadki dryfu to te, których w tabeli docelowej po prostu nie ma.
 *
 * ══ STAN KARTY JEST TU DRUGI RAZ - ŚWIADOMIE, OD 2026-08-01 ══
 * `CASE` niżej powtarza `exportState` z `application/admin/mappers/exportListItem.ts`.
 * Do 2026-08-01 tego wyrażenia tu NIE BYŁO i było to uzasadnione („jedna definicja
 * wniosku"), tyle że konsekwencją było zawężanie i liczenie w JS nad tablicą JUŻ
 * OBCIĘTĄ `LIMIT`-em: klub z 250 zamkniętymi dniami dostawał 200 najnowszych, a chip
 * „Bez karty" pokazywał zero - nad rejestrem, w którym dzień bez karty leżał od
 * dziewięciu miesięcy. Ekran, którego jedyne pytanie brzmi „czy KAŻDY dzień ma arkusz",
 * odpowiadał o oknie i milczał o reszcie.
 *
 * Wybór jest więc między dwoma wyrażeniami jednej reguły a ekranem, który kłamie -
 * i pada na to pierwsze, bo rozjazd DA SIĘ złapać testem, a kłamstwo licznika nie.
 * Pilnuje go `test/adminExports.test.ts`: liczniki muszą zgadzać się z policzonymi
 * wierszami odpowiedzi, a `?state=X` musi oddać dokładnie te dni, którym mapper nadał
 * `X`. **Zmieniasz `CASE` - zmień `exportState` w tym samym commicie.**
 */

import { EXPORT_BLOCKING_FLAG_TYPES } from '../../../application/common/export/dayExporter.ts';
import type { AdminExportCounts } from '../../../application/admin/contracts/exports.ts';
import {
  isExportState,
  type AdminExportJoin,
  type AdminExportRevision,
  type ExportListFilter,
  type ExportsAdminPort,
} from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';
import { SqlFilter } from '../sqlFilter.ts';

interface ExportJoinDbRow {
  session_uuid: string;
  aircraft_id: string;
  reg: string | null;
  aircraft_type: string | null;
  pic_id: string;
  pic_code: string | null;
  pic_name: string | null;
  status: string;
  /** `BIGINT` - sterownik oddaje `int8` NAPISEM, nie liczbą. */
  claim_time: string | number | null;
  updated_at: string | Date;
  /** `int[]`; `COALESCE` w zapytaniu gwarantuje pustą tablicę zamiast `NULL`. */
  blocking_flag_ids: (string | number)[];
  revision: number | null;
  exported_at: string | Date | null;
  sheet_url: string | null;
  /** Sesja, której eksport nadpisał kartę o tej samej nazwie; `NULL` = nikt nie nadpisał. */
  overwritten_by_session: string | null;
  overwritten_at: string | Date | null;
}

/** Wiersz licznika: jeden stan karty + ile go jest w CAŁYM zakresie filtra. */
interface StateCountDbRow {
  state: string;
  n: string | number;
  revised: string | number;
  overwritten: string | number;
}

interface RevisionDbRow {
  revision: number;
  day: string;
  sheet_url: string;
  exported_at: string | Date;
}

/**
 * Zapytanie listy i szczegółu. `blockingTypes` to gotowe miejsca `$n` na typy flag
 * blokujących - numerację nadaje `SqlFilter`, żeby nie było jej w tym pliku wcale.
 *
 * `LEFT JOIN LATERAL` po ostatnią rewizję zamiast `GROUP BY` z `max()`: potrzebujemy
 * TRZECH pól z tego samego, najświeższego wiersza (`revision`, `exported_at`,
 * `sheet_url`), a agregat oddałby maksimum każdego z osobna - czyli mógłby skleić numer
 * z jednej wysyłki z adresem z innej. Przy `ORDER BY revision DESC LIMIT 1` planer
 * schodzi po `uq_export_log_card_revision`.
 *
 * Flagi blokujące jadą podzapytaniem agregującym IDENTYFIKATORY, nie samą liczbą: wiersz
 * ma prowadzić DO KONKRETNEJ flagi („Do flagi #1046"), a licznik kazałby administratorowi
 * szukać jej po omacku w skrzynce. Lista typów blokujących jest PARAMETREM
 * z `EXPORT_BLOCKING_FLAG_TYPES` - tego samego miejsca, co bramka `DayExporter`.
 * Rozwijamy ją na osobne `$n` zamiast `= ANY ($n)` z tablicą, bo serializacja tablicy
 * do literału Postgresa jest zachowaniem STEROWNIKA, a testy jadą na PGlite i produkcja
 * na `pg` - kilka `$n` znaczy to samo w obu.
 *
 * `LEFT JOIN pilots` i `LEFT JOIN aircraft`, nigdy `INNER`: konto skasowane albo samolot
 * wycofany z rejestru nie mogą usuwać dnia lotnego z monitora eksportu.
 *
 * DRUGI `LEFT JOIN LATERAL` (`ow`) odpowiada na pytanie, którego ekran do 2026-08-01 nie
 * zadawał: **czy kartę o tej nazwie zapisano PÓŹNIEJ BEZ TEJ SESJI**. Szukamy po
 * `(day, aircraft_id)`, bo TE DWIE KOLUMNY dziennika są nazwą karty rozłożoną na czynniki
 * (`sheetTab` skleja dokładnie je).
 *
 * ══ CO TO ZNACZY PO PRZEJŚCIU NA KARTĘ DOBY (2026-08-07) ══
 * Wada, dla której to pole powstało, ZNIKNĘŁA z konstrukcji: karta jest dobą samolotu,
 * więc poranna i popołudniowa zmiana są dziś WIERSZAMI jednego dokumentu, a nie dwoma
 * dokumentami o wspólnej nazwie. Wszystkie sesje jednej rewizji mają ten sam numer, więc
 * `o.revision > e.revision` nie zapali się między nimi - i o to chodzi.
 *
 * Pole zostaje z dwóch powodów. Po pierwsze, dalej ma realną treść: sesja WYŁĄCZONA
 * z karty otwartą flagą (§4.7 - bramka obejmuje sesję, nie kartę) zostaje przy swojej
 * ostatniej rewizji, a doba idzie dalej bez niej; wtedy `overwrittenBy` mówi dokładnie to,
 * co powinno - „treść leżąca dziś pod tą nazwą nie opisuje tego wiersza". Po drugie jest
 * SYGNALIZATOREM: gdyby kiedykolwiek zapaliło się dla dwóch sesji tej samej doby, znaczyłoby,
 * że powstały dwie karty jednego dokumentu - czyli że zmiana z 2026-08-07 gdzieś się cofnęła.
 *
 * Porównanie idzie po REWIZJI, a nie po parze `(exported_at, id)` jak do 2026-08-07.
 * Stempel czasu przestał rozstrzygać: wiersze jednej rewizji dzielą `exported_at` z tego
 * samego `Clock`, a `id` rośnie w obrębie jednego `INSERT`-a - porównanie po `id` uznałoby
 * pierwszą sesję karty za nadpisaną przez drugą sesję TEJ SAMEJ karty. Numer rewizji jest
 * jedyną osią, która opisuje kolejność DOKUMENTÓW, a nie kolejność wierszy.
 */
const selectSql = (blockingTypes: string): string => `
  SELECT s.session_uuid,
         s.aircraft_id,
         a.reg,
         a.type       AS aircraft_type,
         s.pic_id,
         p.code       AS pic_code,
         p.name       AS pic_name,
         s.status,
         s.claim_time,
         s.updated_at,
         COALESCE(
           (SELECT array_agg(f.id ORDER BY f.id)
              FROM flags f
             WHERE f.status = 'open'
               AND f.type IN (${blockingTypes})
               AND s.session_uuid = ANY (f.session_uuids)),
           ARRAY[]::int[]
         )            AS blocking_flag_ids,
         e.revision,
         e.exported_at,
         e.sheet_url,
         ow.session_uuid AS overwritten_by_session,
         ow.exported_at  AS overwritten_at
    FROM sessions s
    LEFT JOIN aircraft a ON a.id = s.aircraft_id
    LEFT JOIN pilots   p ON p.id = s.pic_id
    LEFT JOIN LATERAL (
      SELECT el.revision, el.exported_at, el.sheet_url, el.day, el.aircraft_id, el.id
        FROM export_log el
       WHERE el.session_uuid = s.session_uuid
       ORDER BY el.exported_at DESC, el.id DESC
       LIMIT 1
    ) e ON TRUE
    LEFT JOIN LATERAL (
      SELECT o.session_uuid, o.exported_at
        FROM export_log o
       WHERE o.day = e.day
         AND o.aircraft_id = e.aircraft_id
         AND o.session_uuid <> s.session_uuid
         AND o.revision > e.revision
       ORDER BY o.revision DESC, o.id DESC
       LIMIT 1
    ) ow ON TRUE`;

/**
 * Stan karty wyrażony w SQL-u - BLIŹNIAK `exportState` z
 * `application/admin/mappers/exportListItem.ts`, wiersz po wierszu, w tej samej
 * kolejności (kolejność JEST regułą: pierwsze dopasowanie wygrywa).
 *
 * Istnieje po to, żeby zawężenie po stanie i liczniki działy się PRZED `LIMIT`-em.
 * Rozjazd z mapperem pilnuje `test/adminExports.test.ts`; uzasadnienie tej duplikacji
 * jest w nagłówku pliku i nie wolno go tu skracać do „bo szybciej".
 */
const STATE_SQL = `
  CASE
    WHEN claim_time IS NULL                                     THEN 'impossible'
    WHEN status = 'voided'                                      THEN 'impossible'
    WHEN status <> 'closed'                                     THEN 'waiting'
    WHEN COALESCE(array_length(blocking_flag_ids, 1), 0) > 0     THEN 'blocked'
    WHEN revision IS NULL OR exported_at IS NULL                THEN 'missing'
    ELSE 'current'
  END`;

/**
 * `scanned` = wiersze surowe, `stated` = te same wiersze z dołożoną kolumną `state`.
 *
 * Dwa poziomy, bo `CASE` czyta `blocking_flag_ids` - kolumnę powstającą z podzapytania
 * agregującego. Powtórzenie tamtego podzapytania wewnątrz `CASE` byłoby drugim
 * wyliczeniem tej samej listy flag, a przy okazji drugim miejscem, w którym mieszka
 * `EXPORT_BLOCKING_FLAG_TYPES`.
 */
const statedSql = (blockingTypes: string, where: string): string => `
  WITH scanned AS (${selectSql(blockingTypes)} ${where}),
       stated  AS (SELECT scanned.*, ${STATE_SQL} AS state FROM scanned)`;

const toJoin = (r: ExportJoinDbRow): AdminExportJoin => ({
  sessionUuid: r.session_uuid,
  aircraftId: r.aircraft_id,
  reg: r.reg,
  aircraftType: r.aircraft_type,
  picId: r.pic_id,
  picCode: r.pic_code,
  picName: r.pic_name,
  // Kolumna jest wolnym tekstem z `DEFAULT 'active'`; zawężamy ją do wartości znanych.
  // `voided` musi tędy przejść (poprawka 2026-08-31): bez tego gałąź „sesja wycofana
  // nie czeka na eksport" w `exportState` była nieosiągalna, a monitor pokazywał
  // wycofany wpis jako `waiting` bez końca.
  status: r.status === 'closed' ? 'closed' : r.status === 'voided' ? 'voided' : 'active',
  // `claim_time` niesie chwilę przejęcia samolotu (decyzja 2026-08-07) - dobę karty liczymy
  // z niej, bo karta jest DOBĄ SAMOLOTU (§4.7), a nie służbą pilota.
  claimedAt: r.claim_time == null ? null : Number(r.claim_time),
  updatedAt: new Date(r.updated_at),
  blockingFlagIds: r.blocking_flag_ids.map(Number),
  revision: r.revision,
  exportedAt: r.exported_at == null ? null : new Date(r.exported_at),
  sheetUrl: r.sheet_url,
  // Obie kolumny wchodzą z jednego `LEFT JOIN LATERAL`, więc albo są obie, albo żadnej;
  // sprawdzamy identyfikator, bo to on jest treścią („kto nadpisał").
  overwrittenBy:
    r.overwritten_by_session == null || r.overwritten_at == null
      ? null
      : {
          sessionUuid: r.overwritten_by_session,
          exportedAt: new Date(r.overwritten_at),
        },
});

/** Miejsca `$n` na typy flag blokujących, zarejestrowane w akumulatorze parametrów. */
function bindBlockingTypes(sql: SqlFilter): string {
  return EXPORT_BLOCKING_FLAG_TYPES.map((type) => sql.bind(type)).join(', ');
}

export class PgAdminExportsRepo implements ExportsAdminPort {
  /**
   * DWA zapytania nad tymi samymi warunkami: strona ma `LIMIT`, licznik nie.
   *
   * Ten sam wzorzec, co `PgAdminFlagsRepo.list` („`total` musi opisywać CAŁY wynik
   * filtra, nie stronę"). Zawężenie po stanie stoi PRZED `LIMIT`-em, a nie po nim -
   * to jest cała poprawka z 2026-08-01: dzień z awarią eksportu sprzed dziewięciu
   * miesięcy musi dać się znaleźć chipem „Bez karty", a nie znikać przy obcięciu.
   *
   * Dwa akumulatory `SqlFilter`, bo numeracja `$n` jest własnością akumulatora, a oba
   * zapytania mają inny ogon (jedno `state` + `limit`, drugie nic).
   */
  async list(
    db: Queryable,
    filter: ExportListFilter,
  ): Promise<{ items: AdminExportJoin[]; counts: AdminExportCounts; matched: number }> {
    const page = new SqlFilter();
    const pageBlocking = bindBlockingTypes(page);
    applyFilters(page, filter);
    const pageWhere = page.where();
    const stateWhere =
      filter.state === undefined ? '' : `WHERE state = ${page.bind(filter.state)}`;
    const limitParam = page.bind(filter.limit);

    const { rows } = await db.query<ExportJoinDbRow>(
      `${statedSql(pageBlocking, pageWhere)}
       SELECT * FROM stated
       ${stateWhere}
       ORDER BY claim_time DESC NULLS LAST, session_uuid DESC
       LIMIT ${limitParam}`,
      page.params(),
    );

    const counts = await this.countByState(db, filter);
    // `matched` opisuje zapytanie RAZEM z zawężeniem: bez chipa to cały zakres, z chipem
    // - ta jedna liczba, którą chip obiecuje. Stąd trasa wie, czy limit obciął listę.
    const matched = filter.state === undefined ? counts.total : counts[filter.state];

    return { items: rows.map(toJoin), counts, matched };
  }

  /**
   * Liczniki per stan nad CAŁYM zakresem filtra - bez `LIMIT`-u i bez zawężenia po
   * stanie (chip pokazujący własną liczbę i zera na wszystkich pozostałych byłby
   * bezużyteczny: po jednym kliknięciu przestałoby być widać, ile jeszcze zostało).
   *
   * `revised` i `overwritten` są WYMIARAMI, nie stanami, więc jadą jako `FILTER` obok
   * grupowania, a nie jako kolejne gałęzie `CASE`.
   */
  private async countByState(db: Queryable, filter: ExportListFilter): Promise<AdminExportCounts> {
    const sql = new SqlFilter();
    const blocking = bindBlockingTypes(sql);
    applyFilters(sql, filter);

    const { rows } = await db.query<StateCountDbRow>(
      `${statedSql(blocking, sql.where())}
       SELECT state,
              COUNT(*)                                                    AS n,
              COUNT(*) FILTER (WHERE revision > 1)                        AS revised,
              COUNT(*) FILTER (WHERE overwritten_by_session IS NOT NULL)  AS overwritten
         FROM stated
        GROUP BY state`,
      sql.params(),
    );

    const counts: AdminExportCounts = {
      total: 0,
      current: 0,
      blocked: 0,
      missing: 0,
      waiting: 0,
      impossible: 0,
      revised: 0,
      overwritten: 0,
    };
    for (const row of rows) {
      const n = Number(row.n);
      counts.total += n;
      counts.revised += Number(row.revised);
      counts.overwritten += Number(row.overwritten);
      // Stan spoza katalogu znaczyłby, że `STATE_SQL` rozjechał się z `ExportState` -
      // ciche pominięcie dałoby licznik `total` większy od sumy stanów i nikt by tego
      // nie zauważył, bo obie liczby byłyby „poprawne" osobno.
      if (!isExportState(row.state)) {
        throw new Error(`Nieznany stan karty z SQL-a: ${row.state}`);
      }
      counts[row.state] += n;
    }
    return counts;
  }

  async byUuid(db: Queryable, sessionUuid: string): Promise<AdminExportJoin | null> {
    const sql = new SqlFilter();
    const blockingTypes = bindBlockingTypes(sql);
    sql.add('s.session_uuid = ?', sessionUuid);

    const { rows } = await db.query<ExportJoinDbRow>(
      `${selectSql(blockingTypes)} ${sql.where()}`,
      sql.params(),
    );
    return rows[0] ? toJoin(rows[0]) : null;
  }

  async history(db: Queryable, sessionUuid: string): Promise<AdminExportRevision[]> {
    // `day::text`, nie `day`: sterowniki parsują `DATE` do JS `Date` o północy LOKALNEJ,
    // a `toISOString()` na takiej dacie cofa dzień w każdej strefie na wschód od
    // Greenwich - czyli u nas. Ten sam powód, co w `pg/common/exportLogRepo.ts`.
    //
    // Porządek ROSNĄCY, odwrotnie niż na listach panelu: to jest oś czasu jednej karty
    // („rewizja 1 · pierwszy eksport" → „rewizja 3 · korekta"), a historię czyta się od
    // początku. Listy czyta się od tego, co nowe, i dlatego mają porządek malejący.
    const { rows } = await db.query<RevisionDbRow>(
      `SELECT revision, day::text AS day, sheet_url, exported_at
         FROM export_log
        WHERE session_uuid = $1
        ORDER BY revision ASC, id ASC`,
      [sessionUuid],
    );
    return rows.map((r) => ({
      revision: r.revision,
      day: r.day,
      sheetUrl: r.sheet_url,
      exportedAt: new Date(r.exported_at),
    }));
  }
}

/**
 * Wszystkie filtry OPCJONALNE i pomijane, gdy nieustawione.
 *
 * Zakres dat idzie po `claim_time`, czyli po CZASIE PRZEJĘCIA - tej samej osi, co lista dni
 * (`A02`) i tej samej, z której powstaje nazwa karty. Filtrowanie po `exported_at`
 * odpowiadałoby na inne pytanie („co wysłano w tym tygodniu") i gubiłoby dokładnie te
 * dni, dla których karta nigdy nie powstała - czyli te, dla których ekran istnieje.
 */
function applyFilters(sql: SqlFilter, filter: ExportListFilter): void {
  sql.addOptional('s.claim_time >= ?', filter.fromMs);
  sql.addOptional('s.claim_time <= ?', filter.toMs);
  sql.addOptional('s.aircraft_id = ?', filter.aircraftId);

  // `position(... in ...)`, nie `LIKE '%q%'`: wzorzec `LIKE` wymaga ucieczki `%` i `_`
  // z tekstu wpisanego przez człowieka, a zapomniana ucieczka daje pole wyszukiwania,
  // w którym `%` pokazuje wszystko. Ta sama decyzja, co w adapterach floty i kont.
  if (filter.search !== undefined && filter.search !== '') {
    sql.add(
      `(position(lower(?) in lower(COALESCE(a.reg, ''))) > 0
        OR position(lower(?) in lower(s.aircraft_id)) > 0
        OR position(lower(?) in lower(s.session_uuid)) > 0)`,
      filter.search,
      filter.search,
      filter.search,
    );
  }
}
