/**
 * Ninerdeck - DOPISANIE FAKTU PO CZASIE (`checkInsert`; panel 3.2.0, `docs/panel-3.2.md` §5.4).
 *
 * ══ CZYM TO SIĘ RÓŻNI OD `checkAppend` ══
 * `checkAppend` ocenia kandydata na tle STANU KOŃCOWEGO strumienia - odpowiada na
 * pytanie „czy TERAZ wolno dopisać to zdarzenie" i jest właściwe dla kokpitu, gdzie
 * zdarzenie zapisuje się w chwili, w której zachodzi. Dla FAKTU Z PRZESZŁOŚCI to jest
 * złe pytanie: brakujące lądowanie z 10:33 dopisywane do operacji zdanej o 12:15
 * odbijałoby się o `DAY_CLOSED` (samolot już zdany) i o stan silnika (już nie pracuje),
 * choć w chwili, o której mówi, i samolot był w powietrzu, i silnik pracował.
 *
 * Dlatego kandydata ocenia się na STANIE Z CHWILI, W KTÓREJ ZASZEDŁ (`stateAsOf`):
 * strumień efektywny (po korektach) przycięty do zdarzeń nie późniejszych niż czas
 * kandydata, zrzutowany tą samą projekcją. Reguły per typ działają wtedy same i bez
 * wyjątków: lądowanie bez otwartego lotu odbija `NOT_IN_FLIGHT`, tankowanie w środku
 * biegu `REFUEL_ENGINE_RUNNING`, a fakt z czasem PO zdaniu samolotu - `DAY_CLOSED`,
 * bo należy już do następnej operacji. Twarde reguły zostają IDENTYCZNE dla pilota
 * i administratora (`writeAuthority.test.ts`), bo to jest to samo `checkAppend`.
 *
 * ══ OKNO KOREKTY WRACA OSOBNO ══
 * Na stanie z chwili faktu samolot nie jest jeszcze zdany, więc bramka okna 24 h -
 * dla pilota - nie miałaby jak zadziałać. Dokładamy ją na stanie KOŃCOWYM
 * (`correctionWindowVerdict`), z chwilą WPISANIA jako „teraz": pilot dopisuje
 * w tym samym oknie, w którym poprawia, administrator dostaje te same ostrzeżenia
 * o kolizji z pracą pilota, co przy korekcie. `now` jest ARGUMENTEM, nie polem
 * kandydata: zapis z panelu ma oba zegary równe chwili faktu (nie ma zegara
 * telefonu, który mógłby się rozjechać), więc chwili wpisania nie da się z niego
 * odczytać.
 *
 * ══ CZEGO TO NIE SPRAWDZA ══
 * Skutku dla CAŁEGO strumienia - że dopisany fakt nie zostawia lotu bez lądowania
 * albo nie wypada poza bieg silnika. To jest pytanie `sessionInconsistencies`
 * (`consistency.ts`) zadane strumieniowi PO dopisaniu; odpowiedź jest miękka, bo
 * opisuje rejestr, a nie kandydata.
 */

import type { Event } from '../events';
import { applyCorrections, eventTime, projectSession, type SessionState } from '../projections';
import type { EpochMillis } from '../time';
import type { WriteAuthority } from './authority';
import {
  UNKNOWN_LIMITS,
  checkAppend,
  correctionWindowVerdict,
  type AircraftLimits,
} from './sessionRules';
import type { RuleViolation } from './violations';

/**
 * Stan sesji W CHWILI `at`: strumień efektywny (korekty nałożone) przycięty do zdarzeń
 * nie późniejszych niż `at`, zrzutowany tą samą projekcją, co stan końcowy.
 *
 * Korekty nakłada się PRZED przycięciem, nie po: unieważniony start sprzed `at` ma
 * dla kandydata nie istnieć, a przesunięty w czasie ma stać tam, gdzie stoi dziś.
 * Przycięcie surowego strumienia zgubiłoby korektę zapisaną później niż `at`, choć
 * dotyczy ona zdarzenia sprzed tej chwili.
 */
export function stateAsOf(events: readonly Event[], at: EpochMillis): SessionState {
  return projectSession(applyCorrections(events).filter((e) => eventTime(e) <= at));
}

