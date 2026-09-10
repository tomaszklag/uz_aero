/**
 * Ninerdeck (serwer) - DECYZJE o zgłoszeniach kodem klubu: zatwierdzenie, odrzucenie,
 * cofnięcie odrzucenia (panel klubu, mockup `piloci-zgloszenie`;
 * `docs/wielofirmowosc.md` §3.8, §8.3; issue #100, D2).
 *
 * ══ TO JEST DRUGA POŁOWA JEDYNEJ DROGI DO KLUBU ══
 * Pierwszą napisał pilot: `POST /auth/join` z kodem klubu zakłada członkostwo `pending`
 * i na tym się kończy - kod nie daje dostępu, daje ZGŁOSZENIE (§3.8). Wejście do klubu
 * jest zawsze decyzją administratora klubu i ta decyzja mieszka tutaj. Dlatego dopiero
 * tu powstaje ślad audytu: zgłoszenie jest akcją pilota o sobie samym, przyjęcie - akcją
 * panelu o kimś innym.
 *
 * ══ TRZY KOMENDY, TRZY PRZEJŚCIA, KAŻDE W JEDNĄ STRONĘ ══
 *  • `approve`: `pending` → `active` z kodem pilota i rolą (aktywny ⟺ ma kod - CHECK
 *    `membership_active_has_code`);
 *  • `reject`: `pending` → `rejected` z powodem, który pilot czyta na 00D;
 *  • `reopen`: `rejected` → `pending`, czyli „decyzja była pomyłką, rozstrzygniemy
 *    jeszcze raz".
 *
 * Zatwierdzenie NIE przyjmuje `rejected` i to jest decyzja, nie przeoczenie: wpuszczenie
 * odrzuconego jednym ruchem pomijałoby chwilę, w której ktoś świadomie zdejmuje cudzą
 * odmowę. Droga jest dwustopniowa (cofnij → zatwierdź) i obie połowy mają własny wpis
 * w dzienniku, bo to dwie różne odpowiedzi na pytanie, kto wpuścił tego człowieka.
 *
 * ══ DEZAKTYWACJA CZŁONKOSTWA TU NIE MIESZKA ══
 * Jest w `commands/pilots.ts` (`setActive`) razem z guardem „ostatni administrator
 * klubu" i zrywaniem sesji - bo dotyczy CZŁONKA z listy, nie kandydata z kolejki.
 * Rozdział jest ten sam, co w kontraktach: kolejka i lista to dwa byty na ekranie.
 *
 * Konstruktor bez `Database`/`Queryable` - komenda nie ma jak zapisać z pominięciem
 * śladu audytu, bo nie ma uchwytu do bazy (`auditedWrite.ts`, `test/architecture.test.ts`).
 */

import { refuseApprove, type AccountRefusal } from '../../../domain/accountGuards.ts';
import type { MembershipStatus } from '../../../domain/memberships.ts';
import type { PilotRole } from '../../../domain/roles.ts';
import type { Clock } from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import { uniqueConflictOn } from './uniqueConflict.ts';
import type { Actor, AdminPilotAccount, PilotsAdminPort } from '../ports.ts';

export interface ApproveMembershipInput {
  code: string;
  role: PilotRole;
}

/** Stan członkostwa PO odrzuceniu albo cofnięciu odrzucenia - tyle, ile pokaże panel. */
export interface MembershipDecided {
  pilotId: string;
  status: MembershipStatus;
  decidedAt: Date | null;
  rejectReason: string | null;
}

/**
 * Uproszczony CQRS: odmowa jest WARIANTEM WYNIKU, nie wyjątkiem na granicy HTTP
 * (wzorzec `PilotOutcome`). Trasa mapuje wariant na status i niczego nie interpretuje.
 *
 * `wrong_status` niesie stan, który komenda NAPRAWDĘ zobaczyła: administrator z otwartą
 * szufladą nie wie, że drugi administrator rozstrzygnął to zgłoszenie minutę temu,
 * a „nie można" bez powiedzenia, co się stało, wygląda jak awaria.
 */
export type MembershipOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'wrong_status'; status: MembershipStatus }
  | { ok: false; reason: 'conflict'; field: 'code' }
  | { ok: false; reason: 'refused'; refusal: AccountRefusal };

/**
 * Sygnały przerwania transakcji. Muszą być WYJĄTKAMI, bo tylko wyjątek wycofuje
 * transakcję `AuditedWrite.run` - zwrócenie wartości zostawiłoby wpis audytu o decyzji,
 * która się nie zapisała. Poza ten plik nie wychodzą.
 */
class RequestNotFound extends Error {}

class WrongStatus extends Error {
  constructor(readonly status: MembershipStatus) {
    super(`członkostwo jest w stanie ${status}`);
  }
}

class CodeTaken extends Error {}

class Refused extends Error {
  constructor(readonly refusal: AccountRefusal) {
    super(`odmowa: ${refusal}`);
  }
}

