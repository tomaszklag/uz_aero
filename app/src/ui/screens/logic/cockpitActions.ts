/**
 * UZ Aero — pasek akcji kokpitu w locie (mockupy 05h/05a/05/05b): CO jest następne.
 *
 * Przycisk główny podpowiada NASTĘPNE zdarzenie sekwencji lotu (decyzja 2026-08-11):
 *
 *     idle → TAXI → kołowanie → TAKE OFF → lot → LANDING → (ziemia) → TAXI → …
 *
 * Do 2026-08-11 zaraz po START ENGINE pasek pokazywał „Take off" — zapraszał do zapisu
 * zdarzenia, które fizycznie nie może być następne, bo samolot jeszcze stoi. Pierwszym
 * ogniwem jest kołowanie; dopiero ono odblokowuje start.
 *
 * O tym, że kołowanie trwa, mówi PROJEKCJA (`taxiing`), nie faza z GPS: przycisk
 * ZAPISUJE zdarzenia, więc musi patrzeć na to, co jest w rejestrze — fazę z GPS
 * autodetekcja i tak zamienia na zdarzenie `taxi` w chwili wykrycia ruchu, więc oba
 * źródła schodzą się same. Tap w „Taxi" zapisuje kołowanie OD RAZU, bez arkusza 05f
 * i bez okna COFNIJ — taxi nie wyznacza żadnego czasu, pomyłka kosztuje jeden wiersz
 * w logu (ta sama zasada, którą autodetekcja stosuje od 2026-08-04).
 *
 * ZRZUT (ta sama decyzja):
 *  • istnieje TYLKO w dniu skokowym (issue #19 — brak akcji, nie blokada) i TYLKO
 *    w powietrzu: na ziemi jego slot zajmuje ZAŁADUNEK (patrz niżej),
 *  • w powietrzu jest AKTYWNY wyłącznie w locie poziomym: wyniesienie dzieje się
 *    w Cruise, więc w Climb i Descent stoi przygaszony z powodem. Stoi, a nie znika,
 *    bo w locie pasek musi trzymać stałą geometrię — pilot sięga nie patrząc,
 *  • bramka fazy działa TYLKO na pozytywnej wiedzy (poprawka 2026-08-11 z urządzenia):
 *    przygasza wyłącznie faza Climb/Descent, którą detektor AKTYWNIE widzi. Faza
 *    naziemna (idle/taxi) przy locie ze zdarzeń znaczy, że detektor w ten lot nie
 *    wierzy — start był ręczny, bo autodetekcja go nie złapała — i taki brak wiedzy
 *    nie ma prawa zamykać zrzutu na cały lot. Z tego samego powodu bez GPS (05g)
 *    przycisk zostaje aktywny: ręczny zapis to wtedy jedyna droga.
 *
 * ZAŁADUNEK (issue #21 pkt 7, 2026-08-11): na ziemi dnia skokowego — po wykołowaniu
 * z pasa między lotami albo przed pierwszym startem serii — slot obok akcji głównej
 * zajmuje „Załadunek": znacznik wejścia skoczków na pokład z opcjonalnym składem,
 * który staje się prefill-em arkusza zrzutu. W powietrzu przycisku NIE MA (jest zrzut):
 * to ta sama zasada „brak akcji, nie blokada" — w locie nikt nie wsiada. Dzięki parze
 * zrzut/załadunek pasek dnia skokowego trzyma stałą geometrię w OBU stanach.
 */

import type { FlightPhase } from '../../../domain';

/** Następne zdarzenie sekwencji — to, co zapisuje przycisk główny. */
export type CockpitPrimary = 'taxi' | 'takeoff' | 'landing';

export interface CockpitActionsView {
  primary: CockpitPrimary;
  primaryLabel: string;
  /** Podzbiór `IconName` — moduł jest czysty, więc nie importuje rejestru ikon. */
  primaryIcon: 'phase-taxi' | 'takeoff' | 'landing';
  /** AMBER, gdy GPS zamilkł: ręczny zapis jest wtedy JEDYNĄ drogą (mockup 05g). */
  primaryTone: 'amber' | null;
  /** `false` = przycisku zrzutu NIE MA (brak akcji, nie blokada — issue #19). */
  showDrop: boolean;
  /** Powód przygaszenia widocznego przycisku zrzutu; `null` = aktywny. */
  dropDisabledReason: string | null;
  /**
   * `true` = na ziemi dnia skokowego slot obok akcji głównej zajmuje ZAŁADUNEK
   * (issue #21 pkt 7). Wyklucza się ze `showDrop` — to dwa końce tej samej historii
   * w dwóch stanach samolotu.
   */
  showBoarding: boolean;
}

const PRIMARY_LABEL: Record<CockpitPrimary, string> = {
  taxi: 'Taxi',
  takeoff: 'Take off',
  landing: 'Landing',
};

const PRIMARY_ICON: Record<CockpitPrimary, CockpitActionsView['primaryIcon']> = {
  taxi: 'phase-taxi',
  takeoff: 'takeoff',
  landing: 'landing',
};

export function buildCockpitActions(input: {
  inFlight: boolean;
  /** Z projekcji (`taxiing`), nie z fazy GPS — patrz nagłówek. */
  taxiing: boolean;
  jumpDay: boolean;
  gpsLost: boolean;
  phase: FlightPhase;
}): CockpitActionsView {
  const primary: CockpitPrimary = input.inFlight ? 'landing' : input.taxiing ? 'takeoff' : 'taxi';

  const showDrop = input.jumpDay && input.inFlight;
  // Załadunek zawsze AKTYWNY, gdy jest: na ziemi nie ma fazy, która by go wykluczała,
  // a pomyłka kosztuje jeden wiersz w logu (ta sama zasada co przy taxi).
  const showBoarding = input.jumpDay && !input.inFlight;

  return {
    primary,
    // „· ręcznie" przy każdym stanie sekwencji: bez fixa autodetekcja nie zapisze
    // ani kołowania, ani startu, ani lądowania — przycisk mówi to, zanim pilot
    // doczyta baner 05g.
    primaryLabel: input.gpsLost ? `${PRIMARY_LABEL[primary]} · ręcznie` : PRIMARY_LABEL[primary],
    primaryIcon: PRIMARY_ICON[primary],
    primaryTone: input.gpsLost ? 'amber' : null,
    showDrop,
    // Pozytywna wiedza, nie negacja Cruise: `phase !== 'cruise'` obejmowałoby też
    // idle/taxi, czyli lot, którego detektor nie widzi (start ręczny) — patrz nagłówek.
    dropDisabledReason:
      showDrop && !input.gpsLost && (input.phase === 'climb' || input.phase === 'descent')
        ? 'Zrzut zapiszesz w locie poziomym'
        : null,
    showBoarding,
  };
}
