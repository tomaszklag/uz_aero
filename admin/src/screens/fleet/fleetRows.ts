/**
 * UZ Aero - panel 2.0: samolot z serwera -> WIERSZ TABELI.
 *
 * Moduł CZYSTY (bez Reacta): decyzje o treści komórek są tu, pod testem, a nie w JSX-ie.
 *
 * == LICZBY FORMATUJE `@uzaero/format`, NIE TEN PLIK ==
 * `litres()` jest wspólne z aplikacją pilota, więc pojemność wygląda tak samo w panelu
 * i na telefonie. Panel nie zaokrągla po swojemu - od `toFixed` w komórce tabeli
 * zaczyna się back-office, który liczy inaczej niż produkt.
 */

import { litres } from '@uzaero/format';
import type { MhFormat } from '@uzaero/domain';

import type { AircraftListItemDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';

/**
 * Format licznika PO POLSKU.
 *
 * `decimal` i `hh:mm` to nazwy z kontraktu, nie z kokpitu - klient klubu czyta tarczę,
 * a nie schemat bazy. Przykład przy nazwie, bo to on rozstrzyga: „3907.8" albo
 * „3907:48" widać na przyrządzie i nie trzeba nic tłumaczyć.
 */
const MH_FORMATS: Record<MhFormat, { label: string; example: string; tone: PillTone }> = {
  decimal: { label: 'dziesiętny', example: '3907.8', tone: 'dim' },
  hhmm: { label: 'godziny i minuty', example: '3907:48', tone: 'blue' },
};

export const mhFormatLabel = (format: MhFormat): string => MH_FORMATS[format].label;
export const mhFormatTone = (format: MhFormat): PillTone => MH_FORMATS[format].tone;
export const mhFormatExample = (format: MhFormat): string => MH_FORMATS[format].example;

/** Kolejność kart wyboru licznika. Domyślny jest pierwszy. */
export const MH_FORMAT_ORDER: readonly MhFormat[] = ['decimal', 'hhmm'];

export interface FleetRow {
  id: string;
  reg: string;
  type: string;
  /** Kreska, nie pusta komórka: rocznik bywa nieznany i to jest normalny stan. */
  year: string;
  capacity: string;
  mhFormatLabel: string;
  mhFormatTone: PillTone;
  /** `null` = drugi pilot nieobowiązkowy; plakietka pojawia się tylko przy wymogu. */
  dualLabel: string | null;
  inService: boolean;
  statusLabel: string;
  /**
   * Jedyny wyjątkowy sygnał tego ekranu: maszyna wyłączona ze służby, a ktoś jeszcze
   * jej nie zdał. Tego nie widać nigdzie indziej w panelu 2.0, więc wiersz to mówi.
   * `null` w każdym innym przypadku - podpis przy każdym wierszu byłby szumem.
   */
  warning: string | null;
  /** Wiersz przygaszony - jednostka poza służbą. Serwer stawia takie na końcu listy. */
  muted: boolean;
}

export function fleetRow(aircraft: AircraftListItemDto): FleetRow {
  const inService = aircraft.serviceStatus !== 'disabled';
  return {
    id: aircraft.id,
    reg: aircraft.reg,
    type: aircraft.type,
    year: aircraft.year == null ? '—' : String(aircraft.year),
    capacity: litres(aircraft.capacityL),
    mhFormatLabel: mhFormatLabel(aircraft.mhFormat),
    mhFormatTone: mhFormatTone(aircraft.mhFormat),
    dualLabel: aircraft.dualRequired ? 'wymagany' : null,
    inService,
    statusLabel: inService ? 'W służbie' : 'Wyłączony',
    warning: !inService && aircraft.openSessions > 0 ? 'ktoś jeszcze na nim lata' : null,
    muted: !inService,
  };
}
