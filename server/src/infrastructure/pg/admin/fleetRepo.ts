/**
 * UZ Aero (serwer) - adapter floty po stronie PANELU (`FleetAdminPort`, `A07`, `A07a`).
 *
 * Trzeci adapter tabeli `aircraft` i to jest wzorzec, nie niedopatrzenie - dokładnie
 * jak przy `pilots` i `flags`. `mobile/referenceRepo.ts` buduje CAŁĄ migawkę floty pod
 * cache telefonów; `common/aircraftConfigRepo.ts` oddaje jedną liczbę w gorącej
 * transakcji ingestu; ten pisze i liczy, biorąc `tx` z zewnątrz, bo każdy zapis panelu
 * jedzie transakcją śladu audytu. Ani ingest, ani `GET /reference` nie mają jak
 * zregresować od zmian w ekranie floty.
 *
 * ══ `updated_at` PRZY KAŻDYM ZAPISIE - TO NIE JEST KOSMETYKA ══
 * Z tej kolumny powstaje ETag `GET /reference`
 * (`application/mobile/queries/reference.ts` → `PgReferenceRepo.snapshot`). Zapis, który
 * jej nie ruszy, zostaje w panelu i **nie dociera do żadnego telefonu**: aplikacja
 * dostanie 304 i będzie pracować na starej pojemności, starym formacie MH i starym
 * wymogu Duala. To jedyny kanał, którym konfiguracja wychodzi z panelu, więc pilnuje
 * go test (`test/adminFleet.test.ts`, „zapis podbija ETag /reference").
 *
 * ══ CZEGO TU NIE MA I NIE WOLNO DODAĆ ══
 * `DELETE FROM aircraft`. Wyłączenie ze służby zabiera jednostkę z listy WYBORU;
 * sesje, zdarzenia, flagi i karty arkusza wskazują `aircraft_id` i mają zostać czytelne
 * także wtedy, gdy samolot dawno stoi w hangarze.
 */

import type { MhFormat, ServiceStatus } from '@uzaero/domain';

import type {
  AdminAircraft,
  AdminAircraftJoin,
  AircraftPatch,
  FleetAdminPort,
  FleetCounts,
  FleetListFilter,
} from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';
import { SqlFilter } from '../sqlFilter.ts';

interface AircraftDbRow {
  id: string;
  reg: string;
  type: string;
  year: number | null;
  /** `REAL` - sterownik oddaje liczbę, PGlite bywa napisem; `Number` domyka oba. */
  capacity_l: string | number;
  mh_format: string;
  dual_required: boolean;
  service_status: string;
  updated_at: string | Date;
  oil_min_l: string | number | null;
  oil_capacity_l: string | number | null;
  oil_norm_l_per_h: string | number | null;
  fuel_norm_l_per_h: string | number | null;
  initial_mh: string | number | null;
  initial_fuel_l: string | number | null;
  initial_oil_l: string | number | null;
}

interface JoinedDbRow extends AircraftDbRow {
  /** `COUNT(*)` - sterownik oddaje `int8` NAPISEM, nie liczbą. */
  open_sessions: string | number;
  open_flags: string | number;
  last_event_at: string | Date | null;
}

/**
 * Wartość spoza katalogu schodzi do bezpiecznej: `decimal` przy formacie licznika
 * i `disabled` przy stanie służby.
 *
 * Kierunek jest ŚWIADOMY i różny dla obu kolumn. Nierozpoznany format MH pokazałby
 * pilotowi złe pole wpisu, ale nie odblokowuje niczego; nierozpoznany stan służby
 * MUSI iść w stronę „nie do wyboru", bo domyślenie się `active` z literówki w bazie
 * wpuściłoby na listę samolot, którego ktoś świadomie z niej zdejmował. Ta sama
 * nieufność, co przy roli konta w `pilotsRepo.ts`.
 */
const toMhFormat = (value: string): MhFormat => (value === 'hhmm' ? 'hhmm' : 'decimal');

