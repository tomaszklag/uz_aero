/**
 * UZ Aero - pozycja pilota do listy „najbliżej Ciebie" w wyborze lotniska (issue #14).
 *
 * Puste pole wyszukiwarki nie ma czego podpowiadać po tekście, ale ma to zrobić po
 * położeniu: pilot stoi zwykle na tym lotnisku, z którego zaraz wystartuje.
 *
 * Najpierw pytamy o OSTATNI ZNANY fix (`lastFix`) - jeśli odbiornik już pracował, lista
 * jest gotowa natychmiast, bez włączania czegokolwiek. Dopiero gdy go nie ma, otwieramy
 * krótką subskrypcję i bierzemy pierwszy fix, jaki przyjdzie.
 *
 * BRAK POZYCJI TO NORMALNY STAN, NIE BŁĄD. O uprawnienie do lokalizacji prosimy dopiero
 * przy potwierdzeniu preflightu (krok 4, żeby systemowy dialog nie wpadał w środek
 * formularza), więc na kroku 2 może go jeszcze nie być - wtedy `start` odmawia, my
 * milczymy, a arkusz pokazuje zwykłą zachętę do wpisania kodu. Hook NIGDY nie prosi
 * o uprawnienie sam: prośba w tym miejscu byłaby zaskoczeniem, a lista lotnisk w pobliżu
 * jest wygodą, nie warunkiem wypełnienia formularza.
 */

import { useEffect, useState } from 'react';

import type { GpsFix, LatLon } from '../../domain';
import { useGps } from '../bootstrap/servicesContext';

const toLatLon = (fix: GpsFix | null): LatLon | null =>
  fix?.lat != null && fix.lon != null ? { lat: fix.lat, lon: fix.lon } : null;

export function useNearbyPosition(enabled: boolean): LatLon | null {
  const gps = useGps();
  const [position, setPosition] = useState<LatLon | null>(null);

  useEffect(() => {
    if (!enabled || gps == null) return;

    const known = toLatLon(gps.lastFix());
    if (known != null) {
      setPosition(known);
      return;
    }

    let alive = true;
    let stop: (() => void) | null = null;
    void gps
      .start((fix) => {
        const next = toLatLon(fix);
        if (next != null) setPosition(next);
      })
      .then((off) => {
        // Ekran mógł się zamknąć, zanim odbiornik odpowiedział - wtedy od razu gasimy.
        if (alive) stop = off;
        else off();
      })
      .catch(() => {
        // Brak uprawnienia albo odbiornika: lista „najbliżej Ciebie" po prostu nie wchodzi.
      });

    return () => {
      alive = false;
      stop?.();
    };
  }, [enabled, gps]);

  return position;
}
