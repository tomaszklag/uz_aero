/**
 * UZ Aero - profil pionowy lotu: wysokość w czasie plus liczby pod wykresem.
 *
 * Osobno od `flightTrack.ts`, bo to inne pytanie: tam chodzi o „którędy", tu o „jak
 * wysoko i jak szybko". Ekran pokazuje oba obok siebie, ale profil daje się policzyć
 * dla lotu, którego trasy nie ma sensu rysować (krążenie w kółko nad lotniskiem
 * wygląda na mapie jak kłębek, a na profilu jest czytelną piłą wznoszeń i zejść).
 *
 * WYSOKOŚĆ JEST GPS-owa, nie ciśnieniowa - bez korekty QNH. Mówimy o tym wprost na
 * ekranie (mockup 14 i A02c), bo różnica względem wysokościomierza w kokpicie potrafi
 * sięgnąć kilkuset stóp i pilot ma prawo się zdziwić. Barometr telefonu leci do śladu
 * osobnym kanałem (`kind: 'sensor'`) i na razie NIC nie liczy - czeka na kalibrację
 * w fazie 5, zgodnie z `docs/algorytm-detekcji.md`.
 */

import type { EpochMillis } from '../time';
import { isUsablePoint, type TrackPoint } from './point';

/** Sekundy w minucie - prędkość pionową podajemy w ft/min, bo tak czyta ją pilot. */
const MS_PER_MINUTE = 60_000;

/** Punkt wykresu wysokości. */
export interface ProfileSample {
  time: EpochMillis;
  altitudeFt: number;
}

/** Profil pionowy lotu - seria do wykresu i liczby do podpisu pod nim. */
export interface FlightProfile {
  samples: ProfileSample[];
  /** Wysokość szczytowa i moment jej osiągnięcia (przy zrzucie = wysokość zrzutu). */
  peakAltitudeFt: number | null;
  peakAt: EpochMillis | null;
  /** Wysokość pierwszego i ostatniego odczytu - w praktyce elewacja pola. */
  startAltitudeFt: number | null;
  endAltitudeFt: number | null;
  /** Średnia prędkość pionowa od startu do szczytu (ft/min, dodatnia). */
  averageClimbFtPerMin: number | null;
  /** Średnia prędkość pionowa od szczytu do końca (ft/min, UJEMNA). */
  averageDescentFtPerMin: number | null;
  /** Czas od pierwszego odczytu do szczytu (ms) - „ile trwało wyciągnięcie na wysokość". */
  timeToPeakMs: number | null;
}

/** Pusty profil - lot bez zapisu wysokości. */
export function emptyFlightProfile(): FlightProfile {
  return {
    samples: [],
    peakAltitudeFt: null,
    peakAt: null,
    startAltitudeFt: null,
    endAltitudeFt: null,
    averageClimbFtPerMin: null,
    averageDescentFtPerMin: null,
    timeToPeakMs: null,
  };
}

/**
 * Buduje profil z punktów śladu.
 *
 * Bierze WYŁĄCZNIE punkty przyjęte przez bramkę i mające wysokość - odrzucony fix
 * z wysokością 8 000 ft w środku wznoszenia zrobiłby na wykresie szpilkę, która nie
 * miała miejsca, a to ten sam błąd, przed którym bramka chroni detektor.
 */
export function buildFlightProfile(points: readonly TrackPoint[]): FlightProfile {
  const samples: ProfileSample[] = points
    .filter(isUsablePoint)
    .filter((p): p is TrackPoint & { altitudeFt: number } => p.altitudeFt != null)
    .map((p) => ({ time: p.time, altitudeFt: p.altitudeFt }));

  if (samples.length === 0) return emptyFlightProfile();

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;

  let peak = first;
  for (const sample of samples) {
    if (sample.altitudeFt > peak.altitudeFt) peak = sample;
  }

  const climbMs = peak.time - first.time;
  const descentMs = last.time - peak.time;

  return {
    samples,
    peakAltitudeFt: peak.altitudeFt,
    peakAt: peak.time,
    startAltitudeFt: first.altitudeFt,
    endAltitudeFt: last.altitudeFt,
    // Dzielenie tylko przy niezerowym czasie: lot z jednym odczytem albo szczytem
    // w pierwszym punkcie nie ma prędkości wznoszenia i lepiej powiedzieć „nie wiem"
    // niż pokazać nieskończoność.
    averageClimbFtPerMin:
      climbMs > 0 ? ((peak.altitudeFt - first.altitudeFt) / climbMs) * MS_PER_MINUTE : null,
    averageDescentFtPerMin:
      descentMs > 0 ? ((last.altitudeFt - peak.altitudeFt) / descentMs) * MS_PER_MINUTE : null,
    timeToPeakMs: climbMs > 0 ? climbMs : null,
  };
}
