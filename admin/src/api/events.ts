/**
 * UZ Aero - panel: rejestr zdarzeń (`/admin/api/events`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * ══ `type` JEST PARAMETREM POWTARZALNYM ══
 * Ekran filtruje chipami, a chip bywa grupą typów. Dlatego składamy `?type=a&type=b`,
 * a nie listy po przecinku: przecinek byłby własnym formatem, który trasa musiałaby
 * rozbierać, a powtórzony parametr rozumie każdy serwer i każdy klient - łącznie
 * z paskiem adresu, do którego ten link ma dać się wkleić.
 *
 * ══ NAZWY PARAMETRÓW SĄ PO ANGIELSKU I TO NIE JEST NIEKONSEKWENCJA ══
 * Adres EKRANU jest po polsku (`#/zdarzenia?od=…&samolot=…`), bo to powierzchnia
 * produktu widoczna w pasku przeglądarki. Query string API jest po angielsku, bo to
 * kontrakt kodu - dokładnie tak samo, jak przy dzienniku audytu (`?actor=`, `?from=`).
 * Tłumaczenie jednego na drugie mieszka w `screens/events/eventsFilters.ts`.
 */

import type { EventsPageDto } from './dto';
import { apiGet } from './httpClient';

/**
 * Filtr rejestru tak, jak przyjmuje go trasa. Wszystko poza `limit` opcjonalne -
 * brak filtra znaczy „pokaż wszystko".
 *
 * `type` jest listą kodów Z KATALOGU domeny, mimo że rejestr może zawierać typy spoza
 * katalogu: filtrować da się WYŁĄCZNIE po tym, co system zna, a kod nieznany serwer
 * odrzuca czterysetką. Ciche zignorowanie takiego parametru pokazałoby pełny rejestr
 * pod etykietą zawężenia.
 */
export interface EventListQuery {
  type?: string[];
  /** DOKŁADNY uuid zdarzenia - wklejenie go z telefonu to główny scenariusz ekranu. */
  uuid?: string;
  sessionUuid?: string;
  aircraftId?: string;
  /** Dopasowuje PIC-a albo Duala - dzień szkolny należy do obu. */
  pilotId?: string;
  sourceDevice?: string;
  /** Dzień UTC `YYYY-MM-DD` włącznie, po CZASIE PRZYJĘCIA (`received_at`). */
  from?: string;
  to?: string;
  sort?: 'asc' | 'desc';
  limit: number;
  /** Nieprzezroczysty kursor keyset z poprzedniej odpowiedzi; brak = pierwsza strona. */
  cursor?: string;
}

function queryString(query: EventListQuery): string {
  const params = new URLSearchParams();
  // Tablica idzie jako POWTÓRZONY parametr (`append`), reszta jako pojedyncza wartość.
  // Pola nieustawione pomijamy zamiast wysyłać puste: `?uuid=` to dla zoda po drugiej
  // stronie napis pusty, czyli 400, a nie „bez filtra".
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    params.set(key, String(value));
  }
  return params.toString();
}

export function listEvents(query: EventListQuery): Promise<EventsPageDto> {
  return apiGet<EventsPageDto>(`/events?${queryString(query)}`);
}
