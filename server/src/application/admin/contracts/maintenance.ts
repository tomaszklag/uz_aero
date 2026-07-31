/**
 * UZ Aero (serwer) — KONTRAKT przebudowy projekcji (`A11-konserwacja.html`).
 *
 * Wyłącznie typy; jedyny dozwolony import to `@uzaero/domain` (patrz `sessions.ts`).
 */

/**
 * Tryb przebudowy. **Domyślny jest `dry_run`** i to jest istota tej operacji: raport
 * różnic ma powstać ZANIM ktokolwiek nadpisze wiersze, bo nadpisanie wyrównuje liczby
 * i tym samym kasuje jedyny ślad po tym, co je rozjechało (A11).
 */
export type RebuildMode = 'dry_run' | 'write';

/** Jedna rozbieżność: pole projekcji, wartość zapisana i wartość z przeliczenia. */
export interface ProjectionFieldDiff {
  field: string;
  stored: unknown;
  computed: unknown;
}

/** Jedna sesja, która nie zgadza się z przeliczeniem ze strumienia. */
export interface ProjectionRowDiff {
  sessionUuid: string;
  aircraftId: string;
  /** Dzień karty (`YYYY-MM-DD`, UTC) z przeliczonego duty startu; `null` = bez preflightu. */
  day: string | null;
  /** `true` = wiersza projekcji NIE MA w ogóle, choć sesja jest w rejestrze zdarzeń. */
  missing: boolean;
  fields: ProjectionFieldDiff[];
}

/**
 * Raport przebiegu.
 *
 * **Niezerowe `rowsDiffering` to INCYDENT, nie sukces.** Projekcja jest odświeżana
 * w tej samej transakcji, w której przyjmujemy zdarzenia, więc w normalnej pracy
 * serwera różnicy być NIE MOŻE. Jedyne wyjaśnienia to zmiana reguły liczenia
 * w wydaniu domeny (wtedy przebudowa jest dokładnie tym, czego trzeba) albo coś
 * spoza normalnej pracy: ręczny `UPDATE`, import, odtworzenie z kopii zrobionej
 * w połowie strumienia. Najpierw przyczyna, dopiero potem zapis.
 */
export interface RebuildReport {
  mode: RebuildMode;
  /** Ile sesji znaleziono w rejestrze `events` (nie w projekcji — to jest cały sens). */
  sessions: number;
  rowsDiffering: number;
  fieldsDiffering: number;
  /** Ile wierszy FAKTYCZNIE nadpisano; w `dry_run` zawsze 0. */
  written: number;
  diffs: ProjectionRowDiff[];
}
