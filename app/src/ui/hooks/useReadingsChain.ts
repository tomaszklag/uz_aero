/**
 * UZ Aero - CIĄGŁOŚĆ ODCZYTÓW dla wpisu ręcznego (issue #62, piąta tura z urządzenia).
 *
 * „Jeśli podałem już godziny i mam połączenie do API, to możemy pobrać poprzedzający
 * i kolejny lot" - hook pyta serwer o to, czym maszyna została zdana PRZED tym lotem
 * i co zastał ten, kto ją przejął PO nim.
 *
 * ══ DLACZEGO NIE WYSTARCZY `handover` Z CACHE ══
 * Bo przekazanie to JEDEN punkt: ostatni znany stan maszyny, czyli odpowiedź na pytanie
 * „ile jest teraz". Wpis ręczny pyta „ile było w czwartek", a między czwartkiem a dziś
 * maszyna zdążyła polatać - i to zwykle z kimś innym za sterami.
 *
 * ══ TO NIE JEST WYŁOM W OFFLINE-FIRST ══
 * Łańcuch należy do kategorii DRUGIEJ z `CLAUDE.md` - „dane z serwera (przekazanie
 * FOB/MH, status claim, lista pilotów)", które mają trzy stany świeżości. Trzeci
 * z nich, `brak`, jest tu stanem normalnym: bez sieci ekran po prostu milczy
 * o ciągłości, a wpis zapisuje się dokładnie tak jak dotąd. NIC z tego nie blokuje
 * (issue #62: „to powinny być tylko ostrzeżenia wymagające reakcji").
 *
 * ══ ŚWIADOMIE BEZ CACHE ══
 * Odpowiedź dotyczy KONKRETNEJ chwili konkretnej maszyny, więc magazyn trzeba by
 * unieważniać przy każdym cudzym locie. Ta sama decyzja, co przy podpowiedziach zadania.
 *
 * `undefined` = pytanie w toku, `null` = nie wiadomo (offline / starszy serwer / odmowa).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RemoteReadingsChain } from '../../application';
import { useSessionStore } from '../store';

export interface UseReadingsChain {
  /** `undefined` = w toku, `null` = nie wiadomo, obiekt = odpowiedź serwera. */
  chain: RemoteReadingsChain | null | undefined;
}

/**
 * @param aircraftId maszyna wpisu; `null` = jeszcze nie wybrana.
 * @param at chwila, wokół której pytamy - uruchomienie silnika; `null` = brak godzin.
 * @param enabled ekran jest na kroku, który tej odpowiedzi używa. Bez tego pytalibyśmy
 *   serwer przy każdej zmianie szkicu na krokach, które łańcucha nie pokazują.
 */
export function useReadingsChain(
  aircraftId: string | null,
  at: number | null,
  enabled: boolean,
): UseReadingsChain {
  const sync = useSessionStore((s) => s.sync);
  const [chain, setChain] = useState<RemoteReadingsChain | null | undefined>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    // Bez synca (testy) nie ma kogo pytać; bez maszyny albo godziny
    // pytanie nie ma sensu - chwila jest CAŁYM pytaniem tej trasy.
    if (sync == null || aircraftId == null || at == null || !enabled) {
      setChain(null);
      return;
    }

    setChain(undefined);
    void sync
      .fetchReadingsChain(aircraftId, at)
      .then((data) => {
        if (alive.current) setChain(data);
      })
      .catch(() => {
        /* `authorizedFetch` zwija offline i odmowę do `null`; tu łapiemy resztę -
           w tym 404 ze STARSZEGO serwera, który tej trasy jeszcze nie ma. Nieudana
           podpowiedź nie ma prawa wywrócić formularza wpisu. */
        if (alive.current) setChain(null);
      });
  }, [sync, aircraftId, at, enabled]);

  useEffect(load, [load]);

  return { chain };
}
