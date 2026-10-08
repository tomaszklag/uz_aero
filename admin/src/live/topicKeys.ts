/**
 * Ninerdeck - panel: TEMAT KANAŁU → KLUCZE ZAPYTAŃ do unieważnienia (4.0.0,
 * `docs/kanal-klubu.md` §3.4, §4; epik KK-D #246).
 *
 * Sygnał `changed` nie niesie treści: mówi „to się zmieniło", a panel unieważnia
 * zapytania, które to pokazują. React Query pobiera od nowa WYŁĄCZNIE zapytania aktywne,
 * czyli to, co jest na ekranie - reszta jest tylko oznaczona jako nieświeża i dociągnie
 * się przy wejściu, jak dotąd. Zero odpytywania (K1).
 *
 * Mapa jest jedna i czysta, a klucze bierze z `queries/keys.ts` - dokładając ekran
 * odświeżany na żywo, dopisuje się go TUTAJ, razem z testem.
 *
 * Zlecenia (epik Z-D #248): temat `orders` odświeża listy modułu; kalendarz odświeżają
 * tematy terminu (`booking:`, `calendar:`), które serwer wysyła razem z nim, bo
 * zlecenie JEST rezerwacją.
 */

import { keys } from '../queries/keys';

export type QueryPrefix = readonly unknown[];

function prefixesFor(topic: string): readonly QueryPrefix[] {
  const colon = topic.indexOf(':');
  const kind = colon < 0 ? topic : topic.slice(0, colon);
  const id = colon < 0 ? '' : topic.slice(colon + 1);
  switch (kind) {
    // Siatka kalendarza w każdym zakresie - pobiera się od nowa tylko widoczny.
    case 'calendar':
      return [keys.calendar.all];
    // Jedna zajętość: szuflada wpisu i ścieżka zgód z kolejką decyzji. Siatkę odświeża
    // temat doby, który serwer wysyła razem z tym.
    case 'booking':
      return id === '' ? [] : [keys.calendar.detail(id), keys.approvals.all];
    // Karta samolotu w panelu to lista obserwowanych na `#/konto` (K3); moduł Samoloty
    // odświeża się przy wejściu.
    case 'aircraft':
      return [keys.account.watches];
    // Doba dziennika: oś floty, oś pilotów i grid operacji jednej maszyny albo osoby.
    case 'log':
      return [
        ['log', 'fleet'],
        ['log', 'pilots'],
        ['log', 'sessions'],
      ];
    // Jedna operacja: jej karta, podgląd korekty i stan karty dnia w „Do sprawdzenia".
    case 'session':
      return id === ''
        ? []
        : [keys.log.session(id), ['log', 'preview', id], keys.exports.history(id), keys.exports.sheet(id)];
    // „Do sprawdzenia": suma w kolumnie, rozjazdy i karty dnia.
    case 'attention':
      return [keys.attention, keys.flags.all, keys.exports.all];
    // Zlecenia: obie połowy listy i liczby modułu (odpowiedź, odczyt, przydział, nowe
    // zlecenie). Serwer wysyła ten temat każdej osobie, której listy to dotyczy.
    case 'orders':
      return [keys.orders.all];
    // Jedno zlecenie: jego karta w szufladzie (odczyt, odpowiedź, przydział, edycja,
    // odwołanie). Kształt karty zależy od widza, więc pobiera się RESTem (sygnał bez treści).
    // Rozmowy tego zlecenia też: zamykają się razem z nim (odwołanie, odebranie, komplet).
    case 'order':
      return id === '' ? [] : [keys.orders.card(id), keys.orders.threads(id)];
    default:
      return [];
  }
}

/** Klucze dla tematów jednej ramki - bez powtórzeń, w kolejności tematów. */
export function prefixesForTopics(topics: readonly string[]): QueryPrefix[] {
  const seen = new Set<string>();
  const out: QueryPrefix[] = [];
  for (const topic of topics) {
    for (const prefix of prefixesFor(topic)) {
      const key = JSON.stringify(prefix);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(prefix);
    }
  }
  return out;
}
