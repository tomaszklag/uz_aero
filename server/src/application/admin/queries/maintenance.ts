/**
 * UZ Aero (serwer) - ODCZYTOWA strona ekranu konserwacji (`A11-konserwacja.html`).
 *
 * ══ TO SĄ ZAPYTANIA, NIE KOMENDY - I TO JEST NAJWAŻNIEJSZE ZDANIE TEGO PLIKU ══
 * Żadne z nich nie przechodzi przez `AuditedWrite`, więc żadne nie ma jak zapisać ani
 * jak dopisać wiersza do `admin_audit`. Dotyczy to zwłaszcza `compareProjections`,
 * które do 2026-08-02 było trybem KOMENDY i zostawiało ślad także wtedy, gdy niczego
 * nie zapisało.
 *
 * Powód zmiany jest ten sam, co przy podglądzie korekty (`queries/corrections.ts`):
 * brama `AuditedWrite` wymusza w typie wpis do dziennika, a dziennik nadzoru nie może
 * opisywać rzeczy, które się nie wydarzyły. „Administrator porównał projekcję" nie jest
 * zmianą w systemie - a wpis o tym rozmywa jedyny dokument odpowiadający na pytanie
 * „kto co zmienił". Cena jest nazwana wprost: informacja „ktoś sprawdził i się zgadzało"
 * przestaje być odtwarzalna z dziennika. Ekran `A11` mówi to wprost, zamiast obiecywać
 * ślad, którego nie ma.
 *
 * Stąd konstruktor bez `AuditedWrite` - zero zapisów, zero wpisów, zero skutków ubocznych.
 */

import { REFRESH_TTL_DAYS } from '../../common/commands/auth.ts';
import type {
  Clock,
  Database,
  EventsStorePort,
  SessionsProjectionPort,
} from '../../common/ports.ts';
import type {
  RebuildReport,
  RefreshTokenScanDto,
  SchemaStateDto,
} from '../contracts/maintenance.ts';
import type { MaintenanceAdminPort } from '../ports.ts';
import { scanProjections } from '../projectionScan.ts';

export class AdminMaintenanceQueries {
  constructor(
    private readonly db: Database,
    private readonly maintenance: MaintenanceAdminPort,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
    private readonly clock: Clock,
  ) {}

  /**
   * Krok pierwszy z mockupu: „Przelicz i porównaj - bez zapisu".
   *
   * Blokady advisory tu NIE MA i to jest zamierzone: bez zapisu nie ma czego chronić
   * przed lost update, a zablokowanie tysięcy sesji na czas pełnego skanu zatrzymałoby
   * przyjmowanie zdarzeń z telefonów. Skutek uboczny jest nazwany: raport opisuje stan
   * z chwili odczytu, więc paczka przyjęta w trakcie skanu może pokazać się jako
   * różnica, której już nie ma. Dlatego zapis liczy różnice PONOWNIE, pod blokadą
   * (`commands/maintenance.ts`), zamiast ufać liczbom z podglądu.
   */
  async compareProjections(): Promise<RebuildReport> {
    const scan = await scanProjections(this.db, {
      maintenance: this.maintenance,
      events: this.events,
      sessions: this.sessions,
    });

    return {
      mode: 'dry_run',
      sessions: scan.sessions,
      rowsDiffering: scan.rowsDiffering,
      fieldsDiffering: scan.fieldsDiffering,
      // Zawsze zero - i to nie jest wartość domyślna do wypełnienia później: ta droga
      // nie ma czym zapisać.
      written: 0,
      // Ile różnic nie zmieściło się w raporcie (`PROJECTION_DIFF_LIMIT`). Liczby wyżej
      // opisują CAŁY rejestr, więc bez tego pola lista wyglądałaby na komplet - czyli
      // dokładnie tak, jak przycięta lista na `A05` przed poprawką z 2026-08-01.
      remaining: scan.remaining,
      diffs: scan.diffs,
    };
  }

  /** Stan tabeli `refresh_tokens` PRZED czyszczeniem - same liczby i daty. */
  async refreshTokens(): Promise<RefreshTokenScanDto> {
    const at = this.clock.now();
    const scan = await this.maintenance.scanRefreshTokens(this.db, at);

    return {
      total: scan.total,
      expired: scan.expired,
      valid: scan.valid,
      oldestExpiredAt: scan.oldestExpiredAt?.toISOString() ?? null,
      newestExpiredAt: scan.newestExpiredAt?.toISOString() ?? null,
      at: at.toISOString(),
      ttlDays: REFRESH_TTL_DAYS,
    };
  }

  /** Stan schematu: co zna kod, co odnotowała baza i kiedy. */
  async schema(): Promise<SchemaStateDto> {
    const { version, rows } = await this.maintenance.schemaMigrations(this.db);
    const applied = rows.filter((row) => row.appliedAt != null);

    return {
      schemaVersion: version,
      applied: applied.length,
      // Niezerowe = baza jest STARSZA niż kod, który ją obsługuje. Stan możliwy
      // wyłącznie po awarii runnera w starcie; ekran nazywa go wprost, zamiast
      // pokazywać „6 / 6" nad tabelą z dziurą.
      pending: rows.length - applied.length,
      lastAppliedAt: applied.at(-1)?.appliedAt?.toISOString() ?? null,
      migrations: rows.map((row) => ({
        version: row.version,
        title: row.title,
        appliedAt: row.appliedAt?.toISOString() ?? null,
        applied: row.appliedAt != null,
      })),
    };
  }
}
