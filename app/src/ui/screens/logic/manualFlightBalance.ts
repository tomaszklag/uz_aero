/**
 * UZ Aero - NORMA ZUŻYCIA DLA WPISU RĘCZNEGO (issue #62, piąta tura z urządzenia).
 *
 * „W oparciu o te dane oraz dane z czasu lotu powinniśmy przeliczyć normę i sprawdzić,
 * czy się zgadza" - do tej tury krok 4 pokazywał samo zużycie („76 L") i nie mówił
 * ani słowa o tym, czy to dużo. Pilot dowiadywał się tego dopiero na ekranie rozliczenia,
 * po zapisaniu - czyli wtedy, gdy poprawka kosztuje już wejście w tryb edycji.
 *
 * ══ TA SAMA ARYTMETYKA, CO NA EKRANIE SESJI ══
 * Oczekiwanie i pasmo liczy DOMENA (`consumption/expectation.ts`) z normy, którą serwer
 * policzył z historii tej maszyny; ten moduł zamienia wynik na napisy. Gdyby liczył sam,
 * wpis ręczny i rozliczenie tej samej sesji odpowiadałyby na to samo pytanie dwiema
 * arytmetykami - a to jest dokładnie ta wada, którą issue #38 usuwało z ekranu 10.
 *
 * ══ DZIAŁA OFFLINE ══
 * Norma mieszka w cache referencyjnym (`ReferenceAircraft.consumption`), więc werdykt
 * powstaje bez sieci. Jest to jednak DANA Z SERWERA, więc obowiązuje ją triada świeżości
 * (§4.8) - wiek cache podaje wołający, tak samo jak przy ostrzeżeniach łańcucha.
 *
 * ══ `null` ZNACZY „NIE MA CZEGO POKAZAĆ" ══
 * I ekran wtedy MILCZY, zamiast pokazywać zero albo kreskę bez wyjaśnienia. Brak normy
 * (maszyna nie uzbierała jeszcze historii) nie jest brakiem danych pilota i nie ma prawa
 * wyglądać jak jego błąd.
 */

import type { ConsumptionNorm, MhFormat, SessionPhaseTimes } from '../../../domain';
import type { ManualFlightDraft } from './manualFlight';
import { fuelBalanceOf, mhBalanceOf, type BalanceView } from './sessionBalance';
import { fuelUsedL, sortedFlights } from './manualFlight';

/*
 * `ManualVerdict`, `ManualBalance`, `manualFuelBalance`, `manualMhBalance`,
 * `VERDICT_LABEL`, `expectedText` i `verdictOf` USUNIĘTE (uwaga z urządzenia,
 * 2026-08-29). Były DRUGIM rachunkiem tej samej rzeczy: liczyły werdykt ze szkicu,
 * podczas gdy ekran rozliczenia liczył go z projekcji przez `sessionBalance`. Dwie
 * arytmetyki jednej wielkości rozjeżdżają się przy pierwszej poprawce jednej z nich -
 * a przy okazji ta krótsza nie umiała pokazać, JAK policzyła (arkusz szczegółów pod
 * plakietką), o co prosiło zgłoszenie. Zostaje `manualPhaseTimes` (czasy faz ze
 * szkicu) i dwa adaptery niżej, które wołają rdzeń `sessionBalance`.
 */
export function manualPhaseTimes(draft: ManualFlightDraft): SessionPhaseTimes | null {
  if (draft.engineStart == null || draft.engineStop == null) return null;
  const blockMs = draft.engineStop - draft.engineStart;
  if (blockMs <= 0) return null;

  const flightMs = sortedFlights(draft).reduce(
    (sum, f) => sum + Math.max(0, f.landing - f.takeoff),
    0,
  );
  return { blockMs, flightMs };
}

/**
 * ══ TEN SAM RACHUNEK, CO PO ZAPISANIU (uwaga z urządzenia, 2026-08-29) ══
 * „Jak mam wpisanie paliwa, to może odpalisz ten moduł, co przy automatycznym locie?
 * Tam jak przeglądam później ten lot, to mam widoczny badge […]. Jak go kliknę, to
 * otwierają się szczegóły, jak to zostało policzone."
 *
 * Można - bo zależność `sessionBalance` od projekcji była pozorna: rachunek czyta
 * z niej DWIE liczby (czas blokowy i czas w powietrzu) plus odczyty, a jedno i drugie
 * wpis ręczny ma u siebie w szkicu. Krok 4 dostaje przez to nie tylko werdykt, ale
 * i rozpisane działanie pod plakietką - dokładnie to samo, które pilot zobaczy na
 * ekranie 10, gdy wpis już trafi do rejestru.
 *
 * `null` = nie ma czego liczyć (brak biegu silnika albo kompletu odczytów) i wtedy
 * ekran nie rysuje karty w ogóle, zamiast pokazywać kreski.
 */
export function manualFuelBalanceView(
  draft: ManualFlightDraft,
  norm: ConsumptionNorm | null,
  /** Spalanie z dokumentacji jednostki (issue #66) - wchodzi przy braku modelu. */
  nominalLPerH: number | null,
): BalanceView | null {
  const times = manualPhaseTimes(draft);
  if (times == null) return null;

  /* Dolewka jest we wpisie ręcznym JEDNĄ liczbą bez godziny (issue #62, siódma tura),
     więc „liczba tankowań" jest zerojedynkowa - i tak ma być: wiersz mówi „Dolane",
     a nie „Dolane · 2 tankowania", bo drugiego tankowania nie da się tu wyrazić. */
  return fuelBalanceOf(
    times,
    {
      startL: draft.fuel.foundL,
      addedL: draft.fuel.addedL,
      endL: draft.fuel.afterL,
      consumedL: fuelUsedL(draft),
    },
    norm,
    draft.fuel.addedL > 0 ? 1 : 0,
    nominalLPerH,
  );
}

/** Przyrost licznika - ten sam rachunek i ten sam arkusz szczegółów, co przy paliwie. */
export function manualMhBalanceView(
  draft: ManualFlightDraft,
  norm: ConsumptionNorm | null,
  format: MhFormat,
): BalanceView | null {
  const times = manualPhaseTimes(draft);
  if (times == null) return null;

  const deltaH =
    draft.mhBefore != null && draft.mhAfter != null ? draft.mhAfter - draft.mhBefore : null;
  return mhBalanceOf(times, { start: draft.mhBefore, end: draft.mhAfter, deltaH }, norm, format);
}
