/**
 * UZ Aero — model widoku ekranu 01 „Mój dzień" (`design/01-moj-dzien.html`, issue #23).
 *
 * Czysta warstwa między projekcją dnia pilota (`projectPilotDay`) a widokiem: bierze
 * `PilotDay` i oddaje gotowe napisy oraz stany, których ekran nie musi już wyliczać.
 * Zero React, zero zegara systemowego.
 *
 * REGUŁA, KTÓRĄ TEN MODUŁ CZYNI WIDOCZNĄ: do pilota w danej dobie przypisana jest
 * LISTA SESJI — płaska oś czasu, posortowana po uruchomieniu silnika, z rejestracją
 * jako informacją kafelka (issue #23 pkt 3: grupowanie po samolocie kłamało o przebiegu
 * dnia przy każdej przesiadce). Klamra służby — meldunek, koniec, suma „Służba",
 * „Zamknij dzień" — została usunięta W CAŁOŚCI razem z modelem (issue #23 pkt 2):
 * ta wielkość niczego nie mierzyła. Dnia się nie otwiera i nie zamyka.
 *
 * SESJA JEST KAFELKIEM, NIE WIERSZEM TABELI (issue #42, 2026-08-13): kształt przychodzi
 * z `sessionCard.ts`, wspólnego z „Poprzednimi dniami" (12). Ten moduł dokłada tylko to,
 * co na 01 jest inne — nagłówkiem kafelka jest NUMER SESJI w dobie, bo data stoi
 * w nagłówku ekranu i na każdym kafelku powtarzałaby to samo.
 */

import { duration } from '../../format';
import type { PilotDay } from '../../../domain';
import { type SessionCardVm, sessionStats, sessionTimes } from './sessionCard';

export interface MyDayVm {
  /** Płaska oś czasu sesji doby — już posortowana i ponumerowana przez projekcję. */
  sessions: SessionCardVm[];
  /**
   * Sumy doby — `null` tam, gdzie nie ma czego liczyć („— —", nigdy zero).
   *
   * TA SAMA TRÓJKA, CO NA KAFELKU SESJI: Loty · Blok · Lot (2026-08-16). Do tej pory
   * sumy były parą „Blok / Loty", w której komórka „Loty" niosła CZAS w powietrzu,
   * a liczbę lotów spychała do podpisu „5 st / 5 ldg" — czyli etykieta mówiła o jednej
   * wielkości, a wartość o drugiej. Podpis dublował przy tym samego siebie: lot to
   * start i lądowanie, więc „5 st / 5 ldg" jest tą samą piątką powiedzianą dwa razy.
   * Skoro kafelek sesji liczy Loty (ile), Blok (silnik) i Lot (powietrze), to suma doby
   * musi mieć te same trzy nazwy — inaczej pilot sumuje w głowie kolumny, które nie
   * są tymi samymi kolumnami (ta sama reguła, co przy wspólnym kafelku, issue #42).
   */
  totals: {
    /** Ile lotów w dobie — suma kafelków, nie osobny licznik startów. */
    flights: string | null;
    /** Czas blokowy: od uruchomienia do wyłączenia silnika. */
    block: string | null;
    /** Czas lotu: od startu do lądowania (suma lotów doby). */
    flight: string | null;
    aircraftCount: number;
  };
  sessionCount: number;
  /** Czy dzień jest pusty — wariant 01A. */
  empty: boolean;
}

const DASH = '— —';

