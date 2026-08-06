/**
 * UZ Aero — lotnisko z katalogu → wiersz listy podpowiedzi.
 *
 * Mieszka PRZY komponencie, a nie w `ui/screens/logic/`, bo opisuje kształt wiersza
 * `AirfieldSuggestions` — a ten kształt jest własnością komponentu (patrz nagłówek
 * `AirfieldSuggestions.tsx`). Do issue #14 mapowanie stało w logice ekranu i to
 * wystarczało: podpowiedzi składał wyłącznie ekran 02E. Odkąd tę samą listę rysuje
 * arkusz wyboru lotniska (`sheets/AirfieldSheet.tsx`), komponent musiałby sięgać do
 * logiki ekranu po własny kształt danych — czyli w odwrotną stronę niż biegną tu
 * zależności. `routeSuggestions.ts` re-eksportuje tę funkcję, więc ekrany i testy
 * importują ją tak jak dotąd (ta sama droga, którą wcześniej przeszły `hhmm`
 * i `dateTimeUtcShort`).
 *
 * Osobny plik `.ts`, bo `.tsx` w tej aplikacji eksportuje wyłącznie komponenty
 * (`docs/architektura-kodu.md` §2).
 */

import { toMagneticDeg, type Airfield } from '../../../domain';
import type { AirfieldRow } from './AirfieldSuggestions';

/**
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
