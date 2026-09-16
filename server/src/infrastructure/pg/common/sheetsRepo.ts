/**
 * Ninerdeck (serwer) - bazodanowy adapter arkuszy (`SheetsPort` + `SheetsReadPort`).
 *
 * Dzienne karty §4.7 lądują w tabeli `exported_sheets` zamiast u Google: dosłowne
 * wiersze karty (jak w Excelu), jedna karta = jeden rekord, rewizja NADPISUJE treść
 * (semantyka karty w arkuszu; historię rewizji trzyma append-only `export_log`).
 * Dzięki temu eksport działa end-to-end od dziś - a adapter Google, gdy przyjdzie
 * klucz serwisowy, będzie czystą podmianą `SheetsPort` w composition root:
 * eksporter i treść kart nie drgną.
 *
 * URL karty trafia do `export_log.sheet_url` i na ekran 11 telefonu („Serwer
 * zaktualizował arkusz"), więc musi być absolutny i klikalny SPOZA serwera -
 * stąd `baseUrl` z konfiguracji, nie ścieżka względna.
 *
 * ══ ADRES KARTY NIESIE KLUB I JEGO SEKRET (issue #99, C5) ══
 * `/sheets/<slug>/<tab>?k=<sheets_key>`. Do 2.0.0 karta stała pod samą nazwą
 * (`/sheets/<tab>`), a nazwa jest zgadywalna: znak plus data. Przy jednym klubie
 * chroniło ją logowanie; przy wielu adres musi nazwać klub, a czytelnik linku -
 * skarbnik bez konta w aplikacji - musi się czymś wylegitymować. Tym czymś jest sekret
 * klubu z `organizations.sheets_key`: losowy, jeden na klub, do zmiany w panelu.
 * Adapter składa adres z tego samego wiersza, z którego trasa go potem sprawdza -
 * dwie definicje adresu rozjechałyby się przy pierwszej zmianie kształtu.
 */

import type {
  Clock,
  DaySheet,
  Queryable,
  SheetAddress,
  SheetsPort,
  SheetsReadPort,
  StoredDaySheet,
} from '../../../application/common/ports.ts';

interface SheetDbRow {
  tab: string;
  rows: string[][];
  updated_at: string | Date;
}

interface AddressDbRow {
  id: string;
  slug: string;
  sheets_key: string;
}

export class PgSheets implements SheetsPort, SheetsReadPort {
  constructor(
    private readonly db: Queryable,
    private readonly baseUrl: string,
    private readonly clock: Clock,
  ) {}

  async writeDaySheet(orgId: string, sheet: DaySheet): Promise<{ url: string }> {
    // JSONB jak w `flagsRepo`: goła tablica JS poszłaby sterownikiem jako literał
    // TABLICY Postgresa - stringify robi z niej dokument JSON.
    //
    // Klucz karty to `(org_id, tab)` (wielofirmowość §3.6): ta sama nazwa w dwóch klubach
    // to DWA dokumenty, a nie jeden nadpisywany na przemian.
    await this.db.query(
      `INSERT INTO exported_sheets (org_id, tab, rows, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (org_id, tab) DO UPDATE SET rows = EXCLUDED.rows, updated_at = EXCLUDED.updated_at`,
      [orgId, sheet.tab, JSON.stringify(sheet.rows), this.clock.now()],
    );

    const { rows } = await this.db.query<AddressDbRow>(
      'SELECT id, slug, sheets_key FROM organizations WHERE id = $1',
      [orgId],
    );
    const address = rows[0];
    if (address == null) throw new Error(`karta arkusza dla nieznanego klubu: ${orgId}`);
    return { url: this.urlOf(address, sheet.tab) };
  }

  async readDaySheet(orgId: string, tab: string): Promise<StoredDaySheet | null> {
    const { rows } = await this.db.query<SheetDbRow>(
      'SELECT tab, rows, updated_at FROM exported_sheets WHERE org_id = $1 AND tab = $2',
      [orgId, tab],
    );
    const r = rows[0];
    if (r == null) return null;
    // JSONB wraca ze sterownika już sparsowany - bez drugiego JSON.parse.
    return { tab: r.tab, rows: r.rows, updatedAt: new Date(r.updated_at) };
  }

  /**
   * Klub WYŁĄCZONY nie ma adresu: jego karty zostają w bazie (dziennik jest dokumentem
   * klubu), ale link przestaje działać razem z panelem i trasami klubu.
   */
  async addressOf(slug: string): Promise<SheetAddress | null> {
    const { rows } = await this.db.query<AddressDbRow>(
      'SELECT id, slug, sheets_key FROM organizations WHERE slug = $1 AND active',
      [slug],
    );
    const row = rows[0];
    return row == null ? null : { orgId: row.id, slug: row.slug, sheetsKey: row.sheets_key };
  }

  /** `encodeURIComponent` na wypadek rejestracji ze znakiem spoza URL - dziś no-op. */
  private urlOf(address: AddressDbRow, tab: string): string {
    return `${this.baseUrl}/sheets/${address.slug}/${encodeURIComponent(tab)}?k=${address.sheets_key}`;
  }
}