/**
 * Czy wolno dopisać `candidate` jako fakt, który zaszedł w chwili `eventTime(candidate)`.
 *
 * @param events    surowy strumień sesji (jak dla `projectSession`),
 * @param candidate zdarzenie ostemplowane; jego czas to chwila FAKTU,
 * @param now       chwila WPISANIA - „teraz" dla okna korekty,
 * @param limits    konfiguracja samolotu, jak w `checkAppend`,
 * @param authority kto dopisuje; pominięcie = `'pilot'` (komplet reguł, jak wszędzie).
 * @returns naruszenia jak `checkAppend`: twarde = odmowa, miękkie = treść do pokazania.
 */
export function checkInsert(
  events: readonly Event[],
  candidate: Event,
  now: EpochMillis,
  limits: AircraftLimits = UNKNOWN_LIMITS,
  authority: WriteAuthority = 'pilot',
): RuleViolation[] {
  const verdict = checkAppend(stateAsOf(events, eventTime(candidate)), candidate, limits, authority).map(
    (v) => inPastTense(v, candidate),
  );
  // Twarda odmowa z chwili faktu wystarcza - okno i kolizje opisywałyby zapis,
  // którego i tak nie będzie (ta sama zasada, co koperta w `checkAppend`).
  if (verdict.some((v) => v.severity === 'error')) return verdict;
  return [...verdict, ...correctionWindowVerdict(projectSession([...events]), now, authority)];
}

/**
 * ODMOWA NAZWANA JĘZYKIEM FAKTU Z PRZESZŁOŚCI (issue #234).
 *
 * Komunikaty `checkAppend` są pisane dla kokpitu, w którym zdarzenie zachodzi TERAZ:
 * „Tankowanie przy pracującym silniku - wyłącz silnik", „Lądowanie bez startu - najpierw
 * zapisz start". Przy dopisywaniu faktu sprzed dwóch godzin ta sama
 * reguła odbija się o STAN Z TAMTEJ CHWILI, a rada „wyłącz silnik" nie ma sensu -
 * silnik dawno stoi, to godzina jest zła. Kod reguły zostaje ten sam (rejestr, testy
 * i panel pytają o kod), zmienia się wyłącznie zdanie, które czyta człowiek - i zmienia
 * się tu, w jednym miejscu, bo tym samym `checkInsert` dopisuje telefon (10H) i panel.
 *
 * Kody spoza tej listy zostają przy swoich zdaniach: mówią o WARTOŚCI (paliwo, skład
 * zrzutu), a ta nie zależy od tego, kiedy ją wpisano.
 */
function inPastTense(v: RuleViolation, candidate: Event): RuleViolation {
  const message = PAST_TENSE[v.code]?.(candidate.type);
  return message == null ? v : { ...v, message };
}

const PAST_TENSE: Partial<Record<RuleViolation['code'], (type: Event['type']) => string>> = {
  SESSION_NOT_CLAIMED: () =>
    'O tej godzinie operacja jeszcze się nie zaczęła - wpis musi przypadać po rozpoczęciu lotu.',
  PREFLIGHT_REQUIRED: () =>
    'O tej godzinie operacja jeszcze się nie zaczęła - wpis musi przypadać po rozpoczęciu lotu.',
  DAY_CLOSED: () =>
    'O tej godzinie samolot był już zdany - fakt po zdaniu należy do następnej operacji.',
  ENGINE_NOT_RUNNING: () =>
    'O tej godzinie silnik nie pracował - wpis musi mieścić się w biegu silnika.',
  ALREADY_IN_FLIGHT: (type) =>
    type === 'takeoff'
      ? 'O tej godzinie trwał już lot - dopisz najpierw jego lądowanie albo wybierz inną godzinę.'
      : 'O tej godzinie samolot był w powietrzu - kołowanie wypada przed startem albo po lądowaniu.',
  ALREADY_TAXIING: () => 'O tej godzinie kołowanie już trwało - drugi wpis byłby powtórzeniem.',
  NOT_IN_FLIGHT: () => 'O tej godzinie nie trwał żaden lot - dopisz najpierw start.',
  REFUEL_ENGINE_RUNNING: () =>
    'O tej godzinie pracował silnik - tankowanie wpisz przed uruchomieniem albo po wyłączeniu.',
  OIL_ADD_ENGINE_RUNNING: () =>
    'O tej godzinie pracował silnik - dolewkę wpisz przed uruchomieniem albo po wyłączeniu.',
};
