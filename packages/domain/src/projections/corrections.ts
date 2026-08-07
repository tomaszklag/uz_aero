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
 *
 * ══ KOREKTA NIECZYTELNA JEST POMIJANA, A NIE WYWRACA STRUMIENIA ══
 * Typ `EventCorrectionPayload` jest obietnicą WEJŚCIA (`POST /events` waliduje kształt
 * zodem), a nie faktem odczytu: kolumna `events.payload` to `JSONB` bez `CHECK`-a, więc
 * do strumienia trafia też wiersz wpisany ręcznie w psql, odtworzony ze zrzutu albo
 * przysłany przez starszą wersję telefonu. Taki wiersz nie ma prawa zabrać widoku
 * WSZYSTKIM pozostałym — a zabierał: `payload` równy JSON-owemu `null` dawał
 * `TypeError` przy sięgnięciu po `targetUuid`, czyli 500 z całego rejestru zdarzeń,
 * i to bez możliwości obejścia filtrem (wiersz wchodzi na każdą stronę w swoim zakresie).
 *
 * Pomijamy więc korektę, która NIE ADRESUJE celu (`targetUuid` inne niż napis) i taką,
 * której akcji nie znamy. To drugie jest równie ważne: gałąź „wszystko, co nie jest
 * `void`" traktowała po cichu KAŻDĄ nieznaną akcję jak `retime` i brała z niej
 * `newTime` — czyli podejmowała decyzję za kształt, którego nie rozumie. Nieznana
 * akcja może w przyszłej wersji znaczyć cokolwiek; jedyna uczciwa odpowiedź brzmi
 * „nie wiem, więc nie ruszam zdarzenia".
 */

import type { EpochMillis } from '../time';
import type { Event, EventOf } from '../events/events';

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): EpochMillis => e.gpsTime ?? e.deviceTime;

/** Korekta CZYTELNA — adresuje cel i niesie akcję, którą ta wersja domeny zna. */
type ReadableCorrection =
  | { targetUuid: string; action: 'void' }
  | { targetUuid: string; action: 'retime'; newTime: EpochMillis };

/**
 * `payload` korekty → korekta czytelna albo `null`.
 *
 * Kształt wejścia opisujemy `unknown`-ami, a nie `EventCorrectionPayload`, bo to jest
 * dokładnie ta różnica, o którą chodzi: typ mówi, co OBIECAŁO wejście, a ta funkcja
 * czyta, co FAKTYCZNIE leży w bazie. `retime` bez liczbowego `newTime` też jest
 * nieczytelny — wpisałby zdarzeniu `gpsTime`, którego nikt nie podał.
 */
function readCorrection(correction: EventOf<'event_correction'>): ReadableCorrection | null {
  const payload = correction.payload as
    | { targetUuid?: unknown; action?: unknown; newTime?: unknown }
    | null
    | undefined;

  const targetUuid = payload?.targetUuid;
  if (typeof targetUuid !== 'string') return null;

  if (payload?.action === 'void') return { targetUuid, action: 'void' };
  if (payload?.action === 'retime' && typeof payload.newTime === 'number') {
    return { targetUuid, action: 'retime', newTime: payload.newTime };
  }
  return null;
}

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

  const effective = new Map<string, ReadableCorrection>();
  for (const correction of corrections) {
    // Nieczytelna korekta wypada TUTAJ, a nie przy nakładaniu — dzięki temu poprzednia,
    // czytelna korekta tego samego celu dalej obowiązuje. „Ostatnia wygrywa" znaczy
    // „ostatnia, którą da się przeczytać", a nie „ostatnia, która skasuje poprzednią".
    const readable = readCorrection(correction);
    if (readable == null) continue;
    effective.set(readable.targetUuid, readable);
  }

  const out: Event[] = [];
  for (const event of events) {
    if (event.type === 'event_correction') continue;

    const correction = effective.get(event.uuid);
    if (correction == null) {
      out.push(event);
    } else if (correction.action === 'void') {
      // Unieważnione = nie zaszło. Wiersz zostaje w rejestrze, znika z wyliczeń.
      continue;
    } else {
      out.push({ ...event, gpsTime: correction.newTime });
    }
  }
  return out;
}

/** Wpis indeksu celów korekty: co to za zdarzenie i KIEDY zaszło. */
export interface IndexedEvent {
  type: Event['type'];
  /**
   * Czas zdarzenia (GPS → fallback zegar telefonu), z SUROWEGO strumienia.
   *
   * Potrzebny regułom, żeby ustalić, DO KTÓREGO WZLOTU należy korygowane zdarzenie —
   * od tego zależy, czy okno 24 h tego wzlotu jeszcze trwa (§3.6a: każdy wzlot ma
   * własne okno). Bez czasu reguła musiałaby pytać o okno zagregowane, czyli pozwalać
   * poprawiać wzlot wygasły, dopóki jakikolwiek inny jest otwarty.
   */
  at: EpochMillis;
}

/**
 * Indeks zdarzeń KORYGOWALNYCH: uuid → typ i czas. Buduje go projekcja, a reguły
 * używają do walidacji celu korekty — `checkAppend` dostaje stan, nie surowy strumień.
 *
 * Obejmuje też zdarzenia już unieważnione: ponowna korekta unieważnionego jest legalna
 * (patrz „ostatnia wygrywa" wyżej). Nie obejmuje samych korekt — poprawia się fakt,
 * nie poprawkę; kolejna korekta celu po prostu zastępuje poprzednią.
 */
export function buildEventIndex(events: readonly Event[]): Record<string, IndexedEvent> {
  const index: Record<string, IndexedEvent> = {};
  for (const event of events) {
    if (event.type === 'event_correction') continue;
    index[event.uuid] = { type: event.type, at: event.gpsTime ?? event.deviceTime };
  }
  return index;
}