const toServiceStatus = (value: string): ServiceStatus =>
  value === 'active' ? 'active' : 'disabled';

/** `DOUBLE PRECISION` wraca liczbą albo napisem (PGlite) - `Number` domyka oba. */
const num = (v: string | number | null): number | null => (v != null ? Number(v) : null);

const toAircraft = (r: AircraftDbRow): AdminAircraft => ({
  id: r.id,
  reg: r.reg,
  type: r.type,
  year: r.year,
  capacityL: Number(r.capacity_l),
  mhFormat: toMhFormat(r.mh_format),
  dualRequired: r.dual_required,
  serviceStatus: toServiceStatus(r.service_status),
  oilMinL: num(r.oil_min_l),
  oilCapacityL: num(r.oil_capacity_l),
  oilNormLPerH: num(r.oil_norm_l_per_h),
  fuelNormLPerH: num(r.fuel_norm_l_per_h),
  initialMh: num(r.initial_mh),
  initialFuelL: num(r.initial_fuel_l),
  initialOilL: num(r.initial_oil_l),
});

const toJoin = (r: JoinedDbRow): AdminAircraftJoin => ({
  aircraft: toAircraft(r),
  updatedAt: new Date(r.updated_at),
  openSessions: Number(r.open_sessions),
  openFlags: Number(r.open_flags),
  lastEventAt: r.last_event_at == null ? null : new Date(r.last_event_at),
});

/**
 * JEDNA definicja stanu służby dla listy I dla liczników.
 *
 * Do 2026-08-01 kafel i chip liczyły `service_status <> 'active'`, a lista filtrowała
 * przez `= 'disabled'`. Przez HTTP było to nieosiągalne (zod ma enum), ale to dokładnie
 * ta usterka, co przy chipach na `A06`: chip niesie liczbę i jest OBIETNICĄ „tyle
 * wierszy zobaczysz po kliknięciu", więc dwie definicje kończą się chipem „1", który
 * po kliknięciu daje pustą tabelę.
 *
 * Kierunek wybrany świadomie: „wyłączony" znaczy `<> 'active'`, czyli „nie do wyboru",
 * a nie „ma dokładnie ten napis w kolumnie". Jest to ta sama nieufność, którą stosuje
 * `toServiceStatus` wyżej (wartość spoza katalogu schodzi do `disabled`), więc wiersz
 * z literówką w bazie jest prezentowany, filtrowany i liczony tak samo. Przy definicji
 * `= 'disabled'` taki wiersz nie trafiłby ani do `active`, ani do `disabled`, a suma
 * kafli przestałaby się zgadzać z `total`.
 */
const SERVICE_STATUS_SQL: Record<ServiceStatus, string> = {
  active: "a.service_status = 'active'",
  disabled: "a.service_status <> 'active'",
};

/**
 * Trzy agregaty po tabelach OBOK, nie odtworzenie projekcji: liczba trwających dni,
 * liczba otwartych flag i znacznik ostatniego przyjętego zdarzenia. Żaden z nich nie
 * jest liczbą dnia policzoną po raz drugi (`docs/architektura-panelu-serwer.md` §7.1)
 * - to są odpowiedzi na pytania o inne tabele.
 */
const SELECT = `
  SELECT a.*,
         (SELECT COUNT(*) FROM sessions s
           WHERE s.aircraft_id = a.id AND s.status = 'active')       AS open_sessions,
         (SELECT COUNT(*) FROM flags f
           WHERE f.aircraft_id = a.id AND f.status = 'open')         AS open_flags,
         (SELECT MAX(e.received_at) FROM events e
           WHERE e.aircraft_id = a.id)                               AS last_event_at
    FROM aircraft a`;

