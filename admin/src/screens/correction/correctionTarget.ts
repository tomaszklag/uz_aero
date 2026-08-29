/**
 * UZ Aero - panel: karta „ZDARZENIE KORYGOWANE · ORYGINALNY ODCZYT" (moduł CZYSTY).
 *
 * Ta karta odpowiada na jedno pytanie: SKĄD wzięła się ta godzina. Dlatego oba zegary
 * stoją obok siebie razem z czasem, którym projekcja liczy dzień - bo cała treść
 * scenariusza rozjazdu zegara mieści się w tej różnicy: `gps_time` puste (brak fixa),
 * więc czas spadł na `device_time`, a ten spieszył dwanaście minut.
 *
 * Napisy powstają wyłącznie z pól DTO. Niczego tu nie liczymy i nie dopowiadamy -
 * pole, którego serwer nie przysłał, dostaje kreskę.
 */

import { dateTimeUtc, timeUtcSeconds } from '@uzaero/format';

import type { CorrectionTargetDto } from '../../api/dto';
import type { KeyValueTone } from '../../ui/components/KeyValue';

export interface TargetRow {
  label: string;
  value: string;
  /** Dopisek szeptem (`<small>`) - skąd wartość albo co znaczy jej brak. */
  note?: string;
  tone?: KeyValueTone;
}

/**
 * Wiersze karty. Kolejność jak w `A02b` i to nie jest kwestia gustu: typ i uuid
 * identyfikują zdarzenie, dwa zegary tłumaczą liczbę, a „zapisane przez" mówi,
 * czy patrzymy na odczyt telefonu, czy na skutek wcześniejszej korekty z panelu.
 */
export function targetRows(target: CorrectionTargetDto): TargetRow[] {
  const rows: TargetRow[] = [
    { label: 'Typ', value: target.type },
    { label: 'uuid', value: target.uuid },
    {
      label: 'device_time',
      value: dateTimeUtc(target.deviceTime),
      note: 'UTC · zegar telefonu w chwili zapisu',
    },
  ];

  rows.push(
    target.gpsTime == null
      ? {
          label: 'gps_time',
          value: 'brak fixa',
          note: 'null - zdarzenie zapisano bez pozycji GPS',
          tone: 'red',
        }
      : { label: 'gps_time', value: dateTimeUtc(target.gpsTime), note: 'UTC · czas z GPS' },
  );

  rows.push(
    target.effectiveTime == null
      ? {
          label: 'Czas użyty w projekcji',
          value: 'żaden',
          note: 'zdarzenie jest już unieważnione i nie wchodzi do liczb dnia',
          tone: 'red',
        }
      : {
          label: 'Czas użyty w projekcji',
          value: timeUtcSeconds(target.effectiveTime),
          // Fallback na zegar telefonu jest tu FAKTEM, nie ostrzeżeniem - ale to on
          // tłumaczy, dlaczego liczba dnia jest zła, więc mówimy o nim wprost.
          note:
            target.gpsTime == null
              ? 'fallback na device_time - GPS nie dał czasu'
              : 'z gps_time - GPS ma pierwszeństwo przed zegarem telefonu',
          tone: target.gpsTime == null ? 'amber' : undefined,
        },
  );

  rows.push({
    label: 'Zapisane przez',
    value: target.sourceDevice ?? '-',
    note:
      target.sourceDevice == null
        ? 'events.source_device puste - wpis sprzed wprowadzenia tego pola'
        : 'events.source_device - napis podany przez klienta, nie tożsamość konta',
  });

  if (target.voided) {
    rows.push({
      label: 'Stan',
      value: 'UNIEWAŻNIONE',
      note: 'wcześniejsza korekta wyłączyła je z wyliczeń; retime przywróci je do życia',
      tone: 'red',
    });
  }

  return rows;
}
