/**
 * UZ Aero (serwer) — bazodanowy adapter arkuszy (`SheetsPort` + `SheetsReadPort`).
 *
 * Dzienne karty §4.7 lądują w tabeli `exported_sheets` zamiast u Google: dosłowne
 * wiersze karty (jak w Excelu), jedna karta = jeden rekord, rewizja NADPISUJE treść
 * (semantyka karty w arkuszu; historię rewizji trzyma append-only `export_log`).
 * Dzięki temu eksport działa end-to-end od dziś — a adapter Google, gdy przyjdzie
 * klucz serwisowy, będzie czystą podmianą `SheetsPort` w composition root:
 * eksporter i treść kart nie drgną.
 *
 * URL karty trafia do `export_log.sheet_url` i na ekran 11 telefonu („Serwer
 * zaktualizował arkusz"), więc musi być absolutny i klikalny SPOZA serwera —
 * stąd `baseUrl` z konfiguracji, nie ścieżka względna.
 */

import type {
  Clock,
  DaySheet,
  Queryable,
  SheetsPort,
  SheetsReadPort,
  StoredDaySheet,
} from '../../application/ports.ts';

interface SheetDbRow {
  tab: string;
  rows: string[][];
  updated_at: string | Date;
}

export class PgSheets implements SheetsPort, SheetsReadPort {
  constructor(
    private readonly db: Queryable,
    private readonly baseUrl: string,
    private readonly clock: Clock,
  ) {}

  async writeDaySheet(sheet: DaySheet): Promise<{ url: string }> {
    // JSONB jak w `flagsRepo`: goła tablica JS poszłaby sterownikiem jako literał
    // TABLICY Postgresa — stringify robi z niej dokument JSON.
    await this.db.query(
      `INSERT INTO exported_sheets (tab, rows, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (tab) DO UPDATE SET rows = EXCLUDED.rows, updated_at = EXCLUDED.updated_at`,
      [sheet.tab, JSON.stringify(sheet.rows), this.clock.now()],
    );
    return { url: this.urlOf(sheet.tab) };
  }

  async readDaySheet(tab: string): Promise<StoredDaySheet | null> {
    const { rows } = await this.db.query<SheetDbRow>(
      'SELECT tab, rows, updated_at FROM exported_sheets WHERE tab = $1',
      [tab],
    );
    const r = rows[0];
    if (r == null) return null;
    // JSONB wraca ze sterownika już sparsowany — bez drugiego JSON.parse.
    return { tab: r.tab, rows: r.rows, updatedAt: new Date(r.updated_at) };
  }

  /** `encodeURIComponent` na wypadek rejestracji ze znakiem spoza URL — dziś no-op. */
  private urlOf(tab: string): string {
    return `${this.baseUrl}/sheets/${encodeURIComponent(tab)}`;
  }
}
