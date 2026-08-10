/**
 * UZ Aero (serwer) — walidacja PAYLOADÓW per typ zdarzenia (audyt: WAŻNE).
 *
 * Koperta chroni bazę; te schematy chronią PROJEKCJĘ. `projectSession` czyta pola bez
 * gard (`payload.reading.fuelL`, `payload.jumpers.tandem`) — zepsuty payload to
 * TypeError w transakcji, czyli 500 i wieczny retry telefonu, albo NaN, które Postgres
 * grzecznie przyjmie do DOUBLE PRECISION i zatruje `sessions` na stałe.
 *
 * Kształty przepisane 1:1 z `EventPayloadMap` w `@uzaero/domain` — a że przepisanie
 * może się rozjechać, kontrakt trzyma test: każdy typ z `EVENT_TYPES` musi mieć tu
 * schemat, a poprawny payload domenowy musi przechodzić.
 *
 * Zasada §4.5 bez zmian: walidujemy STRUKTURĘ (typy pól), nie semantykę lotu —
 * cofnięty licznik czy paliwo ponad pojemność to sprawa flag, nie 400.
 */

import { z } from 'zod';

/** `z.number()` odrzuca NaN/Infinity dopiero z `.finite()` — a NaN to główny wróg. */
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

const method = z.enum(['auto', 'manual']);

export const PAYLOAD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  session_claim: z.object({
    mode: z.enum(['free', 'takeover_online', 'takeover_offline']),
    previousPicId: z.string().max(50).nullable().optional(),
  }),

  preflight_confirm: z.object({
    operation: z.enum(['skoki', 'ferry', 'egzamin', 'techniczny', 'inne']),
    departureIcao: z.string().max(8).nullable().optional(),
    arrivalIcao: z.string().max(8).nullable().optional(),
    /**
     * Godzina meldunku — **OPCJONALNA od schemaVersion 2** (§3.6a). Ekran przejęcia
     * o nią nie pyta: służba jest klamrą wokół sesji, a nie czymś, co pilot otwiera,
     * żeby polecieć. Wymaganie jej tutaj odrzucałoby paczki z KAŻDEGO nowego telefonu.
     */
    dutyStart: epochMs.nullable().optional(),
    reading,
    corrections: z.array(z.record(z.unknown())).optional(),
    client: z.string().max(200).nullable().optional(),
    // Notatka do dnia (issue #14) — wolny tekst, wielolinijkowy. Limit 2000 znaków,
    // bo to NOTATKA, a nie załącznik: mieści akapit o okolicznościach dnia i nie
    // zamienia rejestru zdarzeń w magazyn dokumentów. Pole jest OPCJONALNE i to jest
    // zgodność wsteczna, nie luźność — telefony sprzed tej zmiany go nie wysyłają
    // i ich paczki mają nadal przechodzić.
    notes: z.string().max(2000).nullable().optional(),
    mhFormat: z.enum(['decimal', 'hhmm']).optional(),
  }),

  engine_start: z.object({
    position: gpsPosition.optional(),
    fieldElevationFt: finite.nullable().optional(),
  }),

  engine_stop: z.object({ position: gpsPosition.optional() }),

  taxi: z.object({ method, position: gpsPosition.optional() }),
  takeoff: z.object({ method, position: gpsPosition.optional() }),
  landing: z.object({ method, position: gpsPosition.optional() }),

  drop: z.object({
    dropNumber: z.number().int().positive(),
    altitudeFt: finite.nullable().optional(),
    jumpers: z.object({
      tandem: z.number().int().nonnegative(),
      aff: z.number().int().nonnegative(),
      solo: z.number().int().nonnegative(),
    }),
    client: z.string().max(200).nullable().optional(),
    position: gpsPosition.optional(),
  }),

  refuel: z.object({
    beforeL: finite,
    addedL: finite,
    afterL: finite,
    consumptionLPerH: finite.nullable().optional(),
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

  // `leg_close` walidowane tu między 2026-08-06 a 2026-08-10 — usunięte razem ze
  // zdarzeniem (sesja = jeden bieg silnika; zatwierdzeniem jest `day_close`).

  /**
   * `day_close` — ZDANIE SAMOLOTU = ZATWIERDZENIE LOGU SESJI (2026-08-10).
   * Odczyt końcowy wymagany (jest przekazaniem dla następnego pilota i ogniwem
   * łańcucha MH), godzina końca służby opcjonalna (§3.6a): zdanie maszyny nie
   * kończy dnia pilota, więc ekran jej nie wysyła.
   */
  day_close: z.object({
    finalReading: reading,
    dutyEnd: epochMs.nullable().optional(),
    /** Powód zdania bez uruchomienia silnika (09C); brak = miękka flaga w domenie. */
    noFlightReason: z.enum(['weather', 'malfunction', 'cancelled', 'other']).nullable().optional(),
  }),

  event_correction: z.discriminatedUnion('action', [
    z.object({ targetUuid: z.string().min(1).max(100), action: z.literal('retime'), newTime: epochMs }),
    z.object({ targetUuid: z.string().min(1).max(100), action: z.literal('void') }),
  ]),
};

/** Payload zgodny ze schematem swojego typu? Nieznany typ = nie — koperta i tak go utnie. */
export function payloadValid(type: string, payload: unknown): boolean {
  const schema = PAYLOAD_SCHEMAS[type];
  return schema != null && schema.safeParse(payload).success;
}
