/**
 * UZ Aero - TREŚĆ OPERACJI: co czyni zapis operacją, a co czyni go pustym (issue #75).
 *
 * ══ SKĄD TO PYTANIE ══
 * Operacja rodzi się przejęciem samolotu, a przejęcie bywa odwoływane: pogoda siada,
 * skok odwołany, silnik nie ruszył. Zdanie takiej maszyny (09C) zostawia w rejestrze
 * parę `session_claim` → `day_close` i do issue #75 każda taka para była traktowana
 * jednakowo - a są DWA różne przypadki:
 *
 *  • **coś się jednak zmieniło** - licznik motogodzin albo paliwomierz pokazują przy
 *    zdaniu co innego niż przy przejęciu (ktoś ruszył maszynę poza aplikacją,
 *    zatankowano, dolano oleju). To jest pełnoprawna operacja: dostaje numer w dobie
 *    i sygnaturę (issue #75 pkt 3), bo bez nazwy nie da się o niej rozmawiać;
 *  • **nie zmieniło się NIC** - odczyty stoją na wartościach z przejęcia, silnik nie
 *    ruszył, nikt nie tankował. Taki wpis jest ŚMIECIEM (issue #75 pkt 2, słowa
 *    właściciela): nie pokazujemy go na listach telefonu ani w panelu, a ekran zdania
 *    ostrzega ZANIM pilot zapisze, że nic nie zostanie zapisane.
 *
 * ══ DLACZEGO FAKTY, NIE `SessionState` ══
 * Ten sam predykat liczą trzy powierzchnie: telefon na projekcji (`SessionState`),
 * serwer na kolumnach projekcji (`sessions` w Postgresie) i ekran 09C na wartościach
 * WPISYWANYCH (odczyt jeszcze nie jest zdarzeniem). Wspólnym mianownikiem jest zestaw
 * FAKTÓW - adapter `substanceFacts` tłumaczy projekcję, serwer składa fakty z wiersza,
 * a ekran podstawia szkic odczytu. Reguła mieszka przez to w jednym miejscu; zgodność
 * z SQL-em przybija test krzyżowy (`server/test/operationSignature.test.ts`).
 *
 * ══ GRANICE ŚWIADOME ══
 *  • **rejestr zostaje append-only**: „pusta" operacja nie znika z bazy - przestaje się
 *    LICZYĆ, jak `session_void`. Filtr czytelników, nie kasowanie;
 *  • **odczyt niekompletny ≠ pusty**: pustość wymaga KOMPLETU czterech odczytów
 *    (paliwo i MH z obu stron), bo „nic się nie zmieniło" jest zdaniem o dwóch
 *    porównaniach - bez którejkolwiek liczby to zdanie jest niesprawdzalne i wpis
 *    zostaje widoczny (stary stan: karta w historii bez numeru);
 *  • **dolewka paliwa i oleju jest treścią** nawet przy zgodnych odczytach: zapisane
 *    tankowanie, które znika z widoku, to utrata faktu - a fakt jest cenniejszy od
 *    zgrabności listy (ta sama waga, co przy wpisie ręcznym).
 */

import type { EpochMillis } from './time';
import type { SessionState } from './projections/session';

/**
 * Fakty, z których rozstrzyga się treść operacji. Wspólny mianownik trzech źródeł:
 * projekcji telefonu, kolumn projekcji serwera i szkicu ekranu 09C.
 */
export interface OperationSubstanceFacts {
  /** Silnik uruchomiono choć raz (`legs` / `engine_start_at`). */
  engineRan: boolean;
  /** Liczba lotów - lot bez biegu silnika to strumień złamany, ale nadal treść. */
  flightCount: number;
  /** Suma dolanego paliwa (L); 0 = nie tankowano. */
  fuelAddedL: number;
  /** Suma dolanego oleju (L); 0 = nie dolewano. */
  oilAddedL: number;
  /** Odczyt paliwa przy przejęciu / zdaniu (L); `null` = odczytu nie ma. */
  fuelStartL: number | null;
  fuelEndL: number | null;
  /** Odczyt licznika MH przy przejęciu / zdaniu (h); `null` = odczytu nie ma. */
  mhStart: number | null;
  mhEnd: number | null;
  /** Czy padł `day_close` - pustość orzeka się wyłącznie o zapisie DOMKNIĘTYM. */
  closed: boolean;
}

