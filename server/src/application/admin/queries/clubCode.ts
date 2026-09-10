/**
 * UZ Aero (serwer) - ODCZYT KODU KLUBU dla panelu klubu (karta „Kod klubu", mockup
 * `piloci-kod-klubu`; `docs/wielofirmowosc.md` §3.8, §8.3).
 *
 * Zapis kanoniczny `XXX-XXXX` składa SERWER (`formatClubCode`), nie panel - ta sama
 * reguła, przez którą nazwę karty arkusza liczy wyłącznie serwer: jeden sposób zapisu
 * kodu na obu powierzchniach, bez drugiej kopii formatowania w kliencie.
 */

import { formatClubCode } from '../../../domain/clubCode.ts';
import type { Database } from '../../common/ports.ts';
import type { AdminClubCode } from '../contracts/organizations.ts';
import type { ClubCodeAdminPort, ClubCodeState } from '../ports.ts';

/** Stan kodu → kontrakt. Czysta funkcja, bo to jedyna logika tej trasy. */
export function clubCodeView(state: ClubCodeState): AdminClubCode {
  return {
    code: state.code,
    formatted: state.code == null ? null : formatClubCode(state.code),
    since: state.since?.toISOString() ?? null,
    pendingWithCode: state.pendingWithCode,
  };
}

export class AdminClubCodeQueries {
  constructor(
    private readonly db: Database,
    private readonly clubCode: ClubCodeAdminPort,
  ) {}

  async state(orgId: string): Promise<AdminClubCode> {
    return clubCodeView(await this.clubCode.state(this.db, orgId));
  }
}
