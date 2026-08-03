/**
 * UZ Aero — panel: KAFLE nad listą dni lotnych (moduł CZYSTY).
 *
 * Bliźniak `screens/audit/auditTiles.ts`. Kafle z mockupu `A02` odpowiadają na pytanie,
 * którego tabela nie zadaje: ile tego jest W CAŁYM ZAWĘŻENIU, a nie na pobranej stronie.
 * **Żadnej z tych liczb panel nie liczy sam** — „dni w zawężeniu" jedzie z `total`
 * odpowiedzi listy, a trzy pozostałe są osobnymi zapytaniami z podmienionym stanem
 * (`sessionCountQuery`, `limit=1`). Policzenie ich z pobranych stron dałoby liczbę,
 * której serwer nigdy nie wysłał, i fałszywą przy każdym obcięciu kursorem.
 *
 * Liczniki wchodzą tu OBIEKTEM, a nie czwórką pozycyjnych argumentów: cztery liczby
 * tego samego typu w jednym wywołaniu to pomyłka, której kompilator nie złapie,
 * a pomylone „otwarte" z „wyeksportowanymi" wygląda na ekranie zupełnie normalnie.
 */

/**
 * Liczniki listy dni. Każdy przyjmuje OBA rodzaje braku i oba znaczą tu to samo:
 * `undefined` — zapytanie w drodze albo zakończone błędem; `null` — odpowiedzi nie ma
 * (`dayPages` bez stron). Gdyby moduł przyjmował tylko `undefined`, wołający musiałby
 * po drodze zamieniać `null` na coś innego — a najbliższą pokusą jest zero.
 */
export interface DaysCounts {
  /** Ile dni spełnia filtr według serwera — z `total` listy (`dayPages`). */
  total: number | null | undefined;
  /** Sesje bez `day_close`. */
  open: number | null | undefined;
  /** Dni z co najmniej jedną OTWARTĄ flagą. */
  flagged: number | null | undefined;
  /** Dni z kartą w `export_log`. */
  exported: number | null | undefined;
}

export interface DaysTile {
  label: string;
  value: string | number;
  tone?: 'green' | 'amber' | 'blue';
  note: string;
}

/**
 * Kafle jako gotowe napisy. BRAK LICZBY daje „—", nigdy zera: zero jest twierdzeniem
 * o świecie — „w tym zawężeniu nie ma ani jednego dnia" — a brak odpowiedzi nim nie
 * jest. Ton „coś wymaga uwagi" też się na braku nie zapala: amber przy nieznanej
 * liczbie flag wołałby administratora do czegoś, czego nie widzieliśmy.
 */
export function daysTiles(counts: DaysCounts, narrowed: boolean): DaysTile[] {
  const { total, open, flagged, exported } = counts;

  return [
    {
      label: 'Dni w zawężeniu',
      value: total ?? '—',
      note: narrowed
        ? 'Tyle sesji spełnia filtr z adresu — liczba z serwera, nie z pobranych stron.'
        : 'Wszystkie sesje w rejestrze, od pierwszego dnia klubu.',
    },
    {
      label: 'Dni otwarte',
      value: open ?? '—',
      tone: open == null || open === 0 ? undefined : 'blue',
      note: 'Sesje bez `day_close`. Telefon dosyła do nich zdarzenia — odczyty końcowe są puste.',
    },
    {
      label: 'Z otwartą flagą',
      value: flagged ?? '—',
      // Zielone zero znaczy „sprawdziliśmy i nie ma nic do wyjaśnienia" — dlatego
      // należy się WYŁĄCZNIE odpowiedzi serwera, nigdy jej brakowi.
      tone: flagged == null ? undefined : flagged === 0 ? 'green' : 'amber',
      note: 'Dni z rozbieżnością do wyjaśnienia. Flaga nie zmienia liczb — opisuje je.',
    },
    {
      label: 'Wyeksportowane',
      value: exported ?? '—',
      note: 'Dni z kartą w `export_log`. Karta powstaje po zamknięciu dnia, nie w jego trakcie.',
    },
  ];
}
