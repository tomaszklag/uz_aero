/**
 * UZ Aero (serwer) — adapter kont pilotów (`PilotsPort`).
 *
 * Konta zakłada wyłącznie administrator/seed (decyzja 2026-07-22 — brak samodzielnej
 * rejestracji), więc adapter jest czystym odczytem; zapis mieszka w seedzie.
 */

import type { PilotAccount, PilotsPort, Queryable } from '../../application/ports.ts';
import { DEFAULT_ROLE, isPilotRole } from '../../domain/roles.ts';

interface PilotRow {
  id: string;
  code: string;
  name: string;
  email: string | null;
  password_hash: string;
  active: boolean;
  role: string;
}

const toAccount = (r: PilotRow): PilotAccount => ({
  id: r.id,
  code: r.code,
  name: r.name,
  email: r.email,
  passwordHash: r.password_hash,
  active: r.active,
  // Bazy pilnuje CHECK z migracji 7, ale adapter i tak nie ufa łańcuchowi znaków
  // z zewnątrz: nierozpoznana rola schodzi do najmniejszej, nigdy nie awansuje.
  role: isPilotRole(r.role) ? r.role : DEFAULT_ROLE,
});

export class PgPilotsRepo implements PilotsPort {
  constructor(private readonly db: Queryable) {}

  async findByLogin(login: string): Promise<PilotAccount | null> {
    // Loginem jest kod pilota albo e-mail — oba unikalne; wielkość liter bez znaczenia,
    // bo „TMK" i „tmk" to w intencji pilota to samo konto.
    const { rows } = await this.db.query<PilotRow>(
      'SELECT * FROM pilots WHERE lower(code) = lower($1) OR lower(email) = lower($1)',
      [login],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async findById(id: string): Promise<PilotAccount | null> {
    const { rows } = await this.db.query<PilotRow>('SELECT * FROM pilots WHERE id = $1', [id]);
    return rows[0] ? toAccount(rows[0]) : null;
  }
}
