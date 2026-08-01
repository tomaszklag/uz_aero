/**
 * UZ Aero — panel: SKLEJENIE STRON KURSOROWYCH w jedną listę (moduł CZYSTY).
 *
 * Lista dni jest pierwszym konsumentem paginacji keyset w tym repo, więc reguły,
 * które tu obowiązują, warto mieć zapisane w jednym miejscu — razem z testem.
 *
 * ══ CZTERY RZECZY, KTÓRYCH NIE WOLNO ZGUBIĆ ══
 *
 *  1. **Kursor jest nieprzezroczysty i jednokierunkowy.** Opisuje pozycję
 *     w porządku serwera (`claim_time`, `session_uuid`), nie numer strony. Panel go
 *     odsyła, nigdy nie buduje i nigdy nie zamienia na `OFFSET` — bo `OFFSET` na
 *     tabeli, do której telefony dosyłają dni, gubi wiersze i dubluje inne.
 *  2. **Strony się DOKŁADAJĄ, nie podmieniają.** Skoro kursor prowadzi tylko
 *     w przód, „poprzednia strona" nie istnieje jako pytanie do serwera. Sklejona
 *     lista jest jedyną formą, w której da się wrócić wzrokiem wyżej.
 *  3. **Granica strony nie ma szwu.** Kursor koduje OSTATNI wiersz strony, a predykat
 *     serwera jest ostry (`<`, nie `<=`), więc pierwszy wiersz następnej strony jest
 *     kolejnym, a nie powtórzonym. Konkatenacja jest tu poprawna bez odsiewania
 *     duplikatów — i test tego pilnuje, zamiast dokładać `Set` „na wszelki wypadek",
 *     który maskowałby zepsuty predykat.
 *  4. **„Czy jest więcej" pyta OSTATNIĄ stronę, nie pierwszą.** `nextCursor` pierwszej
 *     strony jest już zużyty. Czytanie go dałoby przycisk „pokaż kolejne", który po
 *     dojściu do końca listy nigdy nie gaśnie.
 */

import type { SessionListItemDto, SessionPageDto } from '../../api/dto';

export interface DayPages {
  /** Wszystkie wiersze pobrane dotąd, w porządku serwera. */
  items: SessionListItemDto[];
  /** Ile wierszy widać. */
  shown: number;
  /**
   * Ile dni spełnia filtr WEDŁUG SERWERA — także tych jeszcze niepobranych.
   *
   * **`null` = odpowiedzi NIE MA** (zapytanie w drodze albo zakończone błędem), a nie
   * „zero". To rozróżnienie jest tu całą treścią: zero jest twierdzeniem o świecie
   * — „klub nie ma ani jednego dnia lotnego" — i nie wolno go postawić obok banera
   * o nieudanym pobraniu.
   *
   * Bliźniaczy `screens/audyt/audytPages.ts` niesie `null` z DWÓCH powodów, bo serwer
   * liczy tam wpisy wyłącznie dla pierwszej strony. Tutaj powód jest jeden: dni liczy
   * `PgAdminSessionsRepo.list` przy KAŻDYM żądaniu, więc `null` znaczy dokładnie tyle,
   * że nie mamy żadnej odpowiedzi.
   */
  total: number | null;
  /** Czy serwer ma dla nas kolejną stronę (kursor ostatniej odpowiedzi). */
  hasMore: boolean;
}

/**
 * Strony z `useInfiniteQuery` → stan listy. Brak stron (nic jeszcze nie przyszło albo
 * pobranie się nie udało) daje pustą listę, `hasMore: false` i `total: null` — pusty
 * stan panelu ma być pusty, a nie obiecywać ciąg dalszy, którego nikt nie zapowiedział,
 * ani podawać liczbę, której nikt nie przysłał.
 *
 * `total` bierzemy z OSTATNIEJ pobranej strony, a nie z pierwszej: serwer liczy go
 * tym samym filtrem przy każdym żądaniu, więc ostatni jest najświeższy. Jeśli w czasie
 * przeglądania dojdzie nowy dzień, licznik ma to pokazać — sklejona lista i tak nie
 * udaje migawki.
 */
export function dayPages(pages: readonly SessionPageDto[] | undefined): DayPages {
  if (pages == null || pages.length === 0) {
    return { items: [], shown: 0, total: null, hasMore: false };
  }

  const items = pages.flatMap((page) => page.items);
  const last = pages[pages.length - 1]!;

  return {
    items,
    shown: items.length,
    total: last.total,
    hasMore: last.nextCursor != null,
  };
}

/**
 * Podpis pod tabelą: ile widać z ilu. Wypisujemy go ZAWSZE, gdy coś zostało —
 * lista sklejona z kilku stron nie ma innego sposobu, żeby powiedzieć, że nie jest
 * całością. Milcząca lista przycięta kursorem to najgorszy tryb awarii narzędzia
 * nadzoru: wygląda na komplet.
 */
export function pagesSummary(state: DayPages): string {
  // Brak liczby to brak zdania o liczbie. „Brak dni" byłoby tu odpowiedzią na pytanie,
  // na które nie mamy danych — a pod spodem stoi baner o nieudanym pobraniu.
  if (state.total == null) return 'Liczba dni nieznana — serwer nie odpowiedział.';
  if (state.total === 0) return 'Brak dni w tym zawężeniu.';
  if (!state.hasMore && state.shown >= state.total) {
    return `Pokazano wszystkie ${state.total}.`;
  }
  return `Pokazano ${state.shown} z ${state.total}.`;
}

export interface DniEmpty {
  title: string;
  note: string;
}

/**
 * Pusta lista mówi CO INNEGO w zależności od tego, czego szukaliśmy.
 *
 * „Nic w tym filtrze" jest wiadomością o zapytaniu; „rejestr jest pusty" — o stanie
 * systemu. Jeden napis na oba przypadki kazałby administratorowi zgadywać, czy widzi
 * własną literówkę, czy klub, w którym nikt jeszcze nie latał.
 */
export function dniEmpty(narrowed: boolean): DniEmpty {
  if (narrowed) {
    return {
      title: 'NIC W TYM ZAWĘŻENIU',
      note:
        'Żaden dzień nie spełnia filtra, który jest w adresie. Zdejmij zakres dat, samolot, ' +
        'pilota, stan albo operację — lista nie jest pusta, jest zawężona. Uwaga na sesje ' +
        'bez potwierdzenia przedlotowego: nie mają daty dnia, więc każdy zakres dat je pomija.',
    };
  }
  return {
    title: 'REJESTR NIE MA JESZCZE ŻADNEGO DNIA',
    note:
      'Wiersz powstaje wtedy, gdy telefon dośle pierwszą paczkę zdarzeń sesji — nie zakłada ' +
      'go człowiek i nie da się go tu dodać. Dzień pojawia się na tej liście od razu po ' +
      '`session_claim`, na długo przed zamknięciem i eksportem.',
  };
}
