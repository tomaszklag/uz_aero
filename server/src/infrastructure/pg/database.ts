/**
 * UZ Aero (serwer) - `Database` na puli `pg`.
 *
 * KLUCZOWE: transakcja musi jechać na JEDNYM połączeniu. `pool.query` bierze za każdym
 * razem losowego klienta, więc `BEGIN` i `COMMIT` przez pulę trafiałyby w różne
 * połączenia - transakcja tylko z nazwy. Stąd jawne `connect()` i klient przekazywany
 * do środka jako `Queryable`.
 */

import type { Pool } from 'pg';

import type { Database, Queryable } from '../../application/common/ports.ts';

export class PgDatabase implements Database {
  constructor(private readonly pool: Pool) {}

  query<R = unknown>(text: string, params?: unknown[]): Promise<{ rows: R[] }> {
    return this.pool.query(text, params) as unknown as Promise<{ rows: R[] }>;
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client as unknown as Queryable);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
