/**
 * UZ Aero - panel 2.0: pola „Aktualny stan" karty samolotu (uwagi do issue #66).
 *
 * Moduł CZYSTY (bez Reacta): decyduje, KIEDY pola stanu są do odczytu i CO wtedy
 * pokazują - a nie jak wyglądają.
 *
 * == JEDNA LICZBA, DWA ŹRÓDŁA, JEDEN WŁAŚCICIEL NARAZ ==
 * Przy tworzeniu jednostki „Aktualny stan" wpisuje administrator (zerowe ogniwo
 * łańcucha odczytów, issue #66). Od chwili, gdy maszyna lata, tę samą liczbę prowadzi
 * DZIENNIK - ostatnie zdanie samolotu albo operacja w toku - i wpis z panelu przestaje
 * cokolwiek znaczyć. Pole edytowalne nad liczbą, której edycja nic nie zmienia, było
 * treścią zgłoszenia („pola z init wartościami powinny być jako readonly - wynikają
 * z zapisu w logach"), więc granica jest ta sama, którą serwer nadaje odczytowi:
 * `reading.source`. Dopóki mówi `initial` (albo odczytu nie ma wcale), liczba jest
 * nadal wyłącznie wpisem administratora i wolno ją poprawić.
 *
 * Wartości NIE liczy panel: paliwo i licznik przychodzą wprost z `reading`, a stan
 * oleju (pomiar + dolewki po nim) sumuje serwer - ta sama zasada, co przy
 * `fuelToleranceL`.
 */

import { litres, motoHours, oilLitres, stampUtc } from '@uzaero/format';
import type { MhFormat } from '@uzaero/domain';

import type { AircraftListItemDto, AircraftReadingDto } from '../../api/dto';

/** Jedno pole stanu w trybie odczytu: tekst pola + podpis pochodzenia. */
export interface CurrentStateField {
  /** Tekst pola; „—" gdy dziennik nie zna wartości (tylko olej ma taki stan). */
  value: string;
  hint: string;
}

export interface CurrentStateView {
  mh: CurrentStateField;
  fuel: CurrentStateField;
  oil: CurrentStateField;
}

/**
 * Czy pola „Aktualny stan" są DO ODCZYTU.
 *
 * `aircraft == null` obejmuje tworzenie ORAZ edycję, zanim lista przyjdzie z serwera -
 * w obu pola są edytowalne, bo nie ma jeszcze odczytu, którym można by je zastąpić
 * (szkic i tak przestawi się z listą, `draftKey`).
 */
export function currentStateLocked(aircraft: AircraftListItemDto | null): boolean {
  if (aircraft == null) return false;
  return aircraft.reading != null && aircraft.reading.source !== 'initial';
}

/** Litry bez jednostki - etykieta pola mówi już „(L)". */
const bare = (formatted: string): string => formatted.replace(/\sL$/, '');

const stamp = (at: number): string => `${stampUtc(at)} UTC`;

/**
 * Wartości pól w trybie odczytu. Wołane WYŁĄCZNIE przy `currentStateLocked`, więc
 * `reading` istnieje; kreska zostaje dla oleju, którego dziennik mógł nigdy nie
 * zmierzyć (oleju po locie się nie mierzy, issue #60).
 */
export function currentStateView(reading: AircraftReadingDto, mhFormat: MhFormat): CurrentStateView {
  const readingHint = `Z dziennika · odczyt ${stamp(reading.at)}.`;
  return {
    mh: { value: motoHours(reading.mh, mhFormat), hint: readingHint },
    fuel: { value: bare(litres(reading.fuelL)), hint: readingHint },
    oil: oilField(reading),
  };
}

/**
 * Olej idzie WŁASNĄ osią (pomiar→pomiar przez wiele operacji), więc ma własny stempel
 * - bywa dużo starszy niż odczyt paliwa - i własny stan pusty: maszyna potrafi latać
 * latami bez jednego pomiaru w dzienniku. Dolewki zapisane po pomiarze wchodzą do
 * wartości (sumę liczy serwer) i podpis mówi to TYLKO wtedy, gdy jakieś były -
 * inaczej suma udawałaby odczyt z bagnetu.
 */
function oilField(reading: AircraftReadingDto): CurrentStateField {
  if (reading.oilL == null) {
    return { value: '—', hint: 'W dzienniku nie ma pomiaru oleju.' };
  }
  const added =
    reading.oilAddedSinceL != null && reading.oilAddedSinceL > 0
      ? ` + dolewki ${oilLitres(reading.oilAddedSinceL)}`
      : '';
  const when = reading.oilAt == null ? '' : ` ${stamp(reading.oilAt)}`;
  return {
    value: bare(oilLitres(reading.oilL)),
    hint: `Z dziennika · pomiar${when}${added}.`,
  };
}
