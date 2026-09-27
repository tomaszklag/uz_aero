/**
 * Ninerdeck - panel 3.2: ADRESY modułu „Do sprawdzenia" - jedno źródło (jak `logbookPaths`).
 *
 * Trzy ekrany jednego pytania: lista spraw, skrzynka rozjazdów (sprawa w szufladzie pod
 * własnym adresem), karty dnia (karta w szufladzie pod własnym adresem, zakres dat
 * w adresie jak w dzienniku). Filtry stoją w adresie po polsku, bo adres bywa wklejany
 * w rozmowie; wartości puste NIE wchodzą do adresu.
 */

import type { DayRange } from '../logbook/dateRanges';

export const ATTENTION = '/do-sprawdzenia';
export const FLAGS = `${ATTENTION}/rozjazdy`;
export const EXPORTS = `${ATTENTION}/karty`;

/** Skrzynka: stan (`otwarte` domyślnie, `rozstrzygniete`) i rodzaj po polskim slugu. */
export interface FlagFilter {
  resolved: boolean;
  kind: string | null;
}

function query(params: URLSearchParams): string {
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

function flagParams(filter: FlagFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.resolved) params.set('stan', 'rozstrzygniete');
  if (filter.kind != null) params.set('rodzaj', filter.kind);
  return params;
}

export function flagsPath(filter: FlagFilter): string {
  return `${FLAGS}${query(flagParams(filter))}`;
}

export function flagPath(id: number, filter: FlagFilter): string {
  return `${FLAGS}/${id}${query(flagParams(filter))}`;
}

/** Karty dnia: zakres dat (jak dziennik) i stan po polskim slugu (`bez-karty`, `w-arkuszu`…). */
export interface ExportFilter {
  range: DayRange;
  state: string | null;
}

function exportParams(filter: ExportFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.range.from !== '') params.set('od', filter.range.from);
  if (filter.range.to !== '') params.set('do', filter.range.to);
  if (filter.state != null) params.set('stan', filter.state);
  return params;
}

export function exportsPath(filter: ExportFilter): string {
  return `${EXPORTS}${query(exportParams(filter))}`;
}

export function exportPath(sessionUuid: string, filter: ExportFilter): string {
  return `${EXPORTS}/${encodeURIComponent(sessionUuid)}${query(exportParams(filter))}`;
}
