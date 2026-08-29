/**
 * UZ Aero (serwer) - adapter dziennika eksportu (`ExportLogPort`).
 *
 * `day` idzie w obie strony jako NAPIS `YYYY-MM-DD`: przy zapisie Postgres sam
 * rzutuje na DATE, przy odczycie bierzemy `day::text`. Sterowniki (pg, PGlite)
 * parsują DATE do JS `Date` o PÓŁNOCY LOKALNEJ - `toISOString()` na takiej dacie
 * cofa dzień w każdej strefie na wschód od Greenwich, czyli dokładnie u nas.
 * Tekst z bazy nie ma czego przekręcić.
 *
 * Od 2026-08-07 (karta = doba samolotu) jedna rewizja to N wierszy - po jednym na sesję
 * wchodzącą do karty. Klucz rewizji jest parą (doba, samolot), a `session_uuid` jest
 * CZŁONKOSTWEM: po nim pyta `sync-status` telefonu i monitor panelu.
 */

import type {
  ExportCardRecord,
  ExportLogPort,
  ExportRecord,
  Queryable,
} from '../../../application/common/ports.ts';

interface ExportLogDbRow {
  session_uuid: string;
  day: string;
  aircraft_id: string;
  sheet_url: string;
  revision: number;
  exported_at: string | Date;
}

export class PgExportLogRepo implements ExportLogPort {
  /**
   * Klucz advisory jest PRZESTRZENIĄ NAZW plus identyfikatorem KARTY
   * (`export_log:<doba>:<samolot>`), dokładnie jak `aircraft:<id>` przy flocie.
   * `hashtext` zwęża napis do `int4`, więc kolizja dwóch różnych kart jest możliwa
   * i nieszkodliwa: kosztuje szeregowanie dwóch eksportów, które i tak trwają
   * milisekundy. Prefiks jest tu po to, żeby taka kolizja nie mogła zajść MIĘDZY
   * dziedzinami - blokada dziennika i blokada samolotu o tym samym haszu
   * zatrzymywałyby się nawzajem bez żadnego powodu.
   */
  async lock(tx: Queryable, day: string, aircraftId: string): Promise<void> {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `export_log:${day}:${aircraftId}`,
    ]);
  }

  /**
   * Najświeższy wiersz TEJ SESJI - po `exported_at`, nie po `revision`.
   *
   * Numer rewizji jest odtąd numerem KARTY, a jedna sesja teoretycznie może należeć
   * do dwóch kart (korekta czasu przejęcia przesuwająca sesję przez północ), których
   * numeracje biegną niezależnie. Wtedy „większy numer" nie znaczy „nowszy zapis",
   * a ekran 11 pyta właśnie o nowszy. `id` domyka remis w milisekundzie.
   */
  async latest(db: Queryable, sessionUuid: string): Promise<ExportRecord | null> {
    const { rows } = await db.query<ExportLogDbRow>(
      `SELECT session_uuid, day::text AS day, aircraft_id, sheet_url, revision, exported_at
       FROM export_log WHERE session_uuid = $1
       ORDER BY exported_at DESC, id DESC LIMIT 1`,
      [sessionUuid],
    );
    const r = rows[0];
    if (r == null) return null;
    return {
      sessionUuid: r.session_uuid,
      day: r.day,
      aircraftId: r.aircraft_id,
      sheetUrl: r.sheet_url,
      revision: r.revision,
      exportedAt: new Date(r.exported_at),
    };
  }

  /**
   * `MAX(revision)` po parze (doba, samolot); `0` = karty jeszcze nie było.
   *
   * `MAX`, a nie `ORDER BY … LIMIT 1`, bo pytamy o jedną liczbę, a nie o wiersz -
   * i bo wierszy o tym numerze jest tyle, ile sesji w karcie.
   */
  async latestRevision(db: Queryable, day: string, aircraftId: string): Promise<number> {
    const { rows } = await db.query<{ revision: number | string | null }>(
      `SELECT COALESCE(MAX(revision), 0) AS revision
         FROM export_log WHERE day = $1 AND aircraft_id = $2`,
      [day, aircraftId],
    );
    return Number(rows[0]?.revision ?? 0);
  }

  /**
   * Cała rewizja JEDNYM `INSERT`-em - wiersze karty nie mają prawa wejść po kawałku.
   *
   * Miejsca `$n` rozwijamy ręcznie zamiast wysłać tablicę uuidów do `unnest`:
   * serializacja tablicy do literału Postgresa jest zachowaniem STEROWNIKA, a testy
   * jadą na PGlite i produkcja na `pg`. Kilka `$n` znaczy to samo w obu.
   */
  async appendCard(db: Queryable, card: ExportCardRecord): Promise<void> {
    if (card.sessionUuids.length === 0) return;
    const values = card.sessionUuids
      .map((_, i) => `($${i + 6}, $1, $2, $3, $4, $5)`)
      .join(', ');
    await db.query(
      `INSERT INTO export_log (session_uuid, day, aircraft_id, sheet_url, revision, exported_at)
       VALUES ${values}`,
      [
        card.day,
        card.aircraftId,
        card.sheetUrl,
        card.revision,
        card.exportedAt,
        ...card.sessionUuids,
      ],
    );
  }
}
