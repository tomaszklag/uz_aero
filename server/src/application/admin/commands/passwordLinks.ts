/**
 * Ninerdeck (serwer) - link „ustaw hasło" WYSYŁANY Z PANELU (2.1.0, `docs/logowanie-haslem.md`
 * §5.4; issue #132 B6/B7): przycisk administratora w karcie członka (mockup `piloci-konto`)
 * i zaproszenie pierwszego administratora klubu przez superadministratora
 * (`organizacje-klub`: przy założeniu klubu i „Wyślij ponownie").
 *
 * ══ TEN SAM LIST, INNY PUNKT WYZWOLENIA ══
 * Decyzja właściciela (2026-09-16): działanie administratora ma być DOKŁADNIE tym, co
 * kliknięcie „Nie pamiętam hasła" - tylko ktoś inny naciska przycisk. Dlatego token i list
 * składa `PasswordCommands` (`issueLink` + `deliver`), a ta komenda dokłada wyłącznie to,
 * czego tamta droga nie ma: bramę zdolności (przez trasę), zakres (członek SWOJEGO klubu /
 * administrator TEGO klubu) i wpis w dzienniku audytu `password.link_sent`. Panel nie
 * dostaje linku ani kodu - żadne pole odpowiedzi go nie niesie (§8 pkt 4).
 *
 * ══ KOLEJNOŚĆ: TOKEN I AUDYT W TRANSAKCJI, LIST PO COMMICIE ══
 * Skutek uboczny poza bazą nie ma wstępu do `AuditedWrite` (jego docblock): awaria poczty
 * nie ma prawa cofnąć wpisu, a wpis „list wysłano" przy tokenie, który istnieje, jest
 * prawdą o decyzji administratora. Gdy poczta padnie, trasa mówi `502 mail_failed`
 * i administrator klika „Wyślij ponownie" - nowy token zużywa poprzedni.
 *
 * W transakcji czyta się WYŁĄCZNIE przez `tx` (`byId` członka, klub z administratorami):
 * odczyt cudzym uchwytem w otwartej transakcji PGlite czeka na jej koniec - i tak
 * wyglądał pierwszy przebieg tego kodu (limit czasu testu zamiast odpowiedzi).
 *
 * Konstruktor bez `Database`/`Queryable`, jak każda komenda panelu (`architecture.test.ts`).
 */

import {
  AdminSendLimited,
  EmailRequired,
  INVITE_LINK_TTL_MS,
  RESET_LINK_TTL_MS,
  type IssuedLink,
  type PasswordCommands,
} from '../../common/commands/passwords.ts';
import type { Audited, AuditedWrite } from '../auditedWrite.ts';
import type { Actor, OrganizationsPlatformPort, PilotsAdminPort, PlatformActor } from '../ports.ts';

export interface PasswordLinkSent {
  sentTo: string;
  expiresAt: Date;
}

export type PasswordLinkOutcome =
  | { ok: true; result: PasswordLinkSent }
  | { ok: false; reason: 'not_found' | 'email_required' | 'mail_failed' }
  | { ok: false; reason: 'rate_limited'; retryAfterSec: number };

class NotFound extends Error {}

export class AdminPasswordLinkCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly members: PilotsAdminPort,
    private readonly organizations: OrganizationsPlatformPort,
    private readonly passwords: PasswordCommands,
  ) {}

  /** Administrator klubu → członek SWOJEGO klubu (`accounts.manage`), 60 min. */
  async sendToMember(actor: Actor, pilotId: string): Promise<PasswordLinkOutcome> {
    return this.run(async (tx) => {
      // Zakres klubu: `byId` widzi wyłącznie członków klubu aktora - cudzy pilot jest
      // dla niego nieistniejący (404, jak każda cudza rzecz od epiku C).
      const member = await this.members.byId(tx, actor.orgId, pilotId);
      if (member == null) throw new NotFound();

      const link = await this.passwords.issueLink(tx, {
        pilotId,
        email: member.email,
        triggeredBy: 'admin',
        createdBy: actor.pilotId,
        ttlMs: RESET_LINK_TTL_MS,
      });
      return {
        result: { link, invite: null },
        audit: {
          action: 'password.link_sent' as const,
          targetType: 'pilot',
          targetId: pilotId,
          details: { triggeredBy: 'admin', code: member.code, sentTo: link.to, expiresAt: link.expiresAt.toISOString() },
        },
      };
    }, actor);
  }

  /**
   * Superadministrator → PIERWSZY administrator klubu (`platform.manage`), 72 h.
   * Cel musi być administratorem TEGO klubu (`OrganizationSummary.admins`) - innym
   * członkom klubu platforma listów nie wysyła (§3.3 wielofirmowości: nie wchodzi
   * do danych klubu).
   */
  async invite(actor: PlatformActor, orgId: string, pilotId: string): Promise<PasswordLinkOutcome> {
    return this.run(async (tx) => {
      const org = await this.organizations.byId(tx, orgId);
      if (org == null) throw new NotFound();
      const admin = org.admins.find((a) => a.pilotId === pilotId);
      if (admin == null) throw new NotFound();

      const link = await this.passwords.issueLink(tx, {
        pilotId,
        email: admin.email,
        triggeredBy: 'platform',
        createdBy: actor.pilotId,
        ttlMs: INVITE_LINK_TTL_MS,
      });
      return {
        result: { link, invite: { clubName: org.name } },
        audit: {
          action: 'password.link_sent' as const,
          targetType: 'pilot',
          targetId: pilotId,
          details: { triggeredBy: 'platform', orgId, sentTo: link.to, expiresAt: link.expiresAt.toISOString() },
        },
      };
    }, actor);
  }

  private async run(
    effect: (tx: Tx) => Promise<Audited<Issued>>,
    actor: Actor | PlatformActor,
  ): Promise<PasswordLinkOutcome> {
    let issued: Issued;
    try {
      issued = await this.write.run(actor, effect);
    } catch (err) {
      if (err instanceof NotFound) return { ok: false, reason: 'not_found' };
      if (err instanceof EmailRequired) return { ok: false, reason: 'email_required' };
      if (err instanceof AdminSendLimited) return { ok: false, reason: 'rate_limited', retryAfterSec: err.retryAfterSec };
      throw err;
    }

    try {
      await this.passwords.deliver(issued.link, issued.invite);
    } catch {
      // Token i wpis audytu już są; list nie doszedł. Administrator widzi to od razu
      // i klika „Wyślij ponownie" - nowy token zużywa ten.
      return { ok: false, reason: 'mail_failed' };
    }
    return { ok: true, result: { sentTo: issued.link.to, expiresAt: issued.link.expiresAt } };
  }
}

interface Issued {
  link: IssuedLink;
  invite: { clubName: string } | null;
}

/**
 * Uchwyt transakcji wyprowadzony z podpisu `AuditedWrite.run`, nie importowany po nazwie:
 * komenda panelu nie ma prawa znać `Queryable` (`architecture.test.ts`), a tu potrzebuje
 * wyłącznie przekazać go dalej do `PasswordCommands.issueLink`.
 */
type Tx = Parameters<Parameters<AuditedWrite['run']>[1]>[0];
