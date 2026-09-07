/**
 * UZ Aero (serwer) - KANDYDAT KOREKTY: jak go zbudować i czy wolno go dopisać.
 *
 * Ten plik istnieje z jednego powodu i warto go zapisać wprost: **korektę
 * administratora ocenia się w DWÓCH miejscach - przy zapisie (`commands/corrections.ts`)
 * i przy podglądzie „przed → po" (`queries/corrections.ts`)** - a ocena musi być
 * dokładnie ta sama. Podgląd, który mówi „zapiszę", po czym zapis odmawia (albo
 * odwrotnie), jest gorszy niż brak podglądu: administrator uczy się nie ufać liczbom
 * na ekranie, który powstał właśnie po to, żeby im ufał.
 *
 * Dwie kopie logiki „jakiego kandydata budujemy" rozjechałyby się przy pierwszej
 * zmianie reguł, i to niewidocznie - bo obie strony dalej by się kompilowały.
 *
 * ══ LITERAŁ `'administrative'` MIESZKA TUTAJ I TYLKO TUTAJ ══
 * `checkAppend(…, 'administrative')` uchyla DOKŁADNIE JEDNĄ regułę
 * (`CORRECTION_WINDOW_EXPIRED`) i jest jedyną furtką w całej domenie. Dlatego ma mieć
 * jednego użytkownika i nazwisko: rozlanie go po komendach byłoby początkiem
 * konstrukcji, w której nikt nie wie, ile reguł omija panel. Pilnuje tego
 * `test/architecture.test.ts` - lista dozwolonych plików ma dokładnie jedną pozycję
 * i jest to ten plik.
 *
 * Dlatego mieszka tu także kandydat DRUGIEJ drogi zapisu panelu - unieważnienia całej
 * sesji (`sessionVoidCandidate`, 2026-08-31). Oceniają go te same dwie funkcje niżej:
 * biorą KANDYDATA, a nie typ zdarzenia, więc obie drogi przechodzą przez jedną furtkę.
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
 * Kandydat do zapisu - nagłówek bierzemy z SESJI, nie od administratora.
 *
 * `deviceTime` = `gpsTime` = `at`: korekta powstaje przy biurku, więc „czas z GPS"
 * i „czas telefonu" to ta sama chwila i żadnego rozjazdu zegarów tu nie ma. Poprawiany
 * czas zdarzenia jedzie w payloadzie (`newTime`) - nagłówek korekty mówi tylko, KIEDY
 * ją wpisano.
 *
 * `picId` to PIC USTALONY PRZY OTWARCIU SESJI - ten sam, z którym porównuje
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
    // `source: 'admin'` (issue #43) - DRUGI, celowo zduplikowany ślad autorstwa.
    // `events.source_device` mówi to samo, ale zostaje na serwerze: `GET /me/events`
    // go nie oddaje, a `Event` w domenie nie ma takiego pola. Bez znacznika w payloadzie
    // historia zmian na telefonie pokazywałaby decyzję administratora pod nazwiskiem
    // pilota - bo nagłówek korekty MUSI nieść `picId` sesji (single-writer §4.4).
    payload: { ...correction, source: 'admin' },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    // Pole klienckie (księgowość outboxa telefonu) - na serwerze bez znaczenia.
    syncedAt: null,
  };
}

/**
 * Kandydat UNIEWAŻNIENIA CAŁEJ SESJI (`session_void`, panel 2.0 - 2026-08-31).
 *
 * ══ DLACZEGO TUTAJ, A NIE W SWOJEJ KOMENDZIE ══
 * Bo ocenia go `checkAppend(…, 'administrative')`, a ten literał ma w całym serwerze
 * DOKŁADNIE jedno miejsce i to jest ten plik (`test/architecture.test.ts`). Reguła
 * mówi, ile furtek omija panel - dopisanie drugiego pliku do jej listy byłoby
 * rozluźnieniem reguły, a nie jej utrzymaniem. Wszystko poniżej (`correctionViolations`,
 * `correctionWarnings`) działa na KANDYDACIE, nie na typie zdarzenia, więc obie drogi
 * zapisu panelu oceniają się tym samym kodem.
 *
 * Nagłówek bierzemy z SESJI dokładnie jak przy korekcie: `picId` to PIC ustalony przy
 * przejęciu (single-writer §4.4), a na pytanie „kto to zrobił" odpowiadają
 * `events.source_device` i `admin_audit`.
 *
 * Payload DOSTAJE znacznik `source: 'admin'` (od issue #81; do 2026-09-03 nie dostawał,
 * bo „telefon nie ma ekranu, na którym różnica »kto wycofał« cokolwiek by zmieniła").
 * Zmieniło się to, gdy unieważnienie z panelu zaczęło KOŃCZYĆ operację prowadzoną
 * w tej chwili: telefon musi odróżnić cudze wycofanie od własnego, żeby zejść z kokpitu,
 * wstrzymać zaległy outbox tej operacji i powiedzieć pilotowi, co się stało.
 */
