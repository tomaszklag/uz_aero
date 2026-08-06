/**
 * UZ Aero — czy samolot stoi tam, gdzie pilot wpisał trasę.
 *
 * PO CO: preflight PODPOWIADA trasę z ostatniego dnia na tym samolocie, więc wczorajsze
 * ICAO przenosi się na dziś samo. Pilot, który dziś startuje skądinąd, ma jeden ruch do
 * zrobienia — i dokładnie ten jeden ruch najłatwiej przeoczyć, bo formularz wygląda na
 * wypełniony. Pozycja z GPS to jedyne źródło, które o tym wie niezależnie od pilota.
 *
 * PODPOWIEDŹ, NIE BRAMKA — dwa razy, z dwóch różnych powodów:
 *
 *  1. Katalog obejmuje 106 polskich lotnisk. Lądowisko prywatne, pas przy gospodarstwie
 *     albo lotnisko za granicą po prostu w nim nie istnieją, a lot z takiego miejsca jest
 *     najzwyklejszą codziennością. Dlatego kod SPOZA katalogu nie jest oceniany wcale:
 *     nie mamy z czym go porównać, więc milczymy, zamiast straszyć.
 *  2. GPS bywa niedostępny albo zimny. Brak pozycji nie jest błędem pilota i nie może
 *     zamienić się w komunikat.
 *
 * Funkcja NIE JEST częścią detekcji stanów lotu i nie wolno jej tam wciągać: elewacja
 * i pozycja pola w `detection/` pochodzą z GPS, bo w `heightAboveField()` odejmują się od
 * wysokości fixa i wspólny błąd odbiornika się skraca (uzasadnienie: issue #5).
 * Tu chodzi o coś innego — o porównanie DEKLARACJI pilota z pomiarem.
 */

import { POLISH_AIRFIELDS, type Airfield } from './airfields';
import { distanceNm, type LatLon } from './detection/geo';

/**
 * Promień, w którym uznajemy, że samolot jest NA lotnisku (mile morskie).
 *
 * Ta sama skala co geofence lądowania (`LANDING_FIELD_VICINITY_NM`), i z tego samego
 * powodu: 2 NM to ~3,7 km, czyli więcej niż rozrzut między punktem odniesienia lotniska
 * a najdalszym stanowiskiem, a wciąż mniej niż odstęp do sąsiedniego lotniska.
 */
export const AIRFIELD_VICINITY_NM = 2;

/** Lotnisko z katalogu wraz z odległością od podanej pozycji. */
export interface NearbyAirfield {
  readonly airfield: Airfield;
  readonly distanceNm: number;
}

/**
 * Co mamy pilotowi do powiedzenia o jego pozycji.
 *
 * `mismatch` — wpisał kod, a stoi gdzie indziej; `suggestion` — nie wpisał nic, a stoi na
 * rozpoznawalnym lotnisku. Wszystko poza tym to cisza (`null`).
 */
export type AirfieldProximity =
  | {
      readonly kind: 'mismatch';
      readonly declared: Airfield;
      readonly distanceNm: number;
      /** Najbliższe lotnisko z katalogu — null, gdy żadne nie jest blisko. */
      readonly nearest: NearbyAirfield | null;
    }
  | { readonly kind: 'suggestion'; readonly nearest: NearbyAirfield };

export interface AirfieldProximityOptions {
  /** Pozycja z GPS; null = nie ma czego sprawdzać. */
  readonly position: LatLon | null;
  /** Kod wpisany przez pilota (pusty = jeszcze nie wpisał). */
  readonly icao: string | null | undefined;
  readonly catalogue?: readonly Airfield[];
  readonly radiusNm?: number;
}

/** Najbliższe lotnisko z katalogu, opcjonalnie w zadanym promieniu. */
export function nearestAirfield(
  position: LatLon,
  options: { catalogue?: readonly Airfield[]; maxDistanceNm?: number } = {},
): NearbyAirfield | null {
  const catalogue = options.catalogue ?? POLISH_AIRFIELDS;

  let best: NearbyAirfield | null = null;
  for (const airfield of catalogue) {
    const distance = distanceNm(position, airfield);
    if (best == null || distance < best.distanceNm) best = { airfield, distanceNm: distance };
  }

  if (best == null) return null;
  if (options.maxDistanceNm != null && best.distanceNm > options.maxDistanceNm) return null;
  return best;
}

/**
 * Werdykt o zgodności wpisanego lotniska z pozycją. `null` znaczy „nie mam nic do
 * powiedzenia" i jest najczęstszym wynikiem — także wtedy, gdy wszystko się zgadza.
 */
export function checkAirfieldProximity(options: AirfieldProximityOptions): AirfieldProximity | null {
  const { position } = options;
  if (position == null) return null;

  const catalogue = options.catalogue ?? POLISH_AIRFIELDS;
  const radiusNm = options.radiusNm ?? AIRFIELD_VICINITY_NM;
  const icao = (options.icao ?? '').trim().toUpperCase();

  if (icao === '') {
    const nearest = nearestAirfield(position, { catalogue, maxDistanceNm: radiusNm });
    return nearest == null ? null : { kind: 'suggestion', nearest };
  }

  // Kod spoza katalogu: nie mamy z czym porównać, więc nie oceniamy. Zagranica i lądowiska
  // prywatne mają prawo istnieć bez naszej wiedzy.
  const declared = catalogue.find((a) => a.icao === icao) ?? null;
  if (declared == null) return null;

  const distance = distanceNm(position, declared);
  if (distance <= radiusNm) return null;

  const nearest = nearestAirfield(position, { catalogue, maxDistanceNm: radiusNm });
  return {
    kind: 'mismatch',
    declared,
    distanceNm: distance,
    // Najbliższe lotnisko podajemy TYLKO gdy naprawdę jest blisko: „najbliższe: EPZG,
    // 60 km stąd" nie jest podpowiedzią, tylko szumem.
    nearest: nearest != null && nearest.airfield.icao !== declared.icao ? nearest : null,
  };
}
