/**
 * UZ Aero — JEDNA pozycja z GPS, bez trzymania odbiornika (issue #6).
 *
 * Preflight potrzebuje wiedzieć tylko tyle, gdzie samolot stoi — raz, żeby porównać
 * z wpisanym kodem lotniska. Ciągły nasłuch, jaki prowadzi kokpit, byłby tu zbędnym
 * kosztem baterii, a przy formularzu wypełnianym w klubie potrafiłby chodzić kwadransami.
 *
 * Dlatego: nasłuch wstaje, czeka na PIERWSZY fix przechodzący bramkę jakości i schodzi.
 * Gdy odbiornik pracował już wcześniej (powrót na ekran), odpowiedź jest natychmiast
 * z `lastFix()` i nasłuch nie wstaje w ogóle.
 *
 * Brak zgody na lokalizację, brak odbioru i zimny start NIE są tu błędem: pozycja zostaje
 * `null`, walidacja milczy, a pilot wypełnia formularz tak jak dotąd. Sprawdzenie ma być
 * darmowe — nigdy warunkiem przejścia dalej (§ offline-first).
 */

import { useEffect, useState } from 'react';

import { fixUsable, type GpsFix, type LatLon } from '../../domain';
import type { GpsPort } from '../../application';

/** Pozycja z fixa, o ile jest kompletna i przeszła bramkę jakości. */
function positionOf(fix: GpsFix | null): LatLon | null {
  if (fix == null || !fixUsable(fix)) return null;
  if (fix.lat == null || fix.lon == null) return null;
  return { lat: fix.lat, lon: fix.lon };
}

export function useOneShotPosition(gps: GpsPort | null, enabled: boolean): LatLon | null {
  const [position, setPosition] = useState<LatLon | null>(null);

  useEffect(() => {
    // Mamy już odpowiedź — nasłuch nie ma po co wstawać. Sprzątanie POPRZEDNIEGO
    // przebiegu tego efektu zdejmuje subskrypcję, więc odbiornik gaśnie sam, gdy
    // tylko pozycja się pojawi.
    if (gps == null || !enabled || position != null) return;

    const known = positionOf(gps.lastFix());
    if (known != null) {
      setPosition(known);
      return;
    }

    let cancelled = false;
    let stop: (() => void) | null = null;

    void (async () => {
      const permission = await gps.requestPermission();
      if (cancelled || permission !== 'granted') return;

      const release = await gps.start((fix) => {
        const here = positionOf(fix);
        if (here != null) setPosition(here);
      });

      if (cancelled) {
        release();
        return;
      }
      stop = release;
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [gps, enabled, position]);

  return position;
}
