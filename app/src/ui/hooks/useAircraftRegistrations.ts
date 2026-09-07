/**
 * UZ Aero - ZNAKI REJESTRACYJNE FLOTY, po identyfikatorze (zgłoszenie z urządzenia,
 * 2026-08-30).
 *
 * ══ SKĄD SIĘ WZIĄŁ TEN HOOK ══
 * Kafelek sesji na „Moim dniu" pokazał UUID zamiast znaku maszyny. Powód jest w danych,
 * nie w kafelku: projekcja sesji niesie `aircraftId`, a listy budowały napis wprost
 * z niego. W świecie testowym identyfikatorem BYŁ znak („sp-axa"), więc wyglądało to
 * poprawnie przez wiele tur - dopiero flota założona w panelu dostaje identyfikatory
 * UUID i napis zamienił się w `a9f84d77-a0d6-461e-…`.
 *
 * Znak mieszka w cache referencyjnym, więc hook czyta go stamtąd i działa OFFLINE -
 * jak `useAircraft`, tylko dla całej floty naraz: kafelków w dobie bywa kilka i każdy
 * z osobnym zapytaniem byłby kilkoma przebiegami po tej samej tabeli.
 *
 * ══ CZEGO HOOK NIE ROBI ══
 * Nie zgaduje. Maszyna spoza cache'u (skasowana z floty, wyczyszczona pamięć) nie ma
 * znaku i wołający dostaje `null` - a co z tym zrobić, rozstrzyga ekran. Podstawienie
 * identyfikatora „żeby coś było" jest dokładnie tym, co ten hook naprawia.
 */

import { useEffect, useState } from 'react';

import { useSessionStore } from '../store';

/** Znak maszyny po identyfikatorze; `null` = cache jej nie zna. */
export type RegistrationOf = (aircraftId: string) => string | null;

export function useAircraftRegistrations(): RegistrationOf {
  const queries = useSessionStore((s) => s.queries);
  const [byId, setById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (queries == null) return;

    let alive = true;
    void queries.aircraft().then((fleet) => {
      if (!alive) return;
      setById(Object.fromEntries(fleet.map((a) => [a.id, a.reg])));
    });

    return () => {
      alive = false;
    };
  }, [queries]);

  return (aircraftId) => byId[aircraftId] ?? null;
}
