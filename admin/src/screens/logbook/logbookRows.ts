/**
 * UZ Aero - panel 2.0: DZIENNIK, poziom 1 - maszyna z serwera na WIERSZ TABELI.
 *
 * Moduł CZYSTY (bez Reacta): decyzje o treści komórek są tu, pod testem, a nie w JSX-ie.
 *
 * ══ FORMATUJEMY, NIGDY NIE LICZYMY ══
 * Wszystkie liczby przyszły policzone z serwera; tutaj dobieramy im wyłącznie postać
 * (`@uzaero/format`, wspólny z aplikacją pilota). Ani jednego dodawania, dzielenia
 * ani „średnio na godzinę" - taka liczba rozjechałaby się z analityką zużycia,
 * która liczy to samo inaczej i na innych danych.
 */

import { hhmm, litres, motoHours } from '@uzaero/format';

import type { LogAircraftDto } from '../../api/dto';

export interface LogbookRow {
  aircraftId: string;
  /** Znaki na kadłubie; kreska tylko dla jednostki spoza rejestru floty. */
  reg: string;
  aircraftType: string;
  /**
   * Jedyny sygnał wyjątkowy tego ekranu: maszyna ma teraz otwartą sesję. Stoi
   * w JEJ wierszu, nie w banerze nad tabelą - i tylko wtedy, gdy jest prawdziwy.
   */
  flyingNow: string | null;

  days: string;
  takeoffs: string;
  engine: string;
  airborne: string;
  fuel: string;
  moto: string;

  /** Maszyna, która w zakresie nie latała - wiersz przygaszony, ale obecny. */
  idle: boolean;
}

/**
 * Kreska braku. JEDNO miejsce, w którym powstaje - żeby „nie wiadomo" wyglądało
 * wszędzie tak samo i nigdy nie zamieniło się w zero.
 */
const NONE = '—';

export function logbookRow(a: LogAircraftDto): LogbookRow {
  const idle = a.sessions === 0;
  return {
    aircraftId: a.aircraftId,
    reg: a.reg ?? NONE,
    aircraftType: a.aircraftType ?? NONE,
    flyingNow: a.openSessions > 0 ? 'leci teraz' : null,

    // Zero jest tu PRAWDĄ, nie brakiem: maszyna stała i to jest odpowiedź.
    days: String(a.activeDays),
    // `null` znaczy „wiersze sprzed kolumn statystyk" - i wtedy kreska, nie zero.
    takeoffs: a.takeoffs == null ? NONE : String(a.takeoffs),
    // Sumy czasu w „HH:MM" - dziesiątki godzin w miesiącu nie mieszczą się w „H:MM".
    engine: hhmm(a.blockMs),
    airborne: hhmm(a.flightMs),
    // `litres(null)` sam oddaje kreskę: bilans z dziurą nie jest bilansem.
    fuel: litres(a.fuelConsumedL),
    moto: motoHours(a.mhDeltaH, a.mhFormat),

    idle,
  };
}
