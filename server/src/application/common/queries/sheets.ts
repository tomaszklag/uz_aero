/**
 * UZ Aero (serwer) - zapytanie o dzienną kartę arkusza (`GET /sheets/:tab`, §4.7).
 *
 * Strona ODCZYTU eksportu: pod URL-em z `export_log.sheet_url` (link „Serwer
 * zaktualizował arkusz" na ekranie 11) leży karta z bazodanowego adaptera arkuszy.
 * Zapytanie jest cienkie z premedytacją: treść powstała przy eksporcie i leży
 * gotowa w `exported_sheets` - tu się ją tylko podaje, niczego nie dolicza
 * (dokładnie te wiersze, które zapisał `DayExporter`).
 */

import type { SheetsReadPort, StoredDaySheet } from '../ports.ts';

export class SheetQueries {
  constructor(private readonly sheets: SheetsReadPort) {}

  /**
   * Karta KLUBU po nazwie (`YYYY-MM-DD_SP-XXX`); `null` = nie wyeksportowano.
   * Klub z tokenu czytającego: karta cudzego klubu o tej samej nazwie nie istnieje
   * dla niego (wielofirmowość §3.7; adres ze slugiem klubu dochodzi w epiku C).
   */
  get(orgId: string, tab: string): Promise<StoredDaySheet | null> {
    return this.sheets.readDaySheet(orgId, tab);
  }
}
