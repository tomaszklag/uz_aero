/**
 * Ninerdeck (serwer) - słownik CZŁONKOSTWA pilota w klubie (wielofirmowość, issue #98;
 * `docs/wielofirmowosc.md` §3.2).
 *
 * Członkostwo jest tym, czym do 2.0.0 było konto: niesie kod pilota, rolę panelu
 * i „czy wolno mu wejść". Konto (`pilots`) zostaje OSOBĄ - jedną na serwerze, wspólną
 * dla wszystkich klubów, w których człowiek lata.
 *
 * Ten sam wzorzec, co `roles.ts` i `bugReports.ts`: katalog jako tablica `as const`,
 * typ wyprowadzony z tablicy, strażnik wejścia z zewnątrz. Baza ma na kolumnach `CHECK`
 * z tą samą listą (`memberships.status`, `memberships.joined_via`), więc strażnik jest
 * asercją, nie zgadywaniem.
 */

/**
 * Cykl życia członkostwa.
 *
 *  • `pending`  - zgłoszenie kodem klubu czeka na decyzję administratora (00C);
 *  • `active`   - pilot pracuje w klubie; JEDYNY stan, w którym token pilota istnieje;
 *  • `disabled` - wyłączony przez administratora klubu (dawne „wyłącz konto"); tokeny
 *                 wydane przed wyłączeniem są martwe (`credentials_valid_from`);
 *  • `rejected` - odmowa z powodem, który pilot czyta na 00D; drugie zgłoszenie tym samym
 *                 kodem trafia na tę samą odpowiedź.
 */
export const MEMBERSHIP_STATUSES = ['pending', 'active', 'disabled', 'rejected'] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Strażnik wejścia z zewnątrz (kolumna w bazie, query string). */
export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return (
    typeof value === 'string' && (MEMBERSHIP_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Wartość nierozpoznana schodzi do stanu BEZ DOSTĘPU - ten sam kierunek błędu, co przy
 * roli konta (`DEFAULT_ROLE`) i statusie tożsamości zewnętrznej. `pending`, a nie
 * `disabled`: administrator widzi wtedy wiersz w kolejce i sam rozstrzyga, zamiast
 * dowiadywać się o wyłączeniu, którego nikt nie zrobił.
 */
export const membershipStatusOf = (value: unknown): MembershipStatus =>
  isMembershipStatus(value) ? value : 'pending';

/**
 * Skąd wzięło się członkostwo (§3.8): `code` = pilot wpisał kod klubu (od 2026-09-09
 * JEDYNA droga dla pilotów); `platform` = PIERWSZY administrator klubu, założony przez
 * superadministratora razem z klubem - wyjątek klasy bootstrap, bo kodem nie miałby go
 * kto zatwierdzić; `backfill` = przepisane z konta 1.x przy migracji 8.
 *
 * `email` i `link` odpadły razem z drogami, które nazywały (§15), a `panel` (administrator
 * dopisywał członka wprost z panelu klubu) - w epiku D razem z `POST /admin/api/pilots`
 * (issue #100, D3). Lista jest więc dziś PEŁNĄ odpowiedzią na pytanie „jak ten człowiek
 * trafił do tego klubu" i ma trzy pozycje, bo są trzy sposoby.
 */
export const JOINED_VIA = ['code', 'platform', 'backfill'] as const;

export type JoinedVia = (typeof JOINED_VIA)[number];
