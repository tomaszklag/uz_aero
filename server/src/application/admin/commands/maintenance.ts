/**
 * UZ Aero (serwer) — operacje serwisowe, które ZMIENIAJĄ stan (`A11-konserwacja.html`).
 *
 * Dwie komendy i dwie różne natury ryzyka:
 *
 *  1. **Przebudowa projekcji `sessions`** — odwracalna z definicji. `sessions` nie jest
 *     źródłem prawdy, tylko zrzutem `projectSession(events)`, więc każdy jej wiersz da
 *     się odtworzyć; skasowanie całej tabeli też nie zniszczyłoby informacji. Ryzyko
 *     leży w tym, CO ROBIMY Z WYNIKIEM PORÓWNANIA: niezerowa różnica to INCYDENT, a nie
 *     zadanie do sprzątnięcia — projekcja jest odświeżana w tej samej transakcji, w której
 *     przyjmujemy zdarzenia, więc w normalnej pracy różnicy być NIE MOŻE. Zapis wyrówna
 *     liczby i tym samym skasuje jedyny ślad po tym, co je rozjechało. Stąd wymóg powodu.
 *  2. **Sprzątanie wygasłych refresh tokenów** — jedyna operacja panelu, która naprawdę
 *     KASUJE dane. Stąd wymóg jawnego potwierdzenia W ŻĄDANIU (nie tylko w przeglądarce)
 *     i predykat `expires_at <= at` po stronie SQL-a.
 *
 * ══ CZEGO TU NIE MA ══
 * **Trybu `dry_run`.** Porównanie bez zapisu jest ZAPYTANIEM (`queries/maintenance.ts`)
 * i nie ma prawa dopisywać do `admin_audit` — dziennik nadzoru nie może opisywać rzeczy,
 * które się nie wydarzyły. Ocena jest wspólna (`../projectionScan.ts`), więc podgląd
 * i zapis nie mogą powiedzieć dwóch różnych rzeczy o tej samej bazie.
 *
 * **Ponowienia eksportu.** Kolejka na `A11` używa `AdminExportCommands.retry` z `A05` —
 * druga implementacja tej samej operacji byłaby gorsza niż brak drugiego przycisku.
 *
 * **Uruchamiania migracji.** Schemat wprowadza `migrate()` przy starcie serwera:
 * wdrożenie schematu jest wydaniem, nie akcją administratora.
 *
 * Konstruktor bez `Database`/`Queryable` — komenda nie ma jak zapisać z pominięciem
 * śladu audytu (`auditedWrite.ts`, `test/architecture.test.ts`).
 */

import type { Clock, EventsStorePort, SessionsProjectionPort } from '../../common/ports.ts';
import { sessionRowFrom } from '../../common/mappers/sessionRow.ts';
import type { RebuildReport, TokenPurgeReport } from '../contracts/maintenance.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor, MaintenanceAdminPort } from '../ports.ts';
import { scanProjections } from '../projectionScan.ts';

/**
 * Uchwyt do bazy TAKI, JAKI WRĘCZA `AuditedWrite` — typ wyprowadzony z jego sygnatury,
 * a nie zaimportowany z portów.
 *
 * Różnica jest merytoryczna, nie kosmetyczna. Komenda panelu nie ma prawa znać bazy
 * „skądinąd": `test/architecture.test.ts` wywala się, gdy plik w `commands/` importuje
 * `Database` albo `Queryable`, bo to jest druga połowa mechanizmu audytu (pierwsza to
 * `Audited<T>` wymuszony typem). Rozbicie długiej pętli na metody wymaga jednak nazwania
 * tego, co dostaliśmy WEWNĄTRZ bramy — i taki właśnie jest ten typ: „to, co wręczył
 * `AuditedWrite`", a nie „baza".
 */
type AuditedTx = Parameters<Parameters<AuditedWrite['run']>[1]>[0];

