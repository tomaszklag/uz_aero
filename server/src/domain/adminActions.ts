/**
 * UZ Aero (serwer) - słownik akcji zapisywanych do dziennika audytu (`admin_audit`).
 *
 * Ten sam powód, dla którego istnieje `domain/roles.ts`: pytanie „co panel w ogóle
 * potrafi ZMIENIĆ" ma mieć JEDNĄ odpowiedź, w jednym pliku, który da się przeczytać
 * w całości. Kody rozsiane po komendach jako literały byłyby konstrukcją, w której
 * nikt nigdy nie wie, czy zna wszystkie - a dziennik audytu, którego słownika nie da
 * się wypisać, przestaje być narzędziem nadzoru i staje się workiem napisów.
 *
 * **Lista jest pełna od początku, choć dziś emitowana jest jedna pozycja.** To ta sama
 * decyzja, co w `roles.ts` (gdzie `accounts.manage` czekało na swoje trasy): katalog
 * odpowiada na pytanie o ZAKRES panelu, nie o stan wdrożenia. Dzięki temu dopisanie
 * komendy jest wyborem z listy, a nie wymyślaniem nazwy - i widać z jednego miejsca,
 * czy nowa akcja jest naprawdę nowa, czy tylko inaczej nazwana.
 *
 * Kody są surowe (`zasób.czynność`). Mapowanie na plakietki UI (`FLAGA`, `KONTO`,
 * `EKSPORT`, ekran A09) mieszka w panelu - serwer nie zna języka interfejsu.
 */
export const ADMIN_ACTIONS = [
  /** Zamknięcie flagi komentarzem (`status='resolved'`) - przekrój 1, `A03a`. */
  'flag.resolve',
  /** Dopisanie `event_correction` po oknie 24 h (przekrój 3, `A02b`). */
  'event.correct',
  /** Ręczne ponowienie eksportu karty dnia (przekrój 5, `A05`). */
  'export.retry',
  'pilot.create',
  'pilot.update',
  'pilot.deactivate',
  'pilot.password_reset',
  /**
   * TRWAŁE usunięcie wiersza konta (2026-08-30).
   *
   * Wpis audytu jest tu jedynym śladem, jaki po koncie zostaje - wiersza już nie ma,
   * a odwołań do niego nie było (inaczej `refuseDelete` by nie przepuścił). Dlatego
   * `details` niosą KOMPLET tożsamości (kod, nazwisko, e-mail, rola), a nie sam
   * identyfikator: „usunięto 8f3a-…" nie odpowiada nikomu na pytanie, kogo usunięto.
   */
  'pilot.delete',
  'aircraft.create',
  'aircraft.update',
  'aircraft.disable',
  /** TRWAŁE usunięcie wiersza jednostki (2026-08-30) - jak `pilot.delete`. */
  'aircraft.delete',
  /** Zmiana tolerancji flag; progi detekcji są tylko do odczytu (`A08`). */
  'thresholds.update',
  'maintenance.rebuild_projections',
  'maintenance.retry_exports',
  'maintenance.prune_tokens',
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/**
 * Strażnik wejścia z zewnątrz - dla strony ODCZYTU dziennika (`A09`) i filtrów po
 * akcji. Strona zapisu strażnika nie potrzebuje: tam pilnuje typ `AdminAction`.
 */
export function isAdminAction(value: unknown): value is AdminAction {
  return typeof value === 'string' && (ADMIN_ACTIONS as readonly string[]).includes(value);
}
