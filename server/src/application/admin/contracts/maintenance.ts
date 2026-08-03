/**
 * UZ Aero (serwer) — KONTRAKT operacji serwisowych panelu (`A11-konserwacja.html`).
 *
 * Wyłącznie typy; jedyny dozwolony import to `@uzaero/domain` (patrz `sessions.ts`).
 *
 * Ekran ma cztery sekcje i trzy z nich mieszkają tutaj: przebudowa projekcji,
 * sprzątanie wygasłych refresh tokenów i stan schematu. Czwarta (kolejka ponowień
 * eksportu) NIE MA własnego kontraktu i to jest decyzja: jej wierszem jest
 * `AdminExportListItem` z `contracts/exports.ts`, a jej akcją — `AdminExportCommands.retry`
 * z `A05`. Drugi kształt tego samego bytu byłby początkiem rozjazdu między „ponów"
 * na monitorze eksportu a „ponów" w konserwacji.
 */

/**
 * Tryb przebudowy. **Domyślny jest `dry_run`** i to jest istota tej operacji: raport
 * różnic ma powstać ZANIM ktokolwiek nadpisze wiersze, bo nadpisanie wyrównuje liczby
 * i tym samym kasuje jedyny ślad po tym, co je rozjechało (A11).
 *
 * Od 2026-08-02 tryby są rozdzielone także w KODZIE: `dry_run` powstaje w zapytaniu
 * (`queries/maintenance.ts`, zero zapisów i zero audytu), `write` w komendzie
 * (`commands/maintenance.ts`, przez `AuditedWrite`). To pole zostaje, bo raport ma
 * mówić, którą z dwóch dróg powstał — inaczej dwa identycznie wyglądające dokumenty
 * różniłyby się wyłącznie tym, czego już nie widać.
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
  /**
   * Ile wierszy się rozjechało — liczba PEŁNA, policzona nad całym rejestrem i
   * niezależna od limitu objętości raportu. Ta sama zasada, co `AdminExportCounts`
   * na `A05`: liczba opisuje cały zakres, lista opisuje to, co się zmieściło.
   */
  rowsDiffering: number;
  fieldsDiffering: number;
  /** Ile wierszy FAKTYCZNIE nadpisano; w `dry_run` zawsze 0. */
  written: number;
  /**
   * Ile rozjechanych sesji ZOSTAŁO poza tym raportem — `rowsDiffering - diffs.length`.
   *
   * Przy `write` to jest dokładnie ta sama liczba w drugim znaczeniu: **tyle sesji
   * nadal się różni i czeka na kolejne wywołanie**, bo jeden przebieg nadpisuje
   * najwyżej `PROJECTION_DIFF_LIMIT` sesji (`application/admin/projectionScan.ts` —
   * tam też uzasadnienie limitu). Znaczenia schodzą się, bo zapis nadpisuje dokładnie
   * te wiersze, które opisuje raport, i ani jednego więcej.
   *
   * Zero znaczy „raport jest kompletny", a nie „nie wiadomo".
   */
  remaining: number;
  /** Najwyżej `PROJECTION_DIFF_LIMIT` pozycji; resztę zlicza `remaining`. */
  diffs: ProjectionRowDiff[];
}

// ── wygasłe refresh tokeny (sekcja 3 — JEDYNA operacja, która kasuje) ────────────

/**
 * Stan tabeli `refresh_tokens` widziany PRZED czyszczeniem (`A11`, karta „Wygasłe
 * refresh tokeny").
 *
 * **Nie ma tu ani jednego pola z wartością tokenu i nie może być.** W bazie leżą
 * wyłącznie skróty SHA-256, a wartości nie zna nawet serwer — ale reguła obowiązuje
 * niezależnie od tego, co akurat leży w kolumnie: `A09` wymienia tokeny na liście
 * rzeczy, które NIGDY nie opuszczają swojej tabeli. Stąd wyłącznie liczby i daty.
 *
 * `valid` jedzie osobno, a nie jako `total - expired`, bo to jest zdanie, które ekran
 * wypowiada wprost („15 ważnych — bez zmian") i musi je policzyć serwer w tym samym
 * zapytaniu, w którym liczy wygasłe. Odejmowanie po stronie panelu byłoby drugą
 * definicją „ważnego" — a granica biegnie po zegarze, więc dwie definicje znaczą
 * dwie różne chwile.
 */
export interface RefreshTokenScanDto {
  total: number;
  expired: number;
  valid: number;
  /** Zakres WYGAŚNIĘCIA kandydatów do skasowania (ISO 8601, UTC); `null` = brak. */
  oldestExpiredAt: string | null;
  newestExpiredAt: string | null;
  /** Chwila, wobec której policzono „wygasły" — bo granica jest ruchoma. */
  at: string;
  /** `REFRESH_TTL_DAYS` — ekran mówi, po jakim czasie wiersz w ogóle może wygasnąć. */
  ttlDays: number;
}

/**
 * Skutek czyszczenia. Te same liczby jadą do `admin_audit.details` — i to jest CAŁA
 * treść wpisu: ile wierszy zniknęło i z jakiego zakresu dat wygaśnięcia.
 *
 * `remainingValid` odpowiada na pytanie, które zadaje się zaraz po kliknięciu: czy
 * ktoś stracił sesję. Odpowiedź „nie" musi być policzona PO skasowaniu, w tej samej
 * transakcji — inaczej byłaby obietnicą sprzed operacji.
 */
export interface TokenPurgeReport {
  deleted: number;
  oldestExpiredAt: string | null;
  newestExpiredAt: string | null;
  remainingValid: number;
  at: string;
}

// ── stan schematu (sekcja 4 — tylko do odczytu) ─────────────────────────────────

/** Jedna migracja: numer, jednozdaniowy opis i chwila zastosowania. */
export interface SchemaMigrationDto {
  version: number;
  /** Opis z `infrastructure/pg/schema.ts` — źródło prawdy stoi przy DDL-u. */
  title: string;
  /** ISO 8601 UTC; `null` = migracja jeszcze NIE zastosowana. */
  appliedAt: string | null;
  applied: boolean;
}

/**
 * Stan schematu bazy (`A11`, karta „Stan schematu i migracji").
 *
 * Ekran NIE URUCHAMIA migracji i nie ma przycisku, który by to robił: schemat wprowadza
 * `migrate()` przy starcie serwera, więc wdrożenie schematu jest wydaniem, a nie akcją
 * administratora. Ta odpowiedź istnieje po to, żeby przy diagnozie nie trzeba było
 * zaglądać do `psql`.
 *
 * `pending > 0` znaczy, że baza jest STARSZA niż kod, który ją obsługuje — stan możliwy
 * wyłącznie wtedy, gdy runner padł w starcie. Ekran nazywa go wprost.
 */
export interface SchemaStateDto {
  /** `SCHEMA_VERSION` — ile migracji zna KOD. */
  schemaVersion: number;
  /** Ile migracji odnotowała BAZA (`schema_migrations`). */
  applied: number;
  pending: number;
  /** Ostatnia odnotowana migracja (ISO 8601 UTC); `null` = baza pusta. */
  lastAppliedAt: string | null;
  migrations: SchemaMigrationDto[];
}
