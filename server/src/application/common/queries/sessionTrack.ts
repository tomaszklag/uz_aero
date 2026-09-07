/**
 * UZ Aero (serwer) - ŚLAD SESJI: geometria biegu silnika dla OBU powierzchni.
 *
 * ══ DLACZEGO `common/`, A NIE DWA ZAPYTANIA ══
 * Ślad należy do SESJI, nie do lotu (issue #38): powstaje w jednym ciągu od uruchomienia
 * do wyłączenia silnika, a loty są jego odcinkami. To jeden fakt o jednym biegu, więc
 * telefon i panel mają dostać dokładnie ten sam rysunek - z tą samą bramką jakości, tym
 * samym upraszczaniem i tym samym oknem z rejestru. Dwa zapytania obok siebie rozjechałyby
 * się przy pierwszej zmianie którejkolwiek z tych trzech rzeczy, a rozjazd byłby CICHY:
 * obie mapy wyglądałyby poprawnie, tylko inaczej. Przy narzędziu, którego cała wartość
 * polega na wspólnej rozmowie administratora z pilotem o TYM SAMYM locie, to najgorszy
 * możliwy rodzaj różnicy.
 *
 * ══ CZEGO TU NIE MA: UPRAWNIEŃ ══
 * To zapytanie odpowiada „jak wyglądał ten bieg", a nie „kto ma prawo pytać". Telefon
 * dokłada bramkę właściciela (`mobile/queries/sessionTrack.ts`), panel - zdolność
 * `panel.access` na trasie. Stąd `picId` w wyniku: właściciel jest FAKTEM o sesji, więc
 * pytający nie musi projektować strumienia drugi raz, żeby go poznać.
 *
 * ══ OKNO BIERZEMY Z REJESTRU, NIE ZE ŚLADU ══
 * Bieg silnika i odcinki lotu pochodzą z projekcji PO korektach. Gdy administrator poprawi
 * czas startu, ślad zmieni się przy następnym otwarciu - mapa ma pokazywać lot tak, jak go
 * dziś rozumie rejestr, a nie tak, jak rozumiał go telefon w chwili zapisu.
 *
 * ══ CZEGO TU CELOWO NIE MA: CACHE'U ══
 * `FsPhaseTimeline` cache'uje swoją pochodną obok śladu i unieważnia ją rozmiarem pliku,
 * bo oś faz zależy WYŁĄCZNIE od nagrania. Ta koperta zależy też od REJESTRU - korekta
 * czasu startu zmienia statystyki, nie ruszając ani jednego bajtu NDJSON-a. Cache
 * unieważniany samym śladem podawałby po korekcie liczby sprzed niej i nie dałoby się tego
 * zauważyć po treści. Jeśli parsowanie kiedyś zacznie boleć, kluczem musi być para
 * (ślad, rewizja rejestru sesji) - nie sam ślad.
 */

import {
  buildSessionTrackPayload,
  emptySessionTrackPayload,
  flightSpans,
  projectSession,
  type RawTrackEntry,
  type SessionTrackPayload,
} from '@uzaero/domain';

import type { Database, EventsStorePort, TraceSourcePort } from '../ports.ts';

/**
 * Odmowa jako wariant wyniku, nie wyjątek na granicy HTTP (wzorzec `SessionListOutcome`).
 * Powód jest tu dokładnie jeden - sesji nie ma w rejestrze; wszystkie inne braki (bieg bez
 * nagrania, sesja bez pracy silnika) są POPRAWNYM wynikiem z pustą kopertą.
 */
export type SessionTrackOutcome =
  | { ok: true; track: SessionTrackPayload; picId: string | null }
  | { ok: false; reason: 'no_session' };

export class SessionTrackQueries {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    private readonly traces: TraceSourcePort,
  ) {}

  async bySession(sessionUuid: string): Promise<SessionTrackOutcome> {
    const events = await this.events.sessionEvents(this.db, sessionUuid);
    if (events.length === 0) return { ok: false, reason: 'no_session' };

    const state = projectSession(events);
    const picId = state.sessionPicId;

    const leg = state.legs[0] ?? null;
    // Sesja bez pracy silnika (09C: pogoda, usterka) nie ma czego rysować i NIE jest to
    // awaria zapisu. Pusta koperta zamiast odmowy - odbiorca rozpozna po `usableCount`.
    if (leg == null) return { ok: true, track: emptySessionTrackPayload(sessionUuid), picId };

    const entries = (await this.traces.read(sessionUuid)) as unknown as RawTrackEntry[];

    return {
      ok: true,
      picId,
      track: buildSessionTrackPayload(sessionUuid, entries, {
        airborne: flightSpans(state),
        engineFrom: leg.startedAt,
        engineTo: closingTime(leg.stoppedAt, leg.startedAt, entries),
      }),
    };
  }
}

/**
 * Koniec okna dla biegu, który jeszcze trwa.
 *
 * Sesja bywa oglądana przed wyłączeniem silnika - w panelu wprost (dziennik pokazuje dzień
 * na bieżąco), na telefonie rzadziej, bo kokpit jest modalny. Zamykamy wtedy oknem
 * NAGRANIA, nie zegarem serwera: „teraz" na serwerze nie jest faktem o tym locie,
 * a doliczyłoby do postoju czas między ostatnim fixem a żądaniem.
 */
function closingTime(
  stoppedAt: number | null,
  startedAt: number,
  entries: readonly RawTrackEntry[],
): number {
  if (stoppedAt != null) return stoppedAt;

  let last = startedAt;
  for (const entry of entries) {
    if (entry.kind === 'fix' && entry.time > last) last = entry.time;
  }
  return last;
}
