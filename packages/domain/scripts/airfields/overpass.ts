/**
 * UZ Aero — pobranie pasów startowych z Overpass API.
 *
 * Jedno zapytanie o cały kraj zamiast promienia wokół każdego lotniska: publiczny serwer
 * Overpassa jest darmowy i współdzielony, więc sto małych zapytań byłoby zwyczajnie
 * nieuprzejme — a i tak trwałoby dłużej.
 *
 * Serwer bywa przeciążony (504 „too busy", 502 z mirrora), więc próbujemy kolejno kilku
 * końcówek. Gdy żadna nie odpowie, generator ma jeszcze drogę przez plik podręczny
 * (\`--osm-cache\`) — regeneracja katalogu nie może zależeć od tego, czy akurat teraz
 * publiczny serwer ma dobry dzień.
 */

import type { OverpassWay } from './osmRunways';

/** Prostokąt obejmujący Polskę z zapasem — te same granice, co kontrola w testach katalogu. */
export const POLAND_RUNWAYS_QUERY = `[out:json][timeout:300];
way["aeroway"="runway"](48.9,14.0,55.0,24.2);
out geom;`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Nagłówek z kontaktem — Overpass odrzuca ruch bez rozpoznawalnego klienta (406). */
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'uzaero-airfield-generator (https://github.com/tomaszklag/uz_aero)',
  Accept: 'application/json',
};

/** Odpowiedź Overpassa zawężona do tego, czego używamy. */
interface OverpassResponse {
  readonly elements?: readonly OverpassWay[];
}

export async function fetchPolishRunwayWays(
  query: string = POLAND_RUNWAYS_QUERY,
): Promise<OverpassWay[]> {
  const failures: string[] = [];

  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: HEADERS,
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) {
        failures.push(`${endpoint} → HTTP ${response.status}`);
        continue;
      }
      const body = (await response.json()) as OverpassResponse;
      const elements = body.elements ?? [];
      if (elements.length === 0) {
        failures.push(`${endpoint} → pusta odpowiedź`);
        continue;
      }
      return [...elements];
    } catch (error) {
      failures.push(`${endpoint} → ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `Overpass nie odpowiedział:\n  ${failures.join('\n  ')}\n` +
      'Użyj --osm-cache=<plik.json> z wcześniej pobraną odpowiedzią.',
  );
}
