/**
 * UZ Aero (serwer) - strona ODCZYTU monitora eksportu (`A05`).
 *
 * Odpowiada na jedno pytanie: czy każdy dzień lotny ma aktualny arkusz, a jeśli nie -
 * dlaczego. Dlatego lista jedzie z projekcji sesji, a nie z `export_log`: dzień bez ani
 * jednego wpisu w dzienniku jest tu najważniejszym wierszem, a nie brakiem danych.
 *
 * ══ ZAWĘŻENIE PO STANIE I LICZNIKI ROBI SQL, NIE TA KLASA (zmiana z 2026-08-01) ══
 * Do tej pory obie te rzeczy działy się tutaj, nad już zmapowaną tablicą, z uzasadnieniem
 * „stan jest wnioskiem mappera i ma mieć jedną definicję". Uzasadnienie było prawdziwe,
 * a skutek zły: tablica przychodziła OBCIĘTA `LIMIT`-em, więc zawężenie i liczby
 * opisywały okno, a nie zakres. Klub z 250 zamkniętymi dniami dostawał 200 najnowszych,
 * kafel „Bez karty" pokazywał 0, a `?state=missing` nie umiało znaleźć dnia z awarią
 * eksportu sprzed dziewięciu miesięcy. Monitor odpowiadał na swoje jedyne pytanie
 * („czy KAŻDY dzień ma arkusz") o dwustu dniach i milczał o reszcie.
 *
 * Ta klasa mapuje więc wiersze i przepisuje liczby, które adapter policzył nad całym
 * zakresem (`infrastructure/pg/admin/exportsRepo.ts`). Cena - dwa wyrażenia jednej
 * reguły - jest nazwana w obu plikach i pilnowana przez `test/adminExports.test.ts`.
 */

import type { Database, SheetsReadPort } from '../../common/ports.ts';
import type {
  AdminExportHistory,
  AdminExportListItem,
  AdminExportPage,
  AdminSheetPreview,
} from '../contracts/exports.ts';
import { exportListItem } from '../mappers/exportListItem.ts';
import type { ExportListFilter, ExportsAdminPort } from '../ports.ts';

export class AdminExportQueries {
  constructor(
    private readonly db: Database,
    private readonly exports: ExportsAdminPort,
    private readonly sheets: SheetsReadPort,
  ) {}

  async list(filter: ExportListFilter): Promise<AdminExportPage> {
    const { items, counts, matched } = await this.exports.list(this.db, filter);
    return {
      items: items.map(exportListItem),
      counts,
      matched,
      // Sygnał obcięcia jest JAWNY, a nie do policzenia przez klienta. Lista przycięta
      // po cichu jest najgorszym trybem awarii narzędzia nadzoru: wygląda na komplet.
      truncated: matched > items.length,
    };
  }

  /**
   * Pojedynczy wiersz monitora; `null` = nie ma takiej sesji w projekcji.
   *
   * Obsługuje DWA pytania trasy ponowienia: „czy ten adres w ogóle istnieje" (404 przed
   * dotknięciem eksportera - inaczej nieznany uuid odpowiadałby `no_events`, czyli
   * zdaniem o świecie zamiast o adresie) i „jak wygląda wiersz PO próbie", żeby panel
   * odświeżył go bez drugiego żądania.
   */
  async item(sessionUuid: string): Promise<AdminExportListItem | null> {
    const join = await this.exports.byUuid(this.db, sessionUuid);
    return join == null ? null : exportListItem(join);
  }

  /** Historia rewizji jednej karty; `null` = nie ma takiej sesji w projekcji. */
  async history(sessionUuid: string): Promise<AdminExportHistory | null> {
    const join = await this.exports.byUuid(this.db, sessionUuid);
    if (join == null) return null;

    const item = exportListItem(join);
    const revisions = await this.exports.history(this.db, sessionUuid);

    // `exported_sheets` trzyma WYŁĄCZNIE treść bieżącą (UPSERT po `tab`), więc ta liczba
    // jest zawsze 0 albo 1 - i o to chodzi. Zestawiona z długością `revisions` jest
    // jedynym miejscem, w którym widać, że dziennik i karta odpowiadają na dwa różne
    // pytania: „co i kiedy poszło" oraz „jak karta wygląda teraz".
    const sheet = item.tab == null ? null : await this.sheets.readDaySheet(item.tab);

    return {
      sessionUuid,
      tab: item.tab,
      state: item.state,
      revisions: revisions.map((revision) => ({
        revision: revision.revision,
        day: revision.day,
        sheetUrl: revision.sheetUrl,
        exportedAt: revision.exportedAt.toISOString(),
      })),
      sheetRows: sheet == null ? 0 : 1,
      // Jedzie razem z podglądem, bo to podgląd jest tu wprowadzany w błąd: gdy kartę
      // nadpisała inna sesja, `readDaySheet(tab)` oddaje TAMTEN dzień pracy pod nazwą
      // tego dnia. Bez tego pola rozwinięcie wyglądałoby na treść klikniętego wiersza.
      overwrittenBy: item.overwrittenBy,
    };
  }

  /**
   * Treść BIEŻĄCEJ karty sesji - podgląd `A05` bez opuszczania panelu.
   *
   * Istnieje obok `GET /sheets/:tab`, a nie zamiast niej, i to nie jest duplikat trasy.
   * Tamta jest celem linków `export_log.sheet_url` czytanych Z TELEFONU (nagłówek
   * `Bearer`, ekran 11). Panel loguje się ciasteczkiem `uzaero_admin` o `Path=/admin`,
   * które do `/sheets/*` po prostu NIE JEDZIE - poszerzenie ścieżki ciasteczka posłałoby
   * sesję panelu razem z każdym żądaniem telefonu, więc jest odwrotnością tego, co ma
   * osiągnąć. Panel pyta więc o kartę pod swoim prefiksem, a nazwę liczy serwer z sesji,
   * żeby nie było DRUGIEGO miejsca składającego `YYYY-MM-DD_SP-XXX`.
   *
   * `null` = nie ma takiej sesji ALBO karta nigdy nie powstała; trasa mapuje oba na 404,
   * bo z punktu widzenia czytelnika to jedna odpowiedź: tej karty nie ma.
   */
  async sheet(sessionUuid: string): Promise<AdminSheetPreview | null> {
    const join = await this.exports.byUuid(this.db, sessionUuid);
    if (join == null) return null;

    const tab = exportListItem(join).tab;
    if (tab == null) return null;

    const sheet = await this.sheets.readDaySheet(tab);
    if (sheet == null) return null;

    return { tab: sheet.tab, rows: sheet.rows, updatedAt: sheet.updatedAt.toISOString() };
  }
}
