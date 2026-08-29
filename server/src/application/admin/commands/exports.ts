/**
 * UZ Aero (serwer) - ręczne ponowienie eksportu karty dnia (panel, mockup
 * `A05-eksporty.html`).
 *
 * ══ PO CO TA KOMENDA ISTNIEJE ══
 * §4.7: karta jest SKUTKIEM przyjęcia zdarzeń, nigdy warunkiem. Telefon dostaje 200,
 * zanim karta powstanie, więc awaria eksportu niczego pilotowi nie cofa - i właśnie
 * dlatego zostawia po sobie dzień bez arkusza, o którym nikt się nie dowie. Ta komenda
 * jest jedyną drogą, którą człowiek może taki dzień dopchnąć do dokumentu klubu bez
 * wchodzenia do bazy.
 *
 * ══ CZEGO TA KOMENDA NIE ROBI ══
 * **Nie omija bramek eksportera.** Otwarta flaga `aircraft_overlap`, dzień bez
 * `day_close`, sesja bez preflightu - każda z nich odmówi tak samo, jak przy eksporcie
 * automatycznym. Ponowienie jest powtórzeniem tej samej operacji, a nie jej wersją
 * uprzywilejowaną; „ponów mimo flagi" byłoby obejściem §4.7 pod przyciskiem.
 *
 * ══ DLACZEGO EKSPORT JEST PRZED ŚLADEM, A NIE PO ══
 * We wszystkich pozostałych komendach panelu kolejność jest odwrotna: transakcja ze
 * skutkiem i śladem, a eksport dopiero po commicie (`commands/flags.ts`). Tam skutek
 * jest w bazie panelu (status flagi), więc audyt ma co opisać niezależnie od arkusza.
 * **Tutaj eksport JEST całym skutkiem** - nie ma nic innego do zapisania. Wpis, który
 * powstałby przed próbą, nie mógłby nieść ani rewizji „po", ani powodu odmowy, czyli
 * nie odpowiadałby na jedyne pytanie, które się przy nim zadaje: „i co z tego wyszło".
 *
 * Ryzyko odwrócenia jest nazwane i przyjęte: gdyby zapis śladu padł po udanym eksporcie,
 * karta byłaby nadpisana bez wiersza w `admin_audit`. Fakt nie ginie - `export_log` jest
 * append-only i ma wtedy nową rewizję ze stemplem czasu; brakuje wyłącznie tożsamości
 * człowieka. Odwrotna kolejność wymieniałaby ten wąski przypadek na dziennik, w którym
 * KAŻDY wpis o ponowieniu mówi „nie wiadomo, czy się udało".
 *
 * Konstruktor bez `Database`/`Queryable` - komenda nie ma jak zapisać z pominięciem
 * śladu, bo nie ma uchwytu do bazy (`auditedWrite.ts`, `test/architecture.test.ts`).
 */

import { SheetsAdapterError, type DayExporter, type ExportOutcome } from '../../common/export/dayExporter.ts';
import type { Clock } from '../../common/ports.ts';
import type { AdminExportRetryResult, ExportFailureDto } from '../contracts/exports.ts';
import { exportListItem } from '../mappers/exportListItem.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor, ExportsAdminPort } from '../ports.ts';

