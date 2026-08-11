/**
 * UZ Aero (serwer) — komendy cyklu życia flagi (panel, mockup `A03a-flaga.html`).
 *
 * To pierwszy pionowy przekrój panelu i wzorzec dla następnych. Domyka też §4.7:
 * do dziś otwarta flaga `aircraft_overlap` (dawniej `session_overlap`) blokowała kartę dnia BEZTERMINOWO, bo
 * w całym `server/src` nie było kodu ustawiającego `status='resolved'` — jedynym
 * odblokowaniem był ręczny `UPDATE` w bazie.
 *
 * **Rozwiązanie flagi to komentarz i zmiana statusu, nigdy edycja danych.** Rejestr
 * `events` jest append-only i ta komenda go NIE DOTYKA. Jeżeli błędna jest sama
 * liczba, poprawia ją nowe zdarzenie `event_correction` (ekran A02b, przekrój 3),
 * a oryginał zostaje w rejestrze na zawsze.
 *
 * Konstruktor niesie całą regułę audytu: `AuditedWrite` zamiast `Database`. Komenda
 * NIE MA jak zapisać czegokolwiek z pominięciem śladu, bo nie ma uchwytu do bazy.
 */

import type { DayExporter, ExportOutcome } from '../../common/export/dayExporter.ts';
import type { Clock } from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor, AdminFlag, FlagsAdminPort, ResolvedFlag } from '../ports.ts';

/**
 * Próba re-eksportu karty jednej z sesji, których dotyczyła flaga.
 *
 * `outcome: null` znaczy „eksport rzucił" — awarię arkuszy łapiemy tak samo jak
 * ingest (§4.7: karta to SKUTEK, nie warunek). Flaga jest wtedy rozwiązana, a panel
 * musi to pokazać uczciwie: 500 sugerowałoby, że decyzja się nie zapisała, a milczące
 * `exports: []` — że karty w ogóle nie próbowano odblokować.
 */
export interface ExportAttempt {
  sessionUuid: string;
  outcome: ExportOutcome | null;
}

export interface ResolveFlagResult {
  flagId: number;
  type: ResolvedFlag['type'];
  resolvedAt: Date;
  exports: ExportAttempt[];
}

/**
 * Uproszczony CQRS repo: komenda zwraca WYNIK, a odmowa jest jego wariantem, nie
 * wyjątkiem (wzorzec `IngestOutcome`). Trasa mapuje wariant na status i nic nie
 * interpretuje.
 */
export type ResolveFlagOutcome =
  | { ok: true; result: ResolveFlagResult }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'already_resolved'; flag: AdminFlag };

/**
 * Sygnały przerwania transakcji. Muszą być WYJĄTKAMI, bo tylko wyjątek wycofuje
 * transakcję `AuditedWrite.run` — zwrócenie wartości zostawiłoby wpis audytu
 * o operacji, która się nie zdarzyła. Poza ten plik nie wychodzą: `resolve` łapie
 * je i zamienia na warianty `ResolveFlagOutcome`.
 */
class FlagNotFound extends Error {}

class FlagAlreadyResolved extends Error {
  constructor(readonly flag: AdminFlag) {
    super('flaga jest już rozwiązana');
  }
}

export class AdminFlagCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly flags: FlagsAdminPort,
    private readonly exporter: DayExporter,
    private readonly clock: Clock,
  ) {}

  async resolve(actor: Actor, id: number, note: string): Promise<ResolveFlagOutcome> {
    const at = this.clock.now();

    let closed: ResolvedFlag;
    try {
      // 1) TRANSAKCJA: zamknięcie flagi + ślad audytu. Nic więcej — żaden skutek
      //    poza bazą nie ma prawa zależeć od tego, czy transakcja przejdzie.
      closed = await this.write.run(actor, async (tx) => {
        const done = await this.flags.resolve(tx, id, actor.pilotId, note, at);
        if (done == null) {
          // `resolve` zwraca `null` z dwóch powodów naraz (nie ma flagi / nie jest
          // otwarta), a panel potrzebuje ich rozróżnić: 404 to pomyłka w adresie,
          // 409 to przegrany wyścig, po którym warto pokazać CZYJE rozstrzygnięcie
          // było pierwsze. Odczyt siedzi w tej samej transakcji, więc widzi stan,
          // o który właśnie się potknął `UPDATE`.
          const current = await this.flags.byId(tx, id);
          throw current == null ? new FlagNotFound() : new FlagAlreadyResolved(current);
        }
        return {
          result: done,
          audit: {
            action: 'flag.resolve',
            targetType: 'flag',
            targetId: String(id),
            // Komentarz idzie do AUDYTU, nie do rejestru zdarzeń: rejestr opisuje
            // lot, a nie motywację człowieka przy biurku (ta sama granica, co przy
            // stanie banerów edu). W tabeli `flags` zostaje jako `resolution_note`,
            // bo skrzynka pokazuje go w historii rozwiązanych.
            details: { note, type: done.type, sessionUuids: done.sessionUuids },
          },
        };
      });
    } catch (err) {
      if (err instanceof FlagNotFound) return { ok: false, reason: 'not_found' };
      if (err instanceof FlagAlreadyResolved) {
        return { ok: false, reason: 'already_resolved', flag: err.flag };
      }
      throw err;
    }

    // 2) PO COMMICIE: karty, które ta flaga blokowała. Kolejność jest tu regułą,
    //    nie stylem — eksport przed commitem utrwaliłby w dokumencie klubu dzień
    //    opisany stanem, który mógł się nie zapisać.
    return {
      ok: true,
      result: { flagId: id, type: closed.type, resolvedAt: at, exports: await this.reexport(closed) },
    };
  }

  /**
   * Re-eksport WYŁĄCZNIE dla `aircraft_overlap` — bo tylko ten typ jest bramką
   * w `DayExporter`. Rozwiązanie `mh_gap` czy `mh_regression` niczego nie odblokowuje
   * i udawanie inaczej myliłoby panel (odpowiedź z „rewizja 2" po akcji, która na
   * kartę nie wpłynęła, uczy nieufności do narzędzia).
   *
   * Sesja objęta DWIEMA nakładkami nie wymaga tu żadnej logiki: druga, wciąż otwarta
   * flaga zatrzyma eksportera na jego własnej bramce i wróci `overlap_flag`.
   */
  private async reexport(closed: ResolvedFlag): Promise<ExportAttempt[]> {
    if (closed.type !== 'aircraft_overlap') return [];

    const attempts: ExportAttempt[] = [];
    for (const sessionUuid of closed.sessionUuids) {
      try {
        attempts.push({ sessionUuid, outcome: await this.exporter.exportSession(sessionUuid) });
      } catch (err) {
        console.error(`re-eksport karty sesji ${sessionUuid} nie powiódł się:`, err);
        attempts.push({ sessionUuid, outcome: null });
      }
    }
    return attempts;
  }
}
