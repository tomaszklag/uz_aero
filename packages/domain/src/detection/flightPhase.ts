/**
 * UZ Aero — faza lotu i prędkość pionowa (mockup 05 `.phase-hero`).
 *
 * Mockup pokazuje w kokpicie ogromny napis fazy („Climb") i pod nim prędkość pionową
 * („+1 200 FT/MIN"). To nie jest ozdobnik: w powietrzu pilot ma jednym spojrzeniem
 * wiedzieć, w jakim stanie jest lot, bez odczytywania sześciu liczb.
 *
 * Czysta funkcja bez zależności — dzięki temu da się ją sprawdzić na odtworzonych
 * trasach, tak jak `flightDetector`. GPS klasy konsumenckiej kłamie na wysokości
 * bardziej niż na pozycji, więc:
 *
 *  • prędkość pionową liczymy z **okna czasu**, nie z dwóch kolejnych fixów — pojedynczy
 *    przeskok wysokości o 30 ft dałby fałszywe ±1800 ft/min;
 *  • fixy starsze niż okno odrzucamy, a przy przerwie w sygnale nie „domykamy" wyliczenia
 *    z rozpędu — brak danych zwracamy jako `null`, nie jako zero.
 */

import type { GpsFix } from './fix';
import { slopePerSecond, type TimePoint } from './regression';
import { groundSpeed } from './trends';

/** Nazwy faz odpowiadają napisom z mockupu 05 i jego wariantów. */
export type FlightPhase = 'idle' | 'taxi' | 'climb' | 'cruise' | 'descent';

export interface PhaseReading {
  phase: FlightPhase;
  /** Prędkość pionowa w stopach na minutę; `null` gdy nie da się jej policzyć. */
  verticalSpeedFpm: number | null;
}

/** Okno uśredniania prędkości pionowej (s). Krócej = szum, dłużej = opóźniona reakcja. */
export const VS_WINDOW_SEC = 10;

/**
 * Minimalna rozpiętość okna (s), poniżej której nie podajemy wyniku.
 *
 * Dwa fixy sekundę po sobie różniące się o 20 ft dałyby 1200 ft/min — czyli „Climb"
 * z czystego szumu. Lepiej przez chwilę nie wiedzieć, niż podać liczbę wziętą z sufitu.
 */
export const VS_MIN_SPAN_SEC = 5;

/** Powyżej tej wartości bezwzględnej mówimy o wznoszeniu/zniżaniu, nie o przelocie. */
export const VS_THRESHOLD_FPM = 300;

/** Poniżej tej prędkości po ziemi samolot stoi, a nie kołuje. */
export const TAXI_MIN_KT = 3;

/**
 * Prędkość pionowa z okna fixów (najstarszy → najnowszy).
 *
 * Liczymy **nachylenie regresji liniowej** wysokości względem czasu, a nie różnicę
 * skrajnych punktów. Powód jest praktyczny: metoda „ostatni minus pierwszy" daje
 * pojedynczemu artefaktowi GPS pełną wagę — jeden fix wyżej o 30 ft na końcu okna
 * potrafi wyprodukować fałszywe „Climb". Regresja rozkłada ten sam błąd na całe okno.
 *
 * Zwracamy `null` zamiast zera, gdy danych brakuje albo są zbyt ciasne w czasie —
 * „nie wiem" i „nie wznosi się" to dwie różne informacje.
 */
export function verticalSpeedFpm(
  fixes: readonly GpsFix[],
  windowSec: number = VS_WINDOW_SEC,
): number | null {
  if (fixes.length < 2) return null;

  const newest = fixes[fixes.length - 1]!;
  if (newest.altitudeFt == null) return null;

  // Punkty z wysokością mieszczące się w oknie; czas w sekundach względem najnowszego.
  const points: TimePoint[] = [];
  for (const fix of fixes) {
    if (fix.altitudeFt == null) continue;
    const ageMs = newest.time - fix.time;
    // Ujemny wiek = fix z przyszłości (cofnięty zegar) — odrzucamy.
    if (ageMs < 0 || ageMs > windowSec * 1000) continue;
    points.push({ t: -ageMs / 1000, v: fix.altitudeFt });
  }

  const slope = slopePerSecond(points, VS_MIN_SPAN_SEC);
  return slope == null ? null : slope * 60; // ft/s → ft/min
}

/**
 * Faza lotu na podstawie stanu automatu detekcji i ostatnich fixów.
 *
 * `airborne` pochodzi z `flightDetector` — świadomie NIE wyliczamy go tu drugi raz.
 * Jeden automat decyduje, czy samolot jest w powietrzu; tutaj tylko nazywamy to,
 * co robi. Dwa niezależne źródła tej samej prawdy prędzej czy później by się rozjechały.
 */
export function flightPhase(
  airborne: boolean,
  fixes: readonly GpsFix[],
  windowSec: number = VS_WINDOW_SEC,
): PhaseReading {
  const vs = verticalSpeedFpm(fixes, windowSec);

  if (!airborne) {
    // Prędkość bierzemy z okna, nie z ostatniego fixa: gdy odbiornik jej nie podaje
    // (na kołowaniu to reguła, nie wyjątek), `groundSpeed` odtworzy ją z przemieszczenia.
    // Poprzednia wersja czytała pole wprost i przy braku prędkości pokazywała „Engine
    // Idle" kołującemu samolotowi.
    const speed = groundSpeed(fixes);
    const moving = speed != null && speed.kt >= TAXI_MIN_KT;
    return { phase: moving ? 'taxi' : 'idle', verticalSpeedFpm: vs };
  }

  // Bez wysokości nie da się odróżnić wznoszenia od przelotu — mówimy „cruise",
  // bo to stan domyślny, a nie zgadujemy wznoszenia.
  if (vs == null) return { phase: 'cruise', verticalSpeedFpm: null };

  if (vs >= VS_THRESHOLD_FPM) return { phase: 'climb', verticalSpeedFpm: vs };
  if (vs <= -VS_THRESHOLD_FPM) return { phase: 'descent', verticalSpeedFpm: vs };
  return { phase: 'cruise', verticalSpeedFpm: vs };
}
