/**
 * UZ Aero — ostatnio używane oznaczenia klientów i notatki (`GET /me/task-suggestions`).
 *
 * Jedyna treść formularza zadania, która przychodzi Z SERWERA — i jedyna, której brak
 * niczego nie zmienia: bez zasięgu pilot wpisuje wartość z palca dokładnie jak dotąd
 * (issue #14: „to nie musi działać offline").
 *
 * ══ PYTAMY DOPIERO PRZY OTWARCIU ARKUSZA ══
 * Pierwsza wersja pytała przy wejściu na ekran, „żeby lista była gotowa" — i było to
 * pobranie na zapas: oznaczenie klienta i notatka są opcjonalne, więc w większości dni
 * pilot nie otwiera tych arkuszy w ogóle. Płacił za to każdym wejściem na krok 2 jednym
 * żądaniem, a przy otwarciu arkusza dochodziło drugie (zgłoszenie: „pobiera się 2×").
 * Teraz żądanie leci wtedy, gdy jego wynik ma się gdzie pokazać.
 *
 * ══ ŚWIEŻOŚĆ ZAMIAST CACHE ══
 * Udana odpowiedź żyje `FRESH_MS`, czyli tyle, ile trwa wypełnianie jednego formularza.
 * Dzięki temu otwarcie klienta, a zaraz potem notatki, to jedno żądanie, a nie dwa —
 * historia klubu nie zmienia się w ciągu minuty. To NIE jest cache między sesjami:
 * po wyjściu z ekranu stan znika razem z hookiem, bo podpowiedź sprzed tygodnia nie
 * jest warta magazynu, który trzeba by unieważniać.
 *
 * Nieudana próba (offline, wygasła sesja, odmowa) NIE blokuje kolejnej: pilot, który
 * odzyskał zasięg, ma dostać listę przy następnym otwarciu arkusza.
 *
 * ══ TRZY STANY ══
 *  • `undefined` — jeszcze nie pytaliśmy albo właśnie pytamy (arkusz milczy o sieci),
 *  • `null`      — nie mamy listy (offline, wygasła sesja, odmowa serwera),
 *  • dane        — mamy; PUSTE TABLICE też są odpowiedzią („klub nie ma jeszcze historii").
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RemoteTaskSuggestions } from '../../application';
import { useSessionStore } from '../store';

/** Jak długo udana odpowiedź wystarcza za kolejne żądanie (jeden formularz preflightu). */
const FRESH_MS = 60_000;

export interface TaskSuggestionsResult {
  suggestions: RemoteTaskSuggestions | null | undefined;
  /** Woła to ekran przy OTWIERANIU arkusza — patrz nota wyżej. */
  reload: () => void;
}

export function useTaskSuggestions(): TaskSuggestionsResult {
  const sync = useSessionStore((s) => s.sync);
  const [suggestions, setSuggestions] = useState<RemoteTaskSuggestions | null | undefined>(
    undefined,
  );
  /** Chwila ostatniej UDANEJ odpowiedzi; `0` = nie mamy żadnej. */
  const freshAt = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(() => {
    // Bez podłączonego synca (testy, StyleGuide) nie ma kogo pytać — i nie ma listy.
    if (sync == null) {
      setSuggestions(null);
      return;
    }
    // Świeża odpowiedź wystarcza za kolejne żądanie; nieudana próba nie wystarcza za nic.
    if (freshAt.current > 0 && Date.now() - freshAt.current < FRESH_MS) return;

    setSuggestions(undefined);
    void sync
      .fetchTaskSuggestions()
      .then((data) => {
        if (!alive.current) return;
        if (data != null) freshAt.current = Date.now();
        setSuggestions(data);
      })
      .catch(() => {
        // `authorizedFetch` zwija offline i odmowę do `null`; tu łapiemy resztę,
        // żeby nieudana podpowiedź nie wywróciła ekranu preflightu.
        if (alive.current) setSuggestions(null);
      });
  }, [sync]);

  return { suggestions, reload };
}