export class AdminMembershipCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly pilots: PilotsAdminPort,
    private readonly clock: Clock,
  ) {}

  /**
   * ZATWIERDZENIE: kandydat staje się członkiem klubu z kodem i rolą.
   *
   * Populacji administratorów ta operacja nie blokuje (`lockAdminPopulation`) i nie ma
   * czego: zatwierdzenie wyłącznie DODAJE członka, także administratora, a blokada
   * szereguje mutacje, które tę populację ZMNIEJSZAJĄ (`commands/pilots.ts`).
   */
  async approve(
    actor: Actor,
    pilotId: string,
    input: ApproveMembershipInput,
  ): Promise<MembershipOutcome<AdminPilotAccount>> {
    try {
      const account = await this.write.run(actor, async (tx) => {
        const target = await this.pilots.decisionTarget(tx, actor.orgId, pilotId);
        if (target == null) throw new RequestNotFound();
        if (target.status !== 'pending') throw new WrongStatus(target.status);

        const refusal = refuseApprove({ active: target.personActive });
        if (refusal != null) throw new Refused(refusal);

        // Pytamy WYŁĄCZNIE o kod: e-mail tej osoby już jest w tym klubie (to jej
        // zgłoszenie), więc sprawdzanie go odpowiadałoby na pytanie o kolizję z samą
        // sobą. Kod jest jedyny w klubie (`idx_memberships_code`).
        const clash = await this.pilots.conflict(tx, actor.orgId, {
          code: input.code,
          email: null,
          exceptId: pilotId,
        });
        if (clash != null) throw new CodeTaken();

        await this.pilots.approve(tx, actor.orgId, pilotId, {
          code: input.code,
          role: input.role,
          at: this.clock.now(),
          by: actor.pilotId,
        });

        const member: AdminPilotAccount = {
          id: pilotId,
          orgId: actor.orgId,
          code: input.code,
          name: target.name,
          email: target.email,
          active: true,
          role: input.role,
        };

        return {
          result: member,
          audit: {
            action: 'membership.approve' as const,
            targetType: 'pilot',
            targetId: pilotId,
            // KOMPLET tożsamości z Google plus to, co administrator nadał. Wiersz
            // kolejki po decyzji znika z ekranu, więc ten wpis jest jedynym miejscem,
            // z którego widać, KOGO wpuszczono i na jakich prawach.
            details: {
              code: member.code,
              name: member.name,
              email: member.email,
              role: member.role,
              requestedAt: target.requestedAt.toISOString(),
            },
          },
        };
      });

      return { ok: true, result: account };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  /**
   * ODRZUCENIE z powodem WYMAGANYM (walidacja trasy).
   *
   * Powód nie jest formalnością: pilot czyta go na swoim telefonie (00D) i to jest
   * jedyna wiadomość, jaką dostaje - „odmówiono" bez słowa zostawiałoby go z pytaniem,
   * czy to pomyłka, czy zasada. Odrzucenie nie zrywa żadnych sesji, bo nigdy nie było
   * czego zerwać: członkostwo `pending` nie wydaje tokenów klubu.
   */
  async reject(
    actor: Actor,
    pilotId: string,
    reason: string,
  ): Promise<MembershipOutcome<MembershipDecided>> {
    try {
      const decided = await this.write.run(actor, async (tx) => {
        const target = await this.pilots.decisionTarget(tx, actor.orgId, pilotId);
        if (target == null) throw new RequestNotFound();
        if (target.status !== 'pending') throw new WrongStatus(target.status);

        const at = this.clock.now();
        await this.pilots.reject(tx, actor.orgId, pilotId, { reason, at, by: actor.pilotId });

        return {
          result: {
            pilotId,
            status: 'rejected' as MembershipStatus,
            decidedAt: at,
            rejectReason: reason,
          },
          audit: {
            action: 'membership.reject' as const,
            targetType: 'pilot',
            targetId: pilotId,
            details: { name: target.name, email: target.email, reason },
          },
        };
      });

      return { ok: true, result: decided };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  /** COFNIĘCIE ODRZUCENIA: `rejected` → `pending`, powód gaśnie (patrz port `reopen`). */
  async reopen(actor: Actor, pilotId: string): Promise<MembershipOutcome<MembershipDecided>> {
    try {
      const decided = await this.write.run(actor, async (tx) => {
        const target = await this.pilots.decisionTarget(tx, actor.orgId, pilotId);
        if (target == null) throw new RequestNotFound();
        if (target.status !== 'rejected') throw new WrongStatus(target.status);

        await this.pilots.reopen(tx, actor.orgId, pilotId);

        return {
          result: {
            pilotId,
            status: 'pending' as MembershipStatus,
            decidedAt: null,
            rejectReason: null,
          },
          audit: {
            action: 'membership.reopen' as const,
            targetType: 'pilot',
            targetId: pilotId,
            details: { name: target.name, email: target.email },
          },
        };
      });

      return { ok: true, result: decided };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  /** Wyjątek przerwania transakcji → wariant wyniku. Nieznany błąd leci dalej. */
  private asOutcome<T>(err: unknown): MembershipOutcome<T> {
    if (err instanceof RequestNotFound) return { ok: false, reason: 'not_found' };
    if (err instanceof WrongStatus) return { ok: false, reason: 'wrong_status', status: err.status };
    if (err instanceof CodeTaken) return { ok: false, reason: 'conflict', field: 'code' };
    if (err instanceof Refused) return { ok: false, reason: 'refused', refusal: err.refusal };

    // Przegrany wyścig o unikalność kodu to TA SAMA odpowiedź, co sprawdzenie przed
    // zapisem: 409 z nazwą pola, nie 500 („coś się zepsuło") na zdarzenie, które ma
    // gotowe wyjaśnienie i gotowy formularz do poprawienia.
    if (uniqueConflictOn(err, ['code'] as const) != null) {
      return { ok: false, reason: 'conflict', field: 'code' };
    }

    throw err;
  }
}
