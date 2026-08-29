/**
 * UZ Aero (serwer) - seed konta administratora (bootstrap wdrożenia).
 *
 * Od issue #50 (2026-08-26, przygotowanie testów z pilotami) seed zakłada WYŁĄCZNIE
 * konto administratora: login `admin`, hasło z `SEED_PASSWORD`. Flotę i konta pilotów
 * zakłada administrator w panelu (A06/A07) - świat scenariusza deweloperskiego
 * (SP-AXA i spółka) mieszka odtąd w `test/testWorld.ts` i służy tylko testom.
 *
 * Idempotentny: stały `id`, `ON CONFLICT DO UPDATE` na polach tożsamości - ale NIGDY
 * na `password_hash`: powtórny `npm run seed` na żywej bazie nie może po cichu
 * zresetować hasła administratora (od resetu jest panel, `A06a`). Aktualizacja roli
 * przy konflikcie jest celowa: seed to jedyna droga awaryjna, gdy klub zostanie bez
 * administratora, a `domain/accountGuards.ts` pilnuje tylko operacji panelu.
 */

import type { PasswordHasher, Queryable } from '../../application/common/ports.ts';

/**
 * `id` = `code` - świadomie, jak w dawnym seedzie scenariusza: upsert potrzebuje
 * STAŁEGO klucza, inaczej powtórny bieg zakładałby drugie konto i wywracał się
 * o unikalność kodu. Konta z panelu dostają uuid; to jedno jest bootstrapem.
 */
const ADMIN = { id: 'admin', code: 'admin', name: 'Administrator', role: 'admin' } as const;

export async function seed(
  db: Queryable,
  hasher: PasswordHasher,
  options: { adminPassword: string },
): Promise<void> {
  const hash = await hasher.hash(options.adminPassword);
  await db.query(
    `INSERT INTO pilots (id, code, name, email, password_hash, active, role)
     VALUES ($1, $2, $3, NULL, $4, TRUE, $5)
     ON CONFLICT (id) DO UPDATE SET
       code = EXCLUDED.code, name = EXCLUDED.name, role = EXCLUDED.role,
       updated_at = now()`,
    [ADMIN.id, ADMIN.code, ADMIN.name, hash, ADMIN.role],
  );
}
