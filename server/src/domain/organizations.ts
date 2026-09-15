/**
 * Ninerdeck (serwer) - KLUB jako tenant (wielofirmowość, issue #98;
 * `docs/wielofirmowosc.md` §3.1).
 *
 * Jeden serwer obsługuje wiele klubów; wszystko, co należy do klubu (flota, piloci jako
 * członkowie, rejestr, dziennik, karty arkusza), niesie `org_id`. Ten plik trzyma
 * wyłącznie to, co o klubie musi wiedzieć DOMENA serwera - kształt sluga - bo slug jest
 * jedynym PUBLICZNYM identyfikatorem klubu (adres kart arkusza) i po nadaniu się go nie
 * zmienia.
 */

/**
 * Slug klubu: małe litery i cyfry rozdzielone pojedynczymi myślnikami, 2–60 znaków
 * (`aeroklub-zielonogorski`). Bez wielkich liter i bez polskich znaków, bo wchodzi do
 * adresu URL i do zmiennej środowiskowej wpisywanej ręką na hostingu.
 */
export const ORG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ORG_SLUG_MAX_LENGTH = 60;

export function isOrgSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 2 &&
    value.length <= ORG_SLUG_MAX_LENGTH &&
    ORG_SLUG_PATTERN.test(value)
  );
}

/** Klub tak, jak widzą go obie powierzchnie: tożsamość + czy działa. */
export interface Organization {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}
