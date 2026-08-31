/**
 * UZ Aero (serwer) - ŚLAD SESJI DLA TELEFONU (`GET /me/sessions/:uuid/track`, issue #47).
 *
 * ══ SKĄD SIĘ WZIĘŁA TA TRASA ══
 * Do issue #47 ślad żył na telefonie: nagranie leżało w `gps_trace` przez 14 dni i stamtąd
 * rysował się ekran 14. Retencja była limitem PAMIĘCI URZĄDZENIA, nie decyzją o wartości
 * danych - dzień lotny to ~30 tys. wierszy, a serwer i tak dostawał ich kopię. Odwrócenie
 * kierunku (telefon nagrywa → oddaje → kasuje) zabiera nagraniu pamięć telefonu i oddaje
 * mu trwałość: ślad przestaje znikać po dwóch tygodniach, wraca po reinstalacji i jest
 * na nowym urządzeniu.
 *
 * ══ CO ZOSTAJE PO STRONIE TELEFONU ══
 * Wyłącznie GEOMETRIA przychodzi z sieci. Rejestracja maszyny, lista lotów, czasy
 * startów i czas w powietrzu liczą się dalej z LOKALNEGO rejestru (§6 pkt 1) i ta trasa
 * ich nie zna - patrz nagłówek `SessionTrackPayload`. Dlatego wariant bez zasięgu (14C)
 * nadal pokazuje komplet czasów: brakuje mu rysunku, nie wiedzy.
 *
 * ══ CO ZOSTAŁO W TYM PLIKU: JEDNO ZDANIE O UPRAWNIENIU ══
 * Rysunek składa wspólne `common/queries/sessionTrack.ts` - ten sam, z którego czyta panel,
 * bo ślad jednego biegu silnika ma wyglądać tak samo po obu stronach. Tutaj zostaje
 * WYŁĄCZNIE reguła „czyja to sesja", bo ona się między powierzchniami różni: telefon
 * pokazuje własny lot pilota, panel - dowolny, na zdolności `panel.access`.
 */

import type { SessionTrackPayload } from '@uzaero/domain';

import type { SessionTrackQueries } from '../../common/queries/sessionTrack.ts';

/**
 * Odmowa jako wariant wyniku, nie wyjątek na granicy HTTP (wzorzec `FlightTrackOutcome`).
 * `no_session` i `not_yours` to dwa różne stany i telefon mówi o nich innym zdaniem:
 * „tej sesji nie ma" ≠ „to nie jest twoja sesja".
 */
export type MySessionTrackOutcome =
  | { ok: true; track: SessionTrackPayload }
  | { ok: false; reason: 'no_session' | 'not_yours' };

export class MySessionTrackQueries {
  constructor(private readonly tracks: SessionTrackQueries) {}

  async bySession(pilotId: string, sessionUuid: string): Promise<MySessionTrackOutcome> {
    const outcome = await this.tracks.bySession(sessionUuid);
    if (!outcome.ok) return outcome;

    // Właścicielem jest PIC z otwarcia sesji - ta sama tożsamość, którą reguła
    // `WRITER_MISMATCH` uznaje za jedynego uprawnionego piszącego (§4.1 pkt 3).
    // Ślad jest zapisem CZYJEGOŚ lotu, więc pytanie „czyja to sesja" ma tu dokładnie
    // jedną poprawną odpowiedź i nie jest nią „kto akurat pyta".
    if (outcome.picId !== pilotId) return { ok: false, reason: 'not_yours' };

    return { ok: true, track: outcome.track };
  }
}
