/**
 * UZ Aero — nakładanie korekt na strumień zdarzeń (ekran 04c, model §5.1).
 *
 * Rejestr jest append-only: korekta to osobne zdarzenie `event_correction`, oryginał
 * zostaje. Ten moduł zamienia strumień SUROWY na strumień EFEKTYWNY — taki, jakby
 * zdarzenia od początku miały poprawione czasy, a unieważnione nie zaszły.
 *
 * Wszyscy konsumenci (projekcja sesji, log dnia, statystyki) przechodzą przez tę jedną
 * funkcję — dzięki temu nie istnieje miejsce, w którym widać „stare" czasy, poza samym
 * rejestrem, który celowo pamięta wszystko.
 *
 * Gdy jedno zdarzenie ma kilka korekt, WYGRYWA OSTATNIA (po czasie zapisu korekty):
 * pilot poprawił się drugi raz — i to jest jego aktualna wersja. Działa to też dla pary
 * `void` → `retime`: ponowna zmiana czasu przywraca zdarzenie do życia, bo skoro pilot
 * podaje mu nowy czas, to uznaje, że jednak zaszło.
 */

import type { EpochMillis } from '../time';
import type { Event, EventOf } from '../events/events';

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): EpochMillis => e.gpsTime ?? e.deviceTime;

/**
 * Strumień efektywny: bez zdarzeń `event_correction`, bez celów unieważnionych,
 * z czasami po korekcie.
 *
 * Zmiana czasu wchodzi w `gpsTime` — to pole „kiedy naprawdę zaszło" (§5.1); `deviceTime`
 * zostaje nietknięty jako ślad chwili pierwotnego zapisu. Zwracamy nowe obiekty, strumień
 * wejściowy jest nienaruszalny jak sam rejestr.
 */
export function applyCorrections(events: readonly Event[]): Event[] {
  // Ostatnia korekta per cel — porządek po czasie zapisu korekty, żeby „ostatnia wygrywa"
  // znaczyło to samo niezależnie od kolejności wstawienia do bazy.
  const corrections = events
    .filter((e): e is EventOf<'event_correction'> => e.type === 'event_correction')
    .sort((a, b) => at(a) - at(b));

  const effective = new Map<string, EventOf<'event_correction'>>();
  for (const correction of corrections) {
    effective.set(correction.payload.targetUuid, correction);
  }

  const out: Event[] = [];
  for (const event of events) {
    if (event.type === 'event_correction') continue;

    const correction = effective.get(event.uuid);
    if (correction == null) {
      out.push(event);
    } else if (correction.payload.action === 'void') {
      // Unieważnione = nie zaszło. Wiersz zostaje w rejestrze, znika z wyliczeń.
      continue;
    } else {
      out.push({ ...event, gpsTime: correction.payload.newTime });
    }
  }
  return out;
}

/**
 * Indeks zdarzeń KORYGOWALNYCH: uuid → typ. Buduje go projekcja, a reguły używają
 * do walidacji celu korekty — `checkAppend` dostaje stan, nie surowy strumień.
 *
 * Obejmuje też zdarzenia już unieważnione: ponowna korekta unieważnionego jest legalna
 * (patrz „ostatnia wygrywa" wyżej). Nie obejmuje samych korekt — poprawia się fakt,
 * nie poprawkę; kolejna korekta celu po prostu zastępuje poprzednią.
 */
export function buildEventIndex(events: readonly Event[]): Record<string, Event['type']> {
  const index: Record<string, Event['type']> = {};
  for (const event of events) {
    if (event.type === 'event_correction') continue;
    index[event.uuid] = event.type;
  }
  return index;
}
