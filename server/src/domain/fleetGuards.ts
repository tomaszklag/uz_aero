/**
 * UZ Aero (serwer) - reguły, które BRONIĄ konfiguracji floty (`A07`, `A07a`).
 *
 * Lustro `accountGuards.ts` i ta sama zasada: reguła „czego nie wolno zrobić" mieszka
 * w `domain/`, jest czysta i ma test, a komenda wyłącznie ją woła. Rozsianie tych
 * warunków po `commands/fleet.ts` dałoby konstrukcję, w której nikt nie wie, ile
 * warunków obowiązuje przy zapisie samolotu - a to jest dokładnie ten rodzaj wiedzy,
 * po którą sięga się dopiero wtedy, gdy coś już poszło źle.
 *
 * ══ CZEGO TE REGUŁY PILNUJĄ ══
 *
 *  1. **Pojemność zbiorników musi być dodatnia.** To nie jest kosmetyka formularza:
 *     `fuelToleranceL(capacityL)` przy wartości ≤ 0 cofa się do progu 10 L, więc
 *     samolot z pojemnością 0 dostawałby po cichu tolerancję flagi `FUEL_MISMATCH`
 *     wziętą z podłogi, a inwariant „stan po tankowaniu ≤ pojemność" (§3.4) przestałby
 *     cokolwiek znaczyć. Zero w tej kolumnie nie jest stanem świata - jest literówką,
 *     której skutek widać dopiero tydzień później, na fladze, która nie powstała.
 *
 *  2. **Samolotu z OTWARTĄ sesją nie wyłącza się ze służby.** Wyłączenie zabiera
 *     jednostkę z listy wyboru w aplikacji, ale pilot, który tę maszynę trzyma,
 *     już jej nie wybiera - on nią LATA. Zabranie mu samolotu ze słownika w połowie
 *     dnia zostawia go z sesją wskazującą jednostkę, której konfiguracji telefon nie
 *     odświeży poprawnie przy następnym starcie. Odmowa jest jawna i z powodem:
 *     administrator ma zobaczyć „poczekaj do zamknięcia dnia", a nie zastanawiać się,
 *     czy panel się zepsuł.
 *
 * **Czego tu NIE MA:** unikalności rejestracji. Ta jest własnością BAZY (indeks
 * `UNIQUE` na `aircraft.reg`) i sprawdzenia przed zapisem w porcie - funkcja czysta
 * nie ma jak jej ocenić, bo nie zna reszty floty, a udawanie, że zna, kończy się
 * regułą przegrywającą każdy wyścig.
 */

/**
 * Kody odmowy. Surowe (`zasób_czynność`) - nazwanie ich po polsku jest sprawą panelu,
 * tak samo jak przy `AccountRefusal`: serwer nie zna języka interfejsu.
 */
export type FleetRefusal =
  | 'capacity_not_positive'
  | 'open_session'
  | 'oil_not_positive'
  | 'oil_min_above_capacity';

/**
 * Pojemność zbiorników. `null` = pole nietknięte w `PATCH`-u, więc nie ma czego oceniać.
 *
 * Odrzucamy też wartości nieskończone i `NaN`: przechodzą przez `typeof === 'number'`,
 * a w porównaniu `capacityL * 0.05` dają próg, którego nie da się z niczym porównać.
 */
export function refuseCapacity(capacityL: number | null): FleetRefusal | null {
  if (capacityL == null) return null;
  if (!Number.isFinite(capacityL) || capacityL <= 0) return 'capacity_not_positive';
  return null;
}

/**
 * Wyłączenie ze służby. `openSessions` to liczba sesji tego samolotu BEZ `day_close`
 * - czyli sesji, które w tej chwili trwają.
 *
 * Reguła działa WYŁĄCZNIE w jedną stronę: przywrócenie do służby przy otwartej sesji
 * jest w porządku (to naprawa pomyłki), a zmiana pojemności czy formatu MH przy
 * otwartej sesji też - mockup `A07a` mówi o tym wprost: „Samolot z otwartą sesją
 * dokończy dzień na konfiguracji, którą pobrał rano".
 */
export function refuseDisable(input: {
  nextStatus: 'active' | 'disabled';
  openSessions: number;
}): FleetRefusal | null {
  if (input.nextStatus !== 'disabled') return null;
  if (input.openSessions > 0) return 'open_session';
  return null;
}

/**
 * Konfiguracja OLEJU (issue #60) - ocena na wartościach EFEKTYWNYCH po zmianie
 * (komenda składa `before + patch`, bo PATCH niesie różnicę, a reguła orzeka o stanie).
 *
 * `null` = pole nieskonfigurowane i to jest stan LEGALNY (moduł dla jednostki milczy)
 * - inaczej niż pojemność zbiorników, która jest obowiązkowa. Odrzucamy za to:
 *  • wartości niedodatnie/nieskończone - zero litrów oleju nie jest stanem świata,
 *    jest literówką, a minimum 0 wyłączałoby ostrzeżenie po cichu;
 *  • minimum PONAD pojemność - ostrzeżenie „dolej co najmniej…" żądałoby wtedy
 *    stanu, którego zbiornik fizycznie nie mieści, przy KAŻDYM pomiarze.
 */
export function refuseOil(input: {
  oilMinL: number | null;
  oilCapacityL: number | null;
  oilNormLPerH: number | null;
}): FleetRefusal | null {
  const positive = (v: number | null): boolean => v == null || (Number.isFinite(v) && v > 0);
  if (!positive(input.oilMinL) || !positive(input.oilCapacityL) || !positive(input.oilNormLPerH)) {
    return 'oil_not_positive';
  }
  if (input.oilMinL != null && input.oilCapacityL != null && input.oilMinL > input.oilCapacityL) {
    return 'oil_min_above_capacity';
  }
  return null;
}