/** Buduje model widoku ekranu 01 z projekcji dnia pilota. */
export function buildMyDay(day: PilotDay): MyDayVm {
  return {
    sessions: day.sessions.map((session) => ({
      sessionUuid: session.sessionUuid,
      // Numer w dobie zastąpił kolumnę `.leg-num` starej tabeli: niesie kolejność,
      // której same godziny nie niosą, gdy pilot przegląda listę kątem oka.
      title: `SESJA ${session.index}`,
      aircraft: session.aircraftId,
      times: sessionTimes(session.startedAt, session.stoppedAt),
      stats: sessionStats(session.flightCount, session.blockMs, session.flightMs),
    })),
    totals: {
      // Suma z SESJI, nie `day.takeoffCount`: liczba w rzędzie sum ma się zgadzać
      // z tym, co pilot doda z kafelków nad nią. Licznik startów doby liczy loty,
      // które w tej dobie WYSTARTOWAŁY, więc przy biegu spod północy potrafi się
      // od sumy kafelków różnić — a rozjazd dwóch liczb o tej samej nazwie na jednym
      // ekranie wygląda jak błąd zapisu, nawet gdy obie są poprawne.
      flights:
        day.sessions.length > 0
          ? String(day.sessions.reduce((sum, s) => sum + s.flightCount, 0))
          : null,
      block: day.sessions.length > 0 ? duration(day.blockTimeMs) : null,
      flight: day.sessions.length > 0 ? duration(day.flightTimeMs) : null,
      // Liczba maszyn doby zasila podpis „2 samoloty" pod sumą bloku. Widok NIE ma tego
      // liczyć sam — `Set` w JSX byłby dokładnie tym obliczeniem, którego tu unikamy.
      aircraftCount: day.aircraftIds.length,
    },
    sessionCount: day.sessions.length,
    empty: day.sessions.length === 0,
  };
}

/** „— —" zamiast liczby, gdy nie ma czego pokazać (ta sama zasada co na 01A). */
export function totalLabel(value: string | null): string {
  return value ?? DASH;
}

/** Przycisk pasa akcji ekranu 01 — decyzja o TREŚCI i MIEJSCU, nie o wyglądzie. */
export interface MyDayAction {
  id: 'start' | 'manual';
  label: string;
  /** Akcja główna dnia (zielona, pełna) — najwyżej JEDNA na ekranie. */
  primary: boolean;
  /**
   * Gdzie na ekranie stoi: `top` = nad logiem dnia, `bottom` = pod sumami doby.
   * Miejsce należy do modelu, bo jest REGUŁĄ (patrz `myDayActions`), a nie układem
   * — warunek w JSX nie miałby jak jej obronić przed następną „drobną" zmianą.
   */
  slot: 'top' | 'bottom';
}

/**
 * Co da się zrobić z poziomu „Mój dzień".
 *
 * ══ PRZYCISK GŁÓWNY WYGLĄDA I STOI TAK SAMO PRZEZ CAŁY DZIEŃ ══
 * (zgłoszenie z urządzenia, 2026-08-16). Do tej pory „ROZPOCZNIJ LOT" zmieniał
 * JEDNO I DRUGIE w zależności od tego, czy pilot ma już dziś sesję: przy pustej dobie
 * był zielonym przyciskiem nad logiem, potem szarym pod sumami. Pilot uczy się ekranu
 * raz — a ten pokazywał mu dwa różne ekrany tego samego dnia i kazał szukać przycisku
 * po pierwszym locie. Druga sesja dnia nie jest przy tym mniej ważna od pierwszej,
 * więc nie ma czego różnicować wagą.
 *
 * Konsekwencja techniczna, nie kosmetyczna: skoro skład pasa akcji nie zależy już od
 * doby, przyciski NIE CZEKAJĄ na wczytanie strumienia — rysują się w pierwszej klatce
 * (reguła 3 wzorca ładowania: co znamy lokalnie, nie czeka). Przedtem czekać musiały,
 * bo inaczej wielki zielony przycisk podmieniałby się pod palcem na szary.
 *
 * ══ DLACZEGO TO JEST REGUŁA, A NIE WARUNEK W JSX ══
 * Bo pierwsza wersja tego składu miała dziurę i nikt jej nie zauważył: pusty dzień
 * dostawał WYŁĄCZNIE „ROZPOCZNIJ LOT", więc pilot, który przyleciał bez telefonu
 * (padła bateria, aparat został w kurtce) i nie ma dziś ANI JEDNEJ sesji, nie miał jak
 * wpisać lotu — a to jest dokładnie ta sytuacja, w której wpis ręczny powstał (§3.8,
 * mockup 15). Wejście znikało w stanie, w którym jest najbardziej potrzebne.
 *
 * Wpis ręczny zostaje drugorzędny i pod logiem: to droga awaryjna, nie codzienna.
 */
export function myDayActions(): MyDayAction[] {
  return [
    { id: 'start', label: 'ROZPOCZNIJ LOT', primary: true, slot: 'top' },
    { id: 'manual', label: 'DODAJ LOT RĘCZNIE', primary: false, slot: 'bottom' },
  ];
}
