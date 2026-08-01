/**
 * UZ Aero — panel: KARTA „OSTATNIO PRZYJĘTE" (moduł CZYSTY).
 *
 * ══ DWA CZASY W JEDNYM WIERSZU I O ICH RÓŻNICY JEST TA KARTA ══
 * `receivedAt` to chwila, w której SERWER przyjął zdarzenie — i to ona porządkuje
 * listę. `eventTime` to chwila, w której coś się STAŁO. Przy pilocie pracującym
 * offline te dwie potrafią dzielić godziny, a cała treść pulpitu („to nie jest podgląd
 * lotu na żywo") polega na tym, żeby ich nie mylić.
 *
 * Kolumna czasu pokazuje więc czas ZDARZENIA (tak rysuje to mockup), a opóźnienie
 * przyjęcia dopisujemy do metadanych WYŁĄCZNIE wtedy, gdy jest zauważalne — inaczej
 * każdy wiersz nosiłby „opóźnienie 0 min" i przestałoby to cokolwiek znaczyć.
 *
 * ══ PRZEJŚCIE PROWADZI NA KARTĘ DNIA, NIE DO REJESTRU ══
 * Mockup kieruje stąd do `A04`, którego nie ma. Zdarzenie należy do DNIA i to karta
 * dnia (`A02a`) pokazuje je w pełnym kontekście — więc wiersz prowadzi tam. Martwego
 * linku nie zostawiamy; przycisk „REJESTR" jest zablokowany z powodem (`pulpitLinks`).
 */

import { relativeAge, timeUtcSeconds } from '@uzaero/format';

import type { RecentEventDto } from '../../api/dto';
import { EVENT_META } from '../dzien/eventTypes';
import type { PillTone } from '../../ui/components/Pill';
import type { TimelineTone } from '../../ui/components/TimelineRow';
import { dzienLink } from './pulpitLinks';

/**
 * Od jakiego opóźnienia mówimy o nim wprost.
 *
 * Próg PREZENTACJI: pięć minut to normalny rytm synchronizacji telefonu, a wiersz,
 * który przy każdym zdarzeniu tłumaczy się z sekund, przestaje być czytany. Powyżej —
 * to już jest fakt o łączności i ma być widoczny.
 */
export const DELAY_WORTH_SAYING_MS = 5 * 60 * 1000;

export interface RecentRow {
  key: string;
  /** „14:19:52" UTC — sekundy mają znaczenie w rejestrze. */
  time: string;
  dot: TimelineTone;
  /** Nazwa zdarzenia = jego TYP z rejestru, ten sam napis co w SQL-u i w mockupie. */
  name: string;
  badge: string;
  badgeTone: PillTone;
  /** Opis w JEDNEJ linii, renderowany jako TEKST — nigdy jako HTML. */
  meta: string;
  to: string;
}

export function recentRows(items: readonly RecentEventDto[]): RecentRow[] {
  return items.map((item) => {
    const meta = EVENT_META[item.type];
    const receivedMs = Date.parse(item.receivedAt);
    const delayMs = Number.isNaN(receivedMs) ? 0 : Math.max(0, receivedMs - item.eventTime);

    const parts = [item.reg ?? item.aircraftId, item.picCode ?? item.picName ?? item.picId];
    if (delayMs > DELAY_WORTH_SAYING_MS) {
      parts.push(`przyjęte ${relativeAge(delayMs)} po zdarzeniu`);
    }

    return {
      key: item.uuid,
      time: timeUtcSeconds(item.eventTime),
      dot: meta.dot,
      name: item.type,
      badge: meta.badge,
      badgeTone: meta.badgeTone,
      meta: parts.join(' · '),
      to: dzienLink(item.sessionUuid),
    };
  });
}

export interface RecentEmptyCopy {
  title: string;
  note: string;
}

/**
 * Pusty rejestr. To jest inny stan niż „cisza od wczoraj" i musi mówić co innego:
 * tam strumień się urwał, tu nigdy się nie zaczął.
 */
export const RECENT_EMPTY: RecentEmptyCopy = {
  title: 'REJESTR JEST PUSTY',
  note: 'Serwer nie przyjął jeszcze ani jednego zdarzenia. To nie jest cisza po dniu lotnym — to stan sprzed pierwszego synchronizowania telefonu.',
};
