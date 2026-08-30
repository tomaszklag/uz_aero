/**
 * UZ Aero (serwer) - walidacja PAYLOADÓW per typ zdarzenia (audyt: WAŻNE).
 *
 * Koperta chroni bazę; te schematy chronią PROJEKCJĘ. `projectSession` czyta pola bez
 * gard (`payload.reading.fuelL`, `payload.jumpers.tandem`) - zepsuty payload to
 * TypeError w transakcji, czyli 500 i wieczny retry telefonu, albo NaN, które Postgres
 * grzecznie przyjmie do DOUBLE PRECISION i zatruje `sessions` na stałe.
 *
 * Kształty przepisane 1:1 z `EventPayloadMap` w `@uzaero/domain` - a że przepisanie
 * może się rozjechać, kontrakt trzyma test: każdy typ z `EVENT_TYPES` musi mieć tu
 * schemat, a poprawny payload domenowy musi przechodzić.
 *
 * Zasada §4.5 bez zmian: walidujemy STRUKTURĘ (typy pól), nie semantykę lotu -
 * cofnięty licznik czy paliwo ponad pojemność to sprawa flag, nie 400.
 */

import { z } from 'zod';

/** `z.number()` odrzuca NaN/Infinity dopiero z `.finite()` - a NaN to główny wróg. */
const finite = z.number().finite();
const epochMs = z.number().int().nonnegative();

const gpsPosition = z
  .object({
    lat: finite,
    lon: finite,
    altitudeFt: finite.nullable().optional(),
    accuracyM: finite.nullable().optional(),
  })
  .nullable();

const reading = z.object({ fuelL: finite, mh: finite });

/** Skład skoczków - ten sam kształt przy zrzucie, załadunku i korekcie `amend`. */
const jumpers = z.object({
  tandem: z.number().int().nonnegative(),
  aff: z.number().int().nonnegative(),
  solo: z.number().int().nonnegative(),
});

/**
 * Powód korekty (issue #43) - OPCJONALNY przy każdej akcji. Limit jak przy notatce
 * z preflightu: to przypis do liczby, nie załącznik.
 */
const correctionReason = z.string().max(500).nullable().optional();

/**
 * Kto naniósł poprawkę. Telefon pola nie wysyła (brak = `pilot`); `admin` stempluje
 * panel, bo nagłówek zdarzenia niesie `picId` PIC-a sesji także wtedy, gdy pisał
 * administrator (single-writer §4.4).
 */
const correctionSource = z.enum(['pilot', 'admin']).optional();

const method = z.enum(['auto', 'manual']);

