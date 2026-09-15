/**
 * Ninerdeck (serwer) - seed SUPERADMINISTRATORA (bootstrap wdrożenia).
 *
 * Od issue #50 (2026-08-26, przygotowanie testów z pilotami) seed zakłada WYŁĄCZNIE
 * jedno konto. Od wielofirmowości (issue #98) jest to konto SUPERADMINISTRATORA - osoby
 * bez klubu (`docs/wielofirmowosc.md` §3.3), która kluby zakłada i zaprasza do nich
 * pierwszych administratorów (moduł Organizacje, epik E). Flotę i członków zakłada się
 * W KLUBIE, w panelu; świat scenariusza deweloperskiego mieszka w `test/testWorld.ts`
 * i służy tylko testom.
 *
 * ══ CO SIĘ ZMIENIŁO PRZY WEJŚCIU GOOGLE (2026-09-04) ══
 * Konto powstaje BEZ HASŁA, bo hasła nie ma już w produkcie. Seed wpisuje za to `email`
 * i to jest CAŁY bootstrap dostępu: pierwsze logowanie kontem Google o tym samym,
 * zweryfikowanym adresie PODPINA to konto (`claimByVerifiedEmail`,
 * `docs/logowanie-google.md` §6). Osobny skrypt „przypisz mnie jako admina" nie jest
 * potrzebny - robi to zwykłe logowanie.
 *
 * ══ NA BAZIE Z BACKFILLEM SUPERADMINISTRATOR ZOSTAJE ADMINISTRATOREM KLUBU ══
 * Migracja 8 przepisała konto `admin` z 1.x na członkostwo `admin` w klubie domyślnym;
 * seed dokłada temu samemu wierszowi `platform_role` i nic więcej nie rusza - to jest
 * dziś ta sama osoba (§10). Na świeżej bazie osoba powstaje bez ani jednego członkostwa.
 *
 * Idempotentny: stały `id`, `ON CONFLICT DO UPDATE` na polach tożsamości. Aktualizacja
 * roli platformowej i e-maila przy konflikcie jest CELOWA - seed to jedyna droga
 * awaryjna, gdy serwer zostanie bez superadministratora albo gdy trzeba przestawić
 * bootstrap na inny adres, a `domain/accountGuards.ts` pilnuje tylko operacji panelu.
 *
 * **Podmiana e-maila NIE zrywa istniejącego podpięcia** i to jest zamierzone: `claim`
 * wymaga konta BEZ tożsamości zewnętrznej, więc konto już podpięte zostaje przy swoim
 * koncie Google niezależnie od tego, co stoi w `SEED_ADMIN_EMAIL`.
 */

import type { Queryable } from '../../application/common/ports.ts';

/**
 * Stały `id` - świadomie, jak w dawnym seedzie scenariusza: upsert potrzebuje STAŁEGO
 * klucza, inaczej powtórny bieg zakładałby drugą osobę i wywracał się o unikalność
 * e-maila. Osoby z panelu dostają uuid; ta jedna jest bootstrapem. Kodu pilota tu
 * NIE MA: kod jest własnością członkostwa, a superadministrator klubu nie ma.
 */
const SUPERADMIN = { id: 'admin', name: 'Administrator', platformRole: 'superadmin' } as const;

export async function seed(db: Queryable, options: { adminEmail: string }): Promise<void> {
  const email = options.adminEmail.trim();

  // Kolizja z e-mailem INNEJ osoby wywróci to zapytanie (`pilots.email` jest UNIQUE)
  // i serwer nie wstanie. Tak ma być: to jest błąd konfiguracji wdrożenia, a cichy
  // bootstrap wskazujący nie tę osobę, co trzeba, byłby dużo gorszy niż odmowa startu.
  await db.query(
    `INSERT INTO pilots (id, name, email, active, platform_role)
     VALUES ($1, $2, $3, TRUE, $4)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, email = EXCLUDED.email,
       platform_role = EXCLUDED.platform_role, active = TRUE, updated_at = now()`,
    [SUPERADMIN.id, SUPERADMIN.name, email, SUPERADMIN.platformRole],
  );
}
