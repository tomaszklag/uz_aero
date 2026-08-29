/**
 * UZ Aero (serwer) - adapter operacji serwisowych panelu (`MaintenanceAdminPort`, `A11`).
 *
 * Trzy tematy, trzy tabele i jedna wspólna zasada: **żadna metoda nie oddaje wartości
 * ani skrótu tokenu.** Sprzątanie wygasłych sesji zwraca liczby i daty, bo tyle wchodzi
 * do `admin_audit.details` - a adapter, który „na wszelki wypadek" oddałby hashe, byłby
 * pierwszą okazją do wpisania ich do dziennika (`A09`: „Tokeny i refresh tokeny - nigdy").
 */

import type {
  MaintenanceAdminPort,
  PurgedTokens,
  RefreshTokenScan,
  SchemaMigrationRow,
} from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';
import { MIGRATIONS, MIGRATION_TITLES, SCHEMA_VERSION } from '../schema.ts';

/** `COUNT(*)` wraca z Postgresa jako `bigint`, czyli napis w sterowniku. */
const count = (value: string | number | null): number => Number(value ?? 0);

const date = (value: string | Date | null): Date | null =>
  value == null ? null : value instanceof Date ? value : new Date(value);

export class PgAdminMaintenanceRepo implements MaintenanceAdminPort {
  /**
   * `DISTINCT session_uuid` z rejestru `events`, nie z tabeli `sessions`, i w tym jest
   * cała treść tej metody. Lista budowana z projekcji nie umiałaby pokazać sesji, która
   * jest w rejestrze, a wiersza projekcji nie ma - czyli najcięższego przypadku dryfu,
   * dla którego przebudowa w ogóle powstała.
   *
   * Porządek po `session_uuid` jest deterministyczny, żeby dwa przebiegi na tych samych
   * danych dały ten sam raport - inaczej „różnice" zmieniałyby kolejność między biegami
   * i nie dałoby się ich porównać wzrokiem.
   */
  async sessionUuids(db: Queryable): Promise<string[]> {
    const { rows } = await db.query<{ session_uuid: string }>(
      'SELECT DISTINCT session_uuid FROM events ORDER BY session_uuid',
    );
    return rows.map((r) => r.session_uuid);
  }

  /**
   * Wszystkie cztery liczby JEDNYM zapytaniem - nie dla wydajności, tylko dlatego, że
   * mają opisywać TĘ SAMĄ chwilę. „Ważnych 15" policzone osobno od „wygasłych 37" mogłoby
   * po sekundzie nie sumować się do liczby wierszy, a ekran twierdzi, że się sumuje.
   *
   * Granica jest domknięta (`<=`): token, który wygasa dokładnie teraz, już nie odnowi
   * dostępu, więc trzymanie go byłoby zbieraniem martwych wierszy o sekundę dłużej.
   */
  async scanRefreshTokens(db: Queryable, at: Date): Promise<RefreshTokenScan> {
    const { rows } = await db.query<{
      total: string;
      expired: string;
      valid: string;
      oldest: string | Date | null;
      newest: string | Date | null;
    }>(
      `SELECT COUNT(*)                                        AS total,
              COUNT(*) FILTER (WHERE expires_at <= $1)        AS expired,
              COUNT(*) FILTER (WHERE expires_at >  $1)        AS valid,
              MIN(expires_at) FILTER (WHERE expires_at <= $1) AS oldest,
              MAX(expires_at) FILTER (WHERE expires_at <= $1) AS newest
         FROM refresh_tokens`,
      [at.toISOString()],
    );

    const row = rows[0];
    return {
      total: count(row?.total ?? 0),
      expired: count(row?.expired ?? 0),
      valid: count(row?.valid ?? 0),
      oldestExpiredAt: date(row?.oldest ?? null),
      newestExpiredAt: date(row?.newest ?? null),
    };
  }

  /**
   * Kasowanie z predykatem `expires_at <= $1` W SQL-U - i to jest cała ochrona pilotów
   * w terenie. Token WAŻNY skasowany przez pomyłkę wymusza ponowne logowanie, a to jedyna
   * czynność w systemie wymagająca sieci (§3.0). Wariant „pobierz kandydatów, potem skasuj
   * po kluczu" miałby dwie okazje do pomyłki i okno wyścigu między nimi.
   *
   * `RETURNING expires_at` służy WYŁĄCZNIE do policzenia wierszy i zakresu dat - kolumny
   * `token_hash` nie ma w tym zapytaniu i nie wolno jej dopisać.
   *
   * `remainingValid` czytamy PO skasowaniu, tą samą transakcją: to jest wykonywalna postać
   * zdania z ekranu „żaden pilot nie zostanie przez to wylogowany".
   */
  async purgeExpiredRefreshTokens(tx: Queryable, at: Date): Promise<PurgedTokens> {
    const stamp = at.toISOString();
    const { rows } = await tx.query<{ expires_at: string | Date }>(
      'DELETE FROM refresh_tokens WHERE expires_at <= $1 RETURNING expires_at',
      [stamp],
    );

    const times = rows
      .map((r) => date(r.expires_at))
      .filter((d): d is Date => d != null)
      .map((d) => d.getTime())
      .sort((a, b) => a - b);

    const remaining = await tx.query<{ valid: string }>(
      'SELECT COUNT(*) AS valid FROM refresh_tokens WHERE expires_at > $1',
      [stamp],
    );

    return {
      deleted: rows.length,
      oldestExpiredAt: times.length === 0 ? null : new Date(times[0]!),
      newestExpiredAt: times.length === 0 ? null : new Date(times[times.length - 1]!),
      remainingValid: count(remaining.rows[0]?.valid ?? 0),
    };
  }

  /**
   * Migracje ZNANE KODOWI, z doklejoną chwilą zastosowania z bazy.
   *
   * Kierunek jest istotny: iterujemy po `MIGRATIONS`, a nie po wierszach
   * `schema_migrations`. Baza starsza niż kod ma pokazać brakujące pozycje jako
   * niezastosowane (stan po awarii runnera w starcie), a nie zniknąć z tabeli -
   * lista budowana z bazy nie umiałaby powiedzieć, czego brakuje.
   */
  async schemaMigrations(
    db: Queryable,
  ): Promise<{ version: number; rows: SchemaMigrationRow[] }> {
    const { rows } = await db.query<{ version: number; applied_at: string | Date }>(
      'SELECT version, applied_at FROM schema_migrations ORDER BY version',
    );
    const appliedAt = new Map(rows.map((r) => [Number(r.version), date(r.applied_at)]));

    return {
      version: SCHEMA_VERSION,
      rows: MIGRATIONS.map((_script, index) => ({
        version: index + 1,
        // Brak opisu jest wadą KODU, nie danych - `test/schema.test.ts` wymusza równą
        // długość obu tablic, więc ten wariant nie ma prawa dojść do ekranu.
        title: MIGRATION_TITLES[index] ?? `Migracja ${index + 1}`,
        appliedAt: appliedAt.get(index + 1) ?? null,
      })),
    };
  }
}
