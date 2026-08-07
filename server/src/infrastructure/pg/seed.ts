/**
 * UZ Aero (serwer) — seed floty i pilotów.
 *
 * TE SAME dane co zaślepka w aplikacji (`app/src/infrastructure/referenceSeed.ts`):
 * dopóki telefon i serwer są rozwijane równolegle, oba światy muszą opowiadać ten sam
 * scenariusz (SP-AXA wolny, SP-FGK zajęty przez KRZ, An-2 z wymogiem Duala, SP-KWA
 * wyłączony), inaczej pierwszy sync „naprawi" telefonowi flotę na inną niż w testach.
 *
 * Idempotentny: `ON CONFLICT DO UPDATE` — wołanie na istniejącej bazie odświeża
 * rekordy zamiast się wywracać. Konta zakłada wyłącznie ten seed / administrator
 * (decyzja 2026-07-22: brak samodzielnej rejestracji).
 */

import type { PasswordHasher, Queryable } from '../../application/common/ports.ts';

const AIRCRAFT = [
  ['SP-AXA', 'SP-AXA', 'Cessna 182', 2019, 330, 'hhmm', false, 'active'],
  ['SP-FGK', 'SP-FGK', 'Cessna 182', 2017, 330, 'hhmm', false, 'active'],
  ['SP-ANK', 'SP-ANK', 'Antonov An-2', 1984, 1700, 'hhmm', true, 'active'],
  ['SP-KWA', 'SP-KWA', 'Cessna 172', 2021, 200, 'decimal', false, 'disabled'],
] as const;

/**
 * Role: seed daje po jednym koncie każdej roli, żeby panel dało się
 * przeklikać bez ręcznego UPDATE-u. Reszta to zwykli piloci — czyli stan, w którym
 * konto NIE ma dostępu do back-office'u, i taki ma być domyślny.
 */
const PILOTS = [
  ['TMK', 'TMK', 'Tomasz Małkiewicz', 'tomasz@uzaero.pl', 'admin'],
  ['AKO', 'AKO', 'Anna Kowalska', 'anna@uzaero.pl', 'training_lead'],
  ['PWI', 'PWI', 'Piotr Wiśniewski', 'piotr@uzaero.pl', 'pilot'],
  ['JSE', 'JSE', 'Jan Serafin', 'jan@uzaero.pl', 'pilot'],
  ['KRZ', 'KRZ', 'Krzysztof Zieliński', 'krzysztof@uzaero.pl', 'pilot'],
] as const;

export async function seed(
  db: Queryable,
  hasher: PasswordHasher,
  options: { defaultPassword: string },
): Promise<void> {
  for (const [id, reg, type, year, capacityL, mhFormat, dualRequired, status] of AIRCRAFT) {
    await db.query(
      `INSERT INTO aircraft (id, reg, type, year, capacity_l, mh_format, dual_required, service_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         reg = EXCLUDED.reg, type = EXCLUDED.type, year = EXCLUDED.year,
         capacity_l = EXCLUDED.capacity_l, mh_format = EXCLUDED.mh_format,
         dual_required = EXCLUDED.dual_required, service_status = EXCLUDED.service_status,
         updated_at = now()`,
      [id, reg, type, year, capacityL, mhFormat, dualRequired, status],
    );
  }

  for (const [id, code, name, email, role] of PILOTS) {
    // Hash liczymy per pilot — wspólny hash dla wszystkich zdradzałby w bazie,
    // że hasła startowe są identyczne.
    const hash = await hasher.hash(options.defaultPassword);
    await db.query(
      `INSERT INTO pilots (id, code, name, email, password_hash, active, role)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code, name = EXCLUDED.name, email = EXCLUDED.email,
         role = EXCLUDED.role, updated_at = now()`,
      [id, code, name, email, hash, role],
    );
  }
}
