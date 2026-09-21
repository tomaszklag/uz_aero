/**
 * Ninerdeck - ZAJĘTOŚĆ FLOTY dla zakładki Kalendarz (21, rezerwacje 3.0.0).
 *
 * ══ TO NIE JEST WYŁOM W OFFLINE-FIRST, TYLKO INNA KATEGORIA DANYCH ══
 * Cały moduł rezerwacji wymaga sieci (decyzja właściciela 2026-09-20,
 * `docs/rezerwacje.md` §2.2: „rezerwację raczej robimy w domu, gdzie zasięg jest").
 * Dane operacji - czasy, loty, rozliczenie - dalej liczą się WYŁĄCZNIE z lokalnego
 * rejestru i tego ten hook nie dotyka.
 *
 * Dlatego `null` znaczy tu co innego niż przy podpowiedziach zadania czy łańcuchu
 * odczytów: tam brak odpowiedzi kasował DODATEK i ekran po prostu milczał, tu kasuje
 * CAŁĄ treść, więc ekran musi powiedzieć wprost, że nie wie. Pusta siatka wyglądałaby
 * dokładnie jak flota wolna na wylot (makieta 21B).
 *
 * ODŚWIEŻA SIĘ PRZY WEJŚCIU NA ZAKŁADKĘ, nie w pętli: zajętość zmienia kolega przy
 * innym telefonie, a nie ten pilot, więc odpytywanie co puls kosztowałoby baterię za
 * odpowiedź, na którą i tak nikt nie patrzy. Wejście na zakładkę jest chwilą, w której
 * pilot pyta „co jest wolne" - i wtedy pytamy serwer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import { useSessionStore } from '../store';

import { toCalendar, type CalendarData } from '../screens/logic/calendarData';

/**
 * Ile dób pokazuje pasek dni.
 *
 * Dwa tygodnie, choć makieta rysuje siedem chipów: pasek i tak przewija się kciukiem
 * w bok, a rezerwacja robiona „na następny weekend" musi być widoczna tam, gdzie
 * pilot jej szuka. Horyzontu zakładania rezerwacji to nie dotyczy - ten jest
 * nieograniczony (P7) i wybiera się go kalendarzem w formularzu.
 */
export const CALENDAR_DAYS = 14;

/**
 * Co ile ekran pyta ponownie, DOPÓKI NIE WIE (decyzja właściciela 2026-09-21).
 *
 * Przycisku ponowienia nie ma - makieta 21B go nie rysuje, a przy braku zasięgu
 * i tak nic by nie zmienił. Zamiast niego kalendarz wraca SAM, dokładnie tak jak
 * formularz przy pustej flocie na 02G: pilot ze wróconym zasięgiem nie ma się
 * domyślać, że musi przeskoczyć zakładkę i wrócić.
 *
 * Minuta, nie puls: zajętość zmienia kolega przy innym telefonie, a nie ten pilot.
 */
const RETRY_MS = 60_000;

const DAY_MS = 86_400_000;

export interface UseCalendar {
  /** `undefined` = pytanie w toku, `null` = nie wiadomo (brak sieci, odmowa). */
  data: CalendarData | null | undefined;
  /**
   * Ponowne pytanie - po ZAPISIE rezerwacji (założeniu, odwołaniu), żeby oś pokazała
   * skutek bez czekania na powrót na zakładkę.
   *
   * Stanu bez połączenia to NIE dotyczy: 21B nie ma przycisku ponowienia, bo drogą
   * wyjścia jest zdanie „Wróć tu z zasięgiem", a pytanie ponawia samo wejście tutaj.
   */
  reload: () => void;
}

export function useCalendar(): UseCalendar {
  const sync = useSessionStore((s) => s.sync);
  const focused = useIsFocused();
  const [data, setData] = useState<CalendarData | null | undefined>(undefined);
  const alive = useRef(true);
  // Początek okna zapisany przy KAŻDYM pytaniu, nie przy pierwszym renderze: zakładka
  // żyje tak długo jak aplikacja, więc telefon otwarty w piątek i obejrzany w poniedziałek
  // pytałby wciąż o piątkowe czternaście dni - a wtedy „dzisiaj" wypada poza oknem
  // i kalendarz otwiera się na dobie sprzed trzech dni. Do listy zależności `now`
  // nie wchodzi, bo tyka co minutę i zamieniłby odświeżenie w pętlę.
  const from = useRef(Date.now());

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (sync == null) {
      setData(null);
      return;
    }

    setData(undefined);
    from.current = Date.now();
    void sync
      .fetchCalendar({
        from: from.current,
        // Doba BIEŻĄCA liczy się jako pierwsza z czternastu, więc granica idzie
        // o trzynaście dni dalej - „+14 dni" dałoby piętnastą kolumnę (ta sama
        // pomyłka, którą złapał przegląd kalendarza panelu).
        to: from.current + (CALENDAR_DAYS - 1) * DAY_MS,
      })
      .then((wire) => {
        if (alive.current) setData(wire == null ? null : toCalendar(wire));
      })
      .catch(() => {
        // `authorizedFetch` zwija offline i odmowy do `null`; tu łapiemy resztę.
        // Nieudane pytanie o kalendarz nie ma prawa wywrócić zakładki.
        if (alive.current) setData(null);
      });
  }, [sync]);

  useFocusEffect(load);

  // Ponawiamy WYŁĄCZNIE w stanie „nie wiem" i WYŁĄCZNIE na widocznej zakładce:
  // `undefined` znaczy pytanie w toku, a ekran pod spodem nie ma komu odpowiadać.
  // Po każdej nieudanej próbie `data` wraca na `null`, więc efekt startuje od nowa
  // i odstęp liczy się OD KOŃCA próby - dwa żądania nie mają jak się nałożyć.
  useEffect(() => {
    if (!focused || data !== null) return;
    const id = setInterval(load, RETRY_MS);
    return () => clearInterval(id);
  }, [focused, data, load]);

  return { data, reload: load };
}
