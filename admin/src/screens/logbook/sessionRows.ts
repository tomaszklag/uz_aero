/**
 * Ninerdeck - panel 2.0: DZIENNIK, poziom 2 - sesja na WIERSZ GRIDU.
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
 * Kreskę stawiają formatery z `screens/common/values` (`litres(null)` → `—`), a nie
 * ten moduł. Zero nigdy nie zastępuje braku: `0 L` znaczy pusty zbiornik, kreska znaczy
 * „nikt nie zapisał". Przy parze bez jednej strony kreska zostaje PRZY strzałce,
 * żeby widać było, którego odczytu brakuje.
 *
 * ══ DOBA JEST NAGŁÓWKIEM, NIE KOLUMNĄ (3.2.0, `docs/panel-3.2.md` §4.3) ══
 * Wiersz nie niesie już daty jako komórki - niesie KLUCZ doby (`dayKey`), po którym
 * `dayGroups.ts` składa go pod nagłówek z sumami z serwera. Czas trwania biegu przeszedł
 * z drugiej linii pary do własnej kolumny „Blok", bo po niej skanuje się listę.
 */

import { duration, shortName } from '@ninerdeck/format';
import type { OperationType } from '@ninerdeck/domain';

import type { SessionListItemDto } from '../../api/dto';
import { litres, motoHours, NONE, oilLitres, timeUtc } from '../common/values';
import { dayOf } from './dateRanges';

/** Para wartości w jednej komórce + linia, która ją kwalifikuje. */
export interface CellPair {
  from: string;
  to: string;
  /** Druga linia; `null` = nie ma czego dopowiedzieć (np. nie było dolewki). */
  note: string | null;
}

export interface SessionRow {
  sessionUuid: string;
  /** Nazwa operacji dla ludzi (issue #68); `null` = nie ma jej z czego złożyć. */
  signature: string | null;
  /** Chwila przejęcia i jej doba UTC `YYYY-MM-DD` - klucz nagłówka doby; `null` = bez daty. */
  claimedAt: number | null;
  dayKey: string | null;
  /** Plakietka przy parze godzin - dotyczy CAŁEGO wiersza, nie żadnej pojedynczej liczby. */
  manual: boolean;
  /** Wpis unieważniony przez pilota - wiersz zostaje, ale przekreślony. */
  voided: boolean;

  engine: CellPair;
  /** Czas trwania biegu silnika - własna kolumna; kreska, dopóki śmigło pracuje. */
  block: string;
  flight: CellPair;
  flights: string;

  /** Maszyna - zmienna na osi PILOTA (na osi maszyny stoi w tytule). */
  reg: string;
  aircraftType: string;
  picId: string;
  dualId: string | null;
  pic: string;
  dual: string | null;
  operation: string;

  fuel: CellPair;
  moto: CellPair;
  /** Olej NIE MA pary: po locie się go nie mierzy (issue #60). */
  oil: string;
  oilNote: string | null;
}

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
  const running = s.status === 'active' && s.engineStopAt == null;

  return {
    sessionUuid: s.sessionUuid,
    // Przepisana, nie sklejona: sygnaturę składa serwer (issue #68).
    signature: s.signature,
    // Dobę bierzemy z PRZEJĘCIA, bo tą samą osią filtruje zakres i tą samą liczy
    // serwer nagłówki dób - inaczej wiersz mógłby stanąć pod cudzym nagłówkiem.
    claimedAt: s.claimedAt,
    dayKey: s.claimedAt == null ? null : dayOf(s.claimedAt),
    manual: s.manualEntry === true,
    voided: s.status === 'voided',

    engine: {
      from: timeUtc(s.engineStartAt),
      // Sesja otwarta to NIE brak odczytu, tylko fakt, że jeszcze nie nastąpił.
      to: running ? 'w toku' : timeUtc(s.engineStopAt),
      note: null,
    },
    // Blok liczy DOMENA; dopóki śmigło pracuje, liczby jeszcze nie ma - kreska, nie zero.
    block: running ? NONE : duration(s.blockMs),

    flight: {
      from: timeUtc(s.firstTakeoffAt),
      to: timeUtc(s.lastLandingAt),
      // Trasy nie pokazujemy przy sesji bez lotu - opisywałaby lot, którego nie było.
      note: flew ? routeNote(s.departureIcao, s.arrivalIcao) : null,
    },

    flights: String(s.flightsCount),

    reg: s.reg ?? NONE,
    aircraftType: s.aircraftType ?? NONE,
    picId: s.picId,
    dualId: s.dualId,
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

/**
 * Wiersz, w którym osoba z osi PILOTA siedziała W PRAWYM FOTELU (decyzja właściciela
 * 2026-09-26, wariant B): zwykły wiersz z plakietką „Drugi pilot", poza sumami nalotu
 * dowódcy. Rozstrzyga identyfikator, nie nazwisko - dwóch członków może się nazywać
 * tak samo, a osoba jest jedna.
 */
export const asDual = (row: SessionRow, pilotId: string): boolean =>
  row.dualId === pilotId && row.picId !== pilotId;

/**
 * Podpis komórki „Samolot" na osi PILOTA: załoga, gdy była dwuosobowa („z A. Kowal"
 * przy własnej operacji, „dowódca B. Nowak" przy locie w prawym fotelu), inaczej typ
 * maszyny. Kolumny „Pilot" na tej osi nie ma - osoba stoi w tytule - a załoga
 * dwuosobowa dalej jest faktem operacji, więc ma gdzie stać.
 */
export function aircraftNote(row: SessionRow, pilotId: string): string {
  if (asDual(row, pilotId)) return `dowódca ${row.pic}`;
  if (row.dual != null) return `z ${row.dual}`;
  return row.aircraftType;
}