export class AdminExportCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly exports: ExportsAdminPort,
    private readonly exporter: DayExporter,
    private readonly clock: Clock,
  ) {}

  /**
   * Ponowienie dla sesji, o której trasa już wie, że istnieje (404 zapada wcześniej,
   * bo eksport nieistniejącej sesji odpowiedziałby `no_events` - czyli zdaniem o świecie
   * zamiast o adresie).
   *
   * Odmowa NIE jest wyjątkiem i nie przerywa niczego: ślad w dzienniku ma powstać
   * również wtedy, gdy nic się nie wysłało. „Administrator próbował o 14:22 i odbił się
   * o flagę #1046" jest odpowiedzią na pytanie „dlaczego ten dzień dalej stoi", a wpis
   * wyłącznie po sukcesach zostawiałby to pytanie bez odpowiedzi.
   */
  async retry(actor: Actor, sessionUuid: string): Promise<AdminExportRetryResult> {
    const { outcome, failure } = await this.attempt(sessionUuid);
    const at = this.clock.now();

    return this.write.run(actor, async (tx) => {
      // Stan PO próbie - czytany w transakcji śladu, więc opisuje dokładnie to, co
      // dziennik za chwilę utrwali.
      const after = await this.exports.byUuid(tx, sessionUuid);
      const item = after == null ? null : exportListItem(after);

      // Rewizje są kolejne z konstrukcji (`previous + 1` w `DayExporter`), więc numer
      // poprzedniej wynika z nowej i nie wymaga drugiego odczytu sprzed eksportu -
      // takiego odczytu i tak nie dałoby się zrobić w tej samej transakcji, bo eksport
      // już się wydarzył. `0` znaczy „karty wcześniej nie było" i jedzie jako `null`.
      const succeeded = outcome?.exported === true ? outcome : null;
      const revisionBefore = succeeded
        ? nullIfZero(succeeded.revision - 1)
        : (item?.revision ?? null);
      const revisionAfter = succeeded ? succeeded.revision : (item?.revision ?? null);
      const tab = succeeded ? succeeded.tab : (item?.tab ?? null);

      return {
        result: {
          sessionUuid,
          tab,
          revisionBefore,
          revisionAfter,
          outcome,
          failure,
          retriedAt: at.toISOString(),
        },
        audit: {
          action: 'export.retry',
          // Celem jest KARTA, nie sesja: dziennik ma się dać zawęzić do „co robiono
          // z arkuszem 2026-07-30_SP-ABC" (`A09` filtruje po `targetType`/`targetId`).
          // Sesja i tak jedzie w `details`, więc żadne z dwóch pytań nie zostaje bez
          // adresu. `targetId: null` przy sesji bez preflightu - karty nie da się nazwać.
          targetType: 'sheet',
          targetId: tab,
          details: {
            sessionUuid,
            revisionBefore,
            revisionAfter,
            // Wynik TEJ próby, wypisany wprost: przy odmowie jest to jedyna treść wpisu,
            // a przy sukcesie mówi, co dokładnie poszło do arkusza.
            //
            // Treści POPRZEDNIEGO błędu tu nie ma i nie da się jej dopisać: nieudany
            // eksport nie zostawia śladu NIGDZIE. Wiersz `export_log` powstaje dopiero
            // po udanym zapisie karty (odwrotna kolejność pokazywałaby na ekranie 11
            // link do arkusza, którego nie ma), a tabeli kolejki ponowień system nie ma.
            // Mockup wymienia „numer próby" i `sheets_write_timeout` - to jest opis
            // kolejki ponowień z `A11`, czyli osobnej decyzji, a nie pola do wypełnienia.
            outcome,
            // RODZAJ awarii, gdy próba rzuciła. W dzienniku nadzoru robi różnicę między
            // „Google nie odpowiadał" a „nasz kod się wywalił" - bez tego oba wpisy
            // wyglądają identycznie (`outcome: null`) i nie da się ich po latach
            // rozróżnić ani policzyć.
            failure,
          },
        },
      };
    });
  }

  /**
   * Próba eksportu, w której AWARIA jest wynikiem, a nie wyjątkiem - ale awarią
   * NAZWANĄ, a nie „czymś".
   *
   * `outcome: null` znaczy „eksport rzucił" - dokładnie jak `ExportAttempt.outcome`
   * przy rozwiązaniu flagi. Bez tego niedostępny Google (albo padnięta baza kart)
   * kończyłby ponowienie pięćsetką, czyli komunikatem „coś poszło nie tak" w jedynym
   * narzędziu, które istnieje po to, żeby powiedzieć, CO poszło nie tak.
   *
   * ══ DLACZEGO NIE JEDEN `catch` NA WSZYSTKO (poprawka 2026-08-01) ══
   * Bo do tej pory był jeden i łapał KAŻDY wyjątek, a panel nazywał każdy „Adapter
   * arkuszy zgłosił awarię - spróbuj ponownie za chwilę". Awaria transportu do arkusza
   * faktycznie mija sama; `TypeError` w `buildDaySheet`, uszkodzony strumień zdarzeń
   * i przegrany wyścig rewizji (`23505`) nie mijają, a administrator dostawał zdanie,
   * które kazało mu czekać. Błąd programistyczny udający znany tryb awarii jest gorszy
   * niż pięćsetka, bo nie zostawia nawet zdziwienia.
   *
   * Nieoczekiwany błąd dalej NIE przerywa ponowienia - ślad w dzienniku audytu ma
   * powstać także wtedy (a zwłaszcza wtedy). Zmienia się to, co panel o nim mówi, i to,
   * co zostaje w `details`.
   */
  private async attempt(
    sessionUuid: string,
  ): Promise<{ outcome: ExportOutcome | null; failure: ExportFailureDto | null }> {
    try {
      return { outcome: await this.exporter.exportSession(sessionUuid), failure: null };
    } catch (err) {
      const failure: ExportFailureDto =
        err instanceof SheetsAdapterError ? 'sheets_adapter' : 'unexpected';
      console.error(
        `ponowienie eksportu karty sesji ${sessionUuid} nie powiodło się (${failure}):`,
        err,
      );
      return { outcome: null, failure };
    }
  }
}

/** Rewizja 0 nie istnieje - to zapis „karty wcześniej nie było", więc `null`. */
const nullIfZero = (value: number): number | null => (value === 0 ? null : value);
