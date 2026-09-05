/**
 * UZ Aero (serwer) - decyzje o zgłoszeniach rejestracyjnych: zatwierdzenie i odrzucenie
 * (logowanie Google, 2026-09-04; `docs/logowanie-google.md` §8).
 *
 * ══ ZATWIERDZENIE JEST ZAŁOŻENIEM KONTA ══
 * Nie „zmianą statusu z boku": w tej samej transakcji powstaje wiersz w `pilots`
 * (dokładnie tak, jak robi to `AdminPilotCommands.create`) i tożsamość zewnętrzna
 * dostaje `pilot_id`. Dopiero to drugie otwiera dostęp - brak wiersza w `pilots` był
 * bramą i przestaje nią być w jednym ruchu, albo wcale. Dlatego zdolność jest ta sama,
 * co przy kontach (`accounts.manage`), i dlatego nie ma tu własnej.
 *
 * ══ DECYZJA JEST JEDNA I NIEODWRACALNA ══
 * Zgłoszenie decyduje się WYŁĄCZNIE ze stanu `pending`; port wykonuje przejście
 * warunkowo (`... AND status = 'pending'`), więc dwie równoległe decyzje kończą się
 * jedną decyzją i jedną odmową `already_decided`, a nie dwoma kontami. Odrzuconego
 * zgłoszenia nie da się „odrzucić inaczej" ani zatwierdzić po fakcie: człowiek loguje
 * się jeszcze raz innym kontem (ekran `00d` mówi mu to wprost). Zmiana zdania
 * administratora to zwykłe założenie konta w A06 z tym samym e-mailem - i podpięcie
 * przy następnym logowaniu.
 *
 * Konstruktor bez `Database`/`Queryable` - jak każda komenda panelu, zapis wyłącznie
 * przez `AuditedWrite` (`test/architecture.test.ts`).
 */

import type { PilotRole } from '../../../domain/roles.ts';
import type { Clock, IdentityStatus } from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type {
  Actor,
  AdminPilotAccount,
  PilotsAdminPort,
  RegistrationsAdminPort,
} from '../ports.ts';
import { uniqueConflictField } from './pilots.ts';

export interface RegistrationKey {
  provider: string;
  subject: string;
}

export interface ApproveRegistrationInput extends RegistrationKey {
  code: string;
  name: string;
  role: PilotRole;
}

export interface RejectRegistrationInput extends RegistrationKey {
  /** WYMAGANY - trasa nie przepuszcza pustego, bo pilot czyta go na `00d`. */
  reason: string;
}

export type RegistrationOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; reason: 'not_found' }
  /** Zgłoszenie ma już decyzję - `status` mówi jaką. */
  | { ok: false; reason: 'already_decided'; status: IdentityStatus }
  /** Kod albo e-mail zajęty przez INNE konto - panel pokazuje, które pole. */
  | { ok: false; reason: 'conflict'; field: 'code' | 'email' };

/** Sygnały przerwania transakcji - wyjątki, bo tylko wyjątek wycofuje wpis audytu. */
class NotFound extends Error {}

class AlreadyDecided extends Error {
  constructor(readonly status: IdentityStatus) {
    super(`zgłoszenie ma już decyzję: ${status}`);
  }
}

class Conflict extends Error {
  constructor(readonly field: 'code' | 'email') {
    super(`pole ${field} jest już zajęte`);
  }
}

export class AdminRegistrationCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly registrations: RegistrationsAdminPort,
    private readonly pilots: PilotsAdminPort,
    /** `randomUUID` z composition rootu - ta sama decyzja, co w `commands/pilots.ts`. */
    private readonly newId: () => string,
    private readonly clock: Clock,
  ) {}

  async approve(
    actor: Actor,
    input: ApproveRegistrationInput,
  ): Promise<RegistrationOutcome<AdminPilotAccount>> {
    const at = this.clock.now();
    const id = this.newId();

    try {
      const account = await this.write.run(actor, async (tx) => {
        const pending = await this.registrations.find(tx, input.provider, input.subject);
        if (pending == null) throw new NotFound();
        if (pending.status !== 'pending') throw new AlreadyDecided(pending.status);

        // E-mail konta = e-mail z Google. To nie jest wygoda, tylko warunek spójności:
        // gdyby administrator wpisał inny adres, `pilots.email` przestałoby mówić,
        // którym kontem Google ten człowiek się loguje.
        const clash = await this.pilots.conflict(tx, {
          code: input.code,
          email: pending.email,
          exceptId: null,
        });
        if (clash != null) throw new Conflict(clash);

        const created: AdminPilotAccount = {
          id,
          code: input.code,
          name: input.name,
          email: pending.email,
          role: input.role,
          active: true,
        };
        await this.pilots.insert(tx, created);

        // Warunkowe przejście `pending → linked`: przegrana w wyścigu z drugą decyzją
        // wycofuje także wstawione konto, bo lecimy w jednej transakcji.
        const linked = await this.registrations.link(tx, input, id, actor.pilotId, at);
        if (!linked) throw new AlreadyDecided('linked');

        return {
          result: created,
          audit: {
            action: 'registration.approve',
            targetType: 'pilot',
            targetId: id,
            details: {
              code: created.code,
              name: created.name,
              email: created.email,
              role: created.role,
              provider: input.provider,
              subject: input.subject,
              // Imię z Google obok klubowego: za miesiąc to jedyny ślad, kim był
              // zgłaszający PRZED nadaniem kodu.
              googleName: pending.name,
            },
          },
        };
      });

      return { ok: true, result: account };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  async reject(actor: Actor, input: RejectRegistrationInput): Promise<RegistrationOutcome<void>> {
    const at = this.clock.now();

    try {
      await this.write.run(actor, async (tx) => {
        const pending = await this.registrations.find(tx, input.provider, input.subject);
        if (pending == null) throw new NotFound();
        if (pending.status !== 'pending') throw new AlreadyDecided(pending.status);

        const rejected = await this.registrations.reject(tx, input, input.reason, actor.pilotId, at);
        if (!rejected) throw new AlreadyDecided('rejected');

        return {
          result: undefined,
          audit: {
            action: 'registration.reject',
            targetType: 'registration',
            targetId: `${input.provider}:${input.subject}`,
            details: {
              email: pending.email,
              googleName: pending.name,
              reason: input.reason,
            },
          },
        };
      });

      return { ok: true, result: undefined };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  private asOutcome<T>(err: unknown): RegistrationOutcome<T> {
    if (err instanceof NotFound) return { ok: false, reason: 'not_found' };
    if (err instanceof AlreadyDecided) return { ok: false, reason: 'already_decided', status: err.status };
    if (err instanceof Conflict) return { ok: false, reason: 'conflict', field: err.field };
    // Wyścig o unikalność rozstrzygnięty przez bazę PO naszym sprawdzeniu - ten sam
    // rozpoznawacz, co przy zakładaniu konta z panelu.
    const field = uniqueConflictField(err);
    if (field != null) return { ok: false, reason: 'conflict', field };
    throw err;
  }
}
