/**
 * UZ Aero — ZNACZNIKI ŚLADU NA OBU WYKRESACH (issue #47 pkt 2).
 *
 * Jedno źródło (`SessionTrackMarker` z zapytania), dwie postacie — bo mapa i profil
 * odpowiadają na inne pytanie:
 *  • **mapa** ma osie przestrzenne, więc podpis musi powiedzieć, CO to za punkt
 *    („T/O 1 · 08:20") — inaczej cztery kropki nad jednym lotniskiem są nie do
 *    rozróżnienia,
 *  • **profil** ma oś czasu, a rodzaj niesie kolor, więc podpisem jest sama godzina.
 *    Pełne nazwy przy czterech znacznikach nie mieszczą się w szerokości telefonu —
 *    sprawdzone na geometrii mockupu (`design/14-slad.html`), nie na oko.
 *
 * Wspólne dla obu jest scalanie MAKSIMUM z sąsiadem: w dniu skokowym szczyt wypada
 * w chwili zrzutu, a dwa znaczniki na jednym punkcie to dwa podpisy jeden na drugim.
 * Regułę wykonuje zapytanie (`alsoPeak`), tutaj tylko ją wypisujemy.
 */

import type { SessionTrackMarker } from '../../../application';
import { timeUtc } from '../../format';

export interface MarkerPalette {
  green: string;
  red: string;
  blue: string;
}

export interface MapMarkerView {
  position: NonNullable<SessionTrackMarker['position']>;
  color: string;
  label: string;
  ring?: boolean;
}

export interface ProfileMarkerView {
  at: number;
  color: string;
  onCurve?: boolean;
  note?: string | null;
}

/** Znaczniki mapy — z podpisem „co i o której". */
export function mapMarkers(
  markers: readonly SessionTrackMarker[],
  palette: MarkerPalette,
): MapMarkerView[] {
  return markers
    .filter((marker) => marker.position != null)
    .map((marker) => ({
      position: marker.position!,
      color: colorOf(marker, palette),
      label: mapLabel(marker),
      // Pierścień wyróżnia punkty, od których coś się ZACZYNA: start lotu i szczyt.
      ring: marker.kind === 'takeoff' || marker.kind === 'peak',
    }));
}

/** Znaczniki profilu — sama godzina; liczba stóp tylko przy maksimum. */
export function profileMarkers(
  markers: readonly SessionTrackMarker[],
  palette: MarkerPalette,
): ProfileMarkerView[] {
  return markers.map((marker) => ({
    at: marker.at,
    color: colorOf(marker, palette),
    // Zrzut i szczyt siedzą NA KRZYWEJ (wysokość jest ich treścią), start i lądowanie
    // przy ziemi — bo tam właśnie były.
    onCurve: marker.kind === 'drop' || marker.kind === 'peak',
    note: peakNote(marker),
  }));
}

function mapLabel(marker: SessionTrackMarker): string {
  const time = timeUtc(marker.at);
  const peak = marker.alsoPeak === true ? ' · MAX' : '';

  if (marker.kind === 'takeoff') return `T/O ${marker.index} · ${time}${peak}`;
  if (marker.kind === 'landing') return `LDG ${marker.index} · ${time}${peak}`;
  if (marker.kind === 'drop') return `ZRZUT ${marker.index} · ${time}${peak}`;
  return `MAX ${feet(marker.altitudeFt)} · ${time}`;
}

/** Podpis maksimum przy znaczniku na profilu — tam liczba stóp ma oś, na której stoi. */
function peakNote(marker: SessionTrackMarker): string | null {
  if (marker.kind === 'peak') return `MAX ${feet(marker.altitudeFt)}`;
  if (marker.alsoPeak === true) return `MAX ${feet(marker.altitudeFt)}`;
  return null;
}

function colorOf(marker: SessionTrackMarker, palette: MarkerPalette): string {
  if (marker.kind === 'takeoff') return palette.green;
  if (marker.kind === 'landing') return palette.red;
  return palette.blue;
}

function feet(value: number | null | undefined): string {
  return value == null ? '— —' : `${Math.round(value).toLocaleString('pl-PL')} ft`;
}