export interface RebuildInput {
  /**
   * Powód nadpisania; OBOWIĄZKOWY (A11: „Nadpisanie odblokowuje się dopiero po świeżym
   * porównaniu i podaniu powodu"), trafia WYŁĄCZNIE do audytu.
   */
  reason?: string;
}

export type RebuildOutcome =
  | { ok: true; report: RebuildReport }
  /** Zapis bez uzasadnienia — wada ŻĄDANIA, nie stanu świata. */
  | { ok: false; reason: 'reason_required' }
  /**
   * Nie ma ani jednej różnicy — więc nie ma operacji.
   *
   * ══ TO NIE JEST NADGORLIWOŚĆ, TYLKO TA SAMA ZASADA, CO PRZY PODGLĄDZIE ══
   * Nadpisanie zera wierszy niczego nie zmienia, a przechodząc przez `AuditedWrite`
   * zostawiałoby w `admin_audit` wpis „administrator przebudował projekcję" — czyli
   * dziennik nadzoru opisywałby rzecz, która się nie wydarzyła. Dokładnie z tego
   * powodu podgląd korekty (`A02b`) i porównanie projekcji nie idą przez bramę
   * audytu. Odmowa jest wariantem stanu ŚWIATA, nie wadą żądania — stąd 409 na trasie.
   *
   * Realny scenariusz, który to wywołuje: drugie kliknięcie „Nadpisz" zaraz po
   * pierwszym, udanym. Pierwsze wyrównało liczby, drugie nie ma czego wyrównać.
   */
  | { ok: false; reason: 'nothing_to_rebuild' };

/**
 * Sygnał przerwania transakcji. Musi być WYJĄTKIEM, bo tylko wyjątek wycofuje
 * transakcję `AuditedWrite.run` — zwrócenie wartości zostawiłoby wpis audytu
 * o operacji, która się nie zdarzyła (wzorzec `commands/flags.ts`). Poza ten plik
 * nie wychodzi: `rebuildProjections` łapie go i zamienia na wariant wyniku.
 */
class NothingToRebuild extends Error {}

/**
 * Jawne wyrażenie intencji, którego serwer wymaga przy jedynej operacji kasującej dane.
 *
 * ══ DLACZEGO SERWER, A NIE SAM PANEL ══
 * Mockup każe wpisać słowo w formularzu — i to jest bramka dla CZŁOWIEKA. Bramka dla
 * MASZYNY musi stać po stronie serwera, z tego samego powodu, dla którego rola nie
 * siedzi w tokenie: „panel bramkuje" znaczy „nie bramkuje nic", bo `POST` da się wysłać
 * bez panelu. Gołe żądanie bez tego pola jest odrzucane.
 *
 * Wartość jest MASZYNOWA, nie polska: serwer nie zna języka interfejsu (ta sama zasada,
 * co przy kodach akcji audytu). Tłumaczenie wpisanego „USUŃ" na ten token jest sprawą
 * panelu.
 */
export const PURGE_TOKENS_CONFIRMATION = 'prune_expired_tokens';

export interface PruneTokensInput {
  confirm?: string;
}

export type PruneTokensOutcome =
  | { ok: true; report: TokenPurgeReport }
  /** Brak jawnej intencji w żądaniu — wada ŻĄDANIA, nie stanu świata. */
  | { ok: false; reason: 'confirmation_required' };

/**
 * Ile uuidów sesji wchodzi do `admin_audit.details`. Liczby (ile wierszy, ile pól)
 * idą zawsze i w całości; lista jest przycięta, bo dziennik audytu ma być czytelny,
 * a nie być drugą kopią raportu. Pełny raport dostaje wołający.
 */
const AUDIT_UUID_LIMIT = 50;

