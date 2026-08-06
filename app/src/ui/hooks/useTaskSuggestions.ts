/**
 * UZ Aero — ostatnio używane oznaczenia klientów i notatki (`GET /me/task-suggestions`).
 *
 * Jedyna treść formularza zadania, która przychodzi Z SERWERA — i jedyna, której brak
 * niczego nie zmienia: bez zasięgu pilot wpisuje wartość z palca dokładnie jak dotąd
 * (issue #14: „to nie musi działać offline"). Dlatego hook nie ma stanu ładowania,
 * nie ponawia i nie trzyma cache — `null` znaczy po prostu „nie mamy listy".
 *
 * Pytamy RAZ, przy wejściu na ekran, a nie przy otwarciu arkusza: zapytanie ma się
 * odbyć, zanim pilot dotknie pola, żeby lista była już na miejscu, gdy arkusz się otworzy.
 */

import { useEffect, useState } from 'react';

import type { RemoteTaskSuggestions } from '../../application';
import { useSessionStore } from '../store';

/**
 * TRZY stany, nie dwa — i ten trzeci jest tu potrzebny:
 *  • `undefined` — jeszcze pytamy (arkusz nie mówi wtedy nic o sieci),
 *  • `null`      — nie mamy listy (offline, wygasła sesja, odmowa),
 *  • dane        — mamy, choćby puste (nowy klub nie ma jeszcze historii).
 *
 * Zwijanie „pytamy" do „nie mamy" dawałoby zdanie „podpowiedzi wymagają połączenia"
 * pilotowi, który ma zasięg i po prostu otworzył arkusz szybciej niż wróciła odpowiedź.
 */
export function useTaskSuggestions(): RemoteTaskSuggestions | null | undefined {
  const sync = useSessionStore((s) => s.sync);
  const [suggestions, setSuggestions] = useState<RemoteTaskSuggestions | null | undefined>(
    undefined,
  );

  useEffect(() => {
    // Bez podłączonego synca (testy, StyleGuide) nie ma kogo pytać — i nie ma listy.
    if (sync == null) {
      setSuggestions(null);
      return;
    }
    let alive = true;
    void sync
      .fetchTaskSuggestions()
      .then((data) => {
        if (alive) setSuggestions(data);
      })
      .catch(() => {
        // `authorizedFetch` zwija offline i odmowę do `null`; tu łapiemy resztę,
        // żeby nieudana podpowiedź nie wywróciła ekranu preflightu.
        if (alive) setSuggestions(null);
      });
    return () => {
      alive = false;
    };
  }, [sync]);

  return suggestions;
}
