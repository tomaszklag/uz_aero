/**
 * UZ Aero — panel: klucze zapytań TanStack Query, wszystkie w JEDNYM miejscu.
 *
 * Hierarchicznie, żeby unieważnianie prefiksem było jednolinijkowe
 * (`docs/architektura-panelu-frontend.md` §4.2): mutacja, która zmienia skład listy,
 * unieważnia `keys.<zasób>.all` i nie musi znać żadnego konkretnego filtra.
 *
 * Na razie jest tu wyłącznie sesja — reszta dochodzi razem z ekranami, które jej
 * używają. Klucze „na zapas" byłyby deklaracją zamiaru, nie działającą granicą.
 */

export const keys = {
  /** Tożsamość i zdolności zalogowanego (`GET /admin/api/me`). */
  me: ['me'] as const,
};
