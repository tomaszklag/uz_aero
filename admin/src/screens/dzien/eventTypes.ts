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
}

export const EVENT_META: Record<EventType, EventMeta> = {
  session_claim: { dot: 'green', badge: 'claim', badgeTone: 'green' },
  preflight_confirm: { dot: 'green', badge: 'preflight', badgeTone: 'blue' },
  engine_start: { dot: 'green', badge: 'silnik', badgeTone: 'green' },
  engine_stop: { dot: 'red', badge: 'silnik', badgeTone: 'red' },
  taxi: { dot: 'dim', badge: 'kołowanie', badgeTone: 'dim' },
  takeoff: { dot: 'blue', badge: 'start', badgeTone: 'blue' },
  landing: { dot: 'blue', badge: 'lądowanie', badgeTone: 'blue' },
  drop: { dot: 'blue', badge: 'zrzut', badgeTone: 'blue' },
  refuel: { dot: 'amber', badge: 'paliwo', badgeTone: 'amber' },
  crew_change: { dot: 'amber', badge: 'załoga', badgeTone: 'amber' },
  manual_log_entry: { dot: 'amber', badge: 'ręcznie', badgeTone: 'amber' },
  day_close: { dot: 'red', badge: 'koniec', badgeTone: 'red' },
  event_correction: { dot: 'red', badge: 'korekta', badgeTone: 'red' },
};