/** Fakty treści z projekcji sesji - adapter dla czytelników `SessionState`. */
export function substanceFacts(state: SessionState): OperationSubstanceFacts {
  return {
    engineRan: state.legs.length > 0,
    flightCount: state.flights.length,
    fuelAddedL: state.fuel.addedL,
    oilAddedL: state.oil.addedL,
    fuelStartL: state.fuel.startL,
    fuelEndL: state.fuel.endL,
    mhStart: state.mh.start,
    mhEnd: state.mh.end,
    closed: state.closed,
  };
}

/**
 * Czy operacja ma TREŚĆ: bieg silnika, lot, dolewka albo zmierzona zmiana odczytu.
 *
 * Porównanie odczytów wymaga OBU stron - pojedyncza liczba niczego nie zmienia i nie
 * dowodzi. Ścisła nierówność, bez tolerancji: pilot na 09C dostaje wartości z przejęcia
 * PODSTAWIONE, więc każda różnica jest jego świadomą poprawką, nie szumem przyrządu.
 */
export function hasOperationSubstance(f: OperationSubstanceFacts): boolean {
  return (
    f.engineRan ||
    f.flightCount > 0 ||
    f.fuelAddedL > 0 ||
    f.oilAddedL > 0 ||
    (f.fuelStartL != null && f.fuelEndL != null && f.fuelStartL !== f.fuelEndL) ||
    (f.mhStart != null && f.mhEnd != null && f.mhStart !== f.mhEnd)
  );
}

/**
 * Czy zapis jest PUSTĄ operacją (issue #75 pkt 2): zdany, bez treści i z KOMPLETEM
 * odczytów, które tę pustość potwierdzają.
 *
 * Komplet jest warunkiem, nie ozdobą: bez którejś z czterech liczb „nic się nie
 * zmieniło" jest niesprawdzalne i wpis zostaje widoczny (patrz docblock modułu).
 * Zapis otwarty pusty nie jest nigdy - jego treść dopiero się dzieje.
 */
export function isEmptyOperation(f: OperationSubstanceFacts): boolean {
  return (
    f.closed &&
    !hasOperationSubstance(f) &&
    f.fuelStartL != null &&
    f.fuelEndL != null &&
    f.mhStart != null &&
    f.mhEnd != null
  );
}

/**
 * KOTWICA operacji w dobie pilota - chwila, po której operacja dostaje numer
 * (`operationIndexes`), wiersz na ekranie 01 (`projectPilotDay`) i dobę w sygnaturze.
 * `null` = zapis nie jest (jeszcze) operacją i numeru nie dostaje.
 *
 * Reguła (issue #75 pkt 3 rozszerza issue #68):
 *  • **bieg silnika** kotwiczy jak dotąd - uruchomieniem, od pierwszej sekundy
 *    (operacja trwająca stoi na 01 z numerem);
 *  • **zapis bez biegu** staje się operacją dopiero przy ZDANIU i tylko z treścią -
 *    kotwicą jest wtedy przejęcie (`claimedAt`), czyli ta sama awaryjna kotwica,
 *    którą historia (12) liczy dobę od zawsze. Dopiero przy zdaniu, bo treść bez biegu
 *    orzeka się z odczytów końcowych - a numer nadany wcześniej i odebrany przy zdaniu
 *    przenumerowałby sąsiadów w trakcie dnia;
 *  • **zapis bez biegu i bez treści** kotwicy nie ma: pusty (ukryty) albo niekompletny
 *    (widoczny w historii bez numeru, jak przed issue #75).
 */
export function operationAnchor(state: SessionState): EpochMillis | null {
  const engineStart = state.legs[0]?.startedAt;
  if (engineStart != null) return engineStart;
  if (state.closed && hasOperationSubstance(substanceFacts(state))) return state.claimedAt;
  return null;
}
