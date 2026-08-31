/**
 * UZ Aero - panel 2.0: DZIENNIK, poziom 2 - sesja na WIERSZ GRIDU.
 *
 * Moduł CZYSTY. Formatuje, nie liczy - z jednym wyjątkiem, który liczbą nie jest:
 * składa PARY wartości czytane jednym spojrzeniem („08:42 → 10:22").
 *
 * ══ PARA JEST KOLUMNĄ, BO JEST JEDNYM PYTANIEM ══
 * Zamówienie wymieniało siedemnaście danych, a nie siedemnaście kolumn. Godzina
 * uruchomienia bez godziny wyłączenia nie odpowiada na nic; razem odpowiadają na
 * „jak długo pracował silnik". Dlatego para stoi w jednej komórce, a druga linia
 * ją KWALIFIKUJE: przy biegu silnika mówi ile trwał, przy locie - dokąd poleciał.
 *
 * ══ BRAK ODCZYTU ZOSTAJE BRAKIEM ══
 * Kreskę stawiają formatery z `@uzaero/format` (`litres(null)` → `-`), a nie ten
 * moduł. Zero nigdy nie zastępuje braku: `0 L` znaczy pusty zbiornik, kreska znaczy
 * „nikt nie zapisał". Przy parze bez jednej strony kreska zostaje PRZY strzałce,
 * żeby widać było, którego odczytu brakuje.
 */

import { dateUtcShort, duration, litres, motoHours, oilLitres, shortName, timeUtc } from '@uzaero/format';
import type { OperationType } from '@uzaero/domain';

import type { SessionListItemDto } from '../../api/dto';

/** Para wartości w jednej komórce + linia, która ją kwalifikuje. */
export interface CellPair {
  from: string;
  to: string;
  /** Druga linia; `null` = nie ma czego dopowiedzieć (np. nie było dolewki). */
  note: string | null;
}

export interface SessionRow {
  sessionUuid: string;
  day: string;
  /** Plakietka przy dacie - dotyczy CAŁEGO wiersza, nie żadnej pojedynczej liczby. */
  manual: boolean;
  /** Wpis unieważniony przez pilota - wiersz zostaje, ale przekreślony. */
  voided: boolean;

  engine: CellPair;
  flight: CellPair;
  flights: string;

  pic: string;
  dual: string | null;
  operation: string;

  fuel: CellPair;
  moto: CellPair;
  /** Olej NIE MA pary: po locie się go nie mierzy (issue #60). */
  oil: string;
  oilNote: string | null;
}

const NONE = '—';

/**
 * Nazwy operacji PO POLSKU. `Record`, więc nowy rodzaj operacji w domenie wywala
 * kompilację, zamiast pokazać w gridzie surowe `ferry`.
 */
const OPERATIONS: Record<OperationType, string> = {
  skoki: 'Skoki',
  ferry: 'Przelot',
  egzamin: 'Egzamin',
  techniczny: 'Lot tech.',
  inne: 'Inne',
};

export const operationLabel = (operation: OperationType | null): string =>
  operation == null ? NONE : OPERATIONS[operation];

/**
 * Trasa jako druga linia komórki lotu.
 *
 * Przy operacji na JEDNYM placu (skoki) lotnisko stoi RAZ, bez strzałki: druga kopia
 * tego samego kodu nie odpowiada na żadne pytanie. Rozstrzygamy to po obecności
 * drugiego lotniska, a nie po rodzaju operacji - bo `arrivalIcao` jest tym, co serwer
 * faktycznie zapisał, a rodzaj operacji bywa poprawiany.
 */
export function routeNote(departure: string | null, arrival: string | null): string | null {
  if (departure == null && arrival == null) return null;
  if (arrival == null || arrival === departure) return departure ?? arrival;
  return `${departure ?? NONE} → ${arrival}`;
}

export function sessionRow(s: SessionListItemDto): SessionRow {
  const flew = s.firstTakeoffAt != null || s.lastLandingAt != null;

  return {
    sessionUuid: s.sessionUuid,
    // Dobę bierzemy z PRZEJĘCIA, bo tą samą osią filtruje zakres - inaczej wiersz
    // mógłby wypaść poza zakres, w którym go pokazano.
    day: s.claimedAt == null ? NONE : dateUtcShort(s.claimedAt),
    manual: s.manualEntry === true,
    voided: s.status === 'voided',

    engine: {
      from: timeUtc(s.engineStartAt),
      // Sesja otwarta to NIE brak odczytu, tylko fakt, że jeszcze nie nastąpił.
      to: s.status === 'active' && s.engineStopAt == null ? 'w toku' : timeUtc(s.engineStopAt),
      note: s.blockMs > 0 ? duration(s.blockMs) : null,
    },

    flight: {
      from: timeUtc(s.firstTakeoffAt),
      to: timeUtc(s.lastLandingAt),
      // Trasy nie pokazujemy przy sesji bez lotu - opisywałaby lot, którego nie było.
      note: flew ? routeNote(s.departureIcao, s.arrivalIcao) : null,
    },

    flights: String(s.flightsCount),

    pic: s.picName == null ? (s.picCode ?? NONE) : shortName(s.picName),
    dual: s.dualName == null ? null : shortName(s.dualName),
    operation: operationLabel(s.operation),

    fuel: {
      from: litres(s.fuelStartL),
      to: litres(s.fuelEndL),
      // Brak dolewki to brak ZDARZENIA, nie brak danych - wiersz o nim milczy.
      // Skutek uboczny jest korzystny: dni z tankowaniem widać na pierwszy rzut oka.
      note: s.fuelAddedL != null && s.fuelAddedL > 0 ? `dolano ${litres(s.fuelAddedL)}` : null,
    },

    moto: {
      from: motoHours(s.mhStart, s.mhFormat),
      to: motoHours(s.mhEnd, s.mhFormat),
      note: null,
    },

    // Stan, z którym silnik ruszył - policzony przez DOMENĘ (`oil.afterL`), nie tutaj:
    // dolewka bez pomiaru poziomu nie zna, więc naiwne `pomiar + dolewka` dałoby
    // wtedy liczbę wziętą znikąd.
    oil: oilLitres(s.oilAfterL),
    oilNote:
      s.oilAddedL != null && s.oilAddedL > 0
        ? `${oilLitres(s.oilLevelL)} + ${oilLitres(s.oilAddedL)}`
        : null,
  };
}
