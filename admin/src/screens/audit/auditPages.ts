/**
 * UZ Aero — panel: sklejenie stron kursorowych dziennika i stany brzegowe (moduł CZYSTY).
 *
 * Bliźniak `screens/days/daysPages.ts` i te same cztery reguły kursora — z jedną różnicą,
 * która na tym ekranie jest istotna: `admin_audit` nie ma górnej granicy wielkości.
 * Dni lotne kończą się razem z historią klubu, wpisów audytu przybywa przy każdym
 * kliknięciu administratora. Dlatego podpis „pokazano N z M" jest tu wypisywany
 * ZAWSZE — lista przycięta kursorem bez podpisu wygląda na komplet.
 */

import type { AuditPageDto, AuditEntryDto } from '../../api/dto';

export interface AuditPages {
  items: AuditEntryDto[];
  shown: number;
  /**
   * Ile wpisów spełnia filtr WEDŁUG SERWERA — także tych jeszcze niepobranych.
   *
   * **`null` = odpowiedzi NIE MA** (zapytanie w drodze albo zakończone błędem), a nie
   * „zero". To rozróżnienie jest tu całą treścią: zero jest twierdzeniem o świecie
   * — „w całej historii systemu nikt niczego nie zmienił" — i nie wolno go postawić
   * obok banera o nieudanym pobraniu.
   */
  total: number | null;
  hasMore: boolean;
}

/**
 * `total` bierzemy z PIERWSZEJ strony i to jest jedyne miejsce, gdzie go widać: serwer
 * liczy go wyłącznie dla żądania bez kursora, bo liczba wpisów w zawężeniu jest
 * własnością ZAPYTANIA, nie strony (uzasadnienie kosztu:
 * `server/src/infrastructure/pg/admin/auditReadRepo.ts`). Kolejne strony niosą `null`,
 * więc czytanie ich licznika kazałoby podpisowi „pokazano N z M" zgasnąć do „—"
 * dokładnie w chwili, w której człowiek dociąga kolejne wpisy.
 *
 * Ceną jest licznik, który nie odświeża się w trakcie przeglądania. Sklejona lista i tak
 * nie udaje migawki, a pytanie „ile jest w tym zawężeniu" zadaliśmy raz — przy wejściu.
 */
export function auditPages(pages: readonly AuditPageDto[] | undefined): AuditPages {
  if (pages == null || pages.length === 0) {
    return { items: [], shown: 0, total: null, hasMore: false };
  }

  const items = pages.flatMap((page) => page.items);
  const last = pages[pages.length - 1]!;

  return {
    items,
    shown: items.length,
    total: pages[0]!.total,
    // „Czy jest więcej" pyta OSTATNIĄ stronę: `nextCursor` pierwszej jest już zużyty.
    hasMore: last.nextCursor != null,
  };
}

export function pagesSummary(state: AuditPages): string {
  // Brak liczby to brak zdania o liczbie. „Brak wpisów" byłoby tu odpowiedzią na
  // pytanie, na które nie mamy danych — a pod spodem stoi baner o nieudanym pobraniu.
  if (state.total == null) return 'Liczba wpisów nieznana — serwer nie odpowiedział.';
  if (state.total === 0) return 'Brak wpisów w tym zawężeniu.';
  if (!state.hasMore && state.shown >= state.total) {
    return `Pokazano wszystkie ${state.total}.`;
  }
  return `Pokazano ${state.shown} z ${state.total}.`;
}

export interface AuditEmpty {
  title: string;
  note: string;
}

/**
 * Pusty dziennik mówi CO INNEGO w zależności od tego, czego szukaliśmy.
 *
 * „Nic w tym filtrze" jest wiadomością o zapytaniu; „nikt jeszcze niczego nie zmienił" —
 * o stanie systemu, i jest to stan całkowicie normalny: panel powstał niedawno, a wpis
 * powstaje wyłącznie przy zmianie robionej z panelu. Jeden napis na oba przypadki
 * kazałby administratorowi zgadywać, czy widzi własną literówkę, czy prawdę.
 */
export function auditEmpty(narrowed: boolean): AuditEmpty {
  if (narrowed) {
    return {
      title: 'NIC W TYM ZAWĘŻENIU',
      note:
        'Żaden wpis nie spełnia filtra z adresu. Zdejmij zakres dat, konto, obiekt albo grupę ' +
        'akcji — dziennik nie jest pusty, jest zawężony. Jeśli przyszedłeś tu linkiem „ślad ' +
        'w audycie", brak wpisu znaczy dokładnie tyle: tego obiektu nikt z panelu nie ruszał.',
    };
  }
  return {
    title: 'DZIENNIK JEST PUSTY',
    note:
      'Wpis powstaje wyłącznie razem ze zmianą zrobioną z panelu — tą samą transakcją, co ' +
      'jej skutek. Pusty dziennik znaczy więc „nikt jeszcze niczego stąd nie zmienił", ' +
      'a nie „logowanie nie działa". Praca pilotów w aplikacji nie zapisuje się tutaj; ' +
      'ona jest w rejestrze zdarzeń.',
  };
}
