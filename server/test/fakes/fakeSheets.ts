/**
 * UZ Aero (serwer) — atrapa `SheetsPort` do testów eksportu (§4.7).
 *
 * Jedyna atrapa w zestawie testowym serwera — i celowo: adaptera Google jeszcze nie ma
 * (brak klucza serwisowego), a testy eksportu sprawdzają NASZĄ logikę (bramki, rewizje,
 * treść karty), nie API Google. Rejestruje każde wywołanie i umie się zepsuć na żądanie,
 * bo „awaria Sheets nie psuje przyjęcia zdarzeń" to twarde wymaganie z testem.
 */

import type { DaySheet, SheetsPort } from '../../src/application/common/ports.ts';

export class FakeSheets implements SheetsPort {
  /** Kolejne zapisane karty — ostatnia = aktualna zawartość arkusza. */
  readonly calls: DaySheet[] = [];
  /** Ustawienie błędu psuje KAŻDE kolejne wywołanie (symulacja awarii Google API). */
  failWith: Error | null = null;

  async writeDaySheet(sheet: DaySheet): Promise<{ url: string }> {
    if (this.failWith != null) throw this.failWith;
    this.calls.push(sheet);
    return { url: `https://sheets.example/${sheet.tab}` };
  }
}
