/**
 * UZ Aero (serwer) — nazwa pliku śladu z identyfikatora sesji.
 *
 * Wydzielone z `fsTraceSink.ts`, gdy doszedł odczyt (`fsTraceSource.ts`): zapis i odczyt
 * MUSZĄ liczyć nazwę tym samym kodem. Dwie kopie tej funkcji to błąd, który nie daje
 * żadnego objawu poza tym, że panel pokazuje pusty ślad dla sesji, której plik leży
 * na dysku — czyli najgorszy możliwy rodzaj błędu.
 *
 * Nazwa nie może przyjść z telefonu dosłownie (`../../etc/passwd` jest poprawnym
 * napisem), więc tniemy do bezpiecznego zbioru znaków i długości.
 */

/** Wpisy bez sesji lądują we wspólnym pliku — zwykle fixy sprzed `session_claim`. */
export const NO_SESSION_FILE = '_bez-sesji';

export function safeName(sessionUuid: unknown): string {
  const raw =
    typeof sessionUuid === 'string' && sessionUuid.length > 0 ? sessionUuid : NO_SESSION_FILE;
  return raw.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
}
