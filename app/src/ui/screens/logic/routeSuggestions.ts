/**
 * UZ Aero — 02F: czyje podpowiedzi pokazać pod wierszem trasy i co potwierdzić.
 *
 * Lista podpowiedzi stoi POD CAŁYM wierszem, na pełną szerokość (mockup `02f`), więc
 * musi wiedzieć, do którego z dwóch pól należy. Naturalne byłoby oprzeć to na fokusie —
 * i byłby to błąd: na Androidzie dotknięcie podpowiedzi najpierw ZABIERA fokus polu,
 * więc lista zdążyłaby zniknąć, zanim dojdzie dotknięcie. Stąd reguła bez fokusu:
 * podpowiedzi należą do pierwszego pola, które ma coś NIEDOKOŃCZONEGO.
 *
 * „Niedokończone" znaczy: jest tam tekst, ale nie jest to kod, który katalog zna. Kod
 * rozpoznany zamyka listę i zamienia się w potwierdzenie z nazwą — pilot widzi, że EPWA
 * to faktycznie Warszawa, zanim pojedzie dalej z literówką.
 *
 * Kod SPOZA katalogu (ferry do EDDB) nie daje ani listy, ani potwierdzenia — i tak ma
 * być. Katalog obejmuje wyłącznie Polskę, więc jego milczenie nie jest błędem pilota
 * i nie wolno go zamieniać w ostrzeżenie.
 */

import { POLISH_AIRFIELDS, searchAirfields, type Airfield } from '../../../domain';
import type { AirfieldRow } from '../../components/input/AirfieldSuggestions';

export type { AirfieldRow };

export type RouteField = 'departure' | 'arrival';

export interface RouteDraft {
  readonly departureIcao: string;
  readonly arrivalIcao: string;
}

export interface RouteSuggestions {
  readonly field: RouteField;
  /** Nagłówek listy — mockup 02F: „Start ICAO — podpowiedzi". */
  readonly label: string;
  readonly airfields: readonly Airfield[];
}

export interface RouteConfirmation {
  readonly field: RouteField;
  /** Gotowy wiersz pod trasą: „Lądowanie: EPWA · Warsaw Chopin Airport". */
  readonly text: string;
}

interface FieldSpec {
  readonly field: RouteField;
  readonly label: string;
  readonly short: string;
}

/** Kolejność ma znaczenie: pilot wypełnia trasę od startu. */
const FIELDS: readonly FieldSpec[] = [
  { field: 'departure', label: 'Start ICAO', short: 'Start' },
  { field: 'arrival', label: 'Lądowanie ICAO', short: 'Lądowanie' },
];

const valueOf = (route: RouteDraft, field: RouteField): string =>
  (field === 'departure' ? route.departureIcao : route.arrivalIcao).trim();

export interface RouteSuggestionsOptions {
  catalogue?: readonly Airfield[];
  limit?: number;
}

/**
 * Dokładne trafienie w PODANYM katalogu, a nie w globalnym `airfieldByIcao` — inaczej
 * test z własnym zestawem lotnisk dostawałby odpowiedź z prawdziwych danych, a więc
 * sprawdzałby coś innego niż to, co ustawił.
 */
function exactMatch(icao: string, catalogue: readonly Airfield[]): Airfield | null {
  const key = icao.trim().toUpperCase();
  if (key === '') return null;
  return catalogue.find((a) => a.icao === key) ?? null;
}

/** Podpowiedzi do pokazania albo `null`, gdy nie ma czego podpowiadać. */
export function routeSuggestions(
  route: RouteDraft,
  options: RouteSuggestionsOptions = {},
): RouteSuggestions | null {
  const catalogue = options.catalogue ?? POLISH_AIRFIELDS;

  for (const spec of FIELDS) {
    const value = valueOf(route, spec.field);
    if (value.length === 0) continue;
    // Kod rozpoznany = pytanie zamknięte; lista ustępuje miejsca potwierdzeniu.
    if (exactMatch(value, catalogue) != null) continue;

    const airfields = searchAirfields(value, options);
    if (airfields.length > 0) {
      return { field: spec.field, label: `${spec.label} — podpowiedzi`, airfields };
    }
  }
  return null;
}

/**
 * Lotnisko na wiersz listy.
 *
 * Kurs pasa podajemy w STOPNIACH, a nie jako oznaczenie progu („06/24"). Katalog trzyma
 * kurs GEOGRAFICZNY, a oznaczenia są magnetyczne — przeliczenie 65° na „07" różniłoby się
 * od tabliczki na lotnisku o cały numer progu. Stopnie są tym, co wiemy naprawdę.
 */
export function airfieldRow(airfield: Airfield): AirfieldRow {
  const parts: string[] = [];
  if (airfield.runway != null) {
    parts.push(`pas ${String(airfield.runway.headingDeg).padStart(3, '0')}°`);
    parts.push(`${airfield.runway.lengthM} m`);
  }
  if (airfield.elevationFt != null) parts.push(`${airfield.elevationFt} ft`);

  return {
    icao: airfield.icao,
    name: airfield.name,
    meta: parts.length > 0 ? parts.join(' · ') : null,
  };
}

/** Wiersze potwierdzeń dla kodów, które katalog rozpoznaje. */
export function routeConfirmations(
  route: RouteDraft,
  options: Pick<RouteSuggestionsOptions, 'catalogue'> = {},
): RouteConfirmation[] {
  const catalogue = options.catalogue ?? POLISH_AIRFIELDS;

  const rows: RouteConfirmation[] = [];
  for (const spec of FIELDS) {
    const airfield = exactMatch(valueOf(route, spec.field), catalogue);
    if (airfield == null) continue;
    rows.push({ field: spec.field, text: `${spec.short}: ${airfield.icao} · ${airfield.name}` });
  }
  return rows;
}
