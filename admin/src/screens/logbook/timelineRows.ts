/**
 * UZ Aero - panel 2.0: OŚ ZDARZEŃ jednej sesji (poziom 3).
 *
 * Moduł CZYSTY. Robi dokładnie dwie rzeczy: nazywa zdarzenie PO POLSKU i wyciąga
 * z niego JEDNO zdanie szczegółu. Niczego nie liczy i niczego nie ukrywa - rejestr
 * jest append-only, więc widać w nim wszystko, łącznie z tym, co unieważniono.
 *
 * ══ SEKUNDY SĄ TU KONIECZNE ══
 * Reszta produktu pokazuje czasy z dokładnością do minuty, bo tyle znaczą dla pilota
 * i dla księgowości klubu. Rejestr czyta się inaczej: różnica między `landing 08:14:09`
 * a `landing 08:14:52` rozstrzyga, KTÓRE zdarzenie unieważniła korekta.
 */

import { litres, oilLitres, timeUtcSeconds } from '@uzaero/format';
import type { Event, EventType } from '@uzaero/domain';

import type { TimelineEntryDto } from '../../api/dto';

/**
 * Nazwy zdarzeń po polsku. `Record<EventType, …>`, więc nowy typ zdarzenia w domenie
 * wywala kompilację, zamiast pojawić się na osi jako surowy kod.
 *
 * Słownik jest TEN SAM, co w aplikacji pilota (issue #44): „Uruchomienie", nie
 * „Start engine". Angielskie nazwy zostają tam, gdzie opisują FAZĘ lotu, a nie zapis
 * w rejestrze.
 */
const NAMES: Record<EventType, string> = {
  session_claim: 'Przejęcie',
  preflight_confirm: 'Zadanie',
  engine_start: 'Uruchomienie',
  engine_stop: 'Wyłączenie',
  taxi: 'Kołowanie',
  takeoff: 'Start',
  landing: 'Lądowanie',
  drop: 'Zrzut',
  boarding: 'Załadunek',
  refuel: 'Tankowanie',
  oil_add: 'Dolewka oleju',
  crew_change: 'Zmiana załogi',
  manual_log_entry: 'Wpis ręczny',
  day_close: 'Zdanie samolotu',
  session_void: 'Unieważnienie wpisu',
  event_correction: 'Korekta',
};

export const eventName = (type: EventType): string => NAMES[type];

/** Odczyt liczby z payloadu bez udawania, że znamy jego kształt. */
const num = (payload: Record<string, unknown>, key: string): number | null => {
  const value = payload[key];
  return typeof value === 'number' ? value : null;
};

const text = (payload: Record<string, unknown>, key: string): string | null => {
  const value = payload[key];
  return typeof value === 'string' && value !== '' ? value : null;
};

/**
 * JEDNO zdanie szczegółu - to, czego nie widać z samej nazwy i godziny.
 *
 * `null` znaczy „nazwa mówi wszystko" i wtedy komórka jest pusta. Wypisywanie
 * czegokolwiek na siłę zamieniłoby kolumnę w szum, przez który nie widać wierszy,
 * które naprawdę coś niosą.
 */
export function eventDetail(event: Event): string | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case 'preflight_confirm': {
      const from = text(payload, 'departureIcao');
      const to = text(payload, 'arrivalIcao');
      const route = from == null ? null : to == null || to === from ? from : `${from} → ${to}`;
      const reading = payload.reading as Record<string, unknown> | undefined;
      const fuel = reading == null ? null : num(reading, 'fuelL');
      return [route, fuel == null ? null : litres(fuel)].filter((part) => part != null).join(' · ') || null;
    }

    case 'refuel': {
      const added = num(payload, 'addedL');
      const after = num(payload, 'afterL');
      if (added == null) return null;
      return after == null ? `+${litres(added)}` : `+${litres(added)} → ${litres(after)}`;
    }

    case 'oil_add': {
      const added = num(payload, 'addedL');
      return added == null ? null : `+${oilLitres(added)}`;
    }

    case 'drop': {
      const jumpers = num(payload, 'jumpers');
      const altitude = num(payload, 'altitudeFt');
      return [
        jumpers == null ? null : `${jumpers} skoczków`,
        altitude == null ? null : `${Math.round(altitude)} ft`,
      ]
        .filter((part) => part != null)
        .join(' · ') || null;
    }

    case 'day_close': {
      const reading = payload.finalReading as Record<string, unknown> | undefined;
      const fuel = reading == null ? null : num(reading, 'fuelL');
      const reason = text(payload, 'noFlightReason');
      return [fuel == null ? null : litres(fuel), reason].filter((p) => p != null).join(' · ') || null;
    }

    case 'session_void':
      // Powód jest CAŁĄ treścią tego wiersza: sam fakt wycofania mówi już nazwa.
      return text(payload, 'reason');

    case 'takeoff':
    case 'landing':
      // Metoda wykrycia jest pytaniem REJESTRU, więc stoi w osobnej kolumnie -
      // nie w zdaniu szczegółu, gdzie powtarzałaby się przy każdym locie.
      return null;

    default:
      return null;
  }
}

export interface TimelineRow {
  uuid: string;
  time: string;
  name: string;
  detail: string | null;
  /** `auto` albo `ręcznie` - prowenienecja zapisu; pytanie rejestru, nie pilota. */
  source: string;
  /** Zdarzenie unieważnione korektą: wiersz zostaje, ale przekreślony. */
  voided: boolean;
  /** Czas PO korekcie; `null` = oryginalny. */
  correctedTime: string | null;
  adminCorrected: boolean;
}

export function timelineRow(entry: TimelineEntryDto): TimelineRow {
  const payload = (entry.event.payload ?? {}) as Record<string, unknown>;
  return {
    uuid: entry.event.uuid,
    time: timeUtcSeconds(entry.event.gpsTime ?? entry.event.deviceTime),
    name: eventName(entry.event.type),
    detail: eventDetail(entry.event),
    source: text(payload, 'method') === 'manual' ? 'ręcznie' : 'auto',
    voided: entry.voided,
    correctedTime: entry.correctedTime == null ? null : timeUtcSeconds(entry.correctedTime),
    adminCorrected: entry.adminCorrected,
  };
}