export class AdminMaintenanceCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly maintenance: MaintenanceAdminPort,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
    private readonly clock: Clock,
  ) {}

  /**
   * Krok drugi z mockupu: „Przelicz i nadpisz projekcję".
   *
   * Różnice liczymy PONOWNIE, a nie przyjmujemy z podglądu, i to nie jest nadmiarowa
   * praca: między porównaniem a decyzją człowieka mija czas, w którym telefony dosyłają
   * paczki. Raport z podglądu opisywałby wtedy świat sprzed kilku minut, a wpis w audycie
   * — nadpisanie, którego nie było. Wołający dostaje liczby z chwili ZAPISU.
   */
  async rebuildProjections(actor: Actor, input: RebuildInput = {}): Promise<RebuildOutcome> {
    const reason = input.reason?.trim() ?? '';
    if (reason.length === 0) return { ok: false, reason: 'reason_required' };

    let report: RebuildReport;
    try {
      report = await this.write.run(actor, async (tx) => {
        const result = await this.rewriteDiffering(tx);
        return {
          result,
          audit: {
            action: 'maintenance.rebuild_projections' as const,
            // Celem jest CAŁA projekcja, nie pojedynczy wiersz — `targetId: null` mówi
            // to wprost, zamiast udawać, że akcja dotyczyła którejś sesji.
            targetType: 'projection',
            targetId: null,
            details: {
              mode: result.mode,
              sessions: result.sessions,
              rowsDiffering: result.rowsDiffering,
              fieldsDiffering: result.fieldsDiffering,
              written: result.written,
              // Ile sesji ZOSTAŁO na kolejny przebieg. Dziennik ma powiedzieć, że
              // ta przebudowa była częściowa — inaczej wpis „nadpisano 200" przy
              // 1291 rozjechanych wierszach czytałoby się jak komplet.
              remaining: result.remaining,
              sessionUuids: result.diffs.slice(0, AUDIT_UUID_LIMIT).map((d) => d.sessionUuid),
              reason,
            },
          },
        };
      });
    } catch (err) {
      if (err instanceof NothingToRebuild) return { ok: false, reason: 'nothing_to_rebuild' };
      throw err;
    }

    return { ok: true, report };
  }

  /**
   * Przeliczenie całego rejestru i nadpisanie wierszy, które się rozjechały.
   *
   * Nadpisujemy DOKŁADNIE te sesje, które opisuje raport (`scan.diffs`, najwyżej
   * `PROJECTION_DIFF_LIMIT`) — ani jednej więcej. Dzięki temu „co zapisano" i „co
   * widać w raporcie" jest jedną listą, a `remaining` znaczy jednocześnie „czego
   * raport nie wypisał" i „czego ten przebieg nie ruszył". Uzasadnienie samego
   * limitu stoi przy stałej (`../projectionScan.ts`).
   */
  private async rewriteDiffering(tx: AuditedTx): Promise<RebuildReport> {
    const scan = await scanProjections(tx, {
      maintenance: this.maintenance,
      events: this.events,
      sessions: this.sessions,
    });

    // Zero różnic = zero operacji. Wyjątek, a nie `return`: transakcja musi się
    // wycofać, żeby `AuditedWrite` nie dopisał śladu po niczym.
    if (scan.rowsDiffering === 0) throw new NothingToRebuild();

    let written = 0;
    for (const diff of scan.diffs) {
      if (await this.rewrite(tx, diff.sessionUuid)) written += 1;
    }

    return {
      mode: 'write',
      sessions: scan.sessions,
      rowsDiffering: scan.rowsDiffering,
      fieldsDiffering: scan.fieldsDiffering,
      written,
      remaining: scan.remaining,
      diffs: scan.diffs,
    };
  }

  /**
   * Nadpisanie JEDNEGO wiersza — z blokadą advisory i PONOWNYM odczytem strumienia.
   *
   * ══ KOLEJNOŚĆ JEST CAŁĄ TREŚCIĄ TEJ METODY ══
   * Blokada idzie PRZED odczytem, w tej samej transakcji. Bez tego przebudowa mogłaby
   * wyścignąć się z paczką, którą właśnie dosyła telefon: nasz strumień byłby sprzed jej
   * przyjęcia, a `upsert` cofnąłby liczby dnia PO CICHU — czyli narzędzie do wykrywania
   * dryfu samo by go tworzyło. To ta sama blokada i ten sam klucz (`hashtext(session_uuid)`),
   * co w `IngestCommands` i `AdminCorrectionCommands`, więc obie strony ustawiają się
   * w jednej kolejce.
   *
   * Blokujemy WYŁĄCZNIE sesje faktycznie nadpisywane — blokada na każdą sesję w bazie
   * trzymałaby tysiące wpisów do końca transakcji, czyli zatrzymywałaby ingest na czas
   * całego skanu. Samych nadpisywanych też nie może być dowolnie wiele: liczbę ogranicza
   * `PROJECTION_DIFF_LIMIT`, bo scenariusz, dla którego ta funkcja powstała (kolumny
   * dołożone migracją, zmiana reguły liczenia), rozjeżdża WSZYSTKIE sesje naraz —
   * uzasadnienie limitu stoi przy stałej.
   *
   * **Ograniczenie testowe, nazwane zamiast udawanego pokrycia:** PGlite ma JEDNO
   * połączenie, więc prawdziwej równoległości nie odtworzy i żaden test nie zobaczy tu
   * wyścigu. Testowalna jest kolejność (blokada przed odczytem, oba w jednej transakcji)
   * i tyle test przybija — dokładnie jak przy `ExportLogPort.lock` i `uq_export_log_card_revision`.
   */
  private async rewrite(tx: AuditedTx, sessionUuid: string): Promise<boolean> {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [sessionUuid]);
    const fresh = await this.events.sessionEvents(tx, sessionUuid);
    if (fresh.length === 0) return false;
    await this.sessions.upsert(tx, sessionRowFrom(sessionUuid, fresh));
    return true;
  }

  /**
   * Sprzątanie wygasłych refresh tokenów — JEDYNA operacja panelu, która kasuje dane.
   *
   * ══ CO TRAFIA DO DZIENNIKA, A CO NIGDY ══
   * Do `admin_audit.details` idzie liczba skasowanych wierszy i zakres dat wygaśnięcia
   * — nigdy same tokeny. Nie ma czego zapisać (w bazie leżą wyłącznie skróty SHA-256,
   * a wartości nie zna nawet serwer), ale reguła obowiązuje niezależnie od tego, co
   * akurat leży w kolumnie: `A09` wymienia tokeny na liście rzeczy, które nie opuszczają
   * swojej tabeli. To ta sama granica, co przy haśle startowym w `commands/pilots.ts`.
   *
   * `remainingValid` policzone PO skasowaniu, w tej samej transakcji, jest wykonywalną
   * postacią zdania z ekranu „żaden pilot nie zostanie przez to wylogowany".
   */
  async pruneRefreshTokens(
    actor: Actor,
    input: PruneTokensInput = {},
  ): Promise<PruneTokensOutcome> {
    if (input.confirm !== PURGE_TOKENS_CONFIRMATION) {
      return { ok: false, reason: 'confirmation_required' };
    }

    const at = this.clock.now();
    const report = await this.write.run(actor, async (tx) => {
      const purged = await this.maintenance.purgeExpiredRefreshTokens(tx, at);
      const result: TokenPurgeReport = {
        deleted: purged.deleted,
        oldestExpiredAt: purged.oldestExpiredAt?.toISOString() ?? null,
        newestExpiredAt: purged.newestExpiredAt?.toISOString() ?? null,
        remainingValid: purged.remainingValid,
        at: at.toISOString(),
      };

      return {
        result,
        audit: {
          action: 'maintenance.prune_tokens' as const,
          // Celem jest TABELA, nie konkretny pilot: czyszczenie nie wybiera właściciela
          // i wpis nie ma prawa sugerować, że kogoś dotyczyło bardziej niż innych.
          targetType: 'refresh_tokens',
          targetId: null,
          details: {
            deleted: result.deleted,
            expiredFrom: result.oldestExpiredAt,
            expiredTo: result.newestExpiredAt,
            remainingValid: result.remainingValid,
          },
        },
      };
    });

    return { ok: true, report };
  }
}
