/**
 * UZ Aero (serwer) - zapytanie o dzienną kartę arkusza (`GET /sheets/…`, §4.7).
 *
 * Strona ODCZYTU eksportu: pod URL-em z `export_log.sheet_url` (link „Serwer
 * zaktualizował arkusz" na ekranie 11) leży karta z bazodanowego adaptera arkuszy.
 * Zapytanie jest cienkie z premedytacją: treść powstała przy eksporcie i leży
 * gotowa w `exported_sheets` - tu się ją tylko podaje, niczego nie dolicza
 * (dokładnie te wiersze, które zapisał `DayExporter`).
 *
 * ══ DWA WEJŚCIA, JEDNA KARTA (issue #99, C5) ══
 * `get` - klub z TOKENU (członek klubu, dawny adres `/sheets/<tab>`; linki zapisane
 * w `export_log` przed 2.0.0 mają dalej działać zalogowanym).
 * `byAddress` - klub ze SLUGU w adresie i SEKRET klubu w `?k=`: czytelnik linku
 * (skarbnik) nie ma konta w aplikacji, więc jedynym poświadczeniem jest sekret.
 * Porównanie stałoczasowe, bo sekret jest jedyną bramą tej trasy; każda odmowa
 * (zły slug, klub wyłączony, zły sekret, brak karty) jest tym samym 404 -
 * odpowiedź nie ma mówić, KTÓRY element adresu był zły.
 */

import { timingSafeEqual } from 'node:crypto';

import type { SheetsReadPort, StoredDaySheet } from '../ports.ts';

export class SheetQueries {
  constructor(private readonly sheets: SheetsReadPort) {}

  /**
   * Karta KLUBU po nazwie (`YYYY-MM-DD_SP-XXX`); `null` = nie wyeksportowano.
   * Klub z tokenu czytającego: karta cudzego klubu o tej samej nazwie nie istnieje
   * dla niego (wielofirmowość §3.7).
   */
  get(orgId: string, tab: string): Promise<StoredDaySheet | null> {
    return this.sheets.readDaySheet(orgId, tab);
  }

  /** Karta spod adresu ze slugiem i sekretem klubu; `null` przy KAŻDEJ rozbieżności. */
  async byAddress(slug: string, tab: string, key: string): Promise<StoredDaySheet | null> {
    const address = await this.sheets.addressOf(slug);
    if (address == null || !sameKey(address.sheetsKey, key)) return null;
    return this.sheets.readDaySheet(address.orgId, tab);
  }
}

/** Porównanie bez zależności od pozycji pierwszej różnicy - sekret nie ma wyciekać czasem. */
function sameKey(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
