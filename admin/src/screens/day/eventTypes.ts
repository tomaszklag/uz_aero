/**
 * UZ Aero — panel: KATALOG TYPÓW ZDARZEŃ na osi dnia (moduł CZYSTY).
 *
 * **Dlaczego `Record<EventType, …>`, a nie tablica** — ten sam powód, co przy
 * `flagTypes.ts` i `operations.ts`: panelowi wolno importować z `@uzaero/domain`
 * wyłącznie TYPY (§5.1), więc `EVENT_TYPES` nie może wziąć wprost. Mapa indeksowana
 * typem domenowym rozwiązuje to bez wyjątku od reguły — dopisanie czternastego typu
 * zdarzenia **wywala kompilację tego pliku**, zamiast pokazać administratorowi wiersz
 * bez kropki i bez plakietki.
 *
 * ══ CO ZNACZY KOLOR ══
 * Kropka i plakietka opisują ROLĘ zdarzenia w dniu, nie jego ważność:
 *  • zielony — otwiera (claim, preflight, uruchomienie silnika),
 *  • niebieski — opisuje lot (start, lądowanie, zrzut),
 *  • bursztynowy — wymaga uwagi człowieka (tankowanie, zmiana załogi, wpis ręczny),
 *  • czerwony — zamyka albo unieważnia (wyłączenie silnika, koniec dnia, korekta),
 *  • neutralny — nie wpływa na żaden bilans (kołowanie).
 * Ten sam słownik, co plakietki w tabelach — inaczej kolor przestaje cokolwiek znaczyć.
 */

import type { EventType } from '@uzaero/domain';

import type { PillTone } from '../../ui/components/Pill';
import type { TimelineTone } from '../../ui/components/TimelineRow';

export interface EventMeta {
  /** Ton kropki na szynie osi. */
  dot: TimelineTone;
  /** Plakietka zamykająca wiersz — rodzaj zdarzenia jednym słowem, jak w mockupie. */
  badge: string;
  badgeTone: PillTone;
  /**
   * KTÓRE akcje korekty mają dla tego typu sens (`A02b`). LUSTRO reguł domeny
   * `CORRECTION_TARGET_NOT_ALLOWED` i `CORRECTION_FIELD_NOT_ALLOWED`
   * (`packages/domain/src/rules/sessionRules.ts`) — jedyne miejsce w panelu,
   * w którym ta wiedza istnieje.
   *
   * **Lista, nie flaga — od issue #43.** Wcześniej wystarczał `correctable: boolean`,
   * bo obie akcje (`retime`, `void`) dotyczyły tego samego: FAKTU zajścia zdarzenia.
   * `amend` poprawia WARTOŚĆ, więc korygowalność przestała być cechą typu i stała się
   * cechą PARY typ+akcja: zdania samolotu nie da się przesunąć ani unieważnić, ale
   * jego odczyt paliwa i motogodzin — owszem, i po zamknięciu okna pilota może to
   * zrobić WYŁĄCZNIE administrator. Binarna flaga odbierała mu wtedy przycisk „Popraw",
   * czyli jedyne wejście w tę operację.
   *
   * **Panel nie egzekwuje reguł — serwer robi to przy każdym żądaniu, także przy
   * podglądzie.** Kopia jest tu po to, żeby nie zapraszać człowieka w formularz, który
   * i tak odbije: `session_claim` to tożsamość dnia, a korekty się nie poprawia —
   * poprawia się fakt, więc kolejna korekta celu po prostu zastępuje poprzednią.
   *
   * Gdyby domena kiedyś zmieniła te listy, rozjazd zobaczy administrator jako
   * naruszenie w podglądzie, a nie jako złe liczby — czyli w najbezpieczniejszy
   * z możliwych sposobów.
   */
  corrections: readonly CorrectionActionId[];
}

/** Akcje, które zna domena — nazwy 1:1 z `EventCorrectionPayload`. */
export type CorrectionActionId = 'retime' | 'void' | 'amend';

/** Fakt operacyjny: czas do poprawienia, zdarzenie do unieważnienia. */
const FACT: readonly CorrectionActionId[] = ['retime', 'void'];
/** Odczyt łańcucha MH: wyłącznie wartość — czasu wyznacza przekazanie maszyny. */
const READING: readonly CorrectionActionId[] = ['amend'];
/** Nic — tożsamość sesji i sama korekta. */
const NONE: readonly CorrectionActionId[] = [];

export const EVENT_META: Record<EventType, EventMeta> = {
  session_claim: { dot: 'green', badge: 'claim', badgeTone: 'green', corrections: NONE },
  preflight_confirm: { dot: 'green', badge: 'preflight', badgeTone: 'blue', corrections: READING },
  engine_start: { dot: 'green', badge: 'silnik', badgeTone: 'green', corrections: FACT },
  engine_stop: { dot: 'red', badge: 'silnik', badgeTone: 'red', corrections: FACT },
  taxi: { dot: 'dim', badge: 'kołowanie', badgeTone: 'dim', corrections: FACT },
  takeoff: { dot: 'blue', badge: 'start', badgeTone: 'blue', corrections: FACT },
  landing: { dot: 'blue', badge: 'lądowanie', badgeTone: 'blue', corrections: FACT },
  // Zrzut jako jedyny fakt operacyjny ma też WARTOŚĆ do poprawienia (skład, issue #43).
  drop: { dot: 'blue', badge: 'zrzut', badgeTone: 'blue', corrections: ['retime', 'void', 'amend'] },
  // Załadunek (issue #21): opisuje lot jak zrzut — to dwa końce tego samego wyniesienia.
  boarding: { dot: 'blue', badge: 'załadunek', badgeTone: 'blue', corrections: FACT },
  refuel: { dot: 'amber', badge: 'paliwo', badgeTone: 'amber', corrections: FACT },
  // Dolewka oleju z kokpitu (issue #60): retime/void jak tankowanie; `amend`-a nie ma
  // świadomie (pojedyncza liczba — unieważnij i dolej ponownie).
  oil_add: { dot: 'amber', badge: 'olej', badgeTone: 'amber', corrections: FACT },
  crew_change: { dot: 'amber', badge: 'załoga', badgeTone: 'amber', corrections: FACT },
  // Wpis ręczny ma też WARTOŚĆ do poprawienia: uwagę pilota (issue #43).
  manual_log_entry: {
    dot: 'amber',
    badge: 'ręcznie',
    badgeTone: 'amber',
    corrections: ['retime', 'void', 'amend'],
  },
  // Wpis `leg_close` żył tu między 2026-08-06 a 2026-08-10 — usunięty razem ze
  // zdarzeniem (pivot: sesja = jeden bieg silnika; zatwierdzeniem jest `day_close`,
  // od którego liczy się JEDYNE okno korekty sesji).
  day_close: { dot: 'red', badge: 'zdanie', badgeTone: 'red', corrections: READING },
  event_correction: { dot: 'red', badge: 'korekta', badgeTone: 'red', corrections: NONE },
};