export class PgAdminFleetRepo implements FleetAdminPort {
  async list(db: Queryable, filter: FleetListFilter): Promise<AdminAircraftJoin[]> {
    const sql = new SqlFilter();
    if (filter.serviceStatus !== undefined) sql.add(SERVICE_STATUS_SQL[filter.serviceStatus]);
    if (filter.claimed !== undefined) {
      const exists = `EXISTS (SELECT 1 FROM sessions s
                               WHERE s.aircraft_id = a.id AND s.status = 'active')`;
      sql.add(filter.claimed ? exists : `NOT ${exists}`);
    }
    applySearch(sql, filter.search);

    const { rows } = await db.query<JoinedDbRow>(
      // Porządek jest CZĘŚCIĄ KONTRAKTU portu, jak przy skrzynce flag i liście kont:
      // jednostki wyłączone lądują na końcu (mockup A07 rysuje je tak), a w obrębie
      // grupy sortujemy po rejestracji - jedynym polu, po którym człowiek szuka.
      `${SELECT} ${sql.where()} ORDER BY (a.service_status = 'disabled'), a.reg ASC`,
      sql.params(),
    );
    return rows.map(toJoin);
  }

  async counts(db: Queryable): Promise<FleetCounts> {
    return this.countBy(db, new SqlFilter());
  }

  /**
   * Liczniki CHIPÓW - te same cztery zawężenia, ale w bieżącym wyszukiwaniu.
   *
   * Osobna metoda od `counts`, mimo identycznego SQL-a poza `WHERE`, bo odpowiada na
   * inne pytanie: `counts` opisuje flotę (kafle), a to jest obietnica chipa („tyle
   * zobaczysz"). Sklejenie ich w jedno zmusiłoby kafle do drgania przy wpisywaniu
   * w wyszukiwarkę, czyli odebrałoby im ich jedyną treść.
   */
  async scopeCounts(db: Queryable, filter: { search?: string }): Promise<FleetCounts> {
    const sql = new SqlFilter();
    applySearch(sql, filter.search);
    return this.countBy(db, sql);
  }

