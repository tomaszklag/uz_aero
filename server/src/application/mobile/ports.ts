/**
 * UZ Aero (serwer) — PORTY warstwy aplikacji dla APLIKACJI PILOTA.
 *
 * Trzeci plik portów po `common/ports.ts` i `admin/ports.ts`, z tego samego powodu co
 * tamten podział: jeden plik portów na POWIERZCHNIĘ, nie jeden na projekt. `common/`
 * ma znaczenie TWARDE — „korzysta z tego panel i telefon" (`CLAUDE.md`,
 * `docs/architektura-kodu.md`) — więc kontrakt czytany wyłącznie przez preflight
 * telefonu rozmyłby je do „wszystko, co nie jest panelem".
 *
 * Kierunek zależności bez zmian: `application/mobile` zna wyłącznie te interfejsy,
 * implementacje (`infrastructure/pg/mobile/*`) wstrzykuje composition root.
 */

import type { OperationType } from '@uzaero/domain';

import type { Queryable } from '../common/ports.ts';

/**
 * Jedna podpowiedź uzupełnienia: WARTOŚĆ, której pilot już kiedyś użył, i chwila
 * ostatniego użycia. Stempel jedzie na telefon, bo lista jest posortowana od
 * najnowszej — a bez daty ekran nie umiałby powiedzieć, czy „SKY CAMP" to zeszły
 * tydzień, czy zeszły sezon.
 */
export interface TaskSuggestion {
  value: string;
  /** Znacznik dnia sesji, w której wartość wystąpiła ostatni raz. */
  lastUsedAt: Date;
}

/**
 * Podpowiedź oznaczenia klienta. Niesie dodatkowo RODZAJ OPERACJI z najnowszej sesji
 * tego klienta — po to, żeby ekran zadania mógł podpowiadać w kontekście („SKY CAMP"
 * to skoki, a nie egzamin). `null` = ta sesja nie ma preflightu, więc rodzaju operacji
 * nikt nie podał; zgadywanie go z historii byłoby wymyślaniem danych.
 */
export interface ClientSuggestion extends TaskSuggestion {
  operation: OperationType | null;
}

/**
 * PODPOWIEDZI DO ZADANIA DNIA (issue #14) — czytane z projekcji `sessions`, nigdy
 * z rejestru zdarzeń: `client` i `notes` są kolumnami, które wypełnia `sessionRowFrom`,
 * więc podpowiedź powtarza wartość policzoną przez `projectSession`, a nie drugą jej
 * wersję wyciągniętą z payloadu (reguła §7.1 `docs/architektura-panelu-serwer.md`).
 *
 * ══ DWIE METODY, DWA RÓŻNE ZAKRESY — I TO JEST TREŚĆ TEGO PORTU ══
 * `clients` czyta sesje CAŁEGO KLUBU, `notes` wyłącznie sesje JEDNEGO pilota.
 * To nie jest niekonsekwencja: oznaczenie klienta to kontrahent klubu (nowy pilot
 * lecący dla SKY CAMP ma je zobaczyć, choć sam nigdy go nie wpisał), a notatka jest
 * osobistą uwagą pilota o okolicznościach dnia — cudza notatka byłaby dla niego
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
