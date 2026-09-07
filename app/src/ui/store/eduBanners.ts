/**
 * UZ Aero - trwały stan banerów pouczających (typ `edu`).
 *
 * `CLAUDE.md` (sekcja „Banery - trzy typy") stawia twardy wymóg: stan schowania banera
 * pouczającego jest zapamiętany **NA STAŁE per pilot**. Powód jest praktyczny - baner
 * `edu` jest pomocny za pierwszym razem i szumem przy każdym kolejnym. Gdyby wracał
 * po każdym otwarciu ekranu, pilot zamykałby go w kółko i wzorzec byłby gorszy niż
 * jego brak.
 *
 * Trzymamy to w `AsyncStorage`, a nie w rejestrze zdarzeń: to preferencja interfejsu,
 * nie fakt z dnia lotnego. Rejestr jest append-only i opisuje lot, nie ustawienia.
 *
 * Klucz zawiera identyfikator pilota, bo na jednym telefonie może pracować kilku
 * (przejęcie samolotu, zmiana załogi) - wyjaśnienie schowane przez jednego nie ma
 * znikać drugiemu.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useCurrentPilot } from './currentPilot';

const key = (pilotId: string, bannerId: string): string => `uzaero.edu.${pilotId}.${bannerId}`;

/**
 * Zwraca `[schowany, ustawSchowany]` dla banera o danym identyfikatorze.
 *
 * Do czasu odczytu z dysku baner jest **widoczny** - lepiej pokazać wyjaśnienie o ułamek
 * sekundy za długo niż mignąć nim komuś, kto już je schował.
 */
export function useEduBanner(bannerId: string): [boolean, (next: boolean) => void] {
  const pilotId = useCurrentPilot((s) => s.id);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(key(pilotId, bannerId)).then((value) => {
      if (!cancelled) setDismissed(value === '1');
    });
    return () => {
      cancelled = true;
    };
  }, [pilotId, bannerId]);

  const update = useCallback(
    (next: boolean) => {
      // Stan lokalny zmieniamy od razu - zapis na dysk jest efektem ubocznym, a nie
      // warunkiem reakcji interfejsu.
      setDismissed(next);
      void AsyncStorage.setItem(key(pilotId, bannerId), next ? '1' : '0');
    },
    [pilotId, bannerId],
  );

  return [dismissed, update];
}
