/**
 * Ninerdeck - ZAJĘTOŚĆ FLOTY w oknie dat (rezerwacje 3.0.0).
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
 * ODŚWIEŻA SIĘ PRZY WEJŚCIU NA EKRAN, nie w pętli: zajętość zmienia kolega przy innym
 * telefonie, a nie ten pilot, więc odpytywanie co puls kosztowałoby baterię za
 * odpowiedź, na którą i tak nikt nie patrzy. Wejście jest chwilą, w której pilot pyta
 * „co jest wolne" - i wtedy pytamy serwer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import { utcDayStart } from '../../domain';
import { useSessionStore } from '../store';

import { toCalendar, type CalendarData } from '../screens/logic/calendarData';
import { useMinuteTicker } from './useMinuteTicker';

/**
 * Ile dób pokazuje pasek dni (decyzja właściciela 2026-09-21).
 *
 * Czternaście, choć makieta rysuje siedem chipów: siedem to tyle, ile MIEŚCI SIĘ na
 * ekranie, a nie tyle, ile jest - reszta dojeżdża kciukiem w bok. Rezerwacja robiona
 * „na następny weekend" ma być widoczna tam, gdzie pilot jej szuka. Horyzontu zakładania
 * rezerwacji to nie dotyczy - ten jest nieograniczony (P7), a dalsze terminy wybiera się
 * kalendarzem miesięcznym, który PRZESTAWIA KOTWICĘ tego okna.
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
   * skutek bez czekania na powrót na ekran.
   *
   * Stanu bez połączenia to NIE dotyczy: 21B nie ma przycisku ponowienia, bo drogą
   * wyjścia jest zdanie „Wróć tu z zasięgiem", a pytanie ponawia samo wejście tutaj.
   */
  reload: () => void;
}

/**
 * Zajętość floty w ZADANYM oknie.
 *
 * Okno przychodzi PARĄ LICZB, nie obiektem: `load` ma je w liście zależności, a nowa
 * referencja przy każdym renderze zamieniłaby odświeżenie w pętlę. `null` w którejkolwiek
 * znaczy „nie ma o co pytać" i ekran dostaje wtedy `null`, czyli „nie wiem".
 */
export function useCalendarWindow(from: number | null, to: number | null): UseCalendar {
  const sync = useSessionStore((s) => s.sync);
  const focused = useIsFocused();
  const [data, setData] = useState<CalendarData | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (sync == null || from == null || to == null) {
      setData(null);
      return;
    }

    setData(undefined);
    void sync
      .fetchCalendar({ from, to })
      .then((wire) => {
        if (alive.current) setData(wire == null ? null : toCalendar(wire));
      })
      .catch(() => {
        // `authorizedFetch` zwija offline i odmowy do `null`; tu łapiemy resztę.
        // Nieudane pytanie o kalendarz nie ma prawa wywrócić ekranu.
        if (alive.current) setData(null);
      });
  }, [sync, from, to]);

  useFocusEffect(load);

  // Ponawiamy WYŁĄCZNIE w stanie „nie wiem" i WYŁĄCZNIE na widocznym ekranie:
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

/**
 * Zajętość floty na czternaście dób OD KOTWICY - zakładka Kalendarz i formularz
 * rezerwacji pytają tym samym kodem, tylko o inne okno.
 *
 * ══ KOTWICA JEST KWANTOWANA DO POCZĄTKU DOBY UTC ══
 * I to jest cały powód, dla którego okno ani nie ucieka, ani nie kamienieje. `Date.now()`
 * w liście zależności odświeżałby kalendarz przy każdym tyknięciu; zamrożony w refie
 * zostawałby piątkowy u telefonu otwartego do poniedziałku - a wtedy „dzisiaj" wypada
 * poza oknem i kalendarz otwiera się na dobie sprzed trzech dni.
 *
 * Doba UTC nie jest dobą klubu i być nią nie musi: to jest WYZNACZENIE OKNA, a nie
 * granica doby. Serwer i tak przycina okno do granic dób klubu, a północ UTC leży
 * w środku dzisiejszej doby każdego klubu w Europie.
 *
 * @param anchor chwila w dobie, od której liczymy okno; pominięta = dzisiaj.
 */
export function useCalendar(anchor?: number | null): UseCalendar {
  const now = useMinuteTicker();
  const from = utcDayStart(anchor ?? now);
  return useCalendarWindow(from, from + (CALENDAR_DAYS - 1) * DAY_MS);
}
