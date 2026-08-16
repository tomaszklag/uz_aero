/**
 * UZ Aero (serwer) — ŚLAD SESJI DLA TELEFONU (`GET /me/sessions/:uuid/track`, issue #47).
 *
 * ══ SKĄD SIĘ WZIĘŁA TA TRASA ══
 * Do issue #47 ślad żył na telefonie: nagranie leżało w `gps_trace` przez 14 dni i stamtąd
 * rysował się ekran 14. Retencja była limitem PAMIĘCI URZĄDZENIA, nie decyzją o wartości
 * danych — dzień lotny to ~30 tys. wierszy, a serwer i tak dostawał ich kopię. Odwrócenie
 * kierunku (telefon nagrywa → oddaje → kasuje) zabiera nagraniu pamięć telefonu i oddaje
 * mu trwałość: ślad przestaje znikać po dwóch tygodniach, wraca po reinstalacji i jest
 * na nowym urządzeniu.
 *
 * ══ CO ZOSTAJE PO STRONIE TELEFONU ══
 * Wyłącznie GEOMETRIA przychodzi z sieci. Rejestracja maszyny, lista lotów, czasy
 * startów i czas w powietrzu liczą się dalej z LOKALNEGO rejestru (§6 pkt 1) i ta trasa
 * ich nie zna — patrz nagłówek `SessionTrackPayload`. Dlatego wariant bez zasięgu (14C)
 * nadal pokazuje komplet czasów: brakuje mu rysunku, nie wiedzy.
 *
 * ══ OKNO BIERZEMY Z REJESTRU, NIE ZE ŚLADU ══
 * Ta sama zasada, co w panelu (`admin/queries/flightTrack.ts`): bieg silnika i odcinki
 * lotu pochodzą z projekcji PO korektach. Gdy administrator poprawi czas startu, ślad
 * zmieni się przy następnym otwarciu — mapa ma pokazywać lot tak, jak go dziś rozumie
 * rejestr, a nie tak, jak rozumiał go telefon w chwili zapisu.
 *
 * ══ CZEGO TU CELOWO NIE MA: PLIKU POBOCZNEGO ══
 * `FsPhaseTimeline` cache'uje swoją pochodną obok śladu i unieważnia ją rozmiarem pliku,
 * bo oś faz zależy WYŁĄCZNIE od nagrania. Ta koperta zależy też od REJESTRU — korekta
 * czasu startu zmienia statystyki, nie ruszając ani jednego bajtu NDJSON-a. Cache
 * unieważniany samym śladem podawałby po korekcie liczby sprzed niej i nie dałoby się
 * tego zauważyć po treści. Jeśli parsowanie kiedyś zacznie boleć, kluczem musi być para
 * (ślad, rewizja rejestru sesji) — nie sam ślad.
 */

import {
  buildSessionTrackPayload,
  emptySessionTrackPayload,
  flightSpans,
  projectSession,
  type RawTrackEntry,
  type SessionTrackPayload,
} from '@uzaero/domain';

import type { Database, EventsStorePort, TraceSourcePort } from '../../common/ports.ts';

/**
 * Odmowa jako wariant wyniku, nie wyjątek na granicy HTTP (wzorzec `FlightTrackOutcome`).
 * `no_session` i `not_yours` to dwa różne stany i telefon mówi o nich innym zdaniem:
 * „tej sesji nie ma" ≠ „to nie jest twoja sesja".
 */
export type SessionTrackOutcome =
  | { ok: true; track: SessionTrackPayload }
  | { ok: false; reason: 'no_session' | 'not_yours' };

export class SessionTrackQueries {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    private readonly traces: TraceSourcePort,
  ) {}

  async bySession(pilotId: string, sessionUuid: string): Promise<SessionTrackOutcome> {
    const events = await this.events.sessionEvents(this.db, sessionUuid);
    if (events.length === 0) return { ok: false, reason: 'no_session' };

    const state = projectSession(events);

    // Właścicielem jest PIC z otwarcia sesji — ta sama tożsamość, którą regula
    // `WRITER_MISMATCH` uznaje za jedynego uprawnionego piszącego (§4.1 pkt 3).
    // Ślad jest zapisem CZYJEGOŚ lotu, więc pytanie „czyja to sesja" ma tu dokładnie
    // jedną poprawną odpowiedź i nie jest nią „kto akurat pyta".
    if (state.sessionPicId !== pilotId) return { ok: false, reason: 'not_yours' };

    const leg = state.legs[0] ?? null;
    // Sesja bez pracy silnika (09C: pogoda, usterka) nie ma czego rysować i NIE jest to
    // awaria zapisu. Pusta koperta zamiast odmowy — telefon rozpozna po `usableCount`.
    if (leg == null) return { ok: true, track: emptySessionTrackPayload(sessionUuid) };

    const entries = (await this.traces.read(sessionUuid)) as unknown as RawTrackEntry[];

    return {
      ok: true,
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
 * Sesja oglądana z ekranu 14 jest zwykle zamknięta (kokpit jest modalny — dopóki pilot
 * trzyma samolot, nie wychodzi z niego bokiem), ale nagranie potrafi dotrzeć wcześniej
 * niż `engine_stop`. Zamykamy wtedy oknem NAGRANIA, nie zegarem serwera: „teraz" na
 * serwerze nie jest faktem o tym locie, a doliczyłoby do postoju czas między ostatnim
 * fixem a żądaniem.
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
