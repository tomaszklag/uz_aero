/**
 * UZ Aero (serwer) — unieważnianie sesji pilota z panelu (`RefreshTokensAdminPort`).
 *
 * Osobny plik od `common/refreshTokensRepo.ts`, choć tabela jest ta sama — ten sam
 * podział, co przy flagach i kontach. Tamten adapter obsługuje CYKL ŻYCIA sesji
 * telefonu: zna hash tokenu, losowanie wartości i atomową rotację, ma własny uchwyt
 * do bazy i pracuje poza transakcją. Ten robi jedną rzecz, w cudzej transakcji, po
 * kluczu obcym: kasuje wszystko, co należy do konta.
 *
 * **Hasza tokenu ten adapter nie zna i znać nie musi** — i to jest jedyny powód, dla
 * którego rozdzielenie w ogóle warto odnotować: usuwanie po `pilot_id` nie wymaga
 * dostępu do wartości tokenu, więc panel nie dostaje do ręki niczego, czym mógłby
 * odgadnąć czyjąś sesję.
 *
 * `RETURNING token_hash` służy WYŁĄCZNIE do policzenia wierszy — liczba unieważnionych
 * sesji jedzie do dziennika audytu, bo odpowiada na pytanie, którego wpis „deaktywowano
 * konto" sam nie zamyka: czy ktoś jeszcze na tym koncie pracował. Same hashe nie
 * opuszczają tej metody i nigdy nie trafiają do `details` (`A09`: „Tokeny i refresh
 * tokeny — nigdy").
 */

import type { RefreshTokensAdminPort } from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';

export class PgAdminRefreshTokensRepo implements RefreshTokensAdminPort {
  async revokeAllFor(tx: Queryable, pilotId: string): Promise<number> {
    const { rows } = await tx.query<{ token_hash: string }>(
      'DELETE FROM refresh_tokens WHERE pilot_id = $1 RETURNING token_hash',
      [pilotId],
    );
    return rows.length;
  }
}
