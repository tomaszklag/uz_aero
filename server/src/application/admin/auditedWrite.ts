/**
 * UZ Aero (serwer) — JEDYNA droga zapisu panelu administracyjnego.
 *
 * Wymaganie brzmi: wpis do `admin_audit` powstaje w TEJ SAMEJ transakcji co skutek,
 * a napisanie komendy panelu BEZ śladu ma być niemożliwe — nie „odradzane".
 *
 * Mechanizm ma dwie połowy i żadna sama nie wystarcza:
 *
 *  1. **Ślad jest wartością ZWRACANĄ, nie wywołaniem obok.** `effect` musi oddać
 *     `Audited<T>`, więc pominięcie audytu jest błędem KOMPILACJI, a nie rzeczą do
 *     wyłapania na review. Nie da się oddać skutku bez wpisu — to cała sztuczka.
 *  2. **Komendy panelu nie dostają `Database` ani `Queryable` w konstruktorze.**
 *     Dostają `AuditedWrite` i porty odczytu. Bez uchwytu do bazy nie mają jak
 *     zapisać poza `run`. Pilnuje tego `test/architecture.test.ts` — kompilator
 *     tej reguły nie zna.
 *
 * Czym to się różni od „pamiętajmy, żeby logować":
 *
 * | „Pamiętajmy"                          | Ten mechanizm                              |
 * |---------------------------------------|--------------------------------------------|
 * | pominięcie widać w review (albo nie)  | pominięcie = błąd kompilacji                |
 * | log po commicie: skutek jest, śladu nie | jedna transakcja: rollback zabiera oba    |
 * | komenda może zapisać wprost przez `db` | komenda **nie ma** `db`                    |
 * | nowa komenda = nowa okazja do pomyłki | nowa komenda idzie tą bramą, bo innej nie ma |
 */

import type { Clock, Database, Queryable } from '../common/ports.ts';
import type { Actor, AdminAuditPort, AuditEntry } from './ports.ts';

/** Skutek + jego ślad. Nie da się oddać jednego bez drugiego. */
export interface Audited<T> {
  result: T;
  audit: AuditEntry;
}

export class AuditedWrite {
  constructor(
    private readonly db: Database,
    private readonly audit: AdminAuditPort,
    private readonly clock: Clock,
  ) {}

  /**
   * Wykonuje `effect` w transakcji i dopisuje jego ślad TĄ SAMĄ transakcją.
   *
   * Kolejność jest istotna w obie strony: skutek, którego nie udało się zaudytować,
   * zostaje wycofany (rollback zabiera oba), a wyjątek z `effect` nie zostawia wpisu
   * o operacji, która się nie zdarzyła. Dlatego przerwanie operacji z powodów
   * biznesowych (flaga już rozwiązana) realizujemy WYJĄTKIEM — zwrócenie wartości
   * nie umiałoby wycofać transakcji.
   *
   * Skutki UBOCZNE poza bazą (eksport karty dnia, wysyłka) nie mają tu wstępu:
   * należą do wołającego, PO commicie. Wciągnięcie ich do środka oznaczałoby, że
   * awaria Google cofa decyzję człowieka, która była poprawna niezależnie od tego,
   * czy karta się zapisała.
   */
  async run<T>(actor: Actor, effect: (tx: Queryable) => Promise<Audited<T>>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const { result, audit } = await effect(tx);
      await this.audit.append(tx, {
        ...audit,
        actorPilotId: actor.pilotId,
        actorRole: actor.role,
        ip: actor.ip,
        createdAt: this.clock.now(),
      });
      return result;
    });
  }
}
