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
 * Kod SPOZA katalogu (przelot do EDDB) nie daje ani listy, ani potwierdzenia — i tak ma
 * być. Katalog obejmuje wyłącznie Polskę, więc jego milczenie nie jest błędem pilota
 * i nie wolno go zamieniać w ostrzeżenie.
 */

import { POLISH_AIRFIELDS, searchAirfields, toMagneticDeg, type Airfield } from '../../../domain';
import type { AirfieldRow } from '../../components/input/AirfieldSuggestions';

export type { AirfieldRow };

export type RouteField = 'departure' | 'arrival';

/**
 * Ile lotnisk opisuje ten dzień: `pair` (start → lądowanie) albo `single` (skoki —
 * ten sam plac, issue #13). O tym, która operacja jest którym kształtem, rozstrzyga
 * domena (`isSameFieldOperation`) — tu przyjmujemy już gotową odpowiedź.
 */
export type RouteShape = 'pair' | 'single';

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
const PAIR_FIELDS: readonly FieldSpec[] = [
  { field: 'departure', label: 'Start ICAO', short: 'Start' },
  { field: 'arrival', label: 'Lądowanie ICAO', short: 'Lądowanie' },
];

/**
 * Skoki: jedno pole i inna nazwa. „Start ICAO" przy operacji, która wraca tam, skąd
 * wystartowała, sugerowałoby, że gdzieś jeszcze jest lądowanie — a lądowanie jest tu
 * tym samym miejscem. Pole `arrival` w szkicu nadal istnieje i ma tę samą wartość
 * (`withRouteShape`), ale pilotowi go nie pokazujemy.
 */
const SINGLE_FIELDS: readonly FieldSpec[] = [
  { field: 'departure', label: 'Lotnisko ICAO', short: 'Lotnisko' },
];

const fieldsOf = (shape: RouteShape): readonly FieldSpec[] =>
  shape === 'single' ? SINGLE_FIELDS : PAIR_FIELDS;

const valueOf = (route: RouteDraft, field: RouteField): string =>
  (field === 'departure' ? route.departureIcao : route.arrivalIcao).trim();

export interface RouteSuggestionsOptions {
  catalogue?: readonly Airfield[];
  limit?: number;
  /** Kształt trasy; domyślnie `pair` — tak wygląda większość operacji. */
  shape?: RouteShape;
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

  for (const spec of fieldsOf(options.shape ?? 'pair')) {
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
 * Kurs pasa podajemy MAGNETYCZNY, bo taki jest w lotnictwie kursem domyślnym: tak opisane
 * są progi, tak podaje go wieża i taki pilot odczyta z busoli. Katalog trzyma kurs
 * GEOGRAFICZNY (mapa śladu obraca nim pas na siatce zorientowanej na północ geograficzną),
 * więc przeliczamy tutaj — w warstwie, która mówi do pilota.
 *
 * Zostają STOPNIE, a nie oznaczenie progu („06/24"): oznaczenie jest zaokrąglone do
 * dziesiątek i bywa dodatkowo przesunięte decyzją zarządzającego lotniskiem, a kurs
 * z geometrii pasa znamy dokładniej niż z takiego zaokrąglenia.
 */
export function airfieldRow(airfield: Airfield): AirfieldRow {
  const parts: string[] = [];
  if (airfield.runway != null) {
    const magnetic = toMagneticDeg(airfield.runway.headingDeg, airfield);
    parts.push(`pas ${String(magnetic).padStart(3, '0')}°`);
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
  options: Pick<RouteSuggestionsOptions, 'catalogue' | 'shape'> = {},
): RouteConfirmation[] {
  const catalogue = options.catalogue ?? POLISH_AIRFIELDS;

  const rows: RouteConfirmation[] = [];
  for (const spec of fieldsOf(options.shape ?? 'pair')) {
    const airfield = exactMatch(valueOf(route, spec.field), catalogue);
    if (airfield == null) continue;
    rows.push({ field: spec.field, text: `${spec.short}: ${airfield.icao} · ${airfield.name}` });
  }
  return rows;
}
