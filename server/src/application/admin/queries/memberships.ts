/**
 * Ninerdeck (serwer) - KOLEJKA ZGŁOSZEŃ kodem klubu (karta ZGŁOSZENIA nad listą pilotów,
 * mockup `piloci-lista`; issue #100, D2).
 *
 * ══ OSOBNA TRASA, NIE POLE W `GET /pilots` ══
 * Lista członków jedzie na `panel.access` (czyta ją każdy, kto ma wejście do panelu -
 * jest też słownikiem pilotów dla filtrów innych ekranów), a kolejka zgłoszeń na
 * `accounts.manage`: to adresy e-mail ludzi, których w klubie jeszcze nie ma, i decyzja
 * o nich należy do jednej zdolności. Doklejenie kolejki do tamtej odpowiedzi oddawałoby
 * ją każdemu, kto czyta listę - a zdolność jest ATRYBUTEM TRASY i tak ma zostać
 * (`http/routes/admin/adminRoute.ts`).
 */

import type { Database } from '../../common/ports.ts';
import type { AdminMembershipQueue } from '../contracts/memberships.ts';
import { membershipRequest } from '../mappers/membershipRequest.ts';
import type { PilotsAdminPort } from '../ports.ts';

export class AdminMembershipQueries {
  constructor(
    private readonly db: Database,
    private readonly pilots: PilotsAdminPort,
  ) {}

  /** `orgId` = klub z sesji panelu: kolejka opisuje TEN klub i żaden inny. */
  async pending(orgId: string): Promise<AdminMembershipQueue> {
    const items = await this.pilots.pending(this.db, orgId);
    return { items: items.map(membershipRequest) };
  }
}
