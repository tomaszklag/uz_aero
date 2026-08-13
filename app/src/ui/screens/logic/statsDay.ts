/**
 * UZ Aero — wspólne napisy ekranu sesji (mockup `design/10-statystyki.html`).
 *
 * ══ CO ZOSTAŁO PO ISSUE #38 ══
 * Moduł miał kiedyś pięć funkcji: tabelę lotów, karty załogi, podtytuł z zakresem godzin
 * i średnie L/h. Przebudowa ekranu 10 zabrała im wszystkim rację bytu — tabela ustąpiła
 * osi czasu (`sessionAxis.ts`), karty załogi jednemu wierszowi, a średnie L/h rachunkom
 * z werdyktem (`sessionBalance.ts`). Zostały dwie odmiany, które czyta też kokpit i log
 * sesji; trzymamy je tutaj, żeby liczebnik „lot / loty / lotów" miał jedno źródło.
 */

import type { JumperCounts } from '../../../domain';
import { dateTimeUtcShort, hhmm } from '../../format';

/**
 * `hhmm` przeniesione do `@uzaero/format` (2026-07-31) — ten sam napis musi produkować
 * karta arkusza po stronie serwera, więc format przestał być sprawą jednego ekranu.
 * Re-eksport zostaje, żeby `StatsScreen` i `CockpitReadonlyScreen` nie zmieniały importu.
 *
 * `dateTimeUtcShort` poszedł tą samą drogą (2026-08-06, issue #12): stempel „23 CZE 16:45"
 * czyta dziś także wskaźnik łączności w `ui/components/`, a komponent nie ma po co sięgać
 * do logiki ekranu. Przy okazji zniknęła DRUGA tablica miesięcy — polskie skróty składają
 * się z pełnych nazw w pakiecie formatów.
 */
export { dateTimeUtcShort, hhmm };

/**
 * Badge nagłówka: „1 lot" / „3 loty" / „6 lotów".
 *
 * Polska liczba mnoga ma trzy formy, a badge stoi w nagłówku ekranu — „6 lot" byłoby
 * pierwszą rzeczą, którą pilot zobaczy po zdaniu samolotu.
 */
export function flightsBadge(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return '1 lot';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} loty`;
  return `${count} lotów`;
}

/** Rozbicie skoczków wg typów („12 TANDEM · 6 AFF · 4 SOLO"). Zerowe typy pomijamy. */
export function jumperBreakdown(jumpers: JumperCounts): string {
  const parts = [
    jumpers.tandem > 0 ? `${jumpers.tandem} TANDEM` : null,
    jumpers.aff > 0 ? `${jumpers.aff} AFF` : null,
    jumpers.solo > 0 ? `${jumpers.solo} SOLO` : null,
  ].filter((p): p is string => p != null);
  return parts.length > 0 ? parts.join(' · ') : '—';
}
