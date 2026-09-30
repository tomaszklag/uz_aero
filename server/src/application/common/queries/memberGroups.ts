/**
 * Ninerdeck (serwer) - GRUPY KLUBU do odczytu (4.0.0, issue #245; `docs/zlecenia.md` §6.1).
 *
 * Czytają je dwie powierzchnie z dwoma pytaniami: panel („kto jest w której grupie" -
 * `panel.access` albo `orders.create`) i telefon zlecającego (adresaci zlecenia -
 * `orders.create`). Odpowiedź jest ta sama: nazwa i lista osób, także wyłączonych, bo
 * grupa je trzyma, a przygasić je jest sprawą ekranu.
 */

import type { Database, MemberGroupRecord, MemberGroupsPort } from '../ports.ts';

export class MemberGroupQueries {
  constructor(
    private readonly db: Database,
    private readonly groups: MemberGroupsPort,
  ) {}

  list(orgId: string): Promise<MemberGroupRecord[]> {
    return this.groups.list(this.db, orgId);
  }

  /** `null` = grupy nie ma w tym klubie → 404. */
  byId(orgId: string, id: string): Promise<MemberGroupRecord | null> {
    return this.groups.byId(this.db, orgId, id);
  }
}