export function sessionVoidCandidate(
  state: SessionState,
  stream: readonly Event[],
  reason: string | null,
  uuid: string,
  at: Date,
): Event {
  return {
    ...adminHeader(state, stream, uuid, at),
    type: 'session_void',
    payload: { reason, source: 'admin' },
  };
}

/**
 * Kandydat ZAKOŃCZENIA ADMINISTRACYJNEGO (`session_close`, issue #81) - trzecia droga
 * zapisu panelu, oceniana tą samą parą funkcji niżej i z tego samego powodu tutaj.
 *
 * Bez odczytów: administrator zamyka operację osieroconą i nie wie, co pokazują
 * przyrządy - stan maszyny wpisuje osobną akcją w karcie samolotu. Powód jest treścią
 * zdarzenia (wraca na telefon pilota, stoi na osi w panelu, w audycie), a autorstwo
 * wynika z TYPU: `session_close` powstaje wyłącznie tu.
 */
export function sessionCloseCandidate(
  state: SessionState,
  stream: readonly Event[],
  reason: string | null,
  uuid: string,
  at: Date,
): Event {
  return {
    ...adminHeader(state, stream, uuid, at),
    type: 'session_close',
    payload: { reason },
  };
}

/**
 * Nagłówek zdarzenia dopisywanego przez panel - z SESJI, nie od administratora:
 * `picId` to PIC ustalony przy przejęciu (single-writer §4.4, `WRITER_MISMATCH`),
 * a `deviceTime` = `gpsTime` = chwila decyzji przy biurku. Kto to zrobił, mówią
 * `events.source_device` i `admin_audit`.
 */
function adminHeader(
  state: SessionState,
  stream: readonly Event[],
  uuid: string,
  at: Date,
): Omit<Event, 'type' | 'payload'> {
  const now = at.getTime();
  const first = stream[0]!;
  return {
    uuid,
    sessionUuid: state.sessionUuid ?? first.sessionUuid,
    aircraftId: state.aircraftId ?? first.aircraftId,
    picId: state.sessionPicId ?? first.picId,
    dualId: state.dualId,
    deviceTime: now,
    gpsTime: now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    syncedAt: null,
  };
}

/**
 * Naruszenia, które ZABLOKOWAŁYBY zapis tej korekty. Pusta lista = wolno zapisać.
 *
 * Uchylamy JEDNĄ regułę. Cel spoza sesji, cel niekorygowalny, czas z przyszłości,
 * cudza sesja - wszystko to odrzuca administratora tak samo jak pilota. Ślepe
 * dopisywanie zdarzeń „bo to admin" byłoby zaprzeczeniem rygoru, dla którego rejestr
 * w ogóle ma reguły.
 *
 * Zwracamy wyłącznie twarde błędy: miękkie naruszenia (ostrzeżenia) nie blokują zapisu
 * niczyjego, bo §4.5 daje ostatnie słowo faktowi z terenu. Podgląd pokazuje więc tę
 * samą listę, którą przy zapisie zobaczyłby jako powód odmowy - ani dłuższą, ani
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
 * Ostrzeżenia (miękkie naruszenia) tej samej oceny - czyli to, O CZYM UPRZEDZIĆ.
 *
 * Istnieją od 2026-08-07 i **zastępują bramkę `400 day_open`**: administrator nie jest
 * już NIGDY blokowany, ale ma zobaczyć, w co wchodzi. Domena produkuje tu dokładnie dwa
 * kody - `ADMIN_EDIT_SESSION_ACTIVE` (pilot nadal prowadzi sesję i dośle własne
 * zdarzenia po synchronizacji) oraz `ADMIN_EDIT_PILOT_WINDOW_OPEN` (okno 24 h od zdania
 * jeszcze trwa, więc obie strony mogą poprawiać naraz).
 *
 * Funkcja jest OSOBNA od `correctionViolations`, a nie drugim polem jednego obiektu,
 * z tego samego powodu, dla którego tamta zwraca same błędy: wołający ma jawnie
 * rozstrzygnąć, czy pyta „czy wolno zapisać", czy „o czym uprzedzić". Sklejenie tych
 * dwóch list kończy się zbiorem, który ktoś kiedyś potraktuje jak powód odmowy -
 * a wtedy bramka wróci tylnymi drzwiami.
 */
export function correctionWarnings(
  state: SessionState,
  candidate: Event,
  limits: AircraftLimits,
): RuleViolation[] {
  return warningsOf(checkAppend(state, candidate, limits, 'administrative'));
}
