/**
 * UZ Aero (serwer) - PORTY warstwy aplikacji dla APLIKACJI PILOTA.
 *
 * Trzeci plik portów po `common/ports.ts` i `admin/ports.ts`, z tego samego powodu co
 * tamten podział: jeden plik portów na POWIERZCHNIĘ, nie jeden na projekt. `common/`
 * ma znaczenie TWARDE - „korzysta z tego panel i telefon" (`CLAUDE.md`,
 * `docs/architektura-kodu.md`) - więc kontrakt czytany wyłącznie przez preflight
 * telefonu rozmyłby je do „wszystko, co nie jest panelem".
 *
 * Kierunek zależności bez zmian: `application/mobile` zna wyłącznie te interfejsy,
 * implementacje (`infrastructure/pg/mobile/*`) wstrzykuje composition root.
 */

import type { Event, OperationType } from '@uzaero/domain';

import type { Queryable } from '../common/ports.ts';

/**
 * ODTWORZENIE REJESTRU NA URZĄDZENIU (§4.9) - kierunek ODWROTNY do `POST /events`.
 *
 * Powód istnienia jest jednym zdaniem z issue #32: telefon, który stracił dane
 * (czyszczenie pamięci aplikacji, reinstalacja, nowy sprzęt), nie ma dziś jak odzyskać
 * własnej historii, chociaż leży ona kompletna na serwerze. Ekrany „Mój dzień" i
 * „Historia dni" liczą się WYŁĄCZNIE z lokalnego strumienia - i to zostaje, bo na tym
 * stoi offline-first (§4.1 pkt 1). Brakuje nie odczytu przez sieć, tylko sposobu na
 * ODBUDOWANIE lokalnego strumienia z jego lustra.
 *
 * ══ ZAKRES: WYŁĄCZNIE SESJE, W KTÓRYCH PILOT JEST PIC-em ══
 * `pic_id` to jedyny piszący sesji (§4.1 pkt 3), więc te i tylko te zdarzenia telefon
 * kiedykolwiek miał u siebie. Dobranie tu także sesji, w których pilot był Dualem,
 * dopisałoby do jego lokalnego strumienia CUDZE sesje - a „Historia dni" pokazuje
 * wszystko, co leży w rejestrze telefonu, więc pilot zobaczyłby dni, których nie
 * prowadził, i mógłby je „otworzyć i poprawić". Godziny Duala liczy serwer (§4.1 pkt 3)
 * i to on jest miejscem, w którym mają się pojawić.
 *
 * ══ PORZĄDEK: `received_at, uuid` ROSNĄCO ══
 * Kursor odtworzenia porusza się TYLKO w przód: to, co przyszło na serwer po pozycji
 * kursora, jest dokładnie tym, czego telefon jeszcze nie widział. Porządek malejący
 * (jak w liście panelu) miałby ruchomy początek - każda dosyłka z terenu przesuwałaby
 * czoło listy i telefon musiałby zaczynać od nowa. `uuid` jako tie-breaker z tego samego
 * powodu, co w `A04`: cała paczka jednego synca ma identyczny `received_at`, więc bez
 * rozstrzygnięcia granica strony wypadałaby w jej środku.
 */
export interface MyEventsPort {
  /**
   * Strona zdarzeń pilota PO pozycji kursora.
   *
   * `null` = kursor nieczytelny (wartość z zewnątrz - trasa odpowiada 400, nie 500;
   * wzorzec `AdminEventsReadPort.list`).
   *
   * ══ `nextCursor` I `hasMore` TO DWIE RÓŻNE ODPOWIEDZI ══
   * `nextCursor` opisuje POZYCJĘ za ostatnim oddanym wierszem i jest wypełniony zawsze,
   * gdy strona jest niepusta - także wtedy, gdy była ostatnia. `hasMore` mówi, czy
   * w TEJ CHWILI jest jeszcze co czytać. Zlanie obu w jedno pole (kursor `null` = koniec)
   * kosztowałoby telefon ponowne pobranie ostatniej strony przy KAŻDEJ okazji
   * synchronizacji - bo po dojściu do końca nie miałby czego zapamiętać i musiałby
   * pytać od poprzedniej pozycji do końca świata.
   */
  page(
    db: Queryable,
    picId: string,
    cursor: string | null,
    limit: number,
  ): Promise<{ events: Event[]; nextCursor: string | null; hasMore: boolean } | null>;
}

/**
 * Jedna podpowiedź uzupełnienia: WARTOŚĆ, której pilot już kiedyś użył, i chwila
 * ostatniego użycia. Stempel jedzie na telefon, bo lista jest posortowana od
 * najnowszej - a bez daty ekran nie umiałby powiedzieć, czy „SKY CAMP" to zeszły
 * tydzień, czy zeszły sezon.
 */
export interface TaskSuggestion {
  value: string;
  /** Znacznik dnia sesji, w której wartość wystąpiła ostatni raz. */
  lastUsedAt: Date;
}

/**
 * Podpowiedź oznaczenia klienta. Niesie dodatkowo RODZAJ OPERACJI z najnowszej sesji
 * tego klienta - po to, żeby ekran zadania mógł podpowiadać w kontekście („SKY CAMP"
 * to skoki, a nie egzamin). `null` = ta sesja nie ma preflightu, więc rodzaju operacji
 * nikt nie podał; zgadywanie go z historii byłoby wymyślaniem danych.
 */
export interface ClientSuggestion extends TaskSuggestion {
  operation: OperationType | null;
}

/**
 * PODPOWIEDZI DO ZADANIA DNIA (issue #14) - czytane z projekcji `sessions`, nigdy
 * z rejestru zdarzeń: `client` i `notes` są kolumnami, które wypełnia `sessionRowFrom`,
 * więc podpowiedź powtarza wartość policzoną przez `projectSession`, a nie drugą jej
 * wersję wyciągniętą z payloadu (reguła §7.1 `docs/architektura-panelu-serwer.md`).
 *
 * ══ DWIE METODY, DWA RÓŻNE ZAKRESY - I TO JEST TREŚĆ TEGO PORTU ══
 * `clients` czyta sesje CAŁEGO KLUBU, `notes` wyłącznie sesje JEDNEGO pilota.
 * To nie jest niekonsekwencja: oznaczenie klienta to kontrahent klubu (nowy pilot
 * lecący dla SKY CAMP ma je zobaczyć, choć sam nigdy go nie wpisał), a notatka jest
 * osobistą uwagą pilota o okolicznościach dnia - cudza notatka byłaby dla niego
 * szumem, a czasem informacją, której nie powinien dostać w podpowiedzi.
 *
 * Zakres jest więc WŁASNOŚCIĄ METODY, a nie parametrem do przekazania z trasy:
 * `notes` wymaga `picId`, `clients` nie ma go gdzie przyjąć. Jeden port, bo obie
 * odpowiadają na to samo pytanie („czym uzupełniano zadanie dnia"), z tej samej
 * tabeli i dla jednego endpointu.
 */
export interface TaskSuggestionsPort {
  /** Różne niepuste `sessions.client` z CAŁEGO klubu, najnowsze pierwsze. */
  clients(db: Queryable, limit: number): Promise<ClientSuggestion[]>;
  /** Różne niepuste `sessions.notes` sesji TEGO pilota, najnowsze pierwsze. */
  notes(db: Queryable, picId: string, limit: number): Promise<TaskSuggestion[]>;
}
