/**
 * UZ Aero — panel: sklejenie stron kursorowych rejestru i stany brzegowe (moduł CZYSTY).
 *
 * Bliźniak `screens/audit/auditPages.ts` i te same reguły kursora — z jedną różnicą,
 * która na tym ekranie jest istotna: `events` nie ma żadnej górnej granicy i rośnie
 * najszybciej ze wszystkich tabel w systemie. Dlatego podpis „pokazano N z M" jest tu
 * wypisywany ZAWSZE: lista przycięta kursorem bez podpisu wygląda na komplet, a to
 * najgorszy możliwy tryb awarii narzędzia śledczego.
 */

import type { EventCountsDto, EventEntryDto, EventsPageDto } from '../../api/dto';

export interface EventsPages {
  items: EventEntryDto[];
  shown: number;
  /**
   * Liczniki WEDŁUG SERWERA, policzone nad całym zakresem zapytania.
   *
   * **`null` = odpowiedzi NIE MA** (zapytanie w drodze albo zakończone błędem), a nie
   * „same zera". To rozróżnienie jest tu całą treścią: zero jest twierdzeniem o świecie
   * — „w całym rejestrze nie ma ani jednego zdarzenia" — i nie wolno go postawić obok
   * banera o nieudanym pobraniu.
   */
  counts: EventCountsDto | null;
  hasMore: boolean;
}

/**
 * `counts` bierzemy z PIERWSZEJ strony i to jest jedyne miejsce, gdzie to widać: serwer
 * liczy je wyłącznie dla żądania bez kursora, bo są własnością ZAPYTANIA, a nie strony
 * (uzasadnienie kosztu: `server/src/infrastructure/pg/admin/eventsReadRepo.ts`).
 * Kolejne strony niosą `null`, więc czytanie ich licznika kazałoby kaflom zgasnąć
 * dokładnie w chwili, w której człowiek dociąga kolejne zdarzenia.
 */
export function eventsPages(pages: readonly EventsPageDto[] | undefined): EventsPages {
  if (pages == null || pages.length === 0) {
    return { items: [], shown: 0, counts: null, hasMore: false };
  }

  const items = pages.flatMap((page) => page.items);
  const last = pages[pages.length - 1]!;

  return {
    items,
    shown: items.length,
    counts: pages[0]!.counts,
    // „Czy jest więcej" pyta OSTATNIĄ stronę: `nextCursor` pierwszej jest już zużyty.
    hasMore: last.nextCursor != null,
  };
}

export function pagesSummary(state: EventsPages): string {
  // Brak liczby to brak zdania o liczbie. „Brak zdarzeń" byłoby tu odpowiedzią na
  // pytanie, na które nie mamy danych — a pod spodem stoi baner o nieudanym pobraniu.
  if (state.counts == null) return 'Liczba zdarzeń nieznana — serwer nie odpowiedział.';
  const total = state.counts.total;
  if (total === 0) return 'Brak zdarzeń w tym zawężeniu.';
  if (!state.hasMore && state.shown >= total) return `Pokazano wszystkie ${total}.`;
  return `Pokazano ${state.shown} z ${total}.`;
}

export interface EventsEmpty {
  title: string;
  note: string;
  /**
   * Uuid, którego szukano — wypełnione WYŁĄCZNIE przy pustym wyniku szukania po uuid-zie.
   * Ekran proponuje wtedy przejście „a może to uuid sesji", bo oba wyglądają tak samo,
   * a pomyłka jest naturalna.
   */
  sessionRetryUuid: string | null;
}

/**
 * Pusty rejestr mówi TRZY różne rzeczy i nie wolno na nie użyć jednego napisu.
 *
 * Najważniejszy jest przypadek środkowy. `ANALIZA` §5 nazywa go najczęstszym pytaniem,
 * jakie ten ekran dostanie: administrator wkleja uuid z telefonu pilota i chce
 * wiedzieć, czy zdarzenie DOTARŁO. Pustka na to nie odpowiada — „nie ma wierszy"
 * i „to zdarzenie nigdy nie doszło na serwer" to dla człowieka dwa różne zdania,
 * a drugie wskazuje konkretne działanie (sprawdź outbox telefonu, ekran 11).
 */
export function eventsEmpty(options: {
  narrowed: boolean;
  uuidLookup: boolean;
  uuid: string | null;
}): EventsEmpty {
  if (options.uuidLookup && options.uuid != null) {
    return {
      title: 'TO ZDARZENIE NIE DOTARŁO',
      note:
        `W rejestrze nie ma wiersza o uuid ${options.uuid}. Rejestr jest append-only, więc ` +
        'nie zostało skasowane — po prostu nigdy nie doszło. Sprawdź outbox telefonu ' +
        '(ekran 11 aplikacji): niewysłane zdarzenie czeka tam do czasu, aż będzie sieć. ' +
        'Jeśli wkleiłeś uuid dnia lotnego, a nie zdarzenia — szukaj po sesji.',
      sessionRetryUuid: options.uuid,
    };
  }

  if (options.narrowed) {
    return {
      title: 'NIC W TYM ZAWĘŻENIU',
      note:
        'Żadne zdarzenie nie spełnia filtra z adresu. Zdejmij zakres dat, samolot, pilota ' +
        'albo typ — rejestr nie jest pusty, jest zawężony. Pamiętaj, że zakres dat idzie ' +
        'po czasie PRZYJĘCIA przez serwer, a nie po czasie zdarzenia: paczka z zaległego ' +
        'outboxu dociera dobę po locie.',
      sessionRetryUuid: null,
    };
  }

  return {
    title: 'REJESTR JEST PUSTY',
    note:
      'Baza nie zawiera ani jednego zdarzenia. Jeśli piloci już latali, to nie jest cisza ' +
      'w klubie, tylko awaria synchronizacji — zdarzenia leżą w outboxach telefonów. ' +
      'Rejestr zapełnia się wyłącznie przez `POST /events`; panel nic tu nie dopisuje.',
    sessionRetryUuid: null,
  };
}
