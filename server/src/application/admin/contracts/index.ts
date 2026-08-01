/**
 * UZ Aero (serwer) — barrel kontraktów panelu.
 *
 * Docelowo wskazuje na niego mapa `exports` w `server/package.json`
 * (`@uzaero/server/admin-contracts`, `docs/architektura-panelu-serwer.md` §1.5), przez
 * co klient panelu importuje TYPY odpowiedzi, nie przepisuje ich ręcznie — i nie ma
 * jak sięgnąć do wnętrza serwera. Wpis w `exports` dokładamy razem z pierwszym
 * konsumentem: mapa modułów, której nikt nie importuje, jest deklaracją zamiaru,
 * a nie działającą granicą.
 */

export type * from './audit.ts';
export type * from './corrections.ts';
export type * from './flags.ts';
export type * from './maintenance.ts';
export type * from './pilots.ts';
export type * from './sessions.ts';
