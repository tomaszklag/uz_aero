/**
 * UZ Aero (serwer) - adapter kont pilotów (`PilotsPort`).
 *
 * Konta powstają przez zatwierdzenie zgłoszenia albo w panelu, więc adapter jest
 * czystym ODCZYTEM ścieżki logowania; zapis mieszka w seedzie i w `PgAdminPilotsRepo`.
 */

import type {
  PilotAccount,
  PilotAuthSnapshot,
  PilotsPort,
  Queryable,
} from '../../../application/common/ports.ts';
import { DEFAULT_ROLE, isPilotRole } from '../../../domain/roles.ts';

interface PilotRow {
  id: string;
  code: string;
  name: string;
  email: string | null;
  active: boolean;
  role: string;
}

const toAccount = (r: PilotRow): PilotAccount => ({
  id: r.id,
  code: r.code,
  name: r.name,
  email: r.email,
  active: r.active,
  // Bazy pilnuje CHECK na `pilots.role`, ale adapter i tak nie ufa łańcuchowi znaków
  // z zewnątrz: nierozpoznana rola schodzi do najmniejszej, nigdy nie awansuje.
  role: isPilotRole(r.role) ? r.role : DEFAULT_ROLE,
});

export class PgPilotsRepo implements PilotsPort {
  constructor(private readonly db: Queryable) {}

  async findById(id: string): Promise<PilotAccount | null> {
    // Kolumny WYPISANE IMIENNIE, nie `SELECT *`: kształt `PilotAccount` ma zmieniać się
    // świadomie, a nie przy każdej nowej kolumnie na `pilots` (ta sama zasada, dla której
    // `authSnapshot` niżej nigdy nie brał gwiazdki).
    const { rows } = await this.db.query<PilotRow>(
      'SELECT id, code, name, email, active, role FROM pilots WHERE id = $1',
      [id],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  /**
   * Odczyt BRAMY panelu - kolumny wypisane imiennie i bez `password_hash`.
   *
   * `SELECT *` z `findById` jest tu nie do przyjęcia z dwóch powodów naraz: wnosiłby
   * hash do warstwy HTTP przy każdym żądaniu panelu (a `PilotAuthSnapshot` powstał
   * właśnie po to, żeby tego nie robić) i milcząco zmieniałby kształt wyniku przy
   * każdej nowej kolumnie na `pilots`.
   */
  async authSnapshot(id: string): Promise<PilotAuthSnapshot | null> {
    const { rows } = await this.db.query<{
      id: string;
      code: string;
      name: string;
      active: boolean;
      role: string;
      credentials_valid_from: string | Date | null;
    }>(
      `SELECT id, code, name, active, role, credentials_valid_from
         FROM pilots WHERE id = $1`,
      [id],
    );

    const row = rows[0];
    if (row == null) return null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
      // Ta sama nieufność co przy logowaniu: nierozpoznana rola schodzi do najmniejszej.
      role: isPilotRole(row.role) ? row.role : DEFAULT_ROLE,
      credentialsValidFrom:
        row.credentials_valid_from == null ? null : new Date(row.credentials_valid_from),
    };
  }
}
