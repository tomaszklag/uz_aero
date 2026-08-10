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
   * Czy to zdarzenie podlega korekcie (`A02b`). LUSTRO reguły domeny
   * `CORRECTION_TARGET_NOT_ALLOWED` (`packages/domain/src/rules/sessionRules.ts`) —
   * i jedyne miejsce w panelu, w którym ta wiedza istnieje.
   *
   * **Panel nie egzekwuje tej reguły — serwer robi to przy każdym żądaniu, także przy
   * podglądzie.** Kopia jest tu po to, żeby nie zapraszać człowieka w formularz, który
   * i tak odbije: `session_claim` to tożsamość dnia, `preflight_confirm` i `day_close`
   * niosą odczyty łańcucha MH (przesunięcie czasu niczego by w nich nie poprawiło,
   * a unieważnienie rozbiłoby sesję w pół), a korekty się nie poprawia — poprawia się
   * fakt, więc kolejna korekta celu po prostu zastępuje poprzednią.
   *
   * Gdyby domena kiedyś zmieniła tę listę, rozjazd zobaczy administrator jako
   * naruszenie w podglądzie, a nie jako złe liczby — czyli w najbezpieczniejszy
   * z możliwych sposobów.
   */
  correctable: boolean;
}

export const EVENT_META: Record<EventType, EventMeta> = {
  session_claim: { dot: 'green', badge: 'claim', badgeTone: 'green', correctable: false },
  preflight_confirm: { dot: 'green', badge: 'preflight', badgeTone: 'blue', correctable: false },
  engine_start: { dot: 'green', badge: 'silnik', badgeTone: 'green', correctable: true },
  engine_stop: { dot: 'red', badge: 'silnik', badgeTone: 'red', correctable: true },
  taxi: { dot: 'dim', badge: 'kołowanie', badgeTone: 'dim', correctable: true },
  takeoff: { dot: 'blue', badge: 'start', badgeTone: 'blue', correctable: true },
  landing: { dot: 'blue', badge: 'lądowanie', badgeTone: 'blue', correctable: true },
  drop: { dot: 'blue', badge: 'zrzut', badgeTone: 'blue', correctable: true },
  refuel: { dot: 'amber', badge: 'paliwo', badgeTone: 'amber', correctable: true },
  crew_change: { dot: 'amber', badge: 'załoga', badgeTone: 'amber', correctable: true },
  manual_log_entry: { dot: 'amber', badge: 'ręcznie', badgeTone: 'amber', correctable: true },
  // Wpis `leg_close` żył tu między 2026-08-06 a 2026-08-10 — usunięty razem ze
  // zdarzeniem (pivot: sesja = jeden bieg silnika; zatwierdzeniem jest `day_close`,
  // od którego liczy się JEDYNE okno korekty sesji).
  day_close: { dot: 'red', badge: 'zdanie', badgeTone: 'red', correctable: false },
  event_correction: { dot: 'red', badge: 'korekta', badgeTone: 'red', correctable: false },
};
