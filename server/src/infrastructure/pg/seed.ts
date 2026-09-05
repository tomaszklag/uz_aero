/**
 * UZ Aero (serwer) - seed konta administratora (bootstrap wdrożenia).
 *
 * Od issue #50 (2026-08-26, przygotowanie testów z pilotami) seed zakłada WYŁĄCZNIE
 * konto administratora. Flotę i konta pilotów zakłada administrator w panelu (A06/A07) -
 * świat scenariusza deweloperskiego mieszka w `test/testWorld.ts` i służy tylko testom.
 *
 * ══ CO SIĘ ZMIENIŁO PRZY WEJŚCIU GOOGLE (2026-09-04) ══
 * Konto powstaje BEZ HASŁA, bo hasła nie ma już w produkcie. Seed wpisuje za to `email`
 * i to jest CAŁY bootstrap dostępu do panelu: pierwsze logowanie kontem Google o tym
 * samym, zweryfikowanym adresie PODPINA to konto (`claimByVerifiedEmail`,
 * `docs/logowanie-google.md` §6). Osobny skrypt „przypisz mnie jako admina" nie jest
 * potrzebny - robi to zwykłe logowanie.
 *
 * Idempotentny: stały `id`, `ON CONFLICT DO UPDATE` na polach tożsamości. Aktualizacja
 * roli i e-maila przy konflikcie jest CELOWA - seed to jedyna droga awaryjna, gdy klub
 * zostanie bez administratora albo gdy trzeba przestawić bootstrap na inny adres,
 * a `domain/accountGuards.ts` pilnuje tylko operacji panelu.
 *
 * **Podmiana e-maila NIE zrywa istniejącego podpięcia** i to jest zamierzone: `claim`
 * wymaga konta BEZ tożsamości zewnętrznej, więc konto już podpięte zostaje przy swoim
 * koncie Google niezależnie od tego, co stoi w `SEED_ADMIN_EMAIL`.
 */

import type { Queryable } from '../../application/common/ports.ts';

/**
 * `id` = `code` - świadomie, jak w dawnym seedzie scenariusza: upsert potrzebuje
 * STAŁEGO klucza, inaczej powtórny bieg zakładałby drugie konto i wywracał się
 * o unikalność kodu. Konta z panelu dostają uuid; to jedno jest bootstrapem.
 */
const ADMIN = { id: 'admin', code: 'admin', name: 'Administrator', role: 'admin' } as const;

export async function seed(db: Queryable, options: { adminEmail: string }): Promise<void> {
  const email = options.adminEmail.trim();

  // Kolizja z e-mailem INNEGO konta wywróci to zapytanie (`pilots.email` jest UNIQUE)
  // i serwer nie wstanie. Tak ma być: to jest błąd konfiguracji wdrożenia, a cichy
  // bootstrap wskazujący nie to konto, co trzeba, byłby dużo gorszy niż odmowa startu.
  await db.query(
    `INSERT INTO pilots (id, code, name, email, active, role)
     VALUES ($1, $2, $3, $4, TRUE, $5)
     ON CONFLICT (id) DO UPDATE SET
       code = EXCLUDED.code, name = EXCLUDED.name, email = EXCLUDED.email,
       role = EXCLUDED.role, updated_at = now()`,
    [ADMIN.id, ADMIN.code, ADMIN.name, email, ADMIN.role],
  );
}
