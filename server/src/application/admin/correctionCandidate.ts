/**
 * UZ Aero (serwer) — KANDYDAT KOREKTY: jak go zbudować i czy wolno go dopisać.
 *
 * Ten plik istnieje z jednego powodu i warto go zapisać wprost: **korektę
 * administratora ocenia się w DWÓCH miejscach — przy zapisie (`commands/corrections.ts`)
 * i przy podglądzie „przed → po" (`queries/corrections.ts`)** — a ocena musi być
 * dokładnie ta sama. Podgląd, który mówi „zapiszę", po czym zapis odmawia (albo
 * odwrotnie), jest gorszy niż brak podglądu: administrator uczy się nie ufać liczbom
 * na ekranie, który powstał właśnie po to, żeby im ufał.
 *
 * Dwie kopie logiki „jakiego kandydata budujemy" rozjechałyby się przy pierwszej
 * zmianie reguł, i to niewidocznie — bo obie strony dalej by się kompilowały.
 *
 * ══ LITERAŁ `'administrative'` MIESZKA TUTAJ I TYLKO TUTAJ ══
 * `checkAppend(…, 'administrative')` uchyla DOKŁADNIE JEDNĄ regułę
 * (`CORRECTION_WINDOW_EXPIRED`) i jest jedyną furtką w całej domenie. Dlatego ma mieć
 * jednego użytkownika i nazwisko: rozlanie go po komendach byłoby początkiem
 * konstrukcji, w której nikt nie wie, ile reguł omija panel. Pilnuje tego
 * `test/architecture.test.ts` — lista dozwolonych plików ma dokładnie jedną pozycję
 * i jest to ten plik.
 */

import {
  CURRENT_SCHEMA_VERSION,
  checkAppend,
  errorsOf,
  type AircraftLimits,
  type Event,
  type EventCorrectionPayload,
  type RuleViolation,
  type SessionState,
  warningsOf,
} from '@uzaero/domain';

/**
 * Kandydat do zapisu — nagłówek bierzemy z SESJI, nie od administratora.
 *
 * `deviceTime` = `gpsTime` = `at`: korekta powstaje przy biurku, więc „czas z GPS"
 * i „czas telefonu" to ta sama chwila i żadnego rozjazdu zegarów tu nie ma. Poprawiany
 * czas zdarzenia jedzie w payloadzie (`newTime`) — nagłówek korekty mówi tylko, KIEDY
 * ją wpisano.
 *
 * `picId` to PIC USTALONY PRZY OTWARCIU SESJI — ten sam, z którym porównuje
 * `WRITER_MISMATCH`. Wpisanie tam konta administratora zerwałoby single-writer
 * (i słusznie) oraz zafałszowało atrybucję nalotu; na pytanie „kto to zrobił"
 * odpowiadają `events.source_device` i `admin_audit`, i tylko one.
 */
export function correctionCandidate(
  state: SessionState,
  stream: readonly Event[],
  correction: EventCorrectionPayload,
  uuid: string,
  at: Date,
): Event {
  const now = at.getTime();
  const first = stream[0]!;
  return {
    uuid,
    sessionUuid: state.sessionUuid ?? first.sessionUuid,
    aircraftId: state.aircraftId ?? first.aircraftId,
    picId: state.sessionPicId ?? first.picId,
    dualId: state.dualId,
    type: 'event_correction',
    deviceTime: now,
    gpsTime: now,
    payload: correction,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    // Pole klienckie (księgowość outboxa telefonu) — na serwerze bez znaczenia.
    syncedAt: null,
  };
}

/**
 * Naruszenia, które ZABLOKOWAŁYBY zapis tej korekty. Pusta lista = wolno zapisać.
 *
 * Uchylamy JEDNĄ regułę. Cel spoza sesji, cel niekorygowalny, czas z przyszłości,
 * cudza sesja — wszystko to odrzuca administratora tak samo jak pilota. Ślepe
 * dopisywanie zdarzeń „bo to admin" byłoby zaprzeczeniem rygoru, dla którego rejestr
 * w ogóle ma reguły.
 *
 * Zwracamy wyłącznie twarde błędy: miękkie naruszenia (ostrzeżenia) nie blokują zapisu
 * niczyjego, bo §4.5 daje ostatnie słowo faktowi z terenu. Podgląd pokazuje więc tę
 * samą listę, którą przy zapisie zobaczyłby jako powód odmowy — ani dłuższą, ani
 * krótszą.
 */
export function correctionViolations(
  state: SessionState,
  candidate: Event,
  limits: AircraftLimits,
): RuleViolation[] {
  return errorsOf(checkAppend(state, candidate, limits, 'administrative'));
}

/**
 * Ostrzeżenia (miękkie naruszenia) tej samej oceny — czyli to, O CZYM UPRZEDZIĆ.
 *
 * Istnieją od 2026-08-07 i **zastępują bramkę `400 day_open`**: administrator nie jest
 * już NIGDY blokowany, ale ma zobaczyć, w co wchodzi. Domena produkuje tu dokładnie dwa
 * kody — `ADMIN_EDIT_SESSION_ACTIVE` (pilot nadal prowadzi sesję i dośle własne
 * zdarzenia po synchronizacji) oraz `ADMIN_EDIT_PILOT_WINDOW_OPEN` (okno 24 h od zdania
 * jeszcze trwa, więc obie strony mogą poprawiać naraz).
 *
 * Funkcja jest OSOBNA od `correctionViolations`, a nie drugim polem jednego obiektu,
 * z tego samego powodu, dla którego tamta zwraca same błędy: wołający ma jawnie
 * rozstrzygnąć, czy pyta „czy wolno zapisać", czy „o czym uprzedzić". Sklejenie tych
 * dwóch list kończy się zbiorem, który ktoś kiedyś potraktuje jak powód odmowy —
 * a wtedy bramka wróci tylnymi drzwiami.
 */
export function correctionWarnings(
  state: SessionState,
  candidate: Event,
  limits: AircraftLimits,
): RuleViolation[] {
  return warningsOf(checkAppend(state, candidate, limits, 'administrative'));
}