  private async countBy(db: Queryable, sql: SqlFilter): Promise<FleetCounts> {
    const { rows } = await db.query<Record<string, string>>(
      // Te same dwa fragmenty, co w `list` - jeden literał na jedno pojęcie, żeby
      // liczba na chipie i skład listy pod nim nie mogły się rozjechać.
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE ${SERVICE_STATUS_SQL.active})   AS active,
              COUNT(*) FILTER (WHERE ${SERVICE_STATUS_SQL.disabled}) AS disabled,
              COUNT(*) FILTER (
                WHERE EXISTS (SELECT 1 FROM sessions s
                               WHERE s.aircraft_id = a.id AND s.status = 'active')
              ) AS claimed
         FROM aircraft a ${sql.where()}`,
      sql.params(),
    );
    const row = rows[0] ?? {};
    return {
      total: Number(row.total ?? 0),
      active: Number(row.active ?? 0),
      disabled: Number(row.disabled ?? 0),
      claimed: Number(row.claimed ?? 0),
    };
  }

  async byId(db: Queryable, id: string): Promise<AdminAircraft | null> {
    const { rows } = await db.query<AircraftDbRow>('SELECT * FROM aircraft WHERE id = $1', [id]);
    return rows[0] == null ? null : toAircraft(rows[0]);
  }

  async joinById(db: Queryable, id: string): Promise<AdminAircraftJoin | null> {
    const { rows } = await db.query<JoinedDbRow>(`${SELECT} WHERE a.id = $1`, [id]);
    return rows[0] == null ? null : toJoin(rows[0]);
  }

  /**
   * Kolizja rejestracji PRZED zapisem. Porównanie bez rozróżniania wielkości, mimo że
   * trasa i tak normalizuje do wersalików: indeks `UNIQUE` jest wrażliwy na wielkość,
   * więc `sp-klm` przeszłoby przez bazę i dało DRUGI wiersz tej samej maszyny.
   * Sprawdzenie ma odpowiadać na pytanie człowieka („czy ta rejestracja jest zajęta"),
   * a nie na pytanie indeksu.
   */
  async conflict(
    tx: Queryable,
    values: { reg: string; exceptId: string | null },
  ): Promise<'reg' | null> {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM aircraft
        WHERE lower(reg) = lower($1) AND ($2::text IS NULL OR id <> $2)`,
      [values.reg, values.exceptId],
    );
    return rows.length > 0 ? 'reg' : null;
  }

  async insert(tx: Queryable, aircraft: AdminAircraft): Promise<void> {
    await tx.query(
      `INSERT INTO aircraft (id, reg, type, year, capacity_l, mh_format, dual_required, service_status,
                             oil_min_l, oil_capacity_l, oil_norm_l_per_h,
                             fuel_norm_l_per_h, initial_mh, initial_fuel_l, initial_oil_l)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        aircraft.id,
        aircraft.reg,
        aircraft.type,
        aircraft.year,
        aircraft.capacityL,
        aircraft.mhFormat,
        aircraft.dualRequired,
        aircraft.serviceStatus,
        aircraft.oilMinL,
        aircraft.oilCapacityL,
        aircraft.oilNormLPerH,
        aircraft.fuelNormLPerH,
        aircraft.initialMh,
        aircraft.initialFuelL,
        aircraft.initialOilL,
      ],
    );
  }

  /**
   * `COALESCE` zamiast budowania `SET` z obecnych pól: `undefined` znaczy „bez zmian",
   * a `null` przy roku znaczy „wyczyść" - te dwa przypadki muszą zostać rozróżnione
   * aż do SQL-a, stąd jawny znacznik `$4` dla roku (ta sama sztuczka, co przy e-mailu
   * konta).
   *
   * `updated_at = now()` jest tu ZAWSZE i to jest jedyny powód, dla którego zapis
   * z panelu dociera do telefonów - patrz nagłówek pliku.
   */
  async update(tx: Queryable, id: string, patch: AircraftPatch): Promise<void> {
    await tx.query(
      `UPDATE aircraft
          SET reg            = COALESCE($2, reg),
              type           = COALESCE($3, type),
              year           = CASE WHEN $5 THEN $4 ELSE year END,
              capacity_l     = COALESCE($6, capacity_l),
              mh_format      = COALESCE($7, mh_format),
              dual_required  = COALESCE($8, dual_required),
              service_status = COALESCE($9, service_status),
              -- Olej (issue #60): NULL znaczy "wyczyść" (moduł ma zamilknąć), więc
              -- każda para niesie jawny znacznik zmiany - ta sama sztuczka, co rok.
              oil_min_l        = CASE WHEN $11 THEN $10 ELSE oil_min_l END,
              oil_capacity_l   = CASE WHEN $13 THEN $12 ELSE oil_capacity_l END,
              oil_norm_l_per_h = CASE WHEN $15 THEN $14 ELSE oil_norm_l_per_h END,
              -- Norma nominalna i stan początkowy (issue #66) - ta sama para
              -- „wartość + znacznik zmiany", bo NULL i tu znaczy „wyczyść".
              fuel_norm_l_per_h = CASE WHEN $17 THEN $16 ELSE fuel_norm_l_per_h END,
              initial_mh        = CASE WHEN $19 THEN $18 ELSE initial_mh END,
              initial_fuel_l    = CASE WHEN $21 THEN $20 ELSE initial_fuel_l END,
              initial_oil_l     = CASE WHEN $23 THEN $22 ELSE initial_oil_l END,
              updated_at     = now()
        WHERE id = $1`,
      [
        id,
        patch.reg ?? null,
        patch.type ?? null,
        patch.year ?? null,
        patch.year !== undefined,
        patch.capacityL ?? null,
        patch.mhFormat ?? null,
        patch.dualRequired ?? null,
        patch.serviceStatus ?? null,
        patch.oilMinL ?? null,
        patch.oilMinL !== undefined,
        patch.oilCapacityL ?? null,
        patch.oilCapacityL !== undefined,
        patch.oilNormLPerH ?? null,
        patch.oilNormLPerH !== undefined,
        patch.fuelNormLPerH ?? null,
        patch.fuelNormLPerH !== undefined,
        patch.initialMh ?? null,
        patch.initialMh !== undefined,
        patch.initialFuelL ?? null,
        patch.initialFuelL !== undefined,
        patch.initialOilL ?? null,
        patch.initialOilL !== undefined,
      ],
    );
  }

  async openSessions(tx: Queryable, aircraftId: string): Promise<number> {
    const { rows } = await tx.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM sessions WHERE aircraft_id = $1 AND status = 'active'",
      [aircraftId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Czy cokolwiek odwołuje się do tej jednostki - wejście do `refuseDeleteAircraft`.
   *
   * `EXISTS`, nie `COUNT(*)`: regule wystarczy zero/niezero, a liczenie wierszy
   * w `events` maszyny z sezonem lotów jest pełnym skanem po nic. Wynik jest więc
   * liczbą ŹRÓDEŁ (0-5), nie wierszy.
   *
   * ══ CZEGO TU NIE MA I DLACZEGO ══
   * **`exported_sheets`** - tabela ma jedną kolumnę klucza (`tab`) z identyfikatorem
   * maszyny wklejonym w nazwę, więc szukanie po niej byłoby dopasowaniem wzorca do
   * tekstu. Nie jest potrzebne: karta arkusza nie powstaje bez sesji, a sesje liczymy
   * wiersz wyżej - jednostka bez sesji nie ma jak mieć karty.
   * **`admin_audit`** - wpis `aircraft.create` z chwili założenia jednostki jest jej
   * celem, więc liczenie celów zablokowałoby usunięcie KAŻDEJ maszyny. Sprawcą wpisu
   * jednostka być nie może (sprawcą jest konto), więc tabela nie ma tu czego wnieść.
   */
  async references(tx: Queryable, aircraftId: string): Promise<number> {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT (EXISTS (SELECT 1 FROM events WHERE aircraft_id = $1))::int
            + (EXISTS (SELECT 1 FROM sessions WHERE aircraft_id = $1))::int
            + (EXISTS (SELECT 1 FROM flags WHERE aircraft_id = $1))::int
            + (EXISTS (SELECT 1 FROM export_log WHERE aircraft_id = $1))::int
            + (EXISTS (SELECT 1 FROM aircraft_consumption WHERE aircraft_id = $1))::int AS n`,
      [aircraftId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Trwałe skasowanie wiersza jednostki. Wołane wyłącznie po `refuseDeleteAircraft`. */
  async delete(tx: Queryable, aircraftId: string): Promise<void> {
    await tx.query('DELETE FROM aircraft WHERE id = $1', [aircraftId]);
  }

  /**
   * Klucz jest PER JEDNOSTKA, a nie stały jak przy populacji administratorów - bo
   * chroniony zasób jest tu inny: nie „ilu jest administratorów w klubie", tylko „jaki
   * jest stan TEGO wiersza". Dwie zmiany różnych samolotów nie muszą na siebie czekać.
   *
   * `hashtext` na napisie zamiast liczby wpisanej wprost: tak samo powstaje klucz
   * blokady sesji w `IngestCommands` i klucz populacji w `pilotsRepo`. Przestrzeń
   * kluczy advisory jest wspólna dla całej bazy, więc kolizja hashy dałaby najwyżej
   * niepotrzebne czekanie, nigdy pominiętą blokadę.
   */
  async lockAircraft(tx: Queryable, aircraftId: string): Promise<void> {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`aircraft:${aircraftId}`]);
  }
}

/**
 * Wyszukiwanie przez `position(... in ...)`, nie `LIKE '%q%'`: wzorzec `LIKE` wymaga
 * ucieczki `%` i `_` z tekstu wpisanego przez człowieka, a zapomniana ucieczka daje
 * pole wyszukiwania, w którym `%` pokazuje wszystko. `position` nie ma metaznaków.
 * Ta sama decyzja, co w adapterze kont.
 */
function applySearch(sql: SqlFilter, search: string | undefined): void {
  if (search === undefined || search === '') return;
  sql.add(
    `(position(lower(?) in lower(a.reg)) > 0 OR position(lower(?) in lower(a.type)) > 0)`,
    search,
    search,
  );
}
