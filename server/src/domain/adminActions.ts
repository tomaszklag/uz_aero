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
  /**
   * UNIEWAŻNIENIE CAŁEJ SESJI z panelu (`session_void`, 2026-08-31).
   *
   * Osobna pozycja obok `event.correct`, choć obie idą tą samą zdolnością
   * (`events.correct`) i tym samym trybem administracyjnym: korekta zmienia JEDNO
   * zdarzenie, a ta akcja odbiera ważność CAŁEMU wpisowi - sesja wypada z dnia pilota,
   * z sum i z karty arkusza. Wspólny kod kazałby czytającemu dziennik otwierać
   * `details`, żeby odróżnić poprawioną minutę od wycofanego lotu.
   *
   * `details` niosą KOMPLET tożsamości wpisu (maszyna, pilot, bieg silnika, powód),
   * bo po unieważnieniu żadna lista panelu już go nie pokazuje - ta sama reguła, co
   * przy `pilot.delete`, gdzie audyt jest jedynym śladem.
   */
  'session.void',
  /**
   * ZAKOŃCZENIE ADMINISTRACYJNE operacji (`session_close`, issue #81, 2026-09-03) -
   * zamknięcie wpisu OSIEROCONEGO, którego pilot nie zdał. `details` niosą komplet
   * tożsamości wpisu, powód i to, czy przy okazji unieważniono (`voided`), bo po
   * zamknięciu maszyna jest wolna i nikt już nie zapyta, czemu nagle przestała być zajęta.
   */
  'session.close',
  /**
   * ODCZYTY MASZYNY WPISANE RĘKĄ ADMINISTRATORA (`aircraft_readings`, issue #81):
   * nadrzędny stan licznika, paliwa i oleju z komentarzem - nowe ogniwo przekazania,
   * które wypiera zdanie samolotu sprzed niego. Osobno od `aircraft.update`, bo to nie
   * jest konfiguracja jednostki, tylko fakt o jednej chwili - z tego samego powodu
   * stan początkowy ma osobne kolumny (issue #66).
   */
  'aircraft.reading',
  /** Zmiana tolerancji flag; progi detekcji są tylko do odczytu (`A08`). */
  'thresholds.update',
  'maintenance.rebuild_projections',
  'maintenance.retry_exports',
  'maintenance.prune_tokens',
  /**
   * Zmiana statusu ZGŁOSZENIA BŁĘDU z aplikacji pilota (issue #87).
   *
   * Jedyna zmiana, jakiej doznaje wiersz `bug_reports` po przyjęciu z telefonu -
   * i decyzja o CUDZYM zgłoszeniu, więc ma ślad jak każda inna. `details` niosą
   * przejście (`from` → `to`), komentarz i tożsamość zgłoszenia, bo zamknięte
   * zgłoszenie wypada z domyślnego widoku listy i za tydzień trudniej je odnaleźć
   * niż wpis w dzienniku.
   */
  'bug.status',
  /**
   * ZATWIERDZENIE zgłoszenia rejestracyjnego (logowanie Google, 2026-09-04): powstaje
   * konto pilota, a tożsamość zewnętrzna przechodzi w `linked`. To JEST założenie konta,
   * tylko zaczęte z drugiej strony - `details` niosą to samo, co `pilot.create`, plus
   * e-mail i imię z Google, żeby dało się odtworzyć, KOGO administrator wpuścił.
   */
  'registration.approve',
  /**
   * ODRZUCENIE zgłoszenia - z powodem, który pilot czyta na ekranie `00d`. Odrzucone
   * zgłoszenie wypada z domyślnego widoku listy, więc wpis w dzienniku jest miejscem,
   * w którym za miesiąc widać, kto i dlaczego komuś odmówił.
   */
  'registration.reject',
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/**
 * Strażnik wejścia z zewnątrz - dla strony ODCZYTU dziennika (`A09`) i filtrów po
 * akcji. Strona zapisu strażnika nie potrzebuje: tam pilnuje typ `AdminAction`.
 */
export function isAdminAction(value: unknown): value is AdminAction {
  return typeof value === 'string' && (ADMIN_ACTIONS as readonly string[]).includes(value);
}
