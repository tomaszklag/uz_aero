/**
 * Ninerdeck (serwer) - KANDYDAT KOREKTY: jak go zbudować i czy wolno go dopisać.
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
 *
 * Od 3.2.0 (`docs/panel-3.2.md` §5.4) jest tu i CZWARTA droga - DOPISANIE BRAKUJĄCEGO
 * FAKTU (`addedEventCandidate`), oceniane parą `insertionViolations`/`insertionWarnings`
 * na tym samym literale. Różni ją pytanie, nie furtka: fakt z przeszłości ocenia się
 * na stanie Z CHWILI, W KTÓREJ ZASZEDŁ (`checkInsert` w domenie), a nie na stanie
 * końcowym - inaczej każde brakujące lądowanie odbijałoby się o zdany samolot.
 */

import {
  CURRENT_SCHEMA_VERSION,
  checkAppend,
  checkInsert,
  errorsOf,
  type AircraftLimits,
  type Event,
  type EventCorrectionPayload,
  type EventType,
  type RuleViolation,
  type SessionState,
  warningsOf,
} from '@ninerdeck/domain';

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

// ─────────────────────────────────────────────────────────────────────────────
// Dopisanie brakującego faktu (3.2.0, §5.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BIAŁA LISTA typów, które panel umie DOPISAĆ - dokładnie to, co telefon oferuje
 * na arkuszu `10H`. Uruchomienia i wyłączenia silnika NIE MA: wyznaczają kopertę
 * operacji, a dopisanie ich z panelu znaczyłoby stworzenie biegu silnika, którego
 * nikt nie widział. Poza listą stoją z tego samego powodu przejęcie, zadanie
 * i zdanie (tożsamość operacji, końce łańcucha motogodzin).
 */
export const ADDED_EVENT_TYPES = [
  'takeoff',
  'landing',
  'taxi',
  'refuel',
  'drop',
  'boarding',
  'oil_add',
] as const satisfies readonly EventType[];

export type AddedEventType = (typeof ADDED_EVENT_TYPES)[number];

/**
 * Co panel wie o dopisywanym fakcie. Kształt jest CELOWO węższy od payloadów domeny:
 * start i lądowanie z panelu są zawsze `manual` i bez pozycji (przy biurku nie ma
 * GPS-u), załadunek nie niesie składu (jak na `10H`), zrzut niesie skład OPCJONALNIE
 * (`null` = niepodany, nie zero - C12 z issue #184: skład jest treścią zrzutu, którą
 * administrator często zna z listy skoków), a tankowanie podaje dwie liczby z trzech,
 * bo trzecia jest ich sumą i liczy ją serwer, nie formularz.
 */
export interface AddedJumpers {
  tandem: number;
  aff: number;
  solo: number;
}

export type AddedEventInput =
  | { type: 'takeoff' | 'landing' | 'taxi'; at: number }
  | { type: 'refuel'; at: number; beforeL: number; addedL: number }
  | { type: 'oil_add'; at: number; addedL: number }
  | { type: 'drop'; at: number; altitudeFt: number | null; jumpers: AddedJumpers | null }
  | { type: 'boarding'; at: number };

/**
 * Kandydat DOPISANIA FAKTU (`docs/panel-3.2.md` §5.4).
 *
 * ══ OBA ZEGARY = CHWILA FAKTU ══
 * `deviceTime` i `gpsTime` opisują dwa zegary TELEFONU (§5.1): kiedy zapisał i kiedy
 * według GPS zaszło. Zapis z panelu nie ma zegara telefonu, który mógłby się rozjechać,
 * więc oba niosą chwilę faktu (`at`) - inaczej każde dopisanie sprzed dwóch dni
 * przynosiłoby ostrzeżenie `CLOCK_DRIFT` o rozjeździe zegarów, którego nie było.
 * Chwila WPISANIA żyje tam, gdzie żyje przy korekcie: w `events.received_at`
 * i w `admin_audit` - i stamtąd bierze ją okno korekty (`insertionViolations`).
 *
 * Nagłówek z SESJI, jak przy każdej drodze zapisu panelu (`adminHeader`): `picId`
 * to PIC operacji, bo zdarzenie opisuje JEGO lot - kto je wpisał, mówi
 * `events.source_device` i audyt (`event.add`).
 */
export function addedEventCandidate(
  state: SessionState,
  stream: readonly Event[],
  input: AddedEventInput,
  uuid: string,
): Event {
  const header = { ...adminHeader(state, stream, uuid, new Date(input.at)), deviceTime: input.at, gpsTime: input.at };
  switch (input.type) {
    case 'takeoff':
    case 'landing':
    case 'taxi':
      return { ...header, type: input.type, payload: { method: 'manual', position: null } };
    case 'refuel':
      return {
        ...header,
        type: 'refuel',
        payload: {
          beforeL: input.beforeL,
          addedL: input.addedL,
          afterL: input.beforeL + input.addedL,
          consumptionLPerH: null,
        },
      };
    case 'oil_add':
      return { ...header, type: 'oil_add', payload: { addedL: input.addedL } };
    case 'drop':
      return {
        ...header,
        type: 'drop',
        payload: {
          // Numer kolejny w operacji - jak w komendzie telefonu (`state.drops.count + 1`).
          dropNumber: state.drops.count + 1,
          altitudeFt: input.altitudeFt,
          jumpers: input.jumpers,
          client: state.client,
          position: null,
        },
      };
    case 'boarding':
      return { ...header, type: 'boarding', payload: { jumpers: null } };
  }
}

/**
 * Naruszenia, które ZABLOKOWAŁYBY dopisanie - ta sama furtka (`'administrative'`),
 * inne pytanie: `checkInsert` ocenia kandydata na stanie z chwili faktu, a okno
 * korekty liczy na stanie końcowym i chwili WPISANIA (`now`). Lądowanie bez startu,
 * tankowanie przy pracującym silniku czy fakt po zdaniu samolotu odbijają się tak
 * samo, jak odbiłyby się telefonowi.
 */
export function insertionViolations(
  stream: readonly Event[],
  candidate: Event,
  limits: AircraftLimits,
  now: Date,
): RuleViolation[] {
  return errorsOf(checkInsert(stream, candidate, now.getTime(), limits, 'administrative'));
}

/** Ostrzeżenia dopisania - kolizje z pracą pilota i miękkie reguły per typ (zrzut poza lotem). */
export function insertionWarnings(
  stream: readonly Event[],
  candidate: Event,
  limits: AircraftLimits,
  now: Date,
): RuleViolation[] {
  return warningsOf(checkInsert(stream, candidate, now.getTime(), limits, 'administrative'));
}
