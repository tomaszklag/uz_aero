/**
 * UZ Aero - dokąd idzie paczka fixów z taska lokalizacji (usługa w tle).
 *
 * Jedno miejsce PRAWDY o kolejności rozstrzygania: żywy sink > zapis headless > kosz.
 * Task sprawdza sink synchronicznie, a sesję zna dopiero writer (odczyt meta jest
 * asynchroniczny) - dlatego obie strony wołają tę samą funkcję zamiast dublować
 * warunki. Czysty moduł: testowalny w RN-free jest (wzorzec `schema.ts`).
 */

export type BackgroundRoute =
  | { kind: 'sink' }
  | { kind: 'store'; sessionUuid: string }
  | { kind: 'drop' };

/**
 * `hasSink` = aplikacja żyje (adapter rozprowadzi fixy fanoutem - detekcja, kokpit,
 * ślad jak dziś). Bez sinka jesteśmy po śmierci procesu: zapis wprost do `gps_trace`,
 * o ile znamy sesję OTWARTEGO dnia (`active_session_uuid` z meta).
 */
export function routeBackgroundFixes(
  hasSink: boolean,
  activeSessionUuid: string | null,
): BackgroundRoute {
  if (hasSink) return { kind: 'sink' };
  if (activeSessionUuid != null && activeSessionUuid !== '') {
    return { kind: 'store', sessionUuid: activeSessionUuid };
  }
  // Brak sesji = dzień zamknięty albo stan po awarii - wiersz bez atrybucji jest
  // bezużyteczny dla kalibracji i mógłby trafić do cudzej sesji przy następnym claimie.
  return { kind: 'drop' };
}
