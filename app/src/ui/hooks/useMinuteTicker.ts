/**
 * Ninerdeck - chwila bieżąca odświeżana RAZ NA MINUTĘ.
 *
 * Tyle wystarczy wszystkiemu, co mierzy czas w skali dnia: dobie UTC w nagłówku,
 * odliczaniu do rezerwacji i linii „teraz" na osi kalendarza (minuta to jedna
 * tysięczna szerokości doby lotnej - sekundowy tick przerysowywałby ekran po nic).
 *
 * Sekundowy zegar zostaje tam, gdzie pilot patrzy na czynność w toku: licznik czasu
 * blokowego w kokpicie i szacunki paliwa. To są dwa różne pytania i dwa różne rytmy.
 */

import { useEffect, useState } from 'react';

export function useMinuteTicker(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return now;
}
