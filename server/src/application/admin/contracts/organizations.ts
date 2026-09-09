/**
 * UZ Aero (serwer) - KONTRAKT klubu w odpowiedziach panelu (wielofirmowość, issue #98;
 * `docs/wielofirmowosc.md` §8).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` i siebie nawzajem (pilnuje `test/architecture.test.ts`).
 *
 * Klub w odpowiedziach panelu to trzy pola: identyfikator (klucz w adresach tras),
 * slug (jedyny identyfikator PUBLICZNY - adres kart arkusza, nadawany raz) i nazwa
 * (napis dla człowieka, może się zmieniać). Moduł Organizacje (epik E) dołoży tu
 * listę klubów z licznikami; do tego czasu kontrakt niesie to, co panel klubu
 * potrzebuje w pasku górnym i w kontekście kolumny bocznej: nazwę swojego klubu.
 */

/** Klub tak, jak nazywa go panel: w sesji, w kontekście kolumny bocznej, w adresie karty. */
export interface OrganizationRef {
  id: string;
  slug: string;
  name: string;
}

/**
 * Lustro `MEMBERSHIP_STATUSES` z `domain/memberships.ts` - ta sama kopia, co
 * `PilotRoleWire` w `pilots.ts` i z tego samego powodu (granica katalogu kontraktów).
 */
export type MembershipStatusWire = 'pending' | 'active' | 'disabled' | 'rejected';

/** Lustro `PLATFORM_ROLES` z `domain/roles.ts`. */
export type PlatformRoleWire = 'superadmin';
