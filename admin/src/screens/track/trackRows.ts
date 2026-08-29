/**
 * UZ Aero - panel: LOG PUNKTÓW śladu → wiersze tabeli (moduł CZYSTY).
 *
 * Osobno od ekranu, jak `dayFlights.ts` przy karcie dnia: napisy powstają w kodzie
 * testowalnym w Node, a `.tsx` tylko je układa.
 *
 * Powód odrzucenia jest tu TREŚCIĄ, nie ozdobą - po to istnieje ten log. Każdy z czterech
 * powodów bramki znaczy dla diagnostyki co innego i dlatego każdy dostaje własne zdanie,
 * a nie wspólne „odrzucony".
 */

import type { TrackPoint, TrackRejection } from '@uzaero/domain';
import { formatLatLon, timeUtcSeconds } from '@uzaero/format';

import type { PillTone } from '../../ui/components/Pill';

export interface TrackLogRow {
  id: string;
  time: string;
  lat: string;
  lon: string;
  groundSpeed: string;
  altitude: string;
  track: string;
  accuracy: string;
  state: string;
  stateTone: PillTone;
  /** Wyjaśnienie pod wierszem; pusty napis = brak uwag. */
  note: string;
  rejected: boolean;
}

/** Co znaczy dany powód odrzucenia - słowami, którymi opisuje go dokumentacja detekcji. */
const REJECTION_NOTE: Record<TrackRejection, string> = {
  accuracy:
    'Dokładność gorsza niż próg bramki - odbiornik sam przyznaje, że zgaduje pozycję.',
  speed: 'Prędkość ponad progiem plauzybilności - odczyt fizycznie niemożliwy dla tego statku.',
  jump: 'Skok pozycji wymagający prędkości ponad progiem - multipath albo spoofing.',
  'no-position': 'Wiersz bez pozycji - fix zapisany, zanim odbiornik ustalił miejsce.',
};

const REJECTION_LABEL: Record<TrackRejection, string> = {
  accuracy: 'dokładność',
  speed: 'prędkość',
  jump: 'skok',
  'no-position': 'brak pozycji',
};

export function trackLogRows(log: readonly TrackPoint[]): TrackLogRow[] {
  return log.map((point, index) => {
    const rejected = point.rejected != null;
    const position = point.rejected === 'no-position' ? ['-', '-'] : splitPosition(point);

    return {
      id: `${point.time}-${index}`,
      time: timeUtcSeconds(point.time),
      lat: position[0]!,
      lon: position[1]!,
      groundSpeed: point.groundSpeedKt != null ? `${Math.round(point.groundSpeedKt)} kt` : '-',
      altitude:
        point.altitudeFt != null ? Math.round(point.altitudeFt).toLocaleString('pl-PL') : '-',
      track: point.trackDeg != null ? `${Math.round(point.trackDeg)}°` : '-',
      accuracy: point.accuracyM != null ? `${Math.round(point.accuracyM)} m` : '-',
      state: point.rejected != null ? REJECTION_LABEL[point.rejected] : 'ok',
      // Skok pozycji to inny kaliber niż słaba dokładność: pierwsze bywa atakiem albo
      // odbiciem od terenu, drugie zwykłą spiralą wznoszenia. Kolor to rozróżnia.
      stateTone: point.rejected == null ? 'dim' : point.rejected === 'jump' ? 'red' : 'amber',
      note: point.rejected != null ? REJECTION_NOTE[point.rejected] : '',
      rejected,
    };
  });
}

/**
 * `formatLatLon` daje jeden napis „52°08.3'N 015°47.9'E" - tabela chce dwóch kolumn,
 * żeby stopnie ustawiły się w pionie jedne pod drugimi. Rozdziela je pojedyncza spacja
 * między częścią szerokości i długości (patrz `packages/format`).
 */
function splitPosition(point: TrackPoint): [string, string] {
  const [lat = '', lon = ''] = formatLatLon(point.lat, point.lon).split(' ');
  return [lat, lon];
}

/** Podpis pod tabelą: ile pokazano i ile odrzuciła bramka. */
export function trackLogSummary(shown: number, total: number, usable: number): string {
  const rejected = total - usable;
  if (total === 0) return 'Ten lot nie ma zapisu GPS.';
  return `Pokazano ${shown} z ${total} wierszy (próbka co 30 s plus wszystkie odrzucone). Bramka jakości odrzuciła ${rejected}.`;
}
