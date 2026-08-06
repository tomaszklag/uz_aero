/**
 * UZ Aero — werdykt o pozycji zamieniony na komunikat dla pilota (issue #6).
 *
 * Dwa miejsca, dwa różne komunikaty, bo pilot ma w nich RÓŻNE możliwości działania:
 *
 *  • `preflight` — pole ICAO jest jeszcze edytowalne, więc komunikat prowadzi do poprawki
 *    i podaje kod do wstawienia jednym tapnięciem.
 *  • `cockpit` — trasa jest już zapisana w `preflight_confirm`, a rejestr jest append-only
 *    i nie zna korekty trasy. Komunikat mówi więc, co pilot MOŻE zrobić naprawdę: zgłosić
 *    to administratorowi. Ostrzeżenie bez wyjścia byłoby gorsze niż jego brak.
 *
 * W kokpicie milczymy też przy pustej trasie: brak wpisu nie jest błędem (trasa jest
 * opcjonalna), a podpowiadanie kodu po fakcie nic już nie zmienia.
 */

import type { AirfieldProximity } from '../../../domain';

export type ProximityTone = 'amber' | 'blue';

export interface ProximityNote {
  readonly tone: ProximityTone;
  readonly text: string;
  /** Kod do wstawienia jednym tapnięciem; null, gdy nie ma czego proponować. */
  readonly suggestedIcao: string | null;
}

export type ProximityContext = 'preflight' | 'cockpit';

/** Tyle stanu sesji, ile trzeba, żeby wiedzieć, z czym porównać pozycję. */
export interface RouteContext {
  readonly inFlight: boolean;
  readonly flightsCount: number;
  readonly departureIcao: string | null;
  readonly arrivalIcao: string | null;
}

/**
 * Kod, z którym porównujemy pozycję W KOKPICIE. `null` = teraz nie sprawdzamy.
 *
 * W powietrzu sprawdzenie nie ma sensu i byłoby szkodliwe: samolot Z DEFINICJI oddala się
 * od lotniska startu, więc baner świeciłby przez cały lot i nauczyłby pilota ignorowania
 * ostrzeżeń. Zostają dwa momenty z issue #6 — po uruchomieniu silnika i po jego
 * wyłączeniu — czyli dokładnie te, w których samolot stoi.
 *
 * Po pierwszym locie odniesieniem jest lotnisko DOCELOWE, o ile pilot je podał: dzień
 * skokowy ma je równe startowemu, a ferry kończy się gdzie indziej i to właśnie tam
 * zamyka się dzień.
 */
export function groundReferenceIcao(route: RouteContext): string | null {
  if (route.inFlight) return null;
  if (route.flightsCount === 0) return route.departureIcao;
  return route.arrivalIcao ?? route.departureIcao;
}

/** Odległość po ludzku: pod 10 NM z jednym miejscem, wyżej okrągło. */
function distanceText(nm: number): string {
  return nm < 10 ? `${nm.toFixed(1)} NM` : `${Math.round(nm)} NM`;
}

const nameOf = (icao: string, name: string): string => `${icao} · ${name}`;

export function proximityNote(
  verdict: AirfieldProximity | null,
  context: ProximityContext,
): ProximityNote | null {
  if (verdict == null) return null;

  if (verdict.kind === 'suggestion') {
    // Po zapisaniu trasy podpowiedź jest bezużyteczna — w kokpicie milczymy.
    if (context === 'cockpit') return null;
    const { airfield } = verdict.nearest;
    return {
      tone: 'blue',
      text: `Wygląda na to, że stoisz na ${nameOf(airfield.icao, airfield.name)}.`,
      suggestedIcao: airfield.icao,
    };
  }

  const { declared, distanceNm, nearest } = verdict;
  const gap = distanceText(distanceNm);
  const nearby =
    nearest == null ? null : nameOf(nearest.airfield.icao, nearest.airfield.name);

  if (context === 'preflight') {
    return {
      tone: 'amber',
      text:
        `Masz wpisany start ${declared.icao}, a stoisz ${gap} od niego.` +
        (nearby == null ? '' : ` Najbliżej: ${nearby}.`),
      suggestedIcao: nearest?.airfield.icao ?? null,
    };
  }

  return {
    tone: 'amber',
    text:
      `Trasa dnia mówi ${declared.icao}, a samolot stoi ${gap} od niego.` +
      (nearby == null ? '' : ` Najbliżej: ${nearby}.`) +
      ' Trasy nie da się już zmienić w aplikacji — zgłoś to administratorowi.',
    suggestedIcao: null,
  };
}
