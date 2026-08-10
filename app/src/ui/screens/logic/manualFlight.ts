/**
 * UZ Aero — logika ekranu 15 „Lot ręczny" (`design/15-reczny-lot.html`, story pkt 7).
 *
 * Wpis CAŁEGO lotu z listy dziennej PO FAKCIE: telefon został w kurtce, bateria padła,
 * lot spisany na papierze. Zapis tworzy KOMPLETNĄ sesję (model 2026-08-10: przejęcie →
 * jeden bieg silnika → zdanie), więc obowiązują te same wymagania co przy zdaniu na 09b:
 * odczyty po locie są WYMAGANE, bo stają się przekazaniem i ogniwem łańcucha MH.
 *
 * JEDEN lot na wpis (decyzja z mockupu): dzień z touch and go wpisuje się jako jedna
 * sesja, a dodatkowe starty/lądowania dopisuje korektą po zapisaniu — formularz na
 * N lotów byłby dłuższy od papieru, który zastępuje.
 */

import type { EpochMillis, FuelMhReading, ReferenceAircraft } from '../../../domain';

/** Cztery czasy sesji — wszystkie WYMAGANE (sesja bez biegu i lotu to wariant 09C). */
export interface ManualFlightTimes {
  engineStart: EpochMillis;
  takeoff: EpochMillis;
  landing: EpochMillis;
  engineStop: EpochMillis;
}

/**
 * Czasy z arkusza wpisu ręcznego (`ManualEntrySheet` oddaje pola OPCJONALNE, bo na 08
 * służy też częściowym wpisom) → komplet ekranu 15 albo `null`.
 */
export function timesFromEntry(entry: {
  offBlock?: EpochMillis | null;
  takeoff?: EpochMillis | null;
  landing?: EpochMillis | null;
  onBlock?: EpochMillis | null;
}): ManualFlightTimes | null {
  if (
    entry.offBlock == null ||
    entry.takeoff == null ||
    entry.landing == null ||
    entry.onBlock == null
  ) {
    return null;
  }
  return {
    engineStart: entry.offBlock,
    takeoff: entry.takeoff,
    landing: entry.landing,
    engineStop: entry.onBlock,
  };
}

/**
 * Powód, dla którego „ZAPISZ LOT" nie zadziała; `null` = można zapisywać.
 *
 * Kolejność czasów pilnowana także tutaj (nie tylko w domenie), bo blokada z powodem
 * przy przycisku jest tańsza od odrzuconego zapisu z wyjątkiem — ta sama zasada co
 * `releaseBlocker` na 09b.
 */
export function manualFlightBlocker(
  aircraftId: string | null,
  times: ManualFlightTimes | null,
  reading: { fuelL: number | null; mh: number | null },
): string | null {
  if (aircraftId == null) return 'Wybierz samolot, którego dotyczy lot.';
  if (times == null) return 'Uzupełnij komplet czasów: uruchomienie, start, lądowanie, zatrzymanie.';
  const ordered =
    times.engineStart <= times.takeoff &&
    times.takeoff < times.landing &&
    times.landing <= times.engineStop;
  if (!ordered) return 'Czasy są w złej kolejności — sprawdź uruchomienie → start → lądowanie → zatrzymanie.';
  if (reading.fuelL == null || reading.mh == null) {
    return 'Wpisz odczyt paliwa i motogodzin po locie — to przekazanie dla następnego pilota.';
  }
  return null;
}

/**
 * Odczyt POCZĄTKOWY sesji (payload `preflight_confirm` go wymaga — początek łańcucha MH).
 *
 * Najlepsza wiedza to ostatnie PRZEKAZANIE z cache referencyjnego. Gdy cache go nie zna,
 * bierzemy odczyt końcowy wpisu: łańcuch zostaje ciągły („nie wiem, ile było — wiem, ile
 * jest"), a zero zużycia w tej sesji jest uczciwszą niewiedzą niż liczba z sufitu.
 * Serwer i tak porówna łańcuch z sąsiednimi sesjami (§4.5).
 */
export function initialReadingFor(
  aircraft: ReferenceAircraft | null,
  finalReading: FuelMhReading,
): FuelMhReading {
  const handover = aircraft?.handover?.reading;
  return handover != null ? { fuelL: handover.fuelL, mh: handover.mh } : finalReading;
}