export const PAYLOAD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  session_claim: z.object({
    mode: z.enum(['free', 'takeover_online', 'takeover_offline']),
    previousPicId: z.string().max(50).nullable().optional(),
    // Znacznik sesji wpisanej ręcznie po fakcie (ekran 15, 2026-08-16) - zasila
    // plakietkę „RĘCZNIE"; brak pola = zapis z kokpitu.
    manualEntry: z.boolean().optional(),
  }),

  preflight_confirm: z.object({
    operation: z.enum(['skoki', 'ferry', 'egzamin', 'techniczny', 'inne']),
    departureIcao: z.string().max(8).nullable().optional(),
    arrivalIcao: z.string().max(8).nullable().optional(),
    // `dutyStart` (godzina meldunku) walidowane tu do 2026-08-11 - usunięte razem
    // z klamrą służby (issue #23). Schematy nie są `strict`, więc ewentualna paczka
    // ze starego telefonu z tym polem nadal przejdzie; projekcja je ignoruje.
    reading,
    // Olej przy przejęciu (issue #60): pomiar z bagnetu + dolewka. Opcjonalne, bo
    // telefony sprzed modułu ich nie wysyłają; `null` = wpisu nie było (wartość,
    // nie brak). Lekcja `leg_close` w drugą stronę: schematy nie są `strict`, więc
    // BEZ tych pól serwer wycinałby pomiar PO CICHU - telefon by go miał, serwer
    // i odtworzenie rejestru już nie.
    oilL: finite.nullable().optional(),
    oilAddedL: finite.nullable().optional(),
    corrections: z.array(z.record(z.unknown())).optional(),
    // Dual przypisany CAŁEJ sesji (issue #43) - pole opcjonalne, bo telefony sprzed
    // tej zmiany go nie wysyłają, a wtedy obowiązuje nagłówek zdarzeń.
    dualId: z.string().max(50).nullable().optional(),
    client: z.string().max(200).nullable().optional(),
    // Notatka do dnia (issue #14) - wolny tekst, wielolinijkowy. Limit 2000 znaków,
    // bo to NOTATKA, a nie załącznik: mieści akapit o okolicznościach dnia i nie
    // zamienia rejestru zdarzeń w magazyn dokumentów. Pole jest OPCJONALNE i to jest
    // zgodność wsteczna, nie luźność - telefony sprzed tej zmiany go nie wysyłają
    // i ich paczki mają nadal przechodzić.
    notes: z.string().max(2000).nullable().optional(),
    mhFormat: z.enum(['decimal', 'hhmm']).optional(),
    // Domyślny skład skoczków sesji (2026-08-17) - wartość startowa dla załadunków
    // bez własnej deklaracji; telefony sprzed tej zmiany go nie wysyłają.
    jumperDefaults: jumpers.nullable().optional(),
  }),

  engine_start: z.object({
    position: gpsPosition.optional(),
    fieldElevationFt: finite.nullable().optional(),
  }),

  engine_stop: z.object({ position: gpsPosition.optional() }),

  taxi: z.object({ method, position: gpsPosition.optional() }),
  takeoff: z.object({ method, position: gpsPosition.optional() }),
  /* `touchAndGo` OPCJONALNE i tylko dodatnie (uwaga z urządzenia, 2026-08-29): kręgi
     zamknięte tym lądowaniem we wpisie ręcznym. Brak pola = zwykły lot i tak wysyłają
     wszystkie telefony sprzed zmiany oraz każdy lot z detekcji GPS, więc schemat
     zostaje wstecznie zgodny. Zero odrzucamy świadomie: „zero kręgów" to ten sam stan,
     co brak pola, a dwa zapisy jednego faktu rozjeżdżają się przy pierwszej korekcie. */
  landing: z.object({
    method,
    position: gpsPosition.optional(),
    touchAndGo: z.number().int().positive().optional(),
  }),

  drop: z.object({
    dropNumber: z.number().int().positive(),
    altitudeFt: finite.nullable().optional(),
    // Skład OPCJONALNY od issue #21 pkt 5 (`null` = niepodany, nie zero) - telefony
    // sprzed zmiany wysyłają go zawsze i ich paczki mają nadal przechodzić.
    jumpers: z
      .object({
        tandem: z.number().int().nonnegative(),
        aff: z.number().int().nonnegative(),
        solo: z.number().int().nonnegative(),
      })
      .nullable()
      .optional(),
    client: z.string().max(200).nullable().optional(),
    position: gpsPosition.optional(),
  }),

  /** `boarding` - załadunek skoczków (issue #21 pkt 7): znacznik faktu, skład opcjonalny. */
  boarding: z.object({
    jumpers: z
      .object({
        tandem: z.number().int().nonnegative(),
        aff: z.number().int().nonnegative(),
        solo: z.number().int().nonnegative(),
      })
      .nullable()
      .optional(),
  }),

  refuel: z.object({
    beforeL: finite,
    addedL: finite,
    afterL: finite,
    consumptionLPerH: finite.nullable().optional(),
  }),

  // Dolewka oleju z kokpitu (issue #60) - jedna liczba, bez trójki: poziomu po
  // dolewce nie ma jak uczciwie zmierzyć, a rachunek interwału olejowego traktuje
  // dolewkę jako składnik, nie granicę. Lekcja `leg_close`: nieznany typ payloadu
  // wraca jako 400 bad_payload i blokuje synchronizację CAŁEJ kolejki telefonu.
  oil_add: z.object({
    addedL: finite,
  }),

  crew_change: z.object({
    role: z.enum(['pic', 'dual']),
    pilotOutId: z.string().max(50).nullable().optional(),
    pilotInId: z.string().max(50).nullable().optional(),
  }),

  manual_log_entry: z.object({
    offBlock: epochMs.nullable().optional(),
    takeoff: epochMs.nullable().optional(),
    landing: epochMs.nullable().optional(),
    onBlock: epochMs.nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  }),

  // `leg_close` walidowane tu między 2026-08-06 a 2026-08-10 - usunięte razem ze
  // zdarzeniem (sesja = jeden bieg silnika; zatwierdzeniem jest `day_close`).

  /**
   * `day_close` - ZDANIE SAMOLOTU = ZATWIERDZENIE LOGU SESJI (2026-08-10).
   * Odczyt końcowy wymagany (jest przekazaniem dla następnego pilota i ogniwem
   * łańcucha MH). `dutyEnd` walidowane tu do 2026-08-11 - usunięte razem z klamrą
   * służby (issue #23): zdanie maszyny nie kończy dnia pilota.
   */
  day_close: z.object({
    finalReading: reading,
    /** Powód zdania bez uruchomienia silnika (09C); brak = miękka flaga w domenie. */
    noFlightReason: z.enum(['weather', 'malfunction', 'cancelled', 'other']).nullable().optional(),
  }),

  /**
   * `session_void` - CAŁA sesja unieważniona (uwaga z urządzenia, 2026-08-30).
   *
   * Rejestr zostaje append-only: zdarzenie NIE kasuje strumienia, tylko odbiera sesji
   * ważność. Serwer musi je przyjąć, bo inaczej telefon dostawałby `400 bad_payload`
   * i wycofany wpis wisiałby w kolejce na zawsze - ta sama pułapka, którą złapał
   * etap D1 przy `leg_close`.
   *
   * Powód OPCJONALNY, jak przy każdej korekcie; limit długości ten sam, co u innych
   * pól swobodnego tekstu.
   */
  session_void: z.object({
    reason: z.string().max(1000).nullable(),
  }),

  /**
   * `event_correction` - TRZY akcje od issue #43.
   *
   * `amend` niesie WARTOŚĆ zamiast czasu (odczyt paliwa i MH przy przejęciu/zdaniu,
   * skład zrzutu). Nie sprawdzamy tu, czy pole pasuje do typu celu - to semantyka,
   * którą rozstrzyga domena (`CORRECTION_FIELD_NOT_ALLOWED`), a serwer po §4.5 nie
   * odrzuca danych z terenu za sens, tylko za strukturę. Pilnujemy jednak, żeby
   * liczby były LICZBAMI: `NaN` w `fuelL` zatruwa `sessions` na stałe.
   *
   * Bez tego schematu telefon dostaje `400 bad_payload` i cała edycja nie ma jak się
   * zsynchronizować - dokładnie ten błąd zatrzymał etap C przy przebudowie flow.
   */
  event_correction: z.discriminatedUnion('action', [
    z.object({
      targetUuid: z.string().min(1).max(100),
      action: z.literal('retime'),
      newTime: epochMs,
      reason: correctionReason,
      source: correctionSource,
    }),
    z.object({
      targetUuid: z.string().min(1).max(100),
      action: z.literal('void'),
      reason: correctionReason,
      source: correctionSource,
    }),
    z.object({
      targetUuid: z.string().min(1).max(100),
      action: z.literal('amend'),
      fields: z.object({
        fuelL: finite.optional(),
        mh: finite.optional(),
        // Olej (issue #60): `null` to wartość - „pomiaru/dolewki nie było" (kasowanie
        // omyłkowego wpisu), jak przy notatce i Dualu.
        oilL: finite.nullable().optional(),
        oilAddedL: finite.nullable().optional(),
        jumpers: jumpers.nullable().optional(),
        // Ten sam limit, co przy notatce z preflightu - poprawka nie może przemycić
        // dłuższego tekstu niż oryginał (`notes` w `preflight_confirm`).
        notes: z.string().max(2000).nullable().optional(),
        // Dual CAŁEJ sesji (issue #43); `null` = sesja jednoosobowa. Limit jak przy
        // `pilotInId` w `crew_change` - to ten sam identyfikator pilota.
        dualId: z.string().max(50).nullable().optional(),
      }),
      reason: correctionReason,
      source: correctionSource,
    }),
  ]),
};

/** Payload zgodny ze schematem swojego typu? Nieznany typ = nie - koperta i tak go utnie. */
export function payloadValid(type: string, payload: unknown): boolean {
  const schema = PAYLOAD_SCHEMAS[type];
  return schema != null && schema.safeParse(payload).success;
}
